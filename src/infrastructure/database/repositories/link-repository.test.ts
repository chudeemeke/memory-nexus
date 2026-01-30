/**
 * SQLite Link Repository Tests
 *
 * Tests for SqliteLinkRepository implementation.
 * Verifies CRUD operations and WITH RECURSIVE graph traversal.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteLinkRepository } from "./link-repository.js";
import { Link } from "../../../domain/entities/link.js";
import { createSchema } from "../schema.js";

describe("SqliteLinkRepository", () => {
  let db: Database;
  let repository: SqliteLinkRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repository = new SqliteLinkRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper to create a test link
   */
  function createTestLink(
    overrides: Partial<{
      sourceType: "session" | "message" | "topic";
      sourceId: string;
      targetType: "session" | "message" | "topic";
      targetId: string;
      relationship: "mentions" | "related_to" | "continues";
      weight: number;
    }> = {}
  ): Link {
    return Link.create({
      sourceType: overrides.sourceType ?? "session",
      sourceId: overrides.sourceId ?? "source-1",
      targetType: overrides.targetType ?? "topic",
      targetId: overrides.targetId ?? "target-1",
      relationship: overrides.relationship ?? "mentions",
      weight: overrides.weight ?? 1.0,
    });
  }

  describe("save", () => {
    it("should save a new link", async () => {
      const link = createTestLink({
        sourceId: "session-123",
        targetId: "topic-abc",
      });

      await repository.save(link);

      const found = await repository.findBySource("session", "session-123");
      expect(found).toHaveLength(1);
      expect(found[0].sourceId).toBe("session-123");
      expect(found[0].targetId).toBe("topic-abc");
    });

    it("should update existing link with same source/target/relationship", async () => {
      const link1 = createTestLink({
        sourceId: "session-123",
        targetId: "topic-abc",
        weight: 0.5,
      });

      const link2 = createTestLink({
        sourceId: "session-123",
        targetId: "topic-abc",
        weight: 0.8,
      });

      await repository.save(link1);
      await repository.save(link2);

      const found = await repository.findBySource("session", "session-123");
      expect(found).toHaveLength(1);
      expect(found[0].weight).toBe(0.8);
    });

    it("should allow multiple links from same source to different targets", async () => {
      const link1 = createTestLink({
        sourceId: "session-123",
        targetId: "topic-a",
      });

      const link2 = createTestLink({
        sourceId: "session-123",
        targetId: "topic-b",
      });

      await repository.save(link1);
      await repository.save(link2);

      const found = await repository.findBySource("session", "session-123");
      expect(found).toHaveLength(2);
    });

    it("should preserve all link properties", async () => {
      const link = createTestLink({
        sourceType: "message",
        sourceId: "msg-1",
        targetType: "session",
        targetId: "sess-1",
        relationship: "continues",
        weight: 0.75,
      });

      await repository.save(link);

      const found = await repository.findBySource("message", "msg-1");
      expect(found).toHaveLength(1);
      expect(found[0].sourceType).toBe("message");
      expect(found[0].targetType).toBe("session");
      expect(found[0].relationship).toBe("continues");
      expect(found[0].weight).toBe(0.75);
    });
  });

  describe("saveMany", () => {
    it("should save multiple links in a transaction", async () => {
      const links = [
        createTestLink({ sourceId: "s1", targetId: "t1" }),
        createTestLink({ sourceId: "s2", targetId: "t2" }),
        createTestLink({ sourceId: "s3", targetId: "t3" }),
      ];

      await repository.saveMany(links);

      const found1 = await repository.findBySource("session", "s1");
      const found2 = await repository.findBySource("session", "s2");
      const found3 = await repository.findBySource("session", "s3");

      expect(found1).toHaveLength(1);
      expect(found2).toHaveLength(1);
      expect(found3).toHaveLength(1);
    });

    it("should handle empty array", async () => {
      await repository.saveMany([]);
      // Should not throw
    });

    it("should update existing links in batch", async () => {
      const link1 = createTestLink({
        sourceId: "session-1",
        targetId: "topic-1",
        weight: 0.3,
      });

      await repository.save(link1);

      const links = [
        createTestLink({
          sourceId: "session-1",
          targetId: "topic-1",
          weight: 0.9,
        }),
        createTestLink({ sourceId: "session-2", targetId: "topic-2" }),
      ];

      await repository.saveMany(links);

      const found1 = await repository.findBySource("session", "session-1");
      const found2 = await repository.findBySource("session", "session-2");

      expect(found1).toHaveLength(1);
      expect(found1[0].weight).toBe(0.9);
      expect(found2).toHaveLength(1);
    });

    it("should handle bulk insert of 100+ links", async () => {
      const links: Link[] = [];
      for (let i = 0; i < 150; i++) {
        links.push(
          createTestLink({
            sourceId: `session-${i}`,
            targetId: `topic-${i}`,
          })
        );
      }

      await repository.saveMany(links);

      // Verify a sample
      const found50 = await repository.findBySource("session", "session-50");
      const found100 = await repository.findBySource("session", "session-100");

      expect(found50).toHaveLength(1);
      expect(found100).toHaveLength(1);
    });
  });

  describe("findBySource", () => {
    it("should find all links from a source entity", async () => {
      const links = [
        createTestLink({
          sourceId: "session-1",
          targetId: "topic-a",
        }),
        createTestLink({
          sourceId: "session-1",
          targetId: "topic-b",
        }),
        createTestLink({
          sourceId: "session-2",
          targetId: "topic-c",
        }),
      ];

      await repository.saveMany(links);

      const found = await repository.findBySource("session", "session-1");

      expect(found).toHaveLength(2);
      const targetIds = found.map((l) => l.targetId).sort();
      expect(targetIds).toEqual(["topic-a", "topic-b"]);
    });

    it("should return empty array for non-existent source", async () => {
      const found = await repository.findBySource("session", "non-existent");
      expect(found).toHaveLength(0);
    });

    it("should filter by entity type", async () => {
      const links = [
        createTestLink({
          sourceType: "session",
          sourceId: "entity-1",
          targetId: "t1",
        }),
        createTestLink({
          sourceType: "message",
          sourceId: "entity-1",
          targetId: "t2",
        }),
      ];

      await repository.saveMany(links);

      const sessionLinks = await repository.findBySource("session", "entity-1");
      const messageLinks = await repository.findBySource("message", "entity-1");

      expect(sessionLinks).toHaveLength(1);
      expect(sessionLinks[0].targetId).toBe("t1");
      expect(messageLinks).toHaveLength(1);
      expect(messageLinks[0].targetId).toBe("t2");
    });
  });

  describe("findByTarget", () => {
    it("should find all links pointing to a target entity", async () => {
      const links = [
        createTestLink({
          sourceId: "session-1",
          targetId: "topic-x",
        }),
        createTestLink({
          sourceId: "session-2",
          targetId: "topic-x",
        }),
        createTestLink({
          sourceId: "session-3",
          targetId: "topic-y",
        }),
      ];

      await repository.saveMany(links);

      const found = await repository.findByTarget("topic", "topic-x");

      expect(found).toHaveLength(2);
      const sourceIds = found.map((l) => l.sourceId).sort();
      expect(sourceIds).toEqual(["session-1", "session-2"]);
    });

    it("should return empty array for non-existent target", async () => {
      const found = await repository.findByTarget("topic", "non-existent");
      expect(found).toHaveLength(0);
    });

    it("should filter by entity type", async () => {
      const links = [
        createTestLink({
          sourceId: "s1",
          targetType: "topic",
          targetId: "entity-1",
        }),
        createTestLink({
          sourceId: "s2",
          targetType: "session",
          targetId: "entity-1",
        }),
      ];

      await repository.saveMany(links);

      const topicLinks = await repository.findByTarget("topic", "entity-1");
      const sessionLinks = await repository.findByTarget("session", "entity-1");

      expect(topicLinks).toHaveLength(1);
      expect(topicLinks[0].sourceId).toBe("s1");
      expect(sessionLinks).toHaveLength(1);
      expect(sessionLinks[0].sourceId).toBe("s2");
    });
  });

  describe("findRelated - graph traversal", () => {
    it("should return empty array when no relationships exist", async () => {
      const found = await repository.findRelated("session", "non-existent");
      expect(found).toHaveLength(0);
    });

    it("should return 1-hop relationships", async () => {
      // session-1 -> topic-a
      await repository.save(
        createTestLink({
          sourceId: "session-1",
          targetType: "topic",
          targetId: "topic-a",
        })
      );

      const found = await repository.findRelated("session", "session-1");

      expect(found).toHaveLength(1);
      expect(found[0].targetId).toBe("topic-a");
    });

    it("should return 2-hop relationships with recursive CTE", async () => {
      // session-1 -> topic-a (1-hop)
      // topic-a -> session-2 (2-hop from session-1)
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "session-1",
          targetType: "topic",
          targetId: "topic-a",
          relationship: "mentions",
          weight: 0.8,
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "topic-a",
          targetType: "session",
          targetId: "session-2",
          relationship: "related_to",
          weight: 0.9,
        }),
      ]);

      const found = await repository.findRelated("session", "session-1", 2);

      expect(found).toHaveLength(2);
      // First should be 1-hop
      expect(found[0].targetId).toBe("topic-a");
      // Second should be 2-hop
      expect(found[1].targetId).toBe("session-2");
    });

    it("should prevent cycles in traversal", async () => {
      // Create a cycle: A -> B -> A
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "session-a",
          targetType: "session",
          targetId: "session-b",
          relationship: "continues",
          weight: 1.0,
        }),
        Link.create({
          sourceType: "session",
          sourceId: "session-b",
          targetType: "session",
          targetId: "session-a",
          relationship: "continues",
          weight: 1.0,
        }),
      ]);

      // Should not loop infinitely
      const found = await repository.findRelated("session", "session-a", 10);

      // Should only find session-b once, not cycle back to session-a
      const targetIds = found.map((l) => l.targetId);
      expect(targetIds).toContain("session-b");
      // session-a should not appear in results (it's the starting node)
      // Actually, it could appear if B->A is traversed. Let's verify no duplicates.
      const uniqueTargets = [...new Set(targetIds)];
      expect(uniqueTargets.length).toBe(targetIds.length);
    });

    it("should limit traversal with maxHops=1", async () => {
      // Create 3-hop chain: A -> B -> C -> D
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "A",
          targetType: "topic",
          targetId: "B",
          relationship: "mentions",
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "B",
          targetType: "message",
          targetId: "C",
          relationship: "related_to",
        }),
        Link.create({
          sourceType: "message",
          sourceId: "C",
          targetType: "session",
          targetId: "D",
          relationship: "continues",
        }),
      ]);

      const found = await repository.findRelated("session", "A", 1);

      // Should only find B (1-hop), not C or D
      expect(found).toHaveLength(1);
      expect(found[0].targetId).toBe("B");
    });

    it("should sort results by hop count then weight", async () => {
      // Create mixed hops with different weights
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "start",
          targetType: "topic",
          targetId: "t1",
          relationship: "mentions",
          weight: 0.5, // 1-hop, lower weight
        }),
        Link.create({
          sourceType: "session",
          sourceId: "start",
          targetType: "topic",
          targetId: "t2",
          relationship: "mentions",
          weight: 0.9, // 1-hop, higher weight
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "t1",
          targetType: "session",
          targetId: "s2",
          relationship: "related_to",
          weight: 1.0, // 2-hop
        }),
      ]);

      const found = await repository.findRelated("session", "start", 2);

      // 1-hop should come first, higher weight first among same hop
      expect(found).toHaveLength(3);
      expect(found[0].targetId).toBe("t2"); // 1-hop, 0.9
      expect(found[1].targetId).toBe("t1"); // 1-hop, 0.5
      expect(found[2].targetId).toBe("s2"); // 2-hop
    });
  });

  describe("findRelatedWithHops - extended results", () => {
    it("should return hop count with each result", async () => {
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "session-1",
          targetType: "topic",
          targetId: "topic-a",
          relationship: "mentions",
          weight: 0.8,
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "topic-a",
          targetType: "session",
          targetId: "session-2",
          relationship: "related_to",
          weight: 0.9,
        }),
      ]);

      const found = await repository.findRelatedWithHops(
        "session",
        "session-1",
        2
      );

      expect(found).toHaveLength(2);
      expect(found[0].hop).toBe(1);
      expect(found[0].link.targetId).toBe("topic-a");
      expect(found[1].hop).toBe(2);
      expect(found[1].link.targetId).toBe("session-2");
    });

    it("should apply weight decay through multi-hop path", async () => {
      // 0.8 * 0.9 = 0.72 for 2-hop
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "session-1",
          targetType: "topic",
          targetId: "topic-a",
          relationship: "mentions",
          weight: 0.8,
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "topic-a",
          targetType: "session",
          targetId: "session-2",
          relationship: "related_to",
          weight: 0.9,
        }),
      ]);

      const found = await repository.findRelatedWithHops(
        "session",
        "session-1",
        2
      );

      expect(found).toHaveLength(2);
      // First hop should maintain original weight
      expect(found[0].link.weight).toBe(0.8);
      // Second hop should have decayed weight (0.8 * 0.9 = 0.72)
      expect(found[1].link.weight).toBeCloseTo(0.72, 2);
    });

    it("should handle complex graph with multiple paths", async () => {
      // Complex graph:
      // start -> A (0.8) -> C (0.5)
      // start -> B (0.6) -> C (0.7)
      await repository.saveMany([
        Link.create({
          sourceType: "session",
          sourceId: "start",
          targetType: "topic",
          targetId: "A",
          relationship: "mentions",
          weight: 0.8,
        }),
        Link.create({
          sourceType: "session",
          sourceId: "start",
          targetType: "topic",
          targetId: "B",
          relationship: "mentions",
          weight: 0.6,
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "A",
          targetType: "message",
          targetId: "C",
          relationship: "related_to",
          weight: 0.5,
        }),
        Link.create({
          sourceType: "topic",
          sourceId: "B",
          targetType: "message",
          targetId: "C",
          relationship: "related_to",
          weight: 0.7,
        }),
      ]);

      const found = await repository.findRelatedWithHops("session", "start", 2);

      // Should find A, B (1-hop) and C (2-hop) - C appears via both paths
      // DISTINCT should deduplicate C entries
      const hop1Results = found.filter((r) => r.hop === 1);
      const hop2Results = found.filter((r) => r.hop === 2);

      expect(hop1Results).toHaveLength(2);
      expect(hop2Results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Link entity validation", () => {
    it("should reject invalid entity types through Link.create", () => {
      expect(() =>
        Link.create({
          sourceType: "invalid" as "session",
          sourceId: "s1",
          targetType: "topic",
          targetId: "t1",
          relationship: "mentions",
        })
      ).toThrow("Invalid source type");
    });

    it("should reject empty source ID through Link.create", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "",
          targetType: "topic",
          targetId: "t1",
          relationship: "mentions",
        })
      ).toThrow("Source ID cannot be empty");
    });

    it("should reject empty target ID through Link.create", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "s1",
          targetType: "topic",
          targetId: "",
          relationship: "mentions",
        })
      ).toThrow("Target ID cannot be empty");
    });

    it("should reject invalid weight through Link.create", () => {
      expect(() =>
        Link.create({
          sourceType: "session",
          sourceId: "s1",
          targetType: "topic",
          targetId: "t1",
          relationship: "mentions",
          weight: 1.5,
        })
      ).toThrow("Weight must be between 0 and 1");
    });
  });
});
