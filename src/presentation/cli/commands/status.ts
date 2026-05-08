/**
 * Status Command Handler
 *
 * CLI command for displaying hook installation status and configuration.
 * Shows hooks, config, and activity information.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { existsSync } from "node:fs";
import {
    loadConfig,
    checkHooksInstalled,
    readRecentLogs,
    type HookStatus,
    type MemoryConfig,
} from "../../../infrastructure/hooks/index.js";
import {
    initializeDatabase,
    closeDatabase,
    getDefaultDbPath,
    SqliteExtractionStateRepository,
} from "../../../infrastructure/database/index.js";
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";

/**
 * Options for the status command.
 */
export interface StatusOptions {
    /** Output as JSON */
    json?: boolean;
}

/**
 * Runtime dependencies for executeStatusCommand.
 *
 * Operational dependencies that tests substitute for isolation.
 * Defaults to production resolution when omitted.
 */
export interface StatusCommandDeps {
    /** Database path. Defaults to getDefaultDbPath(). */
    dbPath?: string;
}

/**
 * Embedding background process status.
 */
export interface EmbeddingStatus {
    /** Whether a background embedding process is currently running */
    active: boolean;
    /** PID of the background embedding process */
    pid?: number;
    /** ISO timestamp when the background process started */
    startedAt?: string;
    /** Number of messages that have been embedded so far */
    embeddedCount?: number;
    /** Total number of messages in the database */
    totalMessages?: number;
}

/**
 * Aggregated status information.
 */
export interface StatusInfo {
    /** Hook installation status */
    hooks: HookStatus;
    /** Current configuration */
    config: MemoryConfig;
    /** ISO timestamp of the last sync, or null if never synced */
    lastSync: string | null;
    /** Number of sessions pending sync */
    pendingSessions: number;
    /** Number of recent log entries */
    recentLogs: number;
    /** Background embedding process status */
    embedding: EmbeddingStatus;
}

/**
 * Create the status command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createStatusCommand(): Command {
    return new Command("status")
        .description("Show hook installation status and configuration")
        .option("--json", "Output as JSON")
        .action(async (options: StatusOptions) => {
            const result = await executeStatusCommand(options);
            process.exitCode = result.exitCode;
        });
}

/**
 * Execute the status command programmatically.
 *
 * Shows current hook installation status, configuration, pending sessions,
 * and embedding progress. Handles its own database initialization.
 *
 * @param options - Status command options
 * @returns CommandResult with exitCode 0 (always succeeds)
 */
export async function executeStatusCommand(
    options: StatusOptions,
    deps: StatusCommandDeps = {}
): Promise<CommandResult> {
    const status = await gatherStatus({ dbPath: deps.dbPath });

    if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return { exitCode: 0 };
    }

    formatStatusOutput(status);
    return { exitCode: 0 };
}

/**
 * Options for gathering status.
 */
export interface GatherStatusOptions {
    /** Override database path for testing */
    dbPath?: string;
}

/**
 * Gather all status information.
 *
 * @param options Optional configuration including database path
 * @returns Aggregated status information
 */
export async function gatherStatus(options: GatherStatusOptions = {}): Promise<StatusInfo> {
    const hooks = checkHooksInstalled();
    const config = loadConfig();
    const logs = readRecentLogs(1); // Get most recent log entry

    // Get pending sessions count
    let pendingSessions = 0;
    const dbPath = options.dbPath ?? getDefaultDbPath();

    // Only query database if it exists (don't create new one for status)
    if (existsSync(dbPath)) {
        try {
            const { db } = initializeDatabase({ path: dbPath });
            try {
                const sessionSource = new FileSystemSessionSource();
                const extractionStateRepo = new SqliteExtractionStateRepository(db);

                const allSessions = await sessionSource.discoverSessions();
                for (const session of allSessions) {
                    const state = await extractionStateRepo.findBySessionPath(session.path);
                    if (!state || state.status !== "complete") {
                        pendingSessions++;
                    }
                }
            } finally {
                closeDatabase(db);
            }
        } catch {
            // Database error - treat as no pending sessions
        }
    }

    // Check embedding background status
    let embeddingStatus: EmbeddingStatus = { active: false };
    try {
        const { readLock, isProcessAlive } = await import(
            "../../../infrastructure/embedding/background-embedder.js"
        );
        const lock = readLock();
        if (lock && isProcessAlive(lock.pid)) {
            // Query database for live progress counts instead of relying on
            // LockData.totalMessages (which is 0 at spawn and never updated).
            let embeddedCount: number | undefined;
            let totalMessages: number | undefined;
            if (existsSync(dbPath)) {
                try {
                    const { db: statusDb } = initializeDatabase({ path: dbPath });
                    try {
                        const { EmbeddingRepository } = await import(
                            "../../../infrastructure/database/repositories/embedding-repository.js"
                        );
                        const embeddingRepo = new EmbeddingRepository(statusDb);
                        embeddedCount = embeddingRepo.getEmbeddedCount();
                        totalMessages = embeddingRepo.getTotalMessageCount();
                    } finally {
                        closeDatabase(statusDb);
                    }
                } catch {
                    // Database query failed -- show status without counts
                }
            }

            embeddingStatus = {
                active: true,
                pid: lock.pid,
                startedAt: lock.startedAt,
                embeddedCount,
                totalMessages,
            };
        }
    } catch {
        // Embedding module not available -- fine, show idle
    }

    return {
        hooks,
        config,
        lastSync: logs.length > 0 ? logs[0].timestamp : null,
        pendingSessions,
        recentLogs: readRecentLogs(100).length,
        embedding: embeddingStatus,
    };
}

/**
 * Format and display status output to console.
 *
 * @param status Status information to display
 */
export function formatStatusOutput(status: StatusInfo): void {
    console.log("Memory Status");
    console.log("=============\n");

    console.log("Hooks:");
    console.log(`  SessionEnd:  ${status.hooks.sessionEnd ? "installed" : "not installed"}`);
    console.log(`  PreCompact:  ${status.hooks.preCompact ? "installed" : "not installed"}`);
    console.log(`  Hook script: ${status.hooks.hookScriptExists ? "present" : "missing"}`);
    console.log(`  Backup:      ${status.hooks.backupExists ? "available" : "none"}`);
    console.log("");

    console.log("Configuration:");
    console.log(`  autoSync:          ${status.config.autoSync}`);
    console.log(`  syncOnCompaction:  ${status.config.syncOnCompaction}`);
    console.log(`  recoveryOnStartup: ${status.config.recoveryOnStartup}`);
    console.log(`  timeout:           ${status.config.timeout}ms`);
    console.log(`  logLevel:          ${status.config.logLevel}`);
    console.log(`  showFailures:      ${status.config.showFailures}`);
    console.log("");

    console.log("Activity:");
    console.log(`  Last sync:         ${status.lastSync ?? "never"}`);
    console.log(`  Pending sessions:  ${status.pendingSessions}`);
    console.log(`  Recent log entries: ${status.recentLogs}`);
    console.log("");

    console.log("Embedding:");
    if (status.embedding.active) {
        const ago = status.embedding.startedAt
            ? formatTimeAgo(status.embedding.startedAt)
            : "unknown";
        const progress =
            status.embedding.embeddedCount !== undefined &&
            status.embedding.totalMessages !== undefined
                ? `, ${status.embedding.embeddedCount}/${status.embedding.totalMessages} messages`
                : "";
        console.log(`  Status:    active (PID ${status.embedding.pid}${progress}, started ${ago})`);
    } else {
        console.log("  Status:    idle");
    }

    // Recommendations
    if (!status.hooks.sessionEnd || !status.hooks.preCompact) {
        console.log("\nRecommendation: Run 'memory install' to enable automatic sync.");
    }
    if (status.pendingSessions > 0) {
        console.log(`\nNote: ${status.pendingSessions} session(s) pending sync. Run 'memory sync' to sync now.`);
    }
}

/**
 * Format an ISO timestamp as a human-readable relative time.
 *
 * @param isoTimestamp ISO 8601 timestamp string
 * @returns Relative time string (e.g., "5 min ago", "2h ago")
 */
export function formatTimeAgo(isoTimestamp: string): string {
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
