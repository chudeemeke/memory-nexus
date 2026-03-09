/**
 * AI Formatter Tests
 *
 * Tests for shared utility functions that strip ANSI codes,
 * estimate token counts, and produce clean text for AI consumption.
 */

import { describe, expect, test } from "bun:test";
import { stripAnsi, estimateTokens, formatForAi } from "./ai-formatter.js";

describe("stripAnsi()", () => {
    test("strips standard SGR codes", () => {
        expect(stripAnsi("\x1b[0;31mred text\x1b[0m")).toBe("red text");
        expect(stripAnsi("\x1b[1mbold\x1b[0m")).toBe("bold");
    });

    test("strips 256-color codes", () => {
        expect(stripAnsi("\x1b[38;5;42mcolored\x1b[0m")).toBe("colored");
    });

    test("strips RGB codes", () => {
        expect(stripAnsi("\x1b[38;2;255;0;0mrgb red\x1b[0m")).toBe("rgb red");
    });

    test("strips OSC sequences", () => {
        expect(stripAnsi("\x1b]0;window title\x07rest")).toBe("rest");
    });

    test("returns plain text unchanged", () => {
        expect(stripAnsi("plain text")).toBe("plain text");
    });

    test("handles empty string", () => {
        expect(stripAnsi("")).toBe("");
    });

    test("handles text with multiple mixed ANSI sequences", () => {
        const input = "\x1b[1m\x1b[31mBold Red\x1b[0m normal \x1b[38;5;42mgreen\x1b[0m";
        expect(stripAnsi(input)).toBe("Bold Red normal green");
    });

    test("preserves content between ANSI codes", () => {
        expect(stripAnsi("\x1b[31mhello\x1b[0m world \x1b[32mtest\x1b[0m")).toBe("hello world test");
    });

    test("strips cursor movement codes", () => {
        expect(stripAnsi("\x1b[2Jcleared\x1b[Hhome")).toBe("clearedhome");
    });
});

describe("estimateTokens()", () => {
    test("returns Math.ceil(text.length / 4) for default charsPerToken", () => {
        expect(estimateTokens("abcdefgh")).toBe(2); // 8 / 4 = 2
        expect(estimateTokens("abcdefghi")).toBe(3); // 9 / 4 = 2.25 -> 3
    });

    test("respects custom charsPerToken parameter", () => {
        expect(estimateTokens("abcdefgh", 2)).toBe(4); // 8 / 2 = 4
        expect(estimateTokens("abcdefghi", 3)).toBe(3); // 9 / 3 = 3
    });

    test("returns 0 for empty string", () => {
        expect(estimateTokens("")).toBe(0);
    });

    test("returns 1 for strings shorter than charsPerToken", () => {
        expect(estimateTokens("ab", 4)).toBe(1); // 2 / 4 = 0.5 -> 1
        expect(estimateTokens("a")).toBe(1); // 1 / 4 = 0.25 -> 1
    });
});

describe("formatForAi()", () => {
    test("strips ANSI codes and normalizes whitespace", () => {
        const input = "\x1b[31mhello\x1b[0m\n\n\nworld\n\n\n\nend";
        expect(formatForAi(input)).toBe("hello\n\nworld\n\nend");
    });

    test("trims leading and trailing whitespace", () => {
        expect(formatForAi("  hello  ")).toBe("hello");
        expect(formatForAi("\n\nhello\n\n")).toBe("hello");
    });

    test("combines stripAnsi + whitespace normalization", () => {
        const input = "\x1b[1mTitle\x1b[0m\n\n\n\n\x1b[32mContent\x1b[0m\n\n\nEnd";
        expect(formatForAi(input)).toBe("Title\n\nContent\n\nEnd");
    });
});
