/**
 * Event Classifier Tests
 *
 * Tests for event classification and extraction logic.
 */

import { describe, test, expect } from "bun:test";
import {
  classifyEvent,
  isValidEvent,
  extractToolUseEvents,
  extractToolResultEvents,
} from "./event-classifier.js";
import type { ParsedEvent } from "../../domain/ports/types.js";

describe("Event Classifier", () => {
  describe("isValidEvent", () => {
    test("rejects non-object values", () => {
      expect(isValidEvent("string")).toBe(false);
      expect(isValidEvent(123)).toBe(false);
      expect(isValidEvent(true)).toBe(false);
      expect(isValidEvent(undefined)).toBe(false);
    });

    test("rejects null", () => {
      expect(isValidEvent(null)).toBe(false);
    });

    test("rejects objects without type field", () => {
      expect(isValidEvent({})).toBe(false);
      expect(isValidEvent({ uuid: "123" })).toBe(false);
      expect(isValidEvent({ message: "hello" })).toBe(false);
    });

    test("rejects objects with non-string type field", () => {
      expect(isValidEvent({ type: 123 })).toBe(false);
      expect(isValidEvent({ type: null })).toBe(false);
      expect(isValidEvent({ type: {} })).toBe(false);
    });

    test("accepts objects with string type field", () => {
      expect(isValidEvent({ type: "user" })).toBe(true);
      expect(isValidEvent({ type: "assistant" })).toBe(true);
      expect(isValidEvent({ type: "unknown" })).toBe(true);
    });
  });

  describe("classifyEvent - invalid input", () => {
    test("returns skipped for non-object values", () => {
      const result = classifyEvent("string");
      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toBe("Invalid event structure");
    });

    test("returns skipped for null", () => {
      const result = classifyEvent(null);
      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toBe("Invalid event structure");
    });

    test("returns skipped for objects without type field", () => {
      const result = classifyEvent({ uuid: "123" });
      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toBe("Invalid event structure");
    });
  });

  describe("classifyEvent - skip types", () => {
    const skipTypes = [
      "progress",
      "agent_progress",
      "bash_progress",
      "mcp_progress",
      "hook_progress",
      "base64",
      "image",
      "file-history-snapshot",
      "waiting_for_task",
      "create",
      "update",
      "queue-operation",
    ];

    for (const eventType of skipTypes) {
      test(`skips ${eventType} events`, () => {
        const result = classifyEvent({ type: eventType, timestamp: "2026-01-28T00:00:00Z" });
        expect(result.type).toBe("skipped");
        expect((result as { reason: string }).reason).toBe(`Event type "${eventType}" not extracted`);
      });
    }
  });

  describe("classifyEvent - unknown types", () => {
    test("returns skipped for unknown event types", () => {
      const result = classifyEvent({ type: "unknown_type", uuid: "123" });
      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toContain("not classified");
    });
  });

  describe("User Event Extraction", () => {
    test("extracts simple string content", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-123",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user",
          content: "Hello, Claude!",
        },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.uuid).toBe("user-123");
        expect(result.data.message.content).toBe("Hello, Claude!");
        expect(result.data.timestamp).toBe("2026-01-28T10:00:00Z");
      }
    });

    test("extracts content from message object", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-456",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user",
          content: "What is the weather?",
        },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.message.content).toBe("What is the weather?");
      }
    });

    test("handles tool_result content blocks", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-789",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_123",
              content: "File contents here",
            },
          ],
        },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.message.content).toBe("File contents here");
      }
    });

    test("normalizes array content to string", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-abc",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "First result",
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_2",
              content: "Second result",
            },
          ],
        },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.message.content).toContain("First result");
        expect(result.data.message.content).toContain("Second result");
      }
    });

    test("includes optional cwd field", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-cwd",
        timestamp: "2026-01-28T10:00:00Z",
        message: { role: "user", content: "test" },
        cwd: "/home/user/project",
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.cwd).toBe("/home/user/project");
      }
    });

    test("includes optional gitBranch field", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-git",
        timestamp: "2026-01-28T10:00:00Z",
        message: { role: "user", content: "test" },
        gitBranch: "feature/new-feature",
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.gitBranch).toBe("feature/new-feature");
      }
    });

    test("returns skipped for user event missing required fields", () => {
      const result = classifyEvent({
        type: "user",
        // missing uuid, timestamp, message
      });

      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toContain("missing required fields");
    });
  });

  describe("Assistant Event Extraction", () => {
    test("extracts text content blocks", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-123",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          model: "claude-opus-4-5-20251101",
          content: [{ type: "text", text: "Hello! How can I help?" }],
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.uuid).toBe("asst-123");
        expect(result.data.message.content).toHaveLength(1);
        expect(result.data.message.content[0].type).toBe("text");
        if (result.data.message.content[0].type === "text") {
          expect(result.data.message.content[0].text).toBe("Hello! How can I help?");
        }
      }
    });

    test("extracts tool_use content blocks", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-456",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_123",
              name: "Read",
              input: { file_path: "/path/to/file" },
            },
          ],
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.message.content).toHaveLength(1);
        expect(result.data.message.content[0].type).toBe("tool_use");
        if (result.data.message.content[0].type === "tool_use") {
          expect(result.data.message.content[0].id).toBe("toolu_123");
          expect(result.data.message.content[0].name).toBe("Read");
          expect(result.data.message.content[0].input).toEqual({ file_path: "/path/to/file" });
        }
      }
    });

    test("filters out thinking blocks", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-789",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [
            { type: "thinking", thinking: "Let me think...", signature: "base64sig" },
            { type: "text", text: "Here is my response" },
          ],
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        // Only text block should be extracted, thinking filtered
        expect(result.data.message.content).toHaveLength(1);
        expect(result.data.message.content[0].type).toBe("text");
      }
    });

    test("normalizes usage to domain format", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-usage",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [{ type: "text", text: "test" }],
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
          },
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.usage).toBeDefined();
        expect(result.data.usage?.inputTokens).toBe(1000);
        expect(result.data.usage?.outputTokens).toBe(500);
      }
    });

    test("handles missing optional fields", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-minimal",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [],
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.message.model).toBeUndefined();
        expect(result.data.usage).toBeUndefined();
      }
    });

    test("includes model when present", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-model",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          model: "claude-sonnet-4-20250514",
          content: [],
        },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.message.model).toBe("claude-sonnet-4-20250514");
      }
    });

    test("returns skipped for assistant event missing required fields", () => {
      const result = classifyEvent({
        type: "assistant",
        // missing uuid, timestamp, message
      });

      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toContain("missing required fields");
    });
  });

  describe("Tool Use Event Extraction", () => {
    test("extracts tool uses from content blocks", () => {
      const raw = {
        type: "assistant" as const,
        uuid: "asst-tools",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [
            { type: "text" as const, text: "I will read the file" },
            {
              type: "tool_use" as const,
              id: "toolu_read",
              name: "Read",
              input: { file_path: "/path/to/file.ts" },
            },
            {
              type: "tool_use" as const,
              id: "toolu_write",
              name: "Write",
              input: { file_path: "/path/to/output.ts", content: "new content" },
            },
          ],
        },
      };

      const toolUses = extractToolUseEvents(raw);

      expect(toolUses).toHaveLength(2);
      expect(toolUses[0].uuid).toBe("toolu_read");
      expect(toolUses[0].name).toBe("Read");
      expect(toolUses[0].input).toEqual({ file_path: "/path/to/file.ts" });
      expect(toolUses[0].timestamp).toBe("2026-01-28T10:00:00Z");

      expect(toolUses[1].uuid).toBe("toolu_write");
      expect(toolUses[1].name).toBe("Write");
    });

    test("creates separate ToolUseEventData for each tool", () => {
      const raw = {
        type: "assistant" as const,
        uuid: "asst-multi",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [
            { type: "tool_use" as const, id: "t1", name: "Bash", input: { command: "ls" } },
            { type: "tool_use" as const, id: "t2", name: "Grep", input: { pattern: "foo" } },
            { type: "tool_use" as const, id: "t3", name: "Glob", input: { pattern: "*.ts" } },
          ],
        },
      };

      const toolUses = extractToolUseEvents(raw);
      expect(toolUses).toHaveLength(3);
      expect(toolUses.map((t) => t.name)).toEqual(["Bash", "Grep", "Glob"]);
    });

    test("copies timestamp from parent event", () => {
      const parentTimestamp = "2026-01-28T15:30:00Z";
      const raw = {
        type: "assistant" as const,
        uuid: "asst-ts",
        timestamp: parentTimestamp,
        message: {
          content: [{ type: "tool_use" as const, id: "t1", name: "Read", input: {} }],
        },
      };

      const toolUses = extractToolUseEvents(raw);
      expect(toolUses[0].timestamp).toBe(parentTimestamp);
    });

    test("returns empty array for events without tool uses", () => {
      const raw = {
        type: "assistant" as const,
        uuid: "asst-no-tools",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          content: [{ type: "text" as const, text: "Just text" }],
        },
      };

      const toolUses = extractToolUseEvents(raw);
      expect(toolUses).toHaveLength(0);
    });

    test("handles missing content array", () => {
      const raw = {
        type: "assistant" as const,
        uuid: "asst-no-content",
        timestamp: "2026-01-28T10:00:00Z",
        message: {},
      };

      const toolUses = extractToolUseEvents(raw as any);
      expect(toolUses).toHaveLength(0);
    });
  });

  describe("Tool Result Event Extraction", () => {
    test("extracts tool results from content array", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-results",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "toolu_123",
              content: "File contents: export function foo() {}",
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);

      expect(results).toHaveLength(1);
      expect(results[0].toolUseId).toBe("toolu_123");
      expect(results[0].content).toBe("File contents: export function foo() {}");
      expect(results[0].isError).toBe(false);
    });

    test("links to tool_use_id", () => {
      const toolUseId = "toolu_specific_id";
      const raw = {
        type: "user" as const,
        uuid: "user-link",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: toolUseId,
              content: "result",
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].toolUseId).toBe(toolUseId);
      expect(results[0].uuid).toBe(`result-${toolUseId}`);
    });

    test("handles string content", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-str",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "t1",
              content: "plain string result",
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].content).toBe("plain string result");
    });

    test("handles object content (stringifies)", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-obj",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "t1",
              content: { status: "success", files: ["a.ts", "b.ts"] },
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].content).toBe('{"status":"success","files":["a.ts","b.ts"]}');
    });

    test("handles is_error flag true", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-err",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "t1",
              content: "Command failed with exit code 1",
              is_error: true,
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].isError).toBe(true);
    });

    test("handles is_error flag false", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-no-err",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "t1",
              content: "Success",
              is_error: false,
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].isError).toBe(false);
    });

    test("defaults is_error to false when missing", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-default",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: "t1",
              content: "result",
              // is_error not specified
            },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].isError).toBe(false);
    });

    test("returns empty array for string content (not tool results)", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-str-only",
        timestamp: "2026-01-28T10:00:00Z",
        message: {
          role: "user" as const,
          content: "Just a regular message",
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results).toHaveLength(0);
    });
  });

  describe("Summary Event Extraction", () => {
    test("extracts summary content", () => {
      const result = classifyEvent({
        type: "summary",
        summary: "This session discussed authentication implementation...",
        timestamp: "2026-01-28T10:00:00Z",
      });

      expect(result.type).toBe("summary");
      if (result.type === "summary") {
        expect(result.data.content).toBe("This session discussed authentication implementation...");
      }
    });

    test("includes leafUuid when present", () => {
      const result = classifyEvent({
        type: "summary",
        summary: "Session summary",
        timestamp: "2026-01-28T10:00:00Z",
        leafUuid: "last-event-uuid-123",
      });

      expect(result.type).toBe("summary");
      if (result.type === "summary") {
        expect(result.data.leafUuid).toBe("last-event-uuid-123");
      }
    });

    test("handles missing timestamp", () => {
      const result = classifyEvent({
        type: "summary",
        summary: "Summary without timestamp",
      });

      expect(result.type).toBe("summary");
      if (result.type === "summary") {
        // Should have a timestamp (generated)
        expect(result.data.timestamp).toBeDefined();
        expect(result.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    test("returns skipped for summary event missing summary field", () => {
      const result = classifyEvent({
        type: "summary",
        timestamp: "2026-01-28T10:00:00Z",
        // missing summary field
      });

      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toContain("missing summary field");
    });
  });

  describe("System Event Extraction", () => {
    test("extracts turn_duration events", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "turn_duration",
        durationMs: 5000,
        timestamp: "2026-01-28T10:00:00Z",
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.subtype).toBe("turn_duration");
        expect(result.data.data).toBe(5000);
      }
    });

    test("includes subtype field", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "custom_subtype",
        data: { key: "value" },
        timestamp: "2026-01-28T10:00:00Z",
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.subtype).toBe("custom_subtype");
      }
    });

    test("captures event-specific data", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "config_change",
        data: { setting: "value", enabled: true },
        timestamp: "2026-01-28T10:00:00Z",
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.data).toEqual({ setting: "value", enabled: true });
      }
    });

    test("prefers durationMs over data field", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "turn_duration",
        durationMs: 3000,
        data: "ignored",
        timestamp: "2026-01-28T10:00:00Z",
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.data).toBe(3000);
      }
    });

    test("handles missing timestamp", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "turn_duration",
        durationMs: 1000,
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.timestamp).toBeDefined();
      }
    });

    test("returns skipped for system event missing subtype field", () => {
      const result = classifyEvent({
        type: "system",
        timestamp: "2026-01-28T10:00:00Z",
        // missing subtype
      });

      expect(result.type).toBe("skipped");
      expect((result as { reason: string }).reason).toContain("missing subtype field");
    });
  });

  describe("Timestamp Normalization", () => {
    test("normalizes user event timestamp from Unix seconds", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-ts",
        timestamp: 1769558400, // 2026-01-28T00:00:00.000Z in seconds
        message: { role: "user", content: "test" },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.timestamp).toBe("2026-01-28T00:00:00.000Z");
      }
    });

    test("normalizes assistant event timestamp from Unix milliseconds", () => {
      const result = classifyEvent({
        type: "assistant",
        uuid: "asst-ts",
        timestamp: 1769558400000, // 2026-01-28T00:00:00.000Z in milliseconds
        message: { content: [{ type: "text", text: "test" }] },
      });

      expect(result.type).toBe("assistant");
      if (result.type === "assistant") {
        expect(result.data.timestamp).toBe("2026-01-28T00:00:00.000Z");
      }
    });

    test("normalizes tool use event timestamp", () => {
      const raw = {
        type: "assistant" as const,
        uuid: "asst-tool-ts",
        timestamp: 1769558400, // Unix seconds
        message: {
          content: [
            { type: "tool_use" as const, id: "t1", name: "Read", input: {} },
          ],
        },
      };

      const toolUses = extractToolUseEvents(raw);
      expect(toolUses[0].timestamp).toBe("2026-01-28T00:00:00.000Z");
    });

    test("normalizes tool result event timestamp", () => {
      const raw = {
        type: "user" as const,
        uuid: "user-result-ts",
        timestamp: 1769558400000, // Unix milliseconds
        message: {
          role: "user" as const,
          content: [
            { type: "tool_result" as const, tool_use_id: "t1", content: "result" },
          ],
        },
      };

      const results = extractToolResultEvents(raw);
      expect(results[0].timestamp).toBe("2026-01-28T00:00:00.000Z");
    });

    test("normalizes summary event timestamp", () => {
      const result = classifyEvent({
        type: "summary",
        summary: "Session summary",
        timestamp: 1769558400, // Unix seconds
      });

      expect(result.type).toBe("summary");
      if (result.type === "summary") {
        expect(result.data.timestamp).toBe("2026-01-28T00:00:00.000Z");
      }
    });

    test("normalizes system event timestamp", () => {
      const result = classifyEvent({
        type: "system",
        subtype: "turn_duration",
        durationMs: 1000,
        timestamp: 1769558400000, // Unix milliseconds
      });

      expect(result.type).toBe("system");
      if (result.type === "system") {
        expect(result.data.timestamp).toBe("2026-01-28T00:00:00.000Z");
      }
    });

    test("preserves valid ISO 8601 timestamps", () => {
      const result = classifyEvent({
        type: "user",
        uuid: "user-iso",
        timestamp: "2026-01-28T10:30:00.123Z",
        message: { role: "user", content: "test" },
      });

      expect(result.type).toBe("user");
      if (result.type === "user") {
        expect(result.data.timestamp).toBe("2026-01-28T10:30:00.123Z");
      }
    });
  });
});
