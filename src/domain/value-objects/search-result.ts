/**
 * SearchResult Value Object
 *
 * Represents a single search result from a full-text search query.
 * Contains the matched message reference, relevance score, and snippet.
 *
 * Value object properties:
 * - Immutable after construction
 * - Equality based on sessionId and messageId (identity of the match)
 * - Validates on construction (rejects invalid scores, empty IDs)
 */

interface SearchResultParams {
  sessionId: string;
  messageId: string;
  snippet: string;
  score: number;
  timestamp: Date;
}

export class SearchResult {
  private readonly _sessionId: string;
  private readonly _messageId: string;
  private readonly _snippet: string;
  private readonly _score: number;
  private readonly _timestamp: Date;

  private constructor(params: SearchResultParams) {
    this._sessionId = params.sessionId;
    this._messageId = params.messageId;
    this._snippet = params.snippet;
    this._score = params.score;
    // Copy the date to ensure immutability
    this._timestamp = new Date(params.timestamp.getTime());
  }

  /**
   * Create SearchResult from parameters.
   * @throws Error if any required field is empty or score is out of range
   */
  static create(params: SearchResultParams): SearchResult {
    if (!params.sessionId || params.sessionId.trim() === "") {
      throw new Error("Session ID cannot be empty");
    }
    if (!params.messageId || params.messageId.trim() === "") {
      throw new Error("Message ID cannot be empty");
    }
    if (!params.snippet || params.snippet.trim() === "") {
      throw new Error("Snippet cannot be empty");
    }
    if (params.score < 0 || params.score > 1) {
      throw new Error("Score must be between 0 and 1");
    }
    return new SearchResult(params);
  }

  /**
   * The session ID containing this result.
   */
  get sessionId(): string {
    return this._sessionId;
  }

  /**
   * The message ID within the session.
   */
  get messageId(): string {
    return this._messageId;
  }

  /**
   * The text snippet containing the match.
   */
  get snippet(): string {
    return this._snippet;
  }

  /**
   * The relevance score (0-1, higher is more relevant).
   */
  get score(): number {
    return this._score;
  }

  /**
   * The timestamp of the matched message.
   */
  get timestamp(): Date {
    // Return a copy to maintain immutability
    return new Date(this._timestamp.getTime());
  }

  /**
   * Check equality with another SearchResult.
   * Two results are equal if they reference the same message.
   */
  equals(other: SearchResult): boolean {
    return this._sessionId === other._sessionId && this._messageId === other._messageId;
  }

  /**
   * Compare by score for sorting (descending order - higher scores first).
   * Returns negative if this result should come before other.
   */
  compareByScore(other: SearchResult): number {
    return other._score - this._score;
  }
}
