/**
 * Local backup/restore command tests.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, initializeDatabase } from "../../../infrastructure/database/index.js";
import {
  createBackupCommand,
  createRestoreCommand,
  executeBackupCreateCommand,
  executeBackupVerifyCommand,
  executeRestoreCommand,
} from "./backup.js";

describe("local backup and restore commands", () => {
  let testDir: string;
  let dbPath: string;
  let configPath: string;
  let eventsDir: string;
  let backupRoot: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  const originalLog = console.log;
  const originalError = console.error;

  const fixedNow = () => new Date("2026-07-01T20:00:00.000Z");

  const opts = () => ({
    dbPathOverride: dbPath,
    configPathOverride: configPath,
    eventsDirOverride: eventsDir,
    backupDirOverride: backupRoot,
    now: fixedNow,
  });

  beforeEach(() => {
    testDir = join(tmpdir(), `memory-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    dbPath = join(testDir, "data", "memory.db");
    configPath = join(testDir, "config", "config.json");
    eventsDir = join(testDir, "events");
    backupRoot = join(testDir, "backups");
    mkdirSync(join(testDir, "data"), { recursive: true });
    mkdirSync(join(testDir, "config"), { recursive: true });
    mkdirSync(eventsDir, { recursive: true });

    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
    writeFileSync(configPath, JSON.stringify({ machineId: "test-machine" }, null, 2));
    writeFileSync(join(eventsDir, "events-local.jsonl"), `${JSON.stringify({
      uuid: "fact-1",
      type: "decision",
      project: "memory-nexus",
      content: "Use local backups before risky projection changes.",
      observedAt: "2026-07-01T20:00:00.000Z",
    })}\n`);
    mkdirSync(join(eventsDir, ".git"), { recursive: true });
    writeFileSync(join(eventsDir, ".git", "HEAD"), "ref: refs/heads/main\n");

    consoleOutput = [];
    consoleErrorOutput = [];
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    try {
      rmSync(testDir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
    } catch {
      // Best-effort cleanup on Windows; SQLite can release handles late.
    }
  });

  it("registers backup and restore command surfaces", () => {
    const backup = createBackupCommand();
    expect(backup.name()).toBe("backup");
    expect(backup.commands.map((command) => command.name())).toEqual(["create", "verify"]);
    expect(createRestoreCommand().name()).toBe("restore");
  });

  it("executes backup and restore commander action handlers", async () => {
    const originalExitCode = process.exitCode;
    try {
      const backup = createBackupCommand(opts());
      await backup.parseAsync(["node", "memory", "create", "--quiet"]);
      expect(process.exitCode).toBe(0);
      const backupPath = consoleOutput.at(-1) as string;

      consoleOutput = [];
      const restore = createRestoreCommand(opts());
      await restore.parseAsync(["node", "memory", backupPath, "--dry-run", "--json"]);
      expect(process.exitCode).toBe(0);
      expect(JSON.parse(consoleOutput.join("\n")).data.dryRun).toBe(true);
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("creates a full local backup with manifest, database, config, and event logs", async () => {
    const result = await executeBackupCreateCommand(undefined, opts(), { json: true });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe("backup.create");
    expect(parsed.status).toBe("ok");
    expect(parsed.data.includesDatabase).toBe(true);
    expect(parsed.data.includesConfig).toBe(true);
    expect(parsed.data.includesEvents).toBe(true);
    expect(parsed.data.eventFileCount).toBe(1);

    const backupPath = parsed.data.backupPath as string;
    expect(existsSync(join(backupPath, "manifest.json"))).toBe(true);
    expect(existsSync(join(backupPath, "memory.db"))).toBe(true);
    expect(existsSync(join(backupPath, "config.json"))).toBe(true);
    expect(existsSync(join(backupPath, "events", "events-local.jsonl"))).toBe(true);
    expect(existsSync(join(backupPath, "events", ".git", "HEAD"))).toBe(false);
  });

  it("prints full text backup creation status when every component is included", async () => {
    const result = await executeBackupCreateCommand(undefined, opts());

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Local memory backup created");
    expect(out).toContain("Database:    included");
    expect(out).toContain("Config:      included");
    expect(out).toContain("Event files: 1");
  });

  it("prints quiet backup paths and creates unique paths for colliding timestamps", async () => {
    const first = await executeBackupCreateCommand(undefined, opts(), { quiet: true });
    expect(first.exitCode).toBe(0);
    const firstPath = consoleOutput.at(-1) as string;
    expect(firstPath).toContain("local-20260701T200000000Z");

    consoleOutput = [];
    const second = await executeBackupCreateCommand(undefined, opts(), { quiet: true });
    expect(second.exitCode).toBe(0);
    const secondPath = consoleOutput.at(-1) as string;
    expect(secondPath).toContain("local-20260701T200000000Z-2");
  });

  it("creates and verifies sparse backups with text warnings", async () => {
    const sparseOpts = {
      ...opts(),
      dbPathOverride: join(testDir, "missing", "memory.db"),
      configPathOverride: join(testDir, "missing", "config.json"),
      eventsDirOverride: join(testDir, "missing-events"),
    };

    const created = await executeBackupCreateCommand(undefined, sparseOpts, { json: true });
    expect(created.exitCode).toBe(0);
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    consoleOutput = [];

    const verified = await executeBackupVerifyCommand(backupPath, sparseOpts, {});
    expect(verified.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Local memory backup verified");
    expect(out).toContain("not_included");
    expect(out).toContain("Backup does not include a database file");
  });

  it("prints text output for sparse backup creation with an explicit output directory", async () => {
    const sparseOpts = {
      ...opts(),
      dbPathOverride: join(testDir, "missing", "memory.db"),
      configPathOverride: join(testDir, "missing", "config.json"),
      eventsDirOverride: join(testDir, "missing-events"),
    };
    const explicitOutputDir = join(testDir, "explicit-backups");

    const result = await executeBackupCreateCommand(explicitOutputDir, sparseOpts);

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Local memory backup created");
    expect(out).toContain(explicitOutputDir);
    expect(out).toContain("Database:    not found");
    expect(out).toContain("Config:      not found");
    expect(out).toContain("Event files: 0");
  });

  it("verifies a local backup and reports database integrity", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    consoleOutput = [];

    const result = await executeBackupVerifyCommand(backupPath, opts(), { json: true });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.command).toBe("backup.verify");
    expect(parsed.status).toBe("ok");
    expect(parsed.data.databaseIntegrity).toBe("ok");
    expect(parsed.errors).toEqual([]);
  });

  it("verifies backup ids relative to the configured backup root and prints no warning line for full backups", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const created = JSON.parse(consoleOutput.join("\n"));
    consoleOutput = [];

    const result = await executeBackupVerifyCommand(created.data.backupId, opts());

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Local memory backup verified");
    expect(out).toContain("Database integrity: ok");
    expect(out).not.toContain("Warnings:");
  });

  it("reports verification errors for missing declared files and invalid manifests", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    rmSync(join(backupPath, "memory.db"), { force: true });
    consoleOutput = [];

    const missingDb = await executeBackupVerifyCommand(backupPath, opts(), {});
    expect(missingDb.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Backup manifest declares database");

    const invalidPath = join(backupRoot, "invalid");
    mkdirSync(invalidPath, { recursive: true });
    writeFileSync(join(invalidPath, "manifest.json"), "{}\n");
    consoleOutput = [];

    const invalid = await executeBackupVerifyCommand(invalidPath, opts(), { json: true });
    expect(invalid.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.errors[0]).toContain("manifest is invalid");
  });

  it("reports verification errors for missing declared config and event directories", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    rmSync(join(backupPath, "config.json"), { force: true });
    rmSync(join(backupPath, "events"), { recursive: true, force: true });
    consoleOutput = [];

    const result = await executeBackupVerifyCommand(backupPath, opts(), { json: true });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.errors).toContain("Backup manifest declares config but config.json is missing");
    expect(parsed.errors).toContain("Backup manifest declares events but events directory is missing");
  });

  it("rejects each unsupported manifest field instead of accepting partial backup metadata", async () => {
    const validManifest = {
      schemaVersion: 1,
      kind: "memory.localBackup",
      backupId: "local-test",
      createdAt: "2026-07-01T20:00:00.000Z",
      includesDatabase: false,
      includesConfig: false,
      includesEvents: false,
      eventFileCount: 0,
      excludedPaths: ["events/.git"],
    };
    const cases: Array<[string, Record<string, unknown>]> = [
      ["schemaVersion", { schemaVersion: 2 }],
      ["kind", { kind: "memory.remoteBackup" }],
      ["backupId", { backupId: 42 }],
      ["createdAt", { createdAt: null }],
      ["includesDatabase", { includesDatabase: "no" }],
      ["includesConfig", { includesConfig: "no" }],
      ["includesEvents", { includesEvents: "no" }],
      ["eventFileCount", { eventFileCount: "0" }],
      ["excludedPaths", { excludedPaths: "events/.git" }],
    ];

    for (const [field, override] of cases) {
      const invalidPath = join(backupRoot, `invalid-${field}`);
      mkdirSync(invalidPath, { recursive: true });
      writeFileSync(join(invalidPath, "manifest.json"), `${JSON.stringify({ ...validManifest, ...override })}\n`);
      consoleOutput = [];

      const result = await executeBackupVerifyCommand(invalidPath, opts(), { json: true });

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(consoleOutput.join("\n")).errors[0]).toContain("manifest is invalid");
    }
  });

  it("reports corrupt backup database integrity", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    writeFileSync(join(backupPath, "memory.db"), "not sqlite");
    consoleOutput = [];

    const result = await executeBackupVerifyCommand(backupPath, opts(), { json: true });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.errors[0]).toContain("Error verifying local backup");
    expect(parsed.errors[0]).toContain("database");
  });

  it("refuses restore mutation without --confirm", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    writeFileSync(configPath, JSON.stringify({ machineId: "mutated" }, null, 2));
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { json: true });

    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("not_ready");
    expect(readFileSync(configPath, "utf-8")).toContain("mutated");
  });

  it("prints the text no-confirm restore guard", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), {});

    expect(result.exitCode).toBe(2);
    expect(consoleErrorOutput.join("\n")).toContain("restore requires --confirm");
  });

  it("dry-runs restore without mutating local data", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    writeFileSync(configPath, JSON.stringify({ machineId: "mutated" }, null, 2));
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { dryRun: true, json: true });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.wouldRestoreDatabase).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toContain("mutated");
  });

  it("prints text dry-run restore readiness", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { dryRun: true });

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Restore dry-run passed");
    expect(out).toContain("Would restore database: yes");
  });

  it("prints text dry-run restore readiness for sparse backups", async () => {
    const sparseOpts = {
      ...opts(),
      dbPathOverride: join(testDir, "missing", "memory.db"),
      configPathOverride: join(testDir, "missing", "config.json"),
      eventsDirOverride: join(testDir, "missing-events"),
    };
    await executeBackupCreateCommand(undefined, sparseOpts, { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { dryRun: true });

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Would restore database: no");
    expect(out).toContain("Would restore config:   no");
    expect(out).toContain("Would restore events:   no");
  });

  it("restores local data with --confirm and creates a rollback backup first", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    writeFileSync(configPath, JSON.stringify({ machineId: "mutated" }, null, 2));
    writeFileSync(join(eventsDir, "extra.jsonl"), "{}\n");
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true, json: true });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("ok");
    expect(existsSync(parsed.data.rollbackBackupPath)).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toContain("test-machine");
    expect(existsSync(join(eventsDir, "events-local.jsonl"))).toBe(true);
    expect(existsSync(join(eventsDir, "extra.jsonl"))).toBe(false);

    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
    } finally {
      db.close();
    }
  });

  it("prints text restore success", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    writeFileSync(configPath, JSON.stringify({ machineId: "mutated" }, null, 2));
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true });

    expect(result.exitCode).toBe(0);
    const out = consoleOutput.join("\n");
    expect(out).toContain("Local memory restore completed");
    expect(out).toContain("Source backup:");
    expect(out).toContain("Rollback backup:");
    expect(readFileSync(configPath, "utf-8")).toContain("test-machine");
  });

  it("copies nested event directories during backup and restore", async () => {
    mkdirSync(join(eventsDir, "nested"), { recursive: true });
    writeFileSync(join(eventsDir, "nested", "events-nested.jsonl"), "{}\n");

    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;

    expect(existsSync(join(backupPath, "events", "nested", "events-nested.jsonl"))).toBe(true);

    rmSync(join(eventsDir, "nested"), { recursive: true, force: true });
    consoleOutput = [];
    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true, json: true });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(eventsDir, "nested", "events-nested.jsonl"))).toBe(true);
  });

  it("restores sparse backups without deleting local components the backup did not include", async () => {
    const sparseOpts = {
      ...opts(),
      dbPathOverride: join(testDir, "missing", "memory.db"),
      configPathOverride: join(testDir, "missing", "config.json"),
      eventsDirOverride: join(testDir, "missing-events"),
    };
    await executeBackupCreateCommand(undefined, sparseOpts, { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(join(eventsDir, "events-local.jsonl"))).toBe(true);
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true, json: true });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.data.restoredDatabase).toBe(false);
    expect(parsed.warnings).toContain("Backup does not include a database file");
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(join(eventsDir, "events-local.jsonl"))).toBe(true);
    expect(existsSync(join(eventsDir, ".git", "HEAD"))).toBe(true);
  });

  it("does not restore when backup verification fails", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    rmSync(join(backupPath, "config.json"), { force: true });
    writeFileSync(configPath, JSON.stringify({ machineId: "still-current" }, null, 2));
    consoleOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true, json: true });

    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(consoleOutput.join("\n"));
    expect(parsed.status).toBe("error");
    expect(parsed.errors[0]).toContain("config.json is missing");
    expect(readFileSync(configPath, "utf-8")).toContain("still-current");
  });

  it("prints text restore verification failures", async () => {
    await executeBackupCreateCommand(undefined, opts(), { json: true });
    const backupPath = JSON.parse(consoleOutput.join("\n")).data.backupPath as string;
    rmSync(join(backupPath, "config.json"), { force: true });
    consoleOutput = [];
    consoleErrorOutput = [];

    const result = await executeRestoreCommand(backupPath, opts(), { confirm: true });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Backup verification failed");
    expect(consoleErrorOutput.join("\n")).toContain("config.json is missing");
  });

  it("reports create, verify, and restore exceptions as JSON errors", async () => {
    const fileInsteadOfDir = join(testDir, "not-a-dir");
    writeFileSync(fileInsteadOfDir, "file");

    const createResult = await executeBackupCreateCommand(undefined, {
      ...opts(),
      backupDirOverride: fileInsteadOfDir,
    }, { json: true });
    expect(createResult.exitCode).toBe(1);
    expect(JSON.parse(consoleOutput.join("\n")).errors[0]).toContain("Error creating local backup");

    consoleOutput = [];
    const verifyResult = await executeBackupVerifyCommand(join(testDir, "missing-backup"), opts(), { json: true });
    expect(verifyResult.exitCode).toBe(1);
    expect(JSON.parse(consoleOutput.join("\n")).errors[0]).toContain("manifest.json is missing");

    consoleOutput = [];
    const restoreResult = await executeRestoreCommand(join(testDir, "missing-backup"), opts(), { json: true });
    expect(restoreResult.exitCode).toBe(1);
    expect(JSON.parse(consoleOutput.join("\n")).errors[0]).toContain("manifest.json is missing");
  });

  it("uses safe default options for verify and restore when the backup path is explicit", async () => {
    const missingBackupPath = join(testDir, "explicit-missing-backup");
    mkdirSync(missingBackupPath, { recursive: true });

    const verifyResult = await executeBackupVerifyCommand(missingBackupPath);
    expect(verifyResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("manifest.json is missing");

    consoleErrorOutput = [];
    const restoreResult = await executeRestoreCommand(missingBackupPath);
    expect(restoreResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("manifest.json is missing");
  });

  it("reports create, verify, and restore exceptions as text errors", async () => {
    const fileInsteadOfDir = join(testDir, "not-a-dir-text");
    writeFileSync(fileInsteadOfDir, "file");

    const createResult = await executeBackupCreateCommand(undefined, {
      ...opts(),
      backupDirOverride: fileInsteadOfDir,
    });
    expect(createResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Error creating local backup");

    consoleErrorOutput = [];
    const verifyResult = await executeBackupVerifyCommand(join(testDir, "missing-backup-text"), opts());
    expect(verifyResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Error verifying local backup");

    consoleErrorOutput = [];
    const restoreResult = await executeRestoreCommand(join(testDir, "missing-backup-text"), opts());
    expect(restoreResult.exitCode).toBe(1);
    expect(consoleErrorOutput.join("\n")).toContain("Error restoring local backup");
  });
});
