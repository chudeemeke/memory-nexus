/**
 * Context Command Handler
 *
 * CLI command for showing aggregated context for a project.
 * Supports filtering by days and multiple output formats.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryNexusError } from "../../../domain/errors/index.js";
import { SqliteContextService } from "../../../infrastructure/database/services/context-service.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  createContextFormatter,
  type ContextOutputMode,
  type ContextFormatOptions,
} from "../formatters/context-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options parsed from CLI arguments.
 */
interface ContextCommandOptions {
  days?: number;
  format?: "brief" | "detailed";
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Create the context command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createContextCommand(): Command {
  return new Command("context")
    .description("Show aggregated context for a project")
    .argument("<project>", "Project name or substring to filter by")
    .addOption(
      new Option("--days <n>", "Sessions from last N days (includes today)")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
          return n;
        })
    )
    .addOption(
      new Option("--format <type>", "Output format")
        .choices(["brief", "detailed"])
        .default("brief")
    )
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-v, --verbose", "Show detailed output with timing")
        .conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output")
        .conflicts("verbose")
    )
    .action(async (project: string, options: ContextCommandOptions) => {
      const result = await executeContextCommand(project, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the context command with given options.
 *
 * @param project Project name or substring to filter by
 * @param options Command options from CLI
 */
export async function executeContextCommand(
  project: string,
  options: ContextCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const contextService = new SqliteContextService(db);

    // Build context options from CLI options
    const contextOptions = {
      days: options.days,
    };

    // Get project context
    const context = await contextService.getProjectContext(project, contextOptions);

    // Determine output mode
    let outputMode: ContextOutputMode = "brief";
    if (options.json) outputMode = "json";
    else if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";
    else if (options.format === "detailed") outputMode = "detailed";

    const useColor = shouldUseColor();
    const formatter = createContextFormatter(outputMode, useColor);

    // Handle null result (project not found)
    if (!context) {
      const message = formatter.formatEmpty(project);
      if (outputMode === "json") {
        console.log(message);
      } else if (outputMode !== "quiet" || message) {
        console.error(message);
      }
      return { exitCode: 1 };
    }

    // Format and output
    const endTime = performance.now();
    const formatOptions: ContextFormatOptions = {
      executionTimeMs: Math.round(endTime - startTime),
      filtersApplied: buildFiltersList(options),
    };
    const output = formatter.formatContext(context, formatOptions);
    console.log(output);
    return { exitCode: 0 };
  } catch (error) {
    // Wrap in MemoryNexusError for consistent formatting
    const nexusError =
      error instanceof MemoryNexusError
        ? error
        : new MemoryNexusError(
            ErrorCode.DB_CONNECTION_FAILED,
            error instanceof Error ? error.message : String(error)
          );

    // Format error based on output mode
    if (options.json) {
      console.log(formatErrorJson(nexusError));
    } else {
      console.error(formatError(nexusError));
    }
    return { exitCode: 1 };
  } finally {
    closeDatabase(db);
  }
  return { exitCode: 0 };
}

/**
 * Build a list of filters applied for verbose output.
 */
function buildFiltersList(options: ContextCommandOptions): string[] {
  const filters: string[] = [];
  if (options.days) filters.push(`days: ${options.days}`);
  return filters;
}
