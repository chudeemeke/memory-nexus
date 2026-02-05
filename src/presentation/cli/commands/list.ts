/**
 * List Command Handler
 *
 * CLI command for listing sessions with filtering.
 * Supports project name filter and date range filters.
 */

import { Command, Option } from "commander";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import type { SessionListOptions } from "../../../domain/ports/repositories.js";
import { ErrorCode, MemoryNexusError } from "../../../domain/errors/index.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  createListFormatter,
  type ListOutputMode,
  type ListFormatOptions,
} from "../formatters/list-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { parseDate, DateParseError } from "../parsers/date-parser.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options parsed from CLI arguments.
 */
interface ListCommandOptions {
  limit?: string;
  project?: string;
  since?: string;
  before?: string;
  days?: number;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Create the list command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createListCommand(): Command {
  return new Command("list")
    .description("List sessions")
    .option("-l, --limit <count>", "Maximum sessions to return", "20")
    .option("-p, --project <name>", "Filter by project name")
    .addOption(
      new Option(
        "--since <date>",
        "Sessions after date (e.g., 'yesterday', '2 weeks ago')"
      ).conflicts("days")
    )
    .addOption(new Option("--before <date>", "Sessions before date").conflicts("days"))
    .addOption(
      new Option("--days <n>", "Sessions from last N days (includes today)")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
          return n;
        })
        .conflicts(["since", "before"])
    )
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-v, --verbose", "Show detailed output").conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output (session IDs only)").conflicts("verbose")
    )
    .action(async (options: ListCommandOptions) => {
      await executeListCommand(options);
    });
}

/**
 * Execute the list command with given options.
 *
 * Creates dependencies, queries sessions, and outputs results.
 *
 * @param options Command options from CLI
 */
export async function executeListCommand(options: ListCommandOptions): Promise<void> {
  const startTime = performance.now();

  // Parse limit
  const limit = parseInt(options.limit ?? "20", 10);
  if (isNaN(limit) || limit < 1) {
    console.error("Error: Limit must be a positive number");
    process.exitCode = 1;
    return;
  }

  // Parse date filters
  let sinceDate: Date | undefined;
  let beforeDate: Date | undefined;

  if (options.days) {
    // --days N = today + past N-1 days
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
  } else {
    if (options.since) {
      try {
        sinceDate = parseDate(options.since);
      } catch (err) {
        if (err instanceof DateParseError) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    }
    if (options.before) {
      try {
        beforeDate = parseDate(options.before);
      } catch (err) {
        if (err instanceof DateParseError) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    }
  }

  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const sessionRepo = new SqliteSessionRepository(db);

    // Build filter options
    const listOptions: SessionListOptions = {
      limit,
      projectFilter: options.project,
      sinceDate,
      beforeDate,
    };

    // Get sessions
    const sessions = await sessionRepo.findFiltered(listOptions);

    // Determine output mode
    let outputMode: ListOutputMode = "default";
    if (options.json) outputMode = "json";
    else if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";

    const useColor = shouldUseColor();
    const formatter = createListFormatter(outputMode, useColor);

    // Check for empty result
    if (sessions.length === 0) {
      console.log(formatter.formatEmpty());
      return;
    }

    // Format and output
    const endTime = performance.now();
    const formatOptions: ListFormatOptions = {
      executionTimeMs: Math.round(endTime - startTime),
      filtersApplied: buildFiltersList(options),
    };
    const output = formatter.formatSessions(sessions, formatOptions);
    console.log(output);
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
    process.exitCode = 1;
  } finally {
    closeDatabase(db);
  }
}

/**
 * Build a list of filters applied for verbose output.
 */
function buildFiltersList(options: ListCommandOptions): string[] {
  const filters: string[] = [];
  if (options.limit) filters.push(`limit: ${options.limit}`);
  if (options.project) filters.push(`project: ${options.project}`);
  if (options.days) filters.push(`days: ${options.days}`);
  if (options.since) filters.push(`since: ${options.since}`);
  if (options.before) filters.push(`before: ${options.before}`);
  return filters;
}
