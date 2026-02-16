/**
 * SQLite Context Service Implementation
 *
 * Implements project context aggregation using SQLite queries.
 * Provides session counts, message breakdown, tool usage, and topics
 * for a specific project.
 */

import type { Database } from "bun:sqlite";

/**
 * Tool usage summary with name and count.
 */
export interface ToolUsage {
  name: string;
  count: number;
}

/**
 * Aggregated context for a project.
 */
export interface ProjectContext {
  projectName: string;
  projectPathDecoded: string;
  sessionCount: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  recentTopics: string[];
  recentToolUses: ToolUsage[];
  lastActivity: Date | null;
}

/**
 * Options for context retrieval.
 */
export interface ContextOptions {
  /** Filter to last N days (includes today) */
  days?: number;
  /** Maximum topics to return (default 10) */
  topicsLimit?: number;
  /** Maximum tools to return (default 10) */
  toolsLimit?: number;
}

/**
 * Raw project row from database.
 */
interface ProjectRow {
  project_name: string;
  project_path_decoded: string;
  project_path_encoded: string;
}

/**
 * Raw aggregation row from database.
 */
interface AggregateRow {
  sessionCount: number;
  lastActivity: string | null;
  userMessages: number;
  assistantMessages: number;
}

/**
 * Raw tool usage row from database.
 */
interface ToolRow {
  name: string;
  count: number;
}

/**
 * Raw topic row from database.
 */
interface TopicRow {
  topic: string;
}

/**
 * SQLite implementation of context service.
 *
 * Features:
 * - LIKE match for project name substring search
 * - Aggregation queries for counts
 * - Time-based filtering with --days option
 * - Tool usage breakdown sorted by count
 * - Topics from links table (graceful empty handling)
 */
export class SqliteContextService {
  private readonly db: Database;

  /**
   * Create a new SqliteContextService.
   *
   * @param db - Initialized SQLite database with schema applied
   */
  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Get aggregated context for a project.
   *
   * @param projectFilter Project name or substring to filter by
   * @param options Context retrieval options
   * @returns Project context or null if not found
   */
  async getProjectContext(
    projectFilter: string,
    options: ContextOptions = {}
  ): Promise<ProjectContext | null> {
    const topicsLimit = options.topicsLimit ?? 10;
    const toolsLimit = options.toolsLimit ?? 10;

    // Calculate sinceDate from options.days
    let sinceDate: Date | undefined;
    if (options.days) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
    }

    // Find project by name: exact match first, then substring ranked by session count
    const projectRow =
      this.db
        .prepare<ProjectRow, [string]>(
          `SELECT DISTINCT project_name, project_path_decoded, project_path_encoded
           FROM sessions
           WHERE LOWER(project_name) = LOWER(?)
           LIMIT 1`
        )
        .get(projectFilter) ??
      this.db
        .prepare<ProjectRow, [string]>(
          `SELECT project_name, project_path_decoded, project_path_encoded
           FROM sessions
           WHERE project_name LIKE '%' || ? || '%'
           GROUP BY project_name
           ORDER BY COUNT(*) DESC
           LIMIT 1`
        )
        .get(projectFilter);

    if (!projectRow) {
      return null;
    }

    const projectPathEncoded = projectRow.project_path_encoded;

    // Build date filter clause
    const dateFilter = sinceDate
      ? "AND s.start_time >= ?"
      : "";

    // Aggregate session and message counts
    const aggregateSql = `
      SELECT
        COUNT(DISTINCT s.id) as sessionCount,
        MAX(s.start_time) as lastActivity,
        COUNT(CASE WHEN m.role = 'user' THEN 1 END) as userMessages,
        COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) as assistantMessages
      FROM sessions s
      LEFT JOIN messages_meta m ON m.session_id = s.id
      WHERE s.project_path_encoded = ?
      ${dateFilter}
    `;

    const aggregateRow = sinceDate
      ? this.db.prepare<AggregateRow, [string, string]>(aggregateSql).get(
          projectPathEncoded,
          sinceDate.toISOString()
        )
      : this.db.prepare<AggregateRow, [string]>(aggregateSql).get(projectPathEncoded);

    if (!aggregateRow || aggregateRow.sessionCount === 0) {
      // No sessions found for this project (possibly due to date filter)
      return null;
    }

    // Get tool usage breakdown
    const toolDateFilter = sinceDate
      ? "AND t.timestamp >= ?"
      : "";

    const toolSql = `
      SELECT t.name, COUNT(*) as count
      FROM tool_uses t
      JOIN sessions s ON t.session_id = s.id
      WHERE s.project_path_encoded = ?
      ${toolDateFilter}
      GROUP BY t.name
      ORDER BY count DESC
      LIMIT ?
    `;

    const toolRows = sinceDate
      ? this.db
          .prepare<ToolRow, [string, string, number]>(toolSql)
          .all(projectPathEncoded, sinceDate.toISOString(), toolsLimit)
      : this.db
          .prepare<ToolRow, [string, number]>(toolSql)
          .all(projectPathEncoded, toolsLimit);

    // Get topics from links (handle empty gracefully)
    const topicDateFilter = sinceDate
      ? `JOIN sessions s ON l.source_type = 'session' AND l.source_id = s.id
         WHERE s.project_path_encoded = ?
           AND l.target_type = 'topic'
           AND s.start_time >= ?`
      : `JOIN sessions s ON l.source_type = 'session' AND l.source_id = s.id
         WHERE s.project_path_encoded = ?
           AND l.target_type = 'topic'`;

    const topicSql = `
      SELECT DISTINCT l.target_id as topic
      FROM links l
      ${topicDateFilter}
      ORDER BY l.weight DESC
      LIMIT ?
    `;

    const topicRows = sinceDate
      ? this.db
          .prepare<TopicRow, [string, string, number]>(topicSql)
          .all(projectPathEncoded, sinceDate.toISOString(), topicsLimit)
      : this.db
          .prepare<TopicRow, [string, number]>(topicSql)
          .all(projectPathEncoded, topicsLimit);

    return {
      projectName: projectRow.project_name,
      projectPathDecoded: projectRow.project_path_decoded,
      sessionCount: aggregateRow.sessionCount,
      totalMessages: aggregateRow.userMessages + aggregateRow.assistantMessages,
      userMessages: aggregateRow.userMessages,
      assistantMessages: aggregateRow.assistantMessages,
      recentTopics: topicRows.map((r) => r.topic),
      recentToolUses: toolRows.map((r) => ({ name: r.name, count: r.count })),
      lastActivity: aggregateRow.lastActivity
        ? new Date(aggregateRow.lastActivity)
        : null,
    };
  }
}
