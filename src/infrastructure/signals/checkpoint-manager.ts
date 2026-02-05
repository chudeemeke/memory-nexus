/**
 * Checkpoint Manager
 *
 * Manages sync progress checkpointing for recovery from interrupted syncs.
 * Checkpoints stored in ~/.memory-nexus/sync-checkpoint.json
 *
 * Implements graceful handling of missing/invalid checkpoint files.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Test path override for checkpoint file
 * When set, all checkpoint operations use this path instead of the default
 */
let testCheckpointPath: string | null = null;

/**
 * Set test checkpoint path override
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestCheckpointPath(path: string | null): void {
    testCheckpointPath = path;
}

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
 * Get the path to the checkpoint file
 *
 * @returns Path to ~/.memory-nexus/sync-checkpoint.json (or test override)
 */
export function getCheckpointPath(): string {
    if (testCheckpointPath !== null) {
        return testCheckpointPath;
    }
    return join(homedir(), ".memory-nexus", "sync-checkpoint.json");
}

/**
 * Save checkpoint to disk
 *
 * Creates the directory if it doesn't exist.
 * Handles errors gracefully (logs but doesn't throw).
 *
 * @param checkpoint Checkpoint data to save
 */
export function saveCheckpoint(checkpoint: SyncCheckpoint): void {
    const checkpointPath = getCheckpointPath();
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
 * @returns Checkpoint data or null if not found/invalid
 */
export function loadCheckpoint(): SyncCheckpoint | null {
    const checkpointPath = getCheckpointPath();

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
 */
export function clearCheckpoint(): void {
    const checkpointPath = getCheckpointPath();

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
 * @returns true if checkpoint file exists
 */
export function hasCheckpoint(): boolean {
    return existsSync(getCheckpointPath());
}
