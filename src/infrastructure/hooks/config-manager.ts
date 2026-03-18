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
    /** API key for remote providers (e.g., OpenAI) */
    apiKey?: string;
    /** Base URL override for provider API endpoint */
    baseUrl?: string;
}

/**
 * Search configuration data interface
 *
 * Plain object shape for search config stored in JSON.
 */
export interface SearchConfigData {
    /** Default search mode */
    defaultMode: "auto" | "fts" | "vector" | "hybrid";
    /** Temporal decay settings */
    temporalDecay: {
        /** Whether temporal decay is enabled */
        enabled: boolean;
        /** Half-life in days for temporal decay */
        halfLifeDays: number;
    };
    /** Whether the embedding hint has been shown (one-time) */
    hintShown?: boolean;
}

/**
 * Default search configuration
 *
 * Auto mode with 30-day temporal decay half-life.
 */
export const DEFAULT_SEARCH_CONFIG: SearchConfigData = {
    defaultMode: "auto",
    temporalDecay: {
        enabled: true,
        halfLifeDays: 30,
    },
};

/**
 * Ambient context configuration data interface
 *
 * Controls automatic context generation into Claude Code's
 * auto memory directory during sync.
 */
export interface AmbientContextConfigData {
    /** Whether ambient context generation is enabled */
    enabled: boolean;
    /** Token budget for context.md generation */
    budget: number;
}

/**
 * Default ambient context configuration
 *
 * Enabled by default with 800 token budget.
 */
export const DEFAULT_AMBIENT_CONTEXT_CONFIG: AmbientContextConfigData = {
    enabled: true,
    budget: 800,
};

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
 * - search: Hybrid search configuration
 * - ambientContext: Ambient context generation configuration
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
    /** Hybrid search configuration */
    search: SearchConfigData;
    /** Ambient context generation configuration */
    ambientContext: AmbientContextConfigData;
}

/**
 * Provider-specific default model and dimensions
 *
 * Maps provider identifiers to their default model and dimensions.
 * Used by resolveProviderDefaults() to apply correct defaults
 * when a user sets provider without explicit model/dimensions.
 */
export const PROVIDER_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
    local: { model: "Xenova/all-MiniLM-L6-v2", dimensions: 384 },
    openai: { model: "text-embedding-3-small", dimensions: 1536 },
    ollama: { model: "nomic-embed-text", dimensions: 768 },
};

/**
 * Resolve provider-specific defaults for model and dimensions
 *
 * After deep-merging user config with DEFAULT_EMBEDDING_CONFIG,
 * checks if the provider was changed from "local" and whether
 * model/dimensions were user-explicit. If not, applies provider-specific
 * defaults from PROVIDER_DEFAULTS.
 *
 * Uses `in` operator to check field presence in the raw user JSON:
 * - "model" in userEmbedding returns true even if value matches a default
 * - This correctly preserves user-explicit values
 *
 * @param merged The deep-merged embedding config
 * @param userEmbedding The raw user embedding section from JSON (before merge)
 * @returns Resolved embedding config with correct provider defaults
 */
export function resolveProviderDefaults(
    merged: EmbeddingConfigData,
    userEmbedding: Partial<EmbeddingConfigData> | undefined,
): EmbeddingConfigData {
    const provider = merged.provider;

    // For local provider or when no user embedding section, defaults are already correct
    if (provider === "local" || !userEmbedding) {
        return merged;
    }

    const providerDefaults = PROVIDER_DEFAULTS[provider];
    const result = { ...merged };

    // Apply provider-specific model default if user did not explicitly set model
    if (!("model" in userEmbedding)) {
        result.model = providerDefaults?.model ?? merged.model;
    }

    // Apply provider-specific dimensions default if user did not explicitly set dimensions
    if (!("dimensions" in userEmbedding)) {
        result.dimensions = providerDefaults?.dimensions ?? merged.dimensions;
    }

    return result;
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
    search: DEFAULT_SEARCH_CONFIG,
    ambientContext: DEFAULT_AMBIENT_CONTEXT_CONFIG,
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
        const userEmbedding = loaded.embedding as Partial<EmbeddingConfigData> | undefined;
        const mergedEmbedding = { ...DEFAULT_EMBEDDING_CONFIG, ...(userEmbedding ?? {}) };
        return {
            ...DEFAULT_CONFIG,
            ...loaded,
            embedding: resolveProviderDefaults(mergedEmbedding, userEmbedding),
            search: {
                ...DEFAULT_SEARCH_CONFIG,
                ...(loaded.search ?? {}),
                temporalDecay: {
                    ...DEFAULT_SEARCH_CONFIG.temporalDecay,
                    ...((loaded.search as Partial<SearchConfigData> | undefined)?.temporalDecay ?? {}),
                },
            },
            ambientContext: {
                ...DEFAULT_AMBIENT_CONTEXT_CONFIG,
                ...((loaded.ambientContext as Partial<AmbientContextConfigData> | undefined) ?? {}),
            },
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
