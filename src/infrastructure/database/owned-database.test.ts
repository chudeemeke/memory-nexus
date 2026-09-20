import { expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setImmediate, setTimeout } from "node:timers/promises";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";
import { SqliteStatsService } from "./services/stats-service.js";
import { OwnedDatabase } from "./owned-database.js";

it("closes a connection's retained prepared statements", () => {
  const db = new OwnedDatabase(":memory:");
  const statement = db.prepare("SELECT 1 AS value");
  try {
    expect(statement.get()).toEqual({ value: 1 });
    db.close();
    expect(() => statement.get()).toThrow();
    expect(() => db.close()).not.toThrow();
  } finally { statement.finalize(); db.close(); }
});

for (const failure of [new Error("finalizer failure"), "non-error finalizer failure"]) {
  it(`attempts other finalizers and retains failed resources for retry: ${String(failure)}`, () => {
    const db = new OwnedDatabase(":memory:"), failed = db.prepare("SELECT 1 AS value"), healthy = db.prepare("SELECT 2 AS value");
    const finalize = failed.finalize;
    failed.finalize = () => { throw failure; };
    try {
      let caught: unknown;
      try { db.close(); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([failure]);
      expect(() => healthy.get()).toThrow();
      expect(failed.get()).toEqual({ value: 1 });
      let recovered = 0;
      failed.finalize = function () { recovered++; finalize.call(this); };
      db.close();
      expect(recovered).toBe(1);
      expect(() => failed.get()).toThrow();
    } finally { failed.finalize = finalize; failed.finalize(); db.close(); }
  });
}

it("releases an explicitly finalized statement while the connection stays open", async () => {
  const db = new OwnedDatabase(":memory:");
  try {
    const reference = await (async () => {
      const statement = db.prepare("SELECT 1 AS value");
      return new WeakRef(statement);
    })();
    async function collect(): Promise<void> {
      for (let attempt = 0; attempt < 10; attempt++) {
        await setImmediate(); Bun.gc(true); await setTimeout(10);
        if (reference.deref() === undefined) break;
      }
    }
    await collect();
    expect(reference.deref()).toBeDefined();
    reference.deref()!.finalize();
    await collect();
    expect(reference.deref()).toBeUndefined();
    using live = db.prepare("SELECT 2 AS value");
    expect(live.get()).toEqual({ value: 2 });
  } finally { db.close(); }
});

it("owns query-cache overflow, transaction controllers and partially consumed iterators", () => {
  const db = new OwnedDatabase(":memory:"), retained: Statement[] = [];
  try {
    db.exec("CREATE TABLE example(value INTEGER)");
    db.transaction(() => db.exec("INSERT INTO example VALUES (1), (2)"))();
    for (let value = 0; value < 30; value++) retained.push(db.query(`SELECT ${value} AS value`));
    const statement = db.prepare<{value: number}, []>("SELECT value FROM example");
    const iterator = statement.iterate();
    expect(iterator.next().value).toEqual({ value: 1 });
    db.close();
    expect(() => statement.get()).toThrow();
    for (const query of retained) expect(() => query.get()).toThrow();
  } finally { for (const statement of retained) statement.finalize(); db.close(); }
});

it("keeps both operation and disposal errors and supports recovery", () => {
  const db = new OwnedDatabase(":memory:"), statement = db.prepare("SELECT 1");
  const finalize = statement.finalize, operation = new Error("operation failed"), cleanup = new Error("cleanup failed");
  statement.finalize = () => { throw cleanup; };
  try {
    let caught: unknown;
    try { using resource = statement; void resource; throw operation; } catch (error) { caught = error; }
    expect((caught as SuppressedError).error).toBe(cleanup);
    expect((caught as SuppressedError).suppressed).toBe(operation);
    statement.finalize = finalize;
    db.close();
    expect(() => statement.get()).toThrow();
  } finally { statement.finalize = finalize; statement.finalize(); db.close(); }
});

it("preserves committed data, rolls back unfinished work and leaves another connection usable", () => {
  const storage = createOwnedTestDirectory("memory-owner-transaction-"), path = join(storage.dir, "database.db");
  const first = new OwnedDatabase(path, { create: true }), second = new OwnedDatabase(":memory:");
  let reopened: OwnedDatabase | undefined;
  try {
    first.exec("CREATE TABLE example(value INTEGER)");
    first.transaction(() => first.exec("INSERT INTO example VALUES (1)"))();
    first.exec("BEGIN; INSERT INTO example VALUES (2)");
    first.close();
    using other = second.prepare("SELECT 3 AS value");
    expect(other.get()).toEqual({ value: 3 });
    reopened = new OwnedDatabase(path, { create: false, readwrite: true });
    using committed = reopened.prepare("SELECT value FROM example");
    expect(committed.all()).toEqual([{ value: 1 }]);
    reopened.close();
    rmSync(path);
    expect(existsSync(path)).toBe(false);
  } finally { reopened?.close(); first.close(); second.close(); storage.cleanup(); }
});

it("closes discarded statements under collection pressure and releases files immediately", async () => {
  const storage = createOwnedTestDirectory("memory-owner-pressure-");
  try {
    for (let iteration = 0; iteration < 20; iteration++) {
      const path = join(storage.dir, `database-${iteration}.db`), db = new OwnedDatabase(path, { create: true });
      try {
        for (let index = 0; index < 500; index++) {
          db.prepare("SELECT 1 AS value").get();
          if (index % 100 === 0) { await setImmediate(); Bun.gc(false); }
        }
        await setImmediate(); Bun.gc(false);
        db.close();
        rmSync(path);
        expect(existsSync(path)).toBe(false);
      } finally { db.close(); }
    }
  } finally { storage.cleanup(); }
});

it("runs bounded stats work through the owning connection and closes it immediately", async () => {
  const storage = createOwnedTestDirectory("memory-owner-stats-"), path = join(storage.dir, "database.db");
  const db = new OwnedDatabase(path, { create: true });
  try {
    db.exec("CREATE TABLE sessions(id TEXT, project_name TEXT); CREATE TABLE messages_meta(id TEXT, session_id TEXT); CREATE TABLE tool_uses(id TEXT);");
    const service = new SqliteStatsService(db);
    for (let iteration = 0; iteration < 100; iteration++) {
      const stats = await service.getStats();
      expect(stats.totalSessions).toBe(0);
      expect(stats.databaseSizeBytes).toBeGreaterThan(0);
    }
    db.close(); rmSync(path);
    expect(existsSync(path)).toBe(false);
  } finally { db.close(); storage.cleanup(); }
});
