/**
 * Browse Command Handler
 *
 * CLI command for interactive session browsing.
 * Launches picker UI and dispatches to appropriate command based on action.
 */

import { Command } from "commander";
import {
  sessionPicker,
  canUseInteractivePicker,
} from "../pickers/session-picker.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { executeShowCommand, setTestDbPath as setShowTestDbPath } from "./show.js";
import { executeSearchCommand } from "./search.js";
import { executeContextCommand } from "./context.js";
import { executeRelatedCommand } from "./related.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";

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
  // Also propagate to show command for dispatch
  setShowTestDbPath(path);
}

/**
 * Options parsed from CLI arguments.
 */
interface BrowseCommandOptions {
  limit?: string;
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
      await executeBrowseCommand(options);
    });
}

/**
 * Execute the browse command with given options.
 *
 * Launches interactive picker if TTY available, otherwise shows error
 * with hints about alternative commands.
 *
 * @param options Command options from CLI
 */
export async function executeBrowseCommand(
  options: BrowseCommandOptions
): Promise<void> {
  // Check TTY availability
  if (!canUseInteractivePicker()) {
    console.error("Error: Interactive mode requires a terminal.");
    console.error("Use specific commands instead:");
    console.error("  memory list          - List sessions");
    console.error("  memory show <id>     - Show session details");
    console.error("  memory search <q>    - Search sessions");
    process.exitCode = 1;
    return;
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
      return;
    }

    // Close DB before dispatching (commands manage their own connections)
    closeDatabase(db);

    // Dispatch to appropriate command
    switch (result.action) {
      case "show":
        await executeShowCommand(result.sessionId, {});
        break;

      case "search":
        // Search within session - launch search with session filter
        await executeSearchCommand("*", { session: result.sessionId });
        break;

      case "context": {
        // Extract project name from session
        const { db: db2 } = initializeDatabase({ path: dbPath });
        const repo = new SqliteSessionRepository(db2);
        const session = await repo.findById(result.sessionId);
        closeDatabase(db2);
        if (session) {
          await executeContextCommand(session.projectPath.projectName, {});
        }
        break;
      }

      case "related":
        await executeRelatedCommand(result.sessionId, {});
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
    try {
      closeDatabase(db);
    } catch {
      // Ignore close errors
    }
  }
}
