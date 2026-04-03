/**
 * Text Width Utility Tests
 *
 * Tests for width-aware string measurement, truncation, and padding.
 * Covers CJK double-width characters, emoji, ANSI escape codes, and plain ASCII.
 */

import { describe, it, expect } from "bun:test";
import {
  measureWidth,
  truncateToWidth,
  padToWidth,
  getTerminalWidth,
} from "./text-width.js";

describe("measureWidth", () => {
  it("should return 5 for plain ASCII 'hello'", () => {
    expect(measureWidth("hello")).toBe(5);
  });

  it("should return 4 for two CJK characters (double-width each)", () => {
    // \u4f60\u597d = "nihao" in Chinese, each char is double-width
    expect(measureWidth("\u4f60\u597d")).toBe(4);
  });

  it("should return 2 for a single emoji (double-width)", () => {
    expect(measureWidth("\ud83d\ude80")).toBe(2);
  });

  it("should return 5 for ANSI-wrapped 'hello' (escapes have zero width)", () => {
    expect(measureWidth("\x1b[1mhello\x1b[0m")).toBe(5);
  });

  it("should return 0 for empty string", () => {
    expect(measureWidth("")).toBe(0);
  });
});

describe("truncateToWidth", () => {
  it("should truncate 'hello world' at width 8 with ellipsis", () => {
    expect(truncateToWidth("hello world", 8)).toBe("hello...");
  });

  it("should return short string unchanged when it fits", () => {
    expect(truncateToWidth("short", 10)).toBe("short");
  });

  it("should truncate CJK string at correct visual width", () => {
    // 5 CJK chars = 10 display width. Truncate to 7: fits 2 CJK (4 width) + "..."(3) = 7
    const cjk = "\u4f60\u597d\u4e16\u754c\u5417";
    const result = truncateToWidth(cjk, 7);
    expect(measureWidth(result)).toBeLessThanOrEqual(7);
    expect(result).toContain("...");
  });

  it("should return 'ab' unchanged when exact fit (width 2)", () => {
    expect(truncateToWidth("ab", 2)).toBe("ab");
  });

  it("should return '..' when text wider than limit and limit is very small", () => {
    expect(truncateToWidth("abc", 2)).toBe("..");
  });

  it("should return '.' for maxWidth 1 when text needs truncation", () => {
    expect(truncateToWidth("abc", 1)).toBe(".");
  });

  it("should return empty string for maxWidth 0", () => {
    expect(truncateToWidth("abc", 0)).toBe("");
  });
});

describe("padToWidth", () => {
  it("should pad 'hi' to width 10 with 8 trailing spaces", () => {
    const result = padToWidth("hi", 10);
    expect(result).toBe("hi        ");
    expect(measureWidth(result)).toBe(10);
  });

  it("should pad CJK char correctly (double-width counted)", () => {
    // \u4f60 has display width 2, so pad to 10 needs 8 spaces
    const result = padToWidth("\u4f60", 10);
    expect(result).toBe("\u4f60        ");
    expect(measureWidth(result)).toBe(10);
  });

  it("should return string unchanged when already at target width", () => {
    const result = padToWidth("hello", 5);
    expect(result).toBe("hello");
  });

  it("should return string unchanged when beyond target width", () => {
    const result = padToWidth("hello world", 5);
    expect(result).toBe("hello world");
  });
});

describe("getTerminalWidth", () => {
  it("should return process.stdout.columns or 80 as fallback", () => {
    const width = getTerminalWidth();
    if (process.stdout.columns) {
      expect(width).toBe(process.stdout.columns);
    } else {
      expect(width).toBe(80);
    }
  });
});
