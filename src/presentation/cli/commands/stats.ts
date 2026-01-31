/**
 * Stats Command Handler
 *
 * CLI command for database statistics overview.
 * Includes hook status summary for visibility into auto-sync state.
 */

import { Command, Option } from "commander";
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
      await executeStatsCommand(options);
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
): Promise<void> {
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
      process.exitCode = 1;
      return;
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
      return;
    }

    // Format and output
    const endTime = performance.now();
    const output = formatter.formatStats(stats, {
      executionTimeMs: Math.round(endTime - startTime),
    });
    console.log(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 2;
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
