/**
 * Search Command Handler
 *
 * CLI command for full-text search across synced sessions.
 * Wires to Fts5SearchService with result formatting.
 */

import { Command, Option } from "commander";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";
import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import type { SearchOptions } from "../../../domain/ports/services.js";
import type { MessageRole } from "../../../domain/entities/message.js";
import { ErrorCode, MemoryNexusError } from "../../../domain/errors/index.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
  Fts5SearchService,
} from "../../../infrastructure/database/index.js";
import {
  createOutputFormatter,
  type OutputMode,
  type FormatOptions,
} from "../formatters/output-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { parseDate, DateParseError } from "../parsers/date-parser.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options parsed from CLI arguments.
 */
interface SearchCommandOptions {
  limit?: string;
  project?: string;
  session?: string;
  role?: string;
  since?: string;
  before?: string;
  days?: number;
  json?: boolean;
  ignoreCase?: boolean;
  caseSensitive?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Create the search command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createSearchCommand(): Command {
  return new Command("search")
    .argument("<query>", "Search query text")
    .description("Full-text search across all sessions")
    .option("-l, --limit <count>", "Maximum results to return", "10")
    .option("-p, --project <name>", "Filter by project name")
    .option("-s, --session <id>", "Filter by session ID")
    .option("--role <roles>", "Filter by role: user, assistant, or both (comma-separated)")
    .addOption(
      new Option("--since <date>", "Results after date (e.g., 'yesterday', '2 weeks ago')")
        .conflicts("days")
    )
    .addOption(
      new Option("--before <date>", "Results before date")
        .conflicts("days")
    )
    .addOption(
      new Option("--days <n>", "Results from last N days (includes today)")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
          return n;
        })
        .conflicts(["since", "before"])
    )
    .option("--json", "Output results as JSON")
    .option("-i, --ignore-case", "Case-insensitive search (default)")
    .option("-c, --case-sensitive", "Case-sensitive search")
    .addOption(
      new Option("-v, --verbose", "Show detailed output with execution info")
        .conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Suppress headers and decorations")
        .conflicts("verbose")
    )
    .action(async (query: string, options: SearchCommandOptions) => {
      await executeSearchCommand(query, options);
    });
}

/**
 * Execute the search command with given options.
 *
 * Creates dependencies, runs search, and outputs results.
 *
 * @param query Search query string
 * @param options Command options from CLI
 */
export async function executeSearchCommand(
  query: string,
  options: SearchCommandOptions
): Promise<void> {
  const startTime = performance.now();

  // Validate query
  let searchQuery: SearchQuery;
  try {
    searchQuery = SearchQuery.from(query);
  } catch (error) {
    console.error("Error: Query cannot be empty");
    process.exitCode = 1;
    return;
  }

  // Initialize database
  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Create search service
    const searchService = new Fts5SearchService(db);

    // Parse limit option
    const limit = parseInt(options.limit ?? "10", 10);
    if (isNaN(limit) || limit < 1) {
      console.error("Error: Limit must be a positive number");
      process.exitCode = 1;
      return;
    }

    // Parse role filter
    let roleFilter: MessageRole | MessageRole[] | undefined;
    if (options.role) {
      const roles = options.role.split(",").map((r) => r.trim().toLowerCase());
      if (roles.length === 1) {
        roleFilter = roles[0] as MessageRole;
      } else {
        roleFilter = roles as MessageRole[];
      }
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

    // Build complete SearchOptions
    const fetchLimit = options.caseSensitive ? limit * 2 : limit;
    const searchOptions: SearchOptions = {
      limit: fetchLimit,
      projectFilter: options.project,
      roleFilter,
      sinceDate,
      beforeDate,
      sessionFilter: options.session,
    };

    // Execute search with case-sensitive awareness
    // If case-sensitive, fetch 2x results to account for filtering
    let results = await searchService.search(searchQuery, searchOptions);

    // Apply case-sensitive filter if requested
    let caseSensitiveFiltered = false;
    if (options.caseSensitive && results.length > 0) {
      const originalCount = results.length;
      results = filterCaseSensitive(results, query, limit);
      caseSensitiveFiltered = originalCount > results.length || results.length < limit;
    } else {
      // Ensure we respect the original limit for non-case-sensitive search
      results = results.slice(0, limit);
    }

    // Determine output mode
    let outputMode: OutputMode = "default";
    if (options.json) outputMode = "json";
    else if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";

    const useColor = shouldUseColor();
    const formatter = createOutputFormatter(outputMode, useColor);

    // Build format options
    const endTime = performance.now();
    const formatOptions: FormatOptions = {
      query,
      executionDetails: {
        timeMs: Math.round(endTime - startTime),
        ftsQuery: query,
        filtersApplied: buildFiltersList(options, caseSensitiveFiltered),
      },
    };

    // Output results using formatter
    const output = formatter.formatResults(results, formatOptions);
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
function buildFiltersList(options: SearchCommandOptions, caseSensitiveFiltered: boolean): string[] {
  const filters: string[] = [];
  if (options.limit) filters.push(`limit: ${options.limit}`);
  if (options.project) filters.push(`project: ${options.project}`);
  if (options.session) filters.push(`session: ${options.session}`);
  if (options.role) filters.push(`role: ${options.role}`);
  if (options.days) filters.push(`days: ${options.days}`);
  if (options.since) filters.push(`since: ${options.since}`);
  if (options.before) filters.push(`before: ${options.before}`);
  if (options.caseSensitive) filters.push("case-sensitive");
  if (caseSensitiveFiltered) filters.push("case-sensitive filter applied");
  return filters;
}


/**
 * Filter results to only include those with case-sensitive match in snippet.
 *
 * @param results Search results from FTS5
 * @param query Original query string
 * @param limit Maximum results to return after filtering
 * @returns Filtered results matching exact case
 */
export function filterCaseSensitive(
  results: SearchResult[],
  query: string,
  limit: number
): SearchResult[] {
  const filtered = results.filter((r) => {
    // Remove <mark> tags to get clean snippet for matching
    const cleanSnippet = r.snippet.replace(/<\/?mark>/g, "");
    return cleanSnippet.includes(query);
  });
  return filtered.slice(0, limit);
}

