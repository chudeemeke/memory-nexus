/**
 * Stats Command Handler
 *
 * CLI command for database statistics overview.
 * Includes hook status summary for visibility into auto-sync state.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
  SqliteStatsService,
  SqliteExtractionStateRepository,
} from "../../../infrastructure/database/index.js";
import {
  createStatsFormatter,
  type StatsOutputMode,
  type ExtendedStatsResult,
  type HooksSummary,
} from "../formatters/stats-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { formatForAi } from "../formatters/ai-formatter.js";
import {
  checkHooksInstalled,
  loadConfig,
} from "../../../infrastructure/hooks/index.js";
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options for the stats command.
 */
export interface StatsCommandOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show detailed output with timing */
  verbose?: boolean;
  /** Minimal output */
  quiet?: boolean;
  /** Number of projects to show in breakdown (as string, parsed to integer) */
  projects?: string;
  /** Output format: default or ai */
  format?: "default" | "ai";
}

/**
 * Runtime dependencies for executeStatsCommand.
 *
 * Separated from StatsCommandOptions because these are not user-facing
 * CLI flags — they are operational dependencies that tests substitute
 * to achieve isolation. Defaults to production resolution
 * (getDefaultDbPath()) when omitted.
 *
 * Parity with executeShowCommand (added Plan 32-02 per Codex HIGH-3).
 */
export interface StatsCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
}

/**
 * Create the stats command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createStatsCommand(): Command {
  return new Command("stats")
    .description("Show database statistics")
    .option("--json", "Output as JSON")
    .addOption(
      new Option("--format <type>", "Output format")
        .choices(["default", "ai"])
        .default("default")
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed output with timing").conflicts(
        "quiet"
      )
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output").conflicts("verbose")
    )
    .option(
      "--projects <count>",
      "Number of projects to show in breakdown",
      "10"
    )
    .action(async (options: StatsCommandOptions) => {
      const result = await executeStatsCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the stats command programmatically.
 *
 * Shows database statistics including session count, message count, and
 * storage size. Handles its own database initialization and teardown.
 *
 * @param options - Stats command options
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
export async function executeStatsCommand(
  options: StatsCommandOptions,
  deps: StatsCommandDeps = {}
): Promise<CommandResult> {
  const startTime = performance.now();

  // Resolve DB path (deps seam takes precedence over production default).
  // Parity with show/context/related/search (per Codex HIGH-3).
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Create stats service
    const statsService = new SqliteStatsService(db);

    // Parse project limit
    const projectLimit = parseInt(options.projects ?? "10", 10);
    if (isNaN(projectLimit) || projectLimit < 1) {
      console.error("Error: Projects count must be a positive number");
      return { exitCode: 1 };
    }

    // Get stats
    const baseStats = await statsService.getStats(projectLimit);

    // Get hook status
    const hooksSummary = await gatherHooksSummary(db);

    // Build extended stats
    const stats: ExtendedStatsResult = {
      ...baseStats,
      hooks: hooksSummary,
    };

    // Determine output mode
    let outputMode: StatsOutputMode = "default";
    if (options.json) outputMode = "json";
    else if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";

    const useColor = shouldUseColor();
    const formatter = createStatsFormatter(outputMode, useColor);

    // Check for empty database
    if (stats.totalSessions === 0) {
      console.log(formatter.formatEmpty());
      return { exitCode: 0 };
    }

    // Format and output
    const endTime = performance.now();
    let output = formatter.formatStats(stats, {
      executionTimeMs: Math.round(endTime - startTime),
    });
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
 * Gather hook status summary.
 *
 * @param db Database instance for extraction state queries
 * @returns Hook summary with installation state and pending count
 */
async function gatherHooksSummary(db: ReturnType<typeof initializeDatabase>["db"]): Promise<HooksSummary> {
  // Check hook installation status
  const hookStatus = checkHooksInstalled();
  const config = loadConfig();

  // Count pending sessions
  let pendingSessions = 0;
  try {
    const sessionSource = new FileSystemSessionSource();
    const extractionStateRepo = new SqliteExtractionStateRepository(db);

    const allSessions = await sessionSource.discoverSessions();
    for (const session of allSessions) {
      const state = await extractionStateRepo.findBySessionPath(session.path);
      if (!state || state.status !== "complete") {
        pendingSessions++;
      }
    }
  } catch {
    // Ignore errors - pending count is informational
  }

  return {
    installed: hookStatus.sessionEnd && hookStatus.preCompact,
    autoSync: config.autoSync,
    pendingSessions,
  };
}
