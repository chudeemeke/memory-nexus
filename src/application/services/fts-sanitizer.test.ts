/**
 * FTS5 Query Sanitizer Tests
 *
 * Tests for sanitizeFtsQuery() which strips FTS5 operator characters
 * from user queries before passing to MATCH expressions.
 */

import { describe, it, expect } from "bun:test";
import { sanitizeFtsQuery } from "./fts-sanitizer.js";

describe("sanitizeFtsQuery", () => {
  describe("passthrough for clean queries", () => {
    it("should pass through simple words unchanged", () => {
      expect(sanitizeFtsQuery("authentication")).toBe("authentication");
    });

    it("should pass through multi-word queries unchanged", () => {
      expect(sanitizeFtsQuery("simple query words")).toBe("simple query words");
    });
  });

  describe("special character replacement", () => {
    it("should replace periods with spaces", () => {
      expect(sanitizeFtsQuery("Opus 4.6")).toBe("Opus 4 6");
    });

    it("should replace hyphens with spaces", () => {
      expect(sanitizeFtsQuery("SYNC-09")).toBe("SYNC 09");
    });

    it("should replace colons with spaces", () => {
      expect(sanitizeFtsQuery("key:value")).toBe("key value");
    });

    it("should replace parentheses with spaces", () => {
      expect(sanitizeFtsQuery("func()")).toBe("func");
    });

    it("should replace brackets with spaces", () => {
      expect(sanitizeFtsQuery("array[0]")).toBe("array 0");
    });

    it("should replace braces with spaces", () => {
      expect(sanitizeFtsQuery("interface{}")).toBe("interface");
    });

    it("should replace carets with spaces", () => {
      expect(sanitizeFtsQuery("^prefix")).toBe("prefix");
    });

    it("should preserve asterisks (FTS5 prefix search operator)", () => {
      // Asterisks are valid FTS5 prefix operators (e.g., auth*) and don't cause
      // syntax errors, so they are preserved to maintain prefix search functionality
      expect(sanitizeFtsQuery("wild*card")).toBe("wild*card");
      expect(sanitizeFtsQuery("auth*")).toBe("auth*");
    });

    it("should preserve balanced double quotes (FTS5 phrase search)", () => {
      // Balanced quotes are valid FTS5 phrase search syntax
      expect(sanitizeFtsQuery('"exact phrase"')).toBe('"exact phrase"');
    });

    it("should strip unmatched double quotes", () => {
      // Unmatched quotes cause FTS5 "unterminated string" errors
      expect(sanitizeFtsQuery('unmatched "quote')).toBe("unmatched quote");
    });

    it("should replace tildes with spaces", () => {
      expect(sanitizeFtsQuery("~approx")).toBe("approx");
    });

    it("should replace @ and / characters", () => {
      expect(sanitizeFtsQuery("@chude/memory")).toBe("chude memory");
    });
  });

  describe("space handling", () => {
    it("should collapse multiple consecutive spaces", () => {
      expect(sanitizeFtsQuery("a . . b")).toBe("a b");
    });

    it("should trim leading and trailing whitespace", () => {
      expect(sanitizeFtsQuery("  hello  ")).toBe("hello");
    });
  });

  describe("compound special characters", () => {
    it("should handle multiple special chars in one query", () => {
      expect(sanitizeFtsQuery("v2.0-beta (RC)")).toBe("v2 0 beta RC");
    });
  });

  describe("FTS5 keyword preservation", () => {
    it("should preserve AND keyword as a word token", () => {
      expect(sanitizeFtsQuery("auth AND security")).toBe("auth AND security");
    });

    it("should preserve OR keyword as a word token", () => {
      expect(sanitizeFtsQuery("auth OR security")).toBe("auth OR security");
    });

    it("should preserve NOT keyword as a word token", () => {
      expect(sanitizeFtsQuery("auth NOT deprecated")).toBe("auth NOT deprecated");
    });
  });

  describe("Unicode handling", () => {
    it("should preserve CJK characters unchanged", () => {
      expect(sanitizeFtsQuery("\u4f60\u597d\u4e16\u754c")).toBe("\u4f60\u597d\u4e16\u754c");
    });

    it("should preserve emoji characters", () => {
      expect(sanitizeFtsQuery("\u{1F680} rocket")).toBe("\u{1F680} rocket");
    });

    it("should preserve accented Latin characters", () => {
      expect(sanitizeFtsQuery("caf\u00e9 r\u00e9sum\u00e9")).toBe("caf\u00e9 r\u00e9sum\u00e9");
    });

    it("should preserve Cyrillic characters", () => {
      expect(sanitizeFtsQuery("\u041f\u0440\u0438\u0432\u0435\u0442")).toBe("\u041f\u0440\u0438\u0432\u0435\u0442");
    });

    it("should preserve mixed-script input", () => {
      expect(sanitizeFtsQuery("hello \u4e16\u754c \u{1F30D}")).toBe("hello \u4e16\u754c \u{1F30D}");
    });

    it("should strip FTS5 operators but preserve Unicode", () => {
      expect(sanitizeFtsQuery("caf\u00e9:latte (mocha)")).toBe("caf\u00e9 latte mocha");
    });

    it("should preserve all-emoji input without falling back to empty", () => {
      expect(sanitizeFtsQuery("\u{1F600}\u{1F601}\u{1F602}")).toBe("\u{1F600}\u{1F601}\u{1F602}");
    });

    it("should preserve balanced double-quoted Unicode phrase", () => {
      expect(sanitizeFtsQuery('"caf\u00e9 latte"')).toBe('"caf\u00e9 latte"');
    });

    it("should preserve Unicode and balanced quotes in fallback path", () => {
      // Input that produces empty after primary sanitization (all operator chars + Unicode)
      // The dot-colon-parens are stripped, but Unicode must survive in fallback
      expect(sanitizeFtsQuery('"\u4e16\u754c"')).toBe('"\u4e16\u754c"');
    });
  });

  describe("empty/edge cases", () => {
    it("should return empty string for all-dot input", () => {
      expect(sanitizeFtsQuery("...")).toBe("");
    });

    it("should return empty string for all-hyphen input", () => {
      expect(sanitizeFtsQuery("---")).toBe("");
    });

    it("should return empty string for empty input", () => {
      expect(sanitizeFtsQuery("")).toBe("");
    });

    it("should return empty string for whitespace-only input", () => {
      expect(sanitizeFtsQuery("   ")).toBe("");
    });
  });
});
