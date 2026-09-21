import { describe, expect, it } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { loadSqliteVecExtension } from "../../../../src/infrastructure/database/connection.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { EmbeddingRepository } from "../../../../src/infrastructure/database/repositories/embedding-repository.js";

function withFixture(run: (db: OwnedDatabase, repo: EmbeddingRepository, statements: Statement[]) => void): void {
  const db = new OwnedDatabase(":memory:");
  try {
    // A missing extension is a failed compatibility proof, never a silent skip.
    expect(loadSqliteVecExtension(db)).toBe(true);
    createSchema(db, { sqliteVecAvailable: true });
    db.exec(`INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
      VALUES ('session', 'enc', 'dec', 'synthetic', '2026-01-01');
      INSERT INTO messages_meta (id, session_id, role, content, timestamp) VALUES
      ('one', 'session', 'user', 'first synthetic message', '2026-01-01'),
      ('two', 'session', 'user', 'second synthetic message', '2026-01-01');`);
    // Bun 1.3 prepares its cached transaction controls through prepare(); 1.4
    // does not. Initialize those connection-owned controls before measuring
    // repository statements. OwnedDatabase still releases them at close.
    db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement);
      return statement;
    }) as typeof db.prepare;
    run(db, new EmbeddingRepository(db), statements);
  } finally { db.close(); }
}

function released(statements: Statement[], count: number): void {
  expect(statements).toHaveLength(count);
  for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
  statements.length = 0;
}

const vector = (value = 1) => new Float32Array(384).fill(value);

describe("embedding repository statement lifetime", () => {
  it("releases batch statements after success, repeated updates and an empty batch", () => {
    withFixture((db, repo, statements) => {
      for (let iteration = 0; iteration < 20; iteration++) {
        repo.storeBatch([{ rowid: 1, embedding: vector(iteration + 1) }, { rowid: 2, embedding: vector() }], "hash", "synthetic");
        released(statements, 3);
      }
      repo.storeBatch([], "hash", "synthetic");
      released(statements, 3);
      using state = db.prepare("SELECT message_id, model_hash FROM embedding_state ORDER BY message_id");
      expect(state.all()).toEqual([{ message_id: 1, model_hash: "hash" }, { message_id: 2, model_hash: "hash" }]);
    });
  });

  it("rolls back earlier vector updates when a later vector has the wrong dimensions", () => {
    withFixture((db, repo, statements) => {
      repo.storeBatch([{ rowid: 1, embedding: vector() }], "old", "original");
      released(statements, 3);
      expect(() => repo.storeBatch([
        { rowid: 1, embedding: vector(2) },
        { rowid: 2, embedding: new Float32Array(2) },
      ], "new", "replacement")).toThrow();
      released(statements, 3);
      using vectors = db.prepare("SELECT rowid, embedding FROM message_embeddings ORDER BY rowid");
      using state = db.prepare("SELECT message_id, model_hash FROM embedding_state ORDER BY message_id");
      expect(vectors.all()).toEqual([{ rowid: 1, embedding: new Uint8Array(vector().buffer) }]);
      expect(state.all()).toEqual([{ message_id: 1, model_hash: "old" }]);
    });
  });

  it("rolls back both tables on a later state-write failure and permits a clean retry", () => {
    withFixture((db, repo, statements) => {
      db.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON embedding_state
        WHEN NEW.message_id = 2 BEGIN SELECT RAISE(ABORT, 'synthetic state rejection'); END;`);
      const batch = [{ rowid: 1, embedding: vector() }, { rowid: 2, embedding: vector(2) }];
      expect(() => repo.storeBatch(batch, "hash", "synthetic")).toThrow("synthetic state rejection");
      released(statements, 3);
      {
        using vectors = db.prepare("SELECT rowid FROM message_embeddings");
        using state = db.prepare("SELECT message_id FROM embedding_state");
        expect(vectors.all()).toEqual([]);
        expect(state.all()).toEqual([]);
      }
      released(statements, 2);
      db.exec("DROP TRIGGER reject_second");
      repo.storeBatch(batch, "hash", "synthetic");
      released(statements, 3);
      using state = db.prepare("SELECT message_id FROM embedding_state ORDER BY message_id");
      expect(state.all()).toEqual([{ message_id: 1 }, { message_id: 2 }]);
    });
  });

  it("releases already prepared statements when later preparation fails", () => {
    withFixture((db, repo, statements) => {
      db.exec("DROP TABLE embedding_state");
      expect(() => repo.storeBatch([{ rowid: 1, embedding: vector() }], "hash", "synthetic")).toThrow("embedding_state");
      released(statements, 2);
      using vectors = db.prepare("SELECT rowid FROM message_embeddings");
      expect(vectors.all()).toEqual([]);
    });
  });

  it("releases reads including empty results, early returns and vector search failure", () => {
    withFixture((_db, repo, statements) => {
      expect(repo.findUnembedded(10)).toHaveLength(2); released(statements, 1);
      expect(repo.findUnembedded(10, "hash")).toHaveLength(2); released(statements, 1);
      expect(repo.getSkippedCount()).toBe(0); released(statements, 1);
      expect(repo.getSkippedCount("hash")).toBe(0); released(statements, 1);
      expect(repo.getStoredModelHash()).toBeNull(); released(statements, 1);
      expect(repo.getStoredModelName()).toBeNull(); released(statements, 1);
      expect(repo.getEmbeddedCount()).toBe(0); released(statements, 1);
      expect(repo.getTotalMessageCount()).toBe(2); released(statements, 1);
      expect(repo.getStoredEmbeddingDimensions()).toBeNull(); released(statements, 1);
      expect(repo.vectorKnnSearch(vector(), 0)).toEqual([]); released(statements, 0);
      repo.storeBatch([{ rowid: 1, embedding: vector() }], "hash", "synthetic"); released(statements, 3);
      expect(repo.getStoredEmbeddingDimensions()).toBe(384); released(statements, 2);
      expect(repo.vectorKnnSearch(vector(), 1)).toEqual([expect.objectContaining({ rowid: 1 })]); released(statements, 1);
      expect(() => repo.vectorKnnSearch(new Float32Array(2), 1)).toThrow(); released(statements, 1);
    });
  });

  it("releases skip writes on upsert and native write rejection", () => {
    withFixture((db, repo, statements) => {
      const record = { messageId: 2, modelHash: "hash", modelName: "synthetic", provider: "synthetic",
        reason: "payload_too_large" as const, retryable: false, contentHash: "synthetic-hash", contentBytes: 24 };
      repo.markSkipped(record); released(statements, 1);
      const skippedAt = new Date("2026-01-01T00:00:00Z");
      repo.markSkipped({ ...record, contentBytes: 48, skippedAt, retryable: true, safeError: "synthetic detail" }); released(statements, 1);
      {
        using saved = db.prepare("SELECT content_bytes, skipped_at, retryable, safe_error FROM embedding_skips");
        expect(saved.get()).toEqual({ content_bytes: 48, skipped_at: skippedAt.toISOString(), retryable: 1, safe_error: "synthetic detail" });
      }
      released(statements, 1);
      expect(repo.getSkippedCount("hash")).toBe(1); released(statements, 1);
      expect(repo.findUnembedded(10, "hash")).toEqual([{ rowid: 1, content: "first synthetic message" }]); released(statements, 1);
      db.exec(`CREATE TRIGGER reject_skip BEFORE INSERT ON embedding_skips
        BEGIN SELECT RAISE(ABORT, 'synthetic skip rejection'); END;`);
      expect(() => repo.markSkipped(record)).toThrow("synthetic skip rejection"); released(statements, 1);
      expect(repo.getSkippedCount()).toBe(1); released(statements, 1);
    });
  });
});
