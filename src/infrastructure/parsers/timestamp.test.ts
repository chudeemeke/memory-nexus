/**
 * Timestamp Normalization Tests
 *
 * Tests for timestamp normalization to ISO 8601 format.
 */

import { describe, test, expect } from "bun:test";
import { normalizeTimestamp } from "./timestamp.js";

describe("normalizeTimestamp", () => {
  describe("ISO 8601 strings", () => {
    test("preserves valid ISO 8601 string with timezone", () => {
      const iso = "2026-01-28T10:00:00.000Z";
      expect(normalizeTimestamp(iso)).toBe(iso);
    });

    test("preserves valid ISO 8601 string without milliseconds", () => {
      const iso = "2026-01-28T10:00:00Z";
      expect(normalizeTimestamp(iso)).toBe(iso);
    });

    test("preserves ISO 8601 string with offset timezone", () => {
      const iso = "2026-01-28T10:00:00+05:30";
      expect(normalizeTimestamp(iso)).toBe(iso);
    });

    test("preserves ISO 8601 string without Z suffix", () => {
      const iso = "2026-01-28T10:00:00";
      expect(normalizeTimestamp(iso)).toBe(iso);
    });
  });

  describe("Unix timestamps (seconds)", () => {
    test("converts Unix timestamp in seconds", () => {
      // 2026-01-28T00:00:00.000Z in seconds
      const timestamp = 1769558400;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("2026-01-28T00:00:00.000Z");
    });

    test("converts Unix timestamp near epoch", () => {
      const timestamp = 0;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("1970-01-01T00:00:00.000Z");
    });

    test("converts Unix timestamp from recent past", () => {
      // 2024-01-01T00:00:00.000Z in seconds
      const timestamp = 1704067200;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("Unix timestamps (milliseconds)", () => {
    test("converts Unix timestamp in milliseconds", () => {
      // 2026-01-28T00:00:00.000Z in milliseconds
      const timestamp = 1769558400000;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("2026-01-28T00:00:00.000Z");
    });

    test("converts Unix timestamp with millisecond precision", () => {
      // 2026-01-28T10:30:45.123Z in milliseconds
      const timestamp = 1769596245123;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("2026-01-28T10:30:45.123Z");
    });

    test("converts current-era timestamp in milliseconds", () => {
      // 2024-06-15T12:30:00.500Z in milliseconds
      const timestamp = 1718454600500;
      const result = normalizeTimestamp(timestamp);
      expect(result).toBe("2024-06-15T12:30:00.500Z");
    });
  });

  describe("Date objects", () => {
    test("converts Date object to ISO string", () => {
      const date = new Date("2026-01-28T10:00:00.000Z");
      const result = normalizeTimestamp(date);
      expect(result).toBe("2026-01-28T10:00:00.000Z");
    });

    test("converts Date object from timestamp", () => {
      const date = new Date(1769558400000);
      const result = normalizeTimestamp(date);
      expect(result).toBe("2026-01-28T00:00:00.000Z");
    });
  });

  describe("other date string formats", () => {
    test("parses date string without time", () => {
      const result = normalizeTimestamp("2026-01-28");
      // Date parsing may vary by environment, just check it's valid ISO
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("parses human-readable date string", () => {
      const result = normalizeTimestamp("January 28, 2026");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("parses RFC 2822 date string", () => {
      const result = normalizeTimestamp("Wed, 28 Jan 2026 10:00:00 GMT");
      expect(result).toBe("2026-01-28T10:00:00.000Z");
    });
  });

  describe("invalid input", () => {
    test("returns current time for null", () => {
      const before = new Date();
      const result = normalizeTimestamp(null);
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for undefined", () => {
      const before = new Date();
      const result = normalizeTimestamp(undefined);
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for empty string", () => {
      const before = new Date();
      const result = normalizeTimestamp("");
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for invalid string", () => {
      const before = new Date();
      const result = normalizeTimestamp("not a date at all");
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for object", () => {
      const before = new Date();
      const result = normalizeTimestamp({ key: "value" });
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for array", () => {
      const before = new Date();
      const result = normalizeTimestamp([1, 2, 3]);
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("returns current time for boolean", () => {
      const before = new Date();
      const result = normalizeTimestamp(true);
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("edge cases", () => {
    test("handles boundary between seconds and milliseconds", () => {
      // 1e12 milliseconds = Sept 9, 2001
      // Value just above threshold should be treated as milliseconds
      const result = normalizeTimestamp(1000000000001);
      expect(result).toBe("2001-09-09T01:46:40.001Z");
    });

    test("handles value at threshold as seconds", () => {
      // Value at exactly 1e12 is NOT > 1e12, so treated as seconds
      // This represents a far future date (year 33658)
      const result = normalizeTimestamp(1000000000000);
      // 1e12 seconds * 1000 = 1e15 milliseconds
      const expected = new Date(1000000000000 * 1000).toISOString();
      expect(result).toBe(expected);
    });

    test("handles value just below threshold", () => {
      // Value below 1e12 should be treated as seconds
      const result = normalizeTimestamp(999999999999);
      // This is in seconds, so multiply by 1000
      const expected = new Date(999999999999 * 1000).toISOString();
      expect(result).toBe(expected);
    });

    test("handles negative timestamps", () => {
      // Negative timestamp (before epoch)
      const result = normalizeTimestamp(-86400);
      // Should be one day before epoch (treated as seconds)
      expect(result).toBe("1969-12-31T00:00:00.000Z");
    });

    test("handles NaN number", () => {
      const result = normalizeTimestamp(NaN);
      // NaN creates Invalid Date, should fall through to current time
      // Actually, NaN * 1000 = NaN, new Date(NaN) = Invalid Date
      // But since NaN is a number type, it goes through the number path
      // and creates an invalid date. Let's check it handles gracefully.
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
