/**
 * Output Formatter Tests
 *
 * TDD tests for output formatting strategy pattern.
 */

import { describe, it, expect } from "bun:test";
import {
  createOutputFormatter,
  extractHighlights,
  type OutputMode,
  type FormatOptions,
  type SearchMetaInfo,
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

    it("formats errors as JSON and keeps summary empty", () => {
      const error = JSON.parse(formatter.formatError(new Error("json failure")));

      expect(error).toEqual({ error: "json failure" });
      expect(formatter.formatSummary({ found: 2, shown: 2 })).toBe("");
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

    it("formats errors with Error prefix", () => {
      expect(formatter.formatError(new Error("quiet failure"))).toContain("quiet failure");
    });
  });

  describe("brief mode", () => {
    const formatter = createOutputFormatter("brief", false);

    it("formats each result as one plain-text line", () => {
      const output = formatter.formatResults(mockResults, { query: "test" });

      expect(output.split("\n")).toHaveLength(2);
      expect(output).toContain("session-1234-abcd-efgh [95%] This is a test snippet");
      expect(output).not.toContain("<mark>");
    });

    it("returns query-aware empty message", () => {
      expect(formatter.formatResults([], { query: "missing" })).toBe('No results for "missing"');
    });

    it("formats errors and keeps summary empty", () => {
      expect(formatter.formatError(new Error("brief failure"))).toContain("brief failure");
      expect(formatter.formatSummary({ found: 2, shown: 2 })).toBe("");
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

    it("uses verbose summary wording for truncation", () => {
      const verboseFormatter = createOutputFormatter("verbose", false);
      const output = verboseFormatter.formatSummary({ found: 100, shown: 10, truncated: true });

      expect(output).toContain("=== Summary ===");
      expect(output).toContain("truncated due to context budget");
    });
  });

  describe("json mode with searchMeta envelope", () => {
    const formatter = createOutputFormatter("json", false);
    const mockMeta: SearchMetaInfo = {
      mode: "hybrid",
      modeReason: "auto_hybrid",
      degraded: false,
      embeddingCoverage: 0.85,
      capabilities: { fts: true, vector: true, hybrid: true },
      timingMs: 142,
    };

    const hybridResults: SearchResult[] = [
      {
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: "This is a <mark>test</mark> snippet",
        source: "both",
        rawScores: { bm25: -3.2, cosine: 0.87, rrf: 0.032 },
      },
    ];

    it("wraps output in meta envelope when searchMeta provided", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      const parsed = JSON.parse(output);

      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.query).toBe("test");
      expect(parsed.meta.mode).toBe("hybrid");
      expect(parsed.meta.mode_reason).toBe("auto_hybrid");
      expect(parsed.meta.total_results).toBe(1);
      expect(parsed.meta.embedding_coverage).toBe(0.85);
      expect(parsed.meta.degraded).toBe(false);
      expect(parsed.meta.capabilities).toEqual({ fts: true, vector: true, hybrid: true });
      expect(parsed.meta.timing_ms).toBe(142);
      expect(parsed.results).toBeDefined();
      expect(parsed.results.length).toBe(1);
    });

    it("includes degradation_reason when degraded", () => {
      const degradedMeta: SearchMetaInfo = {
        ...mockMeta,
        degraded: true,
        degradationReason: "no_embeddings",
      };
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: degradedMeta,
      });
      const parsed = JSON.parse(output);
      expect(parsed.meta.degraded).toBe(true);
      expect(parsed.meta.degradation_reason).toBe("no_embeddings");
    });

    it("omits degradation_reason when not degraded", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      const parsed = JSON.parse(output);
      expect(parsed.meta.degradation_reason).toBeUndefined();
    });

    it("includes per-result rank, score, raw_scores, source", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      const parsed = JSON.parse(output);
      const first = parsed.results[0];

      expect(first.rank).toBe(1);
      expect(first.score).toBe(0.95);
      expect(first.raw_scores).toEqual({ bm25: -3.2, cosine: 0.87, rrf: 0.032 });
      expect(first.source).toBe("both");
    });

    it("includes highlights extracted from mark tags", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      const parsed = JSON.parse(output);
      const first = parsed.results[0];

      expect(first.highlights).toBeDefined();
      expect(first.highlights.length).toBeGreaterThan(0);
      expect(first.highlights[0]).toEqual({ offset: 10, length: 4 });
    });

    it("outputs backward-compatible array when no searchMeta", () => {
      const output = formatter.formatResults(hybridResults, { query: "test" });
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("omits raw_scores and source from per-result when not present", () => {
      const plainResults: SearchResult[] = [
        {
          sessionId: "session-1234-abcd-efgh",
          messageId: "msg-001",
          role: "user",
          score: 0.95,
          timestamp: new Date("2026-01-27T14:30:00Z"),
          snippet: "No marks here",
        },
      ];
      const output = formatter.formatResults(plainResults, { query: "test" });
      const parsed = JSON.parse(output);
      const first = parsed[0];
      expect(first.raw_scores).toBeUndefined();
      expect(first.source).toBeUndefined();
    });
  });

  describe("verbose mode with searchMeta", () => {
    const formatter = createOutputFormatter("verbose", false);
    const mockMeta: SearchMetaInfo = {
      mode: "hybrid",
      modeReason: "auto_hybrid",
      degraded: false,
      embeddingCoverage: 0.85,
      capabilities: { fts: true, vector: true, hybrid: true },
      timingMs: 142,
    };

    const hybridResults: SearchResult[] = [
      {
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: "Test snippet",
        source: "both",
        rawScores: { bm25: -2.1, cosine: 0.92, rrf: 0.028 },
      },
    ];

    it("includes mode info when searchMeta provided", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      expect(output).toContain("Mode: hybrid");
    });

    it("includes degradation info when degraded", () => {
      const degradedMeta: SearchMetaInfo = {
        ...mockMeta,
        degraded: true,
        degradationReason: "provider_unavailable",
      };
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: degradedMeta,
      });
      expect(output).toContain("degraded");
      expect(output).toContain("provider_unavailable");
    });

    it("uses unknown degradation reason when one is not provided", () => {
      const degradedMeta: SearchMetaInfo = {
        ...mockMeta,
        degraded: true,
        degradationReason: undefined,
      };
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: degradedMeta,
      });
      expect(output).toContain("degraded: unknown");
    });

    it("includes per-ranker breakdown for results with rawScores", () => {
      const output = formatter.formatResults(hybridResults, {
        query: "test",
        searchMeta: mockMeta,
      });
      expect(output).toContain("bm25");
      expect(output).toContain("cosine");
    });

    it("shows existing format without searchMeta (backward compat)", () => {
      const output = formatter.formatResults(hybridResults, { query: "test" });
      expect(output).not.toContain("Mode:");
    });
  });

  describe("extractHighlights", () => {
    it("extracts single mark tag", () => {
      const highlights = extractHighlights("This is a <mark>test</mark> snippet");
      expect(highlights).toEqual([{ offset: 10, length: 4 }]);
    });

    it("extracts multiple mark tags", () => {
      const highlights = extractHighlights("<mark>auth</mark> and <mark>JWT</mark>");
      expect(highlights).toEqual([
        { offset: 0, length: 4 },
        { offset: 9, length: 3 },
      ]);
    });

    it("returns empty array when no marks", () => {
      const highlights = extractHighlights("No highlights here");
      expect(highlights).toEqual([]);
    });

    it("handles adjacent mark tags", () => {
      const highlights = extractHighlights("<mark>hello</mark><mark>world</mark>");
      expect(highlights).toEqual([
        { offset: 0, length: 5 },
        { offset: 5, length: 5 },
      ]);
    });
  });

  describe("snippet truncation at terminal width", () => {
    it("truncates long snippets at terminal width boundary", () => {
      const formatter = createOutputFormatter("default", false);
      const longSnippet = "B".repeat(1000);
      const results: SearchResult[] = [{
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: longSnippet,
      }];

      const output = formatter.formatResults(results, { query: "test" });

      // Full 1000-char snippet should not appear in output
      expect(output).not.toContain("B".repeat(1000));
      // Snippet line should contain truncation indicator
      const snippetLine = output.split("\n").find(l => l.trimStart().startsWith("B"));
      expect(snippetLine).toBeDefined();
      expect(snippetLine!).toContain("...");
    });

    it("does not truncate short snippets", () => {
      const formatter = createOutputFormatter("default", false);
      const shortSnippet = "Short result";
      const results: SearchResult[] = [{
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: shortSnippet,
      }];

      const output = formatter.formatResults(results, { query: "test" });

      expect(output).toContain("Short result");
      // Snippet line should not have truncation ellipsis
      const snippetLine = output.split("\n").find(l => l.includes("Short result"));
      expect(snippetLine).toBeDefined();
      expect(snippetLine!).not.toMatch(/Short result.*\.\.\./);
    });

    it("truncates long snippets in quiet mode", () => {
      const formatter = createOutputFormatter("quiet", false);
      const longSnippet = "C".repeat(1000);
      const results: SearchResult[] = [{
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: longSnippet,
      }];

      const output = formatter.formatResults(results, { query: "test" });

      expect(output).not.toContain("C".repeat(1000));
      expect(output).toContain("...");
    });

    it("truncates long snippets in verbose mode", () => {
      const formatter = createOutputFormatter("verbose", false);
      const longSnippet = "D".repeat(1000);
      const results: SearchResult[] = [{
        sessionId: "session-1234-abcd-efgh",
        messageId: "msg-001",
        role: "user",
        score: 0.95,
        timestamp: new Date("2026-01-27T14:30:00Z"),
        snippet: longSnippet,
      }];

      const output = formatter.formatResults(results, { query: "test" });

      expect(output).not.toContain("D".repeat(1000));
      const snippetLine = output.split("\n").find(l => l.trimStart().startsWith("D"));
      expect(snippetLine).toBeDefined();
      expect(snippetLine!).toContain("...");
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
