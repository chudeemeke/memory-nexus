/**
 * Show Command Handler
 *
 * CLI command for displaying session details with conversation thread format.
 * Supports partial session ID matching and multiple output modes.
 */

import { Command, Option } from "commander";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../infrastructure/database/repositories/message-repository.js";
import { SqliteToolUseRepository } from "../../../infrastructure/database/repositories/tool-use-repository.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  createShowFormatter,
  type ShowOutputMode,
  type SessionDetail,
} from "../formatters/show-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import type { Session } from "../../../domain/entities/session.js";
import type { ToolUse } from "../../../domain/entities/tool-use.js";
import type { Database } from "bun:sqlite";

/**
 * Test database path override.
 * When set, executeShowCommand uses this path instead of getDefaultDbPath().
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
 * Options parsed from CLI arguments.
 */
interface ShowCommandOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  tools?: boolean;
}

/**
 * Create the show command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createShowCommand(): Command {
  return new Command("show")
    .description("Show session details")
    .argument("<session-id>", "Session ID to display")
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-v, --verbose", "Show detailed output").conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output (message content only)").conflicts("verbose")
    )
    .option("--tools", "Show detailed tool inputs and outputs")
    .action(async (sessionId: string, options: ShowCommandOptions) => {
      await executeShowCommand(sessionId, options);
    });
}

/**
 * Determine output mode from command options.
 */
function determineOutputMode(options: ShowCommandOptions): ShowOutputMode {
  if (options.json) return "json";
  if (options.tools) return "tools";
  if (options.verbose) return "verbose";
  if (options.quiet) return "quiet";
  return "default";
}

/**
 * Find session by ID with partial matching support.
 *
 * @param sessionRepo Session repository
 * @param sessionId Full or partial session ID
 * @param db Database for partial match query
 * @returns Session if found, null otherwise
 */
async function findSession(
  sessionRepo: SqliteSessionRepository,
  sessionId: string,
  db: Database
): Promise<Session | null> {
  // Try exact match first
  const session = await sessionRepo.findById(sessionId);
  if (session) {
    return session;
  }

  // Try partial match (by prefix)
  const stmt = db.prepare<{ id: string }, [string]>(
    `SELECT id FROM sessions WHERE id LIKE ? ORDER BY start_time DESC LIMIT 1`
  );
  const match = stmt.get(`${sessionId}%`);
  if (match) {
    return sessionRepo.findById(match.id);
  }

  return null;
}

/**
 * Execute the show command with given options.
 *
 * Loads session, messages, and tool uses, then formats for display.
 *
 * @param sessionId Full or partial session ID
 * @param options Command options from CLI
 */
export async function executeShowCommand(
  sessionId: string,
  options: ShowCommandOptions
): Promise<void> {
  const startTime = performance.now();
  const dbPath = testDbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);

    // Find session
    const session = await findSession(sessionRepo, sessionId, db);
    if (!session) {
      const mode = determineOutputMode(options);
      const formatter = createShowFormatter(mode, shouldUseColor());
      console.log(formatter.formatNotFound(sessionId));
      process.exitCode = 1;
      return;
    }

    // Load messages and tool uses
    const messages = await messageRepo.findBySession(session.id);
    const toolUsesArray = await toolUseRepo.findBySession(session.id);

    // Build toolUses map for lookup
    const toolUses = new Map<string, ToolUse>();
    for (const tool of toolUsesArray) {
      toolUses.set(tool.id, tool);
    }

    // Create session detail
    const detail: SessionDetail = { session, messages, toolUses };

    // Format and output
    const mode = determineOutputMode(options);
    const formatter = createShowFormatter(mode, shouldUseColor());
    const endTime = performance.now();
    const output = formatter.formatSession(detail, {
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
