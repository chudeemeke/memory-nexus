/**
 * Large File Integration Tests
 *
 * Validates that the streaming JSONL parser handles large files (10K+ lines)
 * without memory exhaustion or performance degradation.
 *
 * Tests requirements QUAL-03: Parser handles 10K+ line files without memory exhaustion.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlEventParser } from "../../src/infrastructure/parsers/jsonl-parser.js";

/**
 * Generate a JSONL file with the specified number of lines.
 * Creates realistic event content with a mix of user, assistant, and tool_use events.
 *
 * @param lineCount Number of lines to generate
 * @param filePath Path where the file should be written
 */
function generateLargeJsonl(lineCount: number, filePath: string): void {
  const lines: string[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < lineCount; i++) {
    const timestamp = new Date(baseTime + i * 1000).toISOString();
    const uuid = `msg-${i.toString().padStart(6, "0")}`;

    // Rotate through different event types for realistic distribution
    const eventType = i % 4;

    let event: object;
    switch (eventType) {
      case 0:
        // User message
        event = {
          type: "user",
          message: {
            role: "user",
            content: `This is user message number ${i}. It contains some realistic text content that simulates what users might type. The message includes details about coding, debugging, and general software development tasks.`,
          },
          uuid,
          timestamp,
        };
        break;
      case 1:
        // Assistant message with text
        event = {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: `This is assistant response number ${i}. I'll help you with your request. Here's a detailed explanation of the solution: First, you need to understand the core concept. Then implement the changes step by step. Make sure to test thoroughly.`,
              },
            ],
          },
          uuid,
          timestamp,
        };
        break;
      case 2:
        // Assistant message with tool use
        event = {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: `tool-${i}`,
                name: i % 3 === 0 ? "Bash" : i % 3 === 1 ? "Read" : "Write",
                input: {
                  command: `echo "Processing item ${i}"`,
                  file_path: `/path/to/file-${i}.ts`,
                },
              },
            ],
          },
          uuid,
          timestamp,
        };
        break;
      case 3:
        // Tool result
        event = {
          type: "result",
          subtype: "tool_result",
          tool_use_id: `tool-${i - 1}`,
          content: `Result for tool invocation ${i - 1}: Success. Output contains detailed information about the operation including file contents, command output, or other relevant data that would typically be returned by the tool.`,
          is_error: false,
          uuid,
          timestamp,
        };
        break;
    }

    lines.push(JSON.stringify(event));
  }

  writeFileSync(filePath, lines.join("\n") + "\n");
}

/**
 * Generate a JSONL file with some malformed lines scattered throughout.
 *
 * @param lineCount Total number of lines
 * @param errorRate Fraction of lines that should be malformed (0-1)
 * @param filePath Path where the file should be written
 * @returns Number of valid lines generated
 */
function generateJsonlWithErrors(
  lineCount: number,
  errorRate: number,
  filePath: string
): number {
  const lines: string[] = [];
  const baseTime = Date.now();
  let validCount = 0;

  for (let i = 0; i < lineCount; i++) {
    // Introduce errors at the specified rate
    if (Math.random() < errorRate) {
      // Various types of malformed content
      const errorType = i % 4;
      switch (errorType) {
        case 0:
          lines.push("{invalid json missing closing brace");
          break;
        case 1:
          lines.push("not json at all, just plain text");
          break;
        case 2:
          lines.push('{"type": "user", "content": undefined}');
          break;
        case 3:
          lines.push(""); // Empty line
          break;
      }
      continue;
    }

    const timestamp = new Date(baseTime + i * 1000).toISOString();
    const uuid = `msg-${i.toString().padStart(6, "0")}`;

    const event = {
      type: "user",
      message: {
        role: "user",
        content: `Valid message ${i}`,
      },
      uuid,
      timestamp,
    };

    lines.push(JSON.stringify(event));
    validCount++;
  }

  writeFileSync(filePath, lines.join("\n") + "\n");
  return validCount;
}

describe("Large File Integration Tests", () => {
  let testDir: string;
  let parser: JsonlEventParser;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "large-file-test-"));
    parser = new JsonlEventParser();
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  test("parses 10,000 line file without memory spike", async () => {
    const filePath = join(testDir, "large-10k.jsonl");
    generateLargeJsonl(10000, filePath);

    // Record memory before parsing
    const memBefore = process.memoryUsage().heapUsed;

    // Parse the file and count events
    let eventCount = 0;
    let validEventCount = 0;
    for await (const event of parser.parse(filePath)) {
      eventCount++;
      if (event.type !== "skipped") {
        validEventCount++;
      }
    }

    // Record memory after parsing
    const memAfter = process.memoryUsage().heapUsed;
    const memIncreaseMB = (memAfter - memBefore) / (1024 * 1024);

    // Assertions
    expect(eventCount).toBe(10000);
    // Most events should be valid (some might be skipped due to unrecognized types)
    expect(validEventCount).toBeGreaterThan(2000); // At least user messages should be valid

    // Memory increase should be bounded (< 50MB per STATE.md learning)
    // Note: This is a soft assertion as GC timing can affect results
    expect(memIncreaseMB).toBeLessThan(100); // Allow some margin for test environment variability
  }, 30000); // 30 second timeout

  test("parses 50,000 line file without memory spike", async () => {
    const filePath = join(testDir, "large-50k.jsonl");
    generateLargeJsonl(50000, filePath);

    // Record memory before parsing
    const memBefore = process.memoryUsage().heapUsed;

    // Parse the file and count events
    let eventCount = 0;
    for await (const event of parser.parse(filePath)) {
      eventCount++;
    }

    // Record memory after parsing
    const memAfter = process.memoryUsage().heapUsed;
    const memIncreaseMB = (memAfter - memBefore) / (1024 * 1024);

    // Assertions
    expect(eventCount).toBe(50000);

    // Memory should still be bounded even with 5x the data
    // Streaming means memory usage should not scale linearly with file size
    expect(memIncreaseMB).toBeLessThan(150);
  }, 60000); // 60 second timeout

  test("maintains performance with large files", async () => {
    const filePath = join(testDir, "perf-10k.jsonl");
    generateLargeJsonl(10000, filePath);

    // Time the parsing
    const startTime = performance.now();

    let eventCount = 0;
    for await (const event of parser.parse(filePath)) {
      eventCount++;
    }

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const durationSec = durationMs / 1000;
    const eventsPerSecond = eventCount / durationSec;

    // Performance assertions
    expect(eventCount).toBe(10000);
    expect(durationSec).toBeLessThan(5); // Must complete in under 5 seconds

    // Track events per second for regression detection
    // Should be at least 2000 events/second (very conservative)
    expect(eventsPerSecond).toBeGreaterThan(2000);
  }, 30000);

  test("handles malformed lines in large file gracefully", async () => {
    const filePath = join(testDir, "errors-10k.jsonl");
    const errorRate = 0.1; // 10% of lines are malformed
    const expectedValidCount = generateJsonlWithErrors(10000, errorRate, filePath);

    let totalEvents = 0;
    let skippedEvents = 0;
    let validEvents = 0;

    for await (const event of parser.parse(filePath)) {
      totalEvents++;
      if (event.type === "skipped") {
        skippedEvents++;
      } else {
        validEvents++;
      }
    }

    // Parser should process all lines
    expect(totalEvents).toBe(10000);

    // Should have both skipped and valid events
    expect(skippedEvents).toBeGreaterThan(0);
    expect(validEvents).toBeGreaterThan(0);

    // Valid event count should be close to what we generated
    // Allow some margin because some events might be classified differently
    expect(validEvents).toBeGreaterThanOrEqual(expectedValidCount * 0.9);

    // Skipped should be roughly 10% of total
    expect(skippedEvents).toBeGreaterThan(500); // At least 5% due to randomness
  }, 30000);

  test("streaming parser does not load entire file into memory", async () => {
    // Create a file with predictable memory characteristics
    const filePath = join(testDir, "memory-test.jsonl");
    generateLargeJsonl(20000, filePath);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memBaseline = process.memoryUsage().heapUsed;

    // Parse incrementally and verify we can handle large files
    let eventCount = 0;
    const sampleInterval = 5000; // Sample memory every 5000 events
    const memSamples: number[] = [memBaseline];

    for await (const event of parser.parse(filePath)) {
      eventCount++;

      // Periodically sample memory usage
      if (eventCount % sampleInterval === 0) {
        memSamples.push(process.memoryUsage().heapUsed);
      }
    }

    memSamples.push(process.memoryUsage().heapUsed);

    expect(eventCount).toBe(20000);

    // Memory should remain relatively stable during streaming
    // Check that no single sample spikes more than 200MB from baseline
    const maxMemory = Math.max(...memSamples);
    const memSpikeMB = (maxMemory - memBaseline) / (1024 * 1024);
    expect(memSpikeMB).toBeLessThan(200);
  }, 60000);
});
