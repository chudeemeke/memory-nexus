/**
 * FTS5 Query Sanitizer
 *
 * Strips characters that FTS5 treats as syntax operators from user queries
 * before passing to MATCH. The porter unicode61 tokenizer strips these during
 * indexing, so queries need the same treatment for consistent matching.
 *
 * Preserves:
 * - FTS5 keyword operators (AND, OR, NOT, NEAR) -- uppercase words, not special chars
 * - Asterisks (*) -- valid FTS5 prefix search operator (e.g., auth*)
 * - Balanced double quotes ("phrase") -- valid FTS5 phrase search syntax
 */

/**
 * Sanitize a user query for safe use in FTS5 MATCH expressions.
 *
 * Replaces FTS5 operator characters with spaces and collapses whitespace.
 * Preserves asterisks for prefix search and balanced double quotes for phrase search.
 * Strips unmatched quotes to prevent "unterminated string" FTS5 errors.
 * If the result is empty after sanitization, falls back to extracting
 * alphanumeric parts from the original query.
 *
 * @param query Raw user query string
 * @returns Sanitized query safe for FTS5 MATCH
 */
export function sanitizeFtsQuery(query: string): string {
  // Count double quotes to detect balanced pairs
  const quoteCount = (query.match(/"/g) || []).length;
  const hasBalancedQuotes = quoteCount > 0 && quoteCount % 2 === 0;

  let sanitized: string;
  if (hasBalancedQuotes) {
    // Preserve balanced quotes (phrase search syntax)
    // Strip other operator chars but keep " intact
    sanitized = query
      .replace(/[.:\-()[\]{}^~@/\\]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    // Strip all operator chars including unmatched quotes
    sanitized = query
      .replace(/[.:\-()[\]{}^"~@/\\]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (sanitized) return sanitized;

  // Fallback: strip FTS5 operators but preserve everything else (Unicode, symbols)
  // Uses blacklist approach -- safer than whitelist for preserving user intent
  const quoteCountFallback = (query.match(/"/g) || []).length;
  const hasBalancedQuotesFallback = quoteCountFallback > 0 && quoteCountFallback % 2 === 0;
  const operatorPattern = hasBalancedQuotesFallback
    ? /[.:\-()[\]{}^~@/\\]/gu
    : /[.:\-()[\]{}^"~@/\\]/gu;
  return query
    .replace(operatorPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}
