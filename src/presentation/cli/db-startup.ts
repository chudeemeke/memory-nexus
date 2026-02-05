/**
 * Database Startup Utilities
 *
 * Handles database initialization with integrity checks and recovery options.
 * Provides user-friendly prompts for corrupted database scenarios.
 */

import { existsSync, renameSync } from "node:fs";
import { createInterface } from "readline";
import {
  initializeDatabaseSafe,
  getDefaultDbPath,
  type DatabaseConfig,
  type DatabaseInitResult,
} from "../../infrastructure/database/index.js";
import { ErrorCode, MemoryNexusError } from "../../domain/index.js";
import { formatError, formatErrorJson } from "./formatters/index.js";

/**
 * Options for database startup.
 */
export interface DbStartupOptions {
  /** JSON output mode */
  json?: boolean;
  /** Verbose mode for error details */
  verbose?: boolean;
  /** Custom database path (defaults to getDefaultDbPath()) */
  dbPath?: string;
  /** Skip integrity check on startup */
  skipCheck?: boolean;
}

/**
 * Result of database startup.
 */
export type DbStartupResult =
  | { success: true; db: DatabaseInitResult["db"] }
  | { success: false; error: MemoryNexusError };

/**
 * Check if running in an interactive TTY environment.
 *
 * @returns true if stdin and stdout are TTYs
 */
export function isTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Prompt user for confirmation (Y/N).
 *
 * @param message Prompt message
 * @returns true if user confirmed, false otherwise
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Backup corrupted database file.
 *
 * @param dbPath Path to database file
 * @returns Path to backup file
 */
function backupCorruptedDatabase(dbPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dbPath}.corrupted.${timestamp}`;
  renameSync(dbPath, backupPath);
  return backupPath;
}

/**
 * Handle corrupted database scenario.
 *
 * Shows error message and optionally prompts for recreation:
 * - In TTY: prompts user for confirmation
 * - Non-TTY: shows message and returns failure
 *
 * @param error The DB_CORRUPTED error
 * @param dbPath Path to database file
 * @param options Startup options
 * @returns Startup result after handling (may succeed if recreated)
 */
async function handleCorruptedDatabase(
  error: MemoryNexusError,
  dbPath: string,
  options: DbStartupOptions
): Promise<DbStartupResult> {
  // Show error
  if (options.json) {
    console.error(formatErrorJson(error));
  } else {
    console.error(formatError(error, { verbose: options.verbose }));
  }

  // Non-TTY: can't prompt, just fail
  if (!isTTY()) {
    if (!options.json) {
      console.error("\nDatabase is corrupted. Run interactively to recreate.");
    }
    return { success: false, error };
  }

  // TTY: prompt for recreation
  console.log("");
  const confirmed = await promptConfirmation(
    "Database corrupted. Recreate and re-sync?"
  );

  if (!confirmed) {
    if (!options.json) {
      console.log("Aborted. Database not modified.");
    }
    return { success: false, error };
  }

  // Backup old database
  const backupPath = backupCorruptedDatabase(dbPath);
  if (!options.json) {
    console.log(`Backed up corrupted database to: ${backupPath}`);
  }

  // Try to create fresh database
  try {
    const result = initializeDatabaseSafe({
      path: dbPath,
      quickCheck: false, // Skip check for new database
    });
    if (!options.json) {
      console.log("Fresh database created. Run 'memory sync' to repopulate.");
    }
    return { success: true, db: result.db };
  } catch (recreateError) {
    const newError =
      recreateError instanceof MemoryNexusError
        ? recreateError
        : new MemoryNexusError(
            ErrorCode.DB_CONNECTION_FAILED,
            `Failed to create new database: ${recreateError instanceof Error ? recreateError.message : String(recreateError)}`
          );
    if (options.json) {
      console.error(formatErrorJson(newError));
    } else {
      console.error(formatError(newError));
    }
    return { success: false, error: newError };
  }
}

/**
 * Initialize database with startup checks and error handling.
 *
 * Performs:
 * 1. Quick integrity check (for existing databases)
 * 2. Error handling with user-friendly messages
 * 3. Recovery prompt for corrupted databases (in TTY)
 *
 * @param options Startup options
 * @returns Database startup result
 */
export async function initializeDatabaseForCli(
  options: DbStartupOptions = {}
): Promise<DbStartupResult> {
  const dbPath = options.dbPath ?? getDefaultDbPath();
  const fileExists = existsSync(dbPath);

  const config: DatabaseConfig = {
    path: dbPath,
    quickCheck: !options.skipCheck && fileExists,
  };

  try {
    const result = initializeDatabaseSafe(config);
    return { success: true, db: result.db };
  } catch (error) {
    const nexusError =
      error instanceof MemoryNexusError
        ? error
        : new MemoryNexusError(
            ErrorCode.DB_CONNECTION_FAILED,
            error instanceof Error ? error.message : String(error)
          );

    // Handle corrupted database specially
    if (nexusError.code === ErrorCode.DB_CORRUPTED) {
      return handleCorruptedDatabase(nexusError, dbPath, options);
    }

    // Other errors: just format and fail
    if (options.json) {
      console.error(formatErrorJson(nexusError));
    } else {
      console.error(formatError(nexusError, { verbose: options.verbose }));
    }
    return { success: false, error: nexusError };
  }
}
