/**
 * SqliteFactRepository Tests
 *
 * Integration tests against in-memory SQLite database.
 * Tests fact creation, retrieval, updates, FTS search, and supersedence.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteFactRepository } from "./fact-repository.js";
import { Fact } from "../../../domain/entities/fact.js";

describe("SqliteFactRepository", () => {
  let db: Database;
  let repo: SqliteFactRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteFactRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestFact(overrides?: Partial<{
    uuid: string;
    type: any;
    project: string;
    content: string;
    metadata: Record<string, any>;
    observedAt: Date;
  }>): Fact {
    return Fact.create({
      type: "decision",
      project: "memory-nexus",
      content: "Default test fact content",
      observedAt: new Date("2026-05-23T08:00:00Z"),
      ...overrides
    });
  }

  describe("save", () => {
    it("inserts a new Fact and returns it with assigned database ID", async () => {
      const fact = createTestFact({ content: "Unique save content" });
      const saved = await repo.save(fact);

      expect(saved.id).toBeDefined();
      expect(saved.uuid).toBe(fact.uuid);
      expect(saved.content).toBe("Unique save content");

      // Verify row exists in DB
      const row = db.prepare("SELECT * FROM facts WHERE id = ?").get(saved.id!) as any;
      expect(row).not.toBeNull();
      expect(row.uuid).toBe(fact.uuid);
      expect(row.content).toBe("Unique save content");
    });

    it("updates an existing Fact when duplicate UUID is supplied", async () => {
      const fact1 = createTestFact({ content: "Initial content" });
      const saved1 = await repo.save(fact1);

      const fact2 = Fact.create({
        uuid: fact1.uuid,
        type: "learning",
        project: "other-project",
        content: "Updated content",
        metadata: { updated: true },
        observedAt: new Date("2026-05-23T09:00:00Z")
      });

      const saved2 = await repo.save(fact2);
      expect(saved2.id).toBe(saved1.id);
      expect(saved2.content).toBe("Updated content");

      const count = db.prepare("SELECT COUNT(*) as count FROM facts").get() as { count: number };
      expect(count.count).toBe(1);

      const row = db.prepare("SELECT * FROM facts WHERE uuid = ?").get(fact1.uuid) as any;
      expect(row.content).toBe("Updated content");
      expect(row.project).toBe("other-project");
      expect(JSON.parse(row.metadata)).toEqual({ updated: true });
    });
  });

  describe("findById & findByUuid", () => {
    it("returns null if not found", async () => {
      expect(await repo.findById(999)).toBeNull();
      expect(await repo.findByUuid("nonexistent")).toBeNull();
    });

    it("returns entity for existing record", async () => {
      const fact = createTestFact();
      const saved = await repo.save(fact);

      const foundById = await repo.findById(saved.id!);
      expect(foundById).not.toBeNull();
      expect(foundById!.uuid).toBe(fact.uuid);

      const foundByUuid = await repo.findByUuid(fact.uuid);
      expect(foundByUuid).not.toBeNull();
      expect(foundByUuid!.id).toBe(saved.id);
    });
  });

  describe("findByProject", () => {
    it("returns array of facts matching project", async () => {
      await repo.save(createTestFact({ project: "proj-a", uuid: "1" }));
      await repo.save(createTestFact({ project: "proj-b", uuid: "2" }));
      await repo.save(createTestFact({ project: "proj-a", uuid: "3" }));

      const projAFacts = await repo.findByProject("proj-a");
      expect(projAFacts.length).toBe(2);
      expect(projAFacts.map(f => f.uuid).sort()).toEqual(["1", "3"]);
    });
  });

  describe("findRecent", () => {
    it("returns sorted recent facts up to limit", async () => {
      await repo.save(createTestFact({ uuid: "1", observedAt: new Date("2026-05-23T08:00:00Z") }));
      await repo.save(createTestFact({ uuid: "2", observedAt: new Date("2026-05-23T08:10:00Z") }));
      await repo.save(createTestFact({ uuid: "3", observedAt: new Date("2026-05-23T08:05:00Z") }));

      const recent = await repo.findRecent(2);
      expect(recent.length).toBe(2);
      // Sorted by observedAt DESC
      expect(recent[0].uuid).toBe("2");
      expect(recent[1].uuid).toBe("3");
    });
  });

  describe("search", () => {
    it("returns matching facts using FTS5 MATCH", async () => {
      await repo.save(createTestFact({ uuid: "1", content: "Optimize SQL index queries" }));
      await repo.save(createTestFact({ uuid: "2", content: "Unrelated topic" }));
      await repo.save(createTestFact({ uuid: "3", content: "SQL database queries are fast" }));

      const results = await repo.search("SQL");
      expect(results.length).toBe(2);
      expect(results.map(f => f.uuid).sort()).toEqual(["1", "3"]);
    });
  });

  describe("supersede", () => {
    it("marks a fact as superseded by a replacement uuid", async () => {
      const fact = createTestFact();
      await repo.save(fact);

      const supersededTime = new Date("2026-05-23T10:00:00Z");
      const replacementUuid = "replacement-uuid-12345";

      await repo.supersede(fact.uuid, supersededTime, replacementUuid);

      const updated = await repo.findByUuid(fact.uuid);
      expect(updated).not.toBeNull();
      expect(updated!.supersededAt).not.toBeNull();
      expect(updated!.supersededAt!.toISOString()).toBe(supersededTime.toISOString());
      expect(updated!.supersededBy).toBe(replacementUuid);
    });
  });

  describe("saveMany, findAll, clearAll", () => {
    it("saves multiple facts in a transaction, reads all, and clears all", async () => {
      const facts = [
        createTestFact({ uuid: "1" }),
        createTestFact({ uuid: "2" }),
        createTestFact({ uuid: "3" })
      ];

      const saved = await repo.saveMany(facts);
      expect(saved.length).toBe(3);
      expect(saved.every(f => f.id !== undefined)).toBe(true);

      const all = await repo.findAll();
      expect(all.length).toBe(3);

      await repo.clearAll();
      const cleared = await repo.findAll();
      expect(cleared.length).toBe(0);
    });
  });
});
