/**
 * Friction command group: log, list, resolve, wont-fix, dashboard, purge.
 * Each subcommand defines --json independently (Commander.js does not inherit parent options).
 */

import { Command, Option } from "commander";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CommandResult } from "../../command-result.js";
import { ErrorCode, MemoryError } from "../../../../domain/errors/index.js";
import { initializeDatabase, closeDatabase, getDefaultDbPath, SqliteFrictionRepository } from "../../../../infrastructure/database/index.js";
import { FrictionService } from "../../../../application/services/friction-service.js";
import { formatError, formatErrorJson } from "../../formatters/error-formatter.js";
import type { FrictionExecuteOptions, FrictionCommandDeps, FrictionLogOptions, FrictionListOptions, FrictionResolveOptions, FrictionPurgeOptions, FrictionCommandOptions } from "./types.js";
import { handleLog } from "./log.js";
import { handleList } from "./list.js";
import { handleResolve } from "./resolve.js";
import { handleWontFix } from "./wontfix.js";
import { handleDashboard } from "./dashboard.js";
import { handlePurge } from "./purge.js";

/** Create the friction command group for Commander.js. */
export function createFrictionCommand(): Command {
    const friction = new Command("friction")
        .description("Log and track friction with memory tool")
        .addOption(new Option("--format <type>", "Output format").choices(["default", "ai"]).default("default"));

    friction.addCommand(
        new Command("log")
            .description("Log a friction entry")
            .argument("<description>", "What went wrong")
            .option("--severity <level>", "low|medium|high|critical", "medium")
            .option("--category <cat>", "search|sync|cli|context|integration|ux", "cli")
            .option("--tool <name>", "Tool that had friction (e.g., aidev, memory, gsd)")
            .option("--source <project>", "Source project name")
            .option("--context <ctx>", "Additional context")
            .option("--json", "Output as JSON")
            .action(async (description: string, options: FrictionLogOptions) => {
                const result = await executeFrictionCommand({ action: "log", description, ...options });
                process.exitCode = result.exitCode;
            })
    );

    friction.addCommand(
        new Command("list")
            .description("List friction entries")
            .option("--all", "Include resolved and won't-fix entries")
            .option("--status <status>", "Filter by status")
            .option("--category <cat>", "Filter by category")
            .option("--tool <name>", "Filter by tool name")
            .option("--limit <n>", "Maximum entries", "50")
            .option("--json", "Output as JSON")
            .action(async (options: FrictionListOptions) => {
                const result = await executeFrictionCommand({ action: "list", ...options });
                process.exitCode = result.exitCode;
            })
    );

    friction.addCommand(
        new Command("resolve")
            .description("Resolve a friction entry")
            .argument("<id>", "Friction entry ID")
            .requiredOption("--resolution <text>", "How it was resolved")
            .option("--json", "Output as JSON")
            .action(async (id: string, options: FrictionResolveOptions) => {
                const result = await executeFrictionCommand({ action: "resolve", id, ...options });
                process.exitCode = result.exitCode;
            })
    );

    friction.addCommand(
        new Command("wont-fix")
            .description("Mark a friction entry as won't fix")
            .argument("<id>", "Friction entry ID")
            .requiredOption("--resolution <text>", "Why it won't be fixed")
            .option("--json", "Output as JSON")
            .action(async (id: string, options: FrictionResolveOptions) => {
                const result = await executeFrictionCommand({ action: "wont-fix", id, ...options });
                process.exitCode = result.exitCode;
            })
    );

    friction.addCommand(
        new Command("dashboard")
            .description("Show friction dashboard")
            .option("--html", "Generate HTML report")
            .option("--tool <name>", "Filter by tool name")
            .option("--json", "Output as JSON")
            .action(async (options: FrictionCommandOptions & { html?: boolean; tool?: string }) => {
                const result = await executeFrictionCommand({ action: "dashboard", ...options });
                process.exitCode = result.exitCode;
            })
    );

    friction.addCommand(
        new Command("purge")
            .description("Delete friction entries by description pattern")
            .argument("<pattern>", "Description pattern (SQL LIKE: % for wildcard)")
            .option("--dry-run", "Preview matches without deleting")
            .option("-f, --force", "Skip confirmation")
            .option("--json", "Output as JSON")
            .action(async (pattern: string, options: FrictionPurgeOptions) => {
                const result = await executeFrictionCommand({ action: "purge", pattern, ...options });
                process.exitCode = result.exitCode;
            })
    );

    return friction;
}

/** Execute a friction command programmatically. Manages DB lifecycle, dispatches to handlers. */
export async function executeFrictionCommand(
    options: FrictionExecuteOptions,
    deps: FrictionCommandDeps = {}
): Promise<CommandResult> {
    const dbPath = getDefaultDbPath();
    const { db } = initializeDatabase({ path: dbPath });

    try {
        const repository = new SqliteFrictionRepository(db);
        const service = new FrictionService(repository);

        // Auto-ingest fallback file before any action
        const fallbackPath = join(homedir(), ".claude", "friction.jsonl");
        const ingested = await service.ingestFallbackFile(fallbackPath);
        if (ingested > 0) {
            process.stderr.write(`Ingested ${ingested} friction entries from fallback file\n`);
        }

        switch (options.action) {
            case "log": return await handleLog(service, options);
            case "list": return await handleList(service, options);
            case "resolve": return await handleResolve(service, options);
            case "wont-fix": return await handleWontFix(service, options);
            case "dashboard": return await handleDashboard(service, options, deps.openInBrowser);
            case "purge": return await handlePurge(service, options);
            default:
                console.error(`Unknown friction action: ${options.action}`);
                return { exitCode: 1 };
        }
    } catch (error) {
        const nexusError = error instanceof MemoryError
            ? error
            : new MemoryError(ErrorCode.UNKNOWN, error instanceof Error ? error.message : String(error));

        if (options.json) {
            console.log(formatErrorJson(nexusError));
        } else {
            console.error(formatError(nexusError));
        }
        return { exitCode: 1 };
    } finally {
        closeDatabase(db);
    }
}

// Re-export types for barrel consumers
export type {
    BrowserOpener, FrictionCommandDeps, FrictionCommandOptions,
    FrictionLogOptions, FrictionListOptions, FrictionResolveOptions,
    FrictionPurgeOptions, FrictionExecuteOptions,
} from "./types.js";
