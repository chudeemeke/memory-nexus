import { describe, expect, it } from "bun:test";
import { ToolUse, ToolUseStatus } from "./tool-use.js";

describe("ToolUse entity", () => {
  const timestamp = new Date("2024-01-15T10:30:00Z");

  describe("construction", () => {
    it("creates with required properties", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { file_path: "/path/to/file.ts" },
        timestamp,
      });

      expect(toolUse.id).toBe("tool-123");
      expect(toolUse.name).toBe("Read");
      expect(toolUse.input).toEqual({ file_path: "/path/to/file.ts" });
      expect(toolUse.timestamp).toEqual(timestamp);
      expect(toolUse.status).toBe("pending");
      expect(toolUse.result).toBeUndefined();
    });

    it("creates with initial status and result", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { file_path: "/path/to/file.ts" },
        timestamp,
        status: "success",
        result: "file contents here",
      });

      expect(toolUse.status).toBe("success");
      expect(toolUse.result).toBe("file contents here");
    });

    it("throws on empty id", () => {
      expect(() =>
        ToolUse.create({
          id: "",
          name: "Read",
          input: {},
          timestamp,
        })
      ).toThrow("Tool use ID cannot be empty");
    });

    it("throws on empty name", () => {
      expect(() =>
        ToolUse.create({
          id: "tool-123",
          name: "",
          input: {},
          timestamp,
        })
      ).toThrow("Tool name cannot be empty");
    });

    it("throws on invalid status", () => {
      expect(() =>
        ToolUse.create({
          id: "tool-123",
          name: "Read",
          input: {},
          timestamp,
          status: "invalid" as ToolUseStatus,
        })
      ).toThrow("Invalid tool use status");
    });
  });

  describe("identity", () => {
    it("equality is based on id", () => {
      const toolUse1 = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { path: "a" },
        timestamp,
      });
      const toolUse2 = ToolUse.create({
        id: "tool-123",
        name: "Write",
        input: { path: "b" },
        timestamp: new Date("2024-02-01T10:00:00Z"),
      });

      expect(toolUse1.equals(toolUse2)).toBe(true);
    });

    it("different ids are not equal", () => {
      const toolUse1 = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
      });
      const toolUse2 = ToolUse.create({
        id: "tool-456",
        name: "Read",
        input: {},
        timestamp,
      });

      expect(toolUse1.equals(toolUse2)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("input is a deep copy", () => {
      const originalInput = { path: "/test", nested: { key: "value" } };
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: originalInput,
        timestamp,
      });

      originalInput.path = "/modified";
      originalInput.nested.key = "modified";

      expect(toolUse.input).toEqual({ path: "/test", nested: { key: "value" } });
    });

    it("returned input is a copy", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { path: "/test" },
        timestamp,
      });

      const input = toolUse.input as Record<string, string>;
      input.path = "/modified";

      expect(toolUse.input).toEqual({ path: "/test" });
    });

    it("timestamp is a copy", () => {
      const originalDate = new Date("2024-01-15T10:30:00Z");
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp: originalDate,
      });

      originalDate.setFullYear(2020);
      expect(toolUse.timestamp.getFullYear()).toBe(2024);
    });
  });

  describe("completion", () => {
    it("completeSuccess sets status and result", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { file_path: "/path/to/file.ts" },
        timestamp,
      });

      const completed = toolUse.completeSuccess("file contents");

      expect(completed.status).toBe("success");
      expect(completed.result).toBe("file contents");
    });

    it("completeSuccess returns new instance", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
      });

      const completed = toolUse.completeSuccess("result");

      expect(toolUse.status).toBe("pending");
      expect(toolUse).not.toBe(completed);
    });

    it("completeError sets status and error message", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: { file_path: "/nonexistent.ts" },
        timestamp,
      });

      const completed = toolUse.completeError("File not found");

      expect(completed.status).toBe("error");
      expect(completed.result).toBe("File not found");
    });

    it("completeError returns new instance", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
      });

      const completed = toolUse.completeError("error");

      expect(toolUse.status).toBe("pending");
      expect(toolUse).not.toBe(completed);
    });
  });

  describe("status helpers", () => {
    it("isPending returns true for pending status", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
      });

      expect(toolUse.isPending).toBe(true);
      expect(toolUse.isSuccess).toBe(false);
      expect(toolUse.isError).toBe(false);
    });

    it("isSuccess returns true for success status", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
        status: "success",
      });

      expect(toolUse.isPending).toBe(false);
      expect(toolUse.isSuccess).toBe(true);
      expect(toolUse.isError).toBe(false);
    });

    it("isError returns true for error status", () => {
      const toolUse = ToolUse.create({
        id: "tool-123",
        name: "Read",
        input: {},
        timestamp,
        status: "error",
      });

      expect(toolUse.isPending).toBe(false);
      expect(toolUse.isSuccess).toBe(false);
      expect(toolUse.isError).toBe(true);
    });
  });
});
