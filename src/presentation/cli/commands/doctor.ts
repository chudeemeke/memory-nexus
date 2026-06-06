/**
 * Doctor Command Handler (Wrapper)
 *
 * Thin view that delegates health checks and diagnostics to executeStatusCommand.
 * Maintained for backwards compatibility.
 */

import { Command } from "commander";
import { mkdirSync } from "node:fs";
import type { CommandResult } from "../command-result.js";
import { executeStatusCommand } from "./status.js";
import type { GatherStatusOptions, StatusInfo } from "./status.js";
import {
    getConfigDir,
    getLogDir,
} from "../../../infrastructure/paths.js";
import {
    getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
    green,
    red,
    yellow,
    dim,
    shouldUseColor,
} from "../formatters/color.js";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join as joinPath } from "node:path";
import { PathDecoder } from "../../../domain/services/path-decoder.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import { getDataDir } from "../../../infrastructure/paths.js";
import { getQmdInfo } from "../../../infrastructure/external/index.js";
import type { HealthCheckResult } from "../../../infrastructure/database/health-checker.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";
import type { CapabilityInteropStatus } from "../../../domain/ports/capability.js";

/**
 * Options for the doctor command.
 */
export interface DoctorOptions {
    /** Output health check results as JSON */
    json?: boolean;
    /** Attempt to fix common issues automatically */
    fix?: boolean;
    /** Perform portability diagnostics */
    portability?: boolean;
}

/**
 * Runtime dependencies for executeDoctorCommand.
 */
export interface DoctorCommandDeps {
    healthOverrides?: {
        dbPath?: string;
        configDir?: string;
        logsDir?: string;
        sourceDir?: string;
        hookOverrides?: import("../../../infrastructure/hooks/settings-manager.js").PathOverrides;
    };
    gatherStatus?: (options: GatherStatusOptions) => Promise<StatusInfo>;
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
 * Format health check result as readable output.
 */
export function formatHealthResult(result: HealthCheckResult, useColor: boolean): string {
    const lines: string[] = [];

    // Database section
    lines.push("Database");
    const dbPath = getDefaultDbPath();

    if (result.database.exists) {
        lines.push(`  ${formatStatus(result.database.exists, useColor)} Exists: ${dbPath}`);
        lines.push(`  ${formatStatus(result.database.readable, useColor)} Readable`);
        lines.push(`  ${formatStatus(result.database.writable, useColor)} Writable`);
        lines.push(`  ${formatStatus(result.database.integrity === "ok", useColor)} Integrity: ${formatIntegrity(result.database.integrity, useColor)}`);
        lines.push(`  ${dim(`Size: ${formatSize(result.database.size)}`, useColor)}`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} Database not found: ${dbPath}`);
        lines.push(`  ${dim("Run 'memory sync' to create database", useColor)}`);
    }

    // sqlite-vec status within Database section
    if (result.sqliteVec.available) {
        lines.push(`  ${formatStatus(true, useColor)} sqlite-vec: v${result.sqliteVec.version}`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} sqlite-vec: not available`);
    }

    lines.push("");

    // Permissions section
    lines.push("Permissions");
    const configDir = getConfigDir();
    const logsDir = getLogDir();

    lines.push(`  ${formatStatus(result.permissions.configDir, useColor)} Config directory: ${configDir}`);
    lines.push(`  ${formatStatus(result.permissions.logsDir, useColor)} Logs directory: ${logsDir}`);
    lines.push(`  ${formatStatus(result.permissions.sourceDir, useColor)} Source directory: ~/.claude/projects`);

    lines.push("");

    // Hooks section
    lines.push("Hooks");
    lines.push(`  ${formatStatus(result.hooks.installed, useColor)} Installed: ${result.hooks.installed ? "yes" : "no"}`);
    lines.push(`  ${formatStatus(result.hooks.enabled, useColor)} Enabled (autoSync): ${result.hooks.enabled ? "yes" : "no"}`);

    if (result.hooks.lastRun) {
        lines.push(`  ${dim(`Last run: ${formatRelativeTime(result.hooks.lastRun)}`, useColor)}`);
    } else {
        lines.push(`  ${dim("Last run: never", useColor)}`);
    }

    lines.push("");

    // Config section
    lines.push("Configuration");
    if (result.config.valid) {
        lines.push(`  ${formatStatus(true, useColor)} Valid`);
    } else {
        lines.push(`  ${formatStatus(false, useColor)} Invalid`);
        for (const issue of result.config.issues) {
            lines.push(`    ${red("-", useColor)} ${issue}`);
        }
    }

    lines.push("");

    // Embeddings section
    lines.push("Embeddings");
    lines.push(`  ${formatStatus(result.embedding.enabled, useColor)} Enabled: ${result.embedding.enabled ? "yes" : "no"}`);
    lines.push(`  ${dim(`Provider: ${result.embedding.provider}`, useColor)}`);
    lines.push(`  ${dim(`Model: ${result.embedding.model}`, useColor)}`);
    lines.push(`  ${dim(`Dimensions: ${result.embedding.dimensions}`, useColor)}`);
    lines.push(`  ${formatStatus(result.embedding.ready, useColor)} Ready: ${result.embedding.ready ? "yes" : "no"}`);
    if (result.embedding.readyReason) {
        if (result.embedding.ready) {
            lines.push(`  ${dim(`Note: ${result.embedding.readyReason}`, useColor)}`);
        } else {
            lines.push(`  ${red(`Reason: ${result.embedding.readyReason}`, useColor)}`);
        }
    }

    lines.push("");

    // LLM Fact Extraction section
    if (result.llmExtraction) {
        lines.push("LLM Fact Extraction");
        lines.push(`  ${formatStatus(result.llmExtraction.ready, useColor)} Ready: ${result.llmExtraction.ready ? "yes" : "no"}`);
        lines.push(`  ${dim(`Provider: ${result.llmExtraction.provider}`, useColor)}`);
        lines.push(`  ${dim(`Model: ${result.llmExtraction.model}`, useColor)}`);
        if (result.llmExtraction.readyReason) {
            if (result.llmExtraction.ready) {
                lines.push(`  ${dim(`Note: ${result.llmExtraction.readyReason}`, useColor)}`);
            } else {
                lines.push(`  ${red(`Reason: ${result.llmExtraction.readyReason}`, useColor)}`);
            }
        }
        lines.push("");
    }

    const providerEgress = getProviderEgressForFormatting(result);
    lines.push("Provider Egress");
    lines.push(`  ${formatStatus(providerEgress.consent === "granted", useColor)} Consent: ${providerEgress.consent}`);
    lines.push(formatProviderEgressAssessment("Embeddings", providerEgress.embedding, useColor));
    lines.push(formatProviderEgressAssessment("LLM Extraction", providerEgress.llmExtraction, useColor));
    if (providerEgress.warnings.length > 0) {
        for (const warning of providerEgress.warnings) {
            lines.push(`  ${yellow(`Warning: ${warning}`, useColor)}`);
        }
    }
    lines.push("");

    lines.push(formatCapabilityInteropSection(result, useColor));
    lines.push("");



    // Search Capability section
    lines.push("Search Capability");
    lines.push(`  ${formatStatus(result.searchCapability.fts5, useColor)} FTS5: available`);
    lines.push(`  ${formatStatus(result.searchCapability.sqliteVec, useColor)} sqlite-vec: ${result.searchCapability.sqliteVec ? "available" : "not available"}`);
    lines.push(`  ${dim(`Embeddings: ${result.searchCapability.embeddedCount}/${result.searchCapability.totalMessages} (${result.searchCapability.coveragePercent}%)`, useColor)}`);
    lines.push(`  ${dim(`Default mode: ${result.searchCapability.defaultMode}`, useColor)}`);
    lines.push(`  ${formatStatus(result.searchCapability.vectorReady, useColor)} Vector search: ${result.searchCapability.vectorReady ? "ready" : "not ready"}`);

    lines.push("");

    // Optional Tools section
    lines.push("Optional Tools");
    const qmdInfo = getQmdInfo();
    if (qmdInfo.available) {
        lines.push(`  ${dim("[INFO]", useColor)} qmd: installed at ${qmdInfo.path} (enables --files search)`);
    } else {
        lines.push(`  ${dim("[INFO]", useColor)} qmd: not found (optional -- install with: bun add -g @tobilu/qmd)`);
    }

    lines.push("");

    // Summary
    const issueCount = countIssues(result);
    if (issueCount === 0) {
        lines.push(green("All checks passed", useColor));
    } else {
        lines.push(red(`${issueCount} issue${issueCount > 1 ? "s" : ""} found`, useColor));
    }

    return lines.join("\n");
}

function getProviderEgressForFormatting(result: HealthCheckResult): HealthCheckResult["providerEgress"] {
    const embeddingProvider = result.embedding?.provider ?? "unknown";
    const llmProvider = result.llmExtraction?.provider ?? "unknown";
    return result.providerEgress ?? {
        consent: "unset",
        embedding: {
            required: false,
            allowed: true,
            target: embeddingProvider,
            capability: "embedding",
            provider: embeddingProvider,
            warnings: [],
        },
        llmExtraction: {
            required: false,
            allowed: true,
            target: llmProvider,
            capability: "extraction",
            provider: llmProvider,
            warnings: [],
        },
        warnings: [],
    };
}

function getCapabilityInteropForFormatting(result: HealthCheckResult): CapabilityInteropStatus {
    const health = result as Partial<HealthCheckResult> | undefined;
    return health?.capabilityInterop ?? {
        providers: [],
        references: [],
        warnings: [],
    };
}

function formatCapabilityInteropSection(result: HealthCheckResult, useColor: boolean): string {
    const capabilityInterop = getCapabilityInteropForFormatting(result);
    const lines: string[] = ["Capability Interop"];

    for (const provider of capabilityInterop.providers) {
        const label = provider.status === "optional_unavailable"
            ? "optional unavailable"
            : provider.status.replace(/_/g, " ");
        const marker = provider.available ? formatStatus(true, useColor) : dim("[INFO]", useColor);
        lines.push(`  ${marker} ${provider.provider}: ${label}`);
    }

    if (capabilityInterop.references.length === 0) {
        lines.push(`  ${dim("References: none configured", useColor)}`);
    } else {
        for (const reference of capabilityInterop.references) {
            const envSuffix = reference.envVar ? ` via ${reference.envVar}` : "";
            lines.push(`  ${dim(`${reference.source}: ${reference.maskedReference} (${reference.status}${envSuffix})`, useColor)}`);
        }
    }

    for (const warning of capabilityInterop.warnings) {
        lines.push(`  ${yellow(`Warning: ${warning}`, useColor)}`);
    }

    return lines.join("\n");
}

function formatProviderEgressAssessment(
    label: string,
    assessment: HealthCheckResult["providerEgress"]["embedding"],
    useColor: boolean,
): string {
    const target = assessment.host ?? assessment.target;
    if (!assessment.required) {
        return `  ${formatStatus(true, useColor)} ${label}: local/none (${target})`;
    }
    if (assessment.allowed) {
        return `  ${formatStatus(true, useColor)} ${label}: allowed (${target})`;
    }
    return `  ${formatStatus(false, useColor)} ${label}: blocked - ${assessment.reason}`;
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

    // LLM extraction issues
    if (result.llmExtraction && !result.llmExtraction.ready) count++;

    return count;
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
            const msg = unknownErrorMessage(error);
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
            const msg = unknownErrorMessage(error);
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
 * Create the doctor command for Commander.js.
 */
export function createDoctorCommand(): Command {
    return new Command("doctor")
        .description("Check system health and diagnose issues")
        .option("--json", "Output as JSON")
        .option("--fix", "Attempt to fix common issues")
        .option("--portability", "Perform portability and path-dialect migration checks")
        .action(async (options: DoctorOptions) => {
            const result = await executeDoctorCommand(options);
            process.exitCode = result.exitCode;
        });
}

/**
 * Execute the doctor command programmatically by wrapping executeStatusCommand.
 */
export async function executeDoctorCommand(
    options: DoctorOptions,
    deps: DoctorCommandDeps = {},
): Promise<CommandResult> {
    if (options.portability) {
        return runPortabilityDiagnostics(options, deps);
    }

    if (options.json) {
        const gatherStatus = deps.gatherStatus ?? (await import("./status.js")).gatherStatus;
        const status = await gatherStatus({
            dbPath: deps.healthOverrides?.dbPath,
            logPath: deps.healthOverrides?.logsDir ? join(deps.healthOverrides.logsDir, "sync.log") : undefined,
            configPath: deps.healthOverrides?.configDir ? join(deps.healthOverrides.configDir, "config.json") : undefined,
            hookOverrides: deps.healthOverrides?.hookOverrides,
            fix: options.fix,
            stats: false,
        });

        const jsonResult = {
            database: status.health.database,
            permissions: status.health.permissions,
            hooks: {
                ...status.health.hooks,
                lastRun: status.health.hooks.lastRun?.toISOString() ?? null,
            },
            config: status.health.config,
            embedding: status.health.embedding,
            sqliteVec: status.health.sqliteVec,
            searchCapability: status.health.searchCapability,
            llmExtraction: status.health.llmExtraction,
            providerEgress: status.health.providerEgress,
            capabilityInterop: status.health.capabilityInterop,
            migration: status.migration,
            qmd: status.qmd,
        };


        console.log(JSON.stringify(jsonResult, null, 2));

        let exitCode = 0;
        if (!status.health.database.exists || status.health.database.integrity === "corrupted") {
            exitCode = 2;
        } else {
            const issueCount = countIssues(status.health);
            if (issueCount > 0 || !status.health.searchCapability.vectorReady) {
                exitCode = 1;
            }
        }
        return { exitCode };
    }

    // Map doctor options to consolidated status options for text-mode execution
    return executeStatusCommand(
        {
            db: true,
            hooks: true,
            config: true,
            embedding: true,
            all: true,
            fix: options.fix,
            json: options.json,
        },
        {
            dbPath: deps.healthOverrides?.dbPath,
            logPath: deps.healthOverrides?.logsDir ? join(deps.healthOverrides.logsDir, "sync.log") : undefined,
            configPath: deps.healthOverrides?.configDir ? join(deps.healthOverrides.configDir, "config.json") : undefined,
            hookOverrides: deps.healthOverrides?.hookOverrides,
        }
    );
}

export function isMixedPathDialect(decoded: string, platform: NodeJS.Platform = process.platform): boolean {
    if (platform === "win32") {
        return decoded.includes("/") && (
            decoded.startsWith("/home") ||
            decoded.startsWith("/mnt") ||
            decoded.startsWith("/var") ||
            decoded.startsWith("/usr") ||
            decoded.startsWith("/")
        );
    }

    return decoded.includes("\\") || /^[a-zA-Z]:/.test(decoded);
}

/**
 * Execute portability diagnostics for environment transitions.
 */
export async function runPortabilityDiagnostics(
    options: DoctorOptions,
    deps: DoctorCommandDeps = {}
): Promise<CommandResult> {
    const fsExistsSync = existsSync;
    const dbPath = deps.healthOverrides?.dbPath ?? getDefaultDbPath();
    const dataDir = deps.healthOverrides?.sourceDir ?? getDataDir();

    const useColor = options.json ? false : shouldUseColor();

    let db;
    const mixedDialects: string[] = [];
    const orphanedPaths: string[] = [];
    const staleLocks: string[] = [];

    // Check database path
    if (!existsSync(dbPath)) {
        const errorMsg = "Database does not exist. Run 'memory sync' first.";
        if (options.json) {
            console.log(JSON.stringify({ error: errorMsg }, null, 2));
        } else {
            console.error(red(`Error: ${errorMsg}`, useColor));
        }
        return { exitCode: 1 };
    }

    try {
        const initResult = initializeDatabase({ path: dbPath });
        db = initResult.db;
        const sessionRepo = new SqliteSessionRepository(db);

        const allSessions = await sessionRepo.findFiltered({ limit: 100000 });
        for (const session of allSessions) {
            const decoded = session.projectPath.decoded;

            // 1. Path Dialect Scan
            if (isMixedPathDialect(decoded) && !mixedDialects.includes(decoded)) {
                mixedDialects.push(decoded);
            }

            // 2. Orphaned Paths Scan
            const resolvedPath = PathDecoder.resolveExistingPath(decoded, fsExistsSync);
            if (!fsExistsSync(resolvedPath)) {
                if (!orphanedPaths.includes(decoded)) {
                    orphanedPaths.push(decoded);
                }
            }
        }
    } catch (err) {
        const msg = unknownErrorMessage(err);
        if (options.json) {
            console.log(JSON.stringify({ error: `Portability scan failed: ${msg}` }, null, 2));
        } else {
            console.error(red(`Portability scan failed: ${msg}`, useColor));
        }
        return { exitCode: 2 };
    } finally {
        if (db) {
            closeDatabase(db);
        }
    }

    // 3. Stale Lock Scan
    const embeddingLockPath = joinPath(dataDir, "embedding.lock");
    let lockExists = false;
    let lockStale = false;

    if (existsSync(embeddingLockPath)) {
        lockExists = true;
        try {
            const lockContent = readFileSync(embeddingLockPath, "utf-8");
            const lockData = JSON.parse(lockContent);
            if (lockData.pid) {
                process.kill(lockData.pid, 0);
            } else {
                lockStale = true;
            }
        } catch (err) {
            lockStale = true;
        }
    }

    if (lockExists && lockStale) {
        staleLocks.push(embeddingLockPath);
        if (options.fix) {
            try {
                unlinkSync(embeddingLockPath);
            } catch (e) {
                // Ignore unlink errors
            }
        }
    }

    // 4. sqlite-vec health
    const gatherStatus = deps.gatherStatus ?? (await import("./status.js")).gatherStatus;
    const status = await gatherStatus({
        dbPath,
        fix: false,
        stats: false,
    });
    const vecAvailable = status.health.sqliteVec.available;
    const vecVersion = status.health.sqliteVec.version;

    if (options.json) {
        console.log(
            JSON.stringify(
                {
                    portability: {
                        mixedDialectPaths: mixedDialects,
                        orphanedPaths: orphanedPaths,
                        staleLocks: staleLocks,
                        sqliteVecAvailable: vecAvailable,
                        sqliteVecVersion: vecVersion,
                        fixedStaleLocks: options.fix && staleLocks.length > 0,
                    },
                },
                null,
                2
            )
        );
        const hasFailures = orphanedPaths.length > 0 || mixedDialects.length > 0 || (staleLocks.length > 0 && !options.fix) || !vecAvailable;
        return { exitCode: hasFailures ? 1 : 0 };
    }

    // Print text report
    console.log("Portability & Migration Diagnostics");
    console.log("==================================");
    console.log("");

    // Path Dialect Check
    if (mixedDialects.length === 0) {
        console.log(`  ${green("[OK]", useColor)} Path Dialects: No mixed path slashes/drive dialects detected.`);
    } else {
        console.log(`  ${yellow("[WARN]", useColor)} Path Dialects: ${mixedDialects.length} mixed slash/drive formats detected.`);
        for (const p of mixedDialects) {
            console.log(`    - ${p}`);
        }
    }

    // Orphaned Workspaces Check
    if (orphanedPaths.length === 0) {
        console.log(`  ${green("[OK]", useColor)} Orphaned Workspaces: All session folders exist physically on disk.`);
    } else {
        console.log(`  ${yellow("[WARN]", useColor)} Orphaned Workspaces: ${orphanedPaths.length} project folder(s) not found on active filesystem.`);
        for (const p of orphanedPaths) {
            console.log(`    - ${p}`);
        }
    }

    // Active Locks Check
    if (staleLocks.length === 0) {
        console.log(`  ${green("[OK]", useColor)} Active Locks: No stale sync/embedding lock files detected.`);
    } else {
        if (options.fix) {
            console.log(`  ${green("[FIXED]", useColor)} Active Locks: Cleaned up ${staleLocks.length} stale lock file(s).`);
        } else {
            console.log(`  ${yellow("[WARN]", useColor)} Active Locks: ${staleLocks.length} stale sync/embedding lock file(s) found.`);
            for (const lock of staleLocks) {
                console.log(`    - ${lock}`);
            }
        }
    }

    // sqlite-vec Capability
    if (vecAvailable) {
        console.log(`  ${green("[OK]", useColor)} sqlite-vec: Loadable (v${vecVersion}) for active architecture.`);
    } else {
        console.log(`  ${red("[FAIL]", useColor)} sqlite-vec: Not loadable on this system architecture.`);
    }

    console.log("");

    // Print Tip Box if orphaned paths found
    if (orphanedPaths.length > 0) {
        console.log(`💡 [TIP] Orphaned project paths detected. You can safely prune these stale database records by running: memory purge --orphans`);
        console.log("");
    }

    const hasFailures = orphanedPaths.length > 0 || mixedDialects.length > 0 || (staleLocks.length > 0 && !options.fix) || !vecAvailable;
    return { exitCode: hasFailures ? 1 : 0 };
}

// Inline helper for path resolution inside the wrapper
function join(...parts: (string | undefined)[]): string | undefined {
    if (parts.some(p => p === undefined)) return undefined;
    return parts.join("/"); // Simple fallback for wrapper
}
