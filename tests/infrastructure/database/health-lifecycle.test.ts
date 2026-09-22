import { describe, expect, it, spyOn } from "bun:test";
import { Database, type Statement } from "bun:sqlite";
import { join } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { checkDatabaseIntegrity, checkQuickIntegrity, checkSqliteVecAvailability, runHealthCheck } from "../../../src/infrastructure/database/health-checker.js";

function withTrackedStatements(run: (released: () => void) => void): void {
  const statements = new Map<Statement, Database>(), liveAtClose: Statement[] = [];
  const prepare = Database.prototype.prepare, close = Database.prototype.close;
  const capturePrepare = spyOn(Database.prototype, "prepare").mockImplementation((function (this: Database, ...args: Parameters<typeof prepare>) {
    const statement = Reflect.apply(prepare, this, args) as ReturnType<typeof prepare>;
    statements.set(statement, this); return statement;
  }) as typeof prepare);
  const captureClose = spyOn(Database.prototype, "close").mockImplementation(function (this: Database, ...args: Parameters<typeof close>) {
    for (const [statement, db] of statements) {
      if (db !== this) continue;
      try { statement.get(); liveAtClose.push(statement); }
      catch (error) { if (!(error instanceof Error) || !error.message.includes("finalized")) liveAtClose.push(statement); }
    }
    return Reflect.apply(close, this, args);
  });
  try {
    run(() => {
      expect(statements.size).toBeGreaterThan(0);
      expect(liveAtClose).toHaveLength(0);
      for (const statement of statements.keys()) expect(() => statement.get()).toThrow(/finalized|Database has closed/);
    });
  } finally {
    captureClose.mockRestore(); capturePrepare.mockRestore();
    for (const statement of statements.keys()) statement.finalize();
    for (const db of new Set(statements.values())) db.close();
  }
}

function check(path: string, dir: string) {
  return runHealthCheck({ dbPath: path, configDir: dir, logsDir: dir, sourceDir: dir,
    hookOverrides: { settingsPath: join(dir, "settings.json") },
    capabilityInterop: { env: {}, commandResolver: () => null } });
}

describe("health reader lifetime and consistent counts", () => {
  it("rejects a live readable statement in the lifetime verifier", () => {
    withTrackedStatements(released => {
      const db = new Database(":memory:"); db.prepare("SELECT 1"); db.close();
      expect(released).toThrow();
    });
  });

  it("does not mistake a native query error for statement finalization", () => {
    withTrackedStatements(released => {
      const db = new Database(":memory:"); db.prepare("SELECT json_extract('invalid', '$')"); db.close();
      expect(released).toThrow();
    });
  });

  it("releases both integrity queries before a raw caller connection is closed", () => {
    const db = new Database(":memory:");
    try {
      withTrackedStatements(released => {
        for (let iteration = 0; iteration < 5; iteration++) {
          expect(checkDatabaseIntegrity(db)).toBe("ok");
          expect(checkQuickIntegrity(db)).toBe("ok"); released();
        }
      });
    } finally { db.close(); }
  });

  it("releases the native vector-version query before closing its temporary connection", () => {
    withTrackedStatements(released => {
      for (let iteration = 0; iteration < 3; iteration++) {
        const result = checkSqliteVecAvailability();
        expect(result.available).toBe(true); expect(result.version).toMatch(/^v?\d+\./); released();
      }
    });
  });

  it("closes the temporary connection when native extension loading fails", () => {
    const storage = createOwnedTestDirectory("memory-health-extension-failure-");
    const load = Database.prototype.loadExtension;
    let captured: Database | undefined;
    const failLoad = spyOn(Database.prototype, "loadExtension").mockImplementation(function (this: Database) {
      captured = this;
      return Reflect.apply(load, this, [join(storage.dir, "missing-synthetic-extension.node")]);
    });
    try {
      expect(checkSqliteVecAvailability()).toEqual({ available: false, version: null });
      expect(captured).toBeDefined();
      expect(() => captured!.exec("SELECT 1")).toThrow();
    } finally { failLoad.mockRestore(); captured?.close(); storage.cleanup(); }
  });

  it("releases repeated public readonly health probes and the underlying file", () => {
    const storage = createOwnedTestDirectory("memory-health-lifecycle-");
    try {
      const path = join(storage.dir, "health.db"), seed = new Database(path);
      seed.exec("CREATE TABLE embedding_state(id); INSERT INTO embedding_state VALUES(1); CREATE TABLE messages_meta(id); INSERT INTO messages_meta VALUES(1),(2)"); seed.close();
      withTrackedStatements(released => {
        for (let iteration = 0; iteration < 3; iteration++) {
          const result = check(path, storage.dir);
          expect(result.database.integrity).toBe("ok");
          expect(result.searchCapability.embeddedCount).toBe(1);
          expect(result.searchCapability.totalMessages).toBe(2);
          expect(result.searchCapability.coveragePercent).toBe(50);
          expect(result.searchCapability.vectorReady).toBe(true); released();
        }
        unlinkSync(path);
      });
    } finally { storage.cleanup(); }
  });

  it("does not report vector readiness from a partial count read when the second table is missing", () => {
    const storage = createOwnedTestDirectory("memory-health-failure-");
    try {
      const path = join(storage.dir, "partial.db"), seed = new Database(path);
      seed.exec("CREATE TABLE embedding_state(id); INSERT INTO embedding_state VALUES(1)"); seed.close();
      withTrackedStatements(released => {
        const result = check(path, storage.dir);
        expect(result.searchCapability.vectorReady).toBe(false);
        expect(result.searchCapability.embeddedCount).toBe(0);
        expect(result.searchCapability.totalMessages).toBe(0); released();
        unlinkSync(path);
      });
    } finally { storage.cleanup(); }
  });

  it("releases corrupt-file probes after native read failures", () => {
    const storage = createOwnedTestDirectory("memory-health-corrupt-");
    try {
      const path = join(storage.dir, "corrupt.db"); writeFileSync(path, "synthetic invalid sqlite file");
      withTrackedStatements(released => {
        const result = check(path, storage.dir);
        expect(result.database.integrity).toBe("corrupted");
        expect(result.searchCapability.vectorReady).toBe(false); released();
        unlinkSync(path);
      });
    } finally { storage.cleanup(); }
  });
});
