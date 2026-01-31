/**
 * Entity Domain Type Tests
 *
 * Validates Entity creation, validation, type variants, and metadata handling.
 */

import { describe, it, expect } from "bun:test";
import {
  Entity,
  type ExtractedEntityType,
  type DecisionMetadata,
  type FileMetadata,
  type ConceptMetadata,
  type TermMetadata,
} from "./entity.js";

describe("Entity", () => {
  describe("create()", () => {
    it("should create entity with valid params", () => {
      const entity = Entity.create({
        type: "concept",
        name: "hexagonal architecture",
        confidence: 0.9,
      });

      expect(entity.type).toBe("concept");
      expect(entity.name).toBe("hexagonal architecture");
      expect(entity.confidence).toBe(0.9);
      expect(entity.id).toBeUndefined();
      expect(entity.metadata).toBeUndefined();
    });

    it("should create entity with id", () => {
      const entity = Entity.create({
        id: 42,
        type: "file",
        name: "/src/index.ts",
        confidence: 1.0,
      });

      expect(entity.id).toBe(42);
    });

    it("should create entity with metadata", () => {
      const metadata: ConceptMetadata = { category: "architecture" };
      const entity = Entity.create({
        type: "concept",
        name: "DDD",
        confidence: 0.85,
        metadata,
      });

      expect(entity.metadata).toEqual(metadata);
    });

    it("should create entity with createdAt", () => {
      const date = new Date("2026-01-31T10:00:00Z");
      const entity = Entity.create({
        type: "term",
        name: "FTS5",
        confidence: 1.0,
        createdAt: date,
      });

      expect(entity.createdAt).toEqual(date);
    });

    it("should throw on empty name", () => {
      expect(() =>
        Entity.create({
          type: "concept",
          name: "",
          confidence: 0.9,
        })
      ).toThrow("Entity name cannot be empty");
    });

    it("should throw on whitespace-only name", () => {
      expect(() =>
        Entity.create({
          type: "concept",
          name: "   ",
          confidence: 0.9,
        })
      ).toThrow("Entity name cannot be empty");
    });

    it("should throw on confidence less than 0", () => {
      expect(() =>
        Entity.create({
          type: "concept",
          name: "test",
          confidence: -0.1,
        })
      ).toThrow("Confidence must be between 0 and 1");
    });

    it("should throw on confidence greater than 1", () => {
      expect(() =>
        Entity.create({
          type: "concept",
          name: "test",
          confidence: 1.1,
        })
      ).toThrow("Confidence must be between 0 and 1");
    });

    it("should accept confidence at boundary 0", () => {
      const entity = Entity.create({
        type: "concept",
        name: "low confidence",
        confidence: 0,
      });

      expect(entity.confidence).toBe(0);
    });

    it("should accept confidence at boundary 1", () => {
      const entity = Entity.create({
        type: "concept",
        name: "high confidence",
        confidence: 1,
      });

      expect(entity.confidence).toBe(1);
    });

    it("should throw on invalid type", () => {
      expect(() =>
        Entity.create({
          type: "invalid" as ExtractedEntityType,
          name: "test",
          confidence: 0.9,
        })
      ).toThrow("Invalid entity type");
    });
  });

  describe("Decision entity validation", () => {
    it("should create decision with valid metadata", () => {
      const metadata: DecisionMetadata = {
        subject: "database",
        decision: "Use SQLite with FTS5",
        rejected: ["PostgreSQL", "MongoDB"],
        rationale: "Embedded database for simplicity",
      };

      const entity = Entity.create({
        type: "decision",
        name: "Database Selection",
        confidence: 0.95,
        metadata,
      });

      expect(entity.type).toBe("decision");
      expect(entity.metadata).toEqual(metadata);
    });

    it("should throw when decision lacks subject", () => {
      const metadata = {
        decision: "Use SQLite",
        rejected: [],
        rationale: "Simple",
      } as unknown as DecisionMetadata;

      expect(() =>
        Entity.create({
          type: "decision",
          name: "DB Choice",
          confidence: 0.9,
          metadata,
        })
      ).toThrow("Decision metadata requires subject and decision fields");
    });

    it("should throw when decision lacks decision field", () => {
      const metadata = {
        subject: "database",
        rejected: [],
        rationale: "Simple",
      } as unknown as DecisionMetadata;

      expect(() =>
        Entity.create({
          type: "decision",
          name: "DB Choice",
          confidence: 0.9,
          metadata,
        })
      ).toThrow("Decision metadata requires subject and decision fields");
    });

    it("should throw when decision has no metadata", () => {
      expect(() =>
        Entity.create({
          type: "decision",
          name: "DB Choice",
          confidence: 0.9,
        })
      ).toThrow("Decision metadata requires subject and decision fields");
    });

    it("should accept decision with empty rejected array", () => {
      const metadata: DecisionMetadata = {
        subject: "testing",
        decision: "Use Bun test",
        rejected: [],
        rationale: "Native to Bun runtime",
      };

      const entity = Entity.create({
        type: "decision",
        name: "Test Framework",
        confidence: 1.0,
        metadata,
      });

      expect(entity.isDecision).toBe(true);
    });
  });

  describe("Entity type variants", () => {
    it("should create concept entity", () => {
      const entity = Entity.create({
        type: "concept",
        name: "hexagonal architecture",
        confidence: 0.9,
        metadata: { category: "architecture" } as ConceptMetadata,
      });

      expect(entity.type).toBe("concept");
      expect(entity.isConcept).toBe(true);
      expect(entity.isFile).toBe(false);
      expect(entity.isDecision).toBe(false);
      expect(entity.isTerm).toBe(false);
    });

    it("should create file entity", () => {
      const entity = Entity.create({
        type: "file",
        name: "/src/domain/entities/entity.ts",
        confidence: 1.0,
        metadata: { operation: "write", lineCount: 150 } as FileMetadata,
      });

      expect(entity.type).toBe("file");
      expect(entity.isFile).toBe(true);
      expect(entity.isConcept).toBe(false);
      expect(entity.isDecision).toBe(false);
      expect(entity.isTerm).toBe(false);
    });

    it("should create decision entity", () => {
      const metadata: DecisionMetadata = {
        subject: "ORM",
        decision: "No ORM, raw SQL",
        rejected: ["TypeORM", "Prisma"],
        rationale: "Direct control over queries",
      };

      const entity = Entity.create({
        type: "decision",
        name: "ORM Usage",
        confidence: 0.85,
        metadata,
      });

      expect(entity.type).toBe("decision");
      expect(entity.isDecision).toBe(true);
      expect(entity.isConcept).toBe(false);
      expect(entity.isFile).toBe(false);
      expect(entity.isTerm).toBe(false);
    });

    it("should create term entity", () => {
      const entity = Entity.create({
        type: "term",
        name: "FTS5",
        confidence: 1.0,
        metadata: { definition: "Full-text search extension for SQLite" } as TermMetadata,
      });

      expect(entity.type).toBe("term");
      expect(entity.isTerm).toBe(true);
      expect(entity.isConcept).toBe(false);
      expect(entity.isFile).toBe(false);
      expect(entity.isDecision).toBe(false);
    });
  });

  describe("Immutability", () => {
    it("should return defensive copy for metadata object", () => {
      const metadata: ConceptMetadata = { category: "patterns" };
      const entity = Entity.create({
        type: "concept",
        name: "Adapter Pattern",
        confidence: 0.9,
        metadata,
      });

      const retrieved = entity.metadata as ConceptMetadata;
      if (retrieved) {
        retrieved.category = "modified";
      }

      expect((entity.metadata as ConceptMetadata)?.category).toBe("patterns");
    });

    it("should return defensive copy for createdAt", () => {
      const date = new Date("2026-01-31T10:00:00Z");
      const entity = Entity.create({
        type: "concept",
        name: "Test",
        confidence: 1.0,
        createdAt: date,
      });

      const retrieved = entity.createdAt;
      if (retrieved) {
        retrieved.setFullYear(2000);
      }

      expect(entity.createdAt?.getFullYear()).toBe(2026);
    });
  });

  describe("equals()", () => {
    it("should compare by id when both have ids", () => {
      const entity1 = Entity.create({
        id: 1,
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      const entity2 = Entity.create({
        id: 1,
        type: "file", // Different type
        name: "other", // Different name
        confidence: 0.5,
      });

      expect(entity1.equals(entity2)).toBe(true);
    });

    it("should return false for different ids", () => {
      const entity1 = Entity.create({
        id: 1,
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      const entity2 = Entity.create({
        id: 2,
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      expect(entity1.equals(entity2)).toBe(false);
    });

    it("should compare by type+name when ids not set", () => {
      const entity1 = Entity.create({
        type: "concept",
        name: "hexagonal",
        confidence: 0.9,
      });

      const entity2 = Entity.create({
        type: "concept",
        name: "hexagonal",
        confidence: 0.5, // Different confidence
      });

      expect(entity1.equals(entity2)).toBe(true);
    });

    it("should return false for different type+name without ids", () => {
      const entity1 = Entity.create({
        type: "concept",
        name: "hexagonal",
        confidence: 0.9,
      });

      const entity2 = Entity.create({
        type: "term",
        name: "hexagonal",
        confidence: 0.9,
      });

      expect(entity1.equals(entity2)).toBe(false);
    });

    it("should compare by type+name when only one has id", () => {
      const entity1 = Entity.create({
        id: 1,
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      const entity2 = Entity.create({
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      expect(entity1.equals(entity2)).toBe(true);
    });
  });

  describe("withId()", () => {
    it("should return new entity with id assigned", () => {
      const entity = Entity.create({
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      const withId = entity.withId(42);

      expect(withId.id).toBe(42);
      expect(withId.type).toBe("concept");
      expect(withId.name).toBe("test");
      expect(withId.confidence).toBe(0.9);
    });

    it("should preserve all properties when assigning id", () => {
      const metadata: ConceptMetadata = { category: "testing" };
      const date = new Date("2026-01-31T10:00:00Z");

      const entity = Entity.create({
        type: "concept",
        name: "test",
        confidence: 0.9,
        metadata,
        createdAt: date,
      });

      const withId = entity.withId(42);

      expect(withId.metadata).toEqual(metadata);
      expect(withId.createdAt).toEqual(date);
    });

    it("should not modify original entity", () => {
      const entity = Entity.create({
        type: "concept",
        name: "test",
        confidence: 0.9,
      });

      entity.withId(42);

      expect(entity.id).toBeUndefined();
    });
  });
});
