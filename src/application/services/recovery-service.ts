/**
 * RecoveryService
 *
 * Detects sessions that haven't been synced and optionally syncs them.
 * Useful for crash recovery when hooks failed or were disabled.
 *
 * Features:
 * - Scan for pending sessions (not synced or incomplete)
 * - Dry run mode for reporting without syncing
 * - Limit sync count for controlled recovery
 * - Integration with config for recoveryOnStartup setting
 */

import type { ISessionSource } from "../../domain/ports/sources.js";
import type { IExtractionStateRepository } from "../../domain/ports/repositories.js";
import { logSync, loadConfig } from "../../infrastructure/hooks/index.js";
import type { SyncService } from "./sync-service.js";

/**
 * Result of a recovery operation
 */
export interface RecoveryResult {
  /** Paths of sessions that haven't been synced */
  pendingSessions: string[];
  /** Number of sessions successfully synced */
  syncedSessions: number;
  /** Errors encountered during sync */
  errors: Array<{ sessionPath: string; error: string }>;
  /** True if recovery was skipped due to config */
  skipped: boolean;
}

/**
 * Options for recovery operation
 */
export interface RecoveryOptions {
  /** Just report pending, don't sync */
  dryRun?: boolean;
  /** Limit number of sessions to sync */
  maxSessions?: number;
}

/**
 * Service for detecting and recovering unsynced sessions.
 *
 * Called on startup when recoveryOnStartup is enabled, or manually
 * via CLI. Useful for crash recovery when hooks failed.
 */
export class RecoveryService {
  constructor(
    private readonly sessionSource: ISessionSource,
    private readonly extractionStateRepo: IExtractionStateRepository,
    private readonly syncService: SyncService
  ) {}

  /**
   * Check for sessions that haven't been synced and optionally sync them.
   *
   * Called on startup when recoveryOnStartup is enabled, or manually
   * via CLI. Useful for crash recovery when hooks failed.
   *
   * @param options Recovery options
   * @returns Recovery result with pending sessions and sync counts
   */
  async recover(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const config = loadConfig();

    // Check if recovery is enabled (unless explicit dryRun)
    if (!config.recoveryOnStartup && !options.dryRun) {
      return {
        pendingSessions: [],
        syncedSessions: 0,
        errors: [],
        skipped: true,
      };
    }

    // Discover all sessions
    const sessions = await this.sessionSource.discoverSessions();

    // Find pending sessions (not synced or incomplete)
    const pendingSessions: string[] = [];
    for (const session of sessions) {
      const state = await this.extractionStateRepo.findBySessionPath(session.path);
      if (!state || state.status !== "complete") {
        pendingSessions.push(session.path);
      }
    }

    // Log discovery
    logSync({
      level: "info",
      message: `Recovery scan found ${pendingSessions.length} pending sessions`,
    });

    // If dry run, just return pending list
    if (options.dryRun) {
      return {
        pendingSessions,
        syncedSessions: 0,
        errors: [],
        skipped: false,
      };
    }

    // Sync pending sessions (up to maxSessions limit)
    const toSync = options.maxSessions
      ? pendingSessions.slice(0, options.maxSessions)
      : pendingSessions;

    let syncedCount = 0;
    const errors: Array<{ sessionPath: string; error: string }> = [];

    for (const sessionPath of toSync) {
      try {
        // Extract session ID from path (last component without .jsonl)
        const sessionId = extractSessionId(sessionPath);

        await this.syncService.sync({ sessionFilter: sessionId });
        syncedCount++;

        logSync({
          level: "info",
          message: `Recovery synced session ${sessionId}`,
          sessionId,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push({ sessionPath, error });

        logSync({
          level: "error",
          message: `Recovery failed for ${sessionPath}: ${error}`,
          error,
        });
      }
    }

    return {
      pendingSessions,
      syncedSessions: syncedCount,
      errors,
      skipped: false,
    };
  }

  /**
   * Get count of pending sessions without syncing.
   * Fast operation for status display.
   *
   * @returns Number of sessions not yet synced
   */
  async getPendingCount(): Promise<number> {
    const sessions = await this.sessionSource.discoverSessions();
    let count = 0;

    for (const session of sessions) {
      const state = await this.extractionStateRepo.findBySessionPath(session.path);
      if (!state || state.status !== "complete") {
        count++;
      }
    }

    return count;
  }
}

/**
 * Extract session ID from a session file path.
 *
 * Handles both Unix and Windows path separators.
 *
 * @param sessionPath Full path to session JSONL file
 * @returns Session ID (filename without .jsonl extension)
 */
export function extractSessionId(sessionPath: string): string {
  const parts = sessionPath.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  return filename.replace(/\.jsonl$/, "");
}
