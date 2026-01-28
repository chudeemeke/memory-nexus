/**
 * SQLite Session Repository
 *
 * Implements ISessionRepository using bun:sqlite prepared statements.
 * Uses INSERT OR IGNORE for idempotent session inserts.
 */

import type { Database, Statement } from "bun:sqlite";
import type { ISessionRepository } from "../../../domain/ports/repositories.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

/**
 * Row shape from sessions table
 */
interface SessionRow {
  id: string;
  project_path_encoded: string;
  project_path_decoded: string;
  project_name: string;
  start_time: string;
  end_time: string | null;
  message_count: number;
}

/**
 * SQLite implementation of ISessionRepository
 *
 * Uses prepared statements for all operations. Session identity is based
 * on the unique ID. INSERT OR IGNORE ensures idempotent saves.
 */
export class SqliteSessionRepository implements ISessionRepository {
  private readonly db: Database;
  private readonly findByIdStmt: Statement;
  private readonly findByProjectStmt: Statement;
  private readonly findRecentStmt: Statement;
  private readonly insertStmt: Statement;
  private readonly deleteStmt: Statement;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements once for reuse
    this.findByIdStmt = db.prepare(`
      SELECT id, project_path_encoded, project_path_decoded, project_name,
             start_time, end_time, message_count
      FROM sessions
      WHERE id = $id
    `);

    this.findByProjectStmt = db.prepare(`
      SELECT id, project_path_encoded, project_path_decoded, project_name,
             start_time, end_time, message_count
      FROM sessions
      WHERE project_path_encoded = $projectPath
      ORDER BY start_time DESC
    `);

    this.findRecentStmt = db.prepare(`
      SELECT id, project_path_encoded, project_path_decoded, project_name,
             start_time, end_time, message_count
      FROM sessions
      ORDER BY start_time DESC
      LIMIT $limit
    `);

    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO sessions
        (id, project_path_encoded, project_path_decoded, project_name,
         start_time, end_time, message_count)
      VALUES
        ($id, $projectPathEncoded, $projectPathDecoded, $projectName,
         $startTime, $endTime, $messageCount)
    `);

    this.deleteStmt = db.prepare(`
      DELETE FROM sessions WHERE id = $id
    `);
  }

  /**
   * Map a database row to a Session entity
   *
   * Uses project_path_decoded (lossless) not project_path_encoded (lossy
   * for paths containing hyphens). The encoded form is only used for
   * efficient lookups.
   */
  private rowToSession(row: SessionRow): Session {
    const projectPath = ProjectPath.fromDecoded(row.project_path_decoded);
    return Session.create({
      id: row.id,
      projectPath,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
    });
  }

  /**
   * Find a session by its unique identifier.
   */
  async findById(id: string): Promise<Session | null> {
    const row = this.findByIdStmt.get({ $id: id }) as SessionRow | null;
    if (!row) {
      return null;
    }
    return this.rowToSession(row);
  }

  /**
   * Find all sessions belonging to a project.
   */
  async findByProject(projectPath: ProjectPath): Promise<Session[]> {
    const rows = this.findByProjectStmt.all({
      $projectPath: projectPath.encoded,
    }) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Find the most recent sessions across all projects.
   */
  async findRecent(limit: number): Promise<Session[]> {
    const rows = this.findRecentStmt.all({ $limit: limit }) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Save a session to the repository.
   * Uses INSERT OR IGNORE for idempotency (no error on duplicate).
   */
  async save(session: Session): Promise<void> {
    this.insertStmt.run({
      $id: session.id,
      $projectPathEncoded: session.projectPath.encoded,
      $projectPathDecoded: session.projectPath.decoded,
      $projectName: session.projectPath.projectName,
      $startTime: session.startTime.toISOString(),
      $endTime: session.endTime?.toISOString() ?? null,
      $messageCount: session.messages.length,
    });
  }

  /**
   * Save multiple sessions in a single transaction.
   * Uses BEGIN IMMEDIATE for write locking.
   */
  async saveMany(sessions: Session[]): Promise<void> {
    const saveAll = this.db.transaction(() => {
      for (const session of sessions) {
        this.insertStmt.run({
          $id: session.id,
          $projectPathEncoded: session.projectPath.encoded,
          $projectPathDecoded: session.projectPath.decoded,
          $projectName: session.projectPath.projectName,
          $startTime: session.startTime.toISOString(),
          $endTime: session.endTime?.toISOString() ?? null,
          $messageCount: session.messages.length,
        });
      }
    });

    saveAll.immediate();
  }

  /**
   * Delete a session by its identifier.
   * Associated messages are deleted via foreign key CASCADE.
   */
  async delete(id: string): Promise<void> {
    this.deleteStmt.run({ $id: id });
  }
}
