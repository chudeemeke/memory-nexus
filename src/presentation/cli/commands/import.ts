/**
 * Import Command Handler
 *
 * CLI command for importing database from a JSON backup file.
 * Supports clear option, quiet mode, and JSON output for scripting.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  validateExportFile,
  importFromJson,
  hasExistingData,
  type ImportStats,
} from "../../../application/services/index.js";
import { existsSync } from "node:fs";

/**
 * Options parsed from CLI arguments.
 */
interface ImportOptions {
  clear?: boolean;
  quiet?: boolean;
  json?: boolean;
  force?: boolean;
}

/**
 * Create the import command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createImportCommand(): Command {
  return new Command("import")
    .description("Import database from JSON backup file")
    .argument("<input-file>", "Path to the JSON backup file")
    .option("--clear", "Clear existing data before import")
    .option("--force", "Skip confirmation when merging with existing data")
    .addOption(
      new Option("-q, --quiet", "Suppress output except errors").conflicts(
        "json"
      )
    )
    .addOption(
      new Option("--json", "Output stats as JSON").conflicts("quiet")
    )
    .action(async (inputFile: string, options: ImportOptions) => {
      const result = await executeImportCommand(inputFile, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the import command with given options.
 *
 * @param inputFile Path to the backup file to import
 * @param options Command options from CLI
 */
export async function executeImportCommand(
  inputFile: string,
  options: ImportOptions = {}
): Promise<CommandResult> {
  // Check input file exists
  if (!existsSync(inputFile)) {
    outputError("File does not exist", inputFile, options);
    return { exitCode: 1 };
  }

  // Validate file before opening database
  const validation = await validateExportFile(inputFile);
  if (!validation.valid) {
    outputError(`Invalid backup file: ${validation.error}`, inputFile, options);
    return { exitCode: 1 };
  }

  // Initialize database (creates if needed)
  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Check for existing data
    const hasData = hasExistingData(db);

    // Warn if merging (not clearing) and has existing data
    if (hasData && !options.clear && !options.force) {
      if (!options.json && !options.quiet) {
        console.log("Warning: Database contains existing data.");
        console.log("Use --clear to replace all data, or --force to merge without prompt.");
      }

      // In non-TTY mode, refuse to merge without --force
      if (!process.stdout.isTTY) {
        outputError(
          "Cannot merge with existing data in non-interactive mode. Use --clear or --force.",
          inputFile,
          options
        );
        return { exitCode: 1 };
      }

      // Interactive confirmation would go here, but for safety we require flags
      outputError(
        "Use --clear to replace data or --force to merge",
        inputFile,
        options
      );
      return { exitCode: 1 };
    }

    // Perform import
    const stats = await importFromJson(db, inputFile, {
      clearExisting: options.clear,
    });

    // Format output
    if (options.json) {
      const jsonOutput = {
        success: true,
        path: inputFile,
        version: validation.version,
        stats,
        cleared: options.clear ?? false,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else if (options.quiet) {
      // Quiet mode - no output on success
    } else {
      console.log(formatImportResult(stats, inputFile, options.clear ?? false));
    }

    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputError(message, inputFile, options);
    return { exitCode: 1 };
  } finally {
    closeDatabase(db);
  }
}

/**
 * Output an error in the appropriate format.
 *
 * @param message Error message
 * @param inputFile Input file path
 * @param options Command options
 */
function outputError(
  message: string,
  inputFile: string,
  options: ImportOptions
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          success: false,
          path: inputFile,
          error: message,
        },
        null,
        2
      )
    );
  } else {
    console.error(`Error: ${message}`);
  }
}

/**
 * Format import result for default output.
 *
 * @param stats Import statistics
 * @param inputPath Path to the imported file
 * @param cleared Whether existing data was cleared
 * @returns Formatted output string
 */
function formatImportResult(
  stats: ImportStats,
  inputPath: string,
  cleared: boolean
): string {
  const lines: string[] = [];

  const mode = cleared ? "Replaced" : "Imported";
  lines.push(`${mode} ${stats.sessions} sessions, ${stats.messages} messages from ${inputPath}`);
  lines.push("");
  lines.push("Details:");
  lines.push(`  Sessions:   ${stats.sessions}`);
  lines.push(`  Messages:   ${stats.messages}`);
  lines.push(`  Tool uses:  ${stats.toolUses}`);
  lines.push(`  Entities:   ${stats.entities}`);
  lines.push(`  Links:      ${stats.links}`);

  return lines.join("\n");
}
