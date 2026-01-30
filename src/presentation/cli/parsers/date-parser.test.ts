/**
 * Date Parser Tests
 *
 * TDD tests for chrono-node wrapper with validation.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { parseDate, DateParseError } from "./date-parser.js";

describe("DateParser", () => {
  // Use a fixed reference date for deterministic tests
  const referenceDate = new Date("2026-01-29T12:00:00Z");

  describe("parseDate", () => {
    describe("natural language dates", () => {
      it("parses 'yesterday' correctly", () => {
        const result = parseDate("yesterday", referenceDate);

        // Should be January 28, 2026
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0); // January
        expect(result.getDate()).toBe(28);
      });

      it("parses '2 weeks ago' correctly", () => {
        const result = parseDate("2 weeks ago", referenceDate);

        // Should be January 15, 2026 (14 days before Jan 29)
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
      });

      it("parses 'last Friday' correctly", () => {
        // Jan 29, 2026 is a Thursday. chrono-node returns Jan 23 for "last Friday"
        // (the Friday of the previous week, not the most recent Friday)
        const result = parseDate("last Friday", referenceDate);

        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(23);
      });

      it("parses '3 days ago' correctly", () => {
        const result = parseDate("3 days ago", referenceDate);

        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(26);
      });
    });

    describe("ISO dates", () => {
      it("parses ISO date '2026-01-15' correctly", () => {
        const result = parseDate("2026-01-15", referenceDate);

        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
      });

      it("parses ISO date with time '2026-01-15 14:30' correctly", () => {
        const result = parseDate("2026-01-15 14:30", referenceDate);

        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
        expect(result.getHours()).toBe(14);
        expect(result.getMinutes()).toBe(30);
      });
    });

    describe("error handling", () => {
      it("throws DateParseError for empty string", () => {
        expect(() => parseDate("", referenceDate)).toThrow(DateParseError);
      });

      it("throws DateParseError for unparseable input", () => {
        expect(() => parseDate("invalid garbage", referenceDate)).toThrow(DateParseError);
      });

      it("throws DateParseError for future dates", () => {
        expect(() => parseDate("tomorrow", referenceDate)).toThrow(DateParseError);
        expect(() => parseDate("next week", referenceDate)).toThrow(DateParseError);
      });

      it("includes examples in error message", () => {
        try {
          parseDate("not a date", referenceDate);
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(DateParseError);
          expect((error as DateParseError).message).toContain("yesterday");
          expect((error as DateParseError).message).toContain("2 weeks ago");
        }
      });

      it("includes original input in error message", () => {
        try {
          parseDate("xyzzy", referenceDate);
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(DateParseError);
          expect((error as DateParseError).message).toContain("xyzzy");
        }
      });
    });

    describe("edge cases", () => {
      it("allows today (not strictly in the past)", () => {
        // "today" should be allowed since it's not in the future
        const result = parseDate("today", referenceDate);
        expect(result.getDate()).toBe(29);
      });

      it("uses current date as reference when not provided", () => {
        // This test uses real current time, so just check it doesn't throw
        const result = parseDate("yesterday");
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).toBeLessThan(Date.now());
      });
    });
  });

  describe("DateParseError", () => {
    it("is an instance of Error", () => {
      const error = new DateParseError("test");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("DateParseError");
    });

    it("has the correct message", () => {
      const error = new DateParseError("test message");
      expect(error.message).toBe("test message");
    });
  });
});
