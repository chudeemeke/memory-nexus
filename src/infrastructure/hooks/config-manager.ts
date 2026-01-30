/**
 * Configuration Manager
 *
 * Manages memory-nexus configuration with defaults.
 * Configuration stored in ~/.memory-nexus/config.json
 *
 * Implements graceful handling of missing/invalid config files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Memory-nexus configuration interface
 *
 * All options from CONTEXT.md:
 * - autoSync: Enable automatic hook-based sync
 * - recoveryOnStartup: Scan for unsaved sessions on first command
 * - syncOnCompaction: Trigger sync on PreCompact event
 * - timeout: Sync timeout in milliseconds
 * - logLevel: Logging verbosity
 * - logRetentionDays: Days to keep log files
 * - showFailures: Show failure notifications to user
 */
export interface MemoryNexusConfig {
    /** Enable automatic hook-based sync */
    autoSync: boolean;
    /** Scan for unsaved sessions on first command */
    recoveryOnStartup: boolean;
    /** Trigger sync on PreCompact event */
    syncOnCompaction: boolean;
    /** Sync timeout in milliseconds */
    timeout: number;
    /** Logging verbosity */
    logLevel: "debug" | "info" | "warn" | "error";
    /** Days to keep log files */
    logRetentionDays: number;
    /** Show failure notifications to user */
    showFailures: boolean;
}

/**
 * Default configuration with all features enabled
 *
 * Matches CONTEXT.md specification:
 * - All sync features enabled (autoSync, recoveryOnStartup, syncOnCompaction)
 * - 5 second timeout (matches OpenClaw pattern)
 * - Info log level for reasonable verbosity
 * - 7 day log retention
 * - Silent failures by default (never interrupt user)
 */
export const DEFAULT_CONFIG: MemoryNexusConfig = {
    autoSync: true,
    recoveryOnStartup: true,
    syncOnCompaction: true,
    timeout: 5000,
    logLevel: "info",
    logRetentionDays: 7,
    showFailures: false,
};

/**
 * Get the path to the config directory
 *
 * @returns Path to ~/.memory-nexus/
 */
export function getConfigDir(): string {
    return join(homedir(), ".memory-nexus");
}

/**
 * Get the path to the config file
 *
 * @returns Path to ~/.memory-nexus/config.json
 */
export function getConfigPath(): string {
    return join(getConfigDir(), "config.json");
}

/**
 * Load configuration from disk
 *
 * Gracefully handles:
 * - Missing config file (returns defaults)
 * - Invalid JSON (returns defaults with warning)
 * - Partial config (merges with defaults)
 *
 * @returns Complete configuration with defaults applied
 */
export function loadConfig(): MemoryNexusConfig {
    const configPath = getConfigPath();

    if (!existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
    }

    try {
        const content = readFileSync(configPath, "utf-8");
        const loaded = JSON.parse(content) as Partial<MemoryNexusConfig>;
        return { ...DEFAULT_CONFIG, ...loaded };
    } catch {
        // Invalid config: fall back to defaults with warning
        // Note: Using console.warn to avoid circular dependency with log-writer
        console.warn("Invalid config.json, using defaults");
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save configuration to disk
 *
 * Creates the config directory if it doesn't exist.
 * Merges partial config with existing config (if present).
 * Writes JSON with 2-space indent for readability.
 *
 * @param config Partial configuration to save (merged with existing)
 */
export function saveConfig(config: Partial<MemoryNexusConfig>): void {
    const configPath = getConfigPath();
    const configDir = dirname(configPath);

    // Create directory if missing
    mkdirSync(configDir, { recursive: true });

    // Load existing config if present
    let existing: Partial<MemoryNexusConfig> = {};
    if (existsSync(configPath)) {
        try {
            const content = readFileSync(configPath, "utf-8");
            existing = JSON.parse(content) as Partial<MemoryNexusConfig>;
        } catch {
            // Ignore invalid existing config
        }
    }

    // Merge existing with new config
    const merged = { ...existing, ...config };

    // Write with pretty formatting
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
}
