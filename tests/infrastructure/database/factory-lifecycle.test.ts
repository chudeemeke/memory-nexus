import { describe, expect, it, spyOn } from "bun:test";
import { Database, type Statement } from "bun:sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { initializeDatabase, initializeDatabaseSafe, closeDatabase, bulkOperationCheckpoint } from "../../../src/infrastructure/database/connection.js";
import { MemoryError, ErrorCode } from "../../../src/domain/index.js";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";

describe("shared database factory ownership", () => {
  it("does not create parent directories when opening a missing file with create:false", () => {
    const storage = createOwnedTestDirectory("memory-factory-no-create-");
    try {
      const parent = join(storage.dir, "missing");
      expect(() => initializeDatabase({ path: join(parent, "absent.db"), create: false })).toThrow(MemoryError);
      expect(existsSync(parent)).toBe(false);
    } finally { storage.cleanup(); }
  });
  it("closes retained and overflow statements and immediately releases a real file", () => {
    const storage = createOwnedTestDirectory("memory-factory-lifecycle-");
    let db: Database | undefined;
    const statements: Statement[] = [];
    try {
      const path = join(storage.dir, "memory.db");
      db = initializeDatabase({ path }).db;
      const retained = db.prepare("SELECT 123 AS value");
      const overflow = Array.from({ length: 150 }, (_, index) => db!.query(`SELECT ${index} AS value`));
      statements.push(retained, ...overflow);
      expect(retained.get()).toEqual({ value: 123 });
      closeDatabase(db); db = undefined;
      expect(() => retained.get()).toThrow("finalized");
      for (const statement of overflow) expect(() => statement.get()).toThrow(/finalized|Database has closed/);
      unlinkSync(path);
    } finally { for (const statement of statements) statement.finalize(); db?.close(); storage.cleanup(); }
  });

  it("reopens an existing file with create:false and preserves writable transaction behavior", () => {
    const storage = createOwnedTestDirectory("memory-factory-reopen-");
    let db: Database | undefined;
    try {
      const path = join(storage.dir, "existing.db");
      db = initializeDatabase({ path, applySchema: false }).db;
      db.exec("CREATE TABLE retained(value INTEGER)"); closeDatabase(db); db = undefined;
      db = initializeDatabase({ path, create: false, applySchema: false }).db;
      db.transaction(() => db!.exec("INSERT INTO retained VALUES (42)"))();
      using statement = db.prepare("SELECT value FROM retained");
      expect(statement.all()).toEqual([{ value: 42 }]);
      expect(bulkOperationCheckpoint(db).busy).toBe(0);
    } finally { db?.close(); storage.cleanup(); }
  });

  it("preserves initialization and cleanup failures together and permits resource cleanup retry", () => {
    const primary = new Error("synthetic initialization failure"), cleanup = new Error("synthetic cleanup failure");
    let captured: Database | undefined;
    const exec = spyOn(Database.prototype, "exec").mockImplementation(function (this: Database) {
      captured = this; throw primary;
    });
    const close = spyOn(Database.prototype, "close").mockImplementation(() => { throw cleanup; });
    let caught: unknown;
    try { initializeDatabaseSafe({ path: ":memory:", applySchema: false }); }
    catch (error) { caught = error; }
    finally { exec.mockRestore(); close.mockRestore(); captured?.close(); }
    expect(caught).toBeInstanceOf(MemoryError);
    const failure = caught as MemoryError;
    expect(failure.code).toBe(ErrorCode.DB_CONNECTION_FAILED);
    expect(failure.context?.cleanupFailed).toBe(true);
    expect(failure.cause).toBeInstanceOf(AggregateError);
    const causes = (failure.cause as AggregateError).errors;
    expect(causes[0].cause).toBe(primary); expect(causes[1]).toBe(cleanup);
  });

  it("disposes initialization/checkpoint statements and closes on a structured initialization failure", () => {
    const storage = createOwnedTestDirectory("memory-factory-scopes-");
    const statements: Statement[] = [], prepare = OwnedDatabase.prototype.prepare;
    const capture = spyOn(OwnedDatabase.prototype, "prepare").mockImplementation((function (this: OwnedDatabase, ...args: Parameters<typeof prepare>) {
      const statement = Reflect.apply(prepare, this, args) as ReturnType<typeof prepare>;
      statements.push(statement); return statement;
    }) as typeof prepare);
    let db: Database | undefined;
    try {
      db = initializeDatabase({ path: join(storage.dir, "scoped.db"), applySchema: false, quickCheck: true }).db;
      for (let iteration = 0; iteration < 5; iteration++) expect(bulkOperationCheckpoint(db).busy).toBe(0);
      expect(statements).toHaveLength(7);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
    } finally { capture.mockRestore(); db?.close(); storage.cleanup(); }

    const primary = new MemoryError(ErrorCode.DB_CORRUPTED, "synthetic structured initialization failure");
    let failed: Database | undefined;
    const exec = spyOn(Database.prototype, "exec").mockImplementation(function (this: Database) { failed = this; throw primary; });
    let caught: unknown;
    try { initializeDatabase({ path: ":memory:" }); } catch (error) { caught = error; }
    finally { exec.mockRestore(); }
    expect(caught).toBe(primary);
    expect(() => failed!.exec("SELECT 1")).toThrow();
  });

  it("rolls back unfinished work and an active iterator without closing another connection", () => {
    const storage = createOwnedTestDirectory("memory-factory-connections-");
    let first: Database | undefined, second: Database | undefined;
    try {
      const path = join(storage.dir, "shared.db");
      first = initializeDatabase({ path, applySchema: false, busyTimeout: 5 }).db;
      first.exec("CREATE TABLE retained (value INTEGER); INSERT INTO retained VALUES(1),(2)");
      second = initializeDatabase({ path, applySchema: false, create: false, busyTimeout: 5 }).db;
      first.exec("BEGIN; INSERT INTO retained VALUES(3)");
      const statement = first.prepare("SELECT value FROM retained ORDER BY value"), iterator = statement.iterate();
      expect(iterator.next().value).toEqual({ value: 1 });
      closeDatabase(first); first = undefined;
      expect(() => statement.get()).toThrow("finalized");
      expect(() => iterator.next()).toThrow();
      {
        using read = second.prepare("SELECT value FROM retained ORDER BY value");
        expect(read.all()).toEqual([{ value: 1 }, { value: 2 }]);
      }
      second.exec("INSERT INTO retained VALUES(4)");
      closeDatabase(second); second = undefined; unlinkSync(path);
    } finally { first?.close(); second?.close(); storage.cleanup(); }
  });

  it("releases the version statement and connection when the existing capability probe rejects", () => {
    const storage = createOwnedTestDirectory("memory-factory-capability-");
    const path = join(storage.dir, "capability.db");
    const seed = initializeDatabase({ path, applySchema: false }).db;
    seed.exec("CREATE TABLE _fts5_check(value TEXT)"); closeDatabase(seed);
    const statements: Statement[] = [], prepare = OwnedDatabase.prototype.prepare;
    const capture = spyOn(OwnedDatabase.prototype, "prepare").mockImplementation((function (this: OwnedDatabase, ...args: Parameters<typeof prepare>) {
      const statement = Reflect.apply(prepare, this, args) as ReturnType<typeof prepare>;
      statements.push(statement); return statement;
    }) as typeof prepare);
    try {
      expect(() => initializeDatabase({ path, applySchema: false })).toThrow("FTS5 is not available");
      expect(statements).toHaveLength(2);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      unlinkSync(path);
    } finally { capture.mockRestore(); storage.cleanup(); }
  });
});
