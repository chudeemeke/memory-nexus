/**
 * SqliteExtractionLogRepository Tests
 *
 * Integration tests against in-memory SQLite database.
 * Tests CRUD operations and log clearance for fact extractions.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteExtractionLogRepository } from "./extraction-log-repository.js";
import type { ExtractionLogEntry } from "../../../domain/ports/repositories.js";

describe("SqliteExtractionLogRepository", () => {
  let db: Database;
  let repo: SqliteExtractionLogRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteExtractionLogRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestEntry(overrides?: Partial<ExtractionLogEntry>): ExtractionLogEntry {
    return {
      sessionId: "session-12345",
      mode: "sync",
      factsAdded: 5,
      factsUpdated: 2,
      factsSuperseded: 1,
      factsSkipped: 10,
      provider: "claude-cli",
      model: "claude-3-5-sonnet",
      tokensConsumed: 1250,
      extractedAt: new Date("2026-05-23T08:00:00Z"),
      ...overrides
    };
  }

  describe("save & findById", () => {
    it("inserts a new extraction log entry and retrieves it", async () => {
      const entry = createTestEntry();
      await repo.save(entry);

      const found = await repo.findById("session-12345");
      expect(found).not.toBeNull();
      expect(found!.sessionId).toBe("session-12345");
      expect(found!.mode).toBe("sync");
      expect(found!.factsAdded).toBe(5);
      expect(found!.factsUpdated).toBe(2);
      expect(found!.factsSuperseded).toBe(1);
      expect(found!.factsSkipped).toBe(10);
      expect(found!.provider).toBe("claude-cli");
      expect(found!.model).toBe("claude-3-5-sonnet");
      expect(found!.tokensConsumed).toBe(1250);
      expect(found!.extractedAt.toISOString()).toBe(entry.extractedAt.toISOString());
    });

    it("upserts / overwrites an entry on duplicate sessionId", async () => {
      const entry1 = createTestEntry({ factsAdded: 3 });
      await repo.save(entry1);

      const entry2 = createTestEntry({ factsAdded: 10 });
      await repo.save(entry2);

      const found = await repo.findById("session-12345");
      expect(found!.factsAdded).toBe(10);

      const all = await repo.findAll();
      expect(all.length).toBe(1);
    });

    it("returns null if entry is not found", async () => {
      expect(await repo.findById("nonexistent")).toBeNull();
    });
  });

  describe("findAll & clearAll", () => {
    it("returns list of entries and clears them all", async () => {
      await repo.save(createTestEntry({ sessionId: "s1" }));
      await repo.save(createTestEntry({ sessionId: "s2" }));

      const all = await repo.findAll();
      expect(all.length).toBe(2);

      await repo.clearAll();
      const cleared = await repo.findAll();
      expect(cleared.length).toBe(0);
    });
  });
});
