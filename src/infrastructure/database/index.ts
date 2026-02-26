/**
 * Database Infrastructure
 *
 * Provides SQLite database initialization, schema management,
 * and connection utilities for memory.
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
    EMBEDDING_STATE_TABLE,
    EMBEDDING_STATE_ADD_MODEL_NAME,
    MESSAGE_EMBEDDINGS_TABLE,
    type SchemaOptions,
} from "./schema.js";

// Connection
export {
    initializeDatabase,
    initializeDatabaseSafe,
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
    EmbeddingRepository,
    type UnembeddedMessage,
    type EmbeddingBatchItem,
} from "./repositories/index.js";

// Services
export {
  Fts5SearchService,
  SqliteStatsService,
  SqliteContextService,
  type ProjectContext,
  type ContextOptions,
  type ToolUsage,
} from "./services/index.js";

// Health checker
export {
  checkDatabaseIntegrity,
  checkQuickIntegrity,
  checkDirectoryPermissions,
  checkConfigValidity,
  checkHookStatus,
  checkSqliteVecAvailability,
  checkEmbeddingConfig,
  runHealthCheck,
  setTestOverrides,
  type DatabaseHealth,
  type PermissionsHealth,
  type HooksHealth,
  type ConfigHealth,
  type EmbeddingHealth,
  type SqliteVecHealth,
  type HealthCheckResult,
  type HealthCheckOverrides,
} from "./health-checker.js";
