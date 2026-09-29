import { describe, expect, it, spyOn } from "bun:test";
import { Database, type Statement } from "bun:sqlite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initializeDatabase, closeDatabase } from "../../../src/infrastructure/database/index.js";
import { executeBackupCreateCommand, executeBackupVerifyCommand } from "../../../src/presentation/cli/commands/backup.js";
import { executeMigrateCommand } from "../../../src/presentation/cli/commands/migrate.js";
import { captureStreams } from "../../helpers/capture-json.js";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";

async function trackMaintenanceStatements(run: () => Promise<number>, missingCheckpoint = false) {
  const statements: Statement[] = [], disposed = new Set<Statement>();
  const prepare = Database.prototype.prepare;
  const capture = spyOn(Database.prototype, "prepare").mockImplementation((function (this: Database, ...args: Parameters<typeof prepare>) {
    const statement = Reflect.apply(prepare, this, args) as ReturnType<typeof prepare>;
    if (args[0] === "PRAGMA integrity_check" || args[0] === "PRAGMA wal_checkpoint(TRUNCATE)") {
      statements.push(statement);
      const dispose = statement[Symbol.dispose];
      Object.defineProperty(statement, Symbol.dispose, { configurable: true, value() {
        disposed.add(statement); return Reflect.apply(dispose, statement, []);
      } });
      if (missingCheckpoint && args[0] === "PRAGMA wal_checkpoint(TRUNCATE)") {
        Object.defineProperty(statement, "get", { configurable: true, value: () => null });
      }
    }
    return statement;
  }) as typeof prepare);
  try {
    expect(statements.length).toBe(0);
    const expectedCount = await run();
    expect(statements.length).toBe(expectedCount);
    expect(disposed.size).toBe(expectedCount);
  } finally { capture.mockRestore(); for (const statement of statements) statement.finalize(); }
}

/** Native contention, with only the busy wait shortened for bounded tests. */
async function withBusyWal(run: (fixture: { dir: string; path: string; release: () => void; count: () => number }) => Promise<void>) {
  const storage = createOwnedTestDirectory("memory-maintenance-checkpoint-");
  const path = join(storage.dir, "memory.db");
  const exec = Database.prototype.exec;
  const shortWait = spyOn(Database.prototype, "exec").mockImplementation(function (this: Database, sql: string) {
    return Reflect.apply(exec, this, [sql === "PRAGMA busy_timeout = 5000;" ? "PRAGMA busy_timeout = 5;" : sql]);
  });
  let writer: Database | undefined, reader: Database | undefined;
  try {
    const initialized = initializeDatabase({ path });
    initialized.db.exec("CREATE TABLE acknowledged (value INTEGER PRIMARY KEY); INSERT INTO acknowledged VALUES (1)");
    closeDatabase(initialized.db);
    writer = new Database(path); writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; PRAGMA busy_timeout=5");
    reader = new Database(path); reader.exec("BEGIN");
    { using read = reader.prepare("SELECT * FROM acknowledged"); expect(read.all()).toEqual([{ value: 1 }]); }
    writer.exec("INSERT INTO acknowledged VALUES (2)");
    const connection = writer;
    await run({ dir: storage.dir, path, release: () => { reader!.exec("ROLLBACK"); }, count: () => {
      using count = connection.prepare<{ count: number }, []>("SELECT COUNT(*) AS count FROM acknowledged");
      return count.get()!.count;
    } });
  } finally {
    shortWait.mockRestore(); reader?.close(); writer?.close(); storage.cleanup();
  }
}

describe("maintenance checkpoint completion", () => {
  it("detects an unscoped live handle rather than accepting eventual connection cleanup", async () => {
    const db = new Database(":memory:");
    try {
      await expect(trackMaintenanceStatements(async () => { db.prepare("PRAGMA integrity_check").get(); return 1; })).rejects.toThrow();
    } finally { db.close(); }
  });

  it("disposes every maintenance statement on success and missing checkpoint refusal", async () => {
    await withBusyWal(async ({ dir, path, release }) => {
      release();
      const opts = { dbPathOverride: path, configPathOverride: join(dir, "config.json"), eventsDirOverride: join(dir, "events"), backupDirOverride: join(dir, "backups") };
      const deps = { dbPath: path, dataDir: dir, uninstallHooks: () => {}, installHooks: () => {} };
      await trackMaintenanceStatements(async () => {
        const success = await captureStreams(() => executeBackupCreateCommand(join(dir, "success"), opts, { json: true }));
        expect(success.exitCode).toBe(0);
        const backupPath = JSON.parse(success.stdout).data.backupPath as string;
        expect((await captureStreams(() => executeBackupVerifyCommand(backupPath, opts, { json: true }))).exitCode).toBe(0);
        expect((await captureStreams(() => executeMigrateCommand({ dryRun: true, json: true }, deps))).exitCode).toBe(0);
        expect((await captureStreams(() => executeMigrateCommand({ confirm: true, json: true }, deps))).exitCode).toBe(0);
        return 5;
      });
      await trackMaintenanceStatements(async () => {
        const backup = await captureStreams(() => executeBackupCreateCommand(join(dir, "missing"), opts, { json: true }));
        const migration = await captureStreams(() => executeMigrateCommand({ confirm: true, json: true }, deps));
        expect(backup.exitCode).toBe(1); expect(migration.exitCode).toBe(2);
        expect(backup.stdout).toContain("checkpoint is busy or unavailable");
        expect(migration.stdout).toContain("checkpoint is busy or unavailable");
        return 3;
      }, true);
    });
  });

  it("refuses a busy backup, preserves committed data and succeeds after the reader releases", async () => {
    await withBusyWal(async ({ dir, path, release, count }) => {
      const destination = join(dir, "blocked-backup");
      const opts = { dbPathOverride: path, configPathOverride: join(dir, "config.json"), eventsDirOverride: join(dir, "events"), backupDirOverride: join(dir, "backups") };
      const failed = await captureStreams(() => executeBackupCreateCommand(destination, opts, { json: true }));
      expect(failed.exitCode).toBe(1);
      expect(failed.stdout).toContain("checkpoint"); expect(failed.stdout).toContain("busy");
      const incomplete = readdirSync(destination, { recursive: true });
      expect(incomplete.some(name => String(name).endsWith("manifest.json"))).toBe(false);
      expect(incomplete.some(name => String(name).endsWith("memory.db"))).toBe(false); expect(count()).toBe(2);
      release();
      const completed = join(dir, "completed-backup");
      const success = await captureStreams(() => executeBackupCreateCommand(completed, opts, { json: true }));
      expect(success.exitCode).toBe(0);
      const backupPath = JSON.parse(success.stdout).data.backupPath as string;
      const copy = new Database(join(backupPath, "memory.db"), { readonly: true });
      try { using read = copy.prepare("SELECT * FROM acknowledged ORDER BY value"); expect(read.all()).toEqual([{ value: 1 }, { value: 2 }]); }
      finally { copy.close(); }
      expect((await captureStreams(() => executeBackupVerifyCommand(backupPath, opts, { json: true }))).exitCode).toBe(0);
    });
  });

  it("refuses a busy migration before lock or hook mutation and permits an explicit retry", async () => {
    await withBusyWal(async ({ dir, path, release, count }) => {
      const lock = join(dir, "embedding.lock"); writeFileSync(lock, "synthetic retained lock");
      const hooks: string[] = [];
      const deps = { dbPath: path, dataDir: dir, uninstallHooks: () => { hooks.push("uninstall"); }, installHooks: () => { hooks.push("install"); } };
      const failed = await captureStreams(() => executeMigrateCommand({ confirm: true, json: true }, deps));
      expect(failed.exitCode).toBe(2); expect(failed.stdout).toContain("checkpoint"); expect(failed.stdout).toContain("busy");
      expect(readFileSync(lock, "utf8")).toBe("synthetic retained lock"); expect(hooks).toEqual([]); expect(count()).toBe(2);
      release();
      const success = await captureStreams(() => executeMigrateCommand({ confirm: true, json: true }, deps));
      expect(success.exitCode).toBe(0); expect(JSON.parse(success.stdout).data.checkpointedWal).toBe(true);
      expect(hooks).toEqual(["uninstall", "install"]); expect(count()).toBe(2);
    });
  });
});
