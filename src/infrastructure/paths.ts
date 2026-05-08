/**
 * Centralized Paths Module
 *
 * Single source of truth for all filesystem paths used by memory.
 * Respects XDG Base Directory Specification with correct fallbacks.
 *
 * Config paths: $XDG_CONFIG_HOME/memory (default: ~/.config/memory)
 * Data paths:   $XDG_DATA_HOME/memory  (default: ~/.local/share/memory)
 * Legacy path:  ~/.memory-nexus (for migration detection)
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Application name used in path construction (internal only) */
const APP_NAME = "memory";

/**
 * Test override paths.
 * When set, these take precedence over all other path resolution.
 */
interface TestPathOverrides {
    configDir?: string;
    dataDir?: string;
    memoryDir?: string;
}

let testOverrides: TestPathOverrides | null = null;

/**
 * Set test path overrides.
 *
 * Allows tests to isolate path resolution without touching real directories.
 * Config and data dirs can be overridden independently.
 *
 * @param overrides Partial overrides (configDir and/or dataDir)
 */
export function setTestPaths(overrides: TestPathOverrides): void {
    testOverrides = overrides;
}

/**
 * Reset test path overrides to default behavior.
 */
export function resetTestPaths(): void {
    testOverrides = null;
}

/**
 * Get the configuration directory.
 *
 * Resolution order:
 * 1. Test override (if set)
 * 2. $XDG_CONFIG_HOME/memory (if XDG_CONFIG_HOME set)
 * 3. ~/.config/memory (default)
 *
 * @returns Absolute path to the config directory
 */
export function getConfigDir(): string {
    if (testOverrides?.configDir !== undefined) {
        return testOverrides.configDir;
    }

    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) {
        return join(xdgConfig, APP_NAME);
    }

    return join(homedir(), ".config", APP_NAME);
}

/**
 * Get the data directory.
 *
 * Resolution order:
 * 1. Test override (if set)
 * 2. $XDG_DATA_HOME/memory (if XDG_DATA_HOME set)
 * 3. ~/.local/share/memory (default)
 *
 * @returns Absolute path to the data directory
 */
export function getDataDir(): string {
    if (testOverrides?.dataDir !== undefined) {
        return testOverrides.dataDir;
    }

    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgData) {
        return join(xdgData, APP_NAME);
    }

    return join(homedir(), ".local", "share", APP_NAME);
}

/**
 * Get the legacy directory path.
 *
 * Always returns ~/.memory-nexus regardless of XDG vars or test overrides.
 * Used solely for migration detection.
 *
 * @returns Absolute path to the legacy directory
 */
export function getLegacyDir(): string {
    return join(homedir(), ".memory-nexus");
}

/**
 * Get the memory directory path.
 *
 * Returns the directory where agent-written markdown files are stored
 * (DECISIONS.md, LEARNINGS.md, USER-PREFS.md, daily logs, per-project notes).
 * Not under XDG -- this is a content directory authored directly by the user
 * and Claude, separate from the tool's own config/data.
 *
 * Resolution order:
 * 1. Test override (if set; deprecated -- prefer $MEMORY_FILES_DIR)
 * 2. $MEMORY_FILES_DIR (if set and non-empty)
 * 3. ~/.memory (default)
 *
 * Env-var semantics (consistent with XDG_CONFIG_HOME / XDG_DATA_HOME):
 *  - empty string is ignored (falls through to default)
 *  - no `~` expansion -- pass an absolute or fully-resolved path
 *  - relative paths are used as-is and resolved by the consuming syscall
 *
 * Use cases for $MEMORY_FILES_DIR (production, beyond tests):
 *  - sandboxed runs where you don't want to touch the user's real ~/.memory
 *  - container/CI workflows that need a writable location under a chosen mount
 *  - multi-instance setups (e.g., per-profile development)
 *
 * @returns Absolute path to the memory directory
 */
export function getMemoryDir(): string {
    if (testOverrides?.memoryDir !== undefined) {
        return testOverrides.memoryDir;
    }
    const env = process.env.MEMORY_FILES_DIR;
    if (env) return env;
    return join(homedir(), ".memory");
}

/**
 * Get the path to the config file.
 *
 * @returns Absolute path to config.json
 */
export function getConfigPath(): string {
    return join(getConfigDir(), "config.json");
}

/**
 * Get the path to the database file.
 *
 * @returns Absolute path to memory.db
 */
export function getDbPath(): string {
    return join(getDataDir(), "memory.db");
}

/**
 * Get the path to the logs directory.
 *
 * @returns Absolute path to the logs directory
 */
export function getLogDir(): string {
    return join(getDataDir(), "logs");
}

/**
 * Get the path to the hooks directory.
 *
 * @returns Absolute path to the hooks directory
 */
export function getHookDir(): string {
    return join(getDataDir(), "hooks");
}

/**
 * Get the path to the backups directory.
 *
 * @returns Absolute path to the backups directory
 */
export function getBackupDir(): string {
    return join(getDataDir(), "backups");
}

/**
 * Get the path to the sync checkpoint file.
 *
 * @returns Absolute path to sync-checkpoint.json
 */
export function getCheckpointPath(): string {
    return join(getDataDir(), "sync-checkpoint.json");
}
