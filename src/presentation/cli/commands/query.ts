/**
 * Unified Query Command Handler (Phase 32.5 Surface Consolidation)
 *
 * Single command interface for all read-oriented query commands.
 * Unifies search, context, related, list, and show under a single primitive
 * while preserving full backward compatibility.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { emitJsonErrorEnvelope } from "../formatters/envelope.js";

/**
 * Options for the query command.
 */
export interface QueryCommandOptions {
  /** Discriminator envelope scope: global or project */
  scope?: "global" | "project" | undefined;
  /** Filter by project name */
  project?: string | undefined;
  /** Resource kind: message, session, file, stats, context, related */
  kind?: "message" | "session" | "file" | "stats" | "context" | "related" | undefined;
  /** Search mode: fts, vector, hybrid, auto */
  mode?: "fts" | "vector" | "hybrid" | "auto" | undefined;
  /** Maximum results to return */
  limit?: string | undefined;
  /** Output format */
  format?: "brief" | "ai" | "default" | "detailed" | undefined;
  /** Output as JSON envelope */
  json?: boolean | undefined;
  /** Age filter in days */
  days?: number | undefined;
  /** Projects limit count in stats */
  projects?: string | undefined;
  /** Show verbose execution logs */
  verbose?: boolean | undefined;
  /** Suppress headers and decorations */
  quiet?: boolean | undefined;
  /** Database path override (for tests) */
  dbPath?: string | undefined;
}

/**
 * Create the query command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createQueryCommand(): Command {
  return new Command("query")
    .argument("[argument]", "Query argument (search query text, session ID, or project name depending on kind)")
    .description("Execute unified query across sessions, files, stats, or context")
    .addOption(
      new Option("--scope <scope>", "Query scope: global or project")
        .choices(["global", "project"])
    )
    .option("-p, --project <name>", "Filter by project name")
    .addOption(
      new Option("--kind <kind>", "Resource kind to query")
        .choices(["message", "session", "file", "stats", "context", "related"])
        .default("message")
    )
    .addOption(
      new Option("--mode <mode>", "Search mode: auto, fts, vector, hybrid")
        .choices(["auto", "fts", "vector", "hybrid"])
    )
    .option("-l, --limit <count>", "Maximum results to return")
    .addOption(
      new Option(
        "--format <type>",
        "Output format: brief or ai"
      ).choices(["brief", "ai", "default"])
    )
    .option("--json", "Output results as JSON envelope")
    .option("--days <count>", "Filter results from last N days", (val) => {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
      return n;
    })
    .option("--projects <count>", "Number of projects to show in stats breakdown", "10")
    .addOption(
      new Option("-v, --verbose", "Show detailed output with execution info").conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Suppress headers and decorations").conflicts("verbose")
    )
    .action(async (argument: string | undefined, options: QueryCommandOptions) => {
      const result = await executeQueryCommand(argument, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the query command programmatically.
 *
 * Routes query to respective underlying commands dynamically to avoid top-level
 * circular imports, setting the JSON envelope command name override as needed.
 */
export async function executeQueryCommand(
  argument: string | undefined,
  options: QueryCommandOptions
): Promise<CommandResult> {
  const kind = options.kind ?? "message";

  // Force scope resolving:
  // If scope is 'project' but no project name is provided, try to resolve from project flag
  const project = options.project || (options.scope === "project" ? argument : undefined);

  // Set the environment variable override to ensure JSON envelopes emitted by
  // the target commands report 'query' as the command instead of their individual names
  // only if not already overridden by a wrapper command.
  const overrideSetByQuery = !process.env.MEMORY_JSON_COMMAND_OVERRIDE;
  if (overrideSetByQuery) {
    process.env.MEMORY_JSON_COMMAND_OVERRIDE = "query";
  }

  try {
    // Pass-through pattern: wrapper commands spread their full options into
    // the QueryCommandOptions object, so it contains all command-specific
    // fields (tools, format, since, before, type, hops, budget, crossProject,
    // etc.) even though they are not declared on QueryCommandOptions. We cast
    // via 'as any' to forward them transparently to the internal functions
    // which expect their own typed options interfaces.
    const passthrough = options as Record<string, unknown>;

    switch (kind) {
      case "message": {
        const { runSearchInternal } = await import("./search.js");
        return await runSearchInternal(argument || "", {
          ...options,
          project,
          files: false,
        } as any);
      }
      case "file": {
        const { runSearchInternal } = await import("./search.js");
        return await runSearchInternal(argument || "", {
          ...options,
          project,
          files: true,
        } as any);
      }
      case "session": {
        if (argument) {
          const { runShowInternal } = await import("./show.js");
          return await runShowInternal(argument, {
            json: passthrough.json as boolean | undefined,
            verbose: passthrough.verbose as boolean | undefined,
            quiet: passthrough.quiet as boolean | undefined,
            tools: passthrough.tools as boolean | undefined,
            format: passthrough.format as "brief" | "ai" | "default" | undefined,
          } as any, {
            dbPath: options.dbPath,
          } as any);
        } else {
          const { runListInternal } = await import("./list.js");
          return await runListInternal({
            limit: options.limit,
            project,
            since: passthrough.since as string | undefined,
            before: passthrough.before as string | undefined,
            days: options.days,
            json: options.json,
            verbose: options.verbose,
            quiet: options.quiet,
            format: options.format,
          } as any, {
            dbPath: options.dbPath,
          } as any);
        }
      }
      case "stats": {
        const { executeStatsCommand } = await import("./stats.js");
        return await executeStatsCommand({
          json: options.json,
          verbose: options.verbose,
          quiet: options.quiet,
          projects: options.projects,
          format: options.format,
        } as any, {
          dbPath: options.dbPath,
        } as any);
      }
      case "context": {
        const targetProject = project || argument;
        if (!targetProject) {
          if (options.json) {
            emitJsonErrorEnvelope({
              command: "query",
              code: "INVALID_ARGUMENT",
              message: "Project name is required for context query",
            });
          } else {
            console.error("Error: Project name is required for context query");
          }
          return { exitCode: 1 };
        }
        const { runContextInternal } = await import("./context.js");
        return await runContextInternal(targetProject, {
          json: options.json,
          verbose: options.verbose,
          quiet: options.quiet,
          days: options.days,
          format: passthrough.format as "brief" | "ai" | "detailed" | undefined,
          budget: passthrough.budget as number | undefined,
          crossProject: passthrough.crossProject as boolean | undefined,
        } as any, {
          dbPath: options.dbPath,
        } as any);
      }
      case "related": {
        if (!argument) {
          if (options.json) {
            emitJsonErrorEnvelope({
              command: "query",
              code: "INVALID_ARGUMENT",
              message: "Source session ID is required for related query",
            });
          } else {
            console.error("Error: Source session ID is required for related query");
          }
          return { exitCode: 1 };
        }
        const { runRelatedInternal } = await import("./related.js");
        return await runRelatedInternal(argument, {
          limit: passthrough.limit as number | undefined,
          json: options.json,
          verbose: options.verbose,
          quiet: options.quiet,
          format: passthrough.format as "brief" | "ai" | "detailed" | undefined,
          type: passthrough.type as "session" | "message" | "topic" | undefined,
          hops: passthrough.hops as number | undefined,
          dbPath: options.dbPath,
        } as any, {
          dbPath: options.dbPath,
        } as any);
      }
      default: {
        if (options.json) {
          emitJsonErrorEnvelope({
            command: "query",
            code: "INVALID_ARGUMENT",
            message: `Unsupported kind: ${kind}`,
          });
        } else {
          console.error(`Error: Unsupported kind: ${kind}`);
        }
        return { exitCode: 1 };
      }
    }
  } finally {
    // Always clean up the environment override if it was set by this query call
    if (overrideSetByQuery) {
      delete process.env.MEMORY_JSON_COMMAND_OVERRIDE;
    }
  }
}
