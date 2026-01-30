/**
 * Database Infrastructure
 *
 * Provides SQLite database initialization, schema management,
 * and connection utilities for memory-nexus.
 */

// Schema
export {
    SCHEMA_SQL,
    createSchema,
    checkFts5Support,
    SESSIONS_TABLE,
    MESSAGES_META_TABLE,
    MESSAGES_FTS_TABLE,
    TOOL_USES_TABLE,
    LINKS_TABLE,
    TOPICS_TABLE,
    EXTRACTION_STATE_TABLE,
} from "./schema.js";

// Connection
export {
    initializeDatabase,
    closeDatabase,
    checkpointDatabase,
    bulkOperationCheckpoint,
    getDefaultDbPath,
    type DatabaseConfig,
    type DatabaseInitResult,
    type CheckpointResult,
} from "./connection.js";

// Repositories
export {
    SqliteSessionRepository,
    SqliteMessageRepository,
    SqliteExtractionStateRepository,
    SqliteToolUseRepository,
    SqliteLinkRepository,
    type BatchResult,
    type BatchOptions,
    type RelatedLink,
} from "./repositories/index.js";

// Services
export { Fts5SearchService, SqliteStatsService } from "./services/index.js";
