/**
 * Date Parser
 *
 * Wrapper around chrono-node for natural language date parsing.
 * Validates that parsed dates are not in the future (for search filters).
 */

import * as chrono from "chrono-node";

/**
 * Error thrown when date parsing fails.
 */
export class DateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateParseError";
  }
}

/**
 * Parse a natural language date string into a Date object.
 *
 * Supports formats like:
 * - "yesterday"
 * - "2 weeks ago"
 * - "last Friday"
 * - "2026-01-15"
 * - "today"
 *
 * @param input Date string to parse
 * @param referenceDate Reference date for relative calculations (defaults to now)
 * @returns Parsed Date object
 * @throws DateParseError if input cannot be parsed or is in the future
 */
export function parseDate(input: string, referenceDate?: Date): Date {
  // Handle empty input
  if (!input || input.trim() === "") {
    throw new DateParseError(
      `Invalid date format: ''. Examples: 'yesterday', '2 weeks ago', '2026-01-15'`
    );
  }

  const reference = referenceDate ?? new Date();

  // Parse with chrono-node
  const result = chrono.parseDate(input, reference);

  // Check if parsing failed
  if (!result) {
    throw new DateParseError(
      `Invalid date format: '${input}'. Examples: 'yesterday', '2 weeks ago', '2026-01-15'`
    );
  }

  // Validate not in future (allow same day)
  // Compare dates only, not times, to allow "today"
  const resultDay = new Date(result.getFullYear(), result.getMonth(), result.getDate());
  const referenceDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (resultDay > referenceDay) {
    throw new DateParseError(
      `Future dates not allowed: '${input}'. Examples: 'yesterday', '2 weeks ago', '2026-01-15'`
    );
  }

  return result;
}
