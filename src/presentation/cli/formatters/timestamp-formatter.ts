/**
 * Timestamp Formatter
 *
 * Formats timestamps with both relative and absolute components.
 * Uses Intl.RelativeTimeFormat for localized relative time display.
 */

// Intl.RelativeTimeFormat with numeric: "auto" for "yesterday" instead of "1 day ago"
const rtf = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "long",
});

// Time unit constants in milliseconds
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * Format a date as relative time (e.g., "2 days ago", "yesterday").
 *
 * Automatically selects the appropriate unit:
 * - < 1 hour: minutes
 * - < 1 day: hours
 * - < 1 week: days
 * - < 1 month: weeks
 * - >= 1 month: months
 *
 * @param date Date to format
 * @param reference Reference date (defaults to now)
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date, reference?: Date): string {
  const ref = reference ?? new Date();
  const diffMs = date.getTime() - ref.getTime();
  const absDiffMs = Math.abs(diffMs);

  // Select appropriate unit based on time difference
  if (absDiffMs < HOUR) {
    const minutes = Math.round(diffMs / MINUTE);
    return rtf.format(minutes, "minute");
  }

  if (absDiffMs < DAY) {
    const hours = Math.round(diffMs / HOUR);
    return rtf.format(hours, "hour");
  }

  if (absDiffMs < WEEK) {
    const days = Math.round(diffMs / DAY);
    return rtf.format(days, "day");
  }

  if (absDiffMs < MONTH) {
    const weeks = Math.round(diffMs / WEEK);
    return rtf.format(weeks, "week");
  }

  const months = Math.round(diffMs / MONTH);
  return rtf.format(months, "month");
}

/**
 * Format a date as absolute time (YYYY-MM-DD HH:mm).
 *
 * @param date Date to format
 * @returns Absolute time string
 */
export function formatAbsoluteTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Format a timestamp with both relative and absolute components.
 *
 * Output format: "2 days ago (2026-01-27 14:30)"
 *
 * @param date Date to format
 * @param reference Reference date for relative calculation (defaults to now)
 * @returns Combined timestamp string
 */
export function formatTimestamp(date: Date, reference?: Date): string {
  const relative = formatRelativeTime(date, reference);
  const absolute = formatAbsoluteTime(date);

  return `${relative} (${absolute})`;
}
