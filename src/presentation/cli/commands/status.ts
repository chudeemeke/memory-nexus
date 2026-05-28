/**
 * Status Command Handler
 *
 * CLI command for displaying hook installation status, configuration, health diagnostics,
 * and database statistics. Unifies status, doctor, and stats commands per Phase 32.5.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
    loadConfig,
    checkHooksInstalled,
    readRecentLogs,
    type HookStatus,
    type MemoryConfig,
    getConfigDir,
    getLogDir,
} from "../../../infrastructure/hooks/index.js";
import {
    initializeDatabase,
    closeDatabase,
    getDefaultDbPath,
    SqliteExtractionStateRepository,
    SqliteStatsService,
    EmbeddingRepository,
    runHealthCheck,
    type HealthCheckResult,
} from "../../../infrastructure/database/index.js";
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";
import {
    green,
    red,
    yellow,
    dim,
    shouldUseColor,
} from "../formatters/color.js";
import { getMigrationStatus, type MigrationStatusResult } from "../../../infrastructure/migration.js";
import { getQmdInfo } from "../../../infrastructure/external/index.js";
import type { QmdHealthInfo } from "../../../domain/ports/index.js";
import {
    createStatsFormatter,
    type StatsOutputMode,
    type ExtendedStatsResult,
} from "../formatters/stats-formatter.js";
import { formatForAi } from "../formatters/ai-formatter.js";
import { emitFormatDeprecationWarning } from "./_helpers/deprecation-warning.js";
import {
    emitJsonEnvelope,
    emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toStatsDto } from "../formatters/dto-helpers.js";

/**
 * Options for the status command.
 */
export interface StatusOptions {
    /** Output as JSON */
    json?: boolean | undefined;
    /** Output Database Health Section */
    db?: boolean | undefined;
    /** Output Hooks Section */
    hooks?: boolean | undefined;
    /** Output Embedding Section */
    embedding?: boolean | undefined;
    /** Output Configuration Section */
    config?: boolean | undefined;
    /** Output Statistics Section */
    stats?: boolean | undefined;
    /** Output all sections */
    all?: boolean | undefined;
    /** Attempt to fix common issues automatically */
    fix?: boolean | undefined;
    /** Number of projects to show in breakdown */
    projects?: string | undefined;
    /** Output format for stats */
    format?: "brief" | "ai" | "default" | undefined;
    /** Verbose option for stats */
    verbose?: boolean | undefined;
    /** Quiet option for stats */
    quiet?: boolean | undefined;
}

/**
 * Runtime dependencies for executeStatusCommand.
 */
export interface StatusCommandDeps {
    /** Database path. Defaults to getDefaultDbPath(). */
    dbPath?: string | undefined;
    /** Sync log file path. Defaults to XDG-resolved sync.log. */
    logPath?: string | undefined;
    /** Config file path. Defaults to XDG-resolved config.json. */
    configPath?: string | undefined;
    /** Hook-related path overrides */
    hookOverrides?: import("../../../infrastructure/hooks/settings-manager.js").PathOverrides | undefined;
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
    /** Comprehensive health check results */
    health: HealthCheckResult;
    /** Database statistics (if DB exists) */
    stats?: ExtendedStatsResult | undefined;
    /** Legacy migration status */
    migration: MigrationStatusResult;
    /** External qmd tool availability status */
    qmd: QmdHealthInfo;
    /** List of automatic fixes applied */
    fixes: string[];
}

/**
 * Options for gathering status.
 */
export interface GatherStatusOptions {
    /** Override database path for testing */
    dbPath?: string | undefined;
    /** Override log file path for testing */
    logPath?: string | undefined;
    /** Override config file path for testing */
    configPath?: string | undefined;
    /** Hook-related path overrides */
    hookOverrides?: import("../../../infrastructure/hooks/settings-manager.js").PathOverrides | undefined;
    /** Attempt to fix common issues automatically */
    fix?: boolean | undefined;
    /** Number of projects in breakdown */
    projects?: number | undefined;
    /** Whether stats are requested */
    stats?: boolean | undefined;
}

/**
 * Create the status command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createStatusCommand(): Command {
    return new Command("status")
        .description("Show system status, health, and statistics")
        .option("--db", "Show database health and diagnostic info")
        .option("--hooks", "Show Git hook status")
        .option("--embedding", "Show background embedding process status")
        .option("--config", "Show config validation status")
        .option("--stats", "Show database statistics")
        .option("--all", "Show all status and health sections")
        .option("--fix", "Attempt to fix common issues automatically")
        .option("--projects <count>", "Number of projects to show in stats breakdown", "10")
        .addOption(
            new Option(
                "--format <type>",
                "Output format for stats: brief or ai"
            ).choices(["brief", "ai", "default"])
        )
        .option("-v, --verbose", "Show detailed output with timing")
        .option("-q, --quiet", "Minimal output")
        .option("--json", "Output as JSON")
        .action(async (options: StatusOptions) => {
            const result = await executeStatusCommand(options);
            process.exitCode = result.exitCode;
        });
}

/**
 * Gather all status information exactly once.
 *
 * @param options Optional configuration including database and log paths
 * @returns Aggregated status information
 */
export async function gatherStatus(options: GatherStatusOptions = {}): Promise<StatusInfo> {
    const hookStatus = checkHooksInstalled(options.hookOverrides);
    const config = loadConfig(options.configPath);
    const logs = readRecentLogs(1, options.logPath); // Get most recent log entry

    const dbPath = options.dbPath ?? getDefaultDbPath();
    const dbExists = existsSync(dbPath);
    const shouldOpenDb = dbExists || options.stats;

    let pendingSessions = 0;
    let baseStats: any;
    let embeddedCount = 0;
    let totalMessages = 0;

    // Orchestrate basic health check
    const healthResult = runHealthCheck({
        dbPath,
        configDir: options.configPath ? dirname(options.configPath) : undefined,
        logsDir: options.logPath ? dirname(options.logPath) : undefined,
        hookOverrides: options.hookOverrides,
        preCalculatedHookStatus: hookStatus,
    });

    // Singular database connection session to gather pending session counts, embedded stats, and DB statistics
    if (shouldOpenDb) {
        try {
            const { db } = initializeDatabase({ path: dbPath });
            try {
                // 1. Pending sessions
                const sessionSource = new FileSystemSessionSource();
                const extractionStateRepo = new SqliteExtractionStateRepository(db);

                const allSessions = await sessionSource.discoverSessions();
                for (const session of allSessions) {
                    const state = await extractionStateRepo.findBySessionPath(session.path);
                    if (!state || state.status !== "complete") {
                        pendingSessions++;
                    }
                }

                // 2. Statistics breakdown
                const statsService = new SqliteStatsService(db);
                const projectLimit = options.projects ?? 10;
                baseStats = await statsService.getStats(projectLimit);

                // 3. Embedding status counts
                const embeddingRepo = new EmbeddingRepository(db);
                embeddedCount = embeddingRepo.getEmbeddedCount();
                totalMessages = embeddingRepo.getTotalMessageCount();
            } finally {
                closeDatabase(db);
            }
        } catch {
            // Database error - fallback gracefully
        }
    }

    // Embedding background process alive status
    let embeddingStatus: EmbeddingStatus = { active: false };
    try {
        const { readLock, isProcessAlive } = await import(
            "../../../infrastructure/embedding/background-embedder.js"
        );
        const lock = readLock();
        if (lock && isProcessAlive(lock.pid)) {
            embeddingStatus = {
                active: true,
                pid: lock.pid,
                startedAt: lock.startedAt,
                embeddedCount,
                totalMessages,
            };
        }
    } catch {
        // Embedding module or lock unavailable
    }

    const migration = getMigrationStatus();
    const qmd = getQmdInfo();

    // Prepare extended stats result
    let extendedStats: ExtendedStatsResult | undefined;
    if (baseStats) {
        extendedStats = {
            ...baseStats,
            hooks: {
                installed: hookStatus.sessionEnd && hookStatus.preCompact,
                autoSync: config.autoSync,
                pendingSessions,
            },
        };
    }

    // Attempt fixes if requested
    let fixes: string[] = [];
    if (options.fix) {
        fixes = attemptFixes(healthResult, shouldUseColor());
    }

    return {
        hooks: hookStatus,
        config: sanitizeConfigForOutput(config),
        lastSync: logs.length > 0 ? logs[0]?.timestamp ?? null : null,
        pendingSessions,
        recentLogs: readRecentLogs(100, options.logPath).length,
        embedding: embeddingStatus,
        health: healthResult,
        stats: extendedStats,
        migration,
        qmd,
        fixes,
    };
}

function sanitizeConfigForOutput(config: MemoryConfig): MemoryConfig {
    const embedding = { ...config.embedding };
    if (embedding.apiKey) {
        embedding.apiKey = "[REDACTED:api_key]";
    }
    return { ...config, embedding };
}

/**
 * Execute the status command programmatically.
 */
export async function executeStatusCommand(
    options: StatusOptions,
    deps: StatusCommandDeps = {}
): Promise<CommandResult> {
    const startTime = performance.now();

    // Deprecation warning for format default
    if (options.format === "default") {
        emitFormatDeprecationWarning({
            command: "status",
            alias: "default",
            replacement: "Omit --format for default behavior, or use --format brief / --format ai.",
            json: options.json,
        });
    }

    // Parse projects limit
    // Determine effective command name for envelope compatibility: when called
    // from the stats wrapper (only options.stats set, no other sections), use
    // "stats" so the JSON envelope matches what callers of executeStatsCommand expect.
    const isStatsOnly = options.stats && !options.db && !options.hooks && !options.config && !options.embedding && !options.all;
    const effectiveCommand = (isStatsOnly ? "stats" : "status") as any;
    const projectLimit = parseInt(options.projects ?? "10", 10);
    if (isNaN(projectLimit) || projectLimit < 1) {
        if (options.json) {
            emitJsonErrorEnvelope({
                command: effectiveCommand,
                code: "INVALID_ARGUMENT",
                message: "Projects count must be a positive number",
            });
        } else {
            console.error("Error: Projects count must be a positive number");
        }
        return { exitCode: 1 };
    }

    const status = await gatherStatus({
        dbPath: deps.dbPath,
        logPath: deps.logPath,
        configPath: deps.configPath,
        hookOverrides: deps.hookOverrides,
        fix: options.fix,
        projects: projectLimit,
        stats: options.stats || options.all,
    });

    // Let's determine the final exit code dynamically:
    // Only return health-check based exit codes (1 or 2) if doctor/db checks, --all, or --fix are explicitly run.
    // Pure stats or status should not fail (exit 1) on config warnings or empty vector search databases.
    let exitCode = 0;
    const isDoctorCheck = options.db || options.all || options.fix;
    if (isDoctorCheck) {
        exitCode = determineExitCode(status.health);
    } else if (options.stats) {
        exitCode = status.stats ? 0 : 1;
    } else {
        exitCode = 0;
    }

    if (options.json) {
        // If stats is requested explicitly, output the compatible Stats JSON envelope
        if (options.stats && !options.db && !options.hooks && !options.config && !options.embedding && !options.all) {
            if (!status.stats) {
                emitJsonErrorEnvelope({
                    command: "stats",
                    code: "DB_CONNECTION_FAILED",
                    message: "Database stats could not be gathered",
                });
                return { exitCode: 1 };
            }
            emitJsonEnvelope({
                command: "stats",
                kind: "stats",
                data: toStatsDto(status.stats),
                meta: {
                    generated_at: new Date().toISOString(),
                    timing_ms: Math.round(performance.now() - startTime),
                },
            });
            return { exitCode: 0 };
        }

        // Consolidated, unified status & health JSON structure
        const jsonResult = {
            hooks: status.hooks,
            config: status.config,
            lastSync: status.lastSync,
            pendingSessions: status.pendingSessions,
            recentLogs: status.recentLogs,
            embedding: status.embedding,
            health: {
                ...status.health,
                hooks: {
                    ...status.health.hooks,
                    lastRun: status.health.hooks.lastRun?.toISOString() ?? null,
                },
            },
            stats: status.stats ? toStatsDto(status.stats) : undefined,
            migration: status.migration,
            qmd: status.qmd,
            fixes: status.fixes,
        };
        console.log(JSON.stringify(jsonResult, null, 2));
        return { exitCode };
    }

    // Determine color usage
    const useColor = shouldUseColor();

    // Check if specific sections were selected
    const hasSection =
        options.db ||
        options.hooks ||
        options.embedding ||
        options.config ||
        options.stats ||
        options.all;

    if (!hasSection) {
        // Classic consolidated dashboard view (default)
        formatStatusOutput(status);
        if (options.fix && status.fixes.length > 0) {
            console.log("\nApplied fixes:");
            for (const fix of status.fixes) {
                console.log(fix);
            }
        }
        return { exitCode: 0 };
    }

    const outputSections: string[] = [];

    // 1. Hooks Section
    if (options.hooks || options.all) {
        outputSections.push(formatHooksSection(status, useColor));
    }

    // 2. Config Section
    if (options.config || options.all) {
        outputSections.push(formatConfigSection(status, useColor));
    }

    // 3. Database & Embedding Diagnostics (Doctor) Sections
    if (options.db || options.all) {
        outputSections.push(formatDatabaseSection(status, useColor));
    }

    if (options.embedding || options.all) {
        outputSections.push(formatEmbeddingSection(status, useColor));
        outputSections.push(formatLlmExtractionSection(status, useColor));
    }


    // 4. Statistics breakdown
    if (options.stats || options.all) {
        if (!status.stats) {
            outputSections.push(red("Database statistics are not available.", useColor));
        } else {
            let outputMode: StatsOutputMode = "default";
            if (options.quiet) outputMode = "quiet";
            else if (options.verbose) outputMode = "verbose";
            else if (options.format === "brief") outputMode = "brief";

            const formatter = createStatsFormatter(outputMode, useColor);

            if (status.stats.totalSessions === 0) {
                outputSections.push(formatter.formatEmpty());
            } else {
                let statsOutput = formatter.formatStats(status.stats, {
                    executionTimeMs: Math.round(performance.now() - startTime),
                });
                if (options.format === "ai") {
                    statsOutput = formatForAi(statsOutput);
                }
                outputSections.push(statsOutput);
            }
        }
    }

    // Output all gathered sections
    console.log(outputSections.join("\n\n"));

    // Migration detection summary block
    if (options.all || options.db) {
        if (status.migration.status === "pending") {
            console.log("");
            console.log(yellow("Legacy data found at ~/.memory-nexus/. Run any memory command to auto-migrate.", useColor));
        } else if (status.migration.status === "partial") {
            console.log("");
            console.log(yellow("Partial migration detected. Some data in ~/.memory-nexus/ and some in new paths. Re-run migration or check manually.", useColor));
        }
    }

    // Attempt fixes if requested
    if (options.fix) {
        console.log("");
        console.log("Attempting fixes...");
        if (status.fixes.length === 0) {
            console.log(dim("No automatic fixes available.", useColor));
        } else {
            for (const msg of status.fixes) {
                console.log(msg);
            }
        }
    }

    return { exitCode };
}

/**
 * Format relative time from a date.
 */
function formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days > 1 ? "s" : ""} ago`;
    }
    if (hours > 0) {
        return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    }
    if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    }
    return "just now";
}

/**
 * Format hooks status check block.
 */
function formatHooksSection(status: StatusInfo, useColor: boolean): string {
    const lines: string[] = [];
    lines.push("Hooks");
    lines.push(`  ${formatStatus(status.health.hooks.installed, useColor)} Installed: ${status.health.hooks.installed ? "yes" : "no"}`);
    lines.push(`  ${formatStatus(status.health.hooks.enabled, useColor)} Enabled (autoSync): ${status.health.hooks.enabled ? "yes" : "no"}`);

    if (status.health.hooks.lastRun) {
        lines.push(`  ${dim(`Last run: ${formatRelativeTime(status.health.hooks.lastRun)}`, useColor)}`);
    } else {
        lines.push(`  ${dim("Last run: never", useColor)}`);
    }
    return lines.join("\n");
}

/**
 * Format configuration status block.
 */
function formatConfigSection(status: StatusInfo, useColor: boolean): string {
    const lines: string[] = [];
    lines.push("Configuration");
    if (status.health.config.valid) {
        lines.push(`  ${formatStatus(true, useColor)} Valid`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} Invalid`);
        for (const issue of status.health.config.issues) {
            lines.push(`    ${red("-", useColor)} ${issue}`);
        }
    }
    return lines.join("\n");
}

/**
 * Format database diagnostic status block.
 */
function formatDatabaseSection(status: StatusInfo, useColor: boolean): string {
    const lines: string[] = [];
    lines.push("Database");
    const dbPath = getDefaultDbPath();

    if (status.health.database.exists) {
        lines.push(`  ${formatStatus(status.health.database.exists, useColor)} Exists: ${dbPath}`);
        lines.push(`  ${formatStatus(status.health.database.readable, useColor)} Readable`);
        lines.push(`  ${formatStatus(status.health.database.writable, useColor)} Writable`);
        lines.push(`  ${formatStatus(status.health.database.integrity === "ok", useColor)} Integrity: ${formatIntegrity(status.health.database.integrity, useColor)}`);
        lines.push(`  ${dim(`Size: ${formatSize(status.health.database.size)}`, useColor)}`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} Database not found: ${dbPath}`);
        lines.push(`  ${dim("Run 'memory sync' to create database", useColor)}`);
    }

    if (status.health.sqliteVec.available) {
        lines.push(`  ${formatStatus(true, useColor)} sqlite-vec: v${status.health.sqliteVec.version}`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} sqlite-vec: not available`);
    }

    lines.push("");
    lines.push("Permissions");
    lines.push(`  ${formatStatus(status.health.permissions.configDir, useColor)} Config directory: ${getConfigDir()}`);
    lines.push(`  ${formatStatus(status.health.permissions.logsDir, useColor)} Logs directory: ${getLogDir()}`);
    lines.push(`  ${formatStatus(status.health.permissions.sourceDir, useColor)} Source directory: ~/.claude/projects`);

    lines.push("");
    lines.push("Search Capability");
    lines.push(`  ${formatStatus(status.health.searchCapability.fts5, useColor)} FTS5: available`);
    lines.push(`  ${formatStatus(status.health.searchCapability.sqliteVec, useColor)} sqlite-vec: ${status.health.searchCapability.sqliteVec ? "available" : "not available"}`);
    lines.push(`  ${dim(`Embeddings: ${status.health.searchCapability.embeddedCount}/${status.health.searchCapability.totalMessages} (${status.health.searchCapability.coveragePercent}%)`, useColor)}`);
    lines.push(`  ${dim(`Default mode: ${status.health.searchCapability.defaultMode}`, useColor)}`);
    lines.push(`  ${formatStatus(status.health.searchCapability.vectorReady, useColor)} Vector search: ${status.health.searchCapability.vectorReady ? "ready" : "not ready"}`);

    lines.push("");
    lines.push("Optional Tools");
    if (status.qmd.available) {
        lines.push(`  ${dim("[INFO]", useColor)} qmd: installed at ${status.qmd.path} (enables --files search)`);
    } else {
        lines.push(`  ${dim("[INFO]", useColor)} qmd: not found (optional -- install with: bun add -g @tobilu/qmd)`);
    }

    return lines.join("\n");
}

/**
 * Format embedding diagnostics status block.
 */
function formatEmbeddingSection(status: StatusInfo, useColor: boolean): string {
    const lines: string[] = [];
    lines.push("Embeddings");
    lines.push(`  ${formatStatus(status.health.embedding.enabled, useColor)} Enabled: ${status.health.embedding.enabled ? "yes" : "no"}`);
    lines.push(`  ${dim(`Provider: ${status.health.embedding.provider}`, useColor)}`);
    lines.push(`  ${dim(`Model: ${status.health.embedding.model}`, useColor)}`);
    lines.push(`  ${dim(`Dimensions: ${status.health.embedding.dimensions}`, useColor)}`);
    lines.push(`  ${formatStatus(status.health.embedding.ready, useColor)} Ready: ${status.health.embedding.ready ? "yes" : "no"}`);
    if (status.health.embedding.readyReason) {
        if (status.health.embedding.ready) {
            lines.push(`  ${dim(`Note: ${status.health.embedding.readyReason}`, useColor)}`);
        } else {
            lines.push(`  ${red(`Reason: ${status.health.embedding.readyReason}`, useColor)}`);
        }
    }
    return lines.join("\n");
}

/**
 * Format LLM Fact Extraction diagnostics status block.
 */
function formatLlmExtractionSection(status: StatusInfo, useColor: boolean): string {
    const lines: string[] = [];
    lines.push("LLM Fact Extraction");
    lines.push(`  ${formatStatus(status.health.llmExtraction.ready, useColor)} Ready: ${status.health.llmExtraction.ready ? "yes" : "no"}`);
    lines.push(`  ${dim(`Provider: ${status.health.llmExtraction.provider}`, useColor)}`);
    lines.push(`  ${dim(`Model: ${status.health.llmExtraction.model}`, useColor)}`);
    if (status.health.llmExtraction.readyReason) {
        if (status.health.llmExtraction.ready) {
            lines.push(`  ${dim(`Note: ${status.health.llmExtraction.readyReason}`, useColor)}`);
        } else {
            lines.push(`  ${red(`Reason: ${status.health.llmExtraction.readyReason}`, useColor)}`);
        }
    }
    return lines.join("\n");
}


/**
 * Format a boolean value as a status indicator.
 */
function formatStatus(value: boolean, useColor: boolean): string {
    if (value) {
        return green("[OK]", useColor);
    }
    return red("[FAIL]", useColor);
}

/**
 * Format bytes as human-readable size.
 */
function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);

    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format integrity status with appropriate color.
 */
function formatIntegrity(integrity: "ok" | "corrupted" | "unknown", useColor: boolean): string {
    switch (integrity) {
        case "ok":
            return green("ok", useColor);
        case "corrupted":
            return red("CORRUPTED", useColor);
        default:
            return yellow("unknown", useColor);
    }
}

/**
 * Count total issues in health check result.
 */
function countIssues(result: HealthCheckResult): number {
    let count = 0;

    // Database issues
    if (!result.database.exists) count++;
    if (result.database.exists && !result.database.readable) count++;
    if (result.database.exists && !result.database.writable) count++;
    if (result.database.integrity === "corrupted") count++;

    // Permission issues
    if (!result.permissions.configDir) count++;
    if (!result.permissions.logsDir) count++;
    if (!result.permissions.sourceDir) count++;

    // Config issues
    count += result.config.issues.length;

    return count;
}

/**
 * Determine doctor exit code from health check result.
 */
function determineExitCode(result: HealthCheckResult): number {
    if (!result.database.exists || result.database.integrity === "corrupted") {
        return 2;
    }

    const issueCount = countIssues(result);
    if (issueCount > 0 || !result.searchCapability.vectorReady) {
        return 1;
    }

    return 0;
}

/**
 * Attempt automatic fixes for common issues.
 */
export function attemptFixes(result: HealthCheckResult, useColor: boolean): string[] {
    const messages: string[] = [];

    // Create missing config directory
    if (!result.permissions.configDir) {
        const configDir = getConfigDir();
        try {
            mkdirSync(configDir, { recursive: true });
            messages.push(green(`Created config directory: ${configDir}`, useColor));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            messages.push(red(`Failed to create config directory: ${msg}`, useColor));
        }
    }

    // Create missing logs directory
    if (!result.permissions.logsDir) {
        const logsDir = getLogDir();
        try {
            mkdirSync(logsDir, { recursive: true });
            messages.push(green(`Created logs directory: ${logsDir}`, useColor));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            messages.push(red(`Failed to create logs directory: ${msg}`, useColor));
        }
    }

    // Note about unfixable issues
    if (result.database.integrity === "corrupted") {
        messages.push(yellow("Database corruption detected. Consider:", useColor));
        messages.push("  1. Backup your database file");
        messages.push(`  2. Delete the database: rm ${getDefaultDbPath()}`);
        messages.push("  3. Re-sync: memory sync");
    }

    if (!result.hooks.installed) {
        messages.push(yellow("Hooks not installed. Run 'memory install' to enable automatic sync.", useColor));
    }

    return messages;
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
