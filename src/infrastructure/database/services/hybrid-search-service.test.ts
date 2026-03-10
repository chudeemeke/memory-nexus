/**
 * HybridSearchService Tests
 *
 * Tests for the hybrid search service covering:
 * - Mode resolution (auto, fts, vector, hybrid)
 * - FTS-only search delegation
 * - Vector-only search with query embedding
 * - Hybrid search with RRF fusion and temporal decay
 * - Graceful degradation for missing capabilities
 * - Search metadata tracking
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import { Fts5SearchService } from "./search-service.js";
import { EmbeddingRepository } from "../repositories/embedding-repository.js";
import { HybridSearchService } from "./hybrid-search-service.js";
import type { HybridSearchDeps, SearchMeta } from "./hybrid-search-service.js";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";
import { ErrorCode, MemoryError } from "../../../domain/index.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_SEARCH_CONFIG,
  type MemoryConfig,
} from "../../hooks/config-manager.js";
import type { IEmbeddingProvider } from "../../../domain/ports/embedding.js";
import type { EmbeddingResult } from "../../../domain/value-objects/embedding-result.js";
import type { EmbeddingProviderFactory } from "../../embedding/embedding-provider-factory.js";

// ============================================================================
// Test Helpers
// ============================================================================

function insertTestSession(
  db: Database,
  id: string,
  projectPathEncoded: string,
  projectPathDecoded: string,
  projectName: string
): void {
  db.run(
    `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, projectPathEncoded, projectPathDecoded, projectName]
  );
}

function insertTestMessage(
  db: Database,
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  timestamp?: Date
): number {
  const ts = timestamp?.toISOString() ?? new Date().toISOString();
  db.run(
    `INSERT INTO messages_meta (id, session_id, role, content, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [id, sessionId, role, content, ts]
  );
  const row = db
    .prepare<{ rowid: number }, [string]>(
      "SELECT rowid FROM messages_meta WHERE id = ?"
    )
    .get(id);
  return row!.rowid;
}

function insertTestEmbedding(
  db: Database,
  rowid: number,
  dimensions: number = 384,
  modelHash: string = "test-hash",
  modelName: string = "test-model"
): void {
  const embedding = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    embedding[i] = Math.random() * 2 - 1;
  }
  db.run(
    "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))",
    [rowid, embedding]
  );
  db.run(
    "INSERT INTO embedding_state(message_id, embedded_at, model_hash, model_name) VALUES (?, ?, ?, ?)",
    [rowid, new Date().toISOString(), modelHash, modelName]
  );
}

function insertTestEmbeddingWithVector(
  db: Database,
  rowid: number,
  embedding: Float32Array,
  modelHash: string = "test-hash",
  modelName: string = "test-model"
): void {
  db.run(
    "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))",
    [rowid, embedding]
  );
  db.run(
    "INSERT INTO embedding_state(message_id, embedded_at, model_hash, model_name) VALUES (?, ?, ?, ?)",
    [rowid, new Date().toISOString(), modelHash, modelName]
  );
}

function createMockEmbeddingResult(dimensions: number = 384): EmbeddingResult {
  const embedding = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    embedding[i] = Math.random() * 2 - 1;
  }
  return {
    embedding,
    model: "test-model",
    dimensions,
  } as EmbeddingResult;
}

function createMockProvider(
  overrides: Partial<IEmbeddingProvider> = {}
): IEmbeddingProvider {
  return {
    name: "mock",
    dimensions: 384,
    model: "mock-model",
    embed: mock(() => Promise.resolve(createMockEmbeddingResult())),
    embedBatch: mock(() => Promise.resolve([])),
    isReady: mock(() => true),
    initialize: mock(() => Promise.resolve()),
    dispose: mock(() => Promise.resolve()),
    ...overrides,
  } as IEmbeddingProvider;
}

function createMockFactory(
  provider: IEmbeddingProvider | null = null
): EmbeddingProviderFactory {
  const p = provider ?? createMockProvider();
  return {
    create: mock(() => p),
    createFromConfig: mock(() => p),
    dispose: mock(() => Promise.resolve()),
  } as unknown as EmbeddingProviderFactory;
}

function createDeps(
  db: Database,
  overrides: Partial<HybridSearchDeps> = {}
): HybridSearchDeps {
  return {
    db,
    fts5Service: new Fts5SearchService(db),
    embeddingRepo: new EmbeddingRepository(db),
    providerFactory: createMockFactory(),
    config: { ...DEFAULT_CONFIG },
    sqliteVecAvailable: true,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("HybridSearchService", () => {
  let db: Database;
  let sqliteVecAvailable: boolean;

  beforeEach(() => {
    const result = initializeDatabase({ path: ":memory:" });
    db = result.db;
    sqliteVecAvailable = result.sqliteVecAvailable;

    insertTestSession(
      db,
      "session-1",
      "C--Users-Test-TestProject",
      "C:\\Users\\Test\\TestProject",
      "TestProject"
    );
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("mode resolution", () => {
    it("auto mode with 0 embeddings resolves to FTS", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns for security");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query);

      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
      expect(meta?.modeReason).toContain("no_embeddings");
    });

    it("auto mode with embeddings resolves to hybrid", async () => {
      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      if (sqliteVecAvailable) {
        insertTestEmbedding(db, rowid);
      }

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      if (sqliteVecAvailable) {
        const results = await service.search(query);
        const meta = service.getLastSearchMeta();
        expect(meta?.mode).toBe("hybrid");
      }
    });

    it("explicit fts mode always uses FTS, never calls provider", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const mockProvider = createMockProvider();
      const mockFactory = createMockFactory(mockProvider);
      const deps = createDeps(db, {
        sqliteVecAvailable,
        providerFactory: mockFactory,
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "fts" });

      expect(results.length).toBeGreaterThan(0);
      expect(mockProvider.embed).not.toHaveBeenCalled();
      expect(mockProvider.initialize).not.toHaveBeenCalled();
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
    });

    it("explicit vector mode with 0 embeddings throws VECTOR_UNAVAILABLE", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await expect(service.search(query, { mode: "vector" })).rejects.toThrow(MemoryError);

      try {
        await service.search(query, { mode: "vector" });
      } catch (e) {
        expect(e).toBeInstanceOf(MemoryError);
        expect((e as MemoryError).code).toBe(ErrorCode.VECTOR_UNAVAILABLE);
        expect((e as MemoryError).message).toContain("embeddings");
      }
    });

    it("explicit vector mode with embeddings uses vector search", async () => {
      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      if (!sqliteVecAvailable) return;

      insertTestEmbedding(db, rowid);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "vector" });

      expect(mockProvider.embed).toHaveBeenCalled();
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("vector");
    });

    it("explicit hybrid mode with sqliteVecAvailable=false degrades to FTS", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
      expect(meta?.degraded).toBe(true);
    });

    it("config defaultMode='hybrid' used when no CLI mode", async () => {
      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      if (!sqliteVecAvailable) return;

      insertTestEmbedding(db, rowid);

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: { ...DEFAULT_SEARCH_CONFIG, defaultMode: "hybrid" },
      };
      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query);

      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("hybrid");
    });
  });

  describe("FTS-only search", () => {
    it("FTS mode returns same results as direct Fts5SearchService call", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns for testing");
      insertTestMessage(db, "msg-2", "session-1", "assistant", "authentication response here");

      const fts5Service = new Fts5SearchService(db);
      const deps = createDeps(db, { fts5Service, sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const ftsResults = await fts5Service.search(query);
      const hybridResults = await service.search(query, { mode: "fts" });

      expect(hybridResults).toHaveLength(ftsResults.length);
      for (let i = 0; i < ftsResults.length; i++) {
        expect(hybridResults[i].messageId).toBe(ftsResults[i].messageId);
      }
    });

    it("filters still work in FTS mode", async () => {
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-OtherProject",
        "C:\\Users\\Test\\OtherProject",
        "OtherProject"
      );
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication in TestProject");
      insertTestMessage(db, "msg-2", "session-2", "user", "authentication in OtherProject");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, {
        mode: "fts",
        projectFilter: "TestProject",
      });

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("session-1");
    });

    it("provider is never initialized in FTS mode", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const mockProvider = createMockProvider();
      const mockFactory = createMockFactory(mockProvider);
      const deps = createDeps(db, {
        sqliteVecAvailable,
        providerFactory: mockFactory,
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "fts" });

      expect(mockProvider.initialize).not.toHaveBeenCalled();
      expect(mockProvider.embed).not.toHaveBeenCalled();
    });
  });

  describe("vector-only search", () => {
    it("embeds query and returns results with vector source", async () => {
      if (!sqliteVecAvailable) return;

      const rowid1 = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      const rowid2 = insertTestMessage(
        db, "msg-2", "session-1", "assistant", "here are the authentication details"
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "vector" });

      expect(results.length).toBeGreaterThan(0);
      expect(mockProvider.embed).toHaveBeenCalled();
      for (const r of results) {
        expect(r.source).toBe("vector");
      }
    });

    it("vector results are hydrated with message metadata", async () => {
      if (!sqliteVecAvailable) return;

      const ts = new Date("2024-06-15T10:30:00Z");
      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security", ts
      );
      insertTestEmbedding(db, rowid);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("auth");

      const results = await service.search(query, { mode: "vector" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sessionId).toBe("session-1");
      expect(results[0].messageId).toBe("msg-1");
      expect(results[0].role).toBe("user");
    });

    it("vector snippet uses first 200 chars of content", async () => {
      if (!sqliteVecAvailable) return;

      const longContent = "A".repeat(400);
      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", longContent
      );
      insertTestEmbedding(db, rowid);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("test");

      const results = await service.search(query, { mode: "vector" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet.length).toBeLessThanOrEqual(203); // 200 + "..."
    });
  });

  describe("hybrid search", () => {
    it("returns results from both FTS and vector, merged by RRF", async () => {
      if (!sqliteVecAvailable) return;

      // Message with both FTS match and embedding
      const rowid1 = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      // Message with embedding only (no FTS match for "authentication")
      const rowid2 = insertTestMessage(
        db, "msg-2", "session-1", "assistant", "secure login credential verification"
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("hybrid");
    });

    it("overlapping results from FTS and vector have source 'both'", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security testing"
      );
      insertTestEmbedding(db, rowid);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBeGreaterThan(0);
      // The message appears in both FTS and vector results
      const msg1 = results.find((r) => r.messageId === "msg-1");
      expect(msg1).toBeDefined();
      expect(msg1!.source).toBe("both");
    });

    it("temporal decay is applied when enabled", async () => {
      if (!sqliteVecAvailable) return;

      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      const rowid1 = insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      const rowid2 = insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBe(2);
      // Newer message should score higher with decay enabled
      expect(results[0].messageId).toBe("msg-new");
    });

    it("noDecay option skips temporal decay", async () => {
      if (!sqliteVecAvailable) return;

      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      const rowid1 = insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      const rowid2 = insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid", noDecay: true });

      expect(results.length).toBe(2);
      // Without decay, order depends purely on RRF scores (not time-biased)
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("hybrid");
    });
  });

  describe("graceful degradation", () => {
    it("sqliteVecAvailable=false, auto mode: FTS-only, no error", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query);

      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
      expect(meta?.degraded).toBe(false);
    });

    it("sqliteVecAvailable=false, hybrid mode: degrades to FTS, no error", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
      expect(meta?.degraded).toBe(true);
    });

    it("sqliteVecAvailable=false, vector mode: throws VECTOR_UNAVAILABLE", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      try {
        await service.search(query, { mode: "vector" });
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeInstanceOf(MemoryError);
        expect((e as MemoryError).code).toBe(ErrorCode.VECTOR_UNAVAILABLE);
      }
    });

    it("provider.initialize() throws: auto/hybrid degrade to FTS", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      insertTestEmbedding(db, rowid);

      const failingProvider = createMockProvider({
        isReady: mock(() => false),
        initialize: mock(() => Promise.reject(new Error("Provider init failed"))),
      });
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(failingProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      // auto mode: should degrade
      const results = await service.search(query);
      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
      expect(meta?.degraded).toBe(true);
    });

    it("provider.embed() throws during hybrid: degrades to FTS results", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      insertTestEmbedding(db, rowid);

      const failingProvider = createMockProvider({
        embed: mock(() => Promise.reject(new Error("Embedding failed"))),
      });
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(failingProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      // Should have degraded to FTS
      expect(meta?.degraded).toBe(true);
    });

    it("provider.initialize() throws for vector mode: throws VECTOR_UNAVAILABLE", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns"
      );
      insertTestEmbedding(db, rowid);

      const failingProvider = createMockProvider({
        isReady: mock(() => false),
        initialize: mock(() => Promise.reject(new Error("Provider init failed"))),
      });
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(failingProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      try {
        await service.search(query, { mode: "vector" });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(MemoryError);
        expect((e as MemoryError).code).toBe(ErrorCode.VECTOR_UNAVAILABLE);
      }
    });
  });

  describe("search metadata", () => {
    it("FTS search metadata has correct capabilities", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "fts" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(meta!.mode).toBe("fts");
      expect(meta!.degraded).toBe(false);
      expect(meta!.capabilities.fts).toBe(true);
      expect(meta!.capabilities.vector).toBe(false);
      expect(meta!.capabilities.hybrid).toBe(false);
    });

    it("hybrid search metadata has correct capabilities when vec available", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      insertTestEmbedding(db, rowid);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "hybrid" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(meta!.mode).toBe("hybrid");
      expect(meta!.degraded).toBe(false);
      expect(meta!.capabilities.fts).toBe(true);
      expect(meta!.capabilities.vector).toBe(true);
      expect(meta!.capabilities.hybrid).toBe(true);
    });

    it("degraded search metadata shows degradation reason", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable: false });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "hybrid" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(meta!.mode).toBe("fts");
      expect(meta!.degraded).toBe(true);
      expect(meta!.degradationReason).toBeDefined();
    });

    it("search returns timing metadata", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "fts" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(meta!.timingMs).toBeGreaterThanOrEqual(0);
    });

    it("search returns embedding coverage", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");
      insertTestMessage(db, "msg-2", "session-1", "user", "another message here");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "fts" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(typeof meta!.embeddingCoverage).toBe("number");
      expect(meta!.embeddingCoverage).toBe(0);
    });
  });

  describe("degradation edge cases", () => {
    it("dimension mismatch degrades to FTS with warning", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      insertTestEmbedding(db, rowid, 384);

      // Provider reports different dimensions
      const mismatchProvider = createMockProvider({
        dimensions: 768,
      });
      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        embedding: { ...DEFAULT_CONFIG.embedding, dimensions: 768 },
      };
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mismatchProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.degraded).toBe(true);
      expect(meta?.degradationReason).toContain("dimension");
    });

    it("search with all filters in hybrid mode applies to both legs", async () => {
      if (!sqliteVecAvailable) return;

      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-OtherProject",
        "C:\\Users\\Test\\OtherProject",
        "OtherProject"
      );

      const rowid1 = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      const rowid2 = insertTestMessage(
        db, "msg-2", "session-2", "user", "authentication in other project"
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, {
        mode: "hybrid",
        projectFilter: "TestProject",
      });

      // Should only contain results from TestProject
      for (const r of results) {
        expect(r.sessionId).toBe("session-1");
      }
    });

    it("provider returns embedding with wrong dimensions degrades to FTS in hybrid", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns for security"
      );
      insertTestEmbedding(db, rowid, 384);

      // Provider returns wrong-dimension embedding
      const badProvider = createMockProvider({
        dimensions: 768,
        embed: mock(() =>
          Promise.resolve({
            embedding: new Float32Array(768),
            model: "bad-model",
            dimensions: 768,
          } as EmbeddingResult)
        ),
      });
      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        embedding: { ...DEFAULT_CONFIG.embedding, dimensions: 768 },
      };
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(badProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });
      expect(results.length).toBeGreaterThan(0);
      const meta = service.getLastSearchMeta();
      expect(meta?.degraded).toBe(true);
    });

    it("concurrent searches do not conflict (WAL mode)", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");
      insertTestMessage(db, "msg-2", "session-1", "user", "security patterns");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);

      const query1 = SearchQuery.from("authentication");
      const query2 = SearchQuery.from("security");

      // Run two searches concurrently
      const [results1, results2] = await Promise.all([
        service.search(query1, { mode: "fts" }),
        service.search(query2, { mode: "fts" }),
      ]);

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
    });

    it("timing metadata is a positive number", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      await service.search(query, { mode: "fts" });

      const meta = service.getLastSearchMeta();
      expect(meta).toBeDefined();
      expect(typeof meta!.timingMs).toBe("number");
      expect(meta!.timingMs).toBeGreaterThanOrEqual(0);
    });

    it("search result has populated source and rawScores fields", async () => {
      insertTestMessage(db, "msg-1", "session-1", "user", "authentication patterns for testing");

      const deps = createDeps(db, { sqliteVecAvailable });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "fts" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe("fts");
      expect(results[0].rawScores).toBeDefined();
      expect(results[0].rawScores!.bm25).toBeDefined();
    });

    it("vector mode dimension mismatch throws EMBEDDING_DIMENSION_MISMATCH", async () => {
      if (!sqliteVecAvailable) return;

      const rowid = insertTestMessage(
        db, "msg-1", "session-1", "user", "authentication patterns"
      );
      insertTestEmbedding(db, rowid, 384);

      const mismatchProvider = createMockProvider({ dimensions: 768 });
      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        embedding: { ...DEFAULT_CONFIG.embedding, dimensions: 768 },
      };
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mismatchProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      try {
        await service.search(query, { mode: "vector" });
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(MemoryError);
        expect((e as MemoryError).code).toBe(ErrorCode.EMBEDDING_DIMENSION_MISMATCH);
      }
    });
  });

  describe("uniform temporal decay", () => {
    it("FTS-only mode applies temporal decay when enabled", async () => {
      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      const deps = createDeps(db, {
        sqliteVecAvailable: false,
        config,
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "fts" });

      expect(results.length).toBe(2);
      // Newer message should score higher with decay enabled
      expect(results[0].messageId).toBe("msg-new");
    });

    it("FTS-only mode skips decay when noDecay option is true", async () => {
      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      const deps = createDeps(db, {
        sqliteVecAvailable: false,
        config,
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "fts", noDecay: true });

      expect(results.length).toBe(2);
      // Without decay, BM25 ordering preserved (both have same terms, order may vary)
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
    });

    it("FTS-only mode skips decay when config temporalDecay.enabled is false", async () => {
      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: false, halfLifeDays: 30 },
        },
      };

      const deps = createDeps(db, {
        sqliteVecAvailable: false,
        config,
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "fts" });

      expect(results.length).toBe(2);
      // Without decay, BM25 ordering preserved
      const meta = service.getLastSearchMeta();
      expect(meta?.mode).toBe("fts");
    });

    it("vector-only mode applies temporal decay", async () => {
      if (!sqliteVecAvailable) return;

      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      const rowid1 = insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      const rowid2 = insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );

      // Controlled embeddings to force deterministic cosine similarity scores.
      // Query embedding: unit vector along dimension 0 -> [1, 0, 0, ..., 0]
      const queryEmbedding = new Float32Array(384);
      queryEmbedding[0] = 1.0;

      // msg-old: high similarity (~0.95) but 60+ days old -> decay crushes its score
      // [0.95, 0.3122, 0, ..., 0] normalized: sqrt(0.95^2 + 0.3122^2) ~= 1.0
      const oldEmbedding = new Float32Array(384);
      oldEmbedding[0] = 0.95;
      oldEmbedding[1] = 0.3122;

      // msg-new: moderate similarity (~0.7) but recent -> decay barely affects it
      // [0.7, 0.7141, 0, ..., 0] normalized: sqrt(0.7^2 + 0.7141^2) ~= 1.0
      const newEmbedding = new Float32Array(384);
      newEmbedding[0] = 0.7;
      newEmbedding[1] = 0.7141;

      insertTestEmbeddingWithVector(db, rowid1, oldEmbedding);
      insertTestEmbeddingWithVector(db, rowid2, newEmbedding);

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      // Override embed to return the controlled query embedding
      const mockProvider = createMockProvider({
        embed: mock(() => Promise.resolve({
          embedding: queryEmbedding,
          model: "test-model",
          dimensions: 384,
        } as EmbeddingResult)),
      });
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "vector" });

      expect(results.length).toBe(2);
      // Without decay: msg-old (0.95 similarity) > msg-new (0.7 similarity)
      // With decay: msg-old (0.95 * ~0.25) = ~0.24 < msg-new (0.7 * ~1.0) = ~0.7
      // This assertion can ONLY pass if decay is applied correctly.
      expect(results[0].messageId).toBe("msg-new");
    });

    it("hybrid mode still applies temporal decay (no regression)", async () => {
      if (!sqliteVecAvailable) return;

      const oldDate = new Date("2020-01-01T00:00:00Z");
      const newDate = new Date();

      const rowid1 = insertTestMessage(
        db, "msg-old", "session-1", "user", "authentication old content", oldDate
      );
      const rowid2 = insertTestMessage(
        db, "msg-new", "session-1", "user", "authentication new content", newDate
      );
      insertTestEmbedding(db, rowid1);
      insertTestEmbedding(db, rowid2);

      const config: MemoryConfig = {
        ...DEFAULT_CONFIG,
        search: {
          ...DEFAULT_SEARCH_CONFIG,
          temporalDecay: { enabled: true, halfLifeDays: 30 },
        },
      };

      const mockProvider = createMockProvider();
      const deps = createDeps(db, {
        sqliteVecAvailable: true,
        config,
        providerFactory: createMockFactory(mockProvider),
      });
      const service = new HybridSearchService(deps);
      const query = SearchQuery.from("authentication");

      const results = await service.search(query, { mode: "hybrid" });

      expect(results.length).toBe(2);
      // Newer message should score higher with decay
      expect(results[0].messageId).toBe("msg-new");
    });
  });
});
