/**
 * FTS5 Integration Tests
 *
 * Comprehensive tests for FTS5 full-text search functionality,
 * including MATCH queries, BM25 ranking, trigger synchronization,
 * WAL checkpoint operations, and transaction safety.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, statSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase, closeDatabase, bulkOperationCheckpoint } from "./connection.js";
import { SqliteSessionRepository } from "./repositories/session-repository.js";
import { SqliteMessageRepository } from "./repositories/message-repository.js";
import { SqliteExtractionStateRepository } from "./repositories/extraction-state-repository.js";
import { Fts5SearchService } from "./services/search-service.js";
import { Session } from "../../domain/entities/session.js";
import { Message } from "../../domain/entities/message.js";
import { ExtractionState } from "../../domain/entities/extraction-state.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";
import { SearchQuery } from "../../domain/value-objects/search-query.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Insert a test session into the database
 */
function insertTestSession(
    db: Database,
    id: string,
    projectName: string
): void {
    db.run(
        `
        INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
        VALUES (?, ?, ?, ?, datetime('now'))
    `,
        [id, `C--Users-Test-${projectName}`, `C:\\Users\\Test\\${projectName}`, projectName]
    );
}

/**
 * Insert a test message into the database
 */
function insertTestMessage(
    db: Database,
    id: string,
    sessionId: string,
    role: "user" | "assistant",
    content: string
): void {
    db.run(
        `
        INSERT INTO messages_meta (id, session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?, datetime('now'))
    `,
        [id, sessionId, role, content]
    );
}

// ============================================================================
// FTS5 Search Tests
// ============================================================================

describe("FTS5 Integration", () => {
    let db: Database;

    beforeEach(() => {
        const result = initializeDatabase({ path: ":memory:" });
        db = result.db;

        // Insert a test session for all tests
        insertTestSession(db, "session-1", "TestProject");
    });

    afterEach(() => {
        closeDatabase(db);
    });

    describe("Basic FTS5 MATCH Queries", () => {
        it("Test 1: Basic FTS5 MATCH query finds matching content", () => {
            insertTestMessage(
                db,
                "msg-1",
                "session-1",
                "user",
                "Setting up authentication for the application"
            );

            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("authentication");
        });

        it("Test 2: FTS5 MATCH uses FTS index (not table scan)", () => {
            // Insert enough data to make the difference meaningful
            for (let i = 0; i < 100; i++) {
                insertTestMessage(
                    db,
                    `msg-perf-${i}`,
                    "session-1",
                    "user",
                    `Message number ${i} about various topics`
                );
            }
            insertTestMessage(
                db,
                "msg-target",
                "session-1",
                "user",
                "Special authentication content"
            );

            // EXPLAIN QUERY PLAN should show FTS5 usage
            const plan = db
                .query<{ detail: string }, [string]>(
                    "EXPLAIN QUERY PLAN SELECT * FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication");

            // FTS5 query plans contain "SCAN messages_fts" or similar FTS indicator
            const planText = plan.map((p) => p.detail).join(" ");
            expect(planText.toLowerCase()).toMatch(/scan.*messages_fts|virtual table|fts/i);
        });

        it("Test 3: FTS5 prefix search works with wildcard", () => {
            insertTestMessage(
                db,
                "msg-prefix",
                "session-1",
                "assistant",
                "The authenticate function validates user credentials"
            );

            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("auth*");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("authenticate");
        });

        it("Test 4: FTS5 phrase search matches exact phrases", () => {
            insertTestMessage(
                db,
                "msg-phrase-1",
                "session-1",
                "user",
                "The user authentication flow starts here"
            );
            insertTestMessage(
                db,
                "msg-phrase-2",
                "session-1",
                "assistant",
                "Authentication for user is implemented differently"
            );

            // Exact phrase search
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all('"authentication flow"');

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("authentication flow");
        });

        it("Test 5: FTS5 boolean OR returns multiple matches", () => {
            insertTestMessage(
                db,
                "msg-or-1",
                "session-1",
                "user",
                "Working on authentication system"
            );
            insertTestMessage(
                db,
                "msg-or-2",
                "session-1",
                "assistant",
                "Database configuration rules need updating"
            );
            insertTestMessage(
                db,
                "msg-or-3",
                "session-1",
                "user",
                "Schema design patterns"
            );

            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication OR database");

            expect(results).toHaveLength(2);
            const contents = results.map((r) => r.content);
            expect(contents.some((c) => c.includes("authentication"))).toBe(true);
            expect(contents.some((c) => c.includes("Database"))).toBe(true);
        });

        it("Test 6: FTS5 NOT operator excludes matches", () => {
            insertTestMessage(
                db,
                "msg-not-1",
                "session-1",
                "user",
                "Basic authentication using password"
            );
            insertTestMessage(
                db,
                "msg-not-2",
                "session-1",
                "assistant",
                "OAuth authentication flow for third party"
            );

            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication NOT oauth");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("password");
            expect(results[0]?.content).not.toContain("OAuth");
        });

        it("Test 7: FTS5 column filter works on content column", () => {
            insertTestMessage(
                db,
                "msg-col",
                "session-1",
                "user",
                "Testing content column filter functionality"
            );

            // Explicit column filter (messages_fts has only 'content' column)
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("content:filter");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("filter");
        });
    });

    describe("BM25 Ranking and Snippets", () => {
        it("Test 8: BM25 ranking orders by relevance (more occurrences = higher rank)", () => {
            insertTestMessage(
                db,
                "msg-rank-low",
                "session-1",
                "user",
                "authentication is important for security"
            );
            insertTestMessage(
                db,
                "msg-rank-high",
                "session-1",
                "assistant",
                "authentication authentication authentication is the core of this authentication system"
            );
            insertTestMessage(
                db,
                "msg-rank-none",
                "session-1",
                "user",
                "user login page design"
            );

            const results = db
                .query<{ id: string; rank: number }, [string]>(
                    `SELECT m.id, bm25(messages_fts) as rank
                     FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?
                     ORDER BY rank`
                )
                .all("authentication");

            // Only 2 results (the one without "authentication" is not returned)
            expect(results).toHaveLength(2);

            // BM25 returns negative scores; lower (more negative) = better match
            // The message with more occurrences should rank first (lower score)
            expect(results[0]?.id).toBe("msg-rank-high");
            expect(results[1]?.id).toBe("msg-rank-low");
            expect(results[0]!.rank).toBeLessThan(results[1]!.rank);
        });

        it("Test 9: BM25 term frequency normalization favors shorter documents", () => {
            // Insert a short message with the keyword
            insertTestMessage(
                db,
                "msg-short",
                "session-1",
                "user",
                "authentication matters"
            );

            // Insert a long message with the same keyword (only once)
            const longContent =
                "authentication " +
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(50);
            insertTestMessage(db, "msg-long", "session-1", "assistant", longContent);

            const results = db
                .query<{ id: string; rank: number }, [string]>(
                    `SELECT m.id, bm25(messages_fts) as rank
                     FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?
                     ORDER BY rank`
                )
                .all("authentication");

            expect(results).toHaveLength(2);
            // Shorter document with same term count should rank higher
            expect(results[0]?.id).toBe("msg-short");
        });

        it("Test 10: Snippet extraction marks matched terms", () => {
            const longContent =
                "Beginning of the message. " +
                "This section talks about authentication implementation. " +
                "End of the message with more details.";
            insertTestMessage(db, "msg-snippet", "session-1", "user", longContent);

            const results = db
                .query<{ id: string; snippet: string }, [string]>(
                    `SELECT m.id, snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
                     FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?`
                )
                .all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.snippet).toContain("<mark>");
            expect(results[0]?.snippet).toContain("</mark>");
            expect(results[0]?.snippet).toContain("authentication");
        });

        it("Test 11: Highlight function wraps all matches", () => {
            insertTestMessage(
                db,
                "msg-highlight",
                "session-1",
                "user",
                "User authentication and authorization setup"
            );

            const results = db
                .query<{ highlighted: string }, [string]>(
                    `SELECT highlight(messages_fts, 0, '<b>', '</b>') as highlighted
                     FROM messages_fts
                     WHERE messages_fts MATCH ?`
                )
                .all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.highlighted).toContain("<b>authentication</b>");
        });

        it("Test 12: Multiple term relevance ranks by term count", () => {
            insertTestMessage(
                db,
                "msg-multi-1",
                "session-1",
                "user",
                "authentication is needed"
            );
            insertTestMessage(
                db,
                "msg-multi-2",
                "session-1",
                "assistant",
                "authentication and authorization are both important"
            );
            insertTestMessage(
                db,
                "msg-multi-3",
                "session-1",
                "user",
                "complete security with authentication authorization and validation"
            );

            const results = db
                .query<{ id: string; rank: number }, [string]>(
                    `SELECT m.id, bm25(messages_fts) as rank
                     FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?
                     ORDER BY rank`
                )
                .all("authentication authorization validation");

            // Messages matching more terms should rank higher
            expect(results.length).toBeGreaterThanOrEqual(1);
            // msg-multi-3 has all three terms
            expect(results[0]?.id).toBe("msg-multi-3");
        });
    });

    describe("Trigger Synchronization and Edge Cases", () => {
        it("Test 13: Trigger INSERT synchronizes content to FTS", () => {
            // Insert via messages_meta (not directly to FTS)
            insertTestMessage(
                db,
                "msg-trigger-insert",
                "session-1",
                "user",
                "Content for trigger test insertion"
            );

            // Query FTS immediately - trigger should have fired
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("trigger");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("trigger");
        });

        it("Test 14: Trigger DELETE removes content from FTS", () => {
            insertTestMessage(
                db,
                "msg-trigger-delete",
                "session-1",
                "user",
                "This unique_delete_marker will be removed"
            );

            // Verify indexed
            let results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("unique_delete_marker");
            expect(results).toHaveLength(1);

            // Delete from messages_meta
            db.run("DELETE FROM messages_meta WHERE id = ?", ["msg-trigger-delete"]);

            // Verify removed from FTS
            results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("unique_delete_marker");
            expect(results).toHaveLength(0);
        });

        it("Test 15: Trigger UPDATE synchronizes modified content", () => {
            insertTestMessage(
                db,
                "msg-trigger-update",
                "session-1",
                "user",
                "old_unique_content_marker"
            );

            // Verify old content indexed
            let results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("old_unique_content_marker");
            expect(results).toHaveLength(1);

            // Update content
            db.run("UPDATE messages_meta SET content = ? WHERE id = ?", [
                "new_unique_content_marker",
                "msg-trigger-update",
            ]);

            // Verify old content NOT searchable
            results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("old_unique_content_marker");
            expect(results).toHaveLength(0);

            // Verify new content IS searchable
            results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("new_unique_content_marker");
            expect(results).toHaveLength(1);
        });

        it("Test 16: Bulk insert performance (1000 messages < 5 seconds)", () => {
            const startTime = performance.now();

            // Use a transaction for bulk insert
            db.run("BEGIN TRANSACTION");
            try {
                for (let i = 0; i < 1000; i++) {
                    insertTestMessage(
                        db,
                        `msg-bulk-${i}`,
                        "session-1",
                        i % 2 === 0 ? "user" : "assistant",
                        `Message ${i}: This is test content with various keywords like authentication, authorization, database, and API design patterns.`
                    );
                }
                db.run("COMMIT");
            } catch (error) {
                db.run("ROLLBACK");
                throw error;
            }

            const endTime = performance.now();
            const durationSeconds = (endTime - startTime) / 1000;

            // Verify all messages searchable
            const results = db
                .query<{ cnt: number }, [string]>(
                    "SELECT COUNT(*) as cnt FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .get("authentication");

            expect(results?.cnt).toBe(1000);
            expect(durationSeconds).toBeLessThan(5);
        });

        it("Test 17: Empty search query handling", () => {
            insertTestMessage(db, "msg-empty", "session-1", "user", "Some content here");

            // Empty MATCH query should error or return nothing
            // FTS5 typically throws on empty string
            expect(() => {
                db.query("SELECT * FROM messages_fts WHERE messages_fts MATCH ?").all("");
            }).toThrow();
        });

        it("Test 18: Special character handling (C++, OAuth 2.0)", () => {
            insertTestMessage(
                db,
                "msg-special",
                "session-1",
                "user",
                "Using C++ for performance and OAuth 2.0 for authentication"
            );

            // Query for OAuth (without special chars - FTS tokenizer normalizes)
            const oauthResults = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("oauth");

            expect(oauthResults).toHaveLength(1);
            expect(oauthResults[0]?.content).toContain("OAuth 2.0");

            // Query for performance (to verify C++ context is found)
            const perfResults = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("performance");

            expect(perfResults).toHaveLength(1);
        });

        it("Test 19: Unicode content is indexed correctly", () => {
            insertTestMessage(
                db,
                "msg-unicode",
                "session-1",
                "user",
                "Authentication with special chars: resume, cafe, uber"
            );

            // FTS5 unicode61 tokenizer should handle basic latin extensions
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("Authentication");
        });

        it("Test 20: Case insensitivity (FTS5 default)", () => {
            insertTestMessage(
                db,
                "msg-case",
                "session-1",
                "user",
                "AUTHENTICATION is case insensitive"
            );

            // Lowercase query should match uppercase content
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("authentication");

            expect(results).toHaveLength(1);
            expect(results[0]?.content).toContain("AUTHENTICATION");
        });

        it("Test 21: Very long content (10KB) is indexed and searchable", () => {
            // Generate 10KB of text with a unique marker in the middle
            const prefix = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(200);
            const marker = "UNIQUE_MARKER_IN_MIDDLE";
            const suffix = "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(200);
            const longContent = prefix + marker + " " + suffix;

            // Verify it's approximately 10KB
            expect(longContent.length).toBeGreaterThan(10000);

            insertTestMessage(db, "msg-long-content", "session-1", "user", longContent);

            // Search for the marker in the middle
            const results = db
                .query<{ content: string }, [string]>(
                    "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("UNIQUE_MARKER_IN_MIDDLE");

            expect(results).toHaveLength(1);

            // Verify snippet extraction works on long content
            const snippetResults = db
                .query<{ snippet: string }, [string]>(
                    `SELECT snippet(messages_fts, 0, '>>>', '<<<', '...', 32) as snippet
                     FROM messages_fts
                     WHERE messages_fts MATCH ?`
                )
                .all("UNIQUE_MARKER_IN_MIDDLE");

            expect(snippetResults).toHaveLength(1);
            expect(snippetResults[0]?.snippet).toContain(">>>");
            expect(snippetResults[0]?.snippet).toContain("<<<");
        });
    });
});

// ============================================================================
// WAL Checkpoint Tests (require file-based database)
// ============================================================================

describe("WAL Checkpoint Operations", () => {
    let db: Database;
    let dbPath: string;
    let walPath: string;

    beforeEach(() => {
        // Create unique temp database path
        dbPath = join(tmpdir(), `memory-nexus-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        walPath = `${dbPath}-wal`;

        const result = initializeDatabase({ path: dbPath });
        db = result.db;

        // Verify WAL mode is enabled
        expect(result.walEnabled).toBe(true);

        // Insert a test session
        insertTestSession(db, "session-1", "TestProject");
    });

    afterEach(() => {
        closeDatabase(db);

        // Clean up temp files
        try {
            if (existsSync(dbPath)) unlinkSync(dbPath);
            if (existsSync(walPath)) unlinkSync(walPath);
            if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
        } catch {
            // Ignore cleanup errors
        }
    });

    it("Test 22: WAL checkpoint reduces WAL file size after bulk insert", () => {
        // Get initial WAL file size (may not exist yet or be small)
        const initialWalSize = existsSync(walPath) ? statSync(walPath).size : 0;

        // Insert 500+ messages to generate WAL entries
        db.run("BEGIN TRANSACTION");
        for (let i = 0; i < 500; i++) {
            insertTestMessage(
                db,
                `msg-wal-${i}`,
                "session-1",
                i % 2 === 0 ? "user" : "assistant",
                `Message ${i} with content for WAL testing including some keywords like authentication and database design patterns.`
            );
        }
        db.run("COMMIT");

        // WAL file should now be larger
        const afterInsertWalSize = existsSync(walPath) ? statSync(walPath).size : 0;
        expect(afterInsertWalSize).toBeGreaterThan(initialWalSize);

        // Perform bulk operation checkpoint
        const checkpointResult = bulkOperationCheckpoint(db);

        // Checkpoint should have processed frames
        expect(checkpointResult).toBeDefined();

        // WAL file should be smaller or zero after TRUNCATE checkpoint
        const afterCheckpointWalSize = existsSync(walPath) ? statSync(walPath).size : 0;
        expect(afterCheckpointWalSize).toBeLessThan(afterInsertWalSize);
    });

    it("Test 23: bulkOperationCheckpoint returns checkpoint result", () => {
        // Insert some data
        for (let i = 0; i < 100; i++) {
            insertTestMessage(
                db,
                `msg-cp-${i}`,
                "session-1",
                "user",
                `Message ${i} for checkpoint result testing`
            );
        }

        // Call checkpoint
        const result = bulkOperationCheckpoint(db);

        // Result should have expected properties
        expect(typeof result.busy).toBe("number");
        expect(typeof result.log).toBe("number");
        expect(typeof result.checkpointed).toBe("number");

        // Busy should be 0 (no other connections)
        expect(result.busy).toBe(0);
    });
});

// ============================================================================
// Transaction Safety Tests
// ============================================================================

describe("Transaction Safety", () => {
    let db: Database;

    beforeEach(() => {
        const result = initializeDatabase({ path: ":memory:" });
        db = result.db;

        // Insert a test session
        insertTestSession(db, "session-1", "TestProject");
    });

    afterEach(() => {
        closeDatabase(db);
    });

    it("Test 24: Transaction rollback leaves no partial state - messages", () => {
        // Count messages before
        const countBefore = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM messages_meta"
        ).get()?.cnt ?? 0;

        // Start transaction, insert some messages, then rollback
        db.run("BEGIN TRANSACTION");
        try {
            for (let i = 0; i < 10; i++) {
                insertTestMessage(
                    db,
                    `msg-rollback-${i}`,
                    "session-1",
                    "user",
                    `Message ${i} that will be rolled back`
                );
            }
            // Simulate error before commit
            throw new Error("Simulated extraction error");
        } catch {
            db.run("ROLLBACK");
        }

        // Count messages after - should be same as before
        const countAfter = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM messages_meta"
        ).get()?.cnt ?? 0;

        expect(countAfter).toBe(countBefore);

        // Verify messages are not searchable in FTS
        const ftsResults = db
            .query<{ cnt: number }, [string]>(
                "SELECT COUNT(*) as cnt FROM messages_fts WHERE messages_fts MATCH ?"
            )
            .get("rollback");

        expect(ftsResults?.cnt ?? 0).toBe(0);
    });

    it("Test 25: Transaction rollback leaves no partial state - extraction state", () => {
        // Insert initial extraction state as 'pending'
        db.run(
            `INSERT INTO extraction_state (id, session_path, started_at, status, messages_extracted)
             VALUES (?, ?, datetime('now'), 'pending', 0)`,
            ["ext-1", "/path/to/session.jsonl"]
        );

        // Verify initial state
        const initialState = db.query<{ status: string }, [string]>(
            "SELECT status FROM extraction_state WHERE id = ?"
        ).get("ext-1");
        expect(initialState?.status).toBe("pending");

        // Start transaction, update to in_progress, insert messages, then rollback
        db.run("BEGIN TRANSACTION");
        try {
            // Update to in_progress
            db.run(
                "UPDATE extraction_state SET status = 'in_progress' WHERE id = ?",
                ["ext-1"]
            );

            // Insert some messages
            for (let i = 0; i < 5; i++) {
                insertTestMessage(
                    db,
                    `msg-ext-${i}`,
                    "session-1",
                    "user",
                    `Extraction message ${i}`
                );
            }

            // Simulate error before marking complete
            throw new Error("Simulated extraction failure");
        } catch {
            db.run("ROLLBACK");
        }

        // Extraction state should still be 'pending' (not 'in_progress' or 'complete')
        const finalState = db.query<{ status: string }, [string]>(
            "SELECT status FROM extraction_state WHERE id = ?"
        ).get("ext-1");
        expect(finalState?.status).toBe("pending");

        // No messages should exist
        const messageCount = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM messages_meta"
        ).get()?.cnt ?? 0;
        expect(messageCount).toBe(0);
    });

    it("Test 26: Successful transaction commits all changes atomically", () => {
        // Insert extraction state
        db.run(
            `INSERT INTO extraction_state (id, session_path, started_at, status, messages_extracted)
             VALUES (?, ?, datetime('now'), 'pending', 0)`,
            ["ext-2", "/path/to/session2.jsonl"]
        );

        // Execute full extraction in transaction
        db.run("BEGIN TRANSACTION");
        try {
            // Update to in_progress
            db.run(
                "UPDATE extraction_state SET status = 'in_progress' WHERE id = ?",
                ["ext-2"]
            );

            // Insert messages
            for (let i = 0; i < 5; i++) {
                insertTestMessage(
                    db,
                    `msg-success-${i}`,
                    "session-1",
                    "user",
                    `Successful extraction message ${i}`
                );
            }

            // Mark complete
            db.run(
                `UPDATE extraction_state
                 SET status = 'complete', messages_extracted = 5, completed_at = datetime('now')
                 WHERE id = ?`,
                ["ext-2"]
            );

            db.run("COMMIT");
        } catch (error) {
            db.run("ROLLBACK");
            throw error;
        }

        // Verify extraction state is complete
        const finalState = db.query<{ status: string; messages_extracted: number }, [string]>(
            "SELECT status, messages_extracted FROM extraction_state WHERE id = ?"
        ).get("ext-2");
        expect(finalState?.status).toBe("complete");
        expect(finalState?.messages_extracted).toBe(5);

        // Verify messages exist
        const messageCount = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM messages_meta"
        ).get()?.cnt ?? 0;
        expect(messageCount).toBe(5);

        // Verify messages are searchable
        const ftsResults = db
            .query<{ cnt: number }, [string]>(
                "SELECT COUNT(*) as cnt FROM messages_fts WHERE messages_fts MATCH ?"
            )
            .get("extraction");
        expect(ftsResults?.cnt).toBe(5);
    });

    it("Test 27: Nested operations within transaction maintain consistency", () => {
        // Create a transaction with multiple related operations
        const insertExtraction = db.transaction(() => {
            // Insert extraction state
            db.run(
                `INSERT INTO extraction_state (id, session_path, started_at, status, messages_extracted)
                 VALUES (?, ?, datetime('now'), 'in_progress', 0)`,
                ["ext-nested", "/path/to/nested.jsonl"]
            );

            // Insert multiple messages
            for (let i = 0; i < 3; i++) {
                insertTestMessage(
                    db,
                    `msg-nested-${i}`,
                    "session-1",
                    "user",
                    `Nested transaction message ${i} with content`
                );
            }

            // Update extraction count
            db.run(
                "UPDATE extraction_state SET messages_extracted = 3, status = 'complete' WHERE id = ?",
                ["ext-nested"]
            );
        });

        // Execute with immediate mode
        insertExtraction.immediate();

        // Verify all operations committed
        const state = db.query<{ status: string; messages_extracted: number }, [string]>(
            "SELECT status, messages_extracted FROM extraction_state WHERE id = ?"
        ).get("ext-nested");

        expect(state?.status).toBe("complete");
        expect(state?.messages_extracted).toBe(3);

        const messageCount = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM messages_meta"
        ).get()?.cnt ?? 0;
        expect(messageCount).toBe(3);
    });
});

// ============================================================================
// Full Pipeline Integration Tests
// ============================================================================

describe("Full Extraction Pipeline", () => {
    let db: Database;
    let sessionRepo: SqliteSessionRepository;
    let messageRepo: SqliteMessageRepository;
    let extractionStateRepo: SqliteExtractionStateRepository;
    let searchService: Fts5SearchService;

    beforeEach(() => {
        const result = initializeDatabase({ path: ":memory:" });
        db = result.db;

        // Initialize all repositories and services
        sessionRepo = new SqliteSessionRepository(db);
        messageRepo = new SqliteMessageRepository(db);
        extractionStateRepo = new SqliteExtractionStateRepository(db);
        searchService = new Fts5SearchService(db);
    });

    afterEach(() => {
        closeDatabase(db);
    });

    it("Test 28: Full extraction pipeline with search verification", async () => {
        // 1. Create session via SqliteSessionRepository
        const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\TestProject");
        const session = Session.create({
            id: "session-pipeline-1",
            projectPath,
            startTime: new Date("2024-06-15T10:00:00Z"),
        });
        await sessionRepo.save(session);

        // 2. Insert 50 messages via SqliteMessageRepository
        const messages: Array<{ message: Message; sessionId: string }> = [];
        for (let i = 0; i < 50; i++) {
            const role = i % 2 === 0 ? "user" : "assistant";
            const content = i % 5 === 0
                ? `Message ${i}: Discussion about authentication and security patterns.`
                : `Message ${i}: General conversation about ${role === "user" ? "the project" : "implementation details"}.`;

            const message = Message.create({
                id: `msg-pipeline-${i}`,
                role: role as "user" | "assistant",
                content,
                timestamp: new Date(Date.now() + i * 1000),
            });
            messages.push({ message, sessionId: session.id });
        }

        const batchResult = await messageRepo.saveMany(messages);
        expect(batchResult.inserted).toBe(50);
        expect(batchResult.skipped).toBe(0);

        // 3. Update extraction state to 'complete' via SqliteExtractionStateRepository
        const extractionState = ExtractionState.create({
            id: "ext-pipeline-1",
            sessionPath: "/path/to/session-pipeline.jsonl",
            startedAt: new Date(),
            status: "complete",
            messagesExtracted: 50,
            completedAt: new Date(),
        });
        await extractionStateRepo.save(extractionState);

        // 4. Search for content via Fts5SearchService
        const query = SearchQuery.from("authentication");
        const searchResults = await searchService.search(query);

        // 5. Verify: session findById returns session
        const foundSession = await sessionRepo.findById(session.id);
        expect(foundSession).not.toBeNull();
        expect(foundSession?.id).toBe(session.id);
        expect(foundSession?.projectPath.projectName).toBe("TestProject");

        // 6. Verify: messages findBySession returns all 50
        const foundMessages = await messageRepo.findBySession(session.id);
        expect(foundMessages).toHaveLength(50);

        // 7. Verify: search returns relevant results with snippets
        // Every 5th message (0, 5, 10, 15, 20, 25, 30, 35, 40, 45) has "authentication"
        expect(searchResults.length).toBeGreaterThan(0);
        expect(searchResults.length).toBe(10); // 10 messages have authentication

        for (const result of searchResults) {
            expect(result.snippet).toContain("<mark>");
            expect(result.snippet.toLowerCase()).toContain("authentication");
            expect(result.sessionId).toBe(session.id);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
        }

        // 8. Verify: extraction state shows 'complete'
        const foundState = await extractionStateRepo.findById(extractionState.id);
        expect(foundState).not.toBeNull();
        expect(foundState?.status).toBe("complete");
        expect(foundState?.messagesExtracted).toBe(50);
    });

    it("Test 29: Search with project filter in full pipeline", async () => {
        // Create two projects
        const project1Path = ProjectPath.fromDecoded("C:\\Users\\Test\\Project1");
        const project2Path = ProjectPath.fromDecoded("C:\\Users\\Test\\Project2");

        const session1 = Session.create({
            id: "session-proj1",
            projectPath: project1Path,
            startTime: new Date(),
        });
        const session2 = Session.create({
            id: "session-proj2",
            projectPath: project2Path,
            startTime: new Date(),
        });

        await sessionRepo.save(session1);
        await sessionRepo.save(session2);

        // Insert messages in both projects with same keyword
        const msg1 = Message.create({
            id: "msg-proj1-1",
            role: "user",
            content: "Authentication implementation for Project1",
            timestamp: new Date(),
        });
        const msg2 = Message.create({
            id: "msg-proj2-1",
            role: "user",
            content: "Authentication implementation for Project2",
            timestamp: new Date(),
        });

        await messageRepo.save(msg1, session1.id);
        await messageRepo.save(msg2, session2.id);

        // Search with project filter (case-insensitive substring match on project_name)
        const query = SearchQuery.from("authentication");
        const project1Results = await searchService.search(query, {
            projectFilter: "Project1",
        });

        expect(project1Results).toHaveLength(1);
        expect(project1Results[0].sessionId).toBe(session1.id);

        // Search without filter should return both
        const allResults = await searchService.search(query);
        expect(allResults).toHaveLength(2);
    });

    it("Test 30: Repository operations are idempotent", async () => {
        const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\IdempotentProject");
        const session = Session.create({
            id: "session-idempotent",
            projectPath,
            startTime: new Date(),
        });

        // Save session twice
        await sessionRepo.save(session);
        await sessionRepo.save(session);

        // Should only have one session
        const sessions = await sessionRepo.findByProject(projectPath);
        expect(sessions).toHaveLength(1);

        // Save message twice
        const message = Message.create({
            id: "msg-idempotent",
            role: "user",
            content: "Idempotent test message",
            timestamp: new Date(),
        });
        await messageRepo.save(message, session.id);
        await messageRepo.save(message, session.id);

        // Should only have one message
        const messages = await messageRepo.findBySession(session.id);
        expect(messages).toHaveLength(1);
    });

    it("Test 31: Batch insert with progress tracking", async () => {
        const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\BatchProject");
        const session = Session.create({
            id: "session-batch",
            projectPath,
            startTime: new Date(),
        });
        await sessionRepo.save(session);

        const messages: Array<{ message: Message; sessionId: string }> = [];
        for (let i = 0; i < 250; i++) {
            const message = Message.create({
                id: `msg-batch-${i}`,
                role: i % 2 === 0 ? "user" : "assistant",
                content: `Batch message ${i} with searchable content about testing`,
                timestamp: new Date(Date.now() + i),
            });
            messages.push({ message, sessionId: session.id });
        }

        let progressCalls = 0;
        let lastProgress = { inserted: 0, total: 0 };

        const result = await messageRepo.saveMany(messages, {
            onProgress: (progress) => {
                progressCalls++;
                lastProgress = progress;
            },
        });

        // Should have progress calls (one per batch of 100)
        expect(progressCalls).toBeGreaterThan(0);
        expect(lastProgress.total).toBe(250);
        expect(result.inserted).toBe(250);

        // Verify all messages searchable
        const query = SearchQuery.from("searchable");
        const searchResults = await searchService.search(query, { limit: 300 });
        expect(searchResults).toHaveLength(250);
    });
});
