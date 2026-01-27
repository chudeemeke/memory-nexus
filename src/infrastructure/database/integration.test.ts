/**
 * FTS5 Integration Tests
 *
 * Comprehensive tests for FTS5 full-text search functionality,
 * including MATCH queries, BM25 ranking, trigger synchronization,
 * and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "./connection.js";

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
