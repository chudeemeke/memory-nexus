/**
 * SqliteEntityRepository Tests
 *
 * Tests for entity persistence with deduplication,
 * session linking, and entity-entity relationships.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteEntityRepository } from "./entity-repository.js";
import { Entity } from "../../../domain/entities/entity.js";
import { createSchema } from "../schema.js";

describe("SqliteEntityRepository", () => {
  let db: Database;
  let repo: SqliteEntityRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repo = new SqliteEntityRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("save", () => {
    it("inserts new entity and returns with id", async () => {
      const entity = Entity.create({
        type: "concept",
        name: "hexagonal architecture",
        confidence: 0.9,
      });

      const saved = await repo.save(entity);

      expect(saved.id).toBeDefined();
      expect(saved.id).toBeGreaterThan(0);
      expect(saved.name).toBe("hexagonal architecture");
      expect(saved.type).toBe("concept");
      expect(saved.confidence).toBe(0.9);
    });

    it("updates confidence to max when entity exists", async () => {
      const entity1 = Entity.create({
        type: "file",
        name: "/src/index.ts",
        confidence: 0.7,
      });
      const entity2 = Entity.create({
        type: "file",
        name: "/src/index.ts",
        confidence: 0.9,
      });

      const saved1 = await repo.save(entity1);
      const saved2 = await repo.save(entity2);

      // Should have same id (upsert)
      expect(saved2.id).toBe(saved1.id);
      // Confidence should be max of both
      expect(saved2.confidence).toBe(0.9);
    });

    it("preserves existing higher confidence on upsert", async () => {
      const entity1 = Entity.create({
        type: "concept",
        name: "DDD",
        confidence: 0.95,
      });
      const entity2 = Entity.create({
        type: "concept",
        name: "DDD",
        confidence: 0.7,
      });

      await repo.save(entity1);
      const saved2 = await repo.save(entity2);

      // Should keep the higher confidence
      expect(saved2.confidence).toBe(0.95);
    });

    it("stores and retrieves metadata as JSON", async () => {
      const entity = Entity.create({
        type: "decision",
        name: "use sqlite over postgres",
        confidence: 1.0,
        metadata: {
          subject: "database choice",
          decision: "SQLite",
          rejected: ["PostgreSQL", "MySQL"],
          rationale: "Embedded, no server needed",
        },
      });

      const saved = await repo.save(entity);
      const found = await repo.findById(saved.id!);

      expect(found).not.toBeNull();
      expect(found!.metadata).toEqual({
        subject: "database choice",
        decision: "SQLite",
        rejected: ["PostgreSQL", "MySQL"],
        rationale: "Embedded, no server needed",
      });
    });
  });

  describe("findById", () => {
    it("returns entity when found", async () => {
      const entity = Entity.create({
        type: "term",
        name: "FTS5",
        confidence: 0.85,
      });
      const saved = await repo.save(entity);

      const found = await repo.findById(saved.id!);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.name).toBe("FTS5");
    });

    it("returns null when not found", async () => {
      const found = await repo.findById(99999);
      expect(found).toBeNull();
    });
  });

  describe("findByName", () => {
    it("returns entity with exact name match", async () => {
      const entity = Entity.create({
        type: "concept",
        name: "Repository Pattern",
        confidence: 0.9,
      });
      await repo.save(entity);

      const found = await repo.findByName("concept", "Repository Pattern");

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Repository Pattern");
    });

    it("uses case-insensitive matching", async () => {
      const entity = Entity.create({
        type: "file",
        name: "/SRC/INDEX.TS",
        confidence: 0.8,
      });
      await repo.save(entity);

      // Search with different case
      const found = await repo.findByName("file", "/src/index.ts");

      expect(found).not.toBeNull();
      // Should return the entity with original name
      expect(found!.name).toBe("/SRC/INDEX.TS");
    });

    it("trims whitespace from search name", async () => {
      const entity = Entity.create({
        type: "term",
        name: "BM25",
        confidence: 0.9,
      });
      await repo.save(entity);

      const found = await repo.findByName("term", "  BM25  ");

      expect(found).not.toBeNull();
      expect(found!.name).toBe("BM25");
    });

    it("returns null when type does not match", async () => {
      const entity = Entity.create({
        type: "concept",
        name: "SOLID",
        confidence: 0.9,
      });
      await repo.save(entity);

      const found = await repo.findByName("term", "SOLID");

      expect(found).toBeNull();
    });

    it("returns null when name does not match", async () => {
      const found = await repo.findByName("concept", "nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("findBySession", () => {
    beforeEach(() => {
      // Create test session
      db.run(
        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
         VALUES (?, ?, ?, ?, ?)`,
        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
      );
    });

    it("returns all entities linked to a session", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "TDD", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "file", name: "/test.ts", confidence: 0.8 })
      );
      const e3 = await repo.save(
        Entity.create({ type: "term", name: "mock", confidence: 0.7 })
      );

      await repo.linkToSession(e1.id!, "session-1");
      await repo.linkToSession(e2.id!, "session-1");
      // e3 not linked

      const found = await repo.findBySession("session-1");

      expect(found).toHaveLength(2);
      const names = found.map((e) => e.name);
      expect(names).toContain("TDD");
      expect(names).toContain("/test.ts");
      expect(names).not.toContain("mock");
    });

    it("returns empty array when no entities linked", async () => {
      const found = await repo.findBySession("session-1");
      expect(found).toEqual([]);
    });
  });

  describe("findByType", () => {
    beforeEach(async () => {
      await repo.save(
        Entity.create({ type: "concept", name: "A", confidence: 0.9 })
      );
      await repo.save(
        Entity.create({ type: "concept", name: "B", confidence: 0.7 })
      );
      await repo.save(
        Entity.create({ type: "concept", name: "C", confidence: 0.5 })
      );
      await repo.save(
        Entity.create({ type: "file", name: "/a.ts", confidence: 0.8 })
      );
    });

    it("returns all entities of specified type", async () => {
      const concepts = await repo.findByType("concept");

      expect(concepts).toHaveLength(3);
      concepts.forEach((e) => expect(e.type).toBe("concept"));
    });

    it("respects limit option", async () => {
      const concepts = await repo.findByType("concept", { limit: 2 });

      expect(concepts).toHaveLength(2);
    });

    it("respects minConfidence option", async () => {
      const concepts = await repo.findByType("concept", { minConfidence: 0.8 });

      expect(concepts).toHaveLength(1);
      expect(concepts[0].name).toBe("A");
    });

    it("combines limit and minConfidence options", async () => {
      const concepts = await repo.findByType("concept", {
        limit: 10,
        minConfidence: 0.6,
      });

      expect(concepts).toHaveLength(2);
      const names = concepts.map((e) => e.name);
      expect(names).toContain("A");
      expect(names).toContain("B");
    });

    it("returns empty array when no entities of type", async () => {
      const decisions = await repo.findByType("decision");
      expect(decisions).toEqual([]);
    });
  });

  describe("linkToSession", () => {
    beforeEach(() => {
      // Create test session
      db.run(
        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
         VALUES (?, ?, ?, ?, ?)`,
        ["session-1", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
      );
    });

    it("creates session-entity link", async () => {
      const entity = await repo.save(
        Entity.create({ type: "concept", name: "link test", confidence: 0.9 })
      );

      await repo.linkToSession(entity.id!, "session-1");

      const found = await repo.findBySession("session-1");
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe("link test");
    });

    it("increments frequency on duplicate link", async () => {
      const entity = await repo.save(
        Entity.create({ type: "concept", name: "freq test", confidence: 0.9 })
      );

      await repo.linkToSession(entity.id!, "session-1", 1);
      await repo.linkToSession(entity.id!, "session-1", 3);

      // Check frequency in DB
      const row = db.query<{ frequency: number }, [number, string]>(
        "SELECT frequency FROM session_entities WHERE entity_id = ? AND session_id = ?"
      ).get(entity.id!, "session-1");

      // Frequency should be sum: 1 + 3 = 4
      expect(row?.frequency).toBe(4);
    });

    it("uses default frequency of 1", async () => {
      const entity = await repo.save(
        Entity.create({ type: "file", name: "/test.ts", confidence: 0.9 })
      );

      await repo.linkToSession(entity.id!, "session-1");

      const row = db.query<{ frequency: number }, [number, string]>(
        "SELECT frequency FROM session_entities WHERE entity_id = ? AND session_id = ?"
      ).get(entity.id!, "session-1");

      expect(row?.frequency).toBe(1);
    });
  });

  describe("linkEntities", () => {
    it("creates entity-entity relationship", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "TDD", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "concept", name: "Unit Testing", confidence: 0.9 })
      );

      await repo.linkEntities(e1.id!, e2.id!, "related");

      const row = db.query<
        { source_id: number; target_id: number; relationship: string },
        [number, number]
      >(
        "SELECT source_id, target_id, relationship FROM entity_links WHERE source_id = ? AND target_id = ?"
      ).get(e1.id!, e2.id!);

      expect(row).not.toBeNull();
      expect(row!.relationship).toBe("related");
    });

    it("stores weight for relationship", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "A", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "concept", name: "B", confidence: 0.9 })
      );

      await repo.linkEntities(e1.id!, e2.id!, "implies", 0.8);

      const row = db.query<{ weight: number }, [number, number]>(
        "SELECT weight FROM entity_links WHERE source_id = ? AND target_id = ?"
      ).get(e1.id!, e2.id!);

      expect(row?.weight).toBe(0.8);
    });

    it("uses default weight of 1.0", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "X", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "concept", name: "Y", confidence: 0.9 })
      );

      await repo.linkEntities(e1.id!, e2.id!, "contradicts");

      const row = db.query<{ weight: number }, [number, number]>(
        "SELECT weight FROM entity_links WHERE source_id = ? AND target_id = ?"
      ).get(e1.id!, e2.id!);

      expect(row?.weight).toBe(1.0);
    });

    it("ignores duplicate relationships (INSERT OR IGNORE)", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "P", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "concept", name: "Q", confidence: 0.9 })
      );

      await repo.linkEntities(e1.id!, e2.id!, "related", 0.5);
      await repo.linkEntities(e1.id!, e2.id!, "related", 0.9);

      const rows = db.query<unknown, [number, number]>(
        "SELECT * FROM entity_links WHERE source_id = ? AND target_id = ?"
      ).all(e1.id!, e2.id!);

      // Should only have one row
      expect(rows).toHaveLength(1);
    });
  });

  describe("saveMany", () => {
    it("batch inserts entities with transaction", async () => {
      const entities = [
        Entity.create({ type: "concept", name: "batch-1", confidence: 0.9 }),
        Entity.create({ type: "concept", name: "batch-2", confidence: 0.8 }),
        Entity.create({ type: "file", name: "/batch.ts", confidence: 0.7 }),
      ];

      const saved = await repo.saveMany(entities);

      expect(saved).toHaveLength(3);
      saved.forEach((e) => {
        expect(e.id).toBeDefined();
        expect(e.id).toBeGreaterThan(0);
      });
    });

    it("handles duplicates within batch", async () => {
      const entities = [
        Entity.create({ type: "concept", name: "dup", confidence: 0.7 }),
        Entity.create({ type: "concept", name: "dup", confidence: 0.9 }),
      ];

      const saved = await repo.saveMany(entities);

      // Both should have same id
      expect(saved[0].id).toBe(saved[1].id);
      // Second one should have higher confidence
      expect(saved[1].confidence).toBe(0.9);
    });

    it("returns empty array for empty input", async () => {
      const saved = await repo.saveMany([]);
      expect(saved).toEqual([]);
    });
  });

  describe("CASCADE delete", () => {
    beforeEach(() => {
      // Create test session
      db.run(
        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
         VALUES (?, ?, ?, ?, ?)`,
        ["session-del", "C--Users-test", "C:\\Users\\test", "test", new Date().toISOString()]
      );
    });

    it("removes session_entities links when session deleted", async () => {
      const entity = await repo.save(
        Entity.create({ type: "concept", name: "cascade-test", confidence: 0.9 })
      );
      await repo.linkToSession(entity.id!, "session-del");

      // Verify link exists
      let found = await repo.findBySession("session-del");
      expect(found).toHaveLength(1);

      // Delete session
      db.run("DELETE FROM sessions WHERE id = ?", ["session-del"]);

      // Link should be gone (CASCADE)
      const row = db.query<unknown, [string]>(
        "SELECT * FROM session_entities WHERE session_id = ?"
      ).get("session-del");
      expect(row).toBeNull();
    });

    it("removes entity_links when entity deleted", async () => {
      const e1 = await repo.save(
        Entity.create({ type: "concept", name: "src", confidence: 0.9 })
      );
      const e2 = await repo.save(
        Entity.create({ type: "concept", name: "tgt", confidence: 0.9 })
      );
      await repo.linkEntities(e1.id!, e2.id!, "related");

      // Verify link exists
      let row = db.query<unknown, [number]>(
        "SELECT * FROM entity_links WHERE source_id = ?"
      ).get(e1.id!);
      expect(row).not.toBeNull();

      // Delete source entity
      db.run("DELETE FROM entities WHERE id = ?", [e1.id!]);

      // Link should be gone (CASCADE)
      row = db.query<unknown, [number]>(
        "SELECT * FROM entity_links WHERE source_id = ?"
      ).get(e1.id!);
      expect(row).toBeNull();
    });
  });
});
