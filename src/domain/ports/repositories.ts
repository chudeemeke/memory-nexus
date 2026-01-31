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
import type { ProjectPath } from "../value-objects/project-path.js";

/**
 * Options for filtering session list.
 */
export interface SessionListOptions {
  /** Maximum sessions to return */
  limit?: number;
  /** Filter by project name (substring match) */
  projectFilter?: string;
  /** Only sessions after this date */
  sinceDate?: Date;
  /** Only sessions before this date */
  beforeDate?: Date;
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
  ): Promise<void>;
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
  ): Promise<void>;
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
