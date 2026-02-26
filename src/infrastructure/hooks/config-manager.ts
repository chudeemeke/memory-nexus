/**
 * Configuration Manager
 *
 * Manages memory configuration with defaults.
 * Configuration stored at the XDG config path via centralized paths module.
 *
 * Implements graceful handling of missing/invalid config files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
    getConfigDir as pathsGetConfigDir,
    getConfigPath as pathsGetConfigPath,
} from "../paths.js";

/**
 * Test path override for config file
 * When set, all config operations use this path instead of the default
 */
let testConfigPath: string | null = null;

/**
 * Set test config path override
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestConfigPath(path: string | null): void {
    testConfigPath = path;
}

/**
 * Embedding configuration data interface
 *
 * Plain object shape for embedding config stored in JSON.
 * The factory validates via domain value objects when needed.
 */
export interface EmbeddingConfigData {
    /** Whether embedding generation is enabled */
    enabled: boolean;
    /** Provider identifier (e.g., "local", "openai", "ollama") */
    provider: string;
    /** Model identifier (e.g., "Xenova/all-MiniLM-L6-v2") */
    model: string;
    /** Number of dimensions in the embedding vectors */
    dimensions: number;
    /** Number of messages to embed per batch */
    batchSize: number;
}

/**
 * Memory configuration interface
 *
 * All options from CONTEXT.md:
 * - autoSync: Enable automatic hook-based sync
 * - recoveryOnStartup: Scan for unsaved sessions on first command
 * - syncOnCompaction: Trigger sync on PreCompact event
 * - timeout: Sync timeout in milliseconds
 * - logLevel: Logging verbosity
 * - logRetentionDays: Days to keep log files
 * - showFailures: Show failure notifications to user
 * - embedding: Embedding provider configuration
 */
export interface MemoryConfig {
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
    /** Embedding provider configuration */
    embedding: EmbeddingConfigData;
}

/**
 * Default embedding configuration
 *
 * Local provider with all-MiniLM-L6-v2 model (384 dimensions).
 * Enabled by default so embedding features are opt-out.
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfigData = {
    enabled: true,
    provider: "local",
    model: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
    batchSize: 100,
};

/**
 * Default configuration with all features enabled
 *
 * Matches CONTEXT.md specification:
 * - All sync features enabled (autoSync, recoveryOnStartup, syncOnCompaction)
 * - 5 second timeout (matches OpenClaw pattern)
 * - Info log level for reasonable verbosity
 * - 7 day log retention
 * - Silent failures by default (never interrupt user)
 * - Local embedding provider with all-MiniLM-L6-v2
 */
export const DEFAULT_CONFIG: MemoryConfig = {
    autoSync: true,
    recoveryOnStartup: true,
    syncOnCompaction: true,
    timeout: 5000,
    logLevel: "info",
    logRetentionDays: 7,
    showFailures: false,
    embedding: DEFAULT_EMBEDDING_CONFIG,
};

/**
 * Get the path to the config directory
 *
 * @returns Path to the config directory (or test override directory)
 */
export function getConfigDir(): string {
    if (testConfigPath !== null) {
        return dirname(testConfigPath);
    }
    return pathsGetConfigDir();
}

/**
 * Get the path to the config file
 *
 * @returns Path to config.json (or test override)
 */
export function getConfigPath(): string {
    if (testConfigPath !== null) {
        return testConfigPath;
    }
    return pathsGetConfigPath();
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
export function loadConfig(): MemoryConfig {
    const configPath = getConfigPath();

    if (!existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
    }

    try {
        const content = readFileSync(configPath, "utf-8");
        const loaded = JSON.parse(content) as Partial<MemoryConfig>;
        return {
            ...DEFAULT_CONFIG,
            ...loaded,
            embedding: { ...DEFAULT_EMBEDDING_CONFIG, ...(loaded.embedding ?? {}) },
        };
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
export function saveConfig(config: Partial<MemoryConfig>): void {
    const configPath = getConfigPath();
    const configDir = dirname(configPath);

    // Create directory if missing
    mkdirSync(configDir, { recursive: true });

    // Load existing config if present
    let existing: Partial<MemoryConfig> = {};
    if (existsSync(configPath)) {
        try {
            const content = readFileSync(configPath, "utf-8");
            existing = JSON.parse(content) as Partial<MemoryConfig>;
        } catch {
            // Ignore invalid existing config
        }
    }

    // Merge existing with new config
    const merged = { ...existing, ...config };

    // Write with pretty formatting
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
}
