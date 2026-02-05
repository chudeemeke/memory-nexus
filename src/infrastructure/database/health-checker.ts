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
    DEFAULT_CONFIG,
    type MemoryNexusConfig,
} from "../hooks/index.js";

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
    /** Config directory (~/.memory-nexus) is accessible */
    configDir: boolean;
    /** Logs directory (~/.memory-nexus/logs) is accessible */
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
}

/**
 * Test path overrides for testing
 */
export interface HealthCheckOverrides {
    /** Override database path */
    dbPath?: string;
    /** Override config directory */
    configDir?: string;
    /** Override logs directory */
    logsDir?: string;
    /** Override source directory */
    sourceDir?: string;
}

let testOverrides: HealthCheckOverrides | null = null;

/**
 * Set test path overrides
 *
 * @param overrides Path overrides, or null to reset to defaults
 */
export function setTestOverrides(overrides: HealthCheckOverrides | null): void {
    testOverrides = overrides;
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
 * @returns Hook status including installation, enabled state, and last run
 */
export function checkHookStatus(): HooksHealth {
    const hookStatus = checkHooksInstalled();
    const config = loadConfig();
    const logs = readRecentLogs(1);

    return {
        installed: hookStatus.sessionEnd && hookStatus.preCompact,
        enabled: config.autoSync,
        lastRun: logs.length > 0 ? new Date(logs[0].timestamp) : null,
    };
}

/**
 * Valid log levels
 */
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"];

/**
 * Validate configuration and collect issues
 *
 * @returns Validity status and list of issues
 */
export function checkConfigValidity(): ConfigHealth {
    const issues: string[] = [];

    try {
        const config = loadConfig();

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
 * Run comprehensive health check
 *
 * Orchestrates all health checks:
 * - Database existence, permissions, and integrity
 * - Directory permissions (config, logs, source)
 * - Hook installation and configuration
 * - Configuration validity
 *
 * @param overrides Optional path overrides for testing
 * @returns Complete health check result
 */
export function runHealthCheck(overrides?: HealthCheckOverrides): HealthCheckResult {
    const effectiveOverrides = overrides ?? testOverrides;

    // Database health
    const dbPath = effectiveOverrides?.dbPath ?? getDefaultDbPath();
    const database = checkDatabaseHealth(dbPath);

    // Directory permissions
    const configDirPath = effectiveOverrides?.configDir ?? getConfigDir();
    const logsDirPath = effectiveOverrides?.logsDir ?? getLogDir();
    const sourceDirPath = effectiveOverrides?.sourceDir ?? join(homedir(), ".claude", "projects");

    const configDirPerms = checkDirectoryPermissions(configDirPath);
    const logsDirPerms = checkDirectoryPermissions(logsDirPath);
    const sourceDirPerms = checkDirectoryPermissions(sourceDirPath);

    const permissions: PermissionsHealth = {
        configDir: configDirPerms.readable && configDirPerms.writable,
        logsDir: logsDirPerms.readable && logsDirPerms.writable,
        sourceDir: sourceDirPerms.readable,
    };

    // Hook status
    const hooks = checkHookStatus();

    // Config validity
    const config = checkConfigValidity();

    return {
        database,
        permissions,
        hooks,
        config,
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
