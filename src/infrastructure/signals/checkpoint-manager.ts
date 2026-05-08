/**
 * Checkpoint Manager
 *
 * Manages sync progress checkpointing for recovery from interrupted syncs.
 * Checkpoints stored in ~/.memory-nexus/sync-checkpoint.json
 *
 * Implements graceful handling of missing/invalid checkpoint files.
 *
 * Each function accepts an optional `path` argument. When omitted, the
 * production XDG-resolved path is used. When provided, that path is used
 * directly (used by tests to point at a temp file). This avoids
 * module-level mutable state and the test-pollution risk that comes with
 * it; see scripts/check-test-isolation.ts.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getCheckpointPath as resolveCheckpointPath } from "../paths.js";

/**
 * Sync checkpoint interface
 *
 * Tracks progress of an interrupted sync operation:
 * - startedAt: When the sync began (ISO timestamp)
 * - totalSessions: Total number of sessions to sync
 * - completedSessions: Number of sessions completed
 * - completedSessionIds: List of completed session IDs for filtering
 * - lastCompletedAt: When last session was completed (ISO timestamp, null if none)
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
 * Get the path to the checkpoint file.
 *
 * @param override Optional explicit path (used by tests). When omitted,
 *   resolves via the production paths module (XDG-respecting).
 * @returns Path to sync-checkpoint.json
 */
export function getCheckpointPath(override?: string): string {
    return override ?? resolveCheckpointPath();
}

/**
 * Save checkpoint to disk
 *
 * Creates the directory if it doesn't exist.
 * Handles errors gracefully (logs but doesn't throw).
 *
 * @param checkpoint Checkpoint data to save
 * @param path Optional explicit path (used by tests)
 */
export function saveCheckpoint(checkpoint: SyncCheckpoint, path?: string): void {
    const checkpointPath = getCheckpointPath(path);
    const checkpointDir = dirname(checkpointPath);

    try {
        // Create directory if missing
        mkdirSync(checkpointDir, { recursive: true });

        // Write with pretty formatting
        writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");
    } catch (error) {
        // Log but don't throw - checkpoint failures shouldn't break sync
        console.warn("Failed to save checkpoint:", (error as Error).message);
    }
}

/**
 * Load checkpoint from disk
 *
 * Gracefully handles:
 * - Missing checkpoint file (returns null)
 * - Invalid JSON (returns null with warning)
 *
 * @param path Optional explicit path (used by tests)
 * @returns Checkpoint data or null if not found/invalid
 */
export function loadCheckpoint(path?: string): SyncCheckpoint | null {
    const checkpointPath = getCheckpointPath(path);

    if (!existsSync(checkpointPath)) {
        return null;
    }

    try {
        const content = readFileSync(checkpointPath, "utf-8");
        const loaded = JSON.parse(content) as SyncCheckpoint;

        // Basic validation
        if (
            typeof loaded.startedAt !== "string" ||
            typeof loaded.totalSessions !== "number" ||
            typeof loaded.completedSessions !== "number" ||
            !Array.isArray(loaded.completedSessionIds)
        ) {
            console.warn("Invalid checkpoint format, ignoring");
            return null;
        }

        return loaded;
    } catch {
        console.warn("Invalid checkpoint JSON, ignoring");
        return null;
    }
}

/**
 * Clear checkpoint from disk
 *
 * Called on successful sync completion.
 * Silently ignores missing file.
 *
 * @param path Optional explicit path (used by tests)
 */
export function clearCheckpoint(path?: string): void {
    const checkpointPath = getCheckpointPath(path);

    if (existsSync(checkpointPath)) {
        try {
            unlinkSync(checkpointPath);
        } catch (error) {
            // Log but don't throw
            console.warn("Failed to clear checkpoint:", (error as Error).message);
        }
    }
}

/**
 * Check if a checkpoint exists
 *
 * Quick existence check without loading the file.
 *
 * @param path Optional explicit path (used by tests)
 * @returns true if checkpoint file exists
 */
export function hasCheckpoint(path?: string): boolean {
    return existsSync(getCheckpointPath(path));
}
