/**
 * EmbeddingRepository Tests
 *
 * Tests for the embedding data access layer including
 * findUnembedded, storeBatch, model hash/name tracking,
 * clearAllEmbeddings, and count queries.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import {
    EmbeddingRepository,
    type UnembeddedMessage,
    type EmbeddingBatchItem,
    type VectorSearchRow,
} from "./embedding-repository.js";

/**
 * Insert a test session and messages into the database.
 * Returns rowids of inserted messages (1-based, autoincrement).
 */
function insertTestMessages(db: Database, count: number): number[] {
    db.exec(`
        INSERT OR IGNORE INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
        VALUES ('test-session', 'enc', 'dec', 'test', '2024-01-01T00:00:00Z')
    `);
    const rowids: number[] = [];
    for (let i = 1; i <= count; i++) {
        const stmt = db.prepare(
            "INSERT INTO messages_meta (id, session_id, role, content, timestamp) VALUES (?, 'test-session', 'user', ?, '2024-01-01T00:00:00Z')"
        );
        stmt.run(`msg-${i}`, `message content ${i}`);
        // Get the actual rowid
        const row = db.prepare("SELECT rowid FROM messages_meta WHERE id = ?").get(`msg-${i}`) as { rowid: number };
        rowids.push(row.rowid);
    }
    return rowids;
}

/**
 * Create a test Float32Array with known values.
 */
function createTestEmbedding(seed: number = 1, dims: number = 384): Float32Array {
    const arr = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
        arr[i] = (seed * (i + 1)) / dims;
    }
    return arr;
}

describe("EmbeddingRepository", () => {
    let db: Database;
    let repo: EmbeddingRepository;
    let sqliteVecAvailable: boolean;

    beforeEach(() => {
        const result = initializeDatabase({ path: ":memory:" });
        db = result.db;
        sqliteVecAvailable = result.sqliteVecAvailable;
        repo = new EmbeddingRepository(db);
    });

    afterEach(() => {
        closeDatabase(db);
    });

    describe("findUnembedded()", () => {
        test("returns all messages when none are embedded", () => {
            const rowids = insertTestMessages(db, 5);
            const result = repo.findUnembedded(10);

            expect(result).toHaveLength(5);
            expect(result[0]).toHaveProperty("rowid");
            expect(result[0]).toHaveProperty("content");
            expect(result[0].rowid).toBe(rowids[0]);
            expect(result[0].content).toBe("message content 1");
        });

        test("respects LIMIT parameter", () => {
            insertTestMessages(db, 5);
            const result = repo.findUnembedded(3);

            expect(result).toHaveLength(3);
        });

        test("returns results ordered by rowid ASC", () => {
            const rowids = insertTestMessages(db, 5);
            const result = repo.findUnembedded(10);

            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i].rowid).toBeLessThan(result[i + 1].rowid);
            }
            expect(result[0].rowid).toBe(rowids[0]);
            expect(result[4].rowid).toBe(rowids[4]);
        });

        test("excludes already-embedded messages", () => {
            const rowids = insertTestMessages(db, 5);

            // Simulate embedding messages 1-3
            const now = new Date().toISOString();
            for (let i = 0; i < 3; i++) {
                db.prepare(
                    "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash123', 'test-model')"
                ).run(rowids[i], now);
            }

            const result = repo.findUnembedded(10);
            expect(result).toHaveLength(2);
            expect(result[0].rowid).toBe(rowids[3]);
            expect(result[1].rowid).toBe(rowids[4]);
        });

        test("returns empty array when all messages are embedded", () => {
            const rowids = insertTestMessages(db, 3);

            const now = new Date().toISOString();
            for (const rowid of rowids) {
                db.prepare(
                    "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash123', 'test-model')"
                ).run(rowid, now);
            }

            const result = repo.findUnembedded(10);
            expect(result).toHaveLength(0);
        });

        test("returns empty array when no messages exist", () => {
            const result = repo.findUnembedded(10);
            expect(result).toHaveLength(0);
        });
    });

    describe("storeBatch()", () => {
        test("inserts into embedding_state with correct data", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping storeBatch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 1);
            const embedding = createTestEmbedding(1);

            repo.storeBatch(
                [{ rowid: rowids[0], embedding }],
                "abc123",
                "test-model"
            );

            const stateRow = db.prepare(
                "SELECT message_id, embedded_at, model_hash, model_name FROM embedding_state WHERE message_id = ?"
            ).get(rowids[0]) as { message_id: number; embedded_at: string; model_hash: string; model_name: string };

            expect(stateRow).toBeDefined();
            expect(stateRow.message_id).toBe(rowids[0]);
            expect(stateRow.model_hash).toBe("abc123");
            expect(stateRow.model_name).toBe("test-model");
            // Validate ISO timestamp
            expect(() => new Date(stateRow.embedded_at)).not.toThrow();
            expect(new Date(stateRow.embedded_at).toISOString()).toBe(stateRow.embedded_at);
        });

        test("inserts into message_embeddings", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping storeBatch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 1);
            const embedding = createTestEmbedding(1);

            repo.storeBatch(
                [{ rowid: rowids[0], embedding }],
                "abc123",
                "test-model"
            );

            const vecRow = db.prepare(
                "SELECT rowid FROM message_embeddings WHERE rowid = ?"
            ).get(rowids[0]) as { rowid: number } | null;

            expect(vecRow).toBeDefined();
            expect(vecRow!.rowid).toBe(rowids[0]);
        });

        test("inserts batch of multiple items", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping storeBatch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 3);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));

            repo.storeBatch(items, "hash456", "batch-model");

            const stateCount = db.prepare(
                "SELECT COUNT(*) as count FROM embedding_state"
            ).get() as { count: number };
            expect(stateCount.count).toBe(3);

            const vecCount = db.prepare(
                "SELECT COUNT(*) as count FROM message_embeddings"
            ).get() as { count: number };
            expect(vecCount.count).toBe(3);
        });

        test("is atomic -- duplicate rowid rolls back entire batch", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping storeBatch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 3);

            // First, insert one embedding
            repo.storeBatch(
                [{ rowid: rowids[0], embedding: createTestEmbedding(1) }],
                "hash1",
                "model1"
            );

            // Try to insert a batch with a duplicate (rowids[0] already exists)
            const items: EmbeddingBatchItem[] = [
                { rowid: rowids[1], embedding: createTestEmbedding(2) },
                { rowid: rowids[0], embedding: createTestEmbedding(1) }, // duplicate
            ];

            expect(() => {
                repo.storeBatch(items, "hash2", "model2");
            }).toThrow();

            // Only the original 1 row should exist (batch rolled back)
            const stateCount = db.prepare(
                "SELECT COUNT(*) as count FROM embedding_state"
            ).get() as { count: number };
            expect(stateCount.count).toBe(1);
        });
    });

    describe("getStoredModelHash()", () => {
        test("returns null when no embeddings exist", () => {
            const result = repo.getStoredModelHash();
            expect(result).toBeNull();
        });

        test("returns stored model hash", () => {
            if (!sqliteVecAvailable) {
                // Can insert into embedding_state directly (regular table)
                const rowids = insertTestMessages(db, 1);
                db.prepare(
                    "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'abc123', 'test-model')"
                ).run(rowids[0], new Date().toISOString());

                const result = repo.getStoredModelHash();
                expect(result).toBe("abc123");
                return;
            }

            const rowids = insertTestMessages(db, 1);
            repo.storeBatch(
                [{ rowid: rowids[0], embedding: createTestEmbedding(1) }],
                "abc123",
                "test-model"
            );

            const result = repo.getStoredModelHash();
            expect(result).toBe("abc123");
        });

        test("returns first hash when queried (LIMIT 1)", () => {
            const rowids = insertTestMessages(db, 2);
            const now = new Date().toISOString();
            db.prepare(
                "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash-a', 'model-a')"
            ).run(rowids[0], now);
            db.prepare(
                "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash-a', 'model-a')"
            ).run(rowids[1], now);

            const result = repo.getStoredModelHash();
            expect(result).toBe("hash-a");
        });
    });

    describe("getStoredModelName()", () => {
        test("returns null when no embeddings exist", () => {
            const result = repo.getStoredModelName();
            expect(result).toBeNull();
        });

        test("returns stored model name", () => {
            const rowids = insertTestMessages(db, 1);
            db.prepare(
                "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash1', 'Xenova/all-MiniLM-L6-v2')"
            ).run(rowids[0], new Date().toISOString());

            const result = repo.getStoredModelName();
            expect(result).toBe("Xenova/all-MiniLM-L6-v2");
        });

        test("returns null when model_name is empty string (legacy data)", () => {
            const rowids = insertTestMessages(db, 1);
            db.prepare(
                "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash1', '')"
            ).run(rowids[0], new Date().toISOString());

            const result = repo.getStoredModelName();
            expect(result).toBeNull();
        });
    });

    describe("clearAllEmbeddings()", () => {
        test("removes all embedding_state rows", () => {
            const rowids = insertTestMessages(db, 3);
            const now = new Date().toISOString();
            for (const rowid of rowids) {
                db.prepare(
                    "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash1', 'model1')"
                ).run(rowid, now);
            }

            repo.clearAllEmbeddings();

            const count = db.prepare(
                "SELECT COUNT(*) as count FROM embedding_state"
            ).get() as { count: number };
            expect(count.count).toBe(0);
        });

        test("removes all message_embeddings rows", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping clearAllEmbeddings vec test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 2);
            repo.storeBatch(
                rowids.map((rowid, i) => ({
                    rowid,
                    embedding: createTestEmbedding(i + 1),
                })),
                "hash1",
                "model1"
            );

            repo.clearAllEmbeddings();

            const vecCount = db.prepare(
                "SELECT COUNT(*) as count FROM message_embeddings"
            ).get() as { count: number };
            expect(vecCount.count).toBe(0);

            const stateCount = db.prepare(
                "SELECT COUNT(*) as count FROM embedding_state"
            ).get() as { count: number };
            expect(stateCount.count).toBe(0);
        });
    });

    describe("getEmbeddedCount()", () => {
        test("returns 0 when no embeddings exist", () => {
            expect(repo.getEmbeddedCount()).toBe(0);
        });

        test("returns correct count after inserting embeddings", () => {
            const rowids = insertTestMessages(db, 3);
            const now = new Date().toISOString();
            for (const rowid of rowids) {
                db.prepare(
                    "INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name) VALUES (?, ?, 'hash1', 'model1')"
                ).run(rowid, now);
            }

            expect(repo.getEmbeddedCount()).toBe(3);
        });
    });

    describe("getTotalMessageCount()", () => {
        test("returns 0 when no messages exist", () => {
            expect(repo.getTotalMessageCount()).toBe(0);
        });

        test("returns correct count after inserting messages", () => {
            insertTestMessages(db, 5);
            expect(repo.getTotalMessageCount()).toBe(5);
        });
    });

    describe("vectorKnnSearch()", () => {
        test("returns results with rowid and distance shape", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping vectorKnnSearch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 5);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));
            repo.storeBatch(items, "hash1", "model1");

            const queryEmbedding = createTestEmbedding(1);
            const results = repo.vectorKnnSearch(queryEmbedding, 3);

            expect(results).toHaveLength(3);
            expect(results[0]).toHaveProperty("rowid");
            expect(results[0]).toHaveProperty("distance");
        });

        test("results are ordered by distance ASC (most similar first)", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping vectorKnnSearch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 5);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));
            repo.storeBatch(items, "hash1", "model1");

            const queryEmbedding = createTestEmbedding(1);
            const results = repo.vectorKnnSearch(queryEmbedding, 5);

            for (let i = 0; i < results.length - 1; i++) {
                expect(results[i].distance).toBeLessThanOrEqual(results[i + 1].distance);
            }
        });

        test("returned rowids correspond to actual message rowids", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping vectorKnnSearch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 5);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));
            repo.storeBatch(items, "hash1", "model1");

            const queryEmbedding = createTestEmbedding(3);
            const results = repo.vectorKnnSearch(queryEmbedding, 5);

            const validRowids = new Set(rowids);
            for (const r of results) {
                expect(validRowids.has(r.rowid)).toBe(true);
            }
        });

        test("returns at most available embeddings when limit exceeds count", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping vectorKnnSearch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 5);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));
            repo.storeBatch(items, "hash1", "model1");

            const queryEmbedding = createTestEmbedding(1);
            const results = repo.vectorKnnSearch(queryEmbedding, 10);

            expect(results).toHaveLength(5);
        });

        test("returns empty array when limit is 0", () => {
            if (!sqliteVecAvailable) {
                console.warn("Skipping vectorKnnSearch test: sqlite-vec not available");
                return;
            }

            const rowids = insertTestMessages(db, 3);
            const items: EmbeddingBatchItem[] = rowids.map((rowid, i) => ({
                rowid,
                embedding: createTestEmbedding(i + 1),
            }));
            repo.storeBatch(items, "hash1", "model1");

            const queryEmbedding = createTestEmbedding(1);
            const results = repo.vectorKnnSearch(queryEmbedding, 0);

            expect(results).toHaveLength(0);
        });
    });
});
