/**
 * Stats Command Handler (Wrapper)
 *
 * Thin view that delegates database stats overview to executeStatusCommand.
 * Maintained for backwards compatibility.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { executeStatusCommand } from "./status.js";

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
  /** Number of projects to show in breakdown */
  projects?: string;
  /** Output format */
  format?: "brief" | "ai" | "default";
}

/**
 * Runtime dependencies for executeStatsCommand.
 */
export interface StatsCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
}

/**
 * Create the stats command for Commander.js.
 */
export function createStatsCommand(): Command {
  return new Command("stats")
    .description("Show database statistics")
    .option("--json", "Output as JSON")
    .addOption(
      new Option(
        "--format <type>",
        "Output format: brief (top-line counters) or ai (AI-optimized text). 'default' accepted as deprecated alias.",
      ).choices(["brief", "ai", "default"])
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
 * Execute the stats command programmatically by wrapping executeStatusCommand.
 */
export async function executeStatsCommand(
  options: StatsCommandOptions,
  deps: StatsCommandDeps = {}
): Promise<CommandResult> {
  return executeStatusCommand(
    {
      stats: true,
      projects: options.projects,
      format: options.format,
      verbose: options.verbose,
      quiet: options.quiet,
      json: options.json,
    },
    {
      dbPath: deps.dbPath,
    }
  );
}
