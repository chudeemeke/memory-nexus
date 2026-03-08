/**
 * FTS5 Query Sanitizer
 *
 * Strips characters that FTS5 treats as syntax operators from user queries
 * before passing to MATCH. The porter unicode61 tokenizer strips these during
 * indexing, so queries need the same treatment for consistent matching.
 *
 * Preserves FTS5 keyword operators (AND, OR, NOT, NEAR) since they are
 * uppercase words, not special characters.
 */

/**
 * Sanitize a user query for safe use in FTS5 MATCH expressions.
 *
 * Replaces FTS5 operator characters with spaces and collapses whitespace.
 * If the result is empty after sanitization, falls back to extracting
 * alphanumeric parts from the original query.
 *
 * @param query Raw user query string
 * @returns Sanitized query safe for FTS5 MATCH
 */
export function sanitizeFtsQuery(query: string): string {
  const sanitized = query
    .replace(/[.:\-()[\]{}^*"~@/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized) return sanitized;

  // Fallback: extract alphanumeric parts
  return query
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
