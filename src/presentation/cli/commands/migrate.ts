/**
 * Database Migration Command
 *
 * Handles cross-environment migrations, checking structural integrity,
 * checkpointing WAL logs, purging stale sync locks, and natively re-installing hooks.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { getDataDir } from "../../../infrastructure/paths.js";
import { SqliteStatsService } from "../../../infrastructure/database/services/stats-service.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";
import {
  uninstallHooks,
  installHooks,
} from "../../../infrastructure/hooks/index.js";
import {
  green,
  red,
  yellow,
  shouldUseColor,
} from "../formatters/color.js";

/**
 * Options for the migrate command.
 */
export interface MigrateCommandOptions {
  /** Migrate database from Windows host env */
  fromWindows?: boolean;
  /** Check migration readiness without mutating local state */
  dryRun?: boolean;
  /** Output stable JSON */
  json?: boolean;
  /** Confirm migration mutation */
  confirm?: boolean;
}

/**
 * Test overrides and programmatic dependencies.
 */
export interface MigrateCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
  /** Data directory. Defaults to getDataDir(). */
  dataDir?: string;
  /** Custom uninstall hooks handler. */
  uninstallHooks?: () => any;
  /** Custom install hooks handler. */
  installHooks?: () => any;
}

/**
 * Create the migrate command for Commander.js.
 */
export function createMigrateCommand(): Command {
  return new Command("migrate")
    .description("Migrate database across platform environments")
    .option("--from-windows", "Migrate database from native Windows/desktop host")
    .option("--dry-run", "Check migration readiness without mutating local state")
    .option("--json", "Output stable JSON")
    .option("--confirm", "Confirm migration mutation")
    .action(async (options: MigrateCommandOptions) => {
      const result = await executeMigrateCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the migrate command programmatically.
 */
export async function executeMigrateCommand(
  options: MigrateCommandOptions,
  deps: MigrateCommandDeps = {}
): Promise<CommandResult> {
  const useColor = shouldUseColor();
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const dataDir = deps.dataDir ?? getDataDir();
  const embeddingLockPath = join(dataDir, "embedding.lock");

  const uninstallFn = deps.uninstallHooks ?? uninstallHooks;
  const installFn = deps.installHooks ?? installHooks;

  if (!existsSync(dbPath)) {
    const message = `Database not found at ${dbPath}. Run 'memory sync' first.`;
    if (options.json) {
      writeMigrateJson("error", 1, { dbPath, dataDir, fromWindows: Boolean(options.fromWindows) }, [message]);
    } else {
      console.error(red(`Error: ${message}`, useColor));
    }
    return { exitCode: 1 };
  }

  if (options.dryRun) {
    return runMigrationDryRun(dbPath, dataDir, embeddingLockPath, options);
  }

  if (options.confirm !== true) {
    const message = "migrate requires --confirm before checkpointing WAL, deleting stale locks, or reinstalling hooks";
    if (options.json) {
      writeMigrateJson("not_ready", 2, {
        dbPath,
        dataDir,
        fromWindows: Boolean(options.fromWindows),
        requiredCommand: options.fromWindows
          ? "memory migrate --from-windows --dry-run --json && memory migrate --from-windows --confirm"
          : "memory migrate --dry-run --json && memory migrate --confirm",
      }, [message]);
    } else {
      console.error(red(`Error: ${message}`, useColor));
      console.error("Run `memory migrate --dry-run --json` first to inspect the planned changes.");
    }
    return { exitCode: 2 };
  }

  let db;
  let integrityCheck = "unknown";
  try {
    const initResult = initializeDatabase({ path: dbPath });
    db = initResult.db;

    // 1. Structural Integrity Check
    const integrityRow = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string } | null;
    integrityCheck = integrityRow?.integrity_check ?? "unknown";
    if (integrityCheck !== "ok") {
      throw new Error(`Database integrity check failed: ${integrityCheck}`);
    }

    // 2. Commit and Truncate WAL sidecars
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").run();
  } catch (err) {
    const msg = unknownErrorMessage(err);
    if (options.json) {
      writeMigrateJson("error", 2, { dbPath, dataDir, fromWindows: Boolean(options.fromWindows), integrityCheck }, [msg]);
    } else {
      console.error(red(`Error during migration: ${msg}`, useColor));
    }
    if (db) {
      closeDatabase(db);
    }
    return { exitCode: 2 };
  }

  // 3. Stale lock file removal
  let removedStaleEmbeddingLock = false;
  if (existsSync(embeddingLockPath)) {
    try {
      unlinkSync(embeddingLockPath);
      removedStaleEmbeddingLock = true;
      if (!options.json) {
        console.log(green("Cleaned up stale embedding lock file.", useColor));
      }
    } catch (e) {
      // Ignore lock deletion errors
    }
  }

  // 4. Git Hooks native re-installation
  let hooksReinstalled = false;
  const warnings: string[] = [];
  try {
    uninstallFn();
    installFn();
    hooksReinstalled = true;
    if (!options.json) {
      console.log(green("Successfully re-installed Git hooks natively.", useColor));
    }
  } catch (err) {
    const msg = unknownErrorMessage(err);
    warnings.push(`Failed to re-install Git hooks: ${msg}`);
    if (!options.json) {
      console.log(yellow(`Warning: Failed to re-install Git hooks: ${msg}`, useColor));
    }
  }

  // 5. Output beautiful stats breakdown
  let statsData: Record<string, unknown> | null = null;
  try {
    const statsService = new SqliteStatsService(db);
    const stats = await statsService.getStats();
    statsData = {
      totalSessions: stats.totalSessions,
      totalMessages: stats.totalMessages,
      projectBreakdown: stats.projectBreakdown,
    };

    if (!options.json) {
      console.log("");
      console.log(green("Database migration successful!", useColor));
      console.log("=================================");
      console.log(`Total sessions: ${stats.totalSessions}`);
      console.log(`Total messages: ${stats.totalMessages}`);
      console.log("");
      console.log("Project Breakdown:");
      if (stats.projectBreakdown.length === 0) {
        console.log("  No projects found.");
      } else {
        for (const project of stats.projectBreakdown) {
          console.log(`  - ${project.projectName}: ${project.sessionCount} sessions, ${project.messageCount} messages`);
        }
      }
      console.log("");
    }
  } catch (err) {
    // Non-fatal error showing stats
  } finally {
    closeDatabase(db);
  }

  if (options.json) {
    writeMigrateJson("ok", 0, {
      mode: "migrate",
      dbPath,
      dataDir,
      fromWindows: Boolean(options.fromWindows),
      integrityCheck,
      checkpointedWal: true,
      removedStaleEmbeddingLock,
      hooksReinstalled,
      stats: statsData,
    }, [], warnings);
  }

  return { exitCode: 0 };
}

function runMigrationDryRun(
  dbPath: string,
  dataDir: string,
  embeddingLockPath: string,
  options: MigrateCommandOptions,
): CommandResult {
  const useColor = shouldUseColor();
  let integrityCheck = "unknown";
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      const integrityRow = db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();
      integrityCheck = integrityRow?.integrity_check ?? "unknown";
    } finally {
      db.close();
    }
  } catch (err) {
    const message = `Database integrity check failed: ${unknownErrorMessage(err)}`;
    if (options.json) {
      writeMigrateJson("error", 2, { mode: "dry-run", dbPath, dataDir, fromWindows: Boolean(options.fromWindows), integrityCheck }, [message]);
    } else {
      console.error(red(`Error during migration dry-run: ${message}`, useColor));
    }
    return { exitCode: 2 };
  }

  if (integrityCheck !== "ok") {
    const message = `Database integrity check failed: ${integrityCheck}`;
    if (options.json) {
      writeMigrateJson("error", 2, { mode: "dry-run", dbPath, dataDir, fromWindows: Boolean(options.fromWindows), integrityCheck }, [message]);
    } else {
      console.error(red(`Error during migration dry-run: ${message}`, useColor));
    }
    return { exitCode: 2 };
  }

  const staleEmbeddingLockExists = existsSync(embeddingLockPath);
  const data = {
    mode: "dry-run",
    dbPath,
    dataDir,
    fromWindows: Boolean(options.fromWindows),
    integrityCheck,
    staleEmbeddingLockExists,
    wouldCheckpointWal: true,
    wouldRemoveStaleEmbeddingLock: staleEmbeddingLockExists,
    wouldReinstallHooks: true,
    requiredConfirmation: options.fromWindows ? "memory migrate --from-windows --confirm" : "memory migrate --confirm",
  };

  if (options.json) {
    writeMigrateJson("ok", 0, data);
  } else {
    console.log("Migration dry-run passed.");
    console.log(`Database: ${dbPath}`);
    console.log(`Integrity: ${green(integrityCheck, useColor)}`);
    console.log(`Mode: ${options.fromWindows ? "from Windows host" : "current platform"}`);
    console.log(`Would checkpoint WAL: yes`);
    console.log(`Would remove stale embedding lock: ${staleEmbeddingLockExists ? "yes" : "no"}`);
    console.log(`Would reinstall hooks: yes`);
    console.log("");
    console.log("To apply: " + data.requiredConfirmation);
  }

  return { exitCode: 0 };
}

function writeMigrateJson(
  status: "ok" | "not_ready" | "error",
  exitCode: number,
  data: Record<string, unknown>,
  errors: string[] = [],
  warnings: string[] = [],
): void {
  console.log(JSON.stringify({
    schemaVersion: 1,
    command: "migrate",
    status,
    exitCode,
    data,
    errors,
    warnings,
  }, null, 2));
}
