/**
 * Centralized Paths Module
 *
 * Single source of truth for all filesystem paths used by memory.
 * Respects XDG Base Directory Specification with correct fallbacks.
 *
 * Config paths: $XDG_CONFIG_HOME/memory (default: ~/.config/memory)
 * Data paths:   $XDG_DATA_HOME/memory  (default: ~/.local/share/memory)
 * Memory files: $MEMORY_HOME           (default: ~/.memory)
 * Legacy path:  ~/.memory-nexus (for migration detection; not overridable)
 */

if (process.platform === "win32" && !process.env.HOME) {
    process.env.HOME = process.env.USERPROFILE;
}

import { homedir } from "node:os";
import { join } from "node:path";

/** Application name used in path construction (internal only) */
const APP_NAME = "memory";

/**
 * Get the configuration directory.
 *
 * Resolution order:
 * 1. $XDG_CONFIG_HOME/memory (if XDG_CONFIG_HOME set)
 * 2. ~/.config/memory (default)
 *
 * @returns Absolute path to the config directory
 */
export function getConfigDir(): string {
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
 * 1. $XDG_DATA_HOME/memory (if XDG_DATA_HOME set)
 * 2. ~/.local/share/memory (default)
 *
 * @returns Absolute path to the data directory
 */
export function getDataDir(): string {
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
 * 1. $MEMORY_HOME (if set and non-empty)
 * 2. ~/.memory (default)
 *
 * Env-var semantics (GNUPGHOME / JAVA_HOME tradition: exact tool-root path,
 * NOT the XDG_*_HOME "base + APP_NAME" convention):
 *  - $MEMORY_HOME=/foo means the memory dir IS /foo, not /foo/memory
 *  - empty string is ignored (falls through to default)
 *  - no `~` expansion -- pass an absolute or fully-resolved path
 *  - relative paths are used as-is and resolved by the consuming syscall
 *
 * Use cases for $MEMORY_HOME (production, beyond tests):
 *  - sandboxed runs where you don't want to touch the user's real ~/.memory
 *  - container/CI workflows that need a writable location under a chosen mount
 *  - multi-instance setups (e.g., per-profile development)
 *
 * @returns Absolute path to the memory directory
 */
export function getMemoryDir(): string {
    const env = process.env.MEMORY_HOME;
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

/**
 * Get the path to the events directory.
 *
 * @returns Absolute path to the events directory
 */
export function getEventsDir(): string {
    return join(getDataDir(), "events");
}

/**
 * Get the path to the event log file.
 *
 * @returns Absolute path to events.jsonl
 */
export function getEventLogPath(): string {
    return join(getEventsDir(), "events.jsonl");
}

