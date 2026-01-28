/**
 * JSONL Parser Tests
 *
 * Tests for the streaming JSONL parser implementation.
 * Integration tests for parser + classifier working together.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { JsonlEventParser } from "./jsonl-parser.js";
import { JsonlEventParser as ExportedParser } from "../index.js";
import type { IEventParser, ParsedEvent } from "../../domain/ports/index.js";

describe("JsonlEventParser", () => {
  const testDir = join(tmpdir(), "jsonl-parser-test-" + Date.now());

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  /**
   * Helper to create a test JSONL file
   */
  function createTestFile(name: string, lines: string[]): string {
    const filePath = join(testDir, name);
    writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  /**
   * Helper to collect all events from async generator
   */
  async function collectEvents(
    parser: IEventParser,
    filePath: string
  ): Promise<ParsedEvent[]> {
    const events: ParsedEvent[] = [];
    for await (const event of parser.parse(filePath)) {
      events.push(event);
    }
    return events;
  }

  describe("interface implementation", () => {
    test("implements IEventParser interface", () => {
      const parser = new JsonlEventParser();
      expect(parser.parse).toBeDefined();
      expect(typeof parser.parse).toBe("function");
    });

    test("is exported from infrastructure index", () => {
      expect(ExportedParser).toBe(JsonlEventParser);
      const parser = new ExportedParser();
      expect(parser.parse).toBeDefined();
    });

    test("parse returns AsyncIterable", async () => {
      const filePath = createTestFile("empty.jsonl", []);
      const parser = new JsonlEventParser();
      const iterable = parser.parse(filePath);
      expect(iterable[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe("streaming line reader", () => {
    test("yields events for valid JSONL", async () => {
      const filePath = createTestFile("valid.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "hello"}}',
        '{"type": "assistant", "uuid": "2", "timestamp": "2026-01-28T10:00:01Z", "message": {"content": []}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(2);
      expect(events[0].type).toBe("user");
      expect(events[1].type).toBe("assistant");
    });

    test("handles empty files (yields nothing)", async () => {
      const filePath = createTestFile("empty.jsonl", []);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(0);
    });

    test("processes each line independently", async () => {
      const filePath = createTestFile("multi.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "hello"}}',
        "invalid json here",
        '{"type": "user", "uuid": "3", "timestamp": "2026-01-28T10:00:02Z", "message": {"role": "user", "content": "world"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      // First and third should be classified as user
      expect(events[0].type).toBe("user");
      // Second should be skipped due to malformed JSON
      expect(events[1].type).toBe("skipped");
      expect((events[1] as { type: "skipped"; reason: string }).reason).toContain(
        "Malformed JSON at line 2"
      );
      // Third should be classified
      expect(events[2].type).toBe("user");
    });
  });

  describe("JSON parse error handling", () => {
    test("parses valid JSON lines", async () => {
      const filePath = createTestFile("valid-json.jsonl", [
        '{"type": "summary", "summary": "test content", "timestamp": "2026-01-28T10:00:00Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("summary");
      if (events[0].type === "summary") {
        expect(events[0].data.content).toBe("test content");
      }
    });

    test("yields skipped event for invalid JSON", async () => {
      const filePath = createTestFile("invalid.jsonl", [
        "this is not json",
        '{"type": "progress"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(2);
      expect(events[0].type).toBe("skipped");
      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        "Malformed JSON"
      );
    });

    test("includes line number in error message", async () => {
      const filePath = createTestFile("line-numbers.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "a"}}',
        '{"type": "assistant", "uuid": "2", "timestamp": "2026-01-28T10:00:01Z", "message": {"content": []}}',
        "broken json on line 3",
        '{"type": "summary", "summary": "sum", "timestamp": "2026-01-28T10:00:03Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(4);
      expect(events[2].type).toBe("skipped");
      expect((events[2] as { type: "skipped"; reason: string }).reason).toContain(
        "line 3"
      );
    });

    test("continues parsing after malformed line", async () => {
      const filePath = createTestFile("continues.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "hello"}}',
        "malformed",
        '{"type": "user", "uuid": "3", "timestamp": "2026-01-28T10:00:02Z", "message": {"role": "user", "content": "world"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      // Second is malformed
      expect(events[1].type).toBe("skipped");
      expect((events[1] as { type: "skipped"; reason: string }).reason).toContain(
        "Malformed"
      );
      // Third still classified
      expect(events[2].type).toBe("user");
    });

    test("handles empty lines", async () => {
      const filePath = createTestFile("with-empty.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "hello"}}',
        "",
        '{"type": "assistant", "uuid": "2", "timestamp": "2026-01-28T10:00:01Z", "message": {"content": []}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      // Empty line should be skipped
      expect(events[1].type).toBe("skipped");
      expect((events[1] as { type: "skipped"; reason: string }).reason).toContain(
        "Empty line"
      );
    });
  });

  describe("event classification integration", () => {
    test("classifies user events", async () => {
      const filePath = createTestFile("user-classify.jsonl", [
        '{"type": "user", "uuid": "u1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "hello"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("user");
      if (events[0].type === "user") {
        expect(events[0].data.uuid).toBe("u1");
        expect(events[0].data.message.content).toBe("hello");
      }
    });

    test("classifies assistant events", async () => {
      const filePath = createTestFile("assistant-classify.jsonl", [
        '{"type": "assistant", "uuid": "a1", "timestamp": "2026-01-28T10:00:00Z", "message": {"model": "claude-opus-4-5-20251101", "content": [{"type": "text", "text": "Hi there!"}]}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("assistant");
      if (events[0].type === "assistant") {
        expect(events[0].data.uuid).toBe("a1");
        expect(events[0].data.message.model).toBe("claude-opus-4-5-20251101");
        expect(events[0].data.message.content[0].type).toBe("text");
      }
    });

    test("classifies summary events", async () => {
      const filePath = createTestFile("summary-classify.jsonl", [
        '{"type": "summary", "summary": "This session covered...", "timestamp": "2026-01-28T10:00:00Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("summary");
      if (events[0].type === "summary") {
        expect(events[0].data.content).toBe("This session covered...");
      }
    });

    test("classifies system events", async () => {
      const filePath = createTestFile("system-classify.jsonl", [
        '{"type": "system", "subtype": "turn_duration", "durationMs": 5000, "timestamp": "2026-01-28T10:00:00Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("system");
      if (events[0].type === "system") {
        expect(events[0].data.subtype).toBe("turn_duration");
        expect(events[0].data.data).toBe(5000);
      }
    });

    test("skips progress events", async () => {
      const filePath = createTestFile("progress-skip.jsonl", [
        '{"type": "progress", "content": "Processing...", "timestamp": "2026-01-28T10:00:00Z"}',
        '{"type": "bash_progress", "command": "ls", "timestamp": "2026-01-28T10:00:01Z"}',
        '{"type": "agent_progress", "agentId": "a1", "timestamp": "2026-01-28T10:00:02Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      for (const event of events) {
        expect(event.type).toBe("skipped");
      }
    });

    test("skips file-history-snapshot events", async () => {
      const filePath = createTestFile("snapshot-skip.jsonl", [
        '{"type": "file-history-snapshot", "messageId": "msg1", "snapshot": {}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("skipped");
      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        "file-history-snapshot"
      );
    });

    test("skips base64 and image events", async () => {
      const filePath = createTestFile("binary-skip.jsonl", [
        '{"type": "base64", "mediaType": "image/png", "data": "abc123"}',
        '{"type": "image", "source": "screenshot", "path": "/tmp/img.png"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(2);
      expect(events[0].type).toBe("skipped");
      expect(events[1].type).toBe("skipped");
    });

    test("returns skipped for invalid structure", async () => {
      const filePath = createTestFile("invalid-structure.jsonl", [
        '{"uuid": "1", "message": {"content": "no type field"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("skipped");
      expect((events[0] as { type: "skipped"; reason: string }).reason).toBe(
        "Invalid event structure"
      );
    });

    test("returns skipped for non-object JSON values", async () => {
      const filePath = createTestFile("non-object.jsonl", [
        '"just a string"',
        "42",
        "null",
        "true",
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(4);
      for (const event of events) {
        expect(event.type).toBe("skipped");
        expect((event as { type: "skipped"; reason: string }).reason).toBe(
          "Invalid event structure"
        );
      }
    });
  });

  describe("real-world event scenarios", () => {
    test("handles mixed event types in order", async () => {
      const filePath = createTestFile("mixed.jsonl", [
        '{"type": "user", "uuid": "1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": "Write a function"}}',
        '{"type": "assistant", "uuid": "2", "timestamp": "2026-01-28T10:00:01Z", "message": {"content": [{"type": "text", "text": "Here is the function:"}]}}',
        '{"type": "progress", "content": "Writing..."}',
        '{"type": "system", "subtype": "turn_duration", "durationMs": 1000, "timestamp": "2026-01-28T10:00:02Z"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(4);
      expect(events[0].type).toBe("user");
      expect(events[1].type).toBe("assistant");
      expect(events[2].type).toBe("skipped"); // progress
      expect(events[3].type).toBe("system");
    });

    test("handles user events with tool results", async () => {
      const filePath = createTestFile("tool-results.jsonl", [
        '{"type": "user", "uuid": "u1", "timestamp": "2026-01-28T10:00:00Z", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "File contents here"}]}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("user");
      if (events[0].type === "user") {
        expect(events[0].data.message.content).toBe("File contents here");
      }
    });

    test("handles assistant events with tool uses", async () => {
      const filePath = createTestFile("tool-uses.jsonl", [
        '{"type": "assistant", "uuid": "a1", "timestamp": "2026-01-28T10:00:00Z", "message": {"content": [{"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "/test.ts"}}]}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("assistant");
      if (events[0].type === "assistant") {
        expect(events[0].data.message.content).toHaveLength(1);
        const block = events[0].data.message.content[0];
        if (block.type === "tool_use") {
          expect(block.name).toBe("Read");
          expect(block.input).toEqual({ file_path: "/test.ts" });
        }
      }
    });

    test("filters thinking blocks from assistant", async () => {
      const filePath = createTestFile("thinking.jsonl", [
        '{"type": "assistant", "uuid": "a1", "timestamp": "2026-01-28T10:00:00Z", "message": {"content": [{"type": "thinking", "thinking": "Let me think...", "signature": "abc"}, {"type": "text", "text": "Here is my answer"}]}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("assistant");
      if (events[0].type === "assistant") {
        // Only text block should remain, thinking filtered
        expect(events[0].data.message.content).toHaveLength(1);
        expect(events[0].data.message.content[0].type).toBe("text");
      }
    });
  });
});
