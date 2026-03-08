/**
 * MemoryFile Entity Tests
 *
 * Verifies the MemoryFile domain entity behavior:
 * - Creation with valid parameters
 * - Validation of required fields
 * - Immutability guarantees
 * - All four MemoryFileType variants
 */

import { describe, it, expect } from "bun:test";
import { MemoryFile } from "./memory-file.js";
import type { MemoryFileType } from "./memory-file.js";

describe("MemoryFile Entity", () => {
  const validParams = {
    filePath: "daily/2026-03-07.md",
    fileType: "daily_log" as MemoryFileType,
    content: "# 2026-03-07\n\nSession content",
    contentHash: "a".repeat(64),
    lastIndexedAt: new Date("2026-03-07T10:00:00Z"),
  };

  describe("create() with valid params", () => {
    it("creates a MemoryFile with all required fields", () => {
      const file = MemoryFile.create(validParams);

      expect(file.filePath).toBe("daily/2026-03-07.md");
      expect(file.fileType).toBe("daily_log");
      expect(file.content).toBe("# 2026-03-07\n\nSession content");
      expect(file.contentHash).toBe("a".repeat(64));
      expect(file.lastIndexedAt).toEqual(new Date("2026-03-07T10:00:00Z"));
    });

    it("defaults id to undefined when not provided", () => {
      const file = MemoryFile.create(validParams);
      expect(file.id).toBeUndefined();
    });

    it("defaults projectEncoded to undefined when not provided", () => {
      const file = MemoryFile.create(validParams);
      expect(file.projectEncoded).toBeUndefined();
    });

    it("defaults createdAt to current time when not provided", () => {
      const before = new Date();
      const file = MemoryFile.create(validParams);
      const after = new Date();

      expect(file.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(file.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("creates with explicit createdAt when provided", () => {
      const createdAt = new Date("2026-01-01T00:00:00Z");
      const file = MemoryFile.create({ ...validParams, createdAt });

      expect(file.createdAt).toEqual(createdAt);
    });

    it("creates with project-scoped file", () => {
      const file = MemoryFile.create({
        filePath: "projects/C--Users-Destiny-Projects-kanbanflow/DECISIONS.md",
        fileType: "decisions",
        projectEncoded: "C--Users-Destiny-Projects-kanbanflow",
        content: "# Decisions\n\nUsed Redis for caching",
        contentHash: "b".repeat(64),
        lastIndexedAt: new Date("2026-03-07T12:00:00Z"),
      });

      expect(file.filePath).toBe(
        "projects/C--Users-Destiny-Projects-kanbanflow/DECISIONS.md"
      );
      expect(file.fileType).toBe("decisions");
      expect(file.projectEncoded).toBe(
        "C--Users-Destiny-Projects-kanbanflow"
      );
    });

    it("creates with id provided (database-loaded entities)", () => {
      const file = MemoryFile.create({ ...validParams, id: 42 });

      expect(file.id).toBe(42);
      expect(file.filePath).toBe(validParams.filePath);
    });
  });

  describe("create() validates fileType", () => {
    it("accepts daily_log", () => {
      const file = MemoryFile.create({ ...validParams, fileType: "daily_log" });
      expect(file.fileType).toBe("daily_log");
    });

    it("accepts decisions", () => {
      const file = MemoryFile.create({ ...validParams, fileType: "decisions" });
      expect(file.fileType).toBe("decisions");
    });

    it("accepts learnings", () => {
      const file = MemoryFile.create({ ...validParams, fileType: "learnings" });
      expect(file.fileType).toBe("learnings");
    });

    it("accepts user_prefs", () => {
      const file = MemoryFile.create({
        ...validParams,
        fileType: "user_prefs",
      });
      expect(file.fileType).toBe("user_prefs");
    });

    it("rejects invalid fileType", () => {
      expect(() =>
        MemoryFile.create({
          ...validParams,
          fileType: "unknown" as MemoryFileType,
        })
      ).toThrow("Invalid file type");
    });
  });

  describe("create() validation", () => {
    it("throws for empty filePath", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, filePath: "" })
      ).toThrow("File path cannot be empty");
    });

    it("throws for whitespace-only filePath", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, filePath: "   " })
      ).toThrow("File path cannot be empty");
    });

    it("throws for empty content", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, content: "" })
      ).toThrow("Content cannot be empty");
    });

    it("throws for whitespace-only content", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, content: "   " })
      ).toThrow("Content cannot be empty");
    });

    it("throws for short contentHash", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, contentHash: "abc123" })
      ).toThrow("Content hash must be 64 hexadecimal characters");
    });

    it("throws for non-hex contentHash", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, contentHash: "g".repeat(64) })
      ).toThrow("Content hash must be 64 hexadecimal characters");
    });

    it("throws for contentHash with uppercase hex", () => {
      expect(() =>
        MemoryFile.create({ ...validParams, contentHash: "A".repeat(64) })
      ).toThrow("Content hash must be 64 hexadecimal characters");
    });
  });

  describe("getter immutability", () => {
    it("returns all values correctly through getters", () => {
      const createdAt = new Date("2026-01-15T00:00:00Z");
      const lastIndexedAt = new Date("2026-03-07T10:00:00Z");

      const file = MemoryFile.create({
        id: 7,
        filePath: "daily/2026-03-07.md",
        fileType: "daily_log",
        projectEncoded: "test-project",
        content: "test content",
        contentHash: "c".repeat(64),
        lastIndexedAt,
        createdAt,
      });

      expect(file.id).toBe(7);
      expect(file.filePath).toBe("daily/2026-03-07.md");
      expect(file.fileType).toBe("daily_log");
      expect(file.projectEncoded).toBe("test-project");
      expect(file.content).toBe("test content");
      expect(file.contentHash).toBe("c".repeat(64));
      expect(file.lastIndexedAt).toEqual(lastIndexedAt);
      expect(file.createdAt).toEqual(createdAt);
    });

    it("returns defensive copies for Date fields", () => {
      const lastIndexedAt = new Date("2026-03-07T10:00:00Z");
      const createdAt = new Date("2026-01-15T00:00:00Z");

      const file = MemoryFile.create({
        ...validParams,
        lastIndexedAt,
        createdAt,
      });

      // Mutating returned dates should not affect the entity
      const returnedLastIndexed = file.lastIndexedAt;
      returnedLastIndexed.setFullYear(2000);
      expect(file.lastIndexedAt.getFullYear()).toBe(2026);

      const returnedCreatedAt = file.createdAt;
      returnedCreatedAt.setFullYear(2000);
      expect(file.createdAt.getFullYear()).toBe(2026);
    });
  });
});
