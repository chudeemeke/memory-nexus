/**
 * Database Schema Definitions
 *
 * SQLite schema with FTS5 full-text search support.
 * Uses external content pattern for efficient FTS5 indexing.
 */

import type { Database } from "bun:sqlite";

/**
 * Sessions table - stores session metadata
 */
export const SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_path_encoded TEXT NOT NULL,
    project_path_decoded TEXT NOT NULL,
    project_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    message_count INTEGER DEFAULT 0,
    summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path_encoded);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
`;

/**
 * Messages metadata table - content table for FTS5
 * Uses explicit rowid for FTS5 external content linkage
 */
export const MESSAGES_META_TABLE = `
CREATE TABLE IF NOT EXISTS messages_meta (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    tool_use_ids TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages_meta(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages_meta(timestamp);
`;

/**
 * Messages FTS5 virtual table - external content pattern
 * References messages_meta for content storage
 */
export const MESSAGES_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content=messages_meta,
    content_rowid=rowid,
    tokenize='porter unicode61'
);
`;

/**
 * FTS5 synchronization triggers
 * Keep FTS5 index in sync with messages_meta content
 */
export const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages_meta BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages_meta BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages_meta BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`;

/**
 * Tool uses table - stores tool invocation records
 */
export const TOOL_USES_TABLE = `
CREATE TABLE IF NOT EXISTS tool_uses (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    input TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
    result TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(name);
`;

/**
 * Links table - graph-like relationships between entities
 */
export const LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK (source_type IN ('session', 'message', 'topic')),
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('session', 'message', 'topic')),
    target_id TEXT NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('mentions', 'related_to', 'continues')),
    weight REAL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
    UNIQUE(source_type, source_id, target_type, target_id, relationship)
);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
`;

/**
 * Topics table - stores extracted topics
 */
export const TOPICS_TABLE = `
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);
`;

/**
 * Extraction state table - tracks sync progress
 */
export const EXTRACTION_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS extraction_state (
    id TEXT PRIMARY KEY,
    session_path TEXT UNIQUE NOT NULL,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'complete', 'error')),
    completed_at TEXT,
    messages_extracted INTEGER DEFAULT 0,
    error_message TEXT,
    file_mtime TEXT,
    file_size INTEGER
);
CREATE INDEX IF NOT EXISTS idx_extraction_session_path ON extraction_state(session_path);
CREATE INDEX IF NOT EXISTS idx_extraction_status ON extraction_state(status);
`;

/**
 * Entities table - stores extracted metadata (concepts, files, decisions, terms)
 */
export const ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('concept', 'file', 'decision', 'term')),
    name TEXT NOT NULL,
    metadata TEXT,
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(type, name)
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
`;

/**
 * Session-Entity links - many-to-many relationship with frequency tracking
 */
export const SESSION_ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS session_entities (
    session_id TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    frequency INTEGER DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, entity_id)
);
`;

/**
 * Entity-Entity links - cross-project relationships between entities
 */
export const ENTITY_LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS entity_links (
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('related', 'implies', 'contradicts')),
    weight REAL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
    FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id, relationship)
);
`;

/**
 * Sessions FTS5 virtual table - for summary full-text search
 *
 * Uses standalone FTS5 table (not external content) because summaries
 * are only added/updated after session ends, and we want FTS5 to manage
 * its own content for simplicity.
 */
export const SESSIONS_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    session_id,
    summary,
    tokenize='porter unicode61'
);
`;

/**
 * Sessions FTS5 synchronization triggers
 * Keep sessions_fts index in sync with sessions summary updates
 *
 * Note: INSERT trigger does not index since summary is NULL on insert.
 * Only UPDATE trigger handles FTS indexing when summary is set.
 */
export const SESSIONS_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS sessions_fts_update AFTER UPDATE OF summary ON sessions
WHEN new.summary IS NOT NULL AND new.summary != ''
BEGIN
    DELETE FROM sessions_fts WHERE session_id = old.id;
    INSERT INTO sessions_fts(session_id, summary) VALUES (new.id, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS sessions_fts_delete AFTER DELETE ON sessions BEGIN
    DELETE FROM sessions_fts WHERE session_id = old.id;
END;
`;

/**
 * Complete schema SQL statements in dependency order
 *
 * Order matters:
 * 1. sessions (no dependencies)
 * 2. messages_meta (depends on sessions)
 * 3. messages_fts (depends on messages_meta)
 * 4. FTS triggers (depend on both messages tables)
 * 5. tool_uses (depends on sessions)
 * 6. links (no foreign keys)
 * 7. topics (no dependencies)
 * 8. extraction_state (no dependencies)
 * 9. entities (no dependencies)
 * 10. session_entities (depends on sessions, entities)
 * 11. entity_links (depends on entities)
 * 12. sessions_fts (depends on sessions)
 * 13. sessions_fts triggers (depends on sessions, sessions_fts)
 */
export const SCHEMA_SQL: readonly string[] = [
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
];

/**
 * Check if FTS5 extension is available in the database
 *
 * @param db - SQLite database instance
 * @returns true if FTS5 is supported, false otherwise
 */
export function checkFts5Support(db: Database): boolean {
    try {
        db.exec("CREATE VIRTUAL TABLE _fts5_check USING fts5(test)");
        db.exec("DROP TABLE _fts5_check");
        return true;
    } catch {
        return false;
    }
}

/**
 * Create all schema tables in the database
 *
 * Executes all DDL statements in dependency order.
 * Safe to call multiple times (uses IF NOT EXISTS).
 *
 * @param db - SQLite database instance
 * @throws Error if FTS5 is not supported or SQL execution fails
 */
export function createSchema(db: Database): void {
    // Verify FTS5 support before creating schema
    if (!checkFts5Support(db)) {
        throw new Error(
            "FTS5 extension is not available. " +
            "Ensure you are using Bun with FTS5 support enabled."
        );
    }

    // Execute all schema statements in order
    for (const sql of SCHEMA_SQL) {
        db.exec(sql);
    }
}
