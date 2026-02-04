/**
 * SQLite Stats Service Implementation
 *
 * Implements IStatsService using SQLite queries for database statistics.
 * Provides total counts, database size, and per-project breakdown.
 */

import type { Database } from "bun:sqlite";
import type {
  IStatsService,
  StatsResult,
  ProjectStats,
} from "../../../domain/ports/services.js";

/**
 * Raw size row from database
 */
interface SizeRow {
  size: number;
}

/**
 * Raw project stats row from database
 */
interface ProjectStatsRow {
  projectName: string;
  sessionCount: number;
  messageCount: number;
}

/**
 * SQLite implementation of IStatsService.
 *
 * Features:
 * - Single query with subqueries for totals (efficient)
 * - Table-valued PRAGMA for database size
 * - GROUP BY with proper COUNT for project breakdown
 */
export class SqliteStatsService implements IStatsService {
  private readonly db: Database;

  /**
   * Create a new SqliteStatsService.
   *
   * @param db - Initialized SQLite database with schema applied
   */
  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Get database-wide statistics with per-project breakdown.
   *
   * When projectLimit is applied, totals (sessions and messages) are computed
   * from the filtered project breakdown, so they match what's displayed.
   * Database size and tool uses remain as database-wide totals.
   *
   * @param projectLimit Maximum projects to include in breakdown (default 10)
   * @returns Statistics including totals and per-project breakdown
   */
  async getStats(projectLimit = 10): Promise<StatsResult> {
    // Get database size using table-valued PRAGMA (always database-wide)
    const sizeRow = this.db
      .prepare<SizeRow, []>(
        `
        SELECT page_size * page_count as size
        FROM pragma_page_count(), pragma_page_size()
        `
      )
      .get();

    // Get per-project breakdown (limited)
    const projectRows = this.db
      .prepare<ProjectStatsRow, [number]>(
        `
        SELECT
          s.project_name as projectName,
          COUNT(DISTINCT s.id) as sessionCount,
          COUNT(m.id) as messageCount
        FROM sessions s
        LEFT JOIN messages_meta m ON m.session_id = s.id
        GROUP BY s.project_name
        ORDER BY sessionCount DESC
        LIMIT ?
        `
      )
      .all(projectLimit);

    // Compute totals from filtered breakdown (so totals match displayed projects)
    const totalSessions = projectRows.reduce((sum, row) => sum + row.sessionCount, 0);
    const totalMessages = projectRows.reduce((sum, row) => sum + row.messageCount, 0);

    // Get total tool uses (database-wide, not per-project breakdown)
    const toolUsesRow = this.db
      .prepare<{ totalToolUses: number }, []>(
        `SELECT COUNT(*) as totalToolUses FROM tool_uses`
      )
      .get();

    return {
      totalSessions,
      totalMessages,
      totalToolUses: toolUsesRow?.totalToolUses ?? 0,
      databaseSizeBytes: sizeRow?.size ?? 0,
      projectBreakdown: projectRows.map((row) => ({
        projectName: row.projectName,
        sessionCount: row.sessionCount,
        messageCount: row.messageCount,
      })),
    };
  }
}
