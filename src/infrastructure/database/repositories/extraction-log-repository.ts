/**
 * SQLite implementation of IExtractionLogRepository.
 *
 * Persists fact extraction run statistics and metadata.
 * Uses INSERT OR REPLACE for idempotency on session_id primary key.
 */

import type { Database } from "bun:sqlite";
import type {
  IExtractionLogRepository,
  ExtractionLogEntry
} from "../../../domain/ports/repositories.js";

interface ExtractionLogRow {
  session_id: string;
  mode: string;
  facts_added: number;
  facts_updated: number;
  facts_superseded: number;
  facts_skipped: number;
  provider: string;
  model: string;
  tokens_consumed: number;
  extracted_at: string;
}

export class SqliteExtractionLogRepository implements IExtractionLogRepository {
  constructor(private readonly db: Database) {}

  async findById(sessionId: string): Promise<ExtractionLogEntry | null> {
    const row = this.db
      .prepare("SELECT * FROM extraction_log WHERE session_id = ?")
      .get(sessionId) as ExtractionLogRow | null;

    if (!row) return null;
    return this.toEntry(row);
  }

  async save(entry: ExtractionLogEntry): Promise<void> {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO extraction_log (
          session_id, mode, facts_added, facts_updated, facts_superseded,
          facts_skipped, provider, model, tokens_consumed, extracted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.sessionId,
        entry.mode,
        entry.factsAdded,
        entry.factsUpdated,
        entry.factsSuperseded,
        entry.factsSkipped,
        entry.provider,
        entry.model,
        entry.tokensConsumed,
        entry.extractedAt.toISOString()
      );
  }

  async findAll(): Promise<ExtractionLogEntry[]> {
    const rows = this.db
      .prepare("SELECT * FROM extraction_log ORDER BY extracted_at DESC")
      .all() as ExtractionLogRow[];

    return rows.map(row => this.toEntry(row));
  }

  async clearAll(): Promise<void> {
    this.db.exec("DELETE FROM extraction_log;");
  }

  private toEntry(row: ExtractionLogRow): ExtractionLogEntry {
    return {
      sessionId: row.session_id,
      mode: row.mode,
      factsAdded: row.facts_added,
      factsUpdated: row.facts_updated,
      factsSuperseded: row.facts_superseded,
      factsSkipped: row.facts_skipped,
      provider: row.provider,
      model: row.model,
      tokensConsumed: row.tokens_consumed,
      extractedAt: new Date(row.extracted_at)
    };
  }
}
