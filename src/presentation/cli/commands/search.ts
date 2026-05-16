/**
 * Search Command Handler
 *
 * CLI command for full-text and hybrid search across synced sessions.
 * Wires to HybridSearchService supporting auto, FTS, vector, and hybrid modes.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";
import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import type { SearchMode, HybridSearchOptions } from "../../../domain/ports/services.js";
import type { MessageRole } from "../../../domain/entities/message.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
  Fts5SearchService,
  HybridSearchService,
  EmbeddingRepository,
} from "../../../infrastructure/database/index.js";
import { EmbeddingProviderFactory } from "../../../infrastructure/embedding/embedding-provider-factory.js";
import {
  loadConfig,
  saveConfig,
} from "../../../infrastructure/hooks/config-manager.js";
import {
  createOutputFormatter,
  type OutputMode,
  type FormatOptions,
} from "../formatters/output-formatter.js";
import { shouldUseColor, green, dim } from "../formatters/color.js";
import { formatForAi } from "../formatters/ai-formatter.js";
import { parseDate, DateParseError } from "../parsers/date-parser.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import {
  toSearchResultDto,
  toFileResultDto,
} from "../formatters/dto-helpers.js";
import { emitFormatDeprecationWarning } from "./_helpers/deprecation-warning.js";
import { QmdRunner, isQmdAvailable } from "../../../infrastructure/external/index.js";
import type { QmdSearchResult } from "../../../domain/ports/services.js";

/**
 * Options for the search command.
 */
export interface SearchCommandOptions {
  /** Maximum results to return (as string, parsed to integer) */
  limit?: string;
  /** Filter by project name */
  project?: string;
  /** Filter by session ID */
  session?: string;
  /** Filter by role: user, assistant, or both (comma-separated) */
  role?: string;
  /** Results after date (e.g., 'yesterday', '2 weeks ago') */
  since?: string;
  /** Results before date */
  before?: string;
  /** Results from last N days (includes today) */
  days?: number;
  /** Output results as JSON */
  json?: boolean;
  /** Case-insensitive search (default) */
  ignoreCase?: boolean;
  /** Case-sensitive search */
  caseSensitive?: boolean;
  /** Show detailed output with execution info */
  verbose?: boolean;
  /** Suppress headers and decorations */
  quiet?: boolean;
  /** Search mode: auto, fts, vector, or hybrid */
  mode?: string;
  /** Set to false via --no-vector to disable vector search */
  vector?: boolean;
  /** Set to false via --no-decay to disable temporal decay scoring */
  decay?: boolean;
  /**
   * Output format. Phase 32 (CLI-03) normalized choices: `brief`,
   * `ai`. `default` retained as deprecated alias (one-minor cadence;
   * CHANGELOG documents removal). Undefined = no-flag default text
   * output (backward compatible).
   */
  format?: "brief" | "ai" | "default";
  /** Search markdown files via qmd (requires qmd installed) */
  files?: boolean;
  /** Override database path (for testing) */
  dbPath?: string;
}

/**
 * Resolve the effective search mode from CLI flags.
 *
 * --no-vector always forces FTS mode (DEGRADE-04), overriding --mode.
 * --mode auto returns undefined to let HybridSearchService decide.
 * Explicit modes (fts, vector, hybrid) are returned directly.
 *
 * @param options Partial options with mode and noVector flags
 * @returns Resolved SearchMode or undefined for auto
 */
export function resolveSearchMode(
  options: { mode?: string; vector?: boolean }
): SearchMode | undefined {
  // --no-vector (vector === false) overrides everything: force FTS
  if (options.vector === false) {
    return "fts";
  }

  // No mode specified or auto: let HybridSearchService auto-resolve
  if (!options.mode || options.mode === "auto") {
    return undefined;
  }

  // Explicit mode
  return options.mode as SearchMode;
}

/**
 * Create the search command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createSearchCommand(): Command {
  return new Command("search")
    .argument("<query>", "Search query text")
    .description("Search across all sessions (keyword, semantic, or hybrid)")
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
      new Option("--mode <mode>", "Search mode: auto, fts, vector, hybrid")
        .choices(["auto", "fts", "vector", "hybrid"])
        .default("auto")
    )
    .addOption(
      new Option("--no-vector", "Disable vector search (same as --mode fts)")
    )
    .addOption(
      new Option("--no-decay", "Disable temporal decay scoring")
    )
    .option("--files", "Search markdown files via qmd (requires qmd installed)")
    .addOption(
      new Option(
        "--format <type>",
        "Output format: brief (single-line per record) or ai (AI-optimized text). 'default' accepted as deprecated alias.",
      ).choices(["brief", "ai", "default"]),
      // No .default() — undefined = current text default (backward compatible).
      // 'default' is retained as a deprecated alias for one minor; CHANGELOG documents removal.
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed output with execution info")
        .conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Suppress headers and decorations")
        .conflicts("verbose")
    )
    .action(async (query: string, options: SearchCommandOptions) => {
      const result = await executeSearchCommand(query, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the search command programmatically.
 *
 * Searches sessions using FTS5 or hybrid semantic search. Handles its own
 * database initialization and teardown.
 *
 * @param query - The search string (must be non-empty)
 * @param options - Search command options
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
export async function executeSearchCommand(
  query: string,
  options: SearchCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  // Phase 32 (CLI-03): emit one-shot stderr deprecation warning for
  // --format default. Suppressed in --json mode. Behavior is
  // preserved (alias falls through to the default text path below).
  if (options.format === "default") {
    emitFormatDeprecationWarning({
      command: "search",
      alias: "default",
      replacement: "Omit --format for default behavior, or use --format brief / --format ai.",
      json: options.json,
    });
  }

  // Validate query
  let searchQuery: SearchQuery;
  try {
    searchQuery = SearchQuery.from(query);
  } catch (_error) {
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "search",
        code: "INVALID_QUERY",
        message: "Query cannot be empty",
      });
    } else {
      console.error("Error: Query cannot be empty");
    }
    return { exitCode: 1 };
  }

  // Short-circuit to file search when --files is specified
  // File search does NOT need the memory database
  if (options.files) {
    return executeFileSearch(query, options);
  }

  // Initialize database
  const dbPath = options.dbPath ?? getDefaultDbPath();
  const { db, sqliteVecAvailable } = initializeDatabase({ path: dbPath });

  const providerFactory = new EmbeddingProviderFactory();

  try {
    // Load config
    const config = loadConfig();

    // Create hybrid search service
    const fts5Service = new Fts5SearchService(db);
    const embeddingRepo = new EmbeddingRepository(db);

    const searchService = new HybridSearchService({
      db,
      fts5Service,
      embeddingRepo,
      providerFactory,
      config,
      sqliteVecAvailable,
    });

    // Parse limit option
    const limit = parseInt(options.limit ?? "10", 10);
    if (isNaN(limit) || limit < 1) {
      if (options.json) {
        emitJsonErrorEnvelope({
          command: "search",
          code: "INVALID_ARGUMENT",
          message: "Limit must be a positive number",
        });
      } else {
        console.error("Error: Limit must be a positive number");
      }
      return { exitCode: 1 };
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
            if (options.json) {
              emitJsonErrorEnvelope({
                command: "search",
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
                command: "search",
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

    // Resolve search mode from flags
    // --no-vector sets options.vector = false; --no-decay sets options.decay = false
    const searchMode = resolveSearchMode(options);

    // Build complete HybridSearchOptions
    const fetchLimit = options.caseSensitive ? limit * 2 : limit;
    const hybridOptions: HybridSearchOptions = {
      limit: fetchLimit,
      projectFilter: options.project,
      roleFilter,
      sinceDate,
      beforeDate,
      sessionFilter: options.session,
      mode: searchMode,
      noDecay: options.decay === false,
    };

    // Execute search
    let results = await searchService.search(searchQuery, hybridOptions);

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

    // Get search metadata for output formatting
    const searchMeta = searchService.getLastSearchMeta();

    // Determine output mode.
    // Precedence (Phase 32 CLI-03): --json > --quiet > --verbose > --format brief > default.
    // 'default' alias falls through to text default path (Phase 32 deprecation).
    let outputMode: OutputMode = "default";
    if (options.json) outputMode = "json";
    else if (options.quiet) outputMode = "quiet";
    else if (options.verbose) outputMode = "verbose";
    else if (options.format === "brief") outputMode = "brief";

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
      searchMeta: searchMeta ?? undefined,
    };

    const endMs = Math.round(performance.now() - startTime);
    const buildSearchMeta = (): Record<string, unknown> => {
      const meta: Record<string, unknown> = {
        query,
        total_results: results.length,
        timing_ms: endMs,
      };
      if (searchMeta) {
        meta.mode = searchMeta.mode;
        meta.mode_reason = searchMeta.modeReason;
        meta.embedding_coverage = searchMeta.embeddingCoverage;
        meta.degraded = searchMeta.degraded;
        if (searchMeta.degradationReason) {
          meta.degradation_reason = searchMeta.degradationReason;
        }
      }
      return meta;
    };

    // Precedence rule (Codex HIGH-5): --json takes the envelope path
    // regardless of --format ai. For search, --format ai is text-only
    // post-processing (not a routing fork), but the precedence is the
    // same: --json wins.
    if (options.json) {
      emitJsonEnvelope({
        command: "search",
        kind: "message",
        data: results.map((r, i) =>
          toSearchResultDto(r, {
            rank: i + 1,
            includeSearchMetaFields: !!searchMeta,
          }),
        ),
        meta: buildSearchMeta(),
      });
      // One-time hint for zero embedding coverage (stderr, advisory only).
      if (
        searchMeta &&
        searchMeta.embeddingCoverage === 0 &&
        !config.search?.hintShown
      ) {
        console.error("Tip: run 'memory sync --embed' to enable semantic search");
        saveConfig({ search: { ...config.search, hintShown: true } });
      }
      return { exitCode: 0 };
    }

    // Handle empty results with mode-specific messages (text mode)
    if (results.length === 0 && searchMeta?.mode === "vector") {
      console.log(`No semantic matches for "${query}"`);
      return { exitCode: 0 };
    }

    // Output results using formatter (text mode)
    let output = formatter.formatResults(results, formatOptions);
    if (options.format === "ai") {
      output = formatForAi(output);
    }
    console.log(output);

    // One-time hint for zero embedding coverage
    if (
      searchMeta &&
      searchMeta.embeddingCoverage === 0 &&
      !config.search?.hintShown
    ) {
      console.error("Tip: run 'memory sync --embed' to enable semantic search");
      saveConfig({ search: { ...config.search, hintShown: true } });
    }

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
        command: "search",
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
    await providerFactory.dispose();
    closeDatabase(db);
  }
}

/**
 * Execute a file search by delegating to the qmd external tool.
 *
 * Short-circuits the normal search flow. Does NOT initialize the memory
 * database -- file search is entirely handled by qmd.
 *
 * @param query - Search query string
 * @param options - Search command options
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
async function executeFileSearch(
  query: string,
  options: SearchCommandOptions
): Promise<CommandResult> {
  // Check qmd availability
  if (!isQmdAvailable()) {
    if (options.json) {
      // HIGH-4: qmd-unavailable must emit envelope shape, not plain text.
      emitJsonErrorEnvelope({
        command: "search",
        code: "QMD_UNAVAILABLE",
        message:
          "qmd is required for --files search. Install: bun add -g @tobilu/qmd",
      });
    } else {
      console.error(
        "Error: qmd is required for --files search. Install: bun add -g @tobilu/qmd"
      );
    }
    return { exitCode: 1 };
  }

  try {
    const runner = new QmdRunner();
    const results = await runner.search(query);

    // HIGH-4: --files --json emits envelope with kind: "file" on every
    // path (success / empty), not the bespoke bare-array that leaked
    // pre-Plan-32-02.
    if (options.json) {
      emitJsonEnvelope({
        command: "search",
        kind: "file",
        data: results.map(toFileResultDto),
        meta: { query, files: true, total_results: results.length },
      });
      return { exitCode: 0 };
    }

    if (results.length === 0) {
      const message = `No file results for "${query}"`;
      console.log(options.format === "ai" ? message : message);
      return { exitCode: 0 };
    }

    // Formatted text output
    const useColor = shouldUseColor();
    let output = formatFileResults(results, useColor);

    if (options.format === "ai") {
      output = formatForAi(output);
    }

    console.log(output);
    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "search",
        code: "QMD_FAILED",
        message: `qmd search failed: ${message}`,
      });
    } else {
      console.error(`Error: qmd search failed: ${message}`);
    }
    return { exitCode: 1 };
  }
}

/**
 * Format qmd search results for display.
 *
 * @param results Array of qmd search results
 * @param useColor Whether to apply ANSI colors
 * @returns Formatted output string
 */
function formatFileResults(
  results: QmdSearchResult[],
  useColor: boolean
): string {
  const lines: string[] = [];

  lines.push(`File results: ${results.length} match${results.length !== 1 ? "es" : ""}`);
  lines.push("");

  for (const result of results) {
    // Strip qmd:// prefix from file path
    const filePath = result.file.replace(/^qmd:\/\//, "");

    lines.push(`  ${green(result.title, useColor)}`);
    lines.push(`  ${dim(`${filePath} (score: ${result.score})`, useColor)}`);

    const snippet = result.snippet || result.context;
    if (snippet) {
      lines.push(`  ${snippet}`);
    }

    lines.push("");
  }

  return lines.join("\n");
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
  if (options.mode && options.mode !== "auto") filters.push(`mode: ${options.mode}`);
  if (options.vector === false) filters.push("no-vector");
  if (options.decay === false) filters.push("no-decay");
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
