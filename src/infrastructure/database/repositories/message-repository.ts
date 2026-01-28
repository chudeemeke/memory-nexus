/**
 * SQLite Message Repository Implementation
 *
 * Implements IMessageRepository for SQLite with FTS5 integration.
 * Messages are automatically indexed via triggers when inserted.
 */

import type { Database, Statement } from "bun:sqlite";
import { Message, type MessageRole } from "../../../domain/entities/message.js";
import type { IMessageRepository } from "../../../domain/ports/repositories.js";

/**
 * Result of a batch save operation
 */
export interface BatchResult {
    /** Number of messages successfully inserted */
    inserted: number;
    /** Number of messages skipped (duplicates or errors) */
    skipped: number;
    /** Details of any errors encountered */
    errors: Array<{ id: string; reason: string }>;
}

/**
 * Options for batch save operations
 */
export interface BatchOptions {
    /** Callback for progress updates */
    onProgress?: (progress: { inserted: number; total: number }) => void;
}

/**
 * Database row type for messages_meta table
 */
interface MessageRow {
    id: string;
    session_id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    tool_use_ids: string | null;
}

/**
 * SQLite implementation of IMessageRepository
 *
 * Features:
 * - Prepared statements for optimal performance
 * - INSERT OR IGNORE for idempotent inserts
 * - Batch processing with transactions
 * - FTS5 indexing via automatic triggers
 */
export class SqliteMessageRepository implements IMessageRepository {
    private readonly db: Database;
    private readonly findByIdStmt: Statement<MessageRow, [string]>;
    private readonly findBySessionStmt: Statement<MessageRow, [string]>;
    private readonly existsStmt: Statement<{ id: string } | null, [string]>;
    private readonly insertStmt: Statement<unknown, Record<string, unknown>>;

    /**
     * Create a new SqliteMessageRepository
     *
     * @param db - Initialized SQLite database with schema applied
     */
    constructor(db: Database) {
        this.db = db;

        // Prepare statements for reuse
        this.findByIdStmt = db.prepare<MessageRow, [string]>(
            `SELECT id, session_id, role, content, timestamp, tool_use_ids
             FROM messages_meta
             WHERE id = ?`
        );

        this.findBySessionStmt = db.prepare<MessageRow, [string]>(
            `SELECT id, session_id, role, content, timestamp, tool_use_ids
             FROM messages_meta
             WHERE session_id = ?
             ORDER BY timestamp ASC`
        );

        // Used for existence check before insert (FTS5 triggers interfere with changes count)
        this.existsStmt = db.prepare<{ id: string } | null, [string]>(
            `SELECT id FROM messages_meta WHERE id = ?`
        );

        this.insertStmt = db.prepare(
            `INSERT OR IGNORE INTO messages_meta (id, session_id, role, content, timestamp, tool_use_ids)
             VALUES ($id, $session_id, $role, $content, $timestamp, $tool_use_ids)`
        );
    }

    /**
     * Find a message by its unique identifier
     */
    async findById(id: string): Promise<Message | null> {
        const row = this.findByIdStmt.get(id);
        if (!row) {
            return null;
        }
        return this.rowToMessage(row);
    }

    /**
     * Find all messages belonging to a session, ordered by timestamp
     */
    async findBySession(sessionId: string): Promise<Message[]> {
        const rows = this.findBySessionStmt.all(sessionId);
        return rows.map((row) => this.rowToMessage(row));
    }

    /**
     * Save a message associated with a session
     *
     * Uses INSERT OR IGNORE for idempotent behavior - duplicates are silently skipped.
     */
    async save(message: Message, sessionId: string): Promise<void> {
        this.insertStmt.run({
            $id: message.id,
            $session_id: sessionId,
            $role: message.role,
            $content: message.content,
            $timestamp: message.timestamp.toISOString(),
            $tool_use_ids: message.toolUses.length > 0 ? JSON.stringify(message.toolUses) : null,
        });
    }

    /**
     * Save multiple messages in a single batch operation
     *
     * Processes messages in batches of 100 within immediate transactions.
     * Reports progress via optional callback.
     *
     * @param messages - Array of message/sessionId pairs to save
     * @param options - Optional configuration including progress callback
     * @returns Result with counts of inserted, skipped, and any errors
     */
    async saveMany(
        messages: Array<{ message: Message; sessionId: string }>,
        options?: BatchOptions
    ): Promise<BatchResult> {
        const BATCH_SIZE = 100;
        const result: BatchResult = { inserted: 0, skipped: 0, errors: [] };

        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE);

            const insertBatch = this.db.transaction((items: typeof batch) => {
                for (const { message, sessionId } of items) {
                    try {
                        // Check existence before insert (FTS5 triggers interfere with changes count)
                        const exists = this.existsStmt.get(message.id);
                        if (exists) {
                            result.skipped++;
                            continue;
                        }

                        this.insertStmt.run({
                            $id: message.id,
                            $session_id: sessionId,
                            $role: message.role,
                            $content: message.content,
                            $timestamp: message.timestamp.toISOString(),
                            $tool_use_ids: message.toolUses.length > 0
                                ? JSON.stringify(message.toolUses)
                                : null,
                        });
                        result.inserted++;
                    } catch (err) {
                        result.skipped++;
                        result.errors.push({
                            id: message.id,
                            reason: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
            });

            // Use immediate mode to prevent SQLITE_BUSY
            insertBatch.immediate(batch);

            // Report progress after each batch
            options?.onProgress?.({
                inserted: result.inserted,
                total: messages.length,
            });
        }

        return result;
    }

    /**
     * Convert a database row to a Message entity
     */
    private rowToMessage(row: MessageRow): Message {
        const toolUseIds = row.tool_use_ids ? JSON.parse(row.tool_use_ids) as string[] : undefined;

        return Message.create({
            id: row.id,
            role: row.role as MessageRole,
            content: row.content,
            timestamp: new Date(row.timestamp),
            toolUseIds,
        });
    }
}
