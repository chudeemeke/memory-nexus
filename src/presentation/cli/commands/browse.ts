/**
 * Browse Command Handler
 *
 * CLI command for interactive session browsing.
 * Launches picker UI and dispatches to appropriate command based on action.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  sessionPicker,
  canUseInteractivePicker,
} from "../pickers/session-picker.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { executeShowCommand } from "./show.js";
import { executeSearchCommand } from "./search.js";
import { executeContextCommand } from "./context.js";
import { executeRelatedCommand } from "./related.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { formatError } from "../formatters/error-formatter.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

/**
 * Options for the browse command.
 */
export interface BrowseCommandOptions {
  /** Maximum sessions to show in the picker (as string, parsed to integer) */
  limit?: string;
}

/**
 * Runtime dependencies for executeBrowseCommand.
 *
 * Operational dependencies that tests substitute for isolation. Keeps
 * dispatch targets injectable without `mock.module()` (which is
 * process-wide in Bun and leaks across test files).
 */
export interface BrowseCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
  /** Show command dispatcher. Defaults to the real implementation. */
  show?: typeof executeShowCommand;
  /** Search command dispatcher. Defaults to the real implementation. */
  search?: typeof executeSearchCommand;
  /** Context command dispatcher. Defaults to the real implementation. */
  context?: typeof executeContextCommand;
  /** Related command dispatcher. Defaults to the real implementation. */
  related?: typeof executeRelatedCommand;
}

/**
 * Create the browse command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createBrowseCommand(): Command {
  return new Command("browse")
    .description("Interactive session browser")
    .option("-l, --limit <count>", "Maximum sessions to show", "100")
    .action(async (options: BrowseCommandOptions) => {
      const result = await executeBrowseCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the browse command programmatically.
 *
 * Interactively browse sessions using fuzzy search. Requires an
 * interactive TTY; will return exitCode 1 in non-interactive environments.
 * Handles its own database initialization and teardown.
 *
 * @param options - Browse command options
 * @returns CommandResult with exitCode 0 (success) or 1 (not available/error)
 */
export async function executeBrowseCommand(
  options: BrowseCommandOptions,
  deps: BrowseCommandDeps = {}
): Promise<CommandResult> {
  // Check TTY availability
  if (!canUseInteractivePicker()) {
    console.error("Error: Interactive mode requires a terminal.");
    console.error("Use specific commands instead:");
    console.error("  memory list          - List sessions");
    console.error("  memory show <id>     - Show session details");
    console.error("  memory search <q>    - Search sessions");
    return { exitCode: 1 };
  }

  const showFn = deps.show ?? executeShowCommand;
  const searchFn = deps.search ?? executeSearchCommand;
  const contextFn = deps.context ?? executeContextCommand;
  const relatedFn = deps.related ?? executeRelatedCommand;

  const limit = parseInt(options.limit ?? "100", 10);
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const sessionRepo = new SqliteSessionRepository(db);

    // Launch picker
    const result = await sessionPicker({ sessionRepo, limit });

    if (!result) {
      // User cancelled
      closeDatabase(db);
      return { exitCode: 0 };
    }

    // Close DB before dispatching (commands manage their own connections)
    closeDatabase(db);

    // Dispatch to appropriate command via injected dispatchers
    switch (result.action) {
      case "show":
        await showFn(result.sessionId, {});
        break;

      case "search":
        // Search within session - launch search with session filter
        await searchFn("*", { session: result.sessionId });
        break;

      case "context": {
        // Extract project name from session
        const { db: db2 } = initializeDatabase({ path: dbPath });
        const repo = new SqliteSessionRepository(db2);
        const session = await repo.findById(result.sessionId);
        closeDatabase(db2);
        if (session) {
          await contextFn(session.projectPath.projectName, {});
        }
        break;
      }

      case "related":
        await relatedFn(result.sessionId, {});
        break;
    }

    return { exitCode: 0 };
  } catch (error) {
    // Wrap in MemoryError for consistent formatting
    const nexusError =
      error instanceof MemoryError
        ? error
        : new MemoryError(
            ErrorCode.DB_CONNECTION_FAILED,
            unknownErrorMessage(error)
          );

    console.error(formatError(nexusError));
    try {
      closeDatabase(db);
    } catch {
      // Ignore close errors
    }
    return { exitCode: 1 };
  }
}
