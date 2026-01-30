/**
 * Timestamp Formatter Tests
 *
 * TDD tests for relative + absolute timestamp formatting.
 */

import { describe, it, expect } from "bun:test";
import {
  formatTimestamp,
  formatRelativeTime,
  formatAbsoluteTime,
} from "./timestamp-formatter.js";

describe("TimestampFormatter", () => {
  // Fixed reference date: 2026-01-29 14:30:00
  const referenceDate = new Date("2026-01-29T14:30:00");

  describe("formatRelativeTime", () => {
    it("returns 'this minute' for very recent times", () => {
      const date = new Date(referenceDate.getTime() - 30 * 1000); // 30 seconds ago
      const result = formatRelativeTime(date, referenceDate);

      // Intl.RelativeTimeFormat with numeric: "auto" returns "this minute" for 0
      expect(result).toMatch(/this minute|1 minute ago/);
    });

    it("returns 'N minutes ago' for times within an hour", () => {
      const date = new Date(referenceDate.getTime() - 15 * 60 * 1000); // 15 minutes ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("15 minutes ago");
    });

    it("returns 'N hours ago' for times within a day", () => {
      const date = new Date(referenceDate.getTime() - 5 * 60 * 60 * 1000); // 5 hours ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("5 hours ago");
    });

    it("returns 'yesterday' for one day ago", () => {
      const date = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("yesterday");
    });

    it("returns 'N days ago' for times within a week", () => {
      const date = new Date(referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("2 days ago");
    });

    it("returns 'last week' for one week ago", () => {
      const date = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("last week");
    });

    it("returns 'N weeks ago' for times within a month", () => {
      const date = new Date(referenceDate.getTime() - 3 * 7 * 24 * 60 * 60 * 1000); // 3 weeks ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("3 weeks ago");
    });

    it("returns 'last month' for one month ago", () => {
      const date = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000); // ~1 month ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("last month");
    });

    it("returns 'N months ago' for older times", () => {
      const date = new Date(referenceDate.getTime() - 90 * 24 * 60 * 60 * 1000); // ~3 months ago
      const result = formatRelativeTime(date, referenceDate);

      expect(result).toBe("3 months ago");
    });

    it("uses current time when reference not provided", () => {
      const date = new Date(Date.now() - 60 * 1000); // 1 minute ago
      const result = formatRelativeTime(date);

      expect(result).toMatch(/minute|just now/);
    });
  });

  describe("formatAbsoluteTime", () => {
    it("formats date as YYYY-MM-DD HH:mm", () => {
      const date = new Date("2026-01-27T14:30:00");
      const result = formatAbsoluteTime(date);

      expect(result).toBe("2026-01-27 14:30");
    });

    it("pads single-digit months and days", () => {
      const date = new Date("2026-03-05T09:05:00");
      const result = formatAbsoluteTime(date);

      expect(result).toBe("2026-03-05 09:05");
    });

    it("handles midnight correctly", () => {
      const date = new Date("2026-01-15T00:00:00");
      const result = formatAbsoluteTime(date);

      expect(result).toBe("2026-01-15 00:00");
    });
  });

  describe("formatTimestamp", () => {
    it("combines relative and absolute formats", () => {
      const date = new Date(referenceDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const result = formatTimestamp(date, referenceDate);

      // Should be "2 days ago (2026-01-27 14:30)"
      expect(result).toContain("2 days ago");
      expect(result).toContain("2026-01-27 14:30");
      expect(result).toMatch(/^.+ \(.+\)$/);
    });

    it("uses current time when reference not provided", () => {
      const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
      const result = formatTimestamp(date);

      expect(result).toContain("hours ago");
      expect(result).toMatch(/\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)/);
    });

    it("formats yesterday correctly", () => {
      const date = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
      const result = formatTimestamp(date, referenceDate);

      expect(result).toContain("yesterday");
    });
  });
});
