/**
 * FTS5 Search Service Implementation
 *
 * Implements ISearchService using SQLite FTS5 full-text search.
 * Uses BM25 ranking algorithm for relevance scoring and snippet extraction.
 */

import type { Database, Statement } from "bun:sqlite";
import type { ISearchService, SearchOptions } from "../../../domain/ports/services.js";
import type { SearchQuery } from "../../../domain/value-objects/search-query.js";
import { SearchResult } from "../../../domain/value-objects/search-result.js";

/**
 * Raw search result row from database
 */
interface SearchRow {
  id: string;
  session_id: string;
  content: string;
  timestamp: string;
  score: number;
  snippet: string;
}

/**
 * FTS5-based implementation of ISearchService
 *
 * Features:
 * - Full-text search using FTS5 MATCH operator
 * - BM25 relevance ranking normalized to 0-1 range
 * - Snippet extraction with match highlighting
 * - Filtering by project, role, and date range
 *
 * CRITICAL: Always uses MATCH operator for FTS5 queries (never =).
 * Using = would cause a full table scan defeating the purpose of FTS5.
 */
export class Fts5SearchService implements ISearchService {
  private readonly db: Database;
  private readonly baseSearchStmt: Statement<SearchRow, [string, number]>;

  /**
   * Create a new Fts5SearchService
   *
   * @param db - Initialized SQLite database with FTS5 schema applied
   */
  constructor(db: Database) {
    this.db = db;

    // Base search query - additional filters applied dynamically
    // Uses MATCH for FTS5 query (never =)
    // ORDER BY score ASC because BM25 returns negative values (more negative = better)
    this.baseSearchStmt = db.prepare<SearchRow, [string, number]>(`
      SELECT
        m.id,
        m.session_id,
        m.content,
        m.timestamp,
        bm25(messages_fts) as score,
        snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      FROM messages_fts f
      JOIN messages_meta m ON f.rowid = m.rowid
      WHERE messages_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `);
  }

  /**
   * Search for content matching the query.
   *
   * Uses FTS5 MATCH operator with BM25 ranking. Results are normalized
   * to 0-1 score range (higher = more relevant) and mapped to SearchResult
   * value objects.
   *
   * @param query - Validated search query
   * @param options - Optional filters and limits
   * @returns Array of search results, ranked by relevance
   */
  async search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? 20;
    const queryValue = query.value;

    // Build dynamic query based on filters
    const { sql, params } = this.buildSearchQuery(queryValue, limit, options);

    // Execute query
    const stmt = this.db.prepare<SearchRow, unknown[]>(sql);
    const rows = stmt.all(...params);

    if (rows.length === 0) {
      return [];
    }

    // Normalize BM25 scores to 0-1 range
    const normalizedRows = this.normalizeBm25Scores(rows);

    // Map to SearchResult value objects
    return normalizedRows.map((row) =>
      SearchResult.create({
        sessionId: row.session_id,
        messageId: row.id,
        snippet: row.snippet,
        score: row.normalizedScore,
        timestamp: new Date(row.timestamp),
      })
    );
  }

  /**
   * Build the search SQL query with optional filters
   */
  private buildSearchQuery(
    queryValue: string,
    limit: number,
    options?: SearchOptions
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = [queryValue];
    const whereClauses: string[] = ["messages_fts MATCH ?"];
    let joinClauses = `
      FROM messages_fts f
      JOIN messages_meta m ON f.rowid = m.rowid
    `;

    // Project filter requires joining to sessions table
    if (options?.projectFilter) {
      joinClauses += `
        JOIN sessions s ON m.session_id = s.id
      `;
      whereClauses.push("s.project_path_encoded = ?");
      params.push(options.projectFilter.encoded);
    }

    // Role filter - supports single value or array
    if (options?.roleFilter) {
      if (Array.isArray(options.roleFilter)) {
        // Use IN clause for array of roles
        const placeholders = options.roleFilter.map(() => "?").join(", ");
        whereClauses.push(`m.role IN (${placeholders})`);
        params.push(...options.roleFilter);
      } else {
        whereClauses.push("m.role = ?");
        params.push(options.roleFilter);
      }
    }

    // Session filter
    if (options?.sessionFilter) {
      whereClauses.push("m.session_id = ?");
      params.push(options.sessionFilter);
    }

    // Date filters
    if (options?.sinceDate) {
      whereClauses.push("m.timestamp >= ?");
      params.push(options.sinceDate.toISOString());
    }

    if (options?.beforeDate) {
      whereClauses.push("m.timestamp <= ?");
      params.push(options.beforeDate.toISOString());
    }

    params.push(limit);

    const sql = `
      SELECT
        m.id,
        m.session_id,
        m.content,
        m.timestamp,
        bm25(messages_fts) as score,
        snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      ${joinClauses}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY score
      LIMIT ?
    `;

    return { sql, params };
  }

  /**
   * Normalize BM25 scores to 0-1 range
   *
   * BM25 returns negative values where more negative = better match.
   * We normalize so that:
   * - Best match (most negative) gets score 1.0
   * - Worst match (least negative) gets score based on relative ranking
   * - Single result gets score 1.0
   */
  private normalizeBm25Scores(
    rows: SearchRow[]
  ): Array<SearchRow & { normalizedScore: number }> {
    if (rows.length === 0) {
      return [];
    }

    if (rows.length === 1) {
      // Single result gets maximum score
      return [{ ...rows[0], normalizedScore: 1.0 }];
    }

    // Find min and max BM25 scores
    // BM25 returns negative values; min (most negative) is best
    const scores = rows.map((r) => r.score);
    const minScore = Math.min(...scores); // Best match (most negative)
    const maxScore = Math.max(...scores); // Worst match (least negative)

    // Handle case where all scores are equal
    if (minScore === maxScore) {
      return rows.map((row) => ({ ...row, normalizedScore: 1.0 }));
    }

    // Normalize: best (minScore) -> 1.0, worst (maxScore) -> 0.0
    // Formula: normalizedScore = (maxScore - score) / (maxScore - minScore)
    const range = maxScore - minScore;
    return rows.map((row) => ({
      ...row,
      normalizedScore: (maxScore - row.score) / range,
    }));
  }
}
