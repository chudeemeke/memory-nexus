/**
 * Service Port Interfaces
 *
 * Defines contracts for domain services that may have infrastructure
 * dependencies. These interfaces allow the domain to define what
 * services it needs without knowing the implementation details.
 */

import type { SearchQuery } from "../value-objects/search-query.js";
import type { SearchResult } from "../value-objects/search-result.js";
import type { ProjectPath } from "../value-objects/project-path.js";
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

  /** Filter results to a specific project */
  projectFilter?: ProjectPath;

  /** Filter by message role (user or assistant). Can be single role or array of roles. */
  roleFilter?: MessageRole | MessageRole[];

  /** Only include results after this date */
  sinceDate?: Date;

  /** Only include results before this date */
  beforeDate?: Date;

  /** Filter results to a specific session ID */
  sessionFilter?: string;
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
