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
 * Raw totals row from database
 */
interface TotalsRow {
  totalSessions: number;
  totalMessages: number;
  totalToolUses: number;
}

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
   * @param projectLimit Maximum projects to include in breakdown (default 10)
   * @returns Statistics including totals and per-project breakdown
   */
  async getStats(projectLimit = 10): Promise<StatsResult> {
    // Get totals using subqueries in single query
    const totalsRow = this.db
      .prepare<TotalsRow, []>(
        `
        SELECT
          (SELECT COUNT(*) FROM sessions) as totalSessions,
          (SELECT COUNT(*) FROM messages_meta) as totalMessages,
          (SELECT COUNT(*) FROM tool_uses) as totalToolUses
        `
      )
      .get();

    // Get database size using table-valued PRAGMA
    const sizeRow = this.db
      .prepare<SizeRow, []>(
        `
        SELECT page_size * page_count as size
        FROM pragma_page_count(), pragma_page_size()
        `
      )
      .get();

    // Get per-project breakdown
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

    return {
      totalSessions: totalsRow?.totalSessions ?? 0,
      totalMessages: totalsRow?.totalMessages ?? 0,
      totalToolUses: totalsRow?.totalToolUses ?? 0,
      databaseSizeBytes: sizeRow?.size ?? 0,
      projectBreakdown: projectRows.map((row) => ({
        projectName: row.projectName,
        sessionCount: row.sessionCount,
        messageCount: row.messageCount,
      })),
    };
  }
}
