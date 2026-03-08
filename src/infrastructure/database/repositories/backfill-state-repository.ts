/**
 * SQLite implementation of IBackfillStateRepository.
 *
 * Persists backfill state records tracking which sessions have been
 * backfilled (daily log generated). Uses INSERT OR REPLACE for upsert
 * semantics on the session_id primary key.
 */

import type { Database } from "bun:sqlite";
import { BackfillState } from "../../../domain/entities/backfill-state.js";
import type {
    IBackfillStateRepository,
    BackfillStatusCounts,
} from "../../../domain/ports/repositories.js";

interface BackfillStateRow {
    session_id: string;
    backfilled_at: string;
    daily_log_path: string;
    success: number;
    error_message: string | null;
}

export class SqliteBackfillStateRepository implements IBackfillStateRepository {
    constructor(private readonly db: Database) {}

    async findBySessionId(sessionId: string): Promise<BackfillState | null> {
        const row = this.db
            .prepare("SELECT * FROM backfill_state WHERE session_id = ?")
            .get(sessionId) as BackfillStateRow | null;

        if (!row) return null;
        return this.toEntity(row);
    }

    async findAll(): Promise<BackfillState[]> {
        const rows = this.db
            .prepare("SELECT * FROM backfill_state ORDER BY backfilled_at DESC")
            .all() as BackfillStateRow[];

        return rows.map((row) => this.toEntity(row));
    }

    async save(state: BackfillState): Promise<void> {
        this.db
            .prepare(
                `INSERT OR REPLACE INTO backfill_state
                 (session_id, backfilled_at, daily_log_path, success, error_message)
                 VALUES (?, ?, ?, ?, ?)`
            )
            .run(
                state.sessionId,
                state.backfilledAt.toISOString(),
                state.dailyLogPath,
                state.success ? 1 : 0,
                state.errorMessage ?? null,
            );
    }

    async countByStatus(): Promise<BackfillStatusCounts> {
        const row = this.db
            .prepare(
                `SELECT
                     COUNT(*) as total,
                     SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as succeeded,
                     SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
                 FROM backfill_state`
            )
            .get() as { total: number; succeeded: number; failed: number };

        return {
            total: row.total,
            succeeded: row.succeeded ?? 0,
            failed: row.failed ?? 0,
        };
    }

    private toEntity(row: BackfillStateRow): BackfillState {
        return BackfillState.create({
            sessionId: row.session_id,
            backfilledAt: new Date(row.backfilled_at),
            dailyLogPath: row.daily_log_path,
            success: row.success === 1,
            errorMessage: row.error_message ?? undefined,
        });
    }
}
