/**
 * Timestamp Normalization
 *
 * Normalizes various timestamp formats to ISO 8601 for consistent storage.
 */

/**
 * Normalize various timestamp formats to ISO 8601.
 *
 * Handles:
 * - Already ISO 8601 strings
 * - Unix timestamps (seconds or milliseconds)
 * - Date objects
 * - Other parseable date strings
 *
 * @param value The value to normalize (string, number, Date, or unknown)
 * @returns ISO 8601 formatted timestamp string
 */
export function normalizeTimestamp(value: unknown): string {
  // String input
  if (typeof value === "string") {
    // Already ISO 8601? Return as-is
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value;
    }
    // Try parsing as date string
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Number input - Unix timestamp
  if (typeof value === "number" && !isNaN(value)) {
    // Detect seconds vs milliseconds
    // Unix timestamps in seconds are < 1e12 (roughly year 2001 in ms)
    // Unix timestamps in ms are >= 1e12
    const ts = value > 1e12 ? value : value * 1000;
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  // Fallback to current time for invalid input
  return new Date().toISOString();
}
