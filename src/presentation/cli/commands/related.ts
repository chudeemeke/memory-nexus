/**
 * Related Command Handler
 *
 * CLI command for finding sessions related through shared topics/entities.
 * Uses SqliteLinkRepository's findRelatedWithHops() for graph traversal.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryError } from "../../../domain/errors/index.js";
import {
  SqliteLinkRepository,
  SqliteSessionRepository,
} from "../../../infrastructure/database/repositories/index.js";
import type { RelatedLink } from "../../../infrastructure/database/repositories/link-repository.js";
import type { EntityType } from "../../../domain/entities/link.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import {
  createRelatedFormatter,
  type RelatedOutputMode,
  type RelatedFormatOptions,
  type RelatedSession,
} from "../formatters/related-formatter.js";
import { shouldUseColor } from "../formatters/color.js";
import { formatForAi } from "../formatters/ai-formatter.js";
import { formatError } from "../formatters/error-formatter.js";
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
} from "../formatters/envelope.js";
import { toRelatedDto } from "../formatters/dto-helpers.js";
import { emitFormatDeprecationWarning } from "./_helpers/deprecation-warning.js";

/**
 * Options for the related command.
 */
export interface RelatedCommandOptions {
  /** Maximum results to return */
  limit?: number;
  /** Traversal depth (1-3) */
  hops?: number;
  /** Entity type of the ID: session, message, or topic */
  type?: "session" | "message" | "topic";
  /**
   * Output format. Phase 32 (CLI-03) normalized choices: `brief`,
   * `ai`. `detailed` retained as deprecated alias (one-minor cadence;
   * CHANGELOG documents removal). Undefined = no-flag default
   * (existing brief behavior preserved for backward compatibility).
   */
  format?: "brief" | "ai" | "detailed";
  /** Output as JSON */
  json?: boolean;
  /** Show detailed output with timing */
  verbose?: boolean;
  /** Minimal output (session IDs only) */
  quiet?: boolean;
  /** Override database path (for testing) */
  dbPath?: string;
}

/**
 * Create the related command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createRelatedCommand(): Command {
  return new Command("related")
    .description("Find sessions related through shared topics/entities")
    .argument("<id>", "Session ID, message ID, or topic name")
    .addOption(
      new Option("--limit <n>", "Maximum results")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1) throw new Error("Limit must be a positive number");
          return n;
        })
        .default(10)
    )
    .addOption(
      new Option("--hops <n>", "Traversal depth (1-3)")
        .argParser((val) => {
          const n = parseInt(val, 10);
          if (isNaN(n) || n < 1 || n > 3) throw new Error("Hops must be 1, 2, or 3");
          return n;
        })
        .default(2)
    )
    .addOption(
      new Option("--type <type>", "Entity type of the ID")
        .choices(["session", "message", "topic"])
        .default("session")
    )
    .addOption(
      new Option(
        "--format <type>",
        "Output format: brief, ai. 'detailed' accepted as deprecated alias.",
      ).choices(["brief", "ai", "detailed"]),
      // No .default() — undefined preserves existing implicit brief behavior
      // via the action handler; explicit brief routes to BriefRelatedFormatter.
    )
    .option("--json", "Output as JSON")
    .addOption(
      new Option("-v, --verbose", "Show detailed output with timing")
        .conflicts("quiet")
    )
    .addOption(
      new Option("-q, --quiet", "Minimal output (session IDs only)")
        .conflicts("verbose")
    )
    .action(async (id: string, options: RelatedCommandOptions) => {
      const result = await executeRelatedCommand(id, options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the related command programmatically.
 *
 * Finds sessions related to a given session by shared topics and entities.
 * Handles its own database initialization and teardown.
 *
 * @param id - Session ID, message ID, or topic name to find related sessions for
 * @param options - Related command options
 * @returns CommandResult with exitCode 0 (success) or 1 (not found/error)
 */
export async function executeRelatedCommand(
  id: string,
  options: RelatedCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  // Phase 32 (CLI-03): deprecation warning for --format detailed
  // (alias retained for one-minor cadence; behavior preserved).
  if (options.format === "detailed") {
    emitFormatDeprecationWarning({
      command: "related",
      alias: "detailed",
      replacement: "Use --format brief or --format ai.",
      json: options.json,
    });
  }

  const dbPath = options.dbPath ?? getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    const linkRepo = new SqliteLinkRepository(db);
    const sessionRepo = new SqliteSessionRepository(db);

    // Determine entity type from options
    const entityType: EntityType = options.type ?? "session";

    // Get related links through graph traversal
    const relatedLinks = await linkRepo.findRelatedWithHops(
      entityType,
      id,
      options.hops ?? 2
    );

    // Determine output mode
    let outputMode: RelatedOutputMode = "brief";
    if (options.json) outputMode = "json";
    else if (options.verbose) outputMode = "verbose";
    else if (options.quiet) outputMode = "quiet";
    else if (options.format === "detailed") outputMode = "detailed";

    const useColor = shouldUseColor();
    const formatter = createRelatedFormatter(outputMode, useColor);

    // Check if no links found at all (links table might be empty)
    if (relatedLinks.length === 0) {
      // Check if this is because the links table is empty vs. no matches for this ID
      const anyLinks = await linkRepo.findBySource(entityType, id);
      const anyTargetLinks = await linkRepo.findByTarget(entityType, id);

      if (anyLinks.length === 0 && anyTargetLinks.length === 0) {
        // Per Plan 32-02 Task 5: "no links" path emits error envelope
        // with code NOT_FOUND for clearer semantics (vs data: [] + exit 1).
        if (options.json) {
          emitJsonErrorEnvelope({
            command: "related",
            code: "NOT_FOUND",
            message: `No related items found for ${id}`,
            context: { source_id: id, source_type: entityType },
          });
        } else {
          const message = formatter.formatEmpty(id);
          if (outputMode !== "quiet" || message) {
            console.error(message);
          }
        }
        return { exitCode: 1 };
      }
    }

    // Group by target session and take max weight per session
    const sessionWeights = new Map<string, { weight: number; hops: number }>();
    for (const { link, hop } of relatedLinks) {
      if (link.targetType === "session") {
        const existing = sessionWeights.get(link.targetId);
        if (!existing || link.weight > existing.weight) {
          sessionWeights.set(link.targetId, {
            weight: link.weight,
            hops: hop,
          });
        }
      }
    }

    // Filter out the source session itself if present
    sessionWeights.delete(id);

    // Sort by weight descending, then by hops ascending
    const sorted = Array.from(sessionWeights.entries())
      .sort((a, b) => b[1].weight - a[1].weight || a[1].hops - b[1].hops)
      .slice(0, options.limit ?? 10);

    // Fetch full session details for each related session ID
    const relatedSessions: RelatedSession[] = [];
    for (const [sessionId, { weight, hops }] of sorted) {
      const session = await sessionRepo.findById(sessionId);
      if (session) {
        relatedSessions.push({ session, weight, hops });
      }
    }

    // Handle empty result after filtering
    if (relatedSessions.length === 0) {
      if (options.json) {
        emitJsonErrorEnvelope({
          command: "related",
          code: "NOT_FOUND",
          message: `No related items found for ${id}`,
          context: { source_id: id, source_type: entityType },
        });
      } else {
        const message = formatter.formatEmpty(id);
        if (outputMode !== "quiet" || message) {
          console.error(message);
        }
      }
      return { exitCode: 1 };
    }

    // --json: envelope path (Codex HIGH-2). Precedence: --json wins
    // over --format ai.
    if (options.json) {
      const endTime = performance.now();
      emitJsonEnvelope({
        command: "related",
        kind: "related",
        data: relatedSessions.map(toRelatedDto),
        meta: {
          source_id: id,
          source_type: entityType,
          count: relatedSessions.length,
          timing_ms: Math.round(endTime - startTime),
        },
      });
      return { exitCode: 0 };
    }

    // Format and output (text mode)
    const endTime = performance.now();
    const formatOptions: RelatedFormatOptions = {
      sourceId: id,
      executionTimeMs: Math.round(endTime - startTime),
    };
    let output = formatter.formatRelated(relatedSessions, formatOptions);
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
        command: "related",
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
