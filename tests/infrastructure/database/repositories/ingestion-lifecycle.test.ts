import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteExtractionStateRepository } from "../../../../src/infrastructure/database/repositories/extraction-state-repository.js";
import { SqliteLinkRepository } from "../../../../src/infrastructure/database/repositories/link-repository.js";
import { SqliteToolUseRepository } from "../../../../src/infrastructure/database/repositories/tool-use-repository.js";
import { ExtractionState } from "../../../../src/domain/entities/extraction-state.js";
import { Link } from "../../../../src/domain/entities/link.js";
import { ToolUse } from "../../../../src/domain/entities/tool-use.js";

async function withFixture(run: (db: OwnedDatabase, released: (count: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    createSchema(db);
    db.exec(`PRAGMA foreign_keys = ON;
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
      VALUES ('session', 'synthetic', '/synthetic', 'synthetic', '2026-01-01T00:00:00.000Z');`);
    db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement);
      return statement;
    }) as typeof db.prepare;
    await run(db, count => {
      expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}

const timestamp = new Date("2026-01-01T00:00:00Z");
function state(id = "one"): ExtractionState {
  return ExtractionState.create({ id, sessionPath: `/synthetic/${id}.jsonl`, startedAt: timestamp });
}
function link(sourceId = "one", targetId = "two", weight = 0.5): Link {
  return Link.create({ sourceType: "session", sourceId, targetType: "session", targetId, relationship: "related_to", weight });
}
function tool(id = "one"): ToolUse {
  return ToolUse.create({ id, name: "Read", input: { path: "/synthetic" }, timestamp });
}

describe("ingestion repository statement lifetime", () => {
  it("releases extraction-state reads and writes across repeated owners", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteExtractionStateRepository(db); released(0);
        await repo.save(state()); released(1);
        expect((await repo.findById("one"))?.sessionPath).toBe("/synthetic/one.jsonl"); released(1);
        expect(await repo.findById("missing")).toBeNull(); released(1);
        expect((await repo.findBySessionPath("/synthetic/one.jsonl"))?.id).toBe("one"); released(1);
        expect(await repo.findBySessionPath("/missing")).toBeNull(); released(1);
        expect((await repo.findPending()).map(row => row.id)).toEqual(["one"]); released(1);
      }
    });
  });

  it("releases link reads and writes with one prepared insert per batch", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteLinkRepository(db); released(0);
        await repo.save(link()); released(1);
        await repo.saveMany([link(), link("two", "three")]); released(1);
        expect((await repo.findBySource("session", "one")).map(row => row.targetId)).toEqual(["two"]); released(1);
        expect((await repo.findByTarget("session", "three")).map(row => row.sourceId)).toEqual(["two"]); released(1);
        expect((await repo.findRelated("session", "one")).map(row => row.targetId)).toEqual(["two", "three"]); released(1);
        expect((await repo.findRelatedWithHops("session", "one")).map(row => row.hop)).toEqual([1, 2]); released(1);
        await repo.saveMany([]); released(1);
      }
    });
  });

  it("releases tool-use reads and writes with one prepared insert across batch chunks", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteToolUseRepository(db); released(0);
        await repo.save(tool(), "session"); released(1);
        expect((await repo.findById("one"))?.input).toEqual({ path: "/synthetic" }); released(1);
        expect(await repo.findById("missing")).toBeNull(); released(1);
        expect((await repo.findBySession("session")).map(row => row.id)).toEqual(["one"]); released(1);
      }
      const repo = new SqliteToolUseRepository(db); released(0);
      const progress: number[] = [];
      const entries = Array.from({ length: 205 }, (_, index) => ({ toolUse: tool(`batch-${index}`), sessionId: "session" }));
      expect(await repo.saveMany(entries, { onProgress: value => { progress.push(value.inserted); } })).toEqual({ inserted: 205, skipped: 0, errors: [] }); released(1);
      expect(progress).toEqual([100, 200, 205]);
      expect(await repo.saveMany(entries)).toEqual({ inserted: 0, skipped: 205, errors: [] }); released(1);
      expect(await repo.saveMany([])).toEqual({ inserted: 0, skipped: 0, errors: [] }); released(1);
    });
  });

  it("stops tool-use writes when SQLite rolls back a whole transaction", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteToolUseRepository(db); released(0);
      const entries = Array.from({ length: 103 }, (_, index) => ({ toolUse: tool(`rollback-${index}`), sessionId: "session" }));
      db.exec(`CREATE TRIGGER rollback_tool BEFORE INSERT ON tool_uses WHEN NEW.id = 'rollback-101'
        BEGIN SELECT RAISE(ROLLBACK, 'synthetic transaction rollback'); END;`);
      const progress: number[] = [];
      await expect(repo.saveMany(entries, { onProgress: value => { progress.push(value.inserted); } })).rejects.toThrow(); released(1);
      expect(progress).toEqual([100]);
      expect(await repo.findById("rollback-100")).toBeNull(); released(1);
      expect(await repo.findById("rollback-102")).toBeNull(); released(1);
      expect(await repo.findBySession("session")).toHaveLength(100); released(1);
      db.exec("DROP TRIGGER rollback_tool");
      expect(await repo.saveMany(entries)).toEqual({ inserted: 3, skipped: 100, errors: [] }); released(1);
      expect(await repo.findBySession("session")).toHaveLength(103); released(1);
    });
  });

  it("releases extraction-state statements on rejected writes, invalid dates and invalid stored rows", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteExtractionStateRepository(db); released(0);
      await repo.save(state()); released(1);
      db.exec(`CREATE TRIGGER reject_state BEFORE INSERT ON extraction_state
        BEGIN SELECT RAISE(ABORT, 'synthetic state rejection'); END;`);
      await expect(repo.save(state("other"))).rejects.toThrow("synthetic state rejection"); released(1);
      expect(await repo.findById("other")).toBeNull(); released(1);
      db.exec("DROP TRIGGER reject_state");
      const invalid = ExtractionState.create({ id: "invalid", sessionPath: "/invalid", startedAt: new Date(NaN) });
      await expect(repo.save(invalid)).rejects.toThrow(); released(1);
      db.exec("UPDATE extraction_state SET session_path = '' WHERE id = 'one'");
      await expect(repo.findById("one")).rejects.toThrow("Session path cannot be empty"); released(1);
      await expect(repo.findBySessionPath("")).rejects.toThrow("Session path cannot be empty"); released(1);
      await expect(repo.findPending()).rejects.toThrow("Session path cannot be empty"); released(1);
      await repo.save(state()); released(1);
      expect((await repo.findById("one"))?.sessionPath).toBe("/synthetic/one.jsonl"); released(1);
    });
  });

  it("rolls back failed link batches and releases statements when entity decoding fails", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteLinkRepository(db); released(0);
      await repo.save(link()); released(1);
      db.exec(`CREATE TRIGGER reject_link BEFORE INSERT ON links WHEN NEW.target_id = 'bad'
        BEGIN SELECT RAISE(ABORT, 'synthetic link rejection'); END;`);
      await expect(repo.save(link("one", "bad"))).rejects.toThrow("synthetic link rejection"); released(1);
      await expect(repo.saveMany([link("one", "two", 0.9), link("one", "bad")])).rejects.toThrow("synthetic link rejection"); released(1);
      expect((await repo.findBySource("session", "one")).map(row => row.weight)).toEqual([0.5]); released(1);
      expect(await repo.findByTarget("session", "bad")).toEqual([]); released(1);
      db.exec("DROP TRIGGER reject_link");
      await repo.saveMany([link("one", "two", 0.9), link("one", "bad")]); released(1);
      db.exec("UPDATE links SET target_id = '' WHERE target_id = 'two'");
      await expect(repo.findBySource("session", "one")).rejects.toThrow(); released(1);
      await expect(repo.findByTarget("session", "")).rejects.toThrow(); released(1);
      await expect(repo.findRelatedWithHops("session", "one")).rejects.toThrow(); released(1);
      db.exec("UPDATE links SET target_id = 'two' WHERE target_id = ''");
      await repo.save(link()); released(1);
      expect(await repo.findRelated("session", "one", 1)).toHaveLength(2); released(1);
    });
  });

  it("preserves tool-use row errors and retry while releasing reads and serialization failures", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteToolUseRepository(db); released(0);
      await expect(repo.save(tool(), "missing-session")).rejects.toThrow("FOREIGN KEY"); released(1);
      const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
      const invalid = ToolUse.create({ id: "cyclic", name: "Read", input: cyclic, timestamp });
      await expect(repo.save(invalid, "session")).rejects.toThrow(); released(1);
      const result = await repo.saveMany([
        { toolUse: tool(), sessionId: "session" },
        { toolUse: tool("bad"), sessionId: "missing-session" },
        { toolUse: invalid, sessionId: "session" },
        { toolUse: tool("last"), sessionId: "session" },
      ], {}); released(1);
      expect(result.inserted).toBe(2);
      expect(result.skipped).toBe(2);
      expect(result.errors.map(error => error.id)).toEqual(["bad", "cyclic"]);
      expect(result.errors[0]?.reason).toContain("FOREIGN KEY");
      expect(result.errors[1]?.reason).not.toBe("");
      expect(await repo.findById("bad")).toBeNull(); released(1);
      expect(await repo.findById("cyclic")).toBeNull(); released(1);
      expect(await repo.saveMany([{ toolUse: tool("bad"), sessionId: "session" }])).toEqual({ inserted: 1, skipped: 0, errors: [] }); released(1);
      db.exec("UPDATE tool_uses SET input = 'invalid json' WHERE id = 'one'");
      await expect(repo.findById("one")).rejects.toThrow(); released(1);
      await expect(repo.findBySession("session")).rejects.toThrow(); released(1);
    });
  });

  it("releases the tool-use batch statement when progress reporting fails after commit", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteToolUseRepository(db); released(0);
      const entries = Array.from({ length: 101 }, (_, index) => ({ toolUse: tool(`progress-${index}`), sessionId: "session" }));
      await expect(repo.saveMany(entries, { onProgress: () => { throw new Error("synthetic progress failure"); } })).rejects.toThrow("synthetic progress failure"); released(1);
      expect(await repo.findBySession("session")).toHaveLength(100); released(1);
      expect(await repo.findById("progress-100")).toBeNull(); released(1);
      expect(await repo.saveMany(entries)).toEqual({ inserted: 1, skipped: 100, errors: [] }); released(1);
    });
  });
});
