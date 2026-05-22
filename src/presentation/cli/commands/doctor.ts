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
} from "../formatters/color.js";
import { getQmdInfo } from "../../../infrastructure/external/index.js";
import type { HealthCheckResult } from "../../../infrastructure/database/health-checker.js";

/**
 * Options for the doctor command.
 */
export interface DoctorOptions {
    /** Output health check results as JSON */
    json?: boolean;
    /** Attempt to fix common issues automatically */
    fix?: boolean;
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
 * Create the doctor command for Commander.js.
 */
export function createDoctorCommand(): Command {
    return new Command("doctor")
        .description("Check system health and diagnose issues")
        .option("--json", "Output as JSON")
        .option("--fix", "Attempt to fix common issues")
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
    if (options.json) {
        const { gatherStatus } = await import("./status.js");
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

// Inline helper for path resolution inside the wrapper
function join(...parts: (string | undefined)[]): string | undefined {
    if (parts.some(p => p === undefined)) return undefined;
    return parts.join("/"); // Simple fallback for wrapper
}
