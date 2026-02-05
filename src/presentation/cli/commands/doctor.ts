/**
 * Doctor Command Handler
 *
 * CLI command for checking system health and diagnosing issues.
 * Provides comprehensive diagnostic output for database, permissions,
 * hooks, and configuration.
 */

import { Command } from "commander";
import { mkdirSync, existsSync } from "node:fs";
import {
    runHealthCheck,
    getDefaultDbPath,
    type HealthCheckResult,
} from "../../../infrastructure/database/index.js";
import {
    getConfigDir,
    getLogDir,
} from "../../../infrastructure/hooks/index.js";
import {
    green,
    red,
    yellow,
    dim,
    shouldUseColor,
} from "../formatters/color.js";

/**
 * Options parsed from CLI arguments.
 */
interface DoctorOptions {
    json?: boolean;
    fix?: boolean;
}

/**
 * Format a boolean value as a status indicator.
 *
 * @param value Boolean value
 * @param useColor Whether to apply colors
 * @returns Formatted status string
 */
function formatStatus(value: boolean, useColor: boolean): string {
    if (value) {
        return green("[OK]", useColor);
    }
    return red("[FAIL]", useColor);
}

/**
 * Format bytes as human-readable size.
 *
 * @param bytes Number of bytes
 * @returns Formatted size string (e.g., "2.4 MB")
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
 *
 * @param integrity Integrity status
 * @param useColor Whether to apply colors
 * @returns Formatted integrity string
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
 *
 * @param date Date to format
 * @returns Human-readable relative time (e.g., "2 hours ago")
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
 *
 * @param result Health check result
 * @param useColor Whether to apply colors
 * @returns Formatted output string
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
 *
 * @param result Health check result
 * @returns Number of issues found
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

    // Hook issues (not counted as issues - just info)

    // Config issues
    count += result.config.issues.length;

    return count;
}

/**
 * Attempt automatic fixes for common issues.
 *
 * @param result Health check result
 * @param useColor Whether to apply colors
 * @returns Array of fix messages
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
        messages.push("  2. Delete the database: rm ~/.memory-nexus/memory.db");
        messages.push("  3. Re-sync: memory sync");
    }

    if (!result.hooks.installed) {
        messages.push(yellow("Hooks not installed. Run 'memory install' to enable automatic sync.", useColor));
    }

    return messages;
}

/**
 * Create the doctor command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createDoctorCommand(): Command {
    return new Command("doctor")
        .description("Check system health and diagnose issues")
        .option("--json", "Output as JSON")
        .option("--fix", "Attempt to fix common issues")
        .action(async (options: DoctorOptions) => {
            await executeDoctorCommand(options);
        });
}

/**
 * Execute the doctor command with given options.
 *
 * @param options Command options from CLI
 */
export async function executeDoctorCommand(options: DoctorOptions): Promise<void> {
    const result = runHealthCheck();
    const useColor = shouldUseColor();

    if (options.json) {
        // Convert dates to ISO strings for JSON serialization
        const jsonResult = {
            ...result,
            hooks: {
                ...result.hooks,
                lastRun: result.hooks.lastRun?.toISOString() ?? null,
            },
        };
        console.log(JSON.stringify(jsonResult, null, 2));
        return;
    }

    // Default output
    console.log(formatHealthResult(result, useColor));

    // Attempt fixes if requested
    if (options.fix) {
        console.log("");
        console.log("Attempting fixes...");
        const fixes = attemptFixes(result, useColor);

        if (fixes.length === 0) {
            console.log(dim("No automatic fixes available.", useColor));
        } else {
            for (const msg of fixes) {
                console.log(msg);
            }
        }
    }
}
