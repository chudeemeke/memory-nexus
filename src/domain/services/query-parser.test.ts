import { describe, expect, it } from "bun:test";
import { QueryParser } from "./query-parser.js";

describe("QueryParser domain service", () => {
  describe("parse", () => {
    it("parses simple query", () => {
      const result = QueryParser.parse("authentication");

      expect(result.terms).toEqual(["authentication"]);
      expect(result.filters).toEqual({});
      expect(result.originalQuery).toBe("authentication");
    });

    it("parses multi-word query", () => {
      const result = QueryParser.parse("fix authentication bug");

      expect(result.terms).toEqual(["fix", "authentication", "bug"]);
    });

    it("normalizes case to lowercase", () => {
      const result = QueryParser.parse("Fix BUG");

      expect(result.terms).toEqual(["fix", "bug"]);
    });

    it("removes duplicate terms", () => {
      const result = QueryParser.parse("bug bug fix bug");

      expect(result.terms).toEqual(["bug", "fix"]);
    });

    it("filters out short terms (< 2 chars)", () => {
      const result = QueryParser.parse("a fix x bug");

      expect(result.terms).toEqual(["fix", "bug"]);
    });
  });

  describe("filter parsing", () => {
    it("parses project filter", () => {
      const result = QueryParser.parse("auth project:wow-system");

      expect(result.terms).toEqual(["auth"]);
      expect(result.filters.project).toBe("wow-system");
    });

    it("parses role filter", () => {
      const result = QueryParser.parse("question role:user");

      expect(result.terms).toEqual(["question"]);
      expect(result.filters.role).toBe("user");
    });

    it("parses tool filter", () => {
      const result = QueryParser.parse("file tool:Read");

      expect(result.terms).toEqual(["file"]);
      expect(result.filters.tool).toBe("read");
    });

    it("parses multiple filters", () => {
      const result = QueryParser.parse("search project:nexus role:assistant");

      expect(result.terms).toEqual(["search"]);
      expect(result.filters.project).toBe("nexus");
      expect(result.filters.role).toBe("assistant");
    });

    it("handles filter with no terms", () => {
      const result = QueryParser.parse("project:wow-system");

      expect(result.terms).toHaveLength(0);
      expect(result.filters.project).toBe("wow-system");
    });
  });

  describe("quoted phrases", () => {
    it("preserves quoted phrases as single term", () => {
      const result = QueryParser.parse('"authentication bug" fix');

      expect(result.terms).toContain("authentication bug");
      expect(result.terms).toContain("fix");
    });

    it("handles multiple quoted phrases", () => {
      const result = QueryParser.parse('"first phrase" "second phrase"');

      expect(result.terms).toContain("first phrase");
      expect(result.terms).toContain("second phrase");
    });

    it("handles unclosed quotes as regular terms", () => {
      const result = QueryParser.parse('"unclosed phrase');

      // Stray quote characters are stripped
      expect(result.terms).toEqual(["unclosed", "phrase"]);
    });
  });

  describe("toFts5Query", () => {
    it("converts simple terms to FTS5 query", () => {
      const parsed = QueryParser.parse("fix bug");

      expect(QueryParser.toFts5Query(parsed)).toBe("fix AND bug");
    });

    it("quotes phrases for FTS5", () => {
      const parsed = QueryParser.parse('"authentication bug"');

      expect(QueryParser.toFts5Query(parsed)).toBe('"authentication bug"');
    });

    it("combines terms and phrases", () => {
      const parsed = QueryParser.parse('"error message" fix');

      const fts5 = QueryParser.toFts5Query(parsed);
      expect(fts5).toContain('"error message"');
      expect(fts5).toContain("fix");
    });

    it("returns empty string for no terms", () => {
      const parsed = QueryParser.parse("project:test");

      expect(QueryParser.toFts5Query(parsed)).toBe("");
    });
  });

  describe("isEmpty", () => {
    it("returns true for empty query", () => {
      const parsed = QueryParser.parse("");

      expect(QueryParser.isEmpty(parsed)).toBe(true);
    });

    it("returns true for whitespace-only query", () => {
      const parsed = QueryParser.parse("   ");

      expect(QueryParser.isEmpty(parsed)).toBe(true);
    });

    it("returns false for query with terms", () => {
      const parsed = QueryParser.parse("auth");

      expect(QueryParser.isEmpty(parsed)).toBe(false);
    });

    it("returns false for query with only filters", () => {
      const parsed = QueryParser.parse("project:test");

      expect(QueryParser.isEmpty(parsed)).toBe(false);
    });
  });

  describe("hasFilters", () => {
    it("returns false for no filters", () => {
      const parsed = QueryParser.parse("just terms");

      expect(QueryParser.hasFilters(parsed)).toBe(false);
    });

    it("returns true for project filter", () => {
      const parsed = QueryParser.parse("project:test");

      expect(QueryParser.hasFilters(parsed)).toBe(true);
    });

    it("returns true for role filter", () => {
      const parsed = QueryParser.parse("role:user");

      expect(QueryParser.hasFilters(parsed)).toBe(true);
    });
  });
});
