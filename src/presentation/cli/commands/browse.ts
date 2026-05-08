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

/**
 * Test database path override.
 * When set, executeBrowseCommand uses this path instead of getDefaultDbPath().
 */
let testDbPath: string | null = null;

/**
 * Set test database path override.
 * Used by tests to point to an isolated test database.
 *
 * @param path Path to use, or null to reset to default behavior
 */
export function setTestDbPath(path: string | null): void {
  testDbPath = path;
}

/**
 * Options for the browse command.
 */
export interface BrowseCommandOptions {
  /** Maximum sessions to show in the picker (as string, parsed to integer) */
  limit?: string;
}

/**
 * Dispatch targets for the browse command.
 *
 * Injected so tests can substitute mocks without `mock.module()`,
 * which leaks across test files in Bun (see no-hidden-debt rule:
 * any deviation from real implementations must come through this seam).
 */
export interface BrowseDispatchers {
  show: typeof executeShowCommand;
  search: typeof executeSearchCommand;
  context: typeof executeContextCommand;
  related: typeof executeRelatedCommand;
}

/**
 * Default dispatchers wrap the real command implementations.
 */
const defaultDispatchers: BrowseDispatchers = {
  show: executeShowCommand,
  search: executeSearchCommand,
  context: executeContextCommand,
  related: executeRelatedCommand,
};

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
  dispatchers: BrowseDispatchers = defaultDispatchers
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

  const limit = parseInt(options.limit ?? "100", 10);
  const dbPath = testDbPath ?? getDefaultDbPath();
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
        await dispatchers.show(result.sessionId, {});
        break;

      case "search":
        // Search within session - launch search with session filter
        await dispatchers.search("*", { session: result.sessionId });
        break;

      case "context": {
        // Extract project name from session
        const { db: db2 } = initializeDatabase({ path: dbPath });
        const repo = new SqliteSessionRepository(db2);
        const session = await repo.findById(result.sessionId);
        closeDatabase(db2);
        if (session) {
          await dispatchers.context(session.projectPath.projectName, {});
        }
        break;
      }

      case "related":
        await dispatchers.related(result.sessionId, {});
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
            error instanceof Error ? error.message : String(error)
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
