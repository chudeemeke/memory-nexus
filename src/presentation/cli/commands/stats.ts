/**
 * Stats Command Handler
 *
 * CLI command for database statistics overview.
 */

import { Command, Option } from "commander";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
  SqliteStatsService,
} from "../../../infrastructure/database/index.js";
import {
  createStatsFormatter,
  type StatsOutputMode,
} from "../formatters/stats-formatter.js";
import { shouldUseColor } from "../formatters/color.js";

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
    const stats = await statsService.getStats(projectLimit);

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
