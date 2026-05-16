/**
 * dto-helpers.test.ts
 *
 * Tests pure DTO helper functions extracted from JsonOutputFormatter
 * (per Codex MEDIUM-1).
 *
 * INVARIANT (Gemini LOW): highlight offsets MUST be computed BEFORE
 * <mark> tags are stripped from the snippet. Computing after-strip
 * would always produce offset 0 (no tags remain). Verified here.
 */

import { describe, expect, it } from "bun:test";
import { SearchResult } from "../../../domain/value-objects/search-result.js";
import { toSearchResultDto } from "./dto-helpers.js";

describe("toSearchResultDto (Plan 32-02 MEDIUM-1)", () => {
  function makeResult(overrides: {
    snippet?: string;
    rawScores?: { bm25?: number; cosine?: number; rrf?: number };
    source?: "fts" | "vector" | "both";
  } = {}): SearchResult {
    return SearchResult.create({
      sessionId: "session-123",
      messageId: "message-456",
      snippet: overrides.snippet ?? "plain snippet",
      score: 0.5,
      timestamp: new Date("2026-01-15T12:00:00.000Z"),
      role: "user",
      source: overrides.source,
      rawScores: overrides.rawScores,
    });
  }

  describe("base shape", () => {
    it("returns sessionId, messageId, role, score, timestamp, snippet", () => {
      const r = makeResult();
      const dto = toSearchResultDto(r);
      expect(dto.sessionId).toBe("session-123");
      expect(dto.messageId).toBe("message-456");
      expect(dto.role).toBe("user");
      expect(dto.score).toBe(0.5);
      expect(dto.timestamp).toBe("2026-01-15T12:00:00.000Z");
      expect(dto.snippet).toBe("plain snippet");
    });

    it("strips <mark>...</mark> from the snippet", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r);
      expect(dto.snippet).toBe("foo bar baz");
    });
  });

  describe("INVARIANT — highlights computed BEFORE strip (Gemini LOW)", () => {
    it("captures highlight offset/length on the clean text", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      // Offset is in the CLEAN snippet ("foo bar baz"). "bar" starts at index 4.
      expect(dto.highlights).toEqual([{ offset: 4, length: 3 }]);
      // The snippet field is the stripped form.
      expect(dto.snippet).toBe("foo bar baz");
    });

    it("captures highlights for multiple matches", () => {
      const r = makeResult({
        snippet: "<mark>a</mark> b <mark>c</mark>",
      });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      expect(dto.highlights).toEqual([
        { offset: 0, length: 1 },
        { offset: 4, length: 1 },
      ]);
      expect(dto.snippet).toBe("a b c");
    });

    it("omits highlights field when none present (search-meta mode)", () => {
      const r = makeResult({ snippet: "no marks here" });
      const dto = toSearchResultDto(r, { includeSearchMetaFields: true });
      expect(dto.highlights).toBeUndefined();
    });

    it("does not include highlights when includeSearchMetaFields is false", () => {
      const r = makeResult({ snippet: "foo <mark>bar</mark> baz" });
      const dto = toSearchResultDto(r);
      expect(dto.highlights).toBeUndefined();
    });
  });

  describe("hybrid-search-meta fields (raw_scores, source, rank)", () => {
    it("includes rank when opts.rank is provided", () => {
      const r = makeResult();
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.rank).toBe(1);
    });

    it("includes raw_scores when rawScores is present on the result", () => {
      const r = makeResult({ rawScores: { bm25: 0.7, cosine: 0.4 } });
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.raw_scores).toEqual({ bm25: 0.7, cosine: 0.4 });
    });

    it("includes source when present", () => {
      const r = makeResult({ source: "both" });
      const dto = toSearchResultDto(r, {
        rank: 1,
        includeSearchMetaFields: true,
      });
      expect(dto.source).toBe("both");
    });

    it("does not leak hybrid fields when includeSearchMetaFields is false", () => {
      const r = makeResult({
        source: "fts",
        rawScores: { bm25: 0.9 },
      });
      const dto = toSearchResultDto(r);
      expect(dto.rank).toBeUndefined();
      expect(dto.raw_scores).toBeUndefined();
      expect(dto.source).toBeUndefined();
    });
  });

  describe("CONTEXT_BUDGET boundary documentation (no truncation here)", () => {
    it("does not truncate — caller owns context budget", () => {
      // The DTO helper is shape-only. CONTEXT_BUDGET truncation is the
      // formatter's responsibility (output-formatter.ts), preserved
      // per Codex MEDIUM-1 boundary.
      const longSnippet = "x".repeat(100_000);
      const r = makeResult({ snippet: longSnippet });
      const dto = toSearchResultDto(r);
      expect(dto.snippet.length).toBe(100_000);
    });
  });
});
