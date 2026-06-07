/**
 * Repository Infrastructure
 *
 * Exports SQLite implementations of domain repository interfaces.
 */

// Session Repository
export { SqliteSessionRepository } from "./session-repository.js";

// Message Repository
export { SqliteMessageRepository } from "./message-repository.js";

// Extraction State Repository
export { SqliteExtractionStateRepository } from "./extraction-state-repository.js";

// Tool Use Repository
export {
    SqliteToolUseRepository,
    type BatchResult,
    type BatchOptions,
} from "./tool-use-repository.js";

// Link Repository
export {
    SqliteLinkRepository,
    type RelatedLink,
} from "./link-repository.js";

// Entity Repository
export { SqliteEntityRepository } from "./entity-repository.js";

// Embedding Repository
export {
    EmbeddingRepository,
    type UnembeddedMessage,
    type EmbeddingBatchItem,
} from "./embedding-repository.js";

// Memory File Repository
export { SqliteMemoryFileRepository } from "./memory-file-repository.js";

// Friction Repository
export { SqliteFrictionRepository } from "./friction-repository.js";

// Backfill State Repository
export { SqliteBackfillStateRepository } from "./backfill-state-repository.js";

// Fact Repository
export { SqliteFactRepository } from "./fact-repository.js";

// Extraction Log Repository
export { SqliteExtractionLogRepository } from "./extraction-log-repository.js";

// Memory Governance Repository
export {
  SqliteMemoryGovernanceRepository,
  governanceEntryFromFactEvent,
} from "./memory-governance-repository.js";

// Persona Repository
export { SqlitePersonaRepository } from "./persona-repository.js";

// Temporal Graph Repository
export { SqliteGraphRepository } from "./graph-repository.js";

// Memory Utility Repository
export { SqliteMemoryUtilityRepository } from "./memory-utility-repository.js";
