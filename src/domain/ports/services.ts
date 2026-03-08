/**
 * Service Port Interfaces
 *
 * Defines contracts for domain services that may have infrastructure
 * dependencies. These interfaces allow the domain to define what
 * services it needs without knowing the implementation details.
 */

import type { SearchQuery } from "../value-objects/search-query.js";
import type { SearchResult } from "../value-objects/search-result.js";
import type { MessageRole } from "../entities/message.js";

/**
 * Options for filtering and limiting search results.
 *
 * All properties are optional. When not specified:
 * - limit defaults to implementation-specific value
 * - filters are not applied
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;

  /** Filter results to a specific project name (case-insensitive substring match) */
  projectFilter?: string;

  /** Filter by message role (user or assistant). Can be single role or array of roles. */
  roleFilter?: MessageRole | MessageRole[];

  /** Only include results after this date */
  sinceDate?: Date;

  /** Only include results before this date */
  beforeDate?: Date;

  /** Filter results to a specific session ID */
  sessionFilter?: string;
}

/** Search mode for hybrid search */
export type SearchMode = "auto" | "fts" | "vector" | "hybrid";

/**
 * Extended search options with hybrid mode support.
 */
export interface HybridSearchOptions extends SearchOptions {
  /** Search mode selection. Default: 'auto' */
  mode?: SearchMode;
  /** Disable temporal decay scoring for this search */
  noDecay?: boolean;
}

/**
 * Service for full-text search across session content.
 *
 * Implementations use FTS5 for efficient text matching.
 * Results are ranked by relevance score.
 */
export interface ISearchService {
  /**
   * Search for content matching the query.
   *
   * Uses full-text search with ranking. Results are ordered by
   * relevance score (highest first).
   *
   * @param query The search query (validated)
   * @param options Optional search filters and limits
   * @returns Array of search results, ranked by relevance
   */
  search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Per-project statistics.
 */
export interface ProjectStats {
  projectName: string;
  sessionCount: number;
  messageCount: number;
}

/**
 * Database statistics result.
 */
export interface StatsResult {
  totalSessions: number;
  totalMessages: number;
  totalToolUses: number;
  databaseSizeBytes: number;
  projectBreakdown: ProjectStats[];
}

/**
 * Service for database statistics queries.
 */
export interface IStatsService {
  /**
   * Get database-wide statistics with per-project breakdown.
   *
   * @param projectLimit Maximum projects to include in breakdown (default 10)
   * @returns Statistics including totals and per-project breakdown
   */
  getStats(projectLimit?: number): Promise<StatsResult>;
}

/**
 * Port for generating structured summaries from session content.
 *
 * Implementations invoke an LLM (e.g., claude -p) to produce
 * a daily log entry from raw session messages.
 */
export interface ISummaryGenerator {
  /**
   * Generate a structured daily log summary from session content.
   *
   * @param content Extracted session content (user messages + assistant text)
   * @param sessionId Session identifier for the summary header
   * @param projectName Project name for context
   * @param startTime Session start time (ISO string)
   * @param endTime Session end time (ISO string)
   * @returns Formatted markdown summary in daily log format
   */
  generateSummary(
    content: string,
    sessionId: string,
    projectName: string,
    startTime: string,
    endTime: string,
  ): Promise<string>;
}
