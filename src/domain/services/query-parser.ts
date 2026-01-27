/**
 * QueryParser Domain Service
 *
 * Parses search query strings into structured query objects.
 * Supports terms, quoted phrases, and filter syntax.
 *
 * Service properties:
 * - Stateless operations
 * - Pure functions (no side effects)
 * - Domain logic only (no infrastructure concerns)
 */

export interface ParsedQuery {
  terms: string[];
  filters: QueryFilters;
  originalQuery: string;
}

export interface QueryFilters {
  project?: string;
  role?: string;
  tool?: string;
}

const FILTER_PATTERN = /^(project|role|tool):(.+)$/i;
const QUOTED_PHRASE_PATTERN = /"([^"]+)"/g;
const MIN_TERM_LENGTH = 2;

export class QueryParser {
  /**
   * Parse a search query string into structured components.
   * @param query The raw search query
   * @returns Parsed query with terms and filters
   */
  static parse(query: string): ParsedQuery {
    const originalQuery = query;
    const filters: QueryFilters = {};
    const terms: string[] = [];

    // Extract quoted phrases first
    const phrases: string[] = [];
    let queryWithoutPhrases = query.replace(
      QUOTED_PHRASE_PATTERN,
      (_, phrase) => {
        phrases.push(phrase.toLowerCase());
        return "";
      }
    );

    // Split remaining query into tokens
    const tokens = queryWithoutPhrases.trim().split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const filterMatch = token.match(FILTER_PATTERN);
      if (filterMatch && filterMatch[1] && filterMatch[2]) {
        const key = filterMatch[1];
        const value = filterMatch[2];
        const filterKey = key.toLowerCase() as keyof QueryFilters;
        filters[filterKey] = value.toLowerCase();
      } else {
        // Strip stray quote characters from unclosed quotes
        const term = token.toLowerCase().replace(/"/g, "");
        if (term.length >= MIN_TERM_LENGTH && !terms.includes(term)) {
          terms.push(term);
        }
      }
    }

    // Add phrases as terms (they're already unique from the extraction)
    for (const phrase of phrases) {
      if (!terms.includes(phrase)) {
        terms.push(phrase);
      }
    }

    return { terms, filters, originalQuery };
  }

  /**
   * Convert a parsed query to FTS5 query syntax.
   * @param parsed The parsed query
   * @returns FTS5-compatible query string
   */
  static toFts5Query(parsed: ParsedQuery): string {
    if (parsed.terms.length === 0) {
      return "";
    }

    const ftsTerms = parsed.terms.map((term) => {
      // Phrases with spaces need to be quoted
      if (term.includes(" ")) {
        return `"${term}"`;
      }
      return term;
    });

    return ftsTerms.join(" AND ");
  }

  /**
   * Check if a parsed query is effectively empty.
   * @param parsed The parsed query
   * @returns true if no terms and no filters
   */
  static isEmpty(parsed: ParsedQuery): boolean {
    return parsed.terms.length === 0 && !QueryParser.hasFilters(parsed);
  }

  /**
   * Check if a parsed query has any filters.
   * @param parsed The parsed query
   * @returns true if any filters are present
   */
  static hasFilters(parsed: ParsedQuery): boolean {
    return Object.keys(parsed.filters).length > 0;
  }
}
