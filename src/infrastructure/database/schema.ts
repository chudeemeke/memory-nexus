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
 * Embedding state table - tracks which messages have been embedded
 * and with which model, for incremental embedding and re-embedding detection.
 *
 * Always created regardless of sqlite-vec availability (regular SQL table).
 */
export const EMBEDDING_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS embedding_state (
    message_id INTEGER PRIMARY KEY,
    embedded_at TEXT NOT NULL,
    model_hash TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages_meta(rowid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_embedding_state_model ON embedding_state(model_hash);
`;

/**
 * Message embeddings vec0 virtual table - stores vector embeddings for messages.
 *
 * Only created when sqlite-vec extension is loaded (sqliteVecAvailable: true).
 * Uses 384-dimensional float vectors matching all-MiniLM-L6-v2 default model.
 */
export const MESSAGE_EMBEDDINGS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
    embedding float[384]
);
`;

/**
 * Migration: Add model_name column to embedding_state.
 *
 * The model_name stores the human-readable model identifier (e.g., "Xenova/all-MiniLM-L6-v2")
 * alongside the model_hash. Required for user-facing prompts like "Model changed from X to Y"
 * where X and Y must be readable model names, not opaque hex hashes.
 *
 * Uses ALTER TABLE with DEFAULT '' so existing rows (if any) get an empty string,
 * and new rows always store the model name explicitly.
 */
export const EMBEDDING_STATE_ADD_MODEL_NAME = `
ALTER TABLE embedding_state ADD COLUMN model_name TEXT NOT NULL DEFAULT '';
`;

/**
 * Memory files table - stores indexed legacy markdown sidecar files
 */
export const MEMORY_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS memory_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('daily_log', 'decisions', 'learnings', 'user_prefs')),
    project_encoded TEXT,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_indexed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_files_type ON memory_files(file_type);
CREATE INDEX IF NOT EXISTS idx_memory_files_project ON memory_files(project_encoded);
`;

/**
 * Memory files FTS5 virtual table - external content pattern
 * References memory_files for content storage
 */
export const MEMORY_FILES_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_files_fts USING fts5(
    content,
    content=memory_files,
    content_rowid=id,
    tokenize='porter unicode61'
);
`;

/**
 * Memory files FTS5 synchronization triggers
 * Keep memory_files_fts index in sync with memory_files content.
 * Follows the same pattern as FTS_TRIGGERS for messages_fts.
 */
export const MEMORY_FILES_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS memory_files_fts_insert AFTER INSERT ON memory_files BEGIN
    INSERT INTO memory_files_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_files_fts_delete AFTER DELETE ON memory_files BEGIN
    INSERT INTO memory_files_fts(memory_files_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_files_fts_update AFTER UPDATE ON memory_files BEGIN
    INSERT INTO memory_files_fts(memory_files_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO memory_files_fts(rowid, content) VALUES (new.id, new.content);
END;
`;

/**
 * Friction log table - stores friction entries for tool self-improvement
 */
export const FRICTION_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS friction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT NOT NULL DEFAULT 'cli',
    tool TEXT NOT NULL DEFAULT 'memory',
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont-fix')),
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT,
    last_reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_friction_status ON friction_log(status);
CREATE INDEX IF NOT EXISTS idx_friction_severity ON friction_log(severity);
CREATE INDEX IF NOT EXISTS idx_friction_category ON friction_log(category);
CREATE INDEX IF NOT EXISTS idx_friction_tool ON friction_log(tool);
`;

/**
 * Migration: Universalize friction_log table.
 *
 * Recreates friction_log with new columns (tool, tags, last_reviewed_at)
 * and removes the category CHECK constraint. Preserves existing data
 * with tool defaulting to 'memory'.
 */
export const FRICTION_LOG_UNIVERSALIZE_MIGRATION = `
CREATE TABLE friction_log_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT NOT NULL DEFAULT 'cli',
    tool TEXT NOT NULL DEFAULT 'memory',
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont-fix')),
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT,
    last_reviewed_at TEXT
);
INSERT INTO friction_log_new (id, description, severity, category, tool, tags, status, context, source_project, logged_at, resolved_at, resolution, last_reviewed_at)
SELECT id, description, severity, category, 'memory', NULL, status, context, source_project, logged_at, resolved_at, resolution, NULL
FROM friction_log;
DROP TABLE friction_log;
ALTER TABLE friction_log_new RENAME TO friction_log;
CREATE INDEX IF NOT EXISTS idx_friction_status ON friction_log(status);
CREATE INDEX IF NOT EXISTS idx_friction_severity ON friction_log(severity);
CREATE INDEX IF NOT EXISTS idx_friction_category ON friction_log(category);
CREATE INDEX IF NOT EXISTS idx_friction_tool ON friction_log(tool);
`;

/**
 * Backfill state table - tracks which sessions have been backfilled
 *
 * Enables idempotent backfill: processed sessions are skipped on re-run.
 * No foreign keys to sessions table (session_id is text reference only).
 */
export const BACKFILL_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS backfill_state (
    session_id TEXT PRIMARY KEY,
    backfilled_at TEXT NOT NULL,
    daily_log_path TEXT NOT NULL,
    success INTEGER DEFAULT 1,
    error_message TEXT
);
`;

/**
 * Facts table - derived projection of the plain-text event log.
 */
export const FACTS_TABLE = `
CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('decision', 'learning', 'preference', 'friction', 'observation', 'supersedence')),
    project TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    observed_at TEXT NOT NULL,
    superseded_at TEXT,
    superseded_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_facts_uuid ON facts(uuid);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts(project);
CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);
`;

/**
 * Facts FTS5 virtual table - external content pattern.
 * References facts table for content storage.
 */
export const FACTS_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    content,
    content=facts,
    content_rowid=id,
    tokenize='porter unicode61'
);
`;

/**
 * Facts FTS5 synchronization triggers.
 */
export const FACTS_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS facts_fts_insert AFTER INSERT ON facts BEGIN
    INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS facts_fts_delete AFTER DELETE ON facts BEGIN
    INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS facts_fts_update AFTER UPDATE ON facts BEGIN
    INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;
`;

/**
 * Extraction log table - tracks run logs of LLM fact extraction.
 */
export const EXTRACTION_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS extraction_log (
    session_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    facts_added INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    facts_superseded INTEGER DEFAULT 0,
    facts_skipped INTEGER DEFAULT 0,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_consumed INTEGER DEFAULT 0,
    extracted_at TEXT NOT NULL
);
`;

/**
 * Governance projection table - current consent/provenance/control state for
 * derived memory entries across all user-visible and agent-visible surfaces.
 */
export const MEMORY_GOVERNANCE_TABLE = `
CREATE TABLE IF NOT EXISTS memory_governance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    surface TEXT NOT NULL CHECK (surface IN ('fact', 'context', 'provider_egress', 'remote_sync', 'friction', 'evaluation', 'persona', 'graph', 'ranking', 'dream', 'projection')),
    target_id TEXT NOT NULL,
    project TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('project', 'workspace', 'global')),
    source_event_ids TEXT NOT NULL,
    transformation_method TEXT NOT NULL,
    actor TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    redaction_state TEXT NOT NULL CHECK (redaction_state IN ('none', 'redacted', 'quarantined')),
    consent_status TEXT NOT NULL CHECK (consent_status IN ('not_required', 'granted', 'denied', 'revoked')),
    consent_scopes TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'pending_review', 'suppressed', 'invalidated', 'expired')),
    status_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT,
    expires_at TEXT,
    last_event_id TEXT,
    UNIQUE(surface, target_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_governance_surface ON memory_governance(surface);
CREATE INDEX IF NOT EXISTS idx_memory_governance_project ON memory_governance(project);
CREATE INDEX IF NOT EXISTS idx_memory_governance_status ON memory_governance(status);
CREATE INDEX IF NOT EXISTS idx_memory_governance_target ON memory_governance(surface, target_id);
`;

/**
 * Governance event audit table - every replayed governance/consent control
 * event. This keeps manual controls inspectable without reading JSONL logs.
 */
export const MEMORY_GOVERNANCE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS memory_governance_events (
    event_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('governance', 'consent')),
    control TEXT NOT NULL,
    surface TEXT NOT NULL,
    target_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT,
    occurred_at TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_governance_events_target ON memory_governance_events(surface, target_id);
CREATE INDEX IF NOT EXISTS idx_memory_governance_events_occurred ON memory_governance_events(occurred_at);
`;

/**
 * Persona/profile projection table.
 *
 * Derived from canonical fact events and friction patterns. Governance for
 * whether entries may be used lives in memory_governance(surface='persona').
 */
export const PERSONA_ENTRIES_TABLE = `
CREATE TABLE IF NOT EXISTS persona_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('preference', 'procedure', 'correction', 'decision_pattern', 'friction_pattern')),
    content TEXT NOT NULL,
    project TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('project', 'workspace', 'global')),
    source_event_ids TEXT NOT NULL,
    source_kinds TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    scope TEXT NOT NULL,
    review_status TEXT NOT NULL CHECK (review_status IN ('pending_review', 'reviewed')),
    review_after TEXT NOT NULL,
    expires_at TEXT,
    why TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_persona_entries_project ON persona_entries(project);
CREATE INDEX IF NOT EXISTS idx_persona_entries_kind ON persona_entries(kind);
CREATE INDEX IF NOT EXISTS idx_persona_entries_visibility ON persona_entries(visibility);
`;

/**
 * Temporal semantic graph edge projection table.
 *
 * Derived from canonical fact events and extraction metadata. Governance for
 * whether edges may be used lives in memory_governance(surface='graph').
 */
export const GRAPH_EDGES_TABLE = `
CREATE TABLE IF NOT EXISTS graph_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edge_id TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('project', 'tool', 'person', 'decision', 'error', 'plan', 'file', 'command', 'capability')),
    source_id TEXT NOT NULL,
    source_label TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'tool', 'person', 'decision', 'error', 'plan', 'file', 'command', 'capability')),
    target_id TEXT NOT NULL,
    target_label TEXT NOT NULL,
    relationship TEXT NOT NULL,
    project TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('project', 'workspace', 'global')),
    source_event_ids TEXT NOT NULL,
    source_kinds TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    why TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_edge_id ON graph_edges(edge_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project);
CREATE INDEX IF NOT EXISTS idx_graph_edges_scope ON graph_edges(project, visibility);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_relationship ON graph_edges(relationship);
CREATE INDEX IF NOT EXISTS idx_graph_edges_temporal ON graph_edges(valid_from, valid_to, confidence);
`;

/**
 * Schema options for conditional table creation
 */

export interface SchemaOptions {
    /** Whether sqlite-vec extension is loaded and vec0 tables can be created. Default: false */
    sqliteVecAvailable?: boolean;
}

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
 * 14. embedding_state (depends on messages_meta) -- always created
 * 15. memory_files (no dependencies)
 * 16. memory_files_fts (depends on memory_files)
 * 17. memory_files FTS triggers (depend on both memory_files tables)
 * 18. friction_log (no dependencies)
 * 19. backfill_state (no dependencies)
 *
 * Note: message_embeddings (vec0) is NOT in this array.
 * It is conditionally created in createSchema() when sqliteVecAvailable is true.
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
    EMBEDDING_STATE_TABLE,
    MEMORY_FILES_TABLE,
    MEMORY_FILES_FTS_TABLE,
    MEMORY_FILES_FTS_TRIGGERS,
    FRICTION_LOG_TABLE,
    BACKFILL_STATE_TABLE,
    FACTS_TABLE,
    FACTS_FTS_TABLE,
    FACTS_FTS_TRIGGERS,
    EXTRACTION_LOG_TABLE,
    MEMORY_GOVERNANCE_TABLE,
    MEMORY_GOVERNANCE_EVENTS_TABLE,
    PERSONA_ENTRIES_TABLE,
    GRAPH_EDGES_TABLE,
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
 * When sqliteVecAvailable is true, also creates the message_embeddings
 * vec0 virtual table for vector similarity search. The embedding_state
 * tracking table is always created regardless of sqlite-vec availability.
 *
 * @param db - SQLite database instance
 * @param options - Schema creation options (defaults to sqliteVecAvailable: false)
 * @throws Error if FTS5 is not supported or SQL execution fails
 */
export function createSchema(db: Database, options?: SchemaOptions): void {
    const { sqliteVecAvailable = false } = options ?? {};

    // Verify FTS5 support before creating schema
    if (!checkFts5Support(db)) {
        throw new Error(
            "FTS5 extension is not available. " +
            "Ensure you are using Bun with FTS5 support enabled."
        );
    }

    // Pre-loop migration: universalize friction_log if old schema exists
    // Must run before SCHEMA_SQL loop because FRICTION_LOG_TABLE includes
    // idx_friction_tool index which requires the tool column to exist.
    try {
        const frictionColumns = db.prepare("PRAGMA table_info(friction_log)").all() as Array<{ name: string }>;
        const hasTool = frictionColumns.some(c => c.name === "tool");
        if (!hasTool && frictionColumns.length > 0) {
            db.exec(FRICTION_LOG_UNIVERSALIZE_MIGRATION);
        }
    } catch {
        // Table doesn't exist yet (fresh DB) -- will be created by SCHEMA_SQL loop
    }

    // Execute all schema statements in order
    // (includes embedding_state which is always created)
    for (const sql of SCHEMA_SQL) {
        db.exec(sql);
    }

    // Migration: add model_name column to embedding_state if not present
    const columns = db.prepare("PRAGMA table_info(embedding_state)").all() as Array<{ name: string }>;
    const hasModelName = columns.some(c => c.name === "model_name");
    if (!hasModelName) {
        db.exec(EMBEDDING_STATE_ADD_MODEL_NAME);
    }

    // Conditionally create vec0 virtual table (requires sqlite-vec extension)
    if (sqliteVecAvailable) {
        db.exec(MESSAGE_EMBEDDINGS_TABLE);
    }
}
