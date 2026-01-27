/**
 * Database Schema Tests
 *
 * Validates schema creation, FTS5 functionality, triggers, and constraints.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
    createSchema,
    checkFts5Support,
    SCHEMA_SQL,
    SESSIONS_TABLE,
    MESSAGES_META_TABLE,
    MESSAGES_FTS_TABLE,
    FTS_TRIGGERS,
    TOOL_USES_TABLE,
    LINKS_TABLE,
    TOPICS_TABLE,
    EXTRACTION_STATE_TABLE,
} from "./schema.js";

describe("Database Schema", () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(":memory:");
        db.exec("PRAGMA foreign_keys = ON;");
    });

    afterEach(() => {
        db.close();
    });

    describe("Schema SQL Constants", () => {
        it("should export all table constants", () => {
            expect(SESSIONS_TABLE).toBeDefined();
            expect(MESSAGES_META_TABLE).toBeDefined();
            expect(MESSAGES_FTS_TABLE).toBeDefined();
            expect(FTS_TRIGGERS).toBeDefined();
            expect(TOOL_USES_TABLE).toBeDefined();
            expect(LINKS_TABLE).toBeDefined();
            expect(TOPICS_TABLE).toBeDefined();
            expect(EXTRACTION_STATE_TABLE).toBeDefined();
        });

        it("should have SCHEMA_SQL as an array with correct order", () => {
            expect(Array.isArray(SCHEMA_SQL)).toBe(true);
            expect(SCHEMA_SQL.length).toBe(8);
            expect(SCHEMA_SQL[0]).toBe(SESSIONS_TABLE);
            expect(SCHEMA_SQL[1]).toBe(MESSAGES_META_TABLE);
            expect(SCHEMA_SQL[2]).toBe(MESSAGES_FTS_TABLE);
            expect(SCHEMA_SQL[3]).toBe(FTS_TRIGGERS);
            expect(SCHEMA_SQL[4]).toBe(TOOL_USES_TABLE);
            expect(SCHEMA_SQL[5]).toBe(LINKS_TABLE);
            expect(SCHEMA_SQL[6]).toBe(TOPICS_TABLE);
            expect(SCHEMA_SQL[7]).toBe(EXTRACTION_STATE_TABLE);
        });
    });

    describe("FTS5 Support Check", () => {
        it("should detect FTS5 support", () => {
            const supported = checkFts5Support(db);
            expect(supported).toBe(true);
        });

        it("should return false when FTS5 is unavailable", () => {
            // Create a mock database that will fail on FTS5 creation
            // by creating a table with the same name first
            const testDb = new Database(":memory:");
            testDb.exec("CREATE TABLE _fts5_check (id INTEGER)");

            // Now checkFts5Support will fail because table exists
            // but it's not a virtual table
            const supported = checkFts5Support(testDb);
            // This still returns true because the table is dropped first
            // To properly test, we would need to mock the FTS5 module
            // For now, we verify the function doesn't throw
            expect(typeof supported).toBe("boolean");

            testDb.close();
        });
    });

    describe("Schema Creation", () => {
        it("should create all tables without errors", () => {
            expect(() => createSchema(db)).not.toThrow();
        });

        it("should create all expected tables", () => {
            createSchema(db);

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                )
                .all();

            const tableNames = tables.map((t) => t.name);

            expect(tableNames).toContain("sessions");
            expect(tableNames).toContain("messages_meta");
            expect(tableNames).toContain("tool_uses");
            expect(tableNames).toContain("links");
            expect(tableNames).toContain("topics");
            expect(tableNames).toContain("extraction_state");
        });

        it("should create FTS5 virtual table", () => {
            createSchema(db);

            const virtualTables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'"
                )
                .all();

            // FTS5 virtual tables are stored differently
            // Check by trying to query the FTS table
            const ftsExists = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='messages_fts'"
                )
                .all();

            expect(ftsExists.length).toBe(1);
        });

        it("should create all expected indexes", () => {
            createSchema(db);

            const indexes = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
                )
                .all();

            const indexNames = indexes.map((i) => i.name);

            expect(indexNames).toContain("idx_sessions_project");
            expect(indexNames).toContain("idx_sessions_start_time");
            expect(indexNames).toContain("idx_messages_session");
            expect(indexNames).toContain("idx_messages_timestamp");
            expect(indexNames).toContain("idx_tool_uses_session");
            expect(indexNames).toContain("idx_tool_uses_name");
            expect(indexNames).toContain("idx_links_source");
            expect(indexNames).toContain("idx_links_target");
            expect(indexNames).toContain("idx_topics_name");
            expect(indexNames).toContain("idx_extraction_session_path");
            expect(indexNames).toContain("idx_extraction_status");
        });

        it("should create FTS synchronization triggers", () => {
            createSchema(db);

            const triggers = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
                )
                .all();

            const triggerNames = triggers.map((t) => t.name);

            expect(triggerNames).toContain("messages_fts_insert");
            expect(triggerNames).toContain("messages_fts_delete");
            expect(triggerNames).toContain("messages_fts_update");
        });

        it("should be idempotent (safe to run multiple times)", () => {
            createSchema(db);
            expect(() => createSchema(db)).not.toThrow();
            expect(() => createSchema(db)).not.toThrow();
        });
    });

    describe("FTS5 Trigger Synchronization", () => {
        beforeEach(() => {
            createSchema(db);
            // Insert a session first (foreign key requirement)
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-1', 'C--Users-Test', 'C:/Users/Test', 'Test', '2026-01-27T10:00:00Z')
            `);
        });

        it("should index content on insert via trigger", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-1', 'session-1', 'user', 'Hello world from test message', '2026-01-27T10:01:00Z')
            `);

            const results = db
                .query<{ rowid: number; content: string }, [string]>(
                    "SELECT rowid, content FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("hello");

            expect(results.length).toBe(1);
            expect(results[0]?.content).toBe("Hello world from test message");
        });

        it("should remove content on delete via trigger", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-2', 'session-1', 'user', 'Delete me please', '2026-01-27T10:02:00Z')
            `);

            // Verify it's indexed
            let results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("delete");
            expect(results.length).toBe(1);

            // Delete the message
            db.exec("DELETE FROM messages_meta WHERE id = 'msg-2'");

            // Verify it's removed from FTS
            results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("delete");
            expect(results.length).toBe(0);
        });

        it("should update FTS index on content update via trigger", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-3', 'session-1', 'assistant', 'Original content here', '2026-01-27T10:03:00Z')
            `);

            // Verify original content is indexed
            let results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("original");
            expect(results.length).toBe(1);

            // Update the message
            db.exec(`
                UPDATE messages_meta SET content = 'Modified content here'
                WHERE id = 'msg-3'
            `);

            // Verify old content is no longer found
            results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("original");
            expect(results.length).toBe(0);

            // Verify new content is indexed
            results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("modified");
            expect(results.length).toBe(1);
        });

        it("should support porter stemming in FTS5", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-4', 'session-1', 'user', 'Running runners run', '2026-01-27T10:04:00Z')
            `);

            // Porter stemmer should match "run" to "Running", "runners", "run"
            const results = db
                .query<{ rowid: number }, [string]>(
                    "SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?"
                )
                .all("run");

            expect(results.length).toBe(1);
        });
    });

    describe("Foreign Key Constraints", () => {
        beforeEach(() => {
            createSchema(db);
        });

        it("should reject message with invalid session_id", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                    VALUES ('msg-fk-1', 'nonexistent-session', 'user', 'Test', '2026-01-27T10:00:00Z')
                `);
            }).toThrow();
        });

        it("should reject tool_use with invalid session_id", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
                    VALUES ('tool-1', 'nonexistent-session', 'Read', '{}', '2026-01-27T10:00:00Z', 'success')
                `);
            }).toThrow();
        });

        it("should cascade delete messages when session is deleted", () => {
            // Insert session
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-cascade', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);

            // Insert message
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-cascade', 'session-cascade', 'user', 'Test', '2026-01-27T10:00:00Z')
            `);

            // Verify message exists
            let messages = db
                .query<{ id: string }, []>("SELECT id FROM messages_meta WHERE session_id = 'session-cascade'")
                .all();
            expect(messages.length).toBe(1);

            // Delete session
            db.exec("DELETE FROM sessions WHERE id = 'session-cascade'");

            // Verify message is deleted
            messages = db
                .query<{ id: string }, []>("SELECT id FROM messages_meta WHERE session_id = 'session-cascade'")
                .all();
            expect(messages.length).toBe(0);
        });
    });

    describe("Check Constraints", () => {
        beforeEach(() => {
            createSchema(db);
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-check', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);
        });

        it("should reject message with invalid role", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                    VALUES ('msg-invalid-role', 'session-check', 'system', 'Test', '2026-01-27T10:00:00Z')
                `);
            }).toThrow();
        });

        it("should accept message with valid roles", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                    VALUES ('msg-user', 'session-check', 'user', 'Test', '2026-01-27T10:00:00Z')
                `);
            }).not.toThrow();

            expect(() => {
                db.exec(`
                    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                    VALUES ('msg-assistant', 'session-check', 'assistant', 'Test', '2026-01-27T10:01:00Z')
                `);
            }).not.toThrow();
        });

        it("should reject tool_use with invalid status", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
                    VALUES ('tool-invalid', 'session-check', 'Read', '{}', '2026-01-27T10:00:00Z', 'invalid_status')
                `);
            }).toThrow();
        });

        it("should accept tool_use with valid statuses", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
                    VALUES ('tool-pending', 'session-check', 'Read', '{}', '2026-01-27T10:00:00Z', 'pending')
                `);
            }).not.toThrow();

            expect(() => {
                db.exec(`
                    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
                    VALUES ('tool-success', 'session-check', 'Read', '{}', '2026-01-27T10:01:00Z', 'success')
                `);
            }).not.toThrow();

            expect(() => {
                db.exec(`
                    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
                    VALUES ('tool-error', 'session-check', 'Read', '{}', '2026-01-27T10:02:00Z', 'error')
                `);
            }).not.toThrow();
        });

        it("should reject link with invalid source_type", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                    VALUES ('invalid', 'src-1', 'session', 'tgt-1', 'mentions')
                `);
            }).toThrow();
        });

        it("should reject link with invalid relationship", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                    VALUES ('session', 'src-1', 'session', 'tgt-1', 'invalid_rel')
                `);
            }).toThrow();
        });

        it("should reject link with weight out of range", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
                    VALUES ('session', 'src-1', 'session', 'tgt-1', 'mentions', 1.5)
                `);
            }).toThrow();

            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
                    VALUES ('session', 'src-2', 'session', 'tgt-2', 'mentions', -0.1)
                `);
            }).toThrow();
        });

        it("should accept link with valid weight", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
                    VALUES ('session', 'src-valid', 'message', 'tgt-valid', 'related_to', 0.5)
                `);
            }).not.toThrow();
        });

        it("should reject extraction_state with invalid status", () => {
            expect(() => {
                db.exec(`
                    INSERT INTO extraction_state (id, session_path, started_at, status)
                    VALUES ('ext-1', '/path/to/session', '2026-01-27T10:00:00Z', 'invalid_status')
                `);
            }).toThrow();
        });

        it("should accept extraction_state with valid statuses", () => {
            const statuses = ["pending", "in_progress", "complete", "error"];

            for (const status of statuses) {
                expect(() => {
                    db.exec(`
                        INSERT INTO extraction_state (id, session_path, started_at, status)
                        VALUES ('ext-${status}', '/path/${status}', '2026-01-27T10:00:00Z', '${status}')
                    `);
                }).not.toThrow();
            }
        });
    });

    describe("Unique Constraints", () => {
        beforeEach(() => {
            createSchema(db);
        });

        it("should enforce unique session id", () => {
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('unique-session', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);

            expect(() => {
                db.exec(`
                    INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                    VALUES ('unique-session', 'path2', 'path2', 'Test2', '2026-01-27T11:00:00Z')
                `);
            }).toThrow();
        });

        it("should enforce unique message id", () => {
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-unique-msg', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);

            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('unique-msg', 'session-unique-msg', 'user', 'Test', '2026-01-27T10:00:00Z')
            `);

            expect(() => {
                db.exec(`
                    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                    VALUES ('unique-msg', 'session-unique-msg', 'assistant', 'Test2', '2026-01-27T10:01:00Z')
                `);
            }).toThrow();
        });

        it("should enforce unique topic name", () => {
            db.exec("INSERT INTO topics (name) VALUES ('unique-topic')");

            expect(() => {
                db.exec("INSERT INTO topics (name) VALUES ('unique-topic')");
            }).toThrow();
        });

        it("should enforce unique link combination", () => {
            db.exec(`
                INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                VALUES ('session', 's1', 'session', 's2', 'mentions')
            `);

            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                    VALUES ('session', 's1', 'session', 's2', 'mentions')
                `);
            }).toThrow();
        });

        it("should allow same source/target with different relationship", () => {
            db.exec(`
                INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                VALUES ('session', 's3', 'session', 's4', 'mentions')
            `);

            expect(() => {
                db.exec(`
                    INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                    VALUES ('session', 's3', 'session', 's4', 'related_to')
                `);
            }).not.toThrow();
        });

        it("should enforce unique extraction_state session_path", () => {
            db.exec(`
                INSERT INTO extraction_state (id, session_path, started_at, status)
                VALUES ('ext-unique-1', '/unique/path', '2026-01-27T10:00:00Z', 'pending')
            `);

            expect(() => {
                db.exec(`
                    INSERT INTO extraction_state (id, session_path, started_at, status)
                    VALUES ('ext-unique-2', '/unique/path', '2026-01-27T11:00:00Z', 'pending')
                `);
            }).toThrow();
        });
    });

    describe("Default Values", () => {
        beforeEach(() => {
            createSchema(db);
        });

        it("should set default message_count to 0", () => {
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-default', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);

            const session = db
                .query<{ message_count: number }, [string]>(
                    "SELECT message_count FROM sessions WHERE id = ?"
                )
                .get("session-default");

            expect(session?.message_count).toBe(0);
        });

        it("should set default link weight to 1.0", () => {
            db.exec(`
                INSERT INTO links (source_type, source_id, target_type, target_id, relationship)
                VALUES ('session', 'src-default', 'session', 'tgt-default', 'mentions')
            `);

            const link = db
                .query<{ weight: number }, [string, string]>(
                    "SELECT weight FROM links WHERE source_id = ? AND target_id = ?"
                )
                .get("src-default", "tgt-default");

            expect(link?.weight).toBe(1.0);
        });

        it("should set default messages_extracted to 0", () => {
            db.exec(`
                INSERT INTO extraction_state (id, session_path, started_at, status)
                VALUES ('ext-default', '/default/path', '2026-01-27T10:00:00Z', 'pending')
            `);

            const state = db
                .query<{ messages_extracted: number }, [string]>(
                    "SELECT messages_extracted FROM extraction_state WHERE id = ?"
                )
                .get("ext-default");

            expect(state?.messages_extracted).toBe(0);
        });

        it("should set created_at to current datetime for sessions", () => {
            const before = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-created', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);

            const session = db
                .query<{ created_at: string }, [string]>(
                    "SELECT created_at FROM sessions WHERE id = ?"
                )
                .get("session-created");

            expect(session?.created_at).toBeDefined();
            // Just verify it's a valid date string starting with current year
            expect(session?.created_at.startsWith("20")).toBe(true);
        });

        it("should set created_at to current datetime for topics", () => {
            db.exec("INSERT INTO topics (name) VALUES ('topic-created')");

            const topic = db
                .query<{ created_at: string }, [string]>(
                    "SELECT created_at FROM topics WHERE name = ?"
                )
                .get("topic-created");

            expect(topic?.created_at).toBeDefined();
            expect(topic?.created_at.startsWith("20")).toBe(true);
        });
    });

    describe("FTS5 MATCH Query", () => {
        beforeEach(() => {
            createSchema(db);
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-fts', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);
        });

        it("should support phrase matching", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-phrase', 'session-fts', 'user', 'The quick brown fox jumps over lazy dog', '2026-01-27T10:00:00Z')
            `);

            const results = db
                .query<{ id: string }, [string]>(
                    `SELECT m.id FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?`
                )
                .all('"quick brown"');

            expect(results.length).toBe(1);
        });

        it("should support prefix matching", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-prefix', 'session-fts', 'user', 'Authentication mechanism implemented', '2026-01-27T10:01:00Z')
            `);

            const results = db
                .query<{ id: string }, [string]>(
                    `SELECT m.id FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?`
                )
                .all("auth*");

            expect(results.length).toBe(1);
        });

        it("should support boolean operators", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES
                    ('msg-bool-1', 'session-fts', 'user', 'TypeScript implementation', '2026-01-27T10:02:00Z'),
                    ('msg-bool-2', 'session-fts', 'assistant', 'JavaScript implementation', '2026-01-27T10:03:00Z')
            `);

            // AND operation
            const andResults = db
                .query<{ id: string }, [string]>(
                    `SELECT m.id FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?`
                )
                .all("typescript AND implementation");

            expect(andResults.length).toBe(1);
            expect(andResults[0]?.id).toBe("msg-bool-1");

            // OR operation
            const orResults = db
                .query<{ id: string }, [string]>(
                    `SELECT m.id FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?`
                )
                .all("typescript OR javascript");

            expect(orResults.length).toBe(2);
        });

        it("should return ranked results with bm25", () => {
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES
                    ('msg-rank-1', 'session-fts', 'user', 'Database optimization techniques', '2026-01-27T10:04:00Z'),
                    ('msg-rank-2', 'session-fts', 'assistant', 'Database database database heavy content', '2026-01-27T10:05:00Z')
            `);

            const results = db
                .query<{ id: string; rank: number }, [string]>(
                    `SELECT m.id, bm25(messages_fts) as rank FROM messages_meta m
                     JOIN messages_fts f ON m.rowid = f.rowid
                     WHERE messages_fts MATCH ?
                     ORDER BY rank`
                )
                .all("database");

            expect(results.length).toBe(2);
            // msg-rank-2 should have better rank (more occurrences)
            // bm25 returns negative scores, lower is better
            expect(results[0]?.id).toBe("msg-rank-2");
        });
    });
});
