/**
 * Show Command Handler
 *
 * CLI command for displaying session details with conversation thread format.
 * Supports partial session ID matching and multiple output modes.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
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
import { formatForAi } from "../formatters/ai-formatter.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toShowSessionDto } from "../formatters/dto-helpers.js";
import type { Session } from "../../../domain/entities/session.js";
import type { ToolUse } from "../../../domain/entities/tool-use.js";
import type { Database } from "bun:sqlite";

/**
 * Options for the show command.
 */
export interface ShowCommandOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Minimal output (message content only) */
  quiet?: boolean;
  /** Show detailed tool inputs and outputs */
  tools?: boolean;
  /** Output format: default or ai */
  format?: "default" | "ai";
}

/**
 * Runtime dependencies for executeShowCommand.
 *
 * Separated from ShowCommandOptions because these are not user-facing
 * CLI flags — they are operational dependencies that tests substitute
 * to achieve isolation. Defaults to production resolution
 * (getDefaultDbPath()) when omitted.
 */
export interface ShowCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
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
      new Option("--format <type>", "Output format")
        .choices(["default", "ai"])
        .default("default")
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed output").conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output (message content only)").conflicts("verbose")
    )
    .option("--tools", "Show detailed tool inputs and outputs")
    .action(async (sessionId: string, options: ShowCommandOptions) => {
      const result = await executeShowCommand(sessionId, options);
      process.exitCode = result.exitCode;
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
 * Execute the show command programmatically.
 *
 * Shows detailed information about a specific session including messages
 * and optionally tool uses. Supports partial session ID matching.
 * Handles its own database initialization and teardown.
 *
 * @param sessionId - Full or partial session ID to display
 * @param options - Show command options
 * @returns CommandResult with exitCode 0 (success) or 1 (not found/error)
 */
export async function executeShowCommand(
  sessionId: string,
  options: ShowCommandOptions,
  deps: ShowCommandDeps = {}
): Promise<CommandResult> {
  const startTime = performance.now();
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);

    // Find session
    const session = await findSession(sessionRepo, sessionId, db);
    if (!session) {
      if (options.json) {
        emitJsonErrorEnvelope({
          command: "show",
          code: "NOT_FOUND",
          message: `Session not found: ${sessionId}`,
          context: { session_id: sessionId },
        });
      } else {
        const mode = determineOutputMode(options);
        const formatter = createShowFormatter(mode, shouldUseColor());
        console.log(formatter.formatNotFound(sessionId));
      }
      return { exitCode: 1 };
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

    // Precedence rule (Codex HIGH-5): --json takes the deterministic
    // envelope path. --format ai is a text-only post-processor on the
    // formatter output below; it does NOT change routing for show.
    // When --json is set, --format ai is ignored (no formatForAi pass).
    if (options.json) {
      const endTime = performance.now();
      emitJsonEnvelope({
        command: "show",
        kind: "session",
        data: toShowSessionDto(detail),
        meta: {
          session_id: session.id,
          message_count: messages.length,
          timing_ms: Math.round(endTime - startTime),
        },
      });
      return { exitCode: 0 };
    }

    // Format and output (text mode)
    const mode = determineOutputMode(options);
    const formatter = createShowFormatter(mode, shouldUseColor());
    const endTime = performance.now();
    let output = formatter.formatSession(detail, {
      executionTimeMs: Math.round(endTime - startTime),
    });
    if (options.format === "ai") {
      output = formatForAi(output);
    }
    console.log(output);
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

    // Format error based on output mode
    if (options.json) {
      emitJsonErrorEnvelope({
        command: "show",
        code: nexusError.code,
        message: nexusError.message,
        ...(nexusError.context !== undefined
          ? { context: nexusError.context }
          : {}),
      });
    } else {
      console.error(formatError(nexusError));
    }
    return { exitCode: 1 };
  } finally {
    closeDatabase(db);
  }
}
