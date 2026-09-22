import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createOwnedTestDirectory } from "../../helpers/owned-test-directory.js";
import { OwnedDatabase } from "../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../src/infrastructure/database/schema.js";
import { loadSqliteVecExtension } from "../../../src/infrastructure/database/connection.js";
import { exportToJson, importFromJson, hasExistingData, type ExportData } from "../../../src/application/services/export-service.js";
import { PatternRedactor } from "../../../src/infrastructure/security/pattern-redactor.js";

const timestamp = "2026-01-01T00:00:00Z";
function data(): ExportData {
  return {
    version: "1.0", exportedAt: timestamp,
    stats: { sessions: 1, messages: 1, toolUses: 1, entities: 2, links: 1, sessionEntities: 1, entityLinks: 1, extractionStates: 1, facts: 1 },
    sessions: [{ id: "session", projectPathEncoded: "synthetic", projectPathDecoded: "/synthetic", projectName: "Synthetic", startTime: timestamp, endTime: null, messageCount: 1, summary: "summaryneedle" }],
    messages: [{ id: "message", sessionId: "session", role: "user", content: "messageneedle", timestamp, toolUseIds: null }],
    toolUses: [{ id: "tool", sessionId: "session", name: "Read", input: "{}", timestamp, status: "success", result: null }],
    entities: [{ id: 1, type: "concept", name: "one", metadata: null, confidence: 1 }, { id: 2, type: "concept", name: "two", metadata: null, confidence: 1 }],
    links: [{ sourceType: "session", sourceId: "session", targetType: "topic", targetId: "synthetic", relationship: "mentions", weight: 1 }],
    sessionEntities: [{ sessionId: "session", entityId: 1, frequency: 1 }],
    entityLinks: [{ sourceId: 1, targetId: 2, relationship: "related", weight: 1 }],
    extractionStates: [{ id: "state", sessionPath: "/synthetic/log", startedAt: timestamp, status: "complete", completedAt: timestamp, messagesExtracted: 1, errorMessage: null, fileMtime: null, fileSize: null }],
    facts: [{ uuid: "fact", type: "learning", project: "synthetic", content: "factneedle", metadata: null, observedAt: timestamp, supersededAt: null, supersededBy: null }],
  };
}
async function withFixture(run: (db: OwnedDatabase, path: string, released: (count?: number) => void) => Promise<void>, vectorEnabled = false): Promise<void> {
  const storage = createOwnedTestDirectory("memory-export-lifecycle-");
  const db = new OwnedDatabase(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    if (vectorEnabled) expect(loadSqliteVecExtension(db)).toBe(true);
    createSchema(db, { sqliteVecAvailable: vectorEnabled }); db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    await run(db, join(storage.dir, "export.json"), count => {
      if (count === undefined) expect(statements.length).toBeGreaterThan(0);
      else expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); storage.cleanup(); }
}
function all(db: OwnedDatabase, sql: string): unknown[] { using statement = db.prepare(sql); return statement.all(); }
function snapshot(db: OwnedDatabase): unknown[] {
  return ["sessions", "messages_meta", "tool_uses", "entities", "links", "session_entities", "entity_links", "extraction_state", "facts", "sessions_fts"].map(table => all(db, `SELECT * FROM ${table} ORDER BY rowid`));
}
const inserted = { sessions: 1, messages: 1, toolUses: 1, entities: 2, links: 1, facts: 1 };
const empty = { sessions: 0, messages: 0, toolUses: 0, entities: 0, links: 0, facts: 0 };

describe("export/import lifetime and native replacement integrity", () => {
  it("invalidates old embeddings on replacement and restores them on failed replacement", async () => {
    await withFixture(async (db, path, released) => {
      for (const foreignKeys of [1, 0]) {
        db.exec(`PRAGMA foreign_keys = ${foreignKeys}`);
        writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path);
        db.exec(`INSERT INTO message_embeddings (rowid, embedding) VALUES (1, zeroblob(1536));
          INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (1, 'synthetic', 'synthetic', 'synthetic');
          INSERT INTO embedding_skips (message_id, model_hash, model_name, provider, reason, retryable, content_hash, content_bytes, skipped_at)
          VALUES (1, 'synthetic', 'synthetic', 'synthetic', 'payload_too_large', 0, 'synthetic', 1, 'synthetic');`);
        const before = all(db, "SELECT rowid, embedding FROM message_embeddings"); released();
        db.exec("CREATE TRIGGER reject_vector_restore BEFORE INSERT ON facts BEGIN SELECT RAISE(ABORT, 'synthetic restore failure'); END");
        await expect(importFromJson(db, path, { clearExisting: true })).rejects.toThrow("synthetic restore failure");
        expect(all(db, "SELECT rowid, embedding FROM message_embeddings")).toEqual(before);
        expect(all(db, "SELECT * FROM embedding_state")).toHaveLength(1);
        expect(all(db, "SELECT * FROM embedding_skips")).toHaveLength(1); released();
        db.exec("DROP TRIGGER reject_vector_restore");
        await importFromJson(db, path, { clearExisting: true });
        expect(all(db, "SELECT rowid FROM message_embeddings")).toEqual([]);
        expect(all(db, "SELECT * FROM embedding_state")).toEqual([]);
        expect(all(db, "SELECT * FROM embedding_skips")).toEqual([]); released();
      }
    }, true);
  });

  it("releases repeated imports, exports and existence reads with complete round trips", async () => {
    await withFixture(async (db, path, released) => {
      expect(hasExistingData(db)).toBe(false); released(1);
      for (let iteration = 0; iteration < 10; iteration++) {
        writeFileSync(path, JSON.stringify(data()));
        expect(await importFromJson(db, path, { clearExisting: true })).toEqual(inserted); released(10);
        expect(hasExistingData(db)).toBe(true); released(1);
        const stats = await exportToJson(db, path); expect(stats.sessions).toBe(1); released(9);
        const exported = await Bun.file(path).json() as ExportData;
        expect({ ...exported, exportedAt: timestamp }).toEqual(data());
        expect(all(db, "SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH 'summaryneedle'")).toEqual([{ session_id: "session" }]);
        expect(all(db, "SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'messageneedle'")).toHaveLength(1); released(2);
      }
    });
  });

  it("counts actual inserts when records repeat or a native trigger ignores a write", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data()));
      expect(await importFromJson(db, path)).toEqual(inserted); released(9);
      expect(await importFromJson(db, path)).toEqual(empty); released(9);
      db.exec("CREATE TRIGGER ignore_fact BEFORE INSERT ON facts BEGIN SELECT RAISE(IGNORE); END");
      expect(await importFromJson(db, path, { clearExisting: true })).toEqual({ ...inserted, facts: 0 }); released(10);
      expect(all(db, "SELECT * FROM facts")).toEqual([]); released(1);
    });
  });

  it("rolls replacement back on a later import failure and permits retry", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path);
      const before = snapshot(db); released();
      db.exec("CREATE TRIGGER reject_fact BEFORE INSERT ON facts BEGIN SELECT RAISE(ABORT, 'synthetic late import failure'); END");
      await expect(importFromJson(db, path, { clearExisting: true })).rejects.toThrow("synthetic late import failure"); released(10);
      expect(snapshot(db)).toEqual(before); expect(db.inTransaction).toBe(false); released();
      expect(all(db, "SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'messageneedle'")).toHaveLength(1); released(1);
      db.exec("DROP TRIGGER reject_fact"); expect(await importFromJson(db, path, { clearExisting: true })).toEqual(inserted); released(10);
    });
  });

  it("rolls back a partial clear without changing the caller foreign-key setting", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path);
      const before = snapshot(db); released();
      db.exec("CREATE TRIGGER reject_clear BEFORE DELETE ON entities BEGIN SELECT RAISE(ABORT, 'synthetic clear failure'); END");
      await expect(importFromJson(db, path, { clearExisting: true })).rejects.toThrow("synthetic clear failure"); released(1);
      expect(snapshot(db)).toEqual(before); expect(all(db, "PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]); released();
      db.exec("DROP TRIGGER reject_clear; PRAGMA foreign_keys = OFF");
      expect(await importFromJson(db, path, { clearExisting: true })).toEqual(inserted); released(10);
      expect(all(db, "PRAGMA foreign_keys")).toEqual([{ foreign_keys: 0 }]); released(1);
    });
  });

  it("rejects invalid row constraints instead of silently omitting imported data", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path);
      const before = snapshot(db), invalid = data(); released();
      invalid.entities[0]!.confidence = 2; writeFileSync(path, JSON.stringify(invalid));
      await expect(importFromJson(db, path, { clearExisting: true })).rejects.toThrow("CHECK constraint failed"); released(5);
      expect(snapshot(db)).toEqual(before); released();
    });
  });

  it("releases earlier import/export statements when later preparation fails", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path);
      const before = snapshot(db); released();
      const prepare = db.prepare.bind(db); let calls = 0;
      db.prepare = ((...args: Parameters<typeof db.prepare>) => {
        if (++calls === 3) return prepare("INVALID SYNTHETIC SQL");
        return Reflect.apply(prepare, db, args);
      }) as typeof db.prepare;
      try {
        await expect(importFromJson(db, path, { clearExisting: true })).rejects.toThrow(); released(2);
        calls = 0; await expect(exportToJson(db, path)).rejects.toThrow(); released(2);
      } finally { db.prepare = prepare; }
      expect(snapshot(db)).toEqual(before); released();
    });
  });

  it("releases export statements after redaction and output failures", async () => {
    await withFixture(async (db, path, released) => {
      writeFileSync(path, JSON.stringify(data())); await importFromJson(db, path); released(9);
      const redactor = new PatternRedactor();
      redactor.redactText = () => { throw new Error("synthetic redactor failure"); };
      await expect(exportToJson(db, path, { redactor })).rejects.toThrow("synthetic redactor failure"); released(1);
      await expect(exportToJson(db, join(path, "child.json"))).rejects.toThrow(); released(9);
      expect(await exportToJson(db, path)).toMatchObject({ sessions: 1, messages: 1, facts: 1 }); released(9);
    });
  });
});
