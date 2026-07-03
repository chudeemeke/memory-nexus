/**
 * Local backup and restore command handlers.
 *
 * This is a file-level backup for v5 data surfaces. The legacy `export` and
 * `import` commands remain JSON interchange tools; they are not complete v5
 * database backups because newer projection tables and event logs are outside
 * their original schema.
 */

import { Database } from "bun:sqlite";
import { Command } from "commander";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CommandResult } from "../command-result.js";
import { closeDatabase, initializeDatabase } from "../../../infrastructure/database/index.js";
import { getBackupDir, getConfigPath, getDbPath, getEventsDir } from "../../../infrastructure/paths.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_EXIT_OK = 0;
const BACKUP_EXIT_ERROR = 1;
const BACKUP_EXIT_NOT_READY = 2;
const WINDOWS_FILE_MAX_RETRIES = 50;
const WINDOWS_FILE_RETRY_DELAY_MS = 100;

export interface LocalBackupCommandOptions {
  dbPathOverride?: string;
  configPathOverride?: string;
  eventsDirOverride?: string;
  backupDirOverride?: string;
  now?: () => Date;
}

export interface LocalBackupCliOptions {
  json?: boolean;
  quiet?: boolean;
  confirm?: boolean;
  dryRun?: boolean;
}

interface LocalBackupManifest {
  schemaVersion: 1;
  kind: "memory.localBackup";
  backupId: string;
  createdAt: string;
  includesDatabase: boolean;
  includesConfig: boolean;
  includesEvents: boolean;
  eventFileCount: number;
  excludedPaths: string[];
}

interface LocalBackupSnapshot {
  backupId: string;
  backupPath: string;
  manifestPath: string;
  createdAt: string;
  includesDatabase: boolean;
  includesConfig: boolean;
  includesEvents: boolean;
  eventFileCount: number;
  excludedPaths: string[];
}

interface LocalBackupVerification {
  backupPath: string;
  manifest: LocalBackupManifest;
  databaseIntegrity: string | "not_included";
  errors: string[];
  warnings: string[];
}

export function createBackupCommand(opts: LocalBackupCommandOptions = {}): Command {
  const backup = new Command("backup")
    .description("Create and verify local memory backups");

  backup.command("create [outputDir]")
    .description("Create a local backup of the database, config, and event logs")
    .option("--json", "Output stable JSON")
    .option("-q, --quiet", "Print only the backup path")
    .action(async (outputDir: string | undefined, commandOptions: LocalBackupCliOptions) => {
      const result = await executeBackupCreateCommand(outputDir, opts, commandOptions);
      process.exitCode = result.exitCode;
    });

  backup.command("verify <backupDir>")
    .description("Verify a local memory backup manifest and database integrity")
    .option("--json", "Output stable JSON")
    .action(async (backupDir: string, commandOptions: LocalBackupCliOptions) => {
      const result = await executeBackupVerifyCommand(backupDir, opts, commandOptions);
      process.exitCode = result.exitCode;
    });

  return backup;
}

export function createRestoreCommand(opts: LocalBackupCommandOptions = {}): Command {
  return new Command("restore")
    .description("Restore local memory data from a backup")
    .argument("<backupDir>", "Backup directory or backup id")
    .option("--dry-run", "Verify restore readiness without mutating local data")
    .option("--confirm", "Confirm restore mutation")
    .option("--json", "Output stable JSON")
    .action(async (backupDir: string, commandOptions: LocalBackupCliOptions) => {
      const result = await executeRestoreCommand(backupDir, opts, commandOptions);
      process.exitCode = result.exitCode;
    });
}

export async function executeBackupCreateCommand(
  outputDir: string | undefined,
  opts: LocalBackupCommandOptions = {},
  commandOptions: LocalBackupCliOptions = {},
): Promise<CommandResult> {
  try {
    const snapshot = createLocalBackupSnapshot(outputDir, opts);
    if (commandOptions.json) {
      writeBackupJson("backup.create", "ok", BACKUP_EXIT_OK, snapshot);
    } else if (commandOptions.quiet) {
      console.log(snapshot.backupPath);
    } else {
      console.log("Local memory backup created.");
      console.log(`Backup path: ${snapshot.backupPath}`);
      console.log(`Database:    ${snapshot.includesDatabase ? "included" : "not found"}`);
      console.log(`Config:      ${snapshot.includesConfig ? "included" : "not found"}`);
      console.log(`Event files: ${snapshot.eventFileCount}`);
    }
    return { exitCode: BACKUP_EXIT_OK };
  } catch (error) {
    const message = `Error creating local backup: ${unknownErrorMessage(error)}`;
    if (commandOptions.json) {
      writeBackupJson("backup.create", "error", BACKUP_EXIT_ERROR, {}, [message]);
    } else {
      console.error(message);
    }
    return { exitCode: BACKUP_EXIT_ERROR };
  }
}

export async function executeBackupVerifyCommand(
  backupDir: string,
  opts: LocalBackupCommandOptions = {},
  commandOptions: LocalBackupCliOptions = {},
): Promise<CommandResult> {
  try {
    const backupPath = resolveBackupPath(backupDir, opts);
    const verification = verifyLocalBackupSnapshot(backupPath);
    const status = verification.errors.length === 0 ? "ok" : "error";
    const exitCode = verification.errors.length === 0 ? BACKUP_EXIT_OK : BACKUP_EXIT_ERROR;
    if (commandOptions.json) {
      writeBackupJson("backup.verify", status, exitCode, verification, verification.errors, verification.warnings);
    } else if (verification.errors.length === 0) {
      console.log("Local memory backup verified.");
      console.log(`Backup path: ${backupPath}`);
      console.log(`Database integrity: ${verification.databaseIntegrity}`);
      if (verification.warnings.length > 0) {
        console.log(`Warnings: ${verification.warnings.join("; ")}`);
      }
    } else {
      console.error(`Backup verification failed: ${verification.errors.join("; ")}`);
    }
    return { exitCode };
  } catch (error) {
    const message = `Error verifying local backup: ${unknownErrorMessage(error)}`;
    if (commandOptions.json) {
      writeBackupJson("backup.verify", "error", BACKUP_EXIT_ERROR, {}, [message]);
    } else {
      console.error(message);
    }
    return { exitCode: BACKUP_EXIT_ERROR };
  }
}

export async function executeRestoreCommand(
  backupDir: string,
  opts: LocalBackupCommandOptions = {},
  commandOptions: LocalBackupCliOptions = {},
): Promise<CommandResult> {
  try {
    const backupPath = resolveBackupPath(backupDir, opts);
    const verification = verifyLocalBackupSnapshot(backupPath);
    if (verification.errors.length > 0) {
      if (commandOptions.json) {
        writeBackupJson("restore", "error", BACKUP_EXIT_ERROR, verification, verification.errors, verification.warnings);
      } else {
        console.error(`Backup verification failed: ${verification.errors.join("; ")}`);
      }
      return { exitCode: BACKUP_EXIT_ERROR };
    }

    if (commandOptions.dryRun) {
      if (commandOptions.json) {
        writeBackupJson("restore", "ok", BACKUP_EXIT_OK, {
          dryRun: true,
          backupPath,
          wouldRestoreDatabase: verification.manifest.includesDatabase,
          wouldRestoreConfig: verification.manifest.includesConfig,
          wouldRestoreEvents: verification.manifest.includesEvents,
          eventFileCount: verification.manifest.eventFileCount,
        }, [], verification.warnings);
      } else {
        console.log("Restore dry-run passed.");
        console.log(`Backup path: ${backupPath}`);
        console.log(`Would restore database: ${verification.manifest.includesDatabase ? "yes" : "no"}`);
        console.log(`Would restore config:   ${verification.manifest.includesConfig ? "yes" : "no"}`);
        console.log(`Would restore events:   ${verification.manifest.includesEvents ? "yes" : "no"}`);
      }
      return { exitCode: BACKUP_EXIT_OK };
    }

    if (commandOptions.confirm !== true) {
      const message = "restore requires --confirm before mutating local memory data";
      if (commandOptions.json) {
        writeBackupJson("restore", "not_ready", BACKUP_EXIT_NOT_READY, { backupPath }, [message], verification.warnings);
      } else {
        console.error(`Error: ${message}`);
      }
      return { exitCode: BACKUP_EXIT_NOT_READY };
    }

    const rollback = createLocalBackupSnapshot(undefined, opts);
    applyLocalBackupSnapshot(backupPath, verification.manifest, opts);

    const data = {
      backupPath,
      rollbackBackupPath: rollback.backupPath,
      restoredDatabase: verification.manifest.includesDatabase,
      restoredConfig: verification.manifest.includesConfig,
      restoredEvents: verification.manifest.includesEvents,
      eventFileCount: verification.manifest.eventFileCount,
    };
    if (commandOptions.json) {
      writeBackupJson("restore", "ok", BACKUP_EXIT_OK, data, [], verification.warnings);
    } else {
      console.log("Local memory restore completed.");
      console.log(`Source backup:   ${backupPath}`);
      console.log(`Rollback backup: ${rollback.backupPath}`);
    }
    return { exitCode: BACKUP_EXIT_OK };
  } catch (error) {
    const message = `Error restoring local backup: ${unknownErrorMessage(error)}`;
    if (commandOptions.json) {
      writeBackupJson("restore", "error", BACKUP_EXIT_ERROR, {}, [message]);
    } else {
      console.error(message);
    }
    return { exitCode: BACKUP_EXIT_ERROR };
  }
}

function createLocalBackupSnapshot(
  outputDir: string | undefined,
  opts: LocalBackupCommandOptions,
): LocalBackupSnapshot {
  const now = opts.now?.() ?? new Date();
  const createdAt = now.toISOString();
  const backupId = `local-${formatBackupTimestamp(now)}`;
  const root = outputDir ?? opts.backupDirOverride ?? join(getBackupDir(), "local");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const backupPath = uniqueBackupPath(root, backupId);
  mkdirSync(backupPath, { recursive: true, mode: 0o700 });

  const dbPath = opts.dbPathOverride ?? getDbPath();
  const configPath = opts.configPathOverride ?? getConfigPath();
  const eventsDir = opts.eventsDirOverride ?? getEventsDir();
  const backupDbPath = join(backupPath, "memory.db");
  const backupConfigPath = join(backupPath, "config.json");
  const backupEventsDir = join(backupPath, "events");

  const includesDatabase = existsSync(dbPath);
  const includesConfig = existsSync(configPath);
  const includesEvents = existsSync(eventsDir) && statSync(eventsDir).isDirectory();
  let eventFileCount = 0;

  if (includesDatabase) {
    checkpointDatabase(dbPath);
    copyFileSync(dbPath, backupDbPath);
  }
  if (includesConfig) {
    copyFileSync(configPath, backupConfigPath);
  }
  if (includesEvents) {
    mkdirSync(backupEventsDir, { recursive: true, mode: 0o700 });
    eventFileCount = copyDirectoryExceptGit(eventsDir, backupEventsDir);
  }

  const manifest: LocalBackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: "memory.localBackup",
    backupId,
    createdAt,
    includesDatabase,
    includesConfig,
    includesEvents,
    eventFileCount,
    excludedPaths: ["events/.git"],
  };
  const manifestPath = join(backupPath, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  return {
    backupId,
    backupPath,
    manifestPath,
    createdAt,
    includesDatabase,
    includesConfig,
    includesEvents,
    eventFileCount,
    excludedPaths: manifest.excludedPaths,
  };
}

function applyLocalBackupSnapshot(
  backupPath: string,
  manifest: LocalBackupManifest,
  opts: LocalBackupCommandOptions,
): void {
  const dbPath = opts.dbPathOverride ?? getDbPath();
  const configPath = opts.configPathOverride ?? getConfigPath();
  const eventsDir = opts.eventsDirOverride ?? getEventsDir();
  const backupDbPath = join(backupPath, "memory.db");
  const backupConfigPath = join(backupPath, "config.json");
  const backupEventsDir = join(backupPath, "events");

  if (manifest.includesDatabase) {
    if (!existsSync(backupDbPath)) {
      throw new Error("Backup manifest declares database but memory.db is missing");
    }
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    removeDatabaseSidecars(dbPath);
    copyFileSync(backupDbPath, dbPath);
  }

  if (manifest.includesConfig) {
    if (!existsSync(backupConfigPath)) {
      throw new Error("Backup manifest declares config but config.json is missing");
    }
    mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
    copyFileSync(backupConfigPath, configPath);
  }

  if (manifest.includesEvents) {
    if (!existsSync(backupEventsDir) || !statSync(backupEventsDir).isDirectory()) {
      throw new Error("Backup manifest declares events but events directory is missing");
    }
    mkdirSync(eventsDir, { recursive: true, mode: 0o700 });
    clearDirectoryExceptGit(eventsDir);
    copyDirectoryExceptGit(backupEventsDir, eventsDir);
  }
}

function verifyLocalBackupSnapshot(backupPath: string): LocalBackupVerification {
  const manifest = readLocalBackupManifest(backupPath);
  const errors: string[] = [];
  const warnings: string[] = [];
  let databaseIntegrity: string | "not_included" = "not_included";

  if (manifest.includesDatabase) {
    const dbPath = join(backupPath, "memory.db");
    if (!existsSync(dbPath)) {
      errors.push("Backup manifest declares database but memory.db is missing");
    } else {
      databaseIntegrity = checkDatabaseIntegrity(dbPath);
      if (databaseIntegrity !== "ok") {
        errors.push(`Backup database integrity check failed: ${databaseIntegrity}`);
      }
    }
  } else {
    warnings.push("Backup does not include a database file");
  }

  if (manifest.includesConfig && !existsSync(join(backupPath, "config.json"))) {
    errors.push("Backup manifest declares config but config.json is missing");
  }
  if (manifest.includesEvents) {
    const eventsDir = join(backupPath, "events");
    if (!existsSync(eventsDir) || !statSync(eventsDir).isDirectory()) {
      errors.push("Backup manifest declares events but events directory is missing");
    }
  }

  return {
    backupPath,
    manifest,
    databaseIntegrity,
    errors,
    warnings,
  };
}

function readLocalBackupManifest(backupPath: string): LocalBackupManifest {
  const manifestPath = join(backupPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Local backup manifest.json is missing");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Partial<LocalBackupManifest>;
  if (
    manifest.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    manifest.kind !== "memory.localBackup" ||
    typeof manifest.backupId !== "string" ||
    typeof manifest.createdAt !== "string" ||
    typeof manifest.includesDatabase !== "boolean" ||
    typeof manifest.includesConfig !== "boolean" ||
    typeof manifest.includesEvents !== "boolean" ||
    typeof manifest.eventFileCount !== "number" ||
    !Array.isArray(manifest.excludedPaths)
  ) {
    throw new Error("Local backup manifest is invalid or unsupported");
  }
  return manifest as LocalBackupManifest;
}

function resolveBackupPath(input: string, opts: LocalBackupCommandOptions): string {
  if (existsSync(input)) {
    return input;
  }
  const root = opts.backupDirOverride ?? join(getBackupDir(), "local");
  return join(root, input);
}

function checkpointDatabase(dbPath: string): void {
  const result = initializeDatabase({ path: dbPath });
  try {
    result.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").run();
  } finally {
    closeDatabase(result.db);
  }
}

function checkDatabaseIntegrity(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();
    return row?.integrity_check ?? "unknown";
  } finally {
    db.close();
  }
}

function copyDirectoryExceptGit(sourceDir: string, targetDir: string): number {
  let copiedFiles = 0;
  for (const entry of readdirSync(sourceDir)) {
    if (entry === ".git") continue;
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true, mode: 0o700 });
      copiedFiles += copyDirectoryExceptGit(sourcePath, targetPath);
    } else if (stat.isFile()) {
      cpSync(sourcePath, targetPath);
      copiedFiles += 1;
    }
  }
  return copiedFiles;
}

function clearDirectoryExceptGit(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git") continue;
    rmSync(join(dir, entry), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function removeDatabaseSidecars(dbPath: string): void {
  for (const suffix of ["-wal", "-shm"]) {
    removeFileWithRetry(dbPath + suffix);
  }
}

function removeFileWithRetry(path: string): void {
  for (let attempt = 0; attempt <= WINDOWS_FILE_MAX_RETRIES; attempt += 1) {
    try {
      rmSync(path, { force: true });
      return;
    } catch (error) {
      if (attempt >= WINDOWS_FILE_MAX_RETRIES || !isRetryableFileRemovalError(error)) {
        throw error;
      }
      sleepSync(WINDOWS_FILE_RETRY_DELAY_MS);
    }
  }
}

function isRetryableFileRemovalError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY";
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function uniqueBackupPath(root: string, backupId: string): string {
  let candidate = join(root, backupId);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = join(root, `${backupId}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function writeBackupJson(
  command: string,
  status: "ok" | "not_ready" | "error",
  exitCode: number,
  data: unknown,
  errors: string[] = [],
  warnings: string[] = [],
): void {
  console.log(JSON.stringify({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    command,
    status,
    exitCode,
    data,
    errors,
    warnings,
  }, null, 2));
}
