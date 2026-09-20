import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteBackfillStateRepository } from "../../../../src/infrastructure/database/repositories/backfill-state-repository.js";
import { BackfillState } from "../../../../src/domain/entities/backfill-state.js";
import { SqliteExtractionLogRepository } from "../../../../src/infrastructure/database/repositories/extraction-log-repository.js";
import type { ExtractionLogEntry } from "../../../../src/domain/ports/repositories.js";
import { SqliteMemoryUtilityRepository } from "../../../../src/infrastructure/database/repositories/memory-utility-repository.js";
import { MemoryUtilityMetric } from "../../../../src/domain/entities/memory-utility-metric.js";

function fixture() {
  const db = new OwnedDatabase(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  createSchema(db);
  db.finalizeStatements();
  const statements: Statement[] = [], prepare = db.prepare.bind(db);
  db.prepare = ((...args: Parameters<typeof db.prepare>) => {
    const statement = Reflect.apply(prepare, db, args) as Statement;
    statements.push(statement);
    return statement;
  }) as typeof db.prepare;
  return { db, released() {
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
    statements.length = 0;
  } };
}

const timestamp = new Date("2026-01-01T00:00:00Z");
const backfill = BackfillState.create({ sessionId: "session", backfilledAt: timestamp, dailyLogPath: "synthetic.md", success: true });
const extraction: ExtractionLogEntry = { sessionId: "session", mode: "sync", factsAdded: 1, factsUpdated: 2, factsSuperseded: 3, factsSkipped: 4, provider: "synthetic", model: "synthetic", tokensConsumed: 5, extractedAt: timestamp };
const metric = MemoryUtilityMetric.create({ surface: "fact", targetId: "target", project: "project", metadata: { tag: "synthetic" }, pinned: true, lastRankedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });

describe("record repository statement lifetime", () => {
  it("bounds backfill statements across repeated repository construction and operations", async () => {
    const owned = fixture();
    try {
      for (let iteration = 0; iteration < 20; iteration++) {
        const repo = new SqliteBackfillStateRepository(owned.db);
        await repo.save(backfill); owned.released();
        expect((await repo.findBySessionId("session"))?.dailyLogPath).toBe("synthetic.md"); owned.released();
        expect((await repo.findAll()).length).toBe(1); owned.released();
        expect(await repo.countByStatus()).toEqual({ total: 1, succeeded: 1, failed: 0 }); owned.released();
        expect(await repo.findBySessionId("missing")).toBeNull(); owned.released();
      }
    } finally { owned.db.close(); }
  });

  it("releases backfill statements after native write and stored-data validation failures", async () => {
    const owned = fixture(), repo = new SqliteBackfillStateRepository(owned.db);
    try {
      owned.db.exec("CREATE TRIGGER reject_backfill BEFORE INSERT ON backfill_state BEGIN SELECT RAISE(ABORT, 'synthetic write rejection'); END");
      await expect(repo.save(backfill)).rejects.toThrow("synthetic write rejection"); owned.released();
      expect(await repo.findBySessionId("session")).toBeNull(); owned.released();
      owned.db.exec("DROP TRIGGER reject_backfill");
      await repo.save(backfill); owned.released();
      owned.db.exec("UPDATE backfill_state SET daily_log_path = ''");
      await expect(repo.findBySessionId("session")).rejects.toThrow("Daily log path cannot be empty"); owned.released();
      await expect(repo.findAll()).rejects.toThrow("Daily log path cannot be empty"); owned.released();
    } finally { owned.db.close(); }
  });

  it("bounds extraction log statements across repeated construction and preserves upsert/clear behavior", async () => {
    const owned = fixture();
    try {
      for (let iteration = 0; iteration < 20; iteration++) {
        const repo = new SqliteExtractionLogRepository(owned.db);
        const entry = { ...extraction, factsAdded: iteration };
        await repo.save(entry); owned.released();
        expect(await repo.findById("session")).toEqual(entry); owned.released();
        expect(await repo.findAll()).toEqual([entry]); owned.released();
        expect(await repo.findById("missing")).toBeNull(); owned.released();
      }
      const repo = new SqliteExtractionLogRepository(owned.db);
      await repo.clearAll();
      expect(await repo.findAll()).toEqual([]); owned.released();
    } finally { owned.db.close(); }
  });

  it("releases extraction log statements after write and read execution failures", async () => {
    const owned = fixture(), repo = new SqliteExtractionLogRepository(owned.db);
    try {
      owned.db.exec("CREATE TRIGGER reject_extraction BEFORE INSERT ON extraction_log BEGIN SELECT RAISE(ABORT, 'synthetic write rejection'); END");
      await expect(repo.save(extraction)).rejects.toThrow("synthetic write rejection"); owned.released();
      expect(await repo.findById("session")).toBeNull(); owned.released();
      owned.db.exec("DROP TRIGGER reject_extraction");
      await repo.save(extraction); owned.released();
      owned.db.exec("ALTER TABLE extraction_log RENAME TO stored_extraction_log; CREATE VIEW extraction_log AS SELECT *, json_extract('broken', '$') AS injected_failure FROM stored_extraction_log");
      await expect(repo.findById("session")).rejects.toThrow("malformed JSON"); owned.released();
      await expect(repo.findAll()).rejects.toThrow("malformed JSON"); owned.released();
    } finally { owned.db.close(); }
  });

  it("bounds utility statements while preserving access increments, filtering and deletion", async () => {
    const owned = fixture();
    try {
      const initial = new SqliteMemoryUtilityRepository(owned.db);
      const saved = await initial.save(metric);
      expect(saved.metadata).toEqual({ tag: "synthetic" });
      expect(saved.pinned).toBe(true);
      expect(saved.lastRankedAt).toEqual(timestamp); owned.released();
      for (let iteration = 0; iteration < 20; iteration++) {
        const repo = new SqliteMemoryUtilityRepository(owned.db);
        expect((await repo.recordAccess("fact", "target", timestamp)).accessCount).toBe(iteration + 1); owned.released();
        expect((await repo.findByTarget("fact", "target"))?.accessCount).toBe(iteration + 1); owned.released();
        expect((await repo.findByTargetIds("fact", ["missing", "target"])).map(row => row.targetId)).toEqual(["target"]); owned.released();
        expect(await repo.findByTargetIds("fact", [])).toEqual([]);
      }
      expect((await initial.recordAccess("fact", "other", timestamp)).accessCount).toBe(1); owned.released();
      await initial.deleteByProject("project"); owned.released();
      expect(await initial.findByTarget("fact", "target")).toBeNull(); owned.released();
      expect((await initial.findByTarget("fact", "other"))?.accessCount).toBe(1); owned.released();
      await initial.clearAll(); owned.released();
      expect(await initial.findByTargetIds("fact", ["other"])).toEqual([]); owned.released();
    } finally { owned.db.close(); }
  });

  it("releases utility writes and deletes after SQLite rejection without altering stored data", async () => {
    const owned = fixture(), repo = new SqliteMemoryUtilityRepository(owned.db);
    try {
      await repo.save(metric); owned.released();
      owned.db.exec("CREATE TRIGGER reject_utility_write BEFORE INSERT ON memory_utility_metrics BEGIN SELECT RAISE(ABORT, 'synthetic write rejection'); END; CREATE TRIGGER reject_utility_delete BEFORE DELETE ON memory_utility_metrics BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END");
      await expect(repo.save(metric.recordAccess(timestamp))).rejects.toThrow("synthetic write rejection"); owned.released();
      expect((await repo.findByTarget("fact", "target"))?.accessCount).toBe(0); owned.released();
      await expect(repo.deleteByProject("project")).rejects.toThrow("synthetic delete rejection"); owned.released();
      await expect(repo.clearAll()).rejects.toThrow("synthetic delete rejection"); owned.released();
      expect((await repo.findByTarget("fact", "target"))?.metadata).toEqual({ tag: "synthetic" }); owned.released();
    } finally { owned.db.close(); }
  });

  it("releases utility read and outer save statements when stored metadata cannot be decoded", async () => {
    const owned = fixture(), repo = new SqliteMemoryUtilityRepository(owned.db);
    try {
      owned.db.exec("CREATE TRIGGER corrupt_metadata AFTER INSERT ON memory_utility_metrics BEGIN UPDATE memory_utility_metrics SET metadata = '{broken' WHERE id = NEW.id; END");
      await expect(repo.save(metric)).rejects.toBeInstanceOf(SyntaxError); owned.released();
      await expect(repo.findByTarget("fact", "target")).rejects.toBeInstanceOf(SyntaxError); owned.released();
      await expect(repo.findByTargetIds("fact", ["target"])).rejects.toBeInstanceOf(SyntaxError); owned.released();
    } finally { owned.db.close(); }
  });

  it("does not report a saved utility metric when SQLite no longer contains the row", async () => {
    const owned = fixture(), repo = new SqliteMemoryUtilityRepository(owned.db);
    try {
      owned.db.exec("CREATE TRIGGER remove_metric AFTER INSERT ON memory_utility_metrics BEGIN DELETE FROM memory_utility_metrics WHERE id = NEW.id; END");
      await expect(repo.save(metric)).rejects.toThrow("not present after save"); owned.released();
      expect(await repo.findByTarget("fact", "target")).toBeNull(); owned.released();
    } finally { owned.db.close(); }
  });
});
