/**
 * Health Checker
 *
 * Provides database integrity checking and system health verification.
 * Used by the doctor command for diagnostics.
 *
 * Features:
 * - SQLite PRAGMA integrity_check and quick_check
 * - Directory permission verification
 * - Hook installation status
 * - Configuration validation
 */

import { Database } from "bun:sqlite";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDefaultDbPath } from "./connection.js";
import {
    loadConfig,
    getConfigDir,
    getLogDir,
    checkHooksInstalled,
    readRecentLogs,
    type MemoryConfig,
    type HookStatus,
} from "../hooks/index.js";
import {
    checkEmbeddingProviderReadiness,
    checkExtractionProviderReadiness,
    getExtractionModel,
    resolveExtractionProviderId,
} from "../providers/provider-registry.js";

/**
 * Database health status
 */
export interface DatabaseHealth {
    /** Database file exists */
    exists: boolean;
    /** Database file is readable */
    readable: boolean;
    /** Database file is writable */
    writable: boolean;
    /** Integrity check result */
    integrity: "ok" | "corrupted" | "unknown";
    /** Database file size in bytes */
    size: number;
}

/**
 * Directory permissions status
 */
export interface PermissionsHealth {
    /** Config directory is accessible */
    configDir: boolean;
    /** Logs directory is accessible */
    logsDir: boolean;
    /** Claude source directory (~/.claude/projects) is accessible */
    sourceDir: boolean;
}

/**
 * Hook status
 */
export interface HooksHealth {
    /** Hooks are installed in settings.json */
    installed: boolean;
    /** autoSync is enabled in config */
    enabled: boolean;
    /** Last hook run timestamp */
    lastRun: Date | null;
}

/**
 * Configuration validity status
 */
export interface ConfigHealth {
    /** Configuration is valid */
    valid: boolean;
    /** Issues found during validation */
    issues: string[];
}

/**
 * Embedding health status
 */
export interface EmbeddingHealth {
    /** Whether embedding config exists */
    configured: boolean;
    /** Provider identifier */
    provider: string;
    /** Model identifier */
    model: string;
    /** Embedding dimensions */
    dimensions: number;
    /** Whether embedding is enabled */
    enabled: boolean;
    /** Whether the provider is ready to generate embeddings */
    ready: boolean;
    /** Reason for readiness status (e.g., "API key not set") */
    readyReason?: string | undefined;
}

/**
 * sqlite-vec extension health status
 */
export interface SqliteVecHealth {
    /** Whether sqlite-vec extension is loadable */
    available: boolean;
    /** sqlite-vec version string, or null if not available */
    version: string | null;
}

/**
 * Search capability status
 */
export interface SearchCapability {
    /** FTS5 is available */
    fts5: boolean;
    /** sqlite-vec extension is loaded */
    sqliteVec: boolean;
    /** Number of messages with embeddings */
    embeddedCount: number;
    /** Total number of messages */
    totalMessages: number;
    /** Percentage of messages with embeddings */
    coveragePercent: number;
    /** Default search mode from config */
    defaultMode: string;
    /** Whether vector search is ready (extension + embeddings) */
    vectorReady: boolean;
}

/**
 * LLM Extraction health status
 */
export interface LlmExtractionHealth {
    /** The active LLM provider */
    provider: string;
    /** The active LLM model */
    model: string;
    /** Whether extraction is configured and ready */
    ready: boolean;
    /** Reason for readiness status */
    readyReason?: string | undefined;
}

/**
 * Complete health check result
 */
export interface HealthCheckResult {
    /** Database health status */
    database: DatabaseHealth;
    /** Directory permissions status */
    permissions: PermissionsHealth;
    /** Hook status */
    hooks: HooksHealth;
    /** Configuration validity status */
    config: ConfigHealth;
    /** Embedding configuration status */
    embedding: EmbeddingHealth;
    /** sqlite-vec extension availability */
    sqliteVec: SqliteVecHealth;
    /** Search capability status */
    searchCapability: SearchCapability;
    /** LLM extraction provider status */
    llmExtraction: LlmExtractionHealth;
}


/**
 * Test path overrides for testing
 */
export interface HealthCheckOverrides {
    /** Override database path */
    dbPath?: string | undefined;
    /** Override config directory */
    configDir?: string | undefined;
    /** Override logs directory */
    logsDir?: string | undefined;
    /** Override source directory */
    sourceDir?: string | undefined;
    /** Override hook-related paths (settings.json, backup, hook script) */
    hookOverrides?: import("../hooks/settings-manager.js").PathOverrides | undefined;
    /** Optional pre-calculated hook status to avoid redundant file reads */
    preCalculatedHookStatus?: HookStatus | undefined;
}

/**
 * Check database integrity using PRAGMA integrity_check
 *
 * Full integrity check that verifies:
 * - All pages are reachable
 * - All index entries exist
 * - All UNIQUE/NOT NULL constraints
 *
 * @param db Database instance
 * @returns "ok" if integrity check passes, "corrupted" otherwise
 */
export function checkDatabaseIntegrity(db: Database): "ok" | "corrupted" {
    try {
        const result = db.query<{ integrity_check: string }, []>(
            "PRAGMA integrity_check(1);"
        ).get();

        return result?.integrity_check === "ok" ? "ok" : "corrupted";
    } catch {
        return "corrupted";
    }
}

/**
 * Check database integrity using PRAGMA quick_check
 *
 * Faster check that skips some verifications:
 * - Verifies structural integrity
 * - Skips index consistency checks
 * - Good for startup verification
 *
 * @param db Database instance
 * @returns "ok" if quick check passes, "corrupted" otherwise
 */
export function checkQuickIntegrity(db: Database): "ok" | "corrupted" {
    try {
        const result = db.query<{ quick_check: string }, []>(
            "PRAGMA quick_check(1);"
        ).get();

        return result?.quick_check === "ok" ? "ok" : "corrupted";
    } catch {
        return "corrupted";
    }
}

/**
 * Check directory permissions
 *
 * @param path Directory path to check
 * @returns Readable and writable status
 */
export function checkDirectoryPermissions(path: string): { readable: boolean; writable: boolean } {
    if (!existsSync(path)) {
        return { readable: false, writable: false };
    }

    let readable = false;
    let writable = false;

    try {
        accessSync(path, constants.R_OK);
        readable = true;
    } catch {
        // Not readable
    }

    try {
        accessSync(path, constants.W_OK);
        writable = true;
    } catch {
        // Not writable
    }

    return { readable, writable };
}

/**
 * Check hook installation and configuration status
 *
 * @param logPath Optional explicit log file path (used by tests to point
 *   at a fixture; production reads from the XDG-resolved path)
 * @param configPath Optional explicit config file path (used by tests)
 * @returns Hook status including installation, enabled state, and last run
 */
export function checkHookStatus(
    logPath?: string | undefined,
    configPath?: string | undefined,
    hookOverrides?: import("../hooks/settings-manager.js").PathOverrides | undefined,
    preCalculatedHookStatus?: HookStatus | undefined
): HooksHealth {
    const hookStatus = preCalculatedHookStatus ?? checkHooksInstalled(hookOverrides);
    const config = loadConfig(configPath);
    const logs = readRecentLogs(1, logPath);

    const firstLog = logs[0];
    return {
        installed: hookStatus.sessionEnd && hookStatus.preCompact,
        enabled: config.autoSync,
        lastRun: firstLog ? new Date(firstLog.timestamp) : null,
    };
}

/**
 * Valid log levels
 */
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"];

/**
 * Validate configuration and collect issues
 *
 * @param configPath Optional explicit config file path (used by tests)
 * @returns Validity status and list of issues
 */
export function checkConfigValidity(configPath?: string): ConfigHealth {
    const issues: string[] = [];

    try {
        const config = loadConfig(configPath);

        // Validate each field type
        if (typeof config.autoSync !== "boolean") {
            issues.push("autoSync is not a boolean");
        }

        if (typeof config.recoveryOnStartup !== "boolean") {
            issues.push("recoveryOnStartup is not a boolean");
        }

        if (typeof config.syncOnCompaction !== "boolean") {
            issues.push("syncOnCompaction is not a boolean");
        }

        if (typeof config.timeout !== "number" || !Number.isFinite(config.timeout) || config.timeout < 0) {
            issues.push("timeout is not a valid positive number");
        }

        if (!VALID_LOG_LEVELS.includes(config.logLevel)) {
            issues.push(`logLevel "${config.logLevel}" is not valid (expected: ${VALID_LOG_LEVELS.join(", ")})`);
        }

        if (typeof config.logRetentionDays !== "number" || !Number.isFinite(config.logRetentionDays) || config.logRetentionDays < 0) {
            issues.push("logRetentionDays is not a valid positive number");
        }

        if (typeof config.showFailures !== "boolean") {
            issues.push("showFailures is not a boolean");
        }

        return {
            valid: issues.length === 0,
            issues,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`Failed to load config: ${message}`);
        return {
            valid: false,
            issues,
        };
    }
}

/**
 * Check sqlite-vec extension availability
 *
 * Attempts to load sqlite-vec in a temporary in-memory database
 * and query its version. Closes the database before returning.
 *
 * @returns sqlite-vec availability and version
 */
export function checkSqliteVecAvailability(): SqliteVecHealth {
    try {
        const sqliteVec = require("sqlite-vec");
        const db = new Database(":memory:");
        try {
            sqliteVec.load(db);
            const result = db.query("SELECT vec_version()").get() as { "vec_version()": string };
            return { available: true, version: result["vec_version()"] };
        } finally {
            db.close();
        }
    } catch {
        return { available: false, version: null };
    }
}

/**
 * Check embedding configuration status
 *
 * Loads config and returns the embedding section values.
 *
 * @param configPath Optional explicit config file path (used by tests)
 * @returns Embedding health status
 */
export function checkEmbeddingConfig(configPath?: string): EmbeddingHealth {
    const config = loadConfig(configPath);
    const embedding = config.embedding;

    const readiness = checkEmbeddingProviderReadiness(embedding);

    return {
        configured: true,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.dimensions,
        enabled: embedding.enabled,
        ready: readiness.ready,
        readyReason: readiness.readyReason,
    };
}

/**
 * Check LLM Fact Extraction provider health status
 *
 * @param configPath Optional explicit config file path
 * @returns LLM extraction health status
 */
export function checkLlmExtractionHealth(configPath?: string): LlmExtractionHealth {
    const config = loadConfig(configPath);
    const provider = resolveExtractionProviderId(config);
    const readiness = checkExtractionProviderReadiness(config, provider);

    return {
        provider,
        model: getExtractionModel(config, provider),
        ready: readiness.ready,
        readyReason: readiness.readyReason,
    };
}


/**
 * Run comprehensive health check
 *
 * Orchestrates all health checks:
 * - Database existence, permissions, and integrity
 * - Directory permissions (config, logs, source)
 * - Hook installation and configuration
 * - Configuration validity
 * - Embedding configuration
 * - sqlite-vec extension availability
 *
 * @param overrides Optional path overrides for testing
 * @returns Complete health check result
 */
export function runHealthCheck(overrides?: HealthCheckOverrides): HealthCheckResult {
    // Database health
    const dbPath = overrides?.dbPath ?? getDefaultDbPath();
    const database = checkDatabaseHealth(dbPath);

    // Directory permissions
    const configDirPath = overrides?.configDir ?? getConfigDir();
    const logsDirPath = overrides?.logsDir ?? getLogDir();
    const sourceDirPath = overrides?.sourceDir ?? join(homedir(), ".claude", "projects");

    // Derive log/config file paths from overrides (tests) or production paths
    const logPath = overrides?.logsDir ? join(overrides.logsDir, "sync.log") : undefined;
    const configPath = overrides?.configDir ? join(overrides.configDir, "config.json") : undefined;

    const configDirPerms = checkDirectoryPermissions(configDirPath);
    const logsDirPerms = checkDirectoryPermissions(logsDirPath);
    const sourceDirPerms = checkDirectoryPermissions(sourceDirPath);

    const permissions: PermissionsHealth = {
        configDir: configDirPerms.readable && configDirPerms.writable,
        logsDir: logsDirPerms.readable && logsDirPerms.writable,
        sourceDir: sourceDirPerms.readable,
    };

    // Hook status
    const hooks = checkHookStatus(logPath, configPath, overrides?.hookOverrides, overrides?.preCalculatedHookStatus);

    // Config validity
    const config = checkConfigValidity(configPath);

    // Load config once for embedding and search capability
    const loadedConfig = loadConfig(configPath);

    // Embedding config
    const embedding = checkEmbeddingConfig(configPath);

    // sqlite-vec availability
    const sqliteVec = checkSqliteVecAvailability();

    // Search capability
    const searchCapability = checkSearchCapability(dbPath, sqliteVec, loadedConfig);

    // LLM Fact Extraction health
    const llmExtraction = checkLlmExtractionHealth(configPath);

    return {
        database,
        permissions,
        hooks,
        config,
        embedding,
        sqliteVec,
        searchCapability,
        llmExtraction,
    };
}


/**
 * Check search capability
 *
 * Queries the database for embedding counts and determines
 * vector readiness based on extension and embedding availability.
 *
 * @param dbPath Path to database file
 * @param sqliteVec sqlite-vec health status
 * @param config Loaded config for default mode
 * @returns Search capability status
 */
function checkSearchCapability(
    dbPath: string,
    sqliteVec: SqliteVecHealth,
    config: MemoryConfig
): SearchCapability {
    let embeddedCount = 0;
    let totalMessages = 0;

    try {
        if (existsSync(dbPath)) {
            const db = new Database(dbPath, { create: false, readonly: true });
            try {
                const embRow = db.query("SELECT COUNT(*) as count FROM embedding_state").get() as { count: number } | null;
                embeddedCount = embRow?.count ?? 0;

                const msgRow = db.query("SELECT COUNT(*) as count FROM messages_meta").get() as { count: number } | null;
                totalMessages = msgRow?.count ?? 0;
            } finally {
                db.close();
            }
        }
    } catch {
        // Tables may not exist yet -- counts remain 0
    }

    const coveragePercent = totalMessages > 0
        ? Math.round((embeddedCount / totalMessages) * 100)
        : 0;

    return {
        fts5: true, // FTS5 is always available (core schema)
        sqliteVec: sqliteVec.available,
        embeddedCount,
        totalMessages,
        coveragePercent,
        defaultMode: config.search?.defaultMode ?? "auto",
        vectorReady: sqliteVec.available && embeddedCount > 0,
    };
}

/**
 * Check database health
 *
 * @param dbPath Path to database file
 * @returns Database health status
 */
function checkDatabaseHealth(dbPath: string): DatabaseHealth {
    const exists = existsSync(dbPath);

    if (!exists) {
        return {
            exists: false,
            readable: false,
            writable: false,
            integrity: "unknown",
            size: 0,
        };
    }

    // Check file permissions
    const perms = checkDirectoryPermissions(dbPath);

    // Check file size
    let size = 0;
    try {
        const stats = statSync(dbPath);
        size = stats.size;
    } catch {
        // Ignore size errors
    }

    // Check integrity (only if readable)
    let integrity: "ok" | "corrupted" | "unknown" = "unknown";
    if (perms.readable) {
        try {
            const db = new Database(dbPath, { create: false, readonly: true });
            try {
                integrity = checkQuickIntegrity(db);
            } finally {
                db.close();
            }
        } catch {
            integrity = "corrupted";
        }
    }

    return {
        exists: true,
        readable: perms.readable,
        writable: perms.writable,
        integrity,
        size,
    };
}
