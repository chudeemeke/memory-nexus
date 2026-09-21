import { describe, expect, it, spyOn } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { SqliteMessageRepository } from "../../../../src/infrastructure/database/repositories/message-repository.js";
import { SqliteEntityRepository } from "../../../../src/infrastructure/database/repositories/entity-repository.js";
import { SqliteSessionRepository } from "../../../../src/infrastructure/database/repositories/session-repository.js";
import { Message } from "../../../../src/domain/entities/message.js";
import { Entity } from "../../../../src/domain/entities/entity.js";
import { Session } from "../../../../src/domain/entities/session.js";
import { ProjectPath } from "../../../../src/domain/value-objects/project-path.js";
import { extractEntitiesFromSession } from "../../../../src/infrastructure/hooks/hook-runner.js";
import { LlmExtractor } from "../../../../src/application/services/llm-extractor.js";

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
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    await run(db, count => {
      expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}
const timestamp = new Date("2026-01-01T00:00:00Z");
const project = ProjectPath.fromDecoded("C:/Projects/synthetic");
function message(id = "one"): Message {
  return Message.create({ id, role: "assistant", content: "synthetic searchable memory", timestamp, toolUseIds: ["tool"] });
}
function entity(name = "one", confidence = 0.5): Entity {
  return Entity.create({ type: "concept", name, confidence, metadata: { category: "synthetic" } });
}
function session(id = "one"): Session {
  return Session.create({ id, projectPath: project, startTime: timestamp });
}

describe("core repository statement lifetime", () => {
  it("releases message operations and reuses batch statements across chunks", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteMessageRepository(db); released(0);
        await repo.save(message(), "session"); released(1);
        expect((await repo.findById("one"))?.toolUses).toEqual(["tool"]); released(1);
        expect(await repo.findById("missing")).toBeNull(); released(1);
        expect(await repo.findBySession("session")).toHaveLength(1); released(1);
      }
      const repo = new SqliteMessageRepository(db); released(0);
      const entries = Array.from({ length: 205 }, (_, index) => ({ message: message(`batch-${index}`), sessionId: "session" }));
      const progress: number[] = [];
      expect(await repo.saveMany(entries, { onProgress: value => { progress.push(value.inserted); } })).toEqual({ inserted: 205, skipped: 0, errors: [] }); released(2);
      expect(progress).toEqual([100, 200, 205]);
      expect(await repo.saveMany(entries)).toEqual({ inserted: 0, skipped: 205, errors: [] }); released(2);
      expect(await repo.saveMany([])).toEqual({ inserted: 0, skipped: 0, errors: [] }); released(2);
    });
  });

  it("releases entity operations and reuses three statements per batch", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteEntityRepository(db); released(0);
        const first = await repo.save(entity()); released(3);
        const higher = await repo.save(entity("ONE", 0.9)); released(3);
        expect(higher.id).toBe(first.id); expect(higher.confidence).toBe(0.9);
        const saved = await repo.saveMany([entity(), entity(`two-${iteration}`)]); released(3);
        expect(saved[0]?.id).toBe(first.id); expect(saved[1]?.id).toBeGreaterThan(first.id!);
        expect((await repo.findById(first.id!))?.confidence).toBe(0.9); released(1);
        expect(await repo.findById(-1)).toBeNull(); released(1);
        expect((await repo.findByName("concept", " ONE "))?.id).toBe(first.id); released(1);
        expect(await repo.findByName("concept", "missing")).toBeNull(); released(1);
        await repo.linkToSession(first.id!, "session"); released(1);
        expect(await repo.findBySession("session")).toHaveLength(1); released(1);
        await repo.linkEntities(first.id!, saved[1]!.id!, "related"); released(1);
        expect(await repo.findByType("concept", { minConfidence: 0.8, limit: 1 })).toHaveLength(1); released(1);
        expect(await repo.saveMany([])).toEqual([]); released(0);
      }
    });
  });

  it("releases session reads, writes, filters, summary search and purge", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const repo = new SqliteSessionRepository(db); released(0);
        await repo.save(session()); released(1);
        await repo.saveMany([session(), session("two")]); released(1);
        expect((await repo.findById("one"))?.id).toBe("one"); released(1);
        expect(await repo.findById("missing")).toBeNull(); released(1);
        expect(await repo.findByProject(project)).toHaveLength(2); released(1);
        expect(await repo.findRecent(1)).toHaveLength(1); released(1);
        await repo.updateSummary("one", "synthetic searchable summary"); released(1);
        expect(await repo.searchSummaries("searchable")).toHaveLength(1); released(1);
        expect(await repo.searchSummaries("")).toEqual([]); released(0);
        expect(await repo.updateProjectName(project.encoded, "renamed")).toBe(2); released(1);
        expect(await repo.updateProjectName("missing", "renamed")).toBe(0); released(1);
        expect(await repo.findDistinctEncodedPaths()).toContain(project.encoded); released(1);
        expect(await repo.findFiltered({ projectFilter: "renamed", sinceDate: timestamp, beforeDate: timestamp, limit: 2 })).toHaveLength(2); released(1);
        db.exec("UPDATE sessions SET updated_at = '2025-01-01T00:00:00.000Z' WHERE id IN ('one', 'two')");
        expect(await repo.findOlderThan(timestamp)).toHaveLength(2); released(1);
        expect(await repo.countOlderThan(timestamp)).toBe(2); released(1);
        expect(await repo.deleteOlderThan(timestamp)).toBe(2); released(1);
        await repo.delete("missing"); released(1);
        await repo.saveMany([]); released(1);
      }
    });
  });

  it("stops message writes after transaction rollback and supports retry", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMessageRepository(db); released(0);
      const entries = Array.from({ length: 103 }, (_, index) => ({ message: message(`rollback-${index}`), sessionId: "session" }));
      db.exec(`CREATE TRIGGER rollback_message BEFORE INSERT ON messages_meta WHEN NEW.id = 'rollback-101'
        BEGIN SELECT RAISE(ROLLBACK, 'synthetic rollback'); END;`);
      const progress: number[] = [];
      await expect(repo.saveMany(entries, { onProgress: value => { progress.push(value.inserted); } })).rejects.toThrow(); released(2);
      expect(progress).toEqual([100]);
      expect(await repo.findById("rollback-100")).toBeNull(); released(1);
      expect(await repo.findById("rollback-102")).toBeNull(); released(1);
      expect(await repo.findBySession("session")).toHaveLength(100); released(1);
      db.exec("DROP TRIGGER rollback_message");
      expect(await repo.saveMany(entries)).toEqual({ inserted: 3, skipped: 100, errors: [] }); released(2);
    });
  });

  it("counts only actual message inserts despite ignored rows and FTS triggers", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMessageRepository(db); released(0);
      db.exec(`CREATE TRIGGER ignore_message BEFORE INSERT ON messages_meta WHEN NEW.id = 'ignored'
        BEGIN SELECT RAISE(IGNORE); END;`);
      expect(await repo.saveMany([
        { message: message(), sessionId: "session" },
        { message: message("ignored"), sessionId: "session" },
      ])).toEqual({ inserted: 1, skipped: 1, errors: [] }); released(2);
      expect(await repo.findById("ignored")).toBeNull(); released(1);
      {
        using search = db.prepare("SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH 'searchable'");
        expect(search.get()).toEqual({ count: 1 });
      } released(1);
    });
  });

  it("reports actual session update and cascade-delete counts when a row is ignored", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteSessionRepository(db); released(0);
      await repo.saveMany([session(), session("two")]); released(1);
      db.exec(`CREATE TRIGGER ignore_name BEFORE UPDATE OF project_name ON sessions WHEN OLD.id = 'one'
        BEGIN SELECT RAISE(IGNORE); END;
        CREATE TRIGGER ignore_delete BEFORE DELETE ON sessions WHEN OLD.id = 'one'
        BEGIN SELECT RAISE(IGNORE); END;`);
      expect(await repo.updateProjectName(project.encoded, "renamed")).toBe(1); released(1);
      const messages = new SqliteMessageRepository(db); released(0);
      await messages.save(message(), "two"); released(1);
      await repo.updateSummary("two", "searchable synthetic summary"); released(1);
      db.exec("UPDATE sessions SET updated_at = '2025-01-01T00:00:00.000Z' WHERE id IN ('one', 'two')");
      expect(await repo.deleteOlderThan(timestamp)).toBe(1); released(1);
      expect(await repo.findById("one")).not.toBeNull(); released(1);
      expect(await repo.findById("two")).toBeNull(); released(1);
      expect(await messages.findById("one")).toBeNull(); released(1);
      expect(await repo.searchSummaries("searchable")).toEqual([]); released(1);
    });
  });

  it("rejects an ignored entity write and rolls back earlier batch updates", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteEntityRepository(db); released(0);
      await repo.save(entity()); released(3);
      db.exec(`CREATE TRIGGER ignore_entity BEFORE INSERT ON entities WHEN NEW.name = 'ignored'
        BEGIN SELECT RAISE(IGNORE); END;`);
      await expect(repo.save(entity("ignored"))).rejects.toThrow("Entity insert was not applied"); released(3);
      await expect(repo.saveMany([entity("one", 0.9), entity("ignored")])).rejects.toThrow("Entity insert was not applied"); released(3);
      expect((await repo.findByName("concept", "one"))?.confidence).toBe(0.5); released(1);
      expect(await repo.findByName("concept", "ignored")).toBeNull(); released(1);
      db.exec(`DROP TRIGGER ignore_entity;
        CREATE TRIGGER ignore_confidence BEFORE UPDATE OF confidence ON entities
        BEGIN SELECT RAISE(IGNORE); END;`);
      await expect(repo.save(entity("one", 0.9))).rejects.toThrow("Entity confidence update was not applied"); released(3);
      await expect(repo.saveMany([entity("new"), entity("one", 0.9)])).rejects.toThrow("Entity confidence update was not applied"); released(3);
      expect(await repo.findByName("concept", "new")).toBeNull(); released(1);
      db.exec("DROP TRIGGER ignore_confidence");
      expect(await repo.saveMany([entity("one", 0.9), entity("ignored")])).toHaveLength(2); released(3);
    });
  });

  it("binds entity limits as values instead of accepting SQL fragments", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteEntityRepository(db); released(0);
      await repo.saveMany([entity(), entity("two")]); released(3);
      await expect(repo.findByType("concept", { limit: "1 OFFSET 1" as unknown as number })).rejects.toThrow(); released(1);
      expect(await repo.findByType("concept", { limit: 1 })).toHaveLength(1); released(1);
    });
  });

  it("releases message statements after row errors, decoding errors and progress failure", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteMessageRepository(db); released(0);
      await expect(repo.save(message(), "missing")).rejects.toThrow("FOREIGN KEY"); released(1);
      const invalid = Message.create({ id: "invalid", role: "user", content: "synthetic", timestamp: new Date(NaN) });
      const result = await repo.saveMany([
        { message: message(), sessionId: "session" },
        { message: message("bad"), sessionId: "missing" },
        { message: invalid, sessionId: "session" },
      ], {}); released(2);
      expect(result.inserted).toBe(1); expect(result.skipped).toBe(2);
      expect(result.errors.map(error => error.id)).toEqual(["bad", "invalid"]);
      expect(result.errors[0]?.reason).toContain("FOREIGN KEY");
      db.exec("UPDATE messages_meta SET tool_use_ids = 'invalid json' WHERE id = 'one'");
      await expect(repo.findById("one")).rejects.toThrow(); released(1);
      await expect(repo.findBySession("session")).rejects.toThrow(); released(1);
      db.exec("UPDATE messages_meta SET tool_use_ids = NULL WHERE id = 'one'");
      const entries = Array.from({ length: 101 }, (_, index) => ({ message: message(`progress-${index}`), sessionId: "session" }));
      await expect(repo.saveMany(entries, { onProgress: () => { throw new Error("synthetic progress failure"); } })).rejects.toThrow("synthetic progress failure"); released(2);
      expect(await repo.findBySession("session")).toHaveLength(101); released(1);
      expect(await repo.findById("progress-100")).toBeNull(); released(1);
      expect(await repo.saveMany(entries)).toEqual({ inserted: 1, skipped: 100, errors: [] }); released(2);
    });
  });

  it("releases earlier statements when later message/entity batch preparation fails", async () => {
    await withFixture(async (db, released) => {
      const messages = new SqliteMessageRepository(db), entities = new SqliteEntityRepository(db); released(0);
      const prepare = db.prepare.bind(db);
      let failAt = 2, calls = 0;
      db.prepare = ((...args: Parameters<typeof db.prepare>) => {
        if (++calls === failAt) return prepare("INVALID SYNTHETIC SQL");
        return Reflect.apply(prepare, db, args);
      }) as typeof db.prepare;
      try {
        await expect(messages.saveMany([{ message: message(), sessionId: "session" }])).rejects.toThrow(); released(1);
        failAt = 3; calls = 0;
        await expect(entities.saveMany([entity()])).rejects.toThrow(); released(2);
      } finally { db.prepare = prepare; }
      expect(await messages.findById("one")).toBeNull(); released(1);
      expect(await entities.findByName("concept", "one")).toBeNull(); released(1);
      expect(await messages.saveMany([{ message: message(), sessionId: "session" }])).toEqual({ inserted: 1, skipped: 0, errors: [] }); released(2);
      expect(await entities.saveMany([entity()])).toHaveLength(1); released(3);
    });
  });

  it("rolls back rejected entity batches and releases invalid-row reads and failed links", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteEntityRepository(db); released(0);
      const saved = await repo.save(entity()); released(3);
      db.exec(`CREATE TRIGGER reject_entity BEFORE INSERT ON entities WHEN NEW.name = 'bad'
        BEGIN SELECT RAISE(ABORT, 'synthetic entity rejection'); END;`);
      await expect(repo.save(entity("bad"))).rejects.toThrow("synthetic entity rejection"); released(3);
      await expect(repo.saveMany([entity("one", 0.9), entity("bad")])).rejects.toThrow("synthetic entity rejection"); released(3);
      expect((await repo.findById(saved.id!))?.confidence).toBe(0.5); released(1);
      await expect(repo.linkToSession(saved.id!, "missing")).rejects.toThrow("FOREIGN KEY"); released(1);
      await expect(repo.linkEntities(saved.id!, -1, "related")).rejects.toThrow("FOREIGN KEY"); released(1);
      await repo.linkToSession(saved.id!, "session"); released(1);
      db.exec("UPDATE entities SET metadata = 'invalid json'");
      await expect(repo.findById(saved.id!)).rejects.toThrow(); released(1);
      await expect(repo.findByName("concept", "one")).rejects.toThrow(); released(1);
      await expect(repo.findBySession("session")).rejects.toThrow(); released(1);
      await expect(repo.findByType("concept")).rejects.toThrow(); released(1);
      db.exec("UPDATE entities SET metadata = NULL; DROP TRIGGER reject_entity");
      expect(await repo.saveMany([entity("one", 0.9), entity("bad")])).toHaveLength(2); released(3);
    });
  });

  it("rolls back rejected session batches and releases failed updates, deletes and decoding", async () => {
    await withFixture(async (db, released) => {
      const repo = new SqliteSessionRepository(db); released(0);
      db.exec(`CREATE TRIGGER reject_session BEFORE INSERT ON sessions WHEN NEW.id = 'two'
        BEGIN SELECT RAISE(ABORT, 'synthetic session rejection'); END;`);
      await expect(repo.save(session("two"))).rejects.toThrow("synthetic session rejection"); released(1);
      await expect(repo.saveMany([session(), session("two")])).rejects.toThrow("synthetic session rejection"); released(1);
      expect(await repo.findById("one")).toBeNull(); released(1);
      db.exec("DROP TRIGGER reject_session");
      await repo.saveMany([session(), session("two")]); released(1);
      await repo.updateSummary("one", "searchable synthetic summary"); released(1);
      db.exec(`UPDATE sessions SET updated_at = '2025-01-01T00:00:00.000Z' WHERE id = 'one';
        CREATE TRIGGER reject_update BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic update rejection'); END;
        CREATE TRIGGER reject_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'synthetic delete rejection'); END;`);
      await expect(repo.updateSummary("one", "changed")).rejects.toThrow("synthetic update rejection"); released(1);
      await expect(repo.updateProjectName(project.encoded, "changed")).rejects.toThrow("synthetic update rejection"); released(1);
      await expect(repo.delete("one")).rejects.toThrow("synthetic delete rejection"); released(1);
      await expect(repo.deleteOlderThan(timestamp)).rejects.toThrow("synthetic delete rejection"); released(1);
      expect((await repo.findById("one"))?.summary).toBe("searchable synthetic summary"); released(1);
      db.exec(`DROP TRIGGER reject_update; DROP TRIGGER reject_delete;
        UPDATE sessions SET project_path_decoded = '' WHERE id = 'one';`);
      await expect(repo.findById("one")).rejects.toThrow(); released(1);
      await expect(repo.findByProject(project)).rejects.toThrow(); released(1);
      await expect(repo.findRecent(100)).rejects.toThrow(); released(1);
      await expect(repo.findOlderThan(timestamp)).rejects.toThrow(); released(1);
      await expect(repo.findFiltered({})).rejects.toThrow(); released(1);
      await expect(repo.searchSummaries("searchable")).rejects.toThrow(); released(1);
      await expect(repo.countOlderThan(new Date(NaN))).rejects.toThrow(); released(1);
      await expect(repo.deleteOlderThan(new Date(NaN))).rejects.toThrow(); released(1);
      await repo.delete("one"); released(1);
      expect(await repo.findById("one")).toBeNull(); released(1);
    });
  });

  it("bounds native statements when the exported extraction helper reconstructs repositories", async () => {
    await withFixture(async (db, released) => {
      await new SqliteMessageRepository(db).save(message(), "session"); released(1);
      // Replace only the inference boundary; the helper and SQLite adapters are real.
      const inference = spyOn(LlmExtractor, "extract").mockResolvedValue({ topics: [entity()], terms: [], decisions: [], summary: "synthetic" });
      try {
        for (let iteration = 0; iteration < 10; iteration++) {
          expect(await extractEntitiesFromSession("session", db)).toEqual({ success: true, entitiesExtracted: 1, summary: "synthetic" }); released(5);
        }
        {
          using frequency = db.prepare("SELECT frequency FROM session_entities WHERE session_id = 'session'");
          expect(frequency.get()).toEqual({ frequency: 10 });
        } released(1);
        db.exec(`CREATE TRIGGER reject_link BEFORE INSERT ON session_entities
          BEGIN SELECT RAISE(ABORT, 'synthetic link rejection'); END;`);
        expect(await extractEntitiesFromSession("session", db)).toEqual({ success: false, entitiesExtracted: 0, error: "synthetic link rejection" }); released(5);
      } finally { inference.mockRestore(); }
    });
  });
});
