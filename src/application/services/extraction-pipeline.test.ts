/**
 * ExtractionPipeline Service Tests
 *
 * [TDD-RED]
 * Unit/integration tests for the ExtractionPipeline service.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSchema } from "../../infrastructure/database/schema.js";
import { Fact } from "../../domain/entities/fact.js";
import { Session } from "../../domain/entities/session.js";
import { Message } from "../../domain/entities/message.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";
import { SqliteFactRepository } from "../../infrastructure/database/repositories/fact-repository.js";
import { SqliteExtractionLogRepository } from "../../infrastructure/database/repositories/extraction-log-repository.js";
import { SqliteSessionRepository } from "../../infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../infrastructure/database/repositories/message-repository.js";
import { ExtractionPipeline } from "./extraction-pipeline.js";
import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { IEmbeddingProvider } from "../../domain/ports/embedding.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";
import { PatternRedactor } from "../../infrastructure/security/pattern-redactor.js";

describe("ExtractionPipeline", () => {
  let db: Database;
  let factRepo: SqliteFactRepository;
  let logRepo: SqliteExtractionLogRepository;
  let sessionRepo: SqliteSessionRepository;
  let messageRepo: SqliteMessageRepository;
  let testLogPath: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);

    factRepo = new SqliteFactRepository(db);
    logRepo = new SqliteExtractionLogRepository(db);
    sessionRepo = new SqliteSessionRepository(db);
    messageRepo = new SqliteMessageRepository(db);

    testLogPath = join(tmpdir(), `memory-nexus-pipeline-test-${Math.random().toString(36).slice(2)}.jsonl`);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testLogPath)) {
      unlinkSync(testLogPath);
    }
  });

  // Mocks
  const mockExtractor = (candidates: any[]): IExtractionProvider => ({
    providerId: "mock-llm",
    modelName: "mock-model",
    extract: async () => candidates
  });

  const mockEmbedder = (embeddingsMap: Record<string, number[]>): IEmbeddingProvider => ({
    name: "mock-embedder",
    dimensions: 3,
    model: "mock-model",
    embed: async (text) => {
      const vec = embeddingsMap[text] ?? [0, 0, 0];
      return EmbeddingResult.create({
        embedding: new Float32Array(vec),
        model: "mock-model",
        dimensions: 3
      });
    },
    embedBatch: async (texts) => {
      return texts.map(t => {
        const vec = embeddingsMap[t] ?? [0, 0, 0];
        return EmbeddingResult.create({
          embedding: new Float32Array(vec),
          model: "mock-model",
          dimensions: 3
        });
      });
    },
    isReady: () => true,
    initialize: async () => {},
    dispose: async () => {}
  });

  test("skips session if already extracted and force option is false (Idempotency)", async () => {
    const session = Session.create({
      id: "session-123",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    // Save a log record indicating it's already extracted
    await logRepo.save({
      sessionId: "session-123",
      mode: "manual",
      factsAdded: 2,
      factsUpdated: 0,
      factsSuperseded: 0,
      factsSkipped: 0,
      provider: "mock-llm",
      model: "mock-model",
      tokensConsumed: 0,
      extractedAt: new Date()
    });

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([]),
      mockEmbedder({}),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-123", "nexus", { force: false });
    expect(result.skippedSession).toBe(true);
  });

  test("processes session if already extracted but force is true", async () => {
    const session = Session.create({
      id: "session-123",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "Hello",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-123");

    // Save log record
    await logRepo.save({
      sessionId: "session-123",
      mode: "manual",
      factsAdded: 2,
      factsUpdated: 0,
      factsSuperseded: 0,
      factsSkipped: 0,
      provider: "mock-llm",
      model: "mock-model",
      tokensConsumed: 0,
      extractedAt: new Date()
    });

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Learn something new", confidence: 0.9 }]),
      mockEmbedder({}),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-123", "nexus", { force: true });
    expect(result.skippedSession).toBe(false);
    expect(result.added).toBe(1);
  });

  test("returns a no-op result when a session has no messages", async () => {
    const session = Session.create({
      id: "session-empty",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Should not run", confidence: 0.9 }]),
      mockEmbedder({}),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-empty", "nexus");

    expect(result).toEqual({
      skippedSession: false,
      added: 0,
      updated: 0,
      superseded: 0,
      skipped: 0,
    });
    expect(await logRepo.findById("session-empty")).toBeNull();
  });

  test("extracts new fact if similarity is low (< 0.85)", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date("2026-05-23T10:00:00Z")
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "I learned standard coding",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    // Setup active facts
    const activeFact = Fact.create({
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    await factRepo.save(activeFact);

    // Write active fact to events.jsonl so projection builder plays it back too
    const fs = require("fs");
    fs.writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const embeddingsMap = {
      "Use bun test for test runs": [1, 0, 0],
      "I discovered standard coding guidelines": [0, 1, 0] // Orthogonal vector -> 0 similarity
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "I discovered standard coding guidelines", confidence: 0.95 }]),
      mockEmbedder(embeddingsMap),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.superseded).toBe(0);

    const allFacts = await factRepo.findAll();
    expect(allFacts.length).toBe(2); // The active fact + the new fact
  });

  test("supersedes/updates fact if similarity is high (0.85 <= similarity < 0.95)", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date("2026-05-23T10:00:00Z")
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "Use vitest instead of bun test",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    const activeFact = Fact.create({
      uuid: "old-fact-uuid",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    await factRepo.save(activeFact);

    const fs = require("fs");
    fs.writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    // Two vectors close to each other: similarity of ~0.90
    // Vector 1: [1, 0.1, 0], Vector 2: [1, -0.1, 0]
    // Cosine similarity is dot([1, 0.1, 0], [1, -0.1, 0]) / (norm1 * norm2) = (1 - 0.01) / 1.01 = 0.99 / 1.01 = 0.98. Let's adjust to exactly 0.90:
    // Let's use: Vector 1: [1, 0, 0], Vector 2: [0.90, 0.435, 0] -> dot is 0.90, norm is 1. Similarity = 0.90. Perfect!
    const embeddingsMap = {
      "Use bun test for test runs": [1, 0, 0],
      "Use vitest instead of bun test": [0.90, 0.435, 0]
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use vitest instead of bun test", confidence: 0.90 }]),
      mockEmbedder(embeddingsMap),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    expect(result.added).toBe(1); // One new fact row
    expect(result.updated).toBe(1);
    expect(result.superseded).toBe(1);

    const oldFactDb = await factRepo.findByUuid("old-fact-uuid");
    expect(oldFactDb!.supersededAt).not.toBeNull();
    expect(oldFactDb!.supersededBy).not.toBeNull();
  });

  test("skips/noop fact if similarity is duplicate (similarity >= 0.95)", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date("2026-05-23T10:00:00Z")
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "Use bun test for test runs",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    const activeFact = Fact.create({
      uuid: "old-fact-uuid",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    await factRepo.save(activeFact);

    const fs = require("fs");
    fs.writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const embeddingsMap = {
      "Use bun test for test runs": [1, 0, 0]
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use bun test for test runs", confidence: 0.95 }]),
      mockEmbedder(embeddingsMap),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);

    const oldFactDb = await factRepo.findByUuid("old-fact-uuid");
    expect(oldFactDb!.supersededAt).toBeNull();
  });

  test("falls back to Jaccard word-level similarity if embedding provider is not available", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date("2026-05-23T10:00:00Z")
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "We should use bun test for our regular test runs",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    const activeFact = Fact.create({
      uuid: "old-fact-uuid",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date("2026-05-23T08:00:00Z")
    });
    await factRepo.save(activeFact);

    const fs = require("fs");
    fs.writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    // words active: set("use", "bun", "test", "for", "runs") - 5 words
    // words candidate: set("we", "should", "use", "bun", "test", "for", "our", "regular", "runs") - 9 words
    // intersection: set("use", "bun", "test", "for", "runs") - 5 words
    // union: 9 words
    // Jaccard: 5 / 9 = 0.55 similarity (< 0.85 -> New fact)
    // If candidate was "Use bun test for test runs", Jaccard would be 1.0 (>= 0.95 -> Duplicate)
    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use bun test for test runs", confidence: 0.95 }]),
      undefined, // No embedding provider!
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    // Duplicate Jaccard is 1.0 -> should skip!
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test("falls back to Jaccard when embedding provider is present but not ready", async () => {
    const session = Session.create({
      id: "session-not-ready-embedder",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({
        id: "msg-not-ready",
        role: "user",
        content: "Use bun test for test runs",
        timestamp: new Date()
      }),
      "session-not-ready-embedder"
    );

    const activeFact = Fact.create({
      uuid: "not-ready-active",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date()
    });
    await factRepo.save(activeFact);
    writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const notReadyEmbedder: IEmbeddingProvider = {
      ...mockEmbedder({}),
      isReady: () => false,
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use bun test for test runs", confidence: 0.95 }]),
      notReadyEmbedder,
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-not-ready-embedder", "nexus");

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test("treats zero-vector cosine similarity as dissimilar instead of dividing by zero", async () => {
    const session = Session.create({
      id: "session-zero-vector",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({
        id: "msg-zero-vector",
        role: "user",
        content: "A new zero vector candidate",
        timestamp: new Date()
      }),
      "session-zero-vector"
    );

    const activeFact = Fact.create({
      uuid: "zero-active",
      type: "learning",
      project: "nexus",
      content: "Existing zero vector fact",
      observedAt: new Date()
    });
    await factRepo.save(activeFact);
    writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "A new zero vector candidate", confidence: 0.95 }]),
      mockEmbedder({
        "Existing zero vector fact": [0, 0, 0],
        "A new zero vector candidate": [0, 0, 0],
      }),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-zero-vector", "nexus");

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
  });

  test("handles empty candidate facts response gracefully", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "Hello",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([]), // Empty candidates!
      mockEmbedder({}),
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);

    const logs = await logRepo.findById("session-abc");
    expect(logs).not.toBeNull();
    expect(logs!.factsAdded).toBe(0);
  });

  test("skips sparse candidate slots without writing invalid fact events", async () => {
    const session = Session.create({
      id: "session-sparse-candidates",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({
        id: "msg-sparse-candidate",
        role: "user",
        content: "Sparse candidate extraction",
        timestamp: new Date()
      }),
      "session-sparse-candidates"
    );
    const sparseCandidates = new Array(1) as any[];

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor(sparseCandidates),
      undefined,
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-sparse-candidates", "nexus");

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(await logRepo.findById("session-sparse-candidates")).not.toBeNull();
  });

  test("falls back to Jaccard when ready embedder returns incomplete batches", async () => {
    const session = Session.create({
      id: "session-incomplete-embeddings",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({
        id: "msg-incomplete-embeddings",
        role: "user",
        content: "Use bun test for test runs",
        timestamp: new Date()
      }),
      "session-incomplete-embeddings"
    );

    const activeFact = Fact.create({
      uuid: "incomplete-active",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date()
    });
    await factRepo.save(activeFact);
    writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const incompleteEmbedder: IEmbeddingProvider = {
      ...mockEmbedder({}),
      embedBatch: async () => [],
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use bun test for test runs", confidence: 0.95 }]),
      incompleteEmbedder,
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-incomplete-embeddings", "nexus");

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test("private similarity helpers handle ragged and empty inputs defensively", () => {
    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([]),
      undefined,
      testLogPath
    ) as any;

    expect(pipeline.cosineSimilarity(new Float32Array([1]), new Float32Array([]))).toBe(0);
    expect(pipeline.cosineSimilarity(new Float32Array([]), new Float32Array([1]))).toBe(0);
    expect(pipeline.jaccardWordSimilarity("", "")).toBe(0);
  });

  test("redacts secrets before extraction provider payloads and fact event writes", async () => {
    const rawSecret = ["sk", "proj_abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
    const session = Session.create({
      id: "session-redact",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-secret",
      role: "user",
      content: `The key is ${rawSecret}`,
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-redact");

    let providerPayload = "";
    const extractor: IExtractionProvider = {
      providerId: "mock-llm",
      modelName: "mock-model",
      extract: async (messages) => {
        providerPayload = messages.map((message) => message.content).join("\n");
        return [{
          type: "learning",
          content: `Never store ${rawSecret}`,
          confidence: 0.95,
        }];
      },
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      extractor,
      undefined,
      testLogPath,
      new PatternRedactor(),
    );

    const result = await pipeline.extractFromSession("session-redact", "nexus");

    expect(result.added).toBe(1);
    expect(providerPayload).toContain("[REDACTED:api_key]");
    expect(providerPayload).not.toContain(rawSecret);

    const eventLogContent = require("fs").readFileSync(testLogPath, "utf-8");
    expect(eventLogContent).toContain("[REDACTED:api_key]");
    expect(eventLogContent).not.toContain(rawSecret);
  });

  test("falls back to Jaccard if embedding provider throws an error during embedBatch", async () => {
    const session = Session.create({
      id: "session-abc",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const msg = Message.create({
      id: "msg-1",
      role: "user",
      content: "Hello",
      timestamp: new Date()
    });
    await messageRepo.save(msg, "session-abc");

    const activeFact = Fact.create({
      uuid: "old-fact",
      type: "learning",
      project: "nexus",
      content: "Use bun test for test runs",
      observedAt: new Date()
    });
    await factRepo.save(activeFact);

    const fs = require("fs");
    fs.writeFileSync(testLogPath, JSON.stringify({
      uuid: activeFact.uuid,
      type: activeFact.type,
      project: activeFact.project,
      content: activeFact.content,
      observedAt: activeFact.observedAt.toISOString(),
      version: 1
    }) + "\n");

    const throwingEmbedder: IEmbeddingProvider = {
      name: "throwing-embedder",
      dimensions: 3,
      model: "mock-model",
      embed: async () => { throw new Error("Embed failed"); },
      embedBatch: async () => { throw new Error("EmbedBatch failed"); },
      isReady: () => true,
      initialize: async () => {},
      dispose: async () => {}
    };

    const pipeline = new ExtractionPipeline(
      db,
      factRepo,
      logRepo,
      messageRepo,
      mockExtractor([{ type: "learning", content: "Use bun test for test runs", confidence: 0.95 }]),
      throwingEmbedder,
      testLogPath
    );

    const result = await pipeline.extractFromSession("session-abc", "nexus");
    // Should fall back to Jaccard and detect it as a duplicate (Jaccard 1.0)
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
