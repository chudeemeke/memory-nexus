/**
 * Repository Port Interfaces
 *
 * Defines contracts for persistence operations. These interfaces are
 * implemented by infrastructure adapters (e.g., SQLite repositories).
 *
 * Design principles:
 * - All methods return Promises for async compatibility
 * - Use domain entities exclusively (no SQL or infrastructure types)
 * - Methods are minimal and focused on specific use cases
 */

import type { Session } from "../entities/session.js";
import type { Message } from "../entities/message.js";
import type { ToolUse } from "../entities/tool-use.js";
import type { Link, EntityType } from "../entities/link.js";
import type { ExtractionState } from "../entities/extraction-state.js";
import type { Entity, ExtractedEntityType } from "../entities/entity.js";
import type { MemoryFile, MemoryFileType } from "../entities/memory-file.js";
import type {
    FrictionEntry,
    FrictionSeverity,
    FrictionStatus,
} from "../entities/friction-entry.js";
import type { BackfillState } from "../entities/backfill-state.js";
import type { ProjectPath } from "../value-objects/project-path.js";
import type { Fact } from "../entities/fact.js";
import type { PersonaEntry, PersonaEntryKind } from "../entities/persona-entry.js";
import type { GraphEdge } from "../entities/graph-edge.js";
import type {
  MemoryGovernanceEntry,
  MemoryGovernanceStatus,
  MemoryGovernanceSurface,
} from "../entities/memory-governance.js";
import type { MemoryEventEnvelope } from "../entities/memory-event.js";


/**
 * Options for filtering session list.
 */
export interface SessionListOptions {
  /** Maximum sessions to return */
  limit?: number | undefined;
  /** Filter by project name (substring match) */
  projectFilter?: string | undefined;
  /** Only sessions after this date */
  sinceDate?: Date | undefined;
  /** Only sessions before this date */
  beforeDate?: Date | undefined;
}

/**
 * Repository for Session entities.
 *
 * Handles persistence of Claude Code sessions and their metadata.
 * Sessions are identified by their unique session ID.
 */
export interface ISessionRepository {
  /**
   * Find a session by its unique identifier.
   * @param id The session UUID
   * @returns The session if found, null otherwise
   */
  findById(id: string): Promise<Session | null>;

  /**
   * Find all sessions belonging to a project.
   * @param projectPath The project path to filter by
   * @returns Array of sessions for the project
   */
  findByProject(projectPath: ProjectPath): Promise<Session[]>;

  /**
   * Find the most recent sessions across all projects.
   * @param limit Maximum number of sessions to return
   * @returns Array of sessions, ordered by start time descending
   */
  findRecent(limit: number): Promise<Session[]>;

  /**
   * Save a session to the repository.
   * Creates or updates based on session ID.
   * @param session The session to save
   */
  save(session: Session): Promise<void>;

  /**
   * Save multiple sessions in a single transaction.
   * More efficient than individual saves for bulk operations.
   * @param sessions Array of sessions to save
   */
  saveMany(sessions: Session[]): Promise<void>;

  /**
   * Delete a session by its identifier.
   * Also removes associated messages (cascade).
   * @param id The session UUID to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Find sessions with filtering options.
   * Builds dynamic WHERE clause based on provided filters.
   * @param options Filtering options (limit, project, date range)
   * @returns Array of sessions matching filters, ordered by start time descending
   */
  findFiltered(options: SessionListOptions): Promise<Session[]>;

  /**
   * Update the project name for all sessions with a matching encoded path.
   * Used to fix lossy project names resolved via filesystem lookup.
   * @param encodedPath The encoded project path to match
   * @param projectName The correct project name
   * @returns Number of rows updated
   */
  updateProjectName(encodedPath: string, projectName: string): Promise<number>;

  /**
   * Find all distinct encoded project paths stored in sessions.
   * Used by fixProjectNames to enumerate paths needing resolution.
   * @returns Array of distinct encoded path strings
   */
  findDistinctEncodedPaths(): Promise<string[]>;
}

/**
 * Repository for Message entities.
 *
 * Handles persistence of individual messages within sessions.
 * Messages are always associated with a parent session.
 */
export interface IMessageRepository {
  /**
   * Find a message by its unique identifier.
   * @param id The message UUID
   * @returns The message if found, null otherwise
   */
  findById(id: string): Promise<Message | null>;

  /**
   * Find all messages belonging to a session.
   * @param sessionId The parent session UUID
   * @returns Array of messages, ordered by timestamp ascending
   */
  findBySession(sessionId: string): Promise<Message[]>;

  /**
   * Save a message associated with a session.
   * @param message The message to save
   * @param sessionId The parent session UUID
   */
  save(message: Message, sessionId: string): Promise<void>;

  /**
   * Save multiple messages in a single transaction.
   * More efficient than individual saves for bulk operations.
   * @param messages Array of message/sessionId pairs to save
   */
  saveMany(
    messages: Array<{ message: Message; sessionId: string }>
  ): Promise<any>;
}

/**
 * Repository for ToolUse entities.
 *
 * Handles persistence of tool invocations within sessions.
 * Tool uses track what tools were called and their results.
 */
export interface IToolUseRepository {
  /**
   * Find a tool use by its unique identifier.
   * @param id The tool use UUID
   * @returns The tool use if found, null otherwise
   */
  findById(id: string): Promise<ToolUse | null>;

  /**
   * Find all tool uses belonging to a session.
   * @param sessionId The parent session UUID
   * @returns Array of tool uses, ordered by timestamp ascending
   */
  findBySession(sessionId: string): Promise<ToolUse[]>;

  /**
   * Save a tool use associated with a session.
   * @param toolUse The tool use to save
   * @param sessionId The parent session UUID
   */
  save(toolUse: ToolUse, sessionId: string): Promise<void>;

  /**
   * Save multiple tool uses in a single transaction.
   * More efficient than individual saves for bulk operations.
   * @param toolUses Array of toolUse/sessionId pairs to save
   */
  saveMany(
    toolUses: Array<{ toolUse: ToolUse; sessionId: string }>
  ): Promise<any>;
}

/**
 * Repository for Link entities.
 *
 * Handles persistence of relationships between entities for
 * graph-like traversal. Enables cross-session navigation.
 */
export interface ILinkRepository {
  /**
   * Find all links originating from a specific entity.
   * @param sourceType The type of the source entity
   * @param sourceId The ID of the source entity
   * @returns Array of links from this source
   */
  findBySource(sourceType: EntityType, sourceId: string): Promise<Link[]>;

  /**
   * Find all links pointing to a specific entity.
   * @param targetType The type of the target entity
   * @param targetId The ID of the target entity
   * @returns Array of links to this target
   */
  findByTarget(targetType: EntityType, targetId: string): Promise<Link[]>;

  /**
   * Find all entities related to a given entity within N hops.
   * Enables graph traversal for discovering related content.
   * @param entityType The type of the starting entity
   * @param entityId The ID of the starting entity
   * @param maxHops Maximum depth to traverse (default: 2)
   * @returns Array of links representing the relationship graph
   */
  findRelated(
    entityType: EntityType,
    entityId: string,
    maxHops?: number
  ): Promise<Link[]>;

  /**
   * Save a link to the repository.
   * @param link The link to save
   */
  save(link: Link): Promise<void>;

  /**
   * Save multiple links in a single transaction.
   * More efficient than individual saves for bulk operations.
   * @param links Array of links to save
   */
  saveMany(links: Link[]): Promise<void>;
}

/**
 * Repository for ExtractionState entities.
 *
 * Tracks the state of extracting sessions from JSONL files.
 * Enables incremental sync and progress tracking.
 */
export interface IExtractionStateRepository {
  /**
   * Find an extraction state by its unique identifier.
   * @param id The extraction state UUID
   * @returns The state if found, null otherwise
   */
  findById(id: string): Promise<ExtractionState | null>;

  /**
   * Find extraction state by session path.
   * Used to check if a session has already been extracted.
   * @param sessionPath The path to the session JSONL file
   * @returns The state if found, null otherwise
   */
  findBySessionPath(sessionPath: string): Promise<ExtractionState | null>;

  /**
   * Find all extractions that are pending or in progress.
   * Used to resume interrupted extractions.
   * @returns Array of pending/in-progress extraction states
   */
  findPending(): Promise<ExtractionState[]>;

  /**
   * Save an extraction state to the repository.
   * @param state The extraction state to save
   */
  save(state: ExtractionState): Promise<void>;
}

/**
 * Options for filtering entity list.
 */
export interface EntityListOptions {
  /** Maximum entities to return */
  limit?: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

/**
 * Repository for Entity domain objects.
 *
 * Handles persistence of extracted concepts, files, decisions, and terms.
 * Entities are linked to sessions and can have relationships with other entities.
 */
export interface IEntityRepository {
  /**
   * Find an entity by its unique database identifier.
   * @param id The entity database ID
   * @returns The entity if found, null otherwise
   */
  findById(id: number): Promise<Entity | null>;

  /**
   * Find an entity by its type and name (unique constraint).
   * @param type The entity type (concept, file, decision, term)
   * @param name The entity name
   * @returns The entity if found, null otherwise
   */
  findByName(type: ExtractedEntityType, name: string): Promise<Entity | null>;

  /**
   * Find all entities linked to a specific session.
   * @param sessionId The session UUID
   * @returns Array of entities for the session
   */
  findBySession(sessionId: string): Promise<Entity[]>;

  /**
   * Find entities of a specific type with optional filtering.
   * @param type The entity type to filter by
   * @param options Optional filtering (limit, minConfidence)
   * @returns Array of entities matching the criteria
   */
  findByType(
    type: ExtractedEntityType,
    options?: EntityListOptions
  ): Promise<Entity[]>;

  /**
   * Save an entity to the repository.
   * Creates or updates based on type+name uniqueness.
   * @param entity The entity to save
   * @returns The entity with id assigned
   */
  save(entity: Entity): Promise<Entity>;

  /**
   * Save multiple entities in a single transaction.
   * More efficient than individual saves for bulk operations.
   * @param entities Array of entities to save
   * @returns Array of entities with ids assigned
   */
  saveMany(entities: Entity[]): Promise<Entity[]>;

  /**
   * Create a link between an entity and a session.
   * Tracks how often an entity appears in a session.
   * @param entityId The entity database ID
   * @param sessionId The session UUID
   * @param frequency Optional occurrence count (default: 1)
   */
  linkToSession(
    entityId: number,
    sessionId: string,
    frequency?: number
  ): Promise<void>;

  /**
   * Create a relationship link between two entities.
   * Enables graph traversal for related concepts.
   * @param sourceId The source entity database ID
   * @param targetId The target entity database ID
   * @param relationship The relationship type (related, implies, contradicts)
   * @param weight Optional relationship strength (0-1, default: 1.0)
   */
  linkEntities(
    sourceId: number,
    targetId: number,
    relationship: "related" | "implies" | "contradicts",
    weight?: number
  ): Promise<void>;
}

/**
 * A message that has not yet been embedded.
 *
 * Represents a row from messages_meta that has no corresponding
 * entry in embedding_state. Used by the embedding pipeline to
 * identify messages needing vector generation.
 */
export interface UnembeddedMessage {
  /** The integer rowid from messages_meta (NOT the UUID id) */
  rowid: number;
  /** The message content text to embed */
  content: string;
}

/**
 * A single item in an embedding batch for storage.
 *
 * Pairs a message rowid with its computed embedding vector.
 * Used by storeBatch to write both the vec0 table and
 * the embedding_state tracking table atomically.
 */
export interface EmbeddingBatchItem {
  /** The integer rowid matching messages_meta.rowid */
  rowid: number;
  /** The embedding vector */
  embedding: Float32Array;
}

/**
 * Domain-layer configuration contract for the embedding service.
 *
 * Contains only the fields that EmbeddingService needs to operate.
 * Infrastructure's EmbeddingConfigData structurally satisfies this
 * interface (it has all 4 fields plus additional ones like enabled,
 * apiKey, baseUrl that the application layer does not need).
 */
export interface EmbeddingServiceConfig {
  /** Embedding provider name (e.g., "local", "openai", "ollama") */
  provider: string;
  /** Model identifier (e.g., "Xenova/all-MiniLM-L6-v2") */
  model: string;
  /** Vector dimensions produced by the model */
  dimensions: number;
  /** Number of messages to process per batch */
  batchSize: number;
}

/**
 * Repository port for embedding data access.
 *
 * Defines the contract for querying unembedded messages, storing
 * embedding results, tracking model hashes for change detection,
 * and managing the embedding lifecycle (clear and re-embed).
 *
 * All methods are synchronous, matching bun:sqlite's synchronous API.
 * Implemented by infrastructure's EmbeddingRepository.
 *
 * Note: Infrastructure-only methods (vectorKnnSearch, getStoredEmbeddingDimensions,
 * recreateVecTable) are intentionally excluded per ISP -- they are used by
 * HybridSearchService and sync commands, not by the application-layer
 * EmbeddingService.
 */
export interface IEmbeddingRepository {
  /**
   * Find messages that have not yet been embedded.
   * @param limit Maximum number of messages to return
   * @returns Array of unembedded messages ordered by rowid ASC
   */
  findUnembedded(limit: number): UnembeddedMessage[];

  /**
   * Store a batch of embeddings in a single transaction.
   * @param items Array of embedding batch items (rowid + vector)
   * @param modelHash Hash identifying the model configuration
   * @param modelName Human-readable model name
   */
  storeBatch(items: EmbeddingBatchItem[], modelHash: string, modelName: string): void;

  /**
   * Get the model hash currently stored in embedding_state.
   * @returns The model hash string, or null if no embeddings exist
   */
  getStoredModelHash(): string | null;

  /**
   * Get the human-readable model name stored in embedding_state.
   * @returns The model name string, or null if unavailable
   */
  getStoredModelName(): string | null;

  /**
   * Delete all embeddings and embedding state.
   * Used before re-embedding when the model has changed.
   */
  clearAllEmbeddings(): void;

  /**
   * Count the number of embedded messages.
   * @returns The number of rows in embedding_state
   */
  getEmbeddedCount(): number;

  /**
   * Count the total number of messages in the database.
   * @returns The number of rows in messages_meta
   */
  getTotalMessageCount(): number;
}

/**
 * Repository for MemoryFile entities.
 *
 * Handles persistence of indexed legacy memory files.
 * Files are identified by their path relative to the memory directory.
 */
export interface IMemoryFileRepository {
  /**
   * Find a memory file by its relative path.
   * @param filePath Path relative to the legacy memory-file root
   * @returns The memory file if found, null otherwise
   */
  findByPath(filePath: string): Promise<MemoryFile | null>;

  /**
   * Find all memory files of a specific type.
   * @param fileType The type to filter by
   * @returns Array of matching memory files
   */
  findByType(fileType: MemoryFileType): Promise<MemoryFile[]>;

  /**
   * Find all memory files belonging to a specific project.
   * @param projectEncoded The encoded project path
   * @returns Array of memory files for the project
   */
  findByProject(projectEncoded: string): Promise<MemoryFile[]>;

  /**
   * Save a memory file (insert or update by file_path).
   * @param file The memory file to save
   */
  save(file: MemoryFile): Promise<void>;

  /**
   * Save multiple memory files in a single transaction.
   * @param files Array of memory files to save
   */
  saveMany(files: MemoryFile[]): Promise<void>;

  /**
   * Full-text search across memory file content.
   * @param query The search query (already sanitized for FTS5)
   * @param limit Maximum results (default: 20)
   * @returns Array of matching memory files
   */
  searchContent(query: string, limit?: number): Promise<MemoryFile[]>;

  /**
   * Find learnings files tagged for cross-project sharing.
   * Searches for content containing "Applies to: cross-project".
   * @param excludeProject Optional encoded project path to exclude from results
   * @param limit Maximum results (default: 20)
   * @returns Array of matching learnings memory files
   */
  findCrossProjectLearnings(
    excludeProject?: string,
    limit?: number
  ): Promise<MemoryFile[]>;
}

/**
 * Aggregated statistics for friction entries.
 */
export interface FrictionStats {
    total: number;
    open: number;
    resolved: number;
    wontFix: number;
    bySeverity: Record<FrictionSeverity, number>;
    byCategory: Record<string, number>;
    byTool: Record<string, number>;
    meanTimeToResolve: number | null;
    oldestOpen: { id: number; description: string; daysOpen: number } | null;
}

/**
 * A recurring friction pattern grouped by tool and category.
 */
export interface FrictionPattern {
    tool: string;
    category: string;
    count: number;
    entries: FrictionEntry[];
}

/**
 * Durable friction query options.
 */
export interface FrictionQueryOptions {
    status?: FrictionStatus | undefined;
    severity?: FrictionSeverity | undefined;
    category?: string | undefined;
    tool?: string | undefined;
    sourceProject?: string | undefined;
    since?: Date | undefined;
    descriptionContains?: string | undefined;
    contextContains?: string | undefined;
    limit?: number | undefined;
}

/**
 * Durable friction query result.
 */
export interface FrictionQueryResult {
    entries: FrictionEntry[];
    totalCount: number;
}

export interface PersonaListOptions {
  project?: string | undefined;
  visibility?: "project" | "workspace" | "global" | undefined;
  kind?: PersonaEntryKind | undefined;
  limit?: number | undefined;
}

export interface PersonaContextOptions {
  includeGlobal?: boolean | undefined;
  limit?: number | undefined;
}

export interface IPersonaRepository {
  save(entry: PersonaEntry): Promise<PersonaEntry>;
  saveMany(entries: PersonaEntry[]): Promise<PersonaEntry[]>;
  findByEntryId(entryId: string): Promise<PersonaEntry | null>;
  findAll(options?: PersonaListOptions): Promise<PersonaEntry[]>;
  findForContext(project: string, options?: PersonaContextOptions): Promise<PersonaEntry[]>;
  deleteByProject(project: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface GraphEdgeQueryOptions {
  project?: string | undefined;
  includeGlobal?: boolean | undefined;
  asOf?: Date | undefined;
  minConfidence?: number | undefined;
  nodeId?: string | undefined;
  relationship?: string | undefined;
  limit?: number | undefined;
}

export interface IGraphRepository {
  save(edge: GraphEdge): Promise<GraphEdge>;
  saveMany(edges: GraphEdge[]): Promise<GraphEdge[]>;
  findByEdgeId(edgeId: string): Promise<GraphEdge | null>;
  findCurrent(options?: GraphEdgeQueryOptions): Promise<GraphEdge[]>;
  pruneStale(cutoff: Date): Promise<number>;
  deleteByProject(project: string): Promise<void>;
  clearAll(): Promise<void>;
}

/**
 * Repository for FrictionEntry entities.
 *
 * Handles persistence of friction log entries and provides
 * aggregation queries for stats and trend analysis.
 */
export interface IFrictionRepository {
    /**
     * Save a friction entry to the repository.
     * @param entry The entry to save
     * @returns The entry with id assigned
     */
    save(entry: FrictionEntry): Promise<FrictionEntry>;

    /**
     * Find a friction entry by its database ID.
     * @param id The entry database ID
     * @returns The entry if found, null otherwise
     */
    findById(id: number): Promise<FrictionEntry | null>;

    /**
     * Find all open friction entries.
     * @returns Array of open entries, ordered by logged_at descending
     */
    findOpen(): Promise<FrictionEntry[]>;

    /**
     * Find friction entries with optional filtering.
     * @param options Filtering options (status, category, limit)
     * @returns Array of matching entries, ordered by logged_at descending
     */
    findAll(options?: {
        status?: FrictionStatus;
        category?: string;
        tool?: string;
        sourceProject?: string;
        limit?: number;
    }): Promise<FrictionEntry[]>;

    /**
     * Query friction entries with stable durable contract semantics.
     * Returns totalCount before limit is applied.
     * @param options Durable query filters
     * @returns Matching entries and total matching count
     */
    query(options?: FrictionQueryOptions): Promise<FrictionQueryResult>;

    /**
     * Resolve a friction entry with a resolution description.
     * @param id The entry database ID
     * @param resolution How the friction was resolved
     * @throws Error if entry not found
     */
    resolve(id: number, resolution: string): Promise<void>;

    /**
     * Update the status of a friction entry.
     * @param id The entry database ID
     * @param status The new status
     * @throws Error if entry not found
     */
    updateStatus(id: number, status: FrictionStatus): Promise<void>;

    /**
     * Get aggregated statistics for all friction entries.
     * @returns FrictionStats with counts, breakdowns, MTTR, oldest open
     */
    getStats(): Promise<FrictionStats>;

    /**
     * Get weekly trend data for friction entries.
     * @param weeks Number of weeks to include
     * @returns Array of weekly counts, zero-filled for inactive weeks
     */
    getWeeklyTrends(
        weeks: number
    ): Promise<Array<{ week: string; newCount: number; resolvedCount: number }>>;

    /**
     * Mark all entries for a tool as reviewed at a given date.
     * @param tool The tool name
     * @param reviewedAt The review date
     */
    markReviewed(tool: string, reviewedAt: Date): Promise<void>;

    /**
     * Find recurring friction patterns above a threshold count.
     * @param threshold Minimum entry count to qualify as a pattern
     * @returns Array of patterns grouped by tool and category
     */
    findPatterns(threshold: number): Promise<FrictionPattern[]>;

    /**
     * Delete friction entries whose description matches a pattern.
     * Uses SQL LIKE matching (% for wildcard).
     * @param pattern Description pattern to match
     * @returns Number of entries deleted
     */
    deleteByPattern(pattern: string): Promise<number>;
}

/**
 * Count of backfill states by success/failure status.
 */
export interface BackfillStatusCounts {
    total: number;
    succeeded: number;
    failed: number;
}

/**
 * Repository for BackfillState entities.
 *
 * Tracks which sessions have been backfilled (daily log generated).
 * Enables idempotent backfill: processed sessions are skipped on re-run.
 */
export interface IBackfillStateRepository {
    /**
     * Find backfill state for a specific session.
     * @param sessionId The session UUID
     * @returns The backfill state if found, null otherwise
     */
    findBySessionId(sessionId: string): Promise<BackfillState | null>;

    /**
     * Find all backfill states.
     * @returns Array of all backfill state records
     */
    findAll(): Promise<BackfillState[]>;

    /**
     * Save a backfill state record (insert or update by session_id).
     * @param state The backfill state to save
     */
    save(state: BackfillState): Promise<void>;

    /**
     * Count backfill states by success/failure status.
     * @returns Counts of total, succeeded, and failed backfills
     */
    countByStatus(): Promise<BackfillStatusCounts>;
}

/**
 * Extraction log entry representing metadata of an LLM extraction session.
 */
export interface ExtractionLogEntry {
  sessionId: string;
  mode: string;
  factsAdded: number;
  factsUpdated: number;
  factsSuperseded: number;
  factsSkipped: number;
  provider: string;
  model: string;
  tokensConsumed: number;
  extractedAt: Date;
}

/**
 * Repository for Fact entities.
 *
 * Handles persistence of derived Fact projections.
 */
export interface IFactRepository {
  findById(id: number): Promise<Fact | null>;
  findByUuid(uuid: string): Promise<Fact | null>;
  findByProject(project: string): Promise<Fact[]>;
  findRecent(limit: number): Promise<Fact[]>;
  save(fact: Fact): Promise<Fact>;
  saveMany(facts: Fact[]): Promise<Fact[]>;
  search(query: string, limit?: number): Promise<Fact[]>;
  supersede(uuid: string, supersededAt: Date, supersededByUuid: string): Promise<void>;
  findAll(): Promise<Fact[]>;
  clearAll(): Promise<void>;
}

/**
 * Repository for tracking run logs of LLM fact extraction.
 */
export interface IExtractionLogRepository {
  findById(sessionId: string): Promise<ExtractionLogEntry | null>;
  save(entry: ExtractionLogEntry): Promise<void>;
  findAll(): Promise<ExtractionLogEntry[]>;
  clearAll(): Promise<void>;
}

/**
 * Options for listing governed derived memory entries.
 */
export interface MemoryGovernanceListOptions {
  surface?: MemoryGovernanceSurface | undefined;
  targetId?: string | undefined;
  project?: string | undefined;
  status?: MemoryGovernanceStatus | undefined;
  limit?: number | undefined;
}

/**
 * Repository for consent/provenance governance state.
 *
 * This stores the current projection of control events. Canonical event logs
 * remain the source of truth; this projection makes policy checks cheap.
 */
export interface IMemoryGovernanceRepository {
  save(entry: MemoryGovernanceEntry): Promise<MemoryGovernanceEntry>;
  findByTarget(surface: MemoryGovernanceSurface, targetId: string): Promise<MemoryGovernanceEntry | null>;
  findByTargetIds(surface: MemoryGovernanceSurface, targetIds: string[]): Promise<MemoryGovernanceEntry[]>;
  findAll(options?: MemoryGovernanceListOptions): Promise<MemoryGovernanceEntry[]>;
  applyMemoryEvent(event: MemoryEventEnvelope): Promise<MemoryGovernanceEntry | null>;
  clearAll(): Promise<void>;
}

