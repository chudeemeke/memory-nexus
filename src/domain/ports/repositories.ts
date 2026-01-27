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
import type { ProjectPath } from "../value-objects/project-path.js";

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
