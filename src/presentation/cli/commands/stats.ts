/**
 * Stats Command Handler
 *
 * CLI command for database statistics overview.
 * Includes hook status summary for visibility into auto-sync state.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryNexusError } from "../../../domain/errors/index.js";
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
import {
  checkHooksInstalled,
  loadConfig,
} from "../../../infrastructure/hooks/index.js";
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options parsed from CLI arguments.
 */
interface StatsCommandOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  projects?: string;
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
 * Execute the stats command with given options.
 *
 * Creates dependencies, retrieves stats, and outputs results.
 *
 * @param options Command options from CLI
 */
export async function executeStatsCommand(
  options: StatsCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  // Initialize database
  const dbPath = getDefaultDbPath();
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
    const output = formatter.formatStats(stats, {
      executionTimeMs: Math.round(endTime - startTime),
    });
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
