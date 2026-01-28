/**
 * SQLite Extraction State Repository
 *
 * Implements IExtractionStateRepository using bun:sqlite prepared statements.
 * Uses INSERT OR REPLACE for upsert semantics on state updates.
 */

import type { Database, Statement } from "bun:sqlite";
import type { IExtractionStateRepository } from "../../../domain/ports/repositories.js";
import {
  ExtractionState,
  type ExtractionStatus,
} from "../../../domain/entities/extraction-state.js";

/**
 * Row shape from extraction_state table
 */
interface ExtractionStateRow {
  id: string;
  session_path: string;
  started_at: string;
  status: ExtractionStatus;
  completed_at: string | null;
  messages_extracted: number;
  error_message: string | null;
  file_mtime: string | null;
  file_size: number | null;
}

/**
 * SQLite implementation of IExtractionStateRepository
 *
 * Uses prepared statements for all operations. State identity is based
 * on the unique ID. INSERT OR REPLACE provides upsert semantics.
 *
 * Transaction-based state updates: save() should be called within the same
 * transaction as message inserts. State is ONLY marked 'complete' after
 * data commit succeeds.
 */
export class SqliteExtractionStateRepository
  implements IExtractionStateRepository
{
  private readonly db: Database;
  private readonly findByIdStmt: Statement;
  private readonly findBySessionPathStmt: Statement;
  private readonly findPendingStmt: Statement;
  private readonly saveStmt: Statement;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements once for reuse
    this.findByIdStmt = db.prepare(`
      SELECT id, session_path, started_at, status, completed_at,
             messages_extracted, error_message, file_mtime, file_size
      FROM extraction_state
      WHERE id = $id
    `);

    this.findBySessionPathStmt = db.prepare(`
      SELECT id, session_path, started_at, status, completed_at,
             messages_extracted, error_message, file_mtime, file_size
      FROM extraction_state
      WHERE session_path = $sessionPath
    `);

    this.findPendingStmt = db.prepare(`
      SELECT id, session_path, started_at, status, completed_at,
             messages_extracted, error_message, file_mtime, file_size
      FROM extraction_state
      WHERE status IN ('pending', 'in_progress')
      ORDER BY started_at ASC
    `);

    this.saveStmt = db.prepare(`
      INSERT OR REPLACE INTO extraction_state
        (id, session_path, started_at, status, completed_at,
         messages_extracted, error_message, file_mtime, file_size)
      VALUES
        ($id, $sessionPath, $startedAt, $status, $completedAt,
         $messagesExtracted, $errorMessage, $fileMtime, $fileSize)
    `);
  }

  /**
   * Map a database row to an ExtractionState entity
   */
  private rowToExtractionState(row: ExtractionStateRow): ExtractionState {
    return ExtractionState.create({
      id: row.id,
      sessionPath: row.session_path,
      startedAt: new Date(row.started_at),
      status: row.status,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      messagesExtracted: row.messages_extracted,
      errorMessage: row.error_message ?? undefined,
      fileMtime: row.file_mtime ? new Date(row.file_mtime) : undefined,
      fileSize: row.file_size ?? undefined,
    });
  }

  /**
   * Find an extraction state by its unique identifier.
   */
  async findById(id: string): Promise<ExtractionState | null> {
    const row = this.findByIdStmt.get({ $id: id }) as ExtractionStateRow | null;
    if (!row) {
      return null;
    }
    return this.rowToExtractionState(row);
  }

  /**
   * Find extraction state by session path.
   * Used to check if a session has already been extracted.
   */
  async findBySessionPath(
    sessionPath: string
  ): Promise<ExtractionState | null> {
    const row = this.findBySessionPathStmt.get({
      $sessionPath: sessionPath,
    }) as ExtractionStateRow | null;
    if (!row) {
      return null;
    }
    return this.rowToExtractionState(row);
  }

  /**
   * Find all extractions that are pending or in progress.
   * Used to resume interrupted extractions.
   */
  async findPending(): Promise<ExtractionState[]> {
    const rows = this.findPendingStmt.all() as ExtractionStateRow[];
    return rows.map((row) => this.rowToExtractionState(row));
  }

  /**
   * Save an extraction state to the repository.
   * Uses INSERT OR REPLACE for upsert semantics.
   *
   * File metadata (fileMtime, fileSize) is stored for incremental sync detection.
   * fileMtime is stored as ISO 8601 string, fileSize as integer bytes.
   */
  async save(state: ExtractionState): Promise<void> {
    this.saveStmt.run({
      $id: state.id,
      $sessionPath: state.sessionPath,
      $startedAt: state.startedAt.toISOString(),
      $status: state.status,
      $completedAt: state.completedAt?.toISOString() ?? null,
      $messagesExtracted: state.messagesExtracted,
      $errorMessage: state.errorMessage ?? null,
      $fileMtime: state.fileMtime?.toISOString() ?? null,
      $fileSize: state.fileSize ?? null,
    });
  }
}
