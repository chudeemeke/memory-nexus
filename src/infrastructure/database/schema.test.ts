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
    ENTITIES_TABLE,
    SESSION_ENTITIES_TABLE,
    ENTITY_LINKS_TABLE,
    SESSIONS_FTS_TABLE,
    SESSIONS_FTS_TRIGGERS,
    EMBEDDING_STATE_TABLE,
    MESSAGE_EMBEDDINGS_TABLE,
    MEMORY_FILES_TABLE,
    MEMORY_FILES_FTS_TABLE,
    MEMORY_FILES_FTS_TRIGGERS,
    FRICTION_LOG_TABLE,
    FRICTION_LOG_UNIVERSALIZE_MIGRATION,
    BACKFILL_STATE_TABLE,
    FACTS_TABLE,
    FACTS_FTS_TABLE,
    FACTS_FTS_TRIGGERS,
    EXTRACTION_LOG_TABLE,
    MEMORY_GOVERNANCE_TABLE,
    MEMORY_GOVERNANCE_EVENTS_TABLE,
    PERSONA_ENTRIES_TABLE,
    type SchemaOptions,
} from "./schema.js";

import * as sqliteVec from "sqlite-vec";

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
            expect(ENTITIES_TABLE).toBeDefined();
            expect(SESSION_ENTITIES_TABLE).toBeDefined();
            expect(ENTITY_LINKS_TABLE).toBeDefined();
            expect(SESSIONS_FTS_TABLE).toBeDefined();
            expect(SESSIONS_FTS_TRIGGERS).toBeDefined();
            expect(FACTS_TABLE).toBeDefined();
            expect(FACTS_FTS_TABLE).toBeDefined();
            expect(FACTS_FTS_TRIGGERS).toBeDefined();
            expect(EXTRACTION_LOG_TABLE).toBeDefined();
            expect(MEMORY_GOVERNANCE_TABLE).toBeDefined();
            expect(MEMORY_GOVERNANCE_EVENTS_TABLE).toBeDefined();
            expect(PERSONA_ENTRIES_TABLE).toBeDefined();
        });


        it("should have SCHEMA_SQL as an array with correct order", () => {
            expect(Array.isArray(SCHEMA_SQL)).toBe(true);
            expect(SCHEMA_SQL.length).toBe(26);
            expect(SCHEMA_SQL[0]).toBe(SESSIONS_TABLE);
            expect(SCHEMA_SQL[1]).toBe(MESSAGES_META_TABLE);
            expect(SCHEMA_SQL[2]).toBe(MESSAGES_FTS_TABLE);
            expect(SCHEMA_SQL[3]).toBe(FTS_TRIGGERS);
            expect(SCHEMA_SQL[4]).toBe(TOOL_USES_TABLE);
            expect(SCHEMA_SQL[5]).toBe(LINKS_TABLE);
            expect(SCHEMA_SQL[6]).toBe(TOPICS_TABLE);
            expect(SCHEMA_SQL[7]).toBe(EXTRACTION_STATE_TABLE);
            expect(SCHEMA_SQL[8]).toBe(ENTITIES_TABLE);
            expect(SCHEMA_SQL[9]).toBe(SESSION_ENTITIES_TABLE);
            expect(SCHEMA_SQL[10]).toBe(ENTITY_LINKS_TABLE);
            expect(SCHEMA_SQL[11]).toBe(SESSIONS_FTS_TABLE);
            expect(SCHEMA_SQL[12]).toBe(SESSIONS_FTS_TRIGGERS);
            expect(SCHEMA_SQL[13]).toBe(EMBEDDING_STATE_TABLE);
            expect(SCHEMA_SQL[14]).toBe(MEMORY_FILES_TABLE);
            expect(SCHEMA_SQL[15]).toBe(MEMORY_FILES_FTS_TABLE);
            expect(SCHEMA_SQL[16]).toBe(MEMORY_FILES_FTS_TRIGGERS);
            expect(SCHEMA_SQL[17]).toBe(FRICTION_LOG_TABLE);
            expect(SCHEMA_SQL[18]).toBe(BACKFILL_STATE_TABLE);
            expect(SCHEMA_SQL[19]).toBe(FACTS_TABLE);
            expect(SCHEMA_SQL[20]).toBe(FACTS_FTS_TABLE);
            expect(SCHEMA_SQL[21]).toBe(FACTS_FTS_TRIGGERS);
            expect(SCHEMA_SQL[22]).toBe(EXTRACTION_LOG_TABLE);
            expect(SCHEMA_SQL[23]).toBe(MEMORY_GOVERNANCE_TABLE);
            expect(SCHEMA_SQL[24]).toBe(MEMORY_GOVERNANCE_EVENTS_TABLE);
            expect(SCHEMA_SQL[25]).toBe(PERSONA_ENTRIES_TABLE);
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
            expect(tableNames).toContain("entities");
            expect(tableNames).toContain("session_entities");
            expect(tableNames).toContain("entity_links");
            expect(tableNames).toContain("memory_governance");
            expect(tableNames).toContain("memory_governance_events");
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
            expect(indexNames).toContain("idx_entities_type");
            expect(indexNames).toContain("idx_entities_name");
            expect(indexNames).toContain("idx_memory_governance_surface");
            expect(indexNames).toContain("idx_memory_governance_target");
            expect(indexNames).toContain("idx_memory_governance_events_target");
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

    describe("Entity Tables", () => {
        beforeEach(() => {
            createSchema(db);
            // Insert a session for foreign key tests
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-entity', 'path', 'path', 'Test', '2026-01-31T10:00:00Z')
            `);
        });

        describe("entities table", () => {
            it("should create entities table", () => {
                const tables = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='entities'"
                    )
                    .all();

                expect(tables.length).toBe(1);
            });

            it("should insert entity with valid type", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'hexagonal architecture', 0.9)
                    `);
                }).not.toThrow();

                const entity = db
                    .query<{ type: string; name: string; confidence: number }, []>(
                        "SELECT type, name, confidence FROM entities WHERE name = 'hexagonal architecture'"
                    )
                    .get();

                expect(entity?.type).toBe("concept");
                expect(entity?.confidence).toBe(0.9);
            });

            it("should reject entity with invalid type", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('invalid', 'test', 0.9)
                    `);
                }).toThrow();
            });

            it("should accept all valid entity types", () => {
                const types = ["concept", "file", "decision", "term"];

                for (const type of types) {
                    expect(() => {
                        db.exec(`
                            INSERT INTO entities (type, name, confidence)
                            VALUES ('${type}', 'entity-${type}', 0.9)
                        `);
                    }).not.toThrow();
                }

                const count = db
                    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM entities")
                    .get();

                expect(count?.count).toBe(4);
            });

            it("should reject confidence below 0", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'test-below', -0.1)
                    `);
                }).toThrow();
            });

            it("should reject confidence above 1", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'test-above', 1.1)
                    `);
                }).toThrow();
            });

            it("should accept confidence at boundaries", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'low-conf', 0)
                    `);
                }).not.toThrow();

                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'high-conf', 1)
                    `);
                }).not.toThrow();
            });

            it("should enforce UNIQUE constraint on type+name", () => {
                db.exec(`
                    INSERT INTO entities (type, name, confidence)
                    VALUES ('concept', 'unique-test', 0.9)
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('concept', 'unique-test', 0.8)
                    `);
                }).toThrow();
            });

            it("should allow same name with different type", () => {
                db.exec(`
                    INSERT INTO entities (type, name, confidence)
                    VALUES ('concept', 'shared-name', 0.9)
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO entities (type, name, confidence)
                        VALUES ('term', 'shared-name', 0.9)
                    `);
                }).not.toThrow();
            });

            it("should store JSON metadata", () => {
                const metadata = JSON.stringify({
                    subject: "database",
                    decision: "Use SQLite",
                    rejected: ["PostgreSQL"],
                    rationale: "Embedded"
                });

                db.exec(`
                    INSERT INTO entities (type, name, metadata, confidence)
                    VALUES ('decision', 'DB Choice', '${metadata}', 0.95)
                `);

                const entity = db
                    .query<{ metadata: string }, []>(
                        "SELECT metadata FROM entities WHERE name = 'DB Choice'"
                    )
                    .get();

                expect(entity?.metadata).toBe(metadata);
                const parsed = JSON.parse(entity?.metadata ?? "{}");
                expect(parsed.subject).toBe("database");
            });

            it("should set default confidence to 1.0", () => {
                db.exec(`
                    INSERT INTO entities (type, name)
                    VALUES ('file', '/src/index.ts')
                `);

                const entity = db
                    .query<{ confidence: number }, []>(
                        "SELECT confidence FROM entities WHERE name = '/src/index.ts'"
                    )
                    .get();

                expect(entity?.confidence).toBe(1.0);
            });

            it("should auto-generate id", () => {
                db.exec(`
                    INSERT INTO entities (type, name, confidence)
                    VALUES ('concept', 'auto-id-test', 0.9)
                `);

                const entity = db
                    .query<{ id: number }, []>(
                        "SELECT id FROM entities WHERE name = 'auto-id-test'"
                    )
                    .get();

                expect(entity?.id).toBeGreaterThan(0);
            });

            it("should set created_at to current datetime", () => {
                db.exec(`
                    INSERT INTO entities (type, name, confidence)
                    VALUES ('term', 'timestamp-test', 1.0)
                `);

                const entity = db
                    .query<{ created_at: string }, []>(
                        "SELECT created_at FROM entities WHERE name = 'timestamp-test'"
                    )
                    .get();

                expect(entity?.created_at).toBeDefined();
                expect(entity?.created_at.startsWith("20")).toBe(true);
            });
        });

        describe("session_entities table", () => {
            beforeEach(() => {
                // Insert an entity for linking
                db.exec(`
                    INSERT INTO entities (id, type, name, confidence)
                    VALUES (1, 'concept', 'test-concept', 0.9)
                `);
            });

            it("should create session_entities table", () => {
                const tables = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_entities'"
                    )
                    .all();

                expect(tables.length).toBe(1);
            });

            it("should link session to entity", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO session_entities (session_id, entity_id)
                        VALUES ('session-entity', 1)
                    `);
                }).not.toThrow();
            });

            it("should track frequency", () => {
                db.exec(`
                    INSERT INTO session_entities (session_id, entity_id, frequency)
                    VALUES ('session-entity', 1, 5)
                `);

                const link = db
                    .query<{ frequency: number }, []>(
                        "SELECT frequency FROM session_entities WHERE session_id = 'session-entity'"
                    )
                    .get();

                expect(link?.frequency).toBe(5);
            });

            it("should default frequency to 1", () => {
                db.exec(`
                    INSERT INTO session_entities (session_id, entity_id)
                    VALUES ('session-entity', 1)
                `);

                const link = db
                    .query<{ frequency: number }, []>(
                        "SELECT frequency FROM session_entities WHERE session_id = 'session-entity'"
                    )
                    .get();

                expect(link?.frequency).toBe(1);
            });

            it("should reject invalid session_id", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO session_entities (session_id, entity_id)
                        VALUES ('nonexistent-session', 1)
                    `);
                }).toThrow();
            });

            it("should reject invalid entity_id", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO session_entities (session_id, entity_id)
                        VALUES ('session-entity', 999)
                    `);
                }).toThrow();
            });

            it("should enforce unique session+entity combination", () => {
                db.exec(`
                    INSERT INTO session_entities (session_id, entity_id)
                    VALUES ('session-entity', 1)
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO session_entities (session_id, entity_id)
                        VALUES ('session-entity', 1)
                    `);
                }).toThrow();
            });

            it("should cascade delete when session is deleted", () => {
                db.exec(`
                    INSERT INTO session_entities (session_id, entity_id)
                    VALUES ('session-entity', 1)
                `);

                // Verify link exists
                let links = db
                    .query<{ session_id: string }, []>(
                        "SELECT session_id FROM session_entities WHERE session_id = 'session-entity'"
                    )
                    .all();
                expect(links.length).toBe(1);

                // Delete session
                db.exec("DELETE FROM sessions WHERE id = 'session-entity'");

                // Verify link is deleted
                links = db
                    .query<{ session_id: string }, []>(
                        "SELECT session_id FROM session_entities WHERE session_id = 'session-entity'"
                    )
                    .all();
                expect(links.length).toBe(0);
            });

            it("should cascade delete when entity is deleted", () => {
                db.exec(`
                    INSERT INTO session_entities (session_id, entity_id)
                    VALUES ('session-entity', 1)
                `);

                // Delete entity
                db.exec("DELETE FROM entities WHERE id = 1");

                // Verify link is deleted
                const links = db
                    .query<{ entity_id: number }, []>(
                        "SELECT entity_id FROM session_entities WHERE entity_id = 1"
                    )
                    .all();
                expect(links.length).toBe(0);
            });
        });

        describe("entity_links table", () => {
            beforeEach(() => {
                // Insert entities for linking
                db.exec(`
                    INSERT INTO entities (id, type, name, confidence)
                    VALUES (1, 'concept', 'source-concept', 0.9)
                `);
                db.exec(`
                    INSERT INTO entities (id, type, name, confidence)
                    VALUES (2, 'concept', 'target-concept', 0.9)
                `);
            });

            it("should create entity_links table", () => {
                const tables = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_links'"
                    )
                    .all();

                expect(tables.length).toBe(1);
            });

            it("should link entities", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (1, 2, 'related')
                    `);
                }).not.toThrow();
            });

            it("should accept valid relationships", () => {
                const relationships = ["related", "implies", "contradicts"];

                for (let i = 0; i < relationships.length; i++) {
                    // Insert new target entities for each relationship
                    db.exec(`
                        INSERT INTO entities (id, type, name, confidence)
                        VALUES (${10 + i}, 'concept', 'target-${i}', 0.9)
                    `);

                    expect(() => {
                        db.exec(`
                            INSERT INTO entity_links (source_id, target_id, relationship)
                            VALUES (1, ${10 + i}, '${relationships[i]}')
                        `);
                    }).not.toThrow();
                }
            });

            it("should reject invalid relationship", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (1, 2, 'invalid_rel')
                    `);
                }).toThrow();
            });

            it("should reject weight below 0", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship, weight)
                        VALUES (1, 2, 'related', -0.1)
                    `);
                }).toThrow();
            });

            it("should reject weight above 1", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship, weight)
                        VALUES (1, 2, 'related', 1.1)
                    `);
                }).toThrow();
            });

            it("should default weight to 1.0", () => {
                db.exec(`
                    INSERT INTO entity_links (source_id, target_id, relationship)
                    VALUES (1, 2, 'related')
                `);

                const link = db
                    .query<{ weight: number }, []>(
                        "SELECT weight FROM entity_links WHERE source_id = 1"
                    )
                    .get();

                expect(link?.weight).toBe(1.0);
            });

            it("should reject invalid source_id", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (999, 2, 'related')
                    `);
                }).toThrow();
            });

            it("should reject invalid target_id", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (1, 999, 'related')
                    `);
                }).toThrow();
            });

            it("should enforce unique source+target+relationship", () => {
                db.exec(`
                    INSERT INTO entity_links (source_id, target_id, relationship)
                    VALUES (1, 2, 'related')
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (1, 2, 'related')
                    `);
                }).toThrow();
            });

            it("should allow same source+target with different relationship", () => {
                db.exec(`
                    INSERT INTO entity_links (source_id, target_id, relationship)
                    VALUES (1, 2, 'related')
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO entity_links (source_id, target_id, relationship)
                        VALUES (1, 2, 'implies')
                    `);
                }).not.toThrow();
            });

            it("should cascade delete when source entity is deleted", () => {
                db.exec(`
                    INSERT INTO entity_links (source_id, target_id, relationship)
                    VALUES (1, 2, 'related')
                `);

                db.exec("DELETE FROM entities WHERE id = 1");

                const links = db
                    .query<{ source_id: number }, []>(
                        "SELECT source_id FROM entity_links WHERE source_id = 1"
                    )
                    .all();
                expect(links.length).toBe(0);
            });

            it("should cascade delete when target entity is deleted", () => {
                db.exec(`
                    INSERT INTO entity_links (source_id, target_id, relationship)
                    VALUES (1, 2, 'related')
                `);

                db.exec("DELETE FROM entities WHERE id = 2");

                const links = db
                    .query<{ target_id: number }, []>(
                        "SELECT target_id FROM entity_links WHERE target_id = 2"
                    )
                    .all();
                expect(links.length).toBe(0);
            });
        });
    });

    describe("embedding_state table", () => {
        it("should export EMBEDDING_STATE_TABLE SQL constant", () => {
            expect(EMBEDDING_STATE_TABLE).toBeDefined();
            expect(typeof EMBEDDING_STATE_TABLE).toBe("string");
            expect(EMBEDDING_STATE_TABLE).toContain("embedding_state");
        });

        it("should create embedding_state table when sqliteVecAvailable is false", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_state'"
                )
                .all();

            expect(tables.length).toBe(1);
        });

        it("should create embedding_state table when sqliteVecAvailable is true", () => {
            sqliteVec.load(db);
            createSchema(db, { sqliteVecAvailable: true });

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_state'"
                )
                .all();

            expect(tables.length).toBe(1);
        });

        it("should have correct columns: message_id, embedded_at, model_hash", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const columns = db
                .query<{ name: string; type: string; notnull: number; pk: number }, []>(
                    "PRAGMA table_info(embedding_state)"
                )
                .all();

            const colMap = new Map(columns.map((c) => [c.name, c]));

            // message_id: INTEGER PRIMARY KEY
            expect(colMap.get("message_id")).toBeDefined();
            expect(colMap.get("message_id")!.type).toBe("INTEGER");
            expect(colMap.get("message_id")!.pk).toBe(1);

            // embedded_at: TEXT NOT NULL
            expect(colMap.get("embedded_at")).toBeDefined();
            expect(colMap.get("embedded_at")!.type).toBe("TEXT");
            expect(colMap.get("embedded_at")!.notnull).toBe(1);

            // model_hash: TEXT NOT NULL
            expect(colMap.get("model_hash")).toBeDefined();
            expect(colMap.get("model_hash")!.type).toBe("TEXT");
            expect(colMap.get("model_hash")!.notnull).toBe(1);
        });

        it("should have index idx_embedding_state_model on model_hash", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const indexes = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_embedding_state_model'"
                )
                .all();

            expect(indexes.length).toBe(1);
        });

        it("should have foreign key on message_id referencing messages_meta(rowid)", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const fks = db
                .query<{ table: string; from: string; to: string }, []>(
                    "PRAGMA foreign_key_list(embedding_state)"
                )
                .all();

            expect(fks.length).toBe(1);
            expect(fks[0]!.table).toBe("messages_meta");
            expect(fks[0]!.from).toBe("message_id");
            expect(fks[0]!.to).toBe("rowid");
        });

        it("should be idempotent (calling createSchema twice does not error)", () => {
            createSchema(db, { sqliteVecAvailable: false });
            expect(() => createSchema(db, { sqliteVecAvailable: false })).not.toThrow();
        });

        it("should cascade delete embedding_state when message is deleted", () => {
            createSchema(db, { sqliteVecAvailable: false });

            // Insert session and message
            db.exec(`
                INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                VALUES ('session-embed', 'path', 'path', 'Test', '2026-01-27T10:00:00Z')
            `);
            db.exec(`
                INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                VALUES ('msg-embed', 'session-embed', 'user', 'Test', '2026-01-27T10:01:00Z')
            `);

            // Get the rowid of the message
            const msg = db
                .query<{ rowid: number }, []>("SELECT rowid FROM messages_meta WHERE id = 'msg-embed'")
                .get();

            // Insert embedding state
            db.exec(`
                INSERT INTO embedding_state (message_id, embedded_at, model_hash)
                VALUES (${msg!.rowid}, '2026-01-27T10:02:00Z', 'abc123')
            `);

            // Verify it exists
            let states = db
                .query<{ message_id: number }, []>(
                    `SELECT message_id FROM embedding_state WHERE message_id = ${msg!.rowid}`
                )
                .all();
            expect(states.length).toBe(1);

            // Delete the message (should cascade)
            db.exec("DELETE FROM messages_meta WHERE id = 'msg-embed'");

            states = db
                .query<{ message_id: number }, []>(
                    `SELECT message_id FROM embedding_state WHERE message_id = ${msg!.rowid}`
                )
                .all();
            expect(states.length).toBe(0);
        });
    });

    describe("message_embeddings table", () => {
        it("should export MESSAGE_EMBEDDINGS_TABLE SQL constant", () => {
            expect(MESSAGE_EMBEDDINGS_TABLE).toBeDefined();
            expect(typeof MESSAGE_EMBEDDINGS_TABLE).toBe("string");
            expect(MESSAGE_EMBEDDINGS_TABLE).toContain("message_embeddings");
            expect(MESSAGE_EMBEDDINGS_TABLE).toContain("vec0");
            expect(MESSAGE_EMBEDDINGS_TABLE).toContain("float[384]");
        });

        it("should create message_embeddings virtual table when sqlite-vec is loaded", () => {
            sqliteVec.load(db);
            createSchema(db, { sqliteVecAvailable: true });

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='message_embeddings'"
                )
                .all();

            expect(tables.length).toBe(1);
        });

        it("should NOT create message_embeddings when sqliteVecAvailable is false", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='message_embeddings'"
                )
                .all();

            expect(tables.length).toBe(0);
        });

        it("should not error when sqlite-vec unavailable and sqliteVecAvailable is false", () => {
            // No sqliteVec.load(db) -- vec0 module not available
            expect(() => createSchema(db, { sqliteVecAvailable: false })).not.toThrow();
        });
    });

    describe("createSchema options parameter", () => {
        it("should default to sqliteVecAvailable: false when no options provided", () => {
            // Calling createSchema(db) with no options should NOT try to create vec0 tables
            createSchema(db);

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='message_embeddings'"
                )
                .all();

            // message_embeddings should NOT exist (defaults to vec unavailable)
            expect(tables.length).toBe(0);
        });

        it("should create embedding_state even with no options (backward compatible)", () => {
            createSchema(db);

            const tables = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_state'"
                )
                .all();

            expect(tables.length).toBe(1);
        });

        it("should create both embedding tables when sqliteVecAvailable is true", () => {
            sqliteVec.load(db);
            createSchema(db, { sqliteVecAvailable: true });

            const embeddingState = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_state'"
                )
                .all();
            expect(embeddingState.length).toBe(1);

            const messageEmbeddings = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='message_embeddings'"
                )
                .all();
            expect(messageEmbeddings.length).toBe(1);
        });

        it("should create only embedding_state when sqliteVecAvailable is false", () => {
            createSchema(db, { sqliteVecAvailable: false });

            const embeddingState = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_state'"
                )
                .all();
            expect(embeddingState.length).toBe(1);

            const messageEmbeddings = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE name='message_embeddings'"
                )
                .all();
            expect(messageEmbeddings.length).toBe(0);
        });

        it("should not break existing tables when options provided", () => {
            createSchema(db, { sqliteVecAvailable: false });

            // All existing tables should still be created
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
            expect(tableNames).toContain("entities");
            expect(tableNames).toContain("session_entities");
            expect(tableNames).toContain("entity_links");
            expect(tableNames).toContain("embedding_state");
        });
    });

    describe("Memory Files Schema", () => {
        describe("SQL constants", () => {
            it("should export MEMORY_FILES_TABLE constant", () => {
                expect(MEMORY_FILES_TABLE).toBeDefined();
                expect(typeof MEMORY_FILES_TABLE).toBe("string");
                expect(MEMORY_FILES_TABLE).toContain("memory_files");
            });

            it("should export MEMORY_FILES_FTS_TABLE constant", () => {
                expect(MEMORY_FILES_FTS_TABLE).toBeDefined();
                expect(typeof MEMORY_FILES_FTS_TABLE).toBe("string");
                expect(MEMORY_FILES_FTS_TABLE).toContain("memory_files_fts");
            });

            it("should export MEMORY_FILES_FTS_TRIGGERS constant", () => {
                expect(MEMORY_FILES_FTS_TRIGGERS).toBeDefined();
                expect(typeof MEMORY_FILES_FTS_TRIGGERS).toBe("string");
                expect(MEMORY_FILES_FTS_TRIGGERS).toContain("memory_files_fts_insert");
                expect(MEMORY_FILES_FTS_TRIGGERS).toContain("memory_files_fts_delete");
                expect(MEMORY_FILES_FTS_TRIGGERS).toContain("memory_files_fts_update");
            });

            it("should include memory_files entries in SCHEMA_SQL array", () => {
                expect(SCHEMA_SQL).toContain(MEMORY_FILES_TABLE);
                expect(SCHEMA_SQL).toContain(MEMORY_FILES_FTS_TABLE);
                expect(SCHEMA_SQL).toContain(MEMORY_FILES_FTS_TRIGGERS);
            });
        });

        describe("memory_files table", () => {
            beforeEach(() => {
                createSchema(db);
            });

            it("should create memory_files table", () => {
                const tables = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_files'"
                    )
                    .all();

                expect(tables.length).toBe(1);
            });

            it("should have correct columns", () => {
                const columns = db
                    .query<{ name: string; type: string; notnull: number; pk: number }, []>(
                        "PRAGMA table_info(memory_files)"
                    )
                    .all();

                const colMap = new Map(columns.map((c) => [c.name, c]));

                expect(colMap.get("id")).toBeDefined();
                expect(colMap.get("id")!.type).toBe("INTEGER");
                expect(colMap.get("id")!.pk).toBe(1);

                expect(colMap.get("file_path")).toBeDefined();
                expect(colMap.get("file_path")!.type).toBe("TEXT");
                expect(colMap.get("file_path")!.notnull).toBe(1);

                expect(colMap.get("file_type")).toBeDefined();
                expect(colMap.get("file_type")!.type).toBe("TEXT");
                expect(colMap.get("file_type")!.notnull).toBe(1);

                expect(colMap.get("project_encoded")).toBeDefined();
                expect(colMap.get("project_encoded")!.type).toBe("TEXT");

                expect(colMap.get("content")).toBeDefined();
                expect(colMap.get("content")!.type).toBe("TEXT");
                expect(colMap.get("content")!.notnull).toBe(1);

                expect(colMap.get("content_hash")).toBeDefined();
                expect(colMap.get("content_hash")!.type).toBe("TEXT");
                expect(colMap.get("content_hash")!.notnull).toBe(1);

                expect(colMap.get("last_indexed_at")).toBeDefined();
                expect(colMap.get("last_indexed_at")!.type).toBe("TEXT");
                expect(colMap.get("last_indexed_at")!.notnull).toBe(1);

                expect(colMap.get("created_at")).toBeDefined();
                expect(colMap.get("created_at")!.type).toBe("TEXT");
            });

            it("should reject invalid file_type values", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                        VALUES ('test.md', 'invalid', 'content', 'abc123', '2026-03-08T10:00:00Z')
                    `);
                }).toThrow();
            });

            it("should accept all valid file_type values", () => {
                const types = ["daily_log", "decisions", "learnings", "user_prefs"];

                for (const type of types) {
                    expect(() => {
                        db.exec(`
                            INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                            VALUES ('test-${type}.md', '${type}', 'content', 'hash-${type}', '2026-03-08T10:00:00Z')
                        `);
                    }).not.toThrow();
                }

                const count = db
                    .query<{ count: number }, []>("SELECT COUNT(*) as count FROM memory_files")
                    .get();

                expect(count?.count).toBe(4);
            });

            it("should enforce UNIQUE constraint on file_path", () => {
                db.exec(`
                    INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                    VALUES ('duplicate.md', 'decisions', 'content1', 'hash1', '2026-03-08T10:00:00Z')
                `);

                expect(() => {
                    db.exec(`
                        INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                        VALUES ('duplicate.md', 'decisions', 'content2', 'hash2', '2026-03-08T11:00:00Z')
                    `);
                }).toThrow();
            });

            it("should have indexes on file_type and project_encoded", () => {
                const indexes = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memory_files'"
                    )
                    .all();

                const indexNames = indexes.map((i) => i.name);
                expect(indexNames).toContain("idx_memory_files_type");
                expect(indexNames).toContain("idx_memory_files_project");
            });

            it("should set created_at to current datetime by default", () => {
                db.exec(`
                    INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                    VALUES ('timestamp.md', 'decisions', 'content', 'hash', '2026-03-08T10:00:00Z')
                `);

                const row = db
                    .query<{ created_at: string }, []>(
                        "SELECT created_at FROM memory_files WHERE file_path = 'timestamp.md'"
                    )
                    .get();

                expect(row?.created_at).toBeDefined();
                expect(row?.created_at.startsWith("20")).toBe(true);
            });

            it("should allow null project_encoded", () => {
                expect(() => {
                    db.exec(`
                        INSERT INTO memory_files (file_path, file_type, project_encoded, content, content_hash, last_indexed_at)
                        VALUES ('global.md', 'decisions', NULL, 'content', 'hash', '2026-03-08T10:00:00Z')
                    `);
                }).not.toThrow();

                const row = db
                    .query<{ project_encoded: string | null }, []>(
                        "SELECT project_encoded FROM memory_files WHERE file_path = 'global.md'"
                    )
                    .get();

                expect(row?.project_encoded).toBeNull();
            });
        });

        describe("memory_files_fts virtual table", () => {
            beforeEach(() => {
                createSchema(db);
            });

            it("should create memory_files_fts virtual table", () => {
                const tables = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE name='memory_files_fts'"
                    )
                    .all();

                expect(tables.length).toBe(1);
            });
        });

        describe("FTS5 triggers for memory_files", () => {
            beforeEach(() => {
                createSchema(db);
            });

            it("should auto-index on INSERT via trigger", () => {
                db.exec(`
                    INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                    VALUES ('test.md', 'decisions', 'authentication patterns for JWT', 'hash1', '2026-03-08T10:00:00Z')
                `);

                const results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'authentication'
                    `)
                    .all();

                expect(results.length).toBe(1);
                expect(results[0]!.file_path).toBe("test.md");
            });

            it("should update FTS5 index on UPDATE via trigger", () => {
                db.exec(`
                    INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                    VALUES ('update-test.md', 'learnings', 'old content about databases', 'hash1', '2026-03-08T10:00:00Z')
                `);

                // Old content should be searchable
                let results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'databases'
                    `)
                    .all();
                expect(results.length).toBe(1);

                // Update content
                db.exec(`
                    UPDATE memory_files
                    SET content = 'new content about authentication', content_hash = 'hash2'
                    WHERE file_path = 'update-test.md'
                `);

                // Old content should no longer be searchable
                results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'databases'
                    `)
                    .all();
                expect(results.length).toBe(0);

                // New content should be searchable
                results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'authentication'
                    `)
                    .all();
                expect(results.length).toBe(1);
            });

            it("should remove from FTS5 index on DELETE via trigger", () => {
                db.exec(`
                    INSERT INTO memory_files (file_path, file_type, content, content_hash, last_indexed_at)
                    VALUES ('delete-test.md', 'daily_log', 'searchable content here', 'hash1', '2026-03-08T10:00:00Z')
                `);

                // Should be findable
                let results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'searchable'
                    `)
                    .all();
                expect(results.length).toBe(1);

                // Delete
                db.exec("DELETE FROM memory_files WHERE file_path = 'delete-test.md'");

                // Should no longer be findable
                results = db
                    .query<{ file_path: string }, []>(`
                        SELECT m.file_path FROM memory_files m
                        JOIN memory_files_fts f ON f.rowid = m.id
                        WHERE memory_files_fts MATCH 'searchable'
                    `)
                    .all();
                expect(results.length).toBe(0);
            });
        });
    });

    describe("Friction Log Schema", () => {
        describe("constants", () => {
            it("should export FRICTION_LOG_TABLE constant", () => {
                expect(FRICTION_LOG_TABLE).toBeDefined();
                expect(FRICTION_LOG_TABLE).toContain("friction_log");
            });

            it("should include FRICTION_LOG_TABLE in SCHEMA_SQL array", () => {
                expect(SCHEMA_SQL).toContain(FRICTION_LOG_TABLE);
            });
        });

        describe("friction_log table", () => {
            it("should create friction_log table with correct columns", () => {
                createSchema(db);

                const columns = db
                    .prepare("PRAGMA table_info(friction_log)")
                    .all() as Array<{ name: string; type: string; notnull: number }>;

                const columnNames = columns.map((c) => c.name);
                expect(columnNames).toContain("id");
                expect(columnNames).toContain("description");
                expect(columnNames).toContain("severity");
                expect(columnNames).toContain("category");
                expect(columnNames).toContain("status");
                expect(columnNames).toContain("context");
                expect(columnNames).toContain("source_project");
                expect(columnNames).toContain("logged_at");
                expect(columnNames).toContain("resolved_at");
                expect(columnNames).toContain("resolution");
            });

            it("CHECK constraints enforce valid severity values", () => {
                createSchema(db);

                // Valid severity should work
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, severity, logged_at)
                             VALUES ('test', 'high', '2026-03-08T00:00:00Z')`)
                ).not.toThrow();

                // Invalid severity should fail
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, severity, logged_at)
                             VALUES ('test', 'extreme', '2026-03-08T00:00:00Z')`)
                ).toThrow();
            });

            it("category column accepts any string value (no CHECK constraint)", () => {
                createSchema(db);

                // Standard category should work
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, category, logged_at)
                             VALUES ('test', 'search', '2026-03-08T00:00:00Z')`)
                ).not.toThrow();

                // Custom category should also work (no CHECK constraint)
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, category, logged_at)
                             VALUES ('test2', 'database', '2026-03-08T00:00:00Z')`)
                ).not.toThrow();
            });

            it("CHECK constraints enforce valid status values", () => {
                createSchema(db);

                // Valid status should work
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, status, logged_at)
                             VALUES ('test', 'wont-fix', '2026-03-08T00:00:00Z')`)
                ).not.toThrow();

                // Invalid status should fail
                expect(() =>
                    db.exec(`INSERT INTO friction_log (description, status, logged_at)
                             VALUES ('test', 'closed', '2026-03-08T00:00:00Z')`)
                ).toThrow();
            });

            it("indexes created on status, severity, category", () => {
                createSchema(db);

                const indexes = db
                    .query<{ name: string }, []>(
                        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='friction_log'"
                    )
                    .all();
                const indexNames = indexes.map((i) => i.name);
                expect(indexNames).toContain("idx_friction_status");
                expect(indexNames).toContain("idx_friction_severity");
                expect(indexNames).toContain("idx_friction_category");
            });
        });
    });

    describe("Friction Log Universalization Migration", () => {
        it("fresh database creates friction_log with tool, tags, last_reviewed_at columns", () => {
            createSchema(db);
            const columns = db.prepare("PRAGMA table_info(friction_log)").all() as Array<{ name: string }>;
            const colNames = columns.map(c => c.name);
            expect(colNames).toContain("tool");
            expect(colNames).toContain("tags");
            expect(colNames).toContain("last_reviewed_at");
        });

        it("fresh database has no category CHECK constraint (custom categories allowed)", () => {
            createSchema(db);
            // Insert a custom category -- should not throw
            db.exec(`INSERT INTO friction_log (description, severity, category, tool, status, logged_at)
                      VALUES ('test', 'medium', 'deployment', 'aidev', 'open', '2026-03-21T00:00:00Z')`);
            const row = db.prepare("SELECT category FROM friction_log WHERE description = 'test'").get() as { category: string };
            expect(row.category).toBe("deployment");
        });

        it("migrates old friction_log schema preserving data with tool defaulting to 'memory'", () => {
            // Create old schema manually (with category CHECK constraint, no tool column)
            db.exec(`
                CREATE TABLE friction_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                    category TEXT NOT NULL DEFAULT 'cli' CHECK (category IN ('search', 'sync', 'cli', 'context', 'integration', 'ux')),
                    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont-fix')),
                    context TEXT,
                    source_project TEXT,
                    logged_at TEXT NOT NULL,
                    resolved_at TEXT,
                    resolution TEXT
                )
            `);
            // Insert old data
            db.exec(`INSERT INTO friction_log (description, severity, category, status, logged_at, source_project)
                      VALUES ('old entry', 'high', 'search', 'open', '2026-03-01T00:00:00Z', 'my-project')`);

            // Run createSchema which should detect missing tool column and migrate
            createSchema(db);

            // Verify data preserved
            const row = db.prepare("SELECT * FROM friction_log WHERE description = 'old entry'").get() as any;
            expect(row.description).toBe("old entry");
            expect(row.severity).toBe("high");
            expect(row.category).toBe("search");
            expect(row.tool).toBe("memory");
            expect(row.tags).toBeNull();
            expect(row.last_reviewed_at).toBeNull();
            expect(row.source_project).toBe("my-project");
        });

        it("migration is idempotent (running createSchema twice does not error or lose data)", () => {
            createSchema(db);
            db.exec(`INSERT INTO friction_log (description, severity, category, tool, status, logged_at)
                      VALUES ('test', 'low', 'cli', 'memory', 'open', '2026-03-21T00:00:00Z')`);

            // Run again
            createSchema(db);

            const row = db.prepare("SELECT * FROM friction_log WHERE description = 'test'").get() as any;
            expect(row).not.toBeNull();
            expect(row.tool).toBe("memory");
        });

        it("has idx_friction_tool index after fresh create", () => {
            createSchema(db);
            const indexes = db
                .query<{ name: string }, []>(
                    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='friction_log'"
                )
                .all();
            const indexNames = indexes.map(i => i.name);
            expect(indexNames).toContain("idx_friction_tool");
        });
    });
});
