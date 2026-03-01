/**
 * Signal Port Interfaces
 *
 * Defines contracts for abort signaling, checkpoint management,
 * and sync logging. These interfaces abstract infrastructure concerns
 * (filesystem, process signals) from application services.
 */

/**
 * Checkpoint data for recovering from interrupted sync operations.
 *
 * Tracks which sessions have been completed so that a resumed sync
 * can skip already-processed sessions.
 */
export interface SyncCheckpoint {
  /** When the sync began (ISO timestamp) */
  startedAt: string;
  /** Total number of sessions to sync */
  totalSessions: number;
  /** Number of sessions completed */
  completedSessions: number;
  /** List of completed session IDs */
  completedSessionIds: string[];
  /** When last session was completed (ISO timestamp, null if none) */
  lastCompletedAt: string | null;
}

/**
 * Abort signal for long-running sync operations.
 *
 * Implementations check process signals (SIGINT/SIGTERM) or other
 * abort triggers. The sync loop checks this between sessions.
 */
export interface ISyncAbortSignal {
  /**
   * Check if abort has been requested.
   *
   * @returns true if the operation should stop
   */
  shouldAbort(): boolean;
}

/**
 * Checkpoint persistence for sync recovery.
 *
 * Implementations store checkpoint state to disk so that interrupted
 * syncs can resume from where they left off.
 */
export interface ICheckpointManager {
  /**
   * Load the most recent checkpoint.
   *
   * @returns Checkpoint data, or null if no checkpoint exists
   */
  load(): SyncCheckpoint | null;

  /**
   * Save checkpoint state.
   *
   * @param checkpoint Checkpoint data to persist
   */
  save(checkpoint: SyncCheckpoint): void;

  /**
   * Clear checkpoint after successful sync completion.
   */
  clear(): void;
}

/**
 * Structured logger for sync operations.
 *
 * Implementations write log entries to structured storage
 * (JSON lines files, databases, etc.).
 */
export interface ISyncLogger {
  /**
   * Write a structured log entry.
   *
   * @param entry Log entry with level, message, and optional context
   */
  log(entry: {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    sessionId?: string;
    error?: string;
  }): void;
}
