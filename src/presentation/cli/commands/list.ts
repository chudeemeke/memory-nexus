/**
 * List Command Handler
 *
 * CLI command for listing sessions with filtering.
 * Supports project name filter and date range filters.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import type { SessionListOptions } from "../../../domain/ports/repositories.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
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
import { formatForAi } from "../formatters/ai-formatter.js";
import { parseDate, DateParseError } from "../parsers/date-parser.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toSessionListDto } from "../formatters/dto-helpers.js";

/**
 * Options for the list command.
 */
export interface ListCommandOptions {
  /** Maximum sessions to return (as string, parsed to integer) */
  limit?: string;
  /** Filter by project name */
  project?: string;
  /** Sessions after date (e.g., 'yesterday', '2 weeks ago') */
  since?: string;
  /** Sessions before date */
  before?: string;
  /** Sessions from last N days (includes today) */
  days?: number;
  /** Output as JSON */
  json?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Minimal output (session IDs only) */
  quiet?: boolean;
  /** Output format: default or ai */
  format?: "default" | "ai";
}

/**
 * Runtime dependencies for executeListCommand.
 *
 * Separated from ListCommandOptions because these are not user-facing
 * CLI flags — they are operational dependencies that tests substitute
 * to achieve isolation. Defaults to production resolution
 * (getDefaultDbPath()) when omitted.
 *
 * Parity with executeShowCommand (added Plan 32-02 per Codex HIGH-3).
 */
export interface ListCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
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
      new Option("--format <type>", "Output format")
        .choices(["default", "ai"])
        .default("default")
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed output").conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output (session IDs only)").conflicts("verbose")
    )
    .action(async (options: ListCommandOptions) => {
      const result = await executeListCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the list command programmatically.
 *
 * Lists sessions with optional filtering by project, date range, or limit.
 * Handles its own database initialization and teardown.
 *
 * @param options - List command options
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
export async function executeListCommand(
  options: ListCommandOptions,
  deps: ListCommandDeps = {}
): Promise<CommandResult> {
  const startTime = performance.now();

  // Resolve DB path (deps seam takes precedence over production default).
  // Parity with show/context/related/search (per Codex HIGH-3).
  const dbPath = deps.dbPath ?? getDefaultDbPath();

  // Parse limit
  const limit = parseInt(options.limit ?? "20", 10);
  if (isNaN(limit) || limit < 1) {
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "list",
        code: "INVALID_ARGUMENT",
        message: "Limit must be a positive number",
      });
    } else {
      console.error("Error: Limit must be a positive number");
    }
    return { exitCode: 1 };
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
          if (options.json) {
            emitJsonErrorEnvelope({
              command: "list",
              code: "INVALID_ARGUMENT",
              message: err.message,
              context: { flag: "since", value: options.since },
            });
          } else {
            console.error(`Error: ${err.message}`);
          }
          return { exitCode: 1 };
        }
        throw err;
      }
    }
    if (options.before) {
      try {
        beforeDate = parseDate(options.before);
      } catch (err) {
        if (err instanceof DateParseError) {
          if (options.json) {
            emitJsonErrorEnvelope({
              command: "list",
              code: "INVALID_ARGUMENT",
              message: err.message,
              context: { flag: "before", value: options.before },
            });
          } else {
            console.error(`Error: ${err.message}`);
          }
          return { exitCode: 1 };
        }
        throw err;
      }
    }
  }

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

    const filtersApplied = buildFiltersList(options);

    // --json: envelope path (Codex HIGH-2 — every exit point routes here).
    // Precedence: --json wins over --format ai (text-only post-processing
    // has no effect on envelope shape).
    if (options.json) {
      const endTime = performance.now();
      const data = sessions.map(toSessionListDto);
      emitJsonEnvelope({
        command: "list",
        kind: "session",
        data,
        meta: {
          filters_applied: filtersApplied,
          count: data.length,
          timing_ms: Math.round(endTime - startTime),
        },
      });
      return { exitCode: 0 };
    }

    // Determine output mode (text mode)
    let outputMode: ListOutputMode = "default";
    if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";

    const useColor = shouldUseColor();
    const formatter = createListFormatter(outputMode, useColor);

    // Check for empty result (text mode)
    if (sessions.length === 0) {
      console.log(formatter.formatEmpty());
      return { exitCode: 0 };
    }

    // Format and output (text mode)
    const endTime = performance.now();
    const formatOptions: ListFormatOptions = {
      executionTimeMs: Math.round(endTime - startTime),
      filtersApplied,
    };
    let output = formatter.formatSessions(sessions, formatOptions);
    if (options.format === "ai") {
      output = formatForAi(output);
    }
    console.log(output);
    return { exitCode: 0 };
  } catch (error) {
    // Wrap in MemoryError for consistent formatting
    const nexusError =
      error instanceof MemoryError
        ? error
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            error instanceof Error ? error.message : String(error)
          );

    // Format error based on output mode
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "list",
        code: nexusError.code,
        message: nexusError.message,
        ...(nexusError.context !== undefined
          ? { context: nexusError.context }
          : {}),
      });
    } else {
      console.error(formatError(nexusError));
    }
    return { exitCode: 1 };
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
