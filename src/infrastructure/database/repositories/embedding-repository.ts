/**
 * Embedding Repository
 *
 * Data access layer for embedding storage. Manages the embedding_state
 * and message_embeddings tables for incremental embedding and model
 * change detection.
 *
 * The embedding_state table tracks which messages have been embedded
 * and with which model (hash + human-readable name). The message_embeddings
 * table is a vec0 virtual table storing the actual vector data.
 */

import type { Database } from "bun:sqlite";

/**
 * A message that has not yet been embedded.
 */
export interface UnembeddedMessage {
    /** The integer rowid from messages_meta (NOT the UUID id) */
    rowid: number;
    /** The message content text to embed */
    content: string;
}

/**
 * A single item in an embedding batch for storage.
 */
export interface EmbeddingBatchItem {
    /** The integer rowid matching messages_meta.rowid */
    rowid: number;
    /** The embedding vector */
    embedding: Float32Array;
}

/**
 * Repository for embedding data access.
 *
 * Provides methods for querying unembedded messages, storing embedding
 * results, tracking model hashes for change detection, and managing
 * the embedding lifecycle (clear + re-embed).
 */
export class EmbeddingRepository {
    constructor(private readonly db: Database) {}

    /**
     * Find messages that have not yet been embedded.
     *
     * Uses LEFT JOIN on messages_meta and embedding_state to find
     * messages without a corresponding embedding_state row.
     *
     * @param limit Maximum number of messages to return
     * @returns Array of unembedded messages ordered by rowid ASC
     */
    findUnembedded(limit: number): UnembeddedMessage[] {
        return this.db.prepare<UnembeddedMessage, [number]>(`
            SELECT m.rowid AS rowid, m.content AS content
            FROM messages_meta m
            LEFT JOIN embedding_state es ON m.rowid = es.message_id
            WHERE es.message_id IS NULL
            ORDER BY m.rowid ASC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Store a batch of embeddings in a single transaction.
     *
     * Inserts into both message_embeddings (vec0 virtual table) and
     * embedding_state (tracking table) atomically. If any insert fails,
     * the entire batch rolls back.
     *
     * @param items Array of embedding batch items (rowid + vector)
     * @param modelHash Hash identifying the model configuration
     * @param modelName Human-readable model name (e.g., "Xenova/all-MiniLM-L6-v2")
     */
    storeBatch(items: EmbeddingBatchItem[], modelHash: string, modelName: string): void {
        const insertVec = this.db.prepare(
            "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
        );
        const insertState = this.db.prepare(
            "INSERT INTO embedding_state(message_id, embedded_at, model_hash, model_name) VALUES (?, ?, ?, ?)"
        );

        const txn = this.db.transaction((batch: EmbeddingBatchItem[]) => {
            const now = new Date().toISOString();
            for (const item of batch) {
                insertVec.run(item.rowid, item.embedding);
                insertState.run(item.rowid, now, modelHash, modelName);
            }
        });

        txn(items);
    }

    /**
     * Get the model hash currently stored in embedding_state.
     *
     * @returns The model hash string, or null if no embeddings exist
     */
    getStoredModelHash(): string | null {
        const row = this.db.prepare<{ model_hash: string }, []>(
            "SELECT DISTINCT model_hash FROM embedding_state LIMIT 1"
        ).get();
        return row?.model_hash ?? null;
    }

    /**
     * Get the human-readable model name stored in embedding_state.
     *
     * Returns null if no embeddings exist or if model_name is empty
     * (legacy data from before the model_name column was added).
     *
     * @returns The model name string, or null if unavailable
     */
    getStoredModelName(): string | null {
        const row = this.db.prepare<{ model_name: string }, []>(
            "SELECT DISTINCT model_name FROM embedding_state WHERE model_name != '' LIMIT 1"
        ).get();
        return row?.model_name ?? null;
    }

    /**
     * Delete all embeddings and embedding state.
     *
     * Used before re-embedding when the model has changed.
     * Clears both message_embeddings (vec0) and embedding_state tables.
     */
    clearAllEmbeddings(): void {
        this.db.exec("DELETE FROM message_embeddings");
        this.db.exec("DELETE FROM embedding_state");
    }

    /**
     * Count the number of embedded messages.
     *
     * @returns The number of rows in embedding_state
     */
    getEmbeddedCount(): number {
        const row = this.db.prepare<{ count: number }, []>(
            "SELECT COUNT(*) as count FROM embedding_state"
        ).get();
        return row?.count ?? 0;
    }

    /**
     * Count the total number of messages in the database.
     *
     * @returns The number of rows in messages_meta
     */
    getTotalMessageCount(): number {
        const row = this.db.prepare<{ count: number }, []>(
            "SELECT COUNT(*) as count FROM messages_meta"
        ).get();
        return row?.count ?? 0;
    }
}
