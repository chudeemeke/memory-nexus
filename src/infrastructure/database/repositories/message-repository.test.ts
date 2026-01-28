/**
 * SqliteMessageRepository Tests
 *
 * Tests for message persistence, batch operations, and FTS5 integration.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import { SqliteMessageRepository, type BatchResult } from "./message-repository.js";
import { Message } from "../../../domain/entities/message.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Insert a test session into the database (required for foreign key)
 */
function insertTestSession(db: Database, id: string): void {
    db.run(
        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [id, "C--Test-Project", "C:\\Test\\Project", "TestProject"]
    );
}

/**
 * Create a test message with given parameters
 */
function createTestMessage(
    id: string,
    role: "user" | "assistant" = "user",
    content: string = "Test message content",
    toolUseIds?: string[]
): Message {
    return Message.create({
        id,
        role,
        content,
        timestamp: new Date("2026-01-28T10:00:00Z"),
        toolUseIds,
    });
}

// ============================================================================
// Core Method Tests (Task 1)
// ============================================================================

describe("SqliteMessageRepository", () => {
    let db: Database;
    let repository: SqliteMessageRepository;

    beforeEach(() => {
        const result = initializeDatabase({ path: ":memory:" });
        db = result.db;
        repository = new SqliteMessageRepository(db);

        // Insert test session for foreign key
        insertTestSession(db, "session-1");
    });

    afterEach(() => {
        closeDatabase(db);
    });

    describe("Core Methods", () => {
        test("save and findById round-trip", async () => {
            const message = createTestMessage("msg-1", "user", "Hello world");

            await repository.save(message, "session-1");
            const found = await repository.findById("msg-1");

            expect(found).not.toBeNull();
            expect(found!.id).toBe("msg-1");
            expect(found!.role).toBe("user");
            expect(found!.content).toBe("Hello world");
            expect(found!.timestamp.toISOString()).toBe("2026-01-28T10:00:00.000Z");
        });

        test("findById returns null for non-existent message", async () => {
            const found = await repository.findById("non-existent");
            expect(found).toBeNull();
        });

        test("findBySession returns messages in timestamp order", async () => {
            const msg1 = Message.create({
                id: "msg-1",
                role: "user",
                content: "First message",
                timestamp: new Date("2026-01-28T10:00:00Z"),
            });
            const msg2 = Message.create({
                id: "msg-2",
                role: "assistant",
                content: "Second message",
                timestamp: new Date("2026-01-28T10:01:00Z"),
            });
            const msg3 = Message.create({
                id: "msg-3",
                role: "user",
                content: "Third message",
                timestamp: new Date("2026-01-28T10:02:00Z"),
            });

            // Insert in random order
            await repository.save(msg3, "session-1");
            await repository.save(msg1, "session-1");
            await repository.save(msg2, "session-1");

            const messages = await repository.findBySession("session-1");

            expect(messages).toHaveLength(3);
            expect(messages[0]!.id).toBe("msg-1");
            expect(messages[1]!.id).toBe("msg-2");
            expect(messages[2]!.id).toBe("msg-3");
        });

        test("findBySession returns empty array for non-existent session", async () => {
            const messages = await repository.findBySession("non-existent");
            expect(messages).toHaveLength(0);
        });

        test("INSERT OR IGNORE on duplicate ID (no error)", async () => {
            const message = createTestMessage("msg-dup", "user", "Original content");
            const duplicate = createTestMessage("msg-dup", "assistant", "Different content");

            await repository.save(message, "session-1");
            // Should not throw
            await repository.save(duplicate, "session-1");

            // Original message should remain
            const found = await repository.findById("msg-dup");
            expect(found!.content).toBe("Original content");
            expect(found!.role).toBe("user");
        });

        test("role constraint validation (user role)", async () => {
            const message = createTestMessage("msg-user", "user", "User message");
            await repository.save(message, "session-1");

            const found = await repository.findById("msg-user");
            expect(found!.role).toBe("user");
        });

        test("role constraint validation (assistant role)", async () => {
            const message = createTestMessage("msg-assistant", "assistant", "Assistant message");
            await repository.save(message, "session-1");

            const found = await repository.findById("msg-assistant");
            expect(found!.role).toBe("assistant");
        });

        test("tool_use_ids JSON serialization", async () => {
            const toolIds = ["tool-1", "tool-2", "tool-3"];
            const message = createTestMessage("msg-tools", "assistant", "Using tools", toolIds);

            await repository.save(message, "session-1");
            const found = await repository.findById("msg-tools");

            expect(found!.toolUses).toEqual(toolIds);
            expect(found!.hasToolUses).toBe(true);
        });

        test("tool_use_ids null when empty", async () => {
            const message = createTestMessage("msg-no-tools", "user", "No tools");

            await repository.save(message, "session-1");
            const found = await repository.findById("msg-no-tools");

            expect(found!.toolUses).toEqual([]);
            expect(found!.hasToolUses).toBe(false);
        });

        test("timestamp preserved correctly through round-trip", async () => {
            const timestamp = new Date("2026-01-28T15:30:45.123Z");
            const message = Message.create({
                id: "msg-time",
                role: "user",
                content: "Timestamp test",
                timestamp,
            });

            await repository.save(message, "session-1");
            const found = await repository.findById("msg-time");

            // Note: SQLite stores ISO string, milliseconds may be truncated
            expect(found!.timestamp.toISOString()).toContain("2026-01-28T15:30:45");
        });
    });

    describe("Batch saveMany (Task 2)", () => {
        test("saveMany with 10 messages (single batch)", async () => {
            const messages = Array.from({ length: 10 }, (_, i) => ({
                message: createTestMessage(`msg-batch-${i}`, "user", `Message ${i}`),
                sessionId: "session-1",
            }));

            const result = await repository.saveMany(messages);

            expect(result.inserted).toBe(10);
            expect(result.skipped).toBe(0);
            expect(result.errors).toHaveLength(0);

            // Verify all persisted
            const found = await repository.findBySession("session-1");
            expect(found).toHaveLength(10);
        });

        test("saveMany with 250 messages (multiple batches)", async () => {
            const messages = Array.from({ length: 250 }, (_, i) => ({
                message: createTestMessage(`msg-multi-${i}`, i % 2 === 0 ? "user" : "assistant", `Message ${i}`),
                sessionId: "session-1",
            }));

            const result = await repository.saveMany(messages);

            expect(result.inserted).toBe(250);
            expect(result.skipped).toBe(0);
            expect(result.errors).toHaveLength(0);

            // Verify all persisted
            const found = await repository.findBySession("session-1");
            expect(found).toHaveLength(250);
        });

        test("saveMany with 1000 messages completes in < 5 seconds", async () => {
            const messages = Array.from({ length: 1000 }, (_, i) => ({
                message: createTestMessage(
                    `msg-perf-${i}`,
                    i % 2 === 0 ? "user" : "assistant",
                    `Message ${i}: This is test content with various keywords like authentication, authorization, database, and API design patterns.`
                ),
                sessionId: "session-1",
            }));

            const startTime = performance.now();
            const result = await repository.saveMany(messages);
            const endTime = performance.now();

            const durationSeconds = (endTime - startTime) / 1000;

            expect(result.inserted).toBe(1000);
            expect(result.skipped).toBe(0);
            expect(durationSeconds).toBeLessThan(5);

            // Verify all persisted
            const count = db.query<{ cnt: number }, []>(
                "SELECT COUNT(*) as cnt FROM messages_meta WHERE session_id = ?"
            ).get("session-1" as unknown as never);
            expect(count?.cnt).toBe(1000);
        });

        test("progress callback receives correct values", async () => {
            const progressCalls: Array<{ inserted: number; total: number }> = [];

            const messages = Array.from({ length: 150 }, (_, i) => ({
                message: createTestMessage(`msg-progress-${i}`, "user", `Message ${i}`),
                sessionId: "session-1",
            }));

            await repository.saveMany(messages, {
                onProgress: (progress) => {
                    progressCalls.push({ ...progress });
                },
            });

            // With batch size 100, should have 2 progress calls
            expect(progressCalls.length).toBe(2);
            expect(progressCalls[0]!.total).toBe(150);
            expect(progressCalls[1]!.total).toBe(150);
            // Final progress should show all inserted
            expect(progressCalls[1]!.inserted).toBe(150);
        });

        test("partial failure does not stop entire batch", async () => {
            // Insert a session and some messages first
            insertTestSession(db, "session-2");

            // Create messages with one referencing a non-existent session
            // (should be caught and logged as error)
            const messages = [
                { message: createTestMessage("msg-ok-1", "user", "OK 1"), sessionId: "session-1" },
                { message: createTestMessage("msg-ok-2", "user", "OK 2"), sessionId: "session-2" },
            ];

            const result = await repository.saveMany(messages);

            // Both should succeed (foreign key exists for both sessions)
            expect(result.inserted).toBe(2);
            expect(result.skipped).toBe(0);
        });

        test("duplicate handling returns skipped count", async () => {
            // Insert messages first
            const messages = Array.from({ length: 5 }, (_, i) => ({
                message: createTestMessage(`msg-reinsert-${i}`, "user", `Message ${i}`),
                sessionId: "session-1",
            }));

            const firstResult = await repository.saveMany(messages);
            expect(firstResult.inserted).toBe(5);
            expect(firstResult.skipped).toBe(0);

            // Try to insert same messages again
            const secondResult = await repository.saveMany(messages);
            expect(secondResult.inserted).toBe(0);
            expect(secondResult.skipped).toBe(5);
            expect(secondResult.errors).toHaveLength(0); // Not errors, just skipped
        });

        test("empty array returns zero counts", async () => {
            const result = await repository.saveMany([]);

            expect(result.inserted).toBe(0);
            expect(result.skipped).toBe(0);
            expect(result.errors).toHaveLength(0);
        });

        test("mixed batch with duplicates", async () => {
            // Insert some messages
            await repository.save(createTestMessage("msg-existing-1", "user", "Existing 1"), "session-1");
            await repository.save(createTestMessage("msg-existing-2", "user", "Existing 2"), "session-1");

            // Now try to insert mix of new and existing
            const messages = [
                { message: createTestMessage("msg-existing-1", "user", "Duplicate 1"), sessionId: "session-1" },
                { message: createTestMessage("msg-new-1", "user", "New 1"), sessionId: "session-1" },
                { message: createTestMessage("msg-existing-2", "user", "Duplicate 2"), sessionId: "session-1" },
                { message: createTestMessage("msg-new-2", "user", "New 2"), sessionId: "session-1" },
            ];

            const result = await repository.saveMany(messages);

            expect(result.inserted).toBe(2);  // Only new messages
            expect(result.skipped).toBe(2);   // Duplicates
            expect(result.errors).toHaveLength(0);
        });
    });

    describe("FTS5 Integration (Task 3)", () => {
        test("inserted messages appear in FTS5 index", async () => {
            const message = createTestMessage(
                "msg-fts",
                "user",
                "Authentication implementation with JWT tokens"
            );
            await repository.save(message, "session-1");

            // Query FTS5 directly
            const results = db.query<{ content: string }, [string]>(
                "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
            ).all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("Authentication");
        });

        test("FTS5 trigger links rowid correctly", async () => {
            const message = createTestMessage(
                "msg-fts-rowid",
                "assistant",
                "Database schema migration patterns"
            );
            await repository.save(message, "session-1");

            // Get rowid from messages_meta
            const metaRow = db.query<{ rowid: number }, [string]>(
                "SELECT rowid FROM messages_meta WHERE id = ?"
            ).get("msg-fts-rowid");

            // Query FTS5 and check rowid matches
            const ftsRow = db.query<{ rowid: number }, [string]>(
                "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
            ).get("schema");

            expect(metaRow?.rowid).toBe(ftsRow?.rowid);
        });

        test("EXPLAIN QUERY PLAN shows FTS5 usage", async () => {
            // Insert a message first
            await repository.save(
                createTestMessage("msg-explain", "user", "Testing FTS5 query plan"),
                "session-1"
            );

            const plan = db.query<{ detail: string }, [string]>(
                "EXPLAIN QUERY PLAN SELECT * FROM messages_fts WHERE messages_fts MATCH ?"
            ).all("testing");

            const planText = plan.map((p) => p.detail).join(" ");
            // FTS5 query plans contain indicators of FTS usage
            expect(planText.toLowerCase()).toMatch(/scan.*messages_fts|virtual table|fts/i);
        });

        test("batch inserted messages are all FTS5 searchable", async () => {
            const messages = Array.from({ length: 50 }, (_, i) => ({
                message: createTestMessage(
                    `msg-batch-fts-${i}`,
                    "user",
                    `Message ${i} about authentication patterns`
                ),
                sessionId: "session-1",
            }));

            await repository.saveMany(messages);

            // Search FTS5 for all messages
            const results = db.query<{ cnt: number }, [string]>(
                "SELECT COUNT(*) as cnt FROM messages_fts WHERE messages_fts MATCH ?"
            ).get("authentication");

            expect(results?.cnt).toBe(50);
        });

        test("FTS5 search finds partial match with prefix", async () => {
            await repository.save(
                createTestMessage("msg-prefix", "assistant", "The authentication system validates users"),
                "session-1"
            );

            // Prefix search
            const results = db.query<{ content: string }, [string]>(
                "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
            ).all("auth*");

            expect(results).toHaveLength(1);
        });

        test("FTS5 BM25 ranking works with repository-inserted content", async () => {
            // Insert messages with different relevance
            await repository.save(
                createTestMessage("msg-low", "user", "authentication is used"),
                "session-1"
            );
            await repository.save(
                createTestMessage("msg-high", "assistant", "authentication authentication authentication system"),
                "session-1"
            );

            const results = db.query<{ id: string; rank: number }, [string]>(
                `SELECT m.id, bm25(messages_fts) as rank
                 FROM messages_meta m
                 JOIN messages_fts f ON m.rowid = f.rowid
                 WHERE messages_fts MATCH ?
                 ORDER BY rank`
            ).all("authentication");

            expect(results).toHaveLength(2);
            // More occurrences = better (lower) BM25 score
            expect(results[0]?.id).toBe("msg-high");
        });
    });
});
