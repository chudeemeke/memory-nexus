/**
 * Migration Module
 *
 * Detects legacy ~/.memory-nexus/ directory and migrates data to new
 * XDG-compliant paths. All operations are synchronous with rollback
 * safety on failure.
 *
 * After successful data moves, re-installs hooks with new binary name
 * by calling uninstallHooks() then installHooks().
 */

import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    unlinkSync,
} from "node:fs";
import { join } from "node:path";

import {
    getConfigDir,
    getConfigPath,
    getDataDir,
    getDbPath,
    getCheckpointPath,
    getLogDir,
    getHookDir,
    getBackupDir,
    getLegacyDir,
} from "./paths.js";
import {
    uninstallHooks,
    installHooks,
} from "./hooks/settings-manager.js";

/**
 * Migration status values.
 *
 * - not-needed: No legacy directory exists (fresh install or already migrated+cleaned)
 * - pending: Legacy directory exists but new paths do not
 * - complete: New paths exist and no legacy directory remains
 * - partial: Both legacy and new paths exist (interrupted migration or manual partial copy)
 */
export type MigrationStatus = "not-needed" | "pending" | "complete" | "partial";

/**
 * Result of getMigrationStatus().
 */
export interface MigrationStatusResult {
    /** Whether the legacy directory exists */
    legacyExists: boolean;
    /** Whether the new config or data directory exists */
    newExists: boolean;
    /** Computed migration status */
    status: MigrationStatus;
}

/**
 * Result of migrateFromLegacy().
 */
export interface MigrationResult {
    /** Whether migration completed successfully (data was moved) */
    migrated: boolean;
    /** List of item names that were moved */
    itemsMoved: string[];
    /** Error messages (empty on full success) */
    errors: string[];
}

/**
 * Internal move item definition.
 */
interface MoveItem {
    /** Display name for tracking */
    name: string;
    /** Source path (in legacy dir) */
    source: string;
    /** Destination path (in new dirs) */
    dest: string;
    /** Whether this is a directory (vs file) */
    isDir: boolean;
}

/**
 * Check migration status by examining legacy and new paths.
 *
 * @returns Status result with legacy/new existence flags and computed status
 */
export function getMigrationStatus(): MigrationStatusResult {
    const legacyExists = existsSync(getLegacyDir());
    const newExists = existsSync(getConfigDir()) || existsSync(getDataDir());

    let status: MigrationStatus;
    if (!legacyExists && !newExists) {
        status = "not-needed";
    } else if (legacyExists && !newExists) {
        status = "pending";
    } else if (!legacyExists && newExists) {
        status = "complete";
    } else {
        status = "partial";
    }

    return { legacyExists, newExists, status };
}

/**
 * Check whether a legacy database needs migration to XDG paths.
 *
 * Stub: implementation in Task 16.1-01-B.
 */
export function isMigrationPending(): boolean {
    return false;
}

/**
 * Migrate data from legacy ~/.memory-nexus/ to new XDG paths.
 *
 * This function is SYNCHRONOUS. All filesystem operations use sync variants.
 *
 * Migration order (by priority):
 * 1. Database (memory.db) - most critical
 * 2. Config (config.json) - user preferences
 * 3. Checkpoint (sync-checkpoint.json) - sync progress
 * 4. Logs directory - debugging data
 * 5. Hooks directory - hook scripts
 * 6. Backups directory - settings backups
 *
 * On any move failure, all completed moves are rolled back in reverse order.
 * After successful data moves, hooks are re-installed with new binary name.
 * Hook re-install failure is logged but does not fail the migration.
 *
 * @returns Migration result with moved items list and any errors
 */
export function migrateFromLegacy(): MigrationResult {
    const legacyDir = getLegacyDir();

    // No legacy directory: nothing to migrate
    if (!existsSync(legacyDir)) {
        return { migrated: false, itemsMoved: [], errors: [] };
    }

    // Define move list in priority order
    const moveList: MoveItem[] = [
        {
            name: "memory.db",
            source: join(legacyDir, "memory.db"),
            dest: getDbPath(),
            isDir: false,
        },
        {
            name: "config.json",
            source: join(legacyDir, "config.json"),
            dest: getConfigPath(),
            isDir: false,
        },
        {
            name: "sync-checkpoint.json",
            source: join(legacyDir, "sync-checkpoint.json"),
            dest: getCheckpointPath(),
            isDir: false,
        },
        {
            name: "logs",
            source: join(legacyDir, "logs"),
            dest: getLogDir(),
            isDir: true,
        },
        {
            name: "hooks",
            source: join(legacyDir, "hooks"),
            dest: getHookDir(),
            isDir: true,
        },
        {
            name: "backups",
            source: join(legacyDir, "backups"),
            dest: getBackupDir(),
            isDir: true,
        },
    ];

    // Ensure target directories exist
    try {
        mkdirSync(getConfigDir(), { recursive: true });
        mkdirSync(getDataDir(), { recursive: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { migrated: false, itemsMoved: [], errors: [`Failed to create target directories: ${msg}`] };
    }

    // Track completed moves for potential rollback
    const completedMoves: Array<{ item: MoveItem; rolledBack: boolean }> = [];
    const itemsMoved: string[] = [];

    for (const item of moveList) {
        // Skip items that don't exist in legacy dir
        if (!existsSync(item.source)) {
            continue;
        }

        try {
            moveFileOrDir(item.source, item.dest, item.isDir);
            completedMoves.push({ item, rolledBack: false });
            itemsMoved.push(item.name);
        } catch (error) {
            // Move failed: roll back all completed moves in reverse order
            const msg = error instanceof Error ? error.message : String(error);
            const errors = [`Failed to move ${item.name}: ${msg}`];

            for (let i = completedMoves.length - 1; i >= 0; i--) {
                const completed = completedMoves[i]!;
                try {
                    moveFileOrDir(completed.item.dest, completed.item.source, completed.item.isDir);
                    completed.rolledBack = true;
                } catch (rollbackError) {
                    const rollbackMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                    errors.push(`Rollback failed for ${completed.item.name}: ${rollbackMsg}`);
                }
            }

            return { migrated: false, itemsMoved: [], errors };
        }
    }

    // No items were moved (legacy dir exists but is empty of known items)
    if (itemsMoved.length === 0) {
        return { migrated: false, itemsMoved: [], errors: [] };
    }

    // Re-install hooks with new binary name
    const errors: string[] = [];
    try {
        uninstallHooks();
        installHooks();
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`hook re-install failed: ${msg}`);
    }

    // Attempt to remove empty legacy directory
    try {
        const remaining = readdirSync(legacyDir);
        if (remaining.length === 0) {
            rmSync(legacyDir, { recursive: true });
        }
    } catch {
        // Non-critical: ignore removal errors
    }

    // Print notice to stderr
    process.stderr.write("Migrated data from ~/.memory-nexus to new paths\n");

    return { migrated: true, itemsMoved, errors };
}

/**
 * Move a file or directory, handling cross-filesystem (EXDEV) errors.
 *
 * First attempts renameSync (atomic on same filesystem).
 * On EXDEV error, falls back to copy + delete.
 *
 * Exported for testing EXDEV fallback logic.
 *
 * @param source Source path
 * @param dest Destination path
 * @param isDir Whether the source is a directory
 */
export function moveFileOrDir(source: string, dest: string, isDir: boolean): void {
    // Ensure destination parent directory exists
    const destParent = join(dest, "..");
    mkdirSync(destParent, { recursive: true });

    try {
        renameSync(source, dest);
    } catch (error) {
        const errno = (error as NodeJS.ErrnoException).code;
        if (errno === "EXDEV") {
            // Cross-filesystem: copy then delete
            if (isDir) {
                cpSync(source, dest, { recursive: true });
                rmSync(source, { recursive: true });
            } else {
                copyFileSync(source, dest);
                unlinkSync(source);
            }
        } else {
            throw error;
        }
    }
}
