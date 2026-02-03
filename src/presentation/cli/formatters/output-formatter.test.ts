/**
 * Output Formatter Tests
 *
 * TDD tests for output formatting strategy pattern.
 */

import { describe, it, expect } from "bun:test";
import {
  createOutputFormatter,
  type OutputMode,
  type FormatOptions,
  CONTEXT_BUDGET,
} from "./output-formatter.js";
import type { SearchResult } from "../../../domain/value-objects/search-result.js";

describe("OutputFormatter", () => {
  // Test search results
  const mockResults: SearchResult[] = [
    {
      sessionId: "session-1234-abcd-efgh",
      messageId: "msg-001",
      role: "user",
      score: 0.95,
      timestamp: new Date("2026-01-27T14:30:00Z"),
      snippet: "This is a <mark>test</mark> snippet for searching",
    },
    {
      sessionId: "session-5678-ijkl-mnop",
      messageId: "msg-002",
      role: "assistant",
      score: 0.85,
      timestamp: new Date("2026-01-28T10:00:00Z"),
      snippet: "Another <mark>test</mark> result here",
    },
  ];

  describe("createOutputFormatter", () => {
    it("creates a formatter with formatResults method", () => {
      const formatter = createOutputFormatter("default", false);
      expect(typeof formatter.formatResults).toBe("function");
    });

    it("creates a formatter with formatError method", () => {
      const formatter = createOutputFormatter("default", false);
      expect(typeof formatter.formatError).toBe("function");
    });

    it("creates a formatter with formatSummary method", () => {
      const formatter = createOutputFormatter("default", false);
      expect(typeof formatter.formatSummary).toBe("function");
    });
  });

  describe("default mode", () => {
    const formatter = createOutputFormatter("default", false);

    it("formats results with header", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("Found 2 result(s)");
    });

    it("includes session ID (truncated to 16 chars)", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("session-1234-abc");
    });

    it("includes role label", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("[User]");
      expect(output).toContain("[Assistant]");
    });

    it("includes score as percentage", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("95%");
    });

    it("includes snippet content", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("test");
      expect(output).toContain("snippet");
    });

    it("returns 'No results' message when empty", () => {
      const output = formatter.formatResults([], { query: "test" });
      expect(output).toContain("No results");
    });
  });

  describe("default mode with colors", () => {
    const formatter = createOutputFormatter("default", true);

    it("highlights matches with bold cyan in TTY mode", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      // Bold+cyan (1;36m) for maximum visibility across terminals
      expect(output).toContain("\x1b[1;36m");
      expect(output).toContain("\x1b[0m");
    });

    it("does not use plain bold without color", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      // Should NOT have plain bold (1m) without cyan
      // The snippet should have bold+cyan, not just bold
      expect(output).not.toMatch(/\x1b\[1m[^3]/); // \x1b[1m not followed by ;36
    });
  });

  describe("default mode without colors", () => {
    const formatter = createOutputFormatter("default", false);

    it("uses asterisk markers for highlighting", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("*test*");
      expect(output).not.toContain("<mark>");
      expect(output).not.toContain("</mark>");
    });
  });

  describe("json mode", () => {
    const formatter = createOutputFormatter("json", false);

    it("outputs valid JSON array", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("includes all required fields including role", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      const parsed = JSON.parse(output);
      const first = parsed[0];

      expect(first.sessionId).toBe("session-1234-abcd-efgh");
      expect(first.messageId).toBe("msg-001");
      expect(first.role).toBe("user");
      expect(first.score).toBe(0.95);
      expect(first.timestamp).toBeDefined();
      expect(first.snippet).toContain("test");
    });

    it("outputs empty array when no results", () => {
      const output = formatter.formatResults([], { query: "test" });
      const parsed = JSON.parse(output);
      expect(parsed).toEqual([]);
    });

    it("has no ANSI color codes", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).not.toContain("\x1b[");
    });
  });

  describe("quiet mode", () => {
    const formatter = createOutputFormatter("quiet", false);

    it("has no header", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).not.toContain("Found");
    });

    it("outputs session ID (16 chars) and snippet", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("session-1234-abc");
      expect(output).toContain("test");
    });

    it("uses asterisk markers for highlighting", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("*test*");
    });

    it("returns empty string when no results", () => {
      const output = formatter.formatResults([], { query: "test" });
      expect(output).toBe("");
    });
  });

  describe("verbose mode", () => {
    const formatter = createOutputFormatter("verbose", false);

    it("shows full session ID (not truncated)", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("session-1234-abcd-efgh");
    });

    it("includes role label", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });
      expect(output).toContain("[User]");
      expect(output).toContain("[Assistant]");
    });

    it("shows execution details when provided", () => {
      const output = formatter.formatResults(mockResults, {
        query: "test",
        executionDetails: {
          timeMs: 150,
          ftsQuery: 'test*',
          filtersApplied: ['limit: 10'],
        },
      });
      expect(output).toContain("150");
      expect(output).toContain("test*");
    });
  });

  describe("formatError", () => {
    const formatter = createOutputFormatter("default", false);

    it("formats error with Error: prefix", () => {
      const error = new Error("Something went wrong");
      const output = formatter.formatError(error);
      expect(output).toContain("Error:");
      expect(output).toContain("Something went wrong");
    });

    it("handles non-Error objects", () => {
      const output = formatter.formatError("string error" as unknown as Error);
      expect(output).toContain("Error:");
    });
  });

  describe("formatError in verbose mode", () => {
    const formatter = createOutputFormatter("verbose", false);

    it("includes stack trace in verbose mode", () => {
      const error = new Error("Test error");
      const output = formatter.formatError(error);
      expect(output).toContain("Test error");
      // Stack trace should be present
      expect(output).toContain("at ");
    });
  });

  describe("formatSummary", () => {
    const formatter = createOutputFormatter("default", false);

    it("shows found and shown counts", () => {
      const output = formatter.formatSummary({ found: 100, shown: 10 });
      expect(output).toContain("Found 100 results");
      expect(output).toContain("showing 10");
    });

    it("indicates when truncated", () => {
      const output = formatter.formatSummary({ found: 100, shown: 10, truncated: true });
      expect(output).toContain("truncated");
    });

    it("returns empty string in quiet mode", () => {
      const quietFormatter = createOutputFormatter("quiet", false);
      const output = quietFormatter.formatSummary({ found: 100, shown: 10 });
      expect(output).toBe("");
    });
  });

  describe("context budget", () => {
    it("exports CONTEXT_BUDGET constant", () => {
      expect(CONTEXT_BUDGET).toBe(50000);
    });

    it("truncates output when budget exceeded", () => {
      // Create many results to exceed budget
      const manyResults: SearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        sessionId: `session-${i.toString().padStart(4, "0")}-abcd-efgh`,
        messageId: `msg-${i}`,
        role: "user",
        score: 0.9,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: "A".repeat(200), // 200 chars per snippet
      }));

      const formatter = createOutputFormatter("default", false);
      const output = formatter.formatResults(manyResults, { query: "test" });

      // Output should be truncated
      expect(output.length).toBeLessThanOrEqual(CONTEXT_BUDGET + 200); // Some margin for truncation message
      expect(output).toContain("truncated");
    });
  });
});
