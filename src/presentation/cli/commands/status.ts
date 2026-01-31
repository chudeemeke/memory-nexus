/**
 * Status Command Handler
 *
 * CLI command for displaying hook installation status and configuration.
 * Shows hooks, config, and activity information.
 */

import { Command } from "commander";
import { existsSync } from "node:fs";
import {
    loadConfig,
    checkHooksInstalled,
    readRecentLogs,
    type HookStatus,
    type MemoryNexusConfig,
} from "../../../infrastructure/hooks/index.js";
import {
    initializeDatabase,
    closeDatabase,
    getDefaultDbPath,
    SqliteExtractionStateRepository,
} from "../../../infrastructure/database/index.js";
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";

/**
 * Test database path override.
 * When set, all database operations use this path instead of the default.
 */
let testDbPath: string | null = null;

/**
 * Set test database path override.
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestDbPath(path: string | null): void {
    testDbPath = path;
}

/**
 * Options parsed from CLI arguments.
 */
interface StatusOptions {
    json?: boolean;
}

/**
 * Aggregated status information.
 */
export interface StatusInfo {
    hooks: HookStatus;
    config: MemoryNexusConfig;
    lastSync: string | null;
    pendingSessions: number;
    recentLogs: number;
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
            await executeStatusCommand(options);
        });
}

/**
 * Execute the status command with given options.
 *
 * Gathers status information and displays it.
 *
 * @param options Command options from CLI
 */
export async function executeStatusCommand(options: StatusOptions): Promise<void> {
    const status = await gatherStatus();

    if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
    }

    formatStatusOutput(status);
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
    const dbPath = options.dbPath ?? testDbPath ?? getDefaultDbPath();

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

    return {
        hooks,
        config,
        lastSync: logs.length > 0 ? logs[0].timestamp : null,
        pendingSessions,
        recentLogs: readRecentLogs(100).length,
    };
}

/**
 * Format and display status output to console.
 *
 * @param status Status information to display
 */
export function formatStatusOutput(status: StatusInfo): void {
    console.log("Memory-Nexus Status");
    console.log("===================\n");

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

    // Recommendations
    if (!status.hooks.sessionEnd || !status.hooks.preCompact) {
        console.log("\nRecommendation: Run 'memory-nexus install' to enable automatic sync.");
    }
    if (status.pendingSessions > 0) {
        console.log(`\nNote: ${status.pendingSessions} session(s) pending sync. Run 'memory-nexus sync' to sync now.`);
    }
}
