/**
 * SQLite Tool Use Repository Implementation
 *
 * Persists ToolUse entities to SQLite database.
 * Implements IToolUseRepository with batch support and idempotent inserts.
 */

import type { Database, Statement } from "bun:sqlite";
import type { IToolUseRepository } from "../../../domain/ports/repositories.js";
import { ToolUse, type ToolUseStatus } from "../../../domain/entities/tool-use.js";

/**
 * Row type for tool_uses table
 */
interface ToolUseRow {
    id: string;
    session_id: string;
    name: string;
    input: string;
    timestamp: string;
    status: string;
    result: string | null;
}

/**
 * Result of a batch save operation
 */
export interface BatchResult {
    inserted: number;
    skipped: number;
    errors: Array<{ id: string; reason: string }>;
}

/**
 * Options for batch save operations
 */
export interface BatchOptions {
    onProgress?: (progress: { inserted: number; total: number }) => void;
}

/**
 * SQLite implementation of IToolUseRepository
 *
 * Features:
 * - INSERT OR IGNORE for idempotent inserts
 * - JSON serialization for input objects
 * - Batch insert with transaction support
 * - Progress callback for CLI integration
 */
export class SqliteToolUseRepository implements IToolUseRepository {
    private readonly db: Database;
    private readonly findByIdStmt: Statement<ToolUseRow, [string]>;
    private readonly findBySessionStmt: Statement<ToolUseRow, [string]>;
    private readonly insertStmt: Statement<unknown, {
        $id: string;
        $session_id: string;
        $name: string;
        $input: string;
        $timestamp: string;
        $status: string;
        $result: string | null;
    }>;

    constructor(db: Database) {
        this.db = db;

        // Prepare statements for repeated use
        this.findByIdStmt = db.prepare<ToolUseRow, [string]>(
            `SELECT id, session_id, name, input, timestamp, status, result
             FROM tool_uses
             WHERE id = ?`
        );

        this.findBySessionStmt = db.prepare<ToolUseRow, [string]>(
            `SELECT id, session_id, name, input, timestamp, status, result
             FROM tool_uses
             WHERE session_id = ?
             ORDER BY timestamp ASC`
        );

        this.insertStmt = db.prepare(
            `INSERT OR IGNORE INTO tool_uses
             (id, session_id, name, input, timestamp, status, result)
             VALUES ($id, $session_id, $name, $input, $timestamp, $status, $result)`
        );
    }

    /**
     * Find a tool use by its unique identifier.
     */
    async findById(id: string): Promise<ToolUse | null> {
        const row = this.findByIdStmt.get(id);
        if (!row) {
            return null;
        }
        return this.rowToEntity(row);
    }

    /**
     * Find all tool uses belonging to a session.
     * Returns array ordered by timestamp ascending.
     */
    async findBySession(sessionId: string): Promise<ToolUse[]> {
        const rows = this.findBySessionStmt.all(sessionId);
        return rows.map((row) => this.rowToEntity(row));
    }

    /**
     * Save a tool use associated with a session.
     * Uses INSERT OR IGNORE for idempotent inserts.
     */
    async save(toolUse: ToolUse, sessionId: string): Promise<void> {
        this.insertStmt.run({
            $id: toolUse.id,
            $session_id: sessionId,
            $name: toolUse.name,
            $input: JSON.stringify(toolUse.input),
            $timestamp: toolUse.timestamp.toISOString(),
            $status: toolUse.status,
            $result: toolUse.result ?? null,
        });
    }

    /**
     * Save multiple tool uses in a single transaction.
     * Processes in batches of 100 for memory efficiency.
     * Returns batch result with counts and any errors encountered.
     */
    async saveMany(
        toolUses: Array<{ toolUse: ToolUse; sessionId: string }>,
        options?: BatchOptions
    ): Promise<BatchResult> {
        const BATCH_SIZE = 100;
        const result: BatchResult = { inserted: 0, skipped: 0, errors: [] };

        for (let i = 0; i < toolUses.length; i += BATCH_SIZE) {
            const batch = toolUses.slice(i, i + BATCH_SIZE);

            const insertBatch = this.db.transaction(
                (items: typeof batch) => {
                    for (const { toolUse, sessionId } of items) {
                        try {
                            const runResult = this.insertStmt.run({
                                $id: toolUse.id,
                                $session_id: sessionId,
                                $name: toolUse.name,
                                $input: JSON.stringify(toolUse.input),
                                $timestamp: toolUse.timestamp.toISOString(),
                                $status: toolUse.status,
                                $result: toolUse.result ?? null,
                            });
                            if (runResult.changes > 0) {
                                result.inserted++;
                            } else {
                                result.skipped++;
                            }
                        } catch (err) {
                            result.skipped++;
                            result.errors.push({
                                id: toolUse.id,
                                reason: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }
                }
            );

            insertBatch.immediate(batch);
            options?.onProgress?.({
                inserted: result.inserted,
                total: toolUses.length,
            });
        }

        return result;
    }

    /**
     * Convert a database row to a ToolUse entity.
     */
    private rowToEntity(row: ToolUseRow): ToolUse {
        return ToolUse.create({
            id: row.id,
            name: row.name,
            input: JSON.parse(row.input) as Record<string, unknown>,
            timestamp: new Date(row.timestamp),
            status: row.status as ToolUseStatus,
            result: row.result ?? undefined,
        });
    }
}
