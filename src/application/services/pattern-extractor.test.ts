/**
 * PatternExtractor Tests
 *
 * Tests for extracting file paths and tool usage from tool uses.
 */

import { describe, it, expect } from "bun:test";
import {
  PatternExtractor,
  type FileModification,
  type ToolStats,
} from "./pattern-extractor.js";
import { ToolUse } from "../../domain/entities/tool-use.js";

describe("PatternExtractor", () => {
  describe("extractFilePaths", () => {
    it("extracts file_path from Read tool", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-1",
          name: "Read",
          input: { file_path: "/src/index.ts" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src/index.ts");
    });

    it("extracts file_path from Write tool", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-2",
          name: "Write",
          input: { file_path: "/src/output.ts", content: "// code" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src/output.ts");
    });

    it("extracts file_path from Edit tool", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-3",
          name: "Edit",
          input: {
            file_path: "/src/edit.ts",
            old_string: "foo",
            new_string: "bar",
          },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src/edit.ts");
    });

    it("extracts path from Glob tool", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-4",
          name: "Glob",
          input: { pattern: "**/*.ts", path: "/src" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src");
    });

    it("extracts path from Grep tool", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-5",
          name: "Grep",
          input: { pattern: "TODO", path: "/src/utils" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src/utils");
    });

    it("parses Glob results for matched files", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-6",
          name: "Glob",
          input: { pattern: "**/*.ts", path: "/src" },
          timestamp: new Date(),
          status: "success",
          result:
            "/src/index.ts\n/src/utils/helpers.ts\n/src/models/user.ts",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toContain("/src");
      expect(paths).toContain("/src/index.ts");
      expect(paths).toContain("/src/utils/helpers.ts");
      expect(paths).toContain("/src/models/user.ts");
    });

    it("deduplicates paths", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-7",
          name: "Read",
          input: { file_path: "/src/index.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-8",
          name: "Write",
          input: { file_path: "/src/index.ts", content: "// updated" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-9",
          name: "Read",
          input: { file_path: "/src/other.ts" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      // Should have unique paths only
      expect(paths).toHaveLength(2);
      expect(paths).toContain("/src/index.ts");
      expect(paths).toContain("/src/other.ts");
    });

    it("returns empty array when no file paths", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-10",
          name: "Bash",
          input: { command: "ls -la" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const paths = PatternExtractor.extractFilePaths(toolUses);

      expect(paths).toEqual([]);
    });

    it("handles empty input", () => {
      const paths = PatternExtractor.extractFilePaths([]);
      expect(paths).toEqual([]);
    });
  });

  describe("extractFileModifications", () => {
    it("filters to Write/Edit/NotebookEdit only", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-11",
          name: "Read",
          input: { file_path: "/src/read.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-12",
          name: "Write",
          input: { file_path: "/src/write.ts", content: "// new" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-13",
          name: "Edit",
          input: {
            file_path: "/src/edit.ts",
            old_string: "a",
            new_string: "b",
          },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-14",
          name: "NotebookEdit",
          input: { file_path: "/notebook.ipynb", cell_id: "1" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const modifications = PatternExtractor.extractFileModifications(toolUses);

      expect(modifications).toHaveLength(3);
      const paths = modifications.map((m) => m.path);
      expect(paths).not.toContain("/src/read.ts");
      expect(paths).toContain("/src/write.ts");
      expect(paths).toContain("/src/edit.ts");
      expect(paths).toContain("/notebook.ipynb");
    });

    it("only includes successful operations", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-15",
          name: "Write",
          input: { file_path: "/success.ts", content: "// ok" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-16",
          name: "Write",
          input: { file_path: "/error.ts", content: "// fail" },
          timestamp: new Date(),
          status: "error",
          result: "Permission denied",
        }),
        ToolUse.create({
          id: "tu-17",
          name: "Write",
          input: { file_path: "/pending.ts", content: "// wait" },
          timestamp: new Date(),
          status: "pending",
        }),
      ];

      const modifications = PatternExtractor.extractFileModifications(toolUses);

      expect(modifications).toHaveLength(1);
      expect(modifications[0].path).toBe("/success.ts");
    });

    it("includes operation type", () => {
      const timestamp = new Date("2025-01-15T10:30:00Z");
      const toolUses = [
        ToolUse.create({
          id: "tu-18",
          name: "Write",
          input: { file_path: "/write.ts", content: "" },
          timestamp,
          status: "success",
        }),
        ToolUse.create({
          id: "tu-19",
          name: "Edit",
          input: {
            file_path: "/edit.ts",
            old_string: "x",
            new_string: "y",
          },
          timestamp,
          status: "success",
        }),
      ];

      const modifications = PatternExtractor.extractFileModifications(toolUses);

      const writeOp = modifications.find((m) => m.path === "/write.ts");
      const editOp = modifications.find((m) => m.path === "/edit.ts");

      expect(writeOp?.operation).toBe("Write");
      expect(editOp?.operation).toBe("Edit");
    });

    it("includes timestamp", () => {
      const timestamp = new Date("2025-01-15T10:30:00Z");
      const toolUses = [
        ToolUse.create({
          id: "tu-20",
          name: "Write",
          input: { file_path: "/timed.ts", content: "// time" },
          timestamp,
          status: "success",
        }),
      ];

      const modifications = PatternExtractor.extractFileModifications(toolUses);

      expect(modifications[0].timestamp).toEqual(timestamp);
    });

    it("handles empty input", () => {
      const modifications = PatternExtractor.extractFileModifications([]);
      expect(modifications).toEqual([]);
    });
  });

  describe("extractToolStats", () => {
    it("groups by tool name with counts", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-21",
          name: "Read",
          input: { file_path: "/a.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-22",
          name: "Read",
          input: { file_path: "/b.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-23",
          name: "Write",
          input: { file_path: "/c.ts", content: "" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const stats = PatternExtractor.extractToolStats(toolUses);

      const readStats = stats.find((s) => s.name === "Read");
      const writeStats = stats.find((s) => s.name === "Write");

      expect(readStats?.count).toBe(2);
      expect(writeStats?.count).toBe(1);
    });

    it("tracks success vs error counts", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-24",
          name: "Bash",
          input: { command: "ls" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-25",
          name: "Bash",
          input: { command: "rm -rf /" },
          timestamp: new Date(),
          status: "error",
          result: "Permission denied",
        }),
        ToolUse.create({
          id: "tu-26",
          name: "Bash",
          input: { command: "pwd" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-27",
          name: "Bash",
          input: { command: "invalid" },
          timestamp: new Date(),
          status: "error",
          result: "Command not found",
        }),
      ];

      const stats = PatternExtractor.extractToolStats(toolUses);

      const bashStats = stats.find((s) => s.name === "Bash");
      expect(bashStats?.count).toBe(4);
      expect(bashStats?.successCount).toBe(2);
      expect(bashStats?.errorCount).toBe(2);
    });

    it("counts pending as neither success nor error", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-28",
          name: "Read",
          input: { file_path: "/a.ts" },
          timestamp: new Date(),
          status: "pending",
        }),
        ToolUse.create({
          id: "tu-29",
          name: "Read",
          input: { file_path: "/b.ts" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const stats = PatternExtractor.extractToolStats(toolUses);

      const readStats = stats.find((s) => s.name === "Read");
      expect(readStats?.count).toBe(2);
      expect(readStats?.successCount).toBe(1);
      expect(readStats?.errorCount).toBe(0);
    });

    it("returns empty array when no tool uses", () => {
      const stats = PatternExtractor.extractToolStats([]);
      expect(stats).toEqual([]);
    });
  });

  describe("extractToolNames", () => {
    it("returns unique tool names", () => {
      const toolUses = [
        ToolUse.create({
          id: "tu-30",
          name: "Read",
          input: { file_path: "/a.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-31",
          name: "Read",
          input: { file_path: "/b.ts" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-32",
          name: "Write",
          input: { file_path: "/c.ts", content: "" },
          timestamp: new Date(),
          status: "success",
        }),
        ToolUse.create({
          id: "tu-33",
          name: "Bash",
          input: { command: "ls" },
          timestamp: new Date(),
          status: "success",
        }),
      ];

      const names = PatternExtractor.extractToolNames(toolUses);

      expect(names).toHaveLength(3);
      expect(names).toContain("Read");
      expect(names).toContain("Write");
      expect(names).toContain("Bash");
    });

    it("returns empty array when no tool uses", () => {
      const names = PatternExtractor.extractToolNames([]);
      expect(names).toEqual([]);
    });
  });

  describe("toFileEntities", () => {
    it("creates file-type entities", () => {
      const paths = ["/src/index.ts", "/src/utils/helpers.ts"];

      const entities = PatternExtractor.toFileEntities(paths);

      expect(entities).toHaveLength(2);
      entities.forEach((e) => {
        expect(e.type).toBe("file");
        expect(e.confidence).toBe(1.0);
      });
    });

    it("uses path as entity name", () => {
      const paths = ["/src/app.ts"];

      const entities = PatternExtractor.toFileEntities(paths);

      expect(entities[0].name).toBe("/src/app.ts");
    });

    it("returns empty array for empty input", () => {
      const entities = PatternExtractor.toFileEntities([]);
      expect(entities).toEqual([]);
    });
  });

  describe("toFileModificationEntities", () => {
    it("creates file entities with operation in metadata", () => {
      const modifications: FileModification[] = [
        { path: "/src/new.ts", operation: "Write", timestamp: new Date() },
        { path: "/src/edit.ts", operation: "Edit", timestamp: new Date() },
      ];

      const entities = PatternExtractor.toFileModificationEntities(modifications);

      expect(entities).toHaveLength(2);

      const newEntity = entities.find((e) => e.name === "/src/new.ts");
      const editEntity = entities.find((e) => e.name === "/src/edit.ts");

      expect(newEntity?.type).toBe("file");
      expect(newEntity?.metadata).toEqual({ operation: "write" });
      expect(editEntity?.metadata).toEqual({ operation: "edit" });
    });

    it("uses full confidence for modifications", () => {
      const modifications: FileModification[] = [
        { path: "/src/file.ts", operation: "Write", timestamp: new Date() },
      ];

      const entities = PatternExtractor.toFileModificationEntities(modifications);

      expect(entities[0].confidence).toBe(1.0);
    });

    it("returns empty array for empty input", () => {
      const entities = PatternExtractor.toFileModificationEntities([]);
      expect(entities).toEqual([]);
    });
  });
});
