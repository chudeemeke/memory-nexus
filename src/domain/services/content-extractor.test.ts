import { describe, expect, it } from "bun:test";
import { ContentExtractor } from "./content-extractor.js";

describe("ContentExtractor domain service", () => {
  describe("extractMessageContent", () => {
    it("extracts text from user message", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: {
          role: "user",
          content: "How do I fix this bug?",
        },
      });

      const result = ContentExtractor.extractMessageContent(jsonLine);

      expect(result).not.toBeNull();
      expect(result?.role).toBe("user");
      expect(result?.content).toBe("How do I fix this bug?");
    });

    it("extracts text from assistant message", () => {
      const jsonLine = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: "Let me help you with that bug.",
        },
      });

      const result = ContentExtractor.extractMessageContent(jsonLine);

      expect(result).not.toBeNull();
      expect(result?.role).toBe("assistant");
      expect(result?.content).toBe("Let me help you with that bug.");
    });

    it("extracts content array from assistant message", () => {
      const jsonLine = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Here is the solution:" },
            { type: "text", text: "Step 1: Fix the import" },
          ],
        },
      });

      const result = ContentExtractor.extractMessageContent(jsonLine);

      expect(result?.content).toBe("Here is the solution:\nStep 1: Fix the import");
    });

    it("returns null for non-message lines", () => {
      const jsonLine = JSON.stringify({
        type: "system",
        config: { model: "claude-3" },
      });

      const result = ContentExtractor.extractMessageContent(jsonLine);

      expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      const result = ContentExtractor.extractMessageContent("not valid json");

      expect(result).toBeNull();
    });

    it("returns null for empty content", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: {
          role: "user",
          content: "",
        },
      });

      const result = ContentExtractor.extractMessageContent(jsonLine);

      expect(result).toBeNull();
    });
  });

  describe("extractToolUse", () => {
    it("extracts tool use from assistant message", () => {
      const jsonLine = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-123",
              name: "Read",
              input: { file_path: "/path/to/file.ts" },
            },
          ],
        },
      });

      const result = ContentExtractor.extractToolUses(jsonLine);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tool-123");
      expect(result[0].name).toBe("Read");
      expect(result[0].input).toEqual({ file_path: "/path/to/file.ts" });
    });

    it("extracts multiple tool uses", () => {
      const jsonLine = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool-1", name: "Read", input: {} },
            { type: "text", text: "Reading files..." },
            { type: "tool_use", id: "tool-2", name: "Write", input: {} },
          ],
        },
      });

      const result = ContentExtractor.extractToolUses(jsonLine);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Read");
      expect(result[1].name).toBe("Write");
    });

    it("returns empty array for no tool uses", () => {
      const jsonLine = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: "Just text, no tools",
        },
      });

      const result = ContentExtractor.extractToolUses(jsonLine);

      expect(result).toHaveLength(0);
    });

    it("returns empty array for invalid JSON", () => {
      const result = ContentExtractor.extractToolUses("invalid json");

      expect(result).toHaveLength(0);
    });
  });

  describe("extractToolResult", () => {
    it("extracts tool result from user message", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-123",
              content: "File contents here",
            },
          ],
        },
      });

      const result = ContentExtractor.extractToolResults(jsonLine);

      expect(result).toHaveLength(1);
      expect(result[0].toolUseId).toBe("tool-123");
      expect(result[0].content).toBe("File contents here");
      expect(result[0].isError).toBe(false);
    });

    it("extracts error tool result", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-123",
              content: "File not found",
              is_error: true,
            },
          ],
        },
      });

      const result = ContentExtractor.extractToolResults(jsonLine);

      expect(result[0].isError).toBe(true);
    });

    it("returns empty array for no tool results", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: {
          role: "user",
          content: "Just a question",
        },
      });

      const result = ContentExtractor.extractToolResults(jsonLine);

      expect(result).toHaveLength(0);
    });
  });

  describe("isMessageLine", () => {
    it("returns true for human type", () => {
      const jsonLine = JSON.stringify({ type: "human" });
      expect(ContentExtractor.isMessageLine(jsonLine)).toBe(true);
    });

    it("returns true for assistant type", () => {
      const jsonLine = JSON.stringify({ type: "assistant" });
      expect(ContentExtractor.isMessageLine(jsonLine)).toBe(true);
    });

    it("returns false for system type", () => {
      const jsonLine = JSON.stringify({ type: "system" });
      expect(ContentExtractor.isMessageLine(jsonLine)).toBe(false);
    });

    it("returns false for invalid JSON", () => {
      expect(ContentExtractor.isMessageLine("not json")).toBe(false);
    });
  });

  describe("extractTimestamp", () => {
    it("extracts timestamp from message line", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        timestamp: "2024-01-15T10:30:00Z",
      });

      const result = ContentExtractor.extractTimestamp(jsonLine);

      expect(result).toEqual(new Date("2024-01-15T10:30:00Z"));
    });

    it("returns null for missing timestamp", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        message: { role: "user", content: "hello" },
      });

      const result = ContentExtractor.extractTimestamp(jsonLine);

      expect(result).toBeNull();
    });

    it("returns null for invalid timestamp", () => {
      const jsonLine = JSON.stringify({
        type: "human",
        timestamp: "not-a-date",
      });

      const result = ContentExtractor.extractTimestamp(jsonLine);

      expect(result).toBeNull();
    });
  });
});
