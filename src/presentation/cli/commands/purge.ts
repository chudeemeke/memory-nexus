/**
 * Purge Command Handler
 *
 * CLI command for removing old sessions from the database.
 * Supports age filtering, dry-run mode, and force (skip confirmation).
 */

import { Command, Option } from "commander";
import * as readline from "readline";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { shouldUseColor } from "../formatters/color.js";

/**
 * Test database path override.
 * When set, all database operations use this path instead of the default.
 */
let testDbPath: string | null = null;

/**
 * Set test database path override.
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestDbPath(path: string | null): void {
  testDbPath = path;
}

/**
 * Options parsed from CLI arguments.
 */
export interface PurgeCommandOptions {
  olderThan: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
}

/**
 * Result of purge operation.
 */
export interface PurgeResult {
  sessionsDeleted: number;
  cutoffDate: string;
  dryRun: boolean;
}

/**
 * Parse duration string into a cutoff Date.
 *
 * Supported formats:
 * - "30d" - 30 days
 * - "6m" - 6 months
 * - "1y" - 1 year
 *
 * @param duration - Duration string (e.g., "90d", "6m", "1y")
 * @returns Date representing the cutoff time
 * @throws Error if duration format is invalid
 */
export function parseDuration(duration: string): Date {
  const match = duration.match(/^(\d+)([dmy])$/i);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Use format like "30d" (days), "6m" (months), or "1y" (years).`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0) {
    throw new Error("Duration value must be a positive number.");
  }

  const now = new Date();
  let cutoffDate: Date;

  switch (unit) {
    case "d":
      cutoffDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      break;
    case "m":
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - value, now.getDate());
      break;
    case "y":
      cutoffDate = new Date(now.getFullYear() - value, now.getMonth(), now.getDate());
      break;
    default:
      throw new Error(`Unknown duration unit: "${unit}"`);
  }

  return cutoffDate;
}

/**
 * Format cutoff date for display.
 *
 * @param date - Cutoff date
 * @returns Formatted date string
 */
function formatCutoffDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Ask for user confirmation via readline.
 *
 * @param message - Confirmation message to display
 * @returns Promise resolving to true if confirmed, false otherwise
 */
async function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Allow mocking for tests
let askConfirmationFn = askConfirmation;

/**
 * Set mock confirmation function for testing.
 *
 * @param fn - Mock function to use for confirmation
 */
export function setConfirmationMock(fn: (message: string) => Promise<boolean>): void {
  askConfirmationFn = fn;
}

/**
 * Reset confirmation function to default.
 */
export function resetConfirmationMock(): void {
  askConfirmationFn = askConfirmation;
}

/**
 * Create the purge command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createPurgeCommand(): Command {
  return new Command("purge")
    .description("Remove old sessions from database")
    .requiredOption(
      "--older-than <duration>",
      'Delete sessions older than duration (e.g., "90d", "6m", "1y")'
    )
    .option("-f, --force", "Skip confirmation prompt")
    .option("--dry-run", "Show what would be deleted without deleting")
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-q, --quiet", "Minimal output").conflicts("json")
    )
    .action(async (options: PurgeCommandOptions) => {
      await executePurgeCommand(options);
    });
}

/**
 * Execute the purge command with given options.
 *
 * @param options Command options from CLI
 */
export async function executePurgeCommand(options: PurgeCommandOptions): Promise<void> {
  // Parse duration
  let cutoffDate: Date;
  try {
    cutoffDate = parseDuration(options.olderThan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  const dbPath = testDbPath ?? getDefaultDbPath();
  let db;

  try {
    const result = initializeDatabase({ path: dbPath });
    db = result.db;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(JSON.stringify({ error: `Database error: ${message}` }, null, 2));
    } else {
      console.error(`Error: Database not found or could not be opened.`);
    }
    process.exitCode = 1;
    return;
  }

  try {
    const sessionRepo = new SqliteSessionRepository(db);

    // Count sessions to be deleted
    const count = await sessionRepo.countOlderThan(cutoffDate);

    // Handle zero found case
    if (count === 0) {
      const formattedDate = formatCutoffDate(cutoffDate);
      if (options.json) {
        console.log(
          JSON.stringify({
            sessionsDeleted: 0,
            cutoffDate: cutoffDate.toISOString(),
            dryRun: options.dryRun ?? false,
            message: `No sessions older than ${formattedDate}`,
          }, null, 2)
        );
      } else if (!options.quiet) {
        console.log(`No sessions older than ${formattedDate}.`);
      }
      return;
    }

    // Dry-run mode: show what would be deleted
    if (options.dryRun) {
      const sessions = await sessionRepo.findOlderThan(cutoffDate);
      const formattedDate = formatCutoffDate(cutoffDate);

      if (options.json) {
        console.log(
          JSON.stringify({
            sessionsToDelete: count,
            cutoffDate: cutoffDate.toISOString(),
            dryRun: true,
            sessions: sessions.map((s) => ({
              id: s.id,
              project: s.projectPath.projectName,
              startTime: s.startTime.toISOString(),
              messageCount: s.messageCount,
            })),
          }, null, 2)
        );
      } else if (options.quiet) {
        console.log(count.toString());
      } else {
        console.log(`Would delete ${count} session(s) older than ${formattedDate}:\n`);
        const useColor = shouldUseColor();
        for (const session of sessions) {
          const id = session.id.substring(0, 16);
          const project = session.projectPath.projectName;
          const date = session.startTime.toISOString().split("T")[0];
          const msgs = session.messageCount;
          if (useColor) {
            console.log(`  \x1b[33m${id}\x1b[0m  ${project}  ${date}  (${msgs} messages)`);
          } else {
            console.log(`  ${id}  ${project}  ${date}  (${msgs} messages)`);
          }
        }
      }
      return;
    }

    // If not force, prompt for confirmation
    if (!options.force) {
      const formattedDate = formatCutoffDate(cutoffDate);
      const confirmed = await askConfirmationFn(
        `Delete ${count} session(s) older than ${formattedDate}? This cannot be undone. (y/n) `
      );

      if (!confirmed) {
        if (options.json) {
          console.log(JSON.stringify({ cancelled: true }, null, 2));
        } else if (!options.quiet) {
          console.log("Purge cancelled.");
        }
        return;
      }
    }

    // Perform the delete
    const deletedCount = await sessionRepo.deleteOlderThan(cutoffDate);

    // Output result
    if (options.json) {
      console.log(
        JSON.stringify({
          sessionsDeleted: deletedCount,
          cutoffDate: cutoffDate.toISOString(),
          dryRun: false,
        }, null, 2)
      );
    } else if (options.quiet) {
      console.log(deletedCount.toString());
    } else {
      const formattedDate = formatCutoffDate(cutoffDate);
      console.log(`Deleted ${deletedCount} session(s) older than ${formattedDate}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exitCode = 2;
  } finally {
    closeDatabase(db);
  }
}
