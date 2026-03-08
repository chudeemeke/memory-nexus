/**
 * Friction Command Handler
 *
 * CLI command group for friction logging operations.
 * Subcommands: log, list, resolve, wont-fix, dashboard.
 *
 * Each subcommand defines --json independently (Commander.js does
 * not inherit parent options to subcommands).
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
    initializeDatabase,
    closeDatabase,
    getDefaultDbPath,
    SqliteFrictionRepository,
} from "../../../infrastructure/database/index.js";
import { FrictionService } from "../../../application/services/friction-service.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Base options shared by all friction subcommands.
 */
export interface FrictionCommandOptions {
    json?: boolean;
}

/**
 * Options for the friction log subcommand.
 */
export interface FrictionLogOptions extends FrictionCommandOptions {
    severity?: string;
    category?: string;
    source?: string;
    context?: string;
}

/**
 * Options for the friction list subcommand.
 */
export interface FrictionListOptions extends FrictionCommandOptions {
    all?: boolean;
    status?: string;
    category?: string;
    limit?: string;
}

/**
 * Options for the friction resolve/wont-fix subcommands.
 */
export interface FrictionResolveOptions extends FrictionCommandOptions {
    resolution: string;
}

/**
 * Options passed to executeFrictionCommand.
 */
export interface FrictionExecuteOptions {
    action: "log" | "list" | "resolve" | "wont-fix" | "dashboard";
    description?: string;
    id?: string;
    json?: boolean;
    severity?: string;
    category?: string;
    source?: string;
    context?: string;
    all?: boolean;
    status?: string;
    limit?: string;
    resolution?: string;
    html?: boolean;
}

/**
 * Create the friction command group for Commander.js.
 *
 * @returns Configured Command instance with subcommands
 */
export function createFrictionCommand(): Command {
    const friction = new Command("friction").description(
        "Log and track friction with memory tool"
    );

    // log subcommand
    friction.addCommand(
        new Command("log")
            .description("Log a friction entry")
            .argument("<description>", "What went wrong")
            .option(
                "--severity <level>",
                "low|medium|high|critical",
                "medium"
            )
            .option(
                "--category <cat>",
                "search|sync|cli|context|integration|ux",
                "cli"
            )
            .option("--source <project>", "Source project name")
            .option("--context <ctx>", "Additional context")
            .option("--json", "Output as JSON")
            .action(
                async (
                    description: string,
                    options: FrictionLogOptions
                ) => {
                    const result = await executeFrictionCommand({
                        action: "log",
                        description,
                        ...options,
                    });
                    process.exitCode = result.exitCode;
                }
            )
    );

    // list subcommand
    friction.addCommand(
        new Command("list")
            .description("List friction entries")
            .option("--all", "Include resolved and won't-fix entries")
            .option("--status <status>", "Filter by status")
            .option("--category <cat>", "Filter by category")
            .option("--limit <n>", "Maximum entries", "50")
            .option("--json", "Output as JSON")
            .action(async (options: FrictionListOptions) => {
                const result = await executeFrictionCommand({
                    action: "list",
                    ...options,
                });
                process.exitCode = result.exitCode;
            })
    );

    // resolve subcommand
    friction.addCommand(
        new Command("resolve")
            .description("Resolve a friction entry")
            .argument("<id>", "Friction entry ID")
            .requiredOption("--resolution <text>", "How it was resolved")
            .option("--json", "Output as JSON")
            .action(
                async (id: string, options: FrictionResolveOptions) => {
                    const result = await executeFrictionCommand({
                        action: "resolve",
                        id,
                        ...options,
                    });
                    process.exitCode = result.exitCode;
                }
            )
    );

    // wont-fix subcommand
    friction.addCommand(
        new Command("wont-fix")
            .description("Mark a friction entry as won't fix")
            .argument("<id>", "Friction entry ID")
            .requiredOption(
                "--resolution <text>",
                "Why it won't be fixed"
            )
            .option("--json", "Output as JSON")
            .action(
                async (id: string, options: FrictionResolveOptions) => {
                    const result = await executeFrictionCommand({
                        action: "wont-fix",
                        id,
                        ...options,
                    });
                    process.exitCode = result.exitCode;
                }
            )
    );

    // dashboard subcommand (stub for Plan 03)
    friction.addCommand(
        new Command("dashboard")
            .description("Show friction dashboard")
            .option("--html", "Generate HTML report")
            .option("--json", "Output as JSON")
            .action(async (options: FrictionCommandOptions & { html?: boolean }) => {
                const result = await executeFrictionCommand({
                    action: "dashboard",
                    ...options,
                });
                process.exitCode = result.exitCode;
            })
    );

    return friction;
}

/**
 * Execute a friction command programmatically.
 *
 * Handles database lifecycle, dispatches to FrictionService methods,
 * and formats output. Returns CommandResult for programmatic API.
 *
 * @param options Friction command options including action discriminator
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
export async function executeFrictionCommand(
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    const dbPath = getDefaultDbPath();
    const { db } = initializeDatabase({ path: dbPath });

    try {
        const repository = new SqliteFrictionRepository(db);
        const service = new FrictionService(repository);

        switch (options.action) {
            case "log":
                return await handleLog(service, options);
            case "list":
                return await handleList(service, options);
            case "resolve":
                return await handleResolve(service, options);
            case "wont-fix":
                return await handleWontFix(service, options);
            case "dashboard":
                return await handleDashboard(service, options);
            default:
                console.error(`Unknown friction action: ${options.action}`);
                return { exitCode: 1 };
        }
    } catch (error) {
        const nexusError =
            error instanceof MemoryError
                ? error
                : new MemoryError(
                      ErrorCode.UNKNOWN,
                      error instanceof Error ? error.message : String(error)
                  );

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

/**
 * Handle the log action.
 */
async function handleLog(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.description) {
        console.error("Error: description is required for log action");
        return { exitCode: 1 };
    }

    const entry = await service.log({
        description: options.description,
        severity: options.severity as "low" | "medium" | "high" | "critical" | undefined,
        category: options.category as "search" | "sync" | "cli" | "context" | "integration" | "ux" | undefined,
        context: options.context,
        sourceProject: options.source,
    });

    if (options.json) {
        console.log(
            JSON.stringify({
                id: entry.id,
                description: entry.description,
                severity: entry.severity,
                category: entry.category,
                status: entry.status,
                loggedAt: entry.loggedAt.toISOString(),
                context: entry.context ?? null,
                sourceProject: entry.sourceProject ?? null,
            })
        );
    } else {
        console.log(
            `Logged friction #${entry.id} (${entry.severity}/${entry.category})`
        );
    }

    return { exitCode: 0 };
}

/**
 * Handle the list action.
 */
async function handleList(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    const entries = await service.list({
        all: options.all,
        status: options.status,
        category: options.category,
        limit,
    });

    if (options.json) {
        console.log(
            JSON.stringify(
                entries.map((e) => ({
                    id: e.id,
                    description: e.description,
                    severity: e.severity,
                    category: e.category,
                    status: e.status,
                    loggedAt: e.loggedAt.toISOString(),
                    resolvedAt: e.resolvedAt?.toISOString() ?? null,
                    resolution: e.resolution ?? null,
                    context: e.context ?? null,
                    sourceProject: e.sourceProject ?? null,
                }))
            )
        );
    } else {
        if (entries.length === 0) {
            console.log(
                options.all
                    ? "No friction entries found."
                    : "No open friction entries."
            );
        } else {
            // Table header
            console.log(
                `${"ID".padEnd(6)}${"Severity".padEnd(10)}${"Category".padEnd(14)}${"Description".padEnd(62)}Age`
            );
            console.log("-".repeat(96));

            for (const entry of entries) {
                const desc =
                    entry.description.length > 60
                        ? entry.description.slice(0, 57) + "..."
                        : entry.description;
                const ageMs = Date.now() - entry.loggedAt.getTime();
                const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                const age = ageDays === 0 ? "today" : `${ageDays}d`;

                console.log(
                    `${String(entry.id).padEnd(6)}${entry.severity.padEnd(10)}${entry.category.padEnd(14)}${desc.padEnd(62)}${age}`
                );
            }

            console.log(`\n${entries.length} ${options.all ? "total" : "open"} entries`);
        }
    }

    return { exitCode: 0 };
}

/**
 * Handle the resolve action.
 */
async function handleResolve(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.id || !options.resolution) {
        console.error(
            "Error: id and --resolution are required for resolve action"
        );
        return { exitCode: 1 };
    }

    const id = parseInt(options.id, 10);
    if (isNaN(id)) {
        console.error("Error: id must be a number");
        return { exitCode: 1 };
    }

    await service.resolve(id, options.resolution);

    if (options.json) {
        console.log(JSON.stringify({ id, status: "resolved", resolution: options.resolution }));
    } else {
        console.log(`Resolved friction #${id}`);
    }

    return { exitCode: 0 };
}

/**
 * Handle the wont-fix action.
 */
async function handleWontFix(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    if (!options.id || !options.resolution) {
        console.error(
            "Error: id and --resolution are required for wont-fix action"
        );
        return { exitCode: 1 };
    }

    const id = parseInt(options.id, 10);
    if (isNaN(id)) {
        console.error("Error: id must be a number");
        return { exitCode: 1 };
    }

    await service.wontFix(id, options.resolution);

    if (options.json) {
        console.log(JSON.stringify({ id, status: "wont-fix", resolution: options.resolution }));
    } else {
        console.log(`Marked friction #${id} as won't fix`);
    }

    return { exitCode: 0 };
}

/**
 * Handle the dashboard action (stub for Plan 03).
 *
 * Outputs basic stats. Plan 03 will replace with rich formatters.
 */
async function handleDashboard(
    service: FrictionService,
    options: FrictionExecuteOptions
): Promise<CommandResult> {
    const stats = await service.getStats();

    if (options.json) {
        console.log(JSON.stringify(stats));
    } else {
        console.log("Friction Dashboard");
        console.log("==================");
        console.log(`Total entries: ${stats.total}`);
        console.log(`Open: ${stats.open}`);
        console.log(`Resolved: ${stats.resolved}`);
        console.log(`Won't fix: ${stats.wontFix}`);

        if (stats.meanTimeToResolve !== null) {
            console.log(
                `Mean time to resolve: ${stats.meanTimeToResolve.toFixed(1)} days`
            );
        }

        if (stats.oldestOpen) {
            console.log(
                `Oldest open: #${stats.oldestOpen.id} (${stats.oldestOpen.daysOpen}d) - ${stats.oldestOpen.description}`
            );
        }
    }

    return { exitCode: 0 };
}
