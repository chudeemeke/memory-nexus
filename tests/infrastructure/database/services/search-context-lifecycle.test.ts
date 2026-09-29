import { describe, expect, it, setSystemTime } from "bun:test";
import type { Statement } from "bun:sqlite";
import { OwnedDatabase } from "../../../../src/infrastructure/database/owned-database.js";
import { createSchema } from "../../../../src/infrastructure/database/schema.js";
import { loadSqliteVecExtension } from "../../../../src/infrastructure/database/connection.js";
import { SqliteContextService, SqliteProjectResolver } from "../../../../src/infrastructure/database/services/context-service.js";
import { Fts5SearchService } from "../../../../src/infrastructure/database/services/search-service.js";
import { HybridSearchService } from "../../../../src/infrastructure/database/services/hybrid-search-service.js";
import { EmbeddingRepository } from "../../../../src/infrastructure/database/repositories/embedding-repository.js";
import { SearchQuery } from "../../../../src/domain/value-objects/search-query.js";
import { EmbeddingResult } from "../../../../src/domain/value-objects/embedding-result.js";
import { DEFAULT_CONFIG } from "../../../../src/infrastructure/hooks/config-manager.js";
import type { EmbeddingProviderFactory } from "../../../../src/infrastructure/embedding/embedding-provider-factory.js";

const timestamp = new Date("2026-01-01T12:00:00Z");
const vector = new Float32Array(384); vector[0] = 1;
async function withFixture(run: (db: OwnedDatabase, released: (count?: number) => void) => Promise<void>): Promise<void> {
  const db = new OwnedDatabase(":memory:");
  try {
    expect(loadSqliteVecExtension(db)).toBe(true);
    createSchema(db, { sqliteVecAvailable: true });
    db.exec(`PRAGMA foreign_keys = ON;
      INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
      VALUES ('session', 'synthetic', '/synthetic', 'Synthetic Project', '2026-01-01T12:00:00.000Z');
      INSERT INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES ('one', 'session', 'assistant', 'searchable synthetic memory', '2026-01-01T12:00:00.000Z');
      INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
      VALUES ('tool', 'session', 'Read', '{}', '2026-01-01T12:00:00.000Z', 'success');
      INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
      VALUES ('session', 'session', 'topic', 'synthetic topic', 'mentions', 1);`);
    db.run("INSERT INTO message_embeddings (rowid, embedding) VALUES (1, vec_f32(?))", [vector]);
    db.exec("INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (1, '2026-01-01T12:00:00Z', 'synthetic', 'synthetic')");
    db.transaction(() => {})();
    const statements: Statement[] = [], prepare = db.prepare.bind(db);
    db.prepare = ((...args: Parameters<typeof db.prepare>) => {
      const statement = Reflect.apply(prepare, db, args) as Statement;
      statements.push(statement); return statement;
    }) as typeof db.prepare;
    await run(db, count => {
      if (count === undefined) expect(statements.length).toBeGreaterThan(0);
      else expect(statements).toHaveLength(count);
      for (const statement of statements) expect(() => statement.get()).toThrow("finalized");
      statements.length = 0;
    });
  } finally { db.close(); }
}
function hybrid(db: OwnedDatabase): HybridSearchService {
  const provider = { dimensions: 384, isReady: () => true,
    embed: async () => EmbeddingResult.create({ embedding: vector, dimensions: 384, model: "synthetic" }) };
  const factory = { createFromConfig: () => provider } as unknown as EmbeddingProviderFactory;
  return new HybridSearchService({ db, fts5Service: new Fts5SearchService(db), embeddingRepo: new EmbeddingRepository(db), providerFactory: factory, config: DEFAULT_CONFIG, sqliteVecAvailable: true });
}

describe("search/context statement lifetime", () => {
  it("releases exact/fuzzy project context, date filters and resolver early returns", async () => {
    setSystemTime(new Date("2026-01-02T12:00:00Z"));
    try {
      await withFixture(async (db, released) => {
        for (let iteration = 0; iteration < 10; iteration++) {
          const context = new SqliteContextService(db), resolver = new SqliteProjectResolver(db); released(0);
          const result = await context.getProjectContext("Synthetic Project");
          expect(result?.totalMessages).toBe(1); expect(result?.recentTopics).toEqual(["synthetic topic"]);
          expect(result?.recentToolUses).toEqual([{ name: "Read", count: 1 }]); released(4);
          expect((await context.getProjectContext("Synthetic", { days: 2, topicsLimit: 1, toolsLimit: 1 }))?.sessionCount).toBe(1); released(5);
          expect(await context.getProjectContext("missing")).toBeNull(); released(2);
          expect(await context.getProjectContext("Synthetic Project", { days: 1 })).toBeNull(); released(2);
          expect(resolver.resolveProjectEncoded("Synthetic Project")).toBe("synthetic"); released(1);
          expect(resolver.resolveProjectEncoded("Synthetic")).toBe("synthetic"); released(2);
          expect(resolver.resolveProjectEncoded("missing")).toBeNull(); released(2);
          expect(resolver.resolveProjectName("Synthetic Project")).toBe("Synthetic Project"); released(1);
          expect(resolver.resolveProjectName("Synthetic")).toBe("Synthetic Project"); released(2);
          expect(resolver.resolveProjectName("missing")).toBeNull(); released(2);
        }
      });
    } finally { setSystemTime(); }
  });

  it("releases FTS searches after filtered hits, misses and sanitized early returns", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const service = new Fts5SearchService(db); released(0);
        expect((await service.search(SearchQuery.from("searchable"), { projectFilter: "Synthetic", roleFilter: ["assistant"], sessionFilter: "session", sinceDate: timestamp, beforeDate: timestamp, limit: 1 })).map(row => row.messageId)).toEqual(["one"]); released(1);
        expect(await service.search(SearchQuery.from("missing"))).toEqual([]); released(1);
        expect(await service.search(SearchQuery.from("---"))).toEqual([]); released(0);
      }
    });
  });

  it("releases native hybrid/vector hydration, dimension and project-filter statements", async () => {
    await withFixture(async (db, released) => {
      for (let iteration = 0; iteration < 10; iteration++) {
        const service = hybrid(db); released(0);
        expect((await service.search(SearchQuery.from("searchable"), { mode: "hybrid", projectFilter: "Synthetic", noDecay: true })).map(row => row.messageId)).toEqual(["one"]); released();
        expect(service.getLastSearchMeta()?.degraded).toBe(false);
        expect((await service.search(SearchQuery.from("searchable"), { mode: "vector", projectFilter: "Synthetic", noDecay: true })).map(row => row.messageId)).toEqual(["one"]); released();
        expect(await service.search(SearchQuery.from("searchable"), { mode: "vector", projectFilter: "missing", noDecay: true })).toEqual([]); released();
      }
    });
  });

  it("releases context statements when native limits or later preparation fail", async () => {
    await withFixture(async (db, released) => {
      const service = new SqliteContextService(db);
      await expect(service.getProjectContext("Synthetic Project", { toolsLimit: "invalid" as unknown as number })).rejects.toThrow(); released(3);
      await expect(service.getProjectContext("Synthetic Project", { topicsLimit: "invalid" as unknown as number })).rejects.toThrow(); released(4);
      const prepare = db.prepare.bind(db); let calls = 0;
      db.prepare = ((...args: Parameters<typeof db.prepare>) => {
        if (++calls === 2) return prepare("INVALID SYNTHETIC SQL");
        return Reflect.apply(prepare, db, args);
      }) as typeof db.prepare;
      try {
        await expect(service.getProjectContext("Synthetic")).rejects.toThrow(); released(1);
        calls = 0;
        expect(() => new SqliteProjectResolver(db).resolveProjectEncoded("Synthetic")).toThrow(); released(1);
        calls = 0;
        expect(() => new SqliteProjectResolver(db).resolveProjectName("Synthetic")).toThrow(); released(1);
      } finally { db.prepare = prepare; }
      expect((await service.getProjectContext("Synthetic Project"))?.sessionCount).toBe(1); released(4);
    });
  });

  it("releases FTS statements on native syntax, binding and row-decoding failures", async () => {
    await withFixture(async (db, released) => {
      const service = new Fts5SearchService(db);
      // Existing sanitizer gap is recorded separately; this proves error cleanup.
      await expect(service.search(SearchQuery.from("!!!"))).rejects.toThrow("syntax error"); released(1);
      await expect(service.search(SearchQuery.from("searchable"), { limit: "invalid" as unknown as number })).rejects.toThrow(); released(1);
      db.exec("UPDATE messages_meta SET id = ''");
      await expect(service.search(SearchQuery.from("searchable"))).rejects.toThrow(); released(1);
    });
  });

  it("releases hybrid statements when native dimension, mapping, hydration or filter reads fail", async () => {
    await withFixture(async (db, released) => {
      const prepare = db.prepare.bind(db);
      let target = "embedding FROM message_embeddings";
      db.prepare = ((...args: Parameters<typeof db.prepare>) => {
        const sql = args[0];
        if (sql.includes(target)) {
          const replaced = sql.replace(/^SELECT\s+\w+/i, "SELECT abs(-9223372036854775808)");
          return Reflect.apply(prepare, db, [replaced, ...args.slice(1)]);
        }
        return Reflect.apply(prepare, db, args);
      }) as typeof db.prepare;
      try {
        const service = hybrid(db);
        // A failed dimension probe currently returns unknown; KNN still executes.
        expect(await service.search(SearchQuery.from("searchable"), { mode: "vector", noDecay: true })).toHaveLength(1); released();
        target = "rowid, id FROM messages_meta";
        expect(await service.search(SearchQuery.from("searchable"), { mode: "hybrid", noDecay: true })).toHaveLength(1); released();
        expect(service.getLastSearchMeta()?.degraded).toBe(true);
        target = "rowid, id, session_id, content";
        await expect(service.search(SearchQuery.from("searchable"), { mode: "vector", noDecay: true })).rejects.toThrow("integer overflow"); released();
        target = "project_name FROM sessions WHERE id";
        await expect(service.search(SearchQuery.from("searchable"), { mode: "vector", projectFilter: "Synthetic", noDecay: true })).rejects.toThrow("integer overflow"); released();
      } finally { db.prepare = prepare; }
      expect(await hybrid(db).search(SearchQuery.from("searchable"), { mode: "hybrid", noDecay: true })).toHaveLength(1); released();
    });
  });
});
