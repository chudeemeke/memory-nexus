/**
 * JSONL Parser Tests
 *
 * Tests for the streaming JSONL parser implementation.
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
        '{"type": "user", "uuid": "1", "message": {"content": "hello"}}',
        '{"type": "assistant", "uuid": "2", "message": {"content": []}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(2);
    });

    test("handles empty files (yields nothing)", async () => {
      const filePath = createTestFile("empty.jsonl", []);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(0);
    });

    test("processes each line independently", async () => {
      const filePath = createTestFile("multi.jsonl", [
        '{"type": "user", "uuid": "1"}',
        "invalid json here",
        '{"type": "assistant", "uuid": "2"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      // First and third should be parsed (though classified as skipped for now)
      // Second should be skipped due to malformed JSON
      expect(events[1].type).toBe("skipped");
      expect((events[1] as { type: "skipped"; reason: string }).reason).toContain(
        "Malformed JSON at line 2"
      );
    });
  });

  describe("JSON parse error handling", () => {
    test("parses valid JSON lines", async () => {
      const filePath = createTestFile("valid-json.jsonl", [
        '{"type": "summary", "summary": "test content"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      // Event parsed successfully (though classified as skipped pending 03-03)
    });

    test("yields skipped event for invalid JSON", async () => {
      const filePath = createTestFile("invalid.jsonl", [
        "this is not json",
        '{"valid": "json"}',
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
        '{"type": "user"}',
        '{"type": "assistant"}',
        "broken json on line 3",
        '{"type": "summary"}',
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
        '{"type": "user", "uuid": "1"}',
        "malformed",
        '{"type": "user", "uuid": "3"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(3);
      // Second is malformed
      expect(events[1].type).toBe("skipped");
      expect((events[1] as { type: "skipped"; reason: string }).reason).toContain(
        "Malformed"
      );
      // Third still processed
      expect(events[2]).toBeDefined();
    });

    test("handles empty lines", async () => {
      const filePath = createTestFile("with-empty.jsonl", [
        '{"type": "user"}',
        "",
        '{"type": "assistant"}',
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

  describe("event type detection", () => {
    test("detects user type", async () => {
      const filePath = createTestFile("user-type.jsonl", [
        '{"type": "user", "uuid": "1", "message": {"content": "hello"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events.length).toBe(1);
      // Type was detected (visible in skip reason)
      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        '"user"'
      );
    });

    test("detects assistant type", async () => {
      const filePath = createTestFile("assistant-type.jsonl", [
        '{"type": "assistant", "uuid": "1", "message": {"content": []}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect(events[0].type).toBe("skipped");
      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        '"assistant"'
      );
    });

    test("detects summary type", async () => {
      const filePath = createTestFile("summary-type.jsonl", [
        '{"type": "summary", "summary": "test summary content"}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        '"summary"'
      );
    });

    test("detects system type", async () => {
      const filePath = createTestFile("system-type.jsonl", [
        '{"type": "system", "subtype": "turn_duration", "durationMs": 1000}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        '"system"'
      );
    });

    test("returns unknown for missing type field", async () => {
      const filePath = createTestFile("missing-type.jsonl", [
        '{"uuid": "1", "message": {"content": "no type field"}}',
      ]);
      const parser = new JsonlEventParser();
      const events = await collectEvents(parser, filePath);

      expect((events[0] as { type: "skipped"; reason: string }).reason).toContain(
        '"unknown"'
      );
    });

    test("returns unknown for non-object values", async () => {
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
        expect((event as { type: "skipped"; reason: string }).reason).toContain(
          '"unknown"'
        );
      }
    });
  });
});
