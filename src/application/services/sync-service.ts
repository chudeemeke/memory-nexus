/**
 * SyncService Application Layer
 *
 * Orchestrates session discovery, parsing, and storage for the sync workflow.
 * Implements incremental sync detection using file mtime and size comparison.
 *
 * Per-session transaction boundary ensures atomicity and error isolation.
 */

import type { Database } from "bun:sqlite";
import type {
  ISessionSource,
  IEventParser,
  SessionFileInfo,
  ParsedEvent,
} from "../../domain/ports/index.js";
import type {
  ISessionRepository,
  IMessageRepository,
  IToolUseRepository,
  IExtractionStateRepository,
} from "../../domain/ports/repositories.js";
import { Session } from "../../domain/entities/session.js";
import { Message } from "../../domain/entities/message.js";
import { ToolUse } from "../../domain/entities/tool-use.js";
import { ExtractionState } from "../../domain/entities/extraction-state.js";

/**
 * Options for controlling sync behavior
 */
export interface SyncOptions {
  /** Re-extract all sessions regardless of state */
  force?: boolean;
  /** Filter by project path substring */
  projectFilter?: string;
  /** Sync specific session only */
  sessionFilter?: string;
  /** Progress callback invoked for each session */
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Progress information for sync operations
 */
export interface SyncProgress {
  /** Current session index (1-based) */
  current: number;
  /** Total sessions to process */
  total: number;
  /** Current session being processed */
  sessionId: string;
  /** Current phase of sync */
  phase: "discovering" | "extracting" | "complete";
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Overall success (true if no errors) */
  success: boolean;
  /** Total sessions found */
  sessionsDiscovered: number;
  /** Sessions successfully processed */
  sessionsProcessed: number;
  /** Sessions skipped (already up-to-date) */
  sessionsSkipped: number;
  /** Total messages inserted */
  messagesInserted: number;
  /** Total tool uses inserted */
  toolUsesInserted: number;
  /** Errors encountered during sync */
  errors: Array<{
    sessionPath: string;
    error: string;
  }>;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Application service that orchestrates the sync workflow.
 *
 * Responsibilities:
 * - Discover sessions via ISessionSource
 * - Filter sessions based on options
 * - Detect sessions needing extraction (incremental sync)
 * - Parse events via IEventParser
 * - Extract messages and tool uses from events
 * - Persist to repositories within per-session transactions
 * - Track extraction state for incremental sync
 */
export class SyncService {
  constructor(
    private readonly sessionSource: ISessionSource,
    private readonly eventParser: IEventParser,
    private readonly sessionRepo: ISessionRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly toolUseRepo: IToolUseRepository,
    private readonly extractionStateRepo: IExtractionStateRepository,
    private readonly db: Database
  ) {}

  /**
   * Sync sessions to the database.
   *
   * Discovers all sessions, applies filters, checks for changes,
   * and extracts sessions that need processing. Each session is
   * processed in its own transaction for error isolation.
   *
   * @param options Configuration for sync behavior
   * @returns Result with counts and any errors
   */
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      sessionsDiscovered: 0,
      sessionsProcessed: 0,
      sessionsSkipped: 0,
      messagesInserted: 0,
      toolUsesInserted: 0,
      errors: [],
      durationMs: 0,
    };

    // Discover all sessions
    options.onProgress?.({
      current: 0,
      total: 0,
      sessionId: "",
      phase: "discovering",
    });

    const allSessions = await this.sessionSource.discoverSessions();
    result.sessionsDiscovered = allSessions.length;

    // Filter sessions to process
    const sessionsToProcess = await this.filterSessions(allSessions, options);
    result.sessionsSkipped = result.sessionsDiscovered - sessionsToProcess.length;

    // Process each session
    for (let i = 0; i < sessionsToProcess.length; i++) {
      const session = sessionsToProcess[i];

      options.onProgress?.({
        current: i + 1,
        total: sessionsToProcess.length,
        sessionId: session.id,
        phase: "extracting",
      });

      try {
        const extractionResult = await this.extractSession(session);
        result.sessionsProcessed++;
        result.messagesInserted += extractionResult.messages;
        result.toolUsesInserted += extractionResult.toolUses;
      } catch (error) {
        result.errors.push({
          sessionPath: session.path,
          error: error instanceof Error ? error.message : String(error),
        });
        result.success = false;
      }
    }

    options.onProgress?.({
      current: sessionsToProcess.length,
      total: sessionsToProcess.length,
      sessionId: "",
      phase: "complete",
    });

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Filter sessions based on options and extraction state.
   *
   * Applies projectFilter and sessionFilter, then checks extraction
   * state to skip sessions that are already up-to-date.
   */
  private async filterSessions(
    sessions: SessionFileInfo[],
    options: SyncOptions
  ): Promise<SessionFileInfo[]> {
    let filtered = sessions;

    // Apply projectFilter
    if (options.projectFilter) {
      filtered = filtered.filter((s) =>
        s.projectPath.decoded.includes(options.projectFilter!)
      );
    }

    // Apply sessionFilter
    if (options.sessionFilter) {
      filtered = filtered.filter((s) => s.id === options.sessionFilter);
    }

    // Check extraction state (unless force)
    const toProcess: SessionFileInfo[] = [];
    for (const session of filtered) {
      const state = await this.extractionStateRepo.findBySessionPath(session.path);
      if (this.needsExtraction(session, state, options.force ?? false)) {
        toProcess.push(session);
      }
    }

    return toProcess;
  }

  /**
   * Determine if a session needs extraction.
   *
   * A session needs extraction if:
   * - force=true
   * - No existing extraction state
   * - Existing state is not "complete"
   * - File metadata has changed (mtime or size differs)
   * - Stored metadata is null (legacy state)
   */
  private needsExtraction(
    session: SessionFileInfo,
    existingState: ExtractionState | null,
    force: boolean
  ): boolean {
    if (force) return true;
    if (!existingState) return true;
    if (existingState.status !== "complete") return true;

    // Compare file metadata
    const storedMtime = existingState.fileMtime;
    const storedSize = existingState.fileSize;

    // No metadata stored = re-extract
    if (!storedMtime || storedSize === undefined || storedSize === null) {
      return true;
    }

    // File changed if mtime OR size differs
    return (
      session.modifiedTime.getTime() !== storedMtime.getTime() ||
      session.size !== storedSize
    );
  }

  /**
   * Extract a single session within a transaction.
   *
   * Parses events, creates entities, and persists everything atomically.
   * On error, saves error state and re-throws.
   */
  private async extractSession(
    session: SessionFileInfo
  ): Promise<{ messages: number; toolUses: number }> {
    // Create pending extraction state with file metadata
    const stateId = crypto.randomUUID();
    let state = ExtractionState.create({
      id: stateId,
      sessionPath: session.path,
      startedAt: new Date(),
      status: "pending",
    }).withFileMetadata(session.modifiedTime, session.size);

    try {
      // Collect all events from the parser
      const events: ParsedEvent[] = [];
      for await (const event of this.eventParser.parse(session.path)) {
        events.push(event);
      }

      // Extract messages and tool uses from events
      const { messages, toolUses, firstTimestamp, lastTimestamp } =
        this.extractEntities(events);

      // Create session entity
      const sessionEntity = Session.create({
        id: session.id,
        projectPath: session.projectPath,
        startTime: firstTimestamp ?? new Date(),
        endTime: lastTimestamp,
      });

      // Transaction: save all data atomically
      const commitSession = this.db.transaction(() => {
        // Save session
        this.sessionRepo.save(sessionEntity);

        // Save messages
        if (messages.length > 0) {
          this.messageRepo.saveMany(
            messages.map((m) => ({ message: m, sessionId: session.id }))
          );
        }

        // Save tool uses
        if (toolUses.length > 0) {
          this.toolUseRepo.saveMany(
            toolUses.map((t) => ({ toolUse: t, sessionId: session.id }))
          );
        }

        // Update extraction state to complete
        const completedState = state
          .startProcessing()
          .incrementMessages(messages.length)
          .complete(new Date());
        this.extractionStateRepo.save(completedState);
      });

      commitSession.immediate();

      return { messages: messages.length, toolUses: toolUses.length };
    } catch (error) {
      // Save error state (separate transaction)
      const errorState = state.fail(
        error instanceof Error ? error.message : String(error)
      );
      await this.extractionStateRepo.save(errorState);
      throw error;
    }
  }

  /**
   * Extract Message and ToolUse entities from parsed events.
   *
   * Iterates through events and creates domain entities for
   * user messages, assistant messages, and tool uses with results.
   */
  private extractEntities(events: ParsedEvent[]): {
    messages: Message[];
    toolUses: ToolUse[];
    firstTimestamp: Date | undefined;
    lastTimestamp: Date | undefined;
  } {
    const messages: Message[] = [];
    const toolUses: ToolUse[] = [];
    const toolUseMap = new Map<string, ToolUse>();
    let firstTimestamp: Date | undefined;
    let lastTimestamp: Date | undefined;

    for (const event of events) {
      if (event.type === "skipped") {
        continue;
      }

      // Update timestamps
      if (event.type !== "skipped" && "data" in event && event.data.timestamp) {
        const timestamp = new Date(event.data.timestamp);
        if (!firstTimestamp || timestamp < firstTimestamp) {
          firstTimestamp = timestamp;
        }
        if (!lastTimestamp || timestamp > lastTimestamp) {
          lastTimestamp = timestamp;
        }
      }

      switch (event.type) {
        case "user": {
          const msg = Message.create({
            id: event.data.uuid,
            role: "user",
            content: event.data.message.content,
            timestamp: new Date(event.data.timestamp),
          });
          messages.push(msg);
          break;
        }

        case "assistant": {
          // Extract text content from content blocks
          const textContent = event.data.message.content
            .filter((block): block is { type: "text"; text: string } => block.type === "text")
            .map((block) => block.text)
            .join("\n");

          // Extract tool use IDs from content blocks
          const toolUseIds = event.data.message.content
            .filter(
              (block): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
                block.type === "tool_use"
            )
            .map((block) => block.id);

          // Also create ToolUse entities for embedded tool uses
          for (const block of event.data.message.content) {
            if (block.type === "tool_use") {
              const toolUse = ToolUse.create({
                id: block.id,
                name: block.name,
                input: block.input,
                timestamp: new Date(event.data.timestamp),
                status: "pending",
              });
              toolUseMap.set(block.id, toolUse);
            }
          }

          const msg = Message.create({
            id: event.data.uuid,
            role: "assistant",
            content: textContent,
            timestamp: new Date(event.data.timestamp),
            toolUseIds,
          });
          messages.push(msg);
          break;
        }

        case "tool_use": {
          const toolUse = ToolUse.create({
            id: event.data.uuid,
            name: event.data.name,
            input: event.data.input,
            timestamp: new Date(event.data.timestamp),
            status: "pending",
          });
          toolUseMap.set(event.data.uuid, toolUse);
          break;
        }

        case "tool_result": {
          // Update existing tool use with result
          const existingToolUse = toolUseMap.get(event.data.toolUseId);
          if (existingToolUse) {
            const updatedToolUse = event.data.isError
              ? existingToolUse.completeError(event.data.content)
              : existingToolUse.completeSuccess(event.data.content);
            toolUseMap.set(event.data.toolUseId, updatedToolUse);
          }
          break;
        }

        // Summary and system events are skipped for now
        case "summary":
        case "system":
          break;
      }
    }

    // Convert tool use map to array
    toolUses.push(...toolUseMap.values());

    return { messages, toolUses, firstTimestamp, lastTimestamp };
  }
}
