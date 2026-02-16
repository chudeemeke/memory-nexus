/**
 * Related Command Handler
 *
 * CLI command for finding sessions related through shared topics/entities.
 * Uses SqliteLinkRepository's findRelatedWithHops() for graph traversal.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import { ErrorCode, MemoryNexusError } from "../../../domain/errors/index.js";
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
import { formatError, formatErrorJson } from "../formatters/error-formatter.js";

/**
 * Options parsed from CLI arguments.
 */
interface RelatedCommandOptions {
  limit?: number;
  hops?: number;
  type?: "session" | "message" | "topic";
  format?: "brief" | "detailed";
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
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
      new Option("--format <type>", "Output format")
        .choices(["brief", "detailed"])
        .default("brief")
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
 * Execute the related command with given options.
 *
 * @param id The source ID to find related sessions for
 * @param options Command options from CLI
 */
export async function executeRelatedCommand(
  id: string,
  options: RelatedCommandOptions
): Promise<CommandResult> {
  const startTime = performance.now();

  const dbPath = getDefaultDbPath();
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
        // Could be empty table or just no links for this entity
        const message = formatter.formatEmpty(id);
        if (outputMode === "json") {
          console.log(message);
        } else if (outputMode !== "quiet" || message) {
          console.error(message);
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
      const message = formatter.formatEmpty(id);
      if (outputMode === "json") {
        console.log(message);
      } else if (outputMode !== "quiet" || message) {
        console.error(message);
      }
      return { exitCode: 1 };
    }

    // Format and output
    const endTime = performance.now();
    const formatOptions: RelatedFormatOptions = {
      sourceId: id,
      executionTimeMs: Math.round(endTime - startTime),
    };
    const output = formatter.formatRelated(relatedSessions, formatOptions);
    console.log(output);
    return { exitCode: 0 };
  } catch (error) {
    // Wrap in MemoryNexusError for consistent formatting
    const nexusError =
      error instanceof MemoryNexusError
        ? error
        : new MemoryNexusError(
            ErrorCode.DB_CONNECTION_FAILED,
            error instanceof Error ? error.message : String(error)
          );

    // Format error based on output mode
    if (options.json) {
      console.log(formatErrorJson(nexusError));
    } else {
      console.error(formatError(nexusError));
    }
    return { exitCode: 1 };
  } finally {
    closeDatabase(db);
  }
}
