/**
 * Export Command Handler
 *
 * CLI command for exporting the database to a JSON backup file.
 * Supports quiet mode and JSON output for scripting.
 */

import { Command, Option } from "commander";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  exportToJson,
  type ExportStats,
} from "../../../application/services/index.js";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Options parsed from CLI arguments.
 */
interface ExportOptions {
  quiet?: boolean;
  json?: boolean;
}

/**
 * Create the export command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createExportCommand(): Command {
  return new Command("export")
    .description("Export database to JSON file for backup")
    .argument("<output-file>", "Path to write the JSON backup file")
    .addOption(
      new Option("-q, --quiet", "Suppress output except the file path").conflicts(
        "json"
      )
    )
    .addOption(
      new Option("--json", "Output stats as JSON").conflicts("quiet")
    )
    .action(async (outputFile: string, options: ExportOptions) => {
      await executeExportCommand(outputFile, options);
    });
}

/**
 * Execute the export command with given options.
 *
 * @param outputFile Path to write the backup file
 * @param options Command options from CLI
 */
export async function executeExportCommand(
  outputFile: string,
  options: ExportOptions = {}
): Promise<void> {
  // Validate output path parent directory exists
  const parentDir = dirname(outputFile);
  if (parentDir !== "." && !existsSync(parentDir)) {
    console.error(`Error: Directory does not exist: ${parentDir}`);
    process.exitCode = 1;
    return;
  }

  // Check if database exists
  const dbPath = getDefaultDbPath();
  if (!existsSync(dbPath)) {
    console.error("Error: Database does not exist. Run 'memory sync' first.");
    process.exitCode = 1;
    return;
  }

  // Initialize database
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Perform export
    const stats = await exportToJson(db, outputFile);

    // Format output
    if (options.json) {
      const jsonOutput = {
        success: true,
        path: outputFile,
        stats,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else if (options.quiet) {
      console.log(outputFile);
    } else {
      console.log(formatExportResult(stats, outputFile));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
  } finally {
    closeDatabase(db);
  }
}

/**
 * Format export result for default output.
 *
 * @param stats Export statistics
 * @param outputPath Path to the exported file
 * @returns Formatted output string
 */
function formatExportResult(stats: ExportStats, outputPath: string): string {
  const lines: string[] = [];

  lines.push(`Exported ${stats.sessions} sessions, ${stats.messages} messages to ${outputPath}`);
  lines.push("");
  lines.push("Details:");
  lines.push(`  Sessions:   ${stats.sessions}`);
  lines.push(`  Messages:   ${stats.messages}`);
  lines.push(`  Tool uses:  ${stats.toolUses}`);
  lines.push(`  Entities:   ${stats.entities}`);
  lines.push(`  Links:      ${stats.links}`);
  lines.push(`  File size:  ${formatBytes(stats.bytes)}`);

  return lines.join("\n");
}

/**
 * Format bytes as human-readable size.
 *
 * @param bytes Number of bytes
 * @returns Formatted size string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
