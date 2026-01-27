/**
 * SearchQuery Value Object
 *
 * Represents a validated search query for full-text search operations.
 *
 * Value object properties:
 * - Immutable after construction
 * - Equality based on query value
 * - Validates on construction (rejects empty queries)
 * - Trims whitespace but preserves case and special characters
 */
export class SearchQuery {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  /**
   * Create SearchQuery from a query string.
   * @param query The search query string
   * @throws Error if query is empty or whitespace-only
   */
  static from(query: string): SearchQuery {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw new Error("Query cannot be empty");
    }
    return new SearchQuery(trimmed);
  }

  /**
   * The search query value.
   */
  get value(): string {
    return this._value;
  }

  /**
   * Check equality with another SearchQuery.
   * Comparison is case-sensitive.
   */
  equals(other: SearchQuery): boolean {
    return this._value === other._value;
  }
}
