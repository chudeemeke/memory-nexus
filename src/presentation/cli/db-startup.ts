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
import { ErrorCode, MemoryError } from "../../domain/index.js";
import { formatError, formatErrorJson } from "./formatters/index.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

interface TtyLikeStream {
  isTTY?: boolean | undefined;
}

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
  | { success: false; error: MemoryError };

export interface DbStartupDeps {
  existsSync?: (path: string) => boolean;
  getDefaultDbPath?: () => string;
  initializeDatabaseSafe?: (config: DatabaseConfig) => DatabaseInitResult;
  isTTY?: () => boolean;
  confirm?: (message: string) => Promise<boolean>;
  backupCorruptedDatabase?: (dbPath: string) => string;
}

interface ResolvedDbStartupDeps {
  existsSync: (path: string) => boolean;
  getDefaultDbPath: () => string;
  initializeDatabaseSafe: (config: DatabaseConfig) => DatabaseInitResult;
  isTTY: () => boolean;
  confirm: (message: string) => Promise<boolean>;
  backupCorruptedDatabase: (dbPath: string) => string;
}

function resolveDbStartupDeps(deps?: DbStartupDeps): ResolvedDbStartupDeps {
  return {
    existsSync,
    getDefaultDbPath,
    initializeDatabaseSafe,
    isTTY,
    confirm: promptConfirmation,
    backupCorruptedDatabase,
    ...deps,
  };
}

/**
 * Check if running in an interactive TTY environment.
 *
 * @returns true if stdin and stdout are TTYs
 */
export function isTTY(
  input: TtyLikeStream = process.stdin,
  output: TtyLikeStream = process.stdout,
): boolean {
  return Boolean(input.isTTY && output.isTTY);
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
  error: MemoryError,
  dbPath: string,
  options: DbStartupOptions,
  deps: ResolvedDbStartupDeps,
): Promise<DbStartupResult> {
  // Show error
  if (options.json) {
    console.error(formatErrorJson(error));
  } else {
    console.error(formatError(error, { verbose: options.verbose } as any));
  }

  // Non-TTY: can't prompt, just fail
  const interactive = deps.isTTY();
  if (!interactive) {
    if (!options.json) {
      console.error("\nDatabase is corrupted. Run interactively to recreate.");
    }
    return { success: false, error };
  }

  // TTY: prompt for recreation
  console.log("");
  const confirmed = await deps.confirm(
    "Database corrupted. Recreate and re-sync?"
  );

  if (!confirmed) {
    if (!options.json) {
      console.log("Aborted. Database not modified.");
    }
    return { success: false, error };
  }

  // Backup old database
  const backupPath = deps.backupCorruptedDatabase(dbPath);
  if (!options.json) {
    console.log(`Backed up corrupted database to: ${backupPath}`);
  }

  // Try to create fresh database
  try {
    const result = deps.initializeDatabaseSafe({
      path: dbPath,
      quickCheck: false, // Skip check for new database
    });
    if (!options.json) {
      console.log("Fresh database created. Run 'memory sync' to repopulate.");
    }
    return { success: true, db: result.db };
  } catch (recreateError) {
    const newError =
      recreateError instanceof MemoryError
        ? recreateError
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            `Failed to create new database: ${unknownErrorMessage(recreateError)}`
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
  options?: DbStartupOptions,
  deps?: DbStartupDeps,
): Promise<DbStartupResult> {
  const startupOptions = { ...options };
  const resolved = resolveDbStartupDeps(deps);
  const dbPath = startupOptions.dbPath ?? resolved.getDefaultDbPath();
  const fileExists = resolved.existsSync(dbPath);

  const config: DatabaseConfig = {
    path: dbPath,
    quickCheck: !startupOptions.skipCheck && fileExists,
  };

  try {
    const result = resolved.initializeDatabaseSafe(config);
    return { success: true, db: result.db };
  } catch (error) {
    const nexusError =
      error instanceof MemoryError
        ? error
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            unknownErrorMessage(error)
          );

    // Handle corrupted database specially
    if (nexusError.code === ErrorCode.DB_CORRUPTED) {
      return handleCorruptedDatabase(nexusError, dbPath, startupOptions, resolved);
    }

    // Other errors: just format and fail
    if (startupOptions.json) {
      console.error(formatErrorJson(nexusError));
    } else {
      console.error(formatError(nexusError, { verbose: startupOptions.verbose } as any));
    }
    return { success: false, error: nexusError };
  }
}
