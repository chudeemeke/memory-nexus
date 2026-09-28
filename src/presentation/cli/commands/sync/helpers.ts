/**
 * Sync Command Helpers
 *
 * Shared utility functions for dry-run, error handling, result reporting,
 * and lazy-loading infrastructure dependencies.
 */

import type { SyncCommandOptions, SyncCompletionMetadata } from "./types.js";
import type { CommandResult } from "../../command-result.js";
import type { SyncResult } from "../../../../application/services/index.js";
import { initializeDatabase } from "../../../../infrastructure/database/index.js";
import { FileSystemSessionSource, ProjectNameResolver } from "../../../../infrastructure/sources/index.js";
import { loadCheckpoint } from "../../../../infrastructure/signals/index.js";
import { formatError, formatErrorJson } from "../../formatters/index.js";
import { unknownToError } from "../../../../domain/errors/unknown-error.js";

/** Load embedding provider factory via dynamic import. */
export async function loadFactory() {
  const { EmbeddingProviderFactory } = await import(
    "../../../../infrastructure/embedding/embedding-provider-factory.js"
  );
  return new EmbeddingProviderFactory();
}

/** Load memory config via dynamic import. */
export async function loadConfig() {
  const { loadConfig } = await import(
    "../../../../infrastructure/hooks/config-manager.js"
  );
  return loadConfig();
}

/** Load embedding repository via dynamic import. */
export async function loadRepository(db: ReturnType<typeof initializeDatabase>["db"]) {
  const { EmbeddingRepository } = await import(
    "../../../../infrastructure/database/repositories/embedding-repository.js"
  );
  return new EmbeddingRepository(db);
}

/** Execute dry-run mode: show what would be synced without syncing. */
export async function executeDryRun(options: SyncCommandOptions): Promise<CommandResult> {
  const sessionSource = new FileSystemSessionSource();

  try {
    const sessions = await sessionSource.discoverSessions();

    // Apply filters
    let filtered = sessions;
    if (options.project) {
      filtered = filtered.filter((s) =>
        s.projectPath.decoded.includes(options.project!)
      );
    }
    if (options.session) {
      filtered = filtered.filter((s) => s.id === options.session);
    }

    // Check for checkpoint
    const checkpoint = loadCheckpoint();
    const completedIds = new Set(checkpoint?.completedSessionIds ?? []);
    const remaining = filtered.filter((s) => !completedIds.has(s.id));

    if (options.json) {
      const output = {
        dryRun: true,
        discovered: sessions.length,
        filtered: filtered.length,
        toProcess: remaining.length,
        recoveredFromCheckpoint: checkpoint?.completedSessions ?? 0,
        sessions: remaining.map((s) => ({
          id: s.id,
          project: s.projectPath.decoded,
          size: s.size,
          modified: s.modifiedTime.toISOString(),
        })),
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log("Dry run - no changes will be made\n");
      console.log(`Discovered:  ${sessions.length} sessions`);
      console.log(`After filter: ${filtered.length} sessions`);

      if (checkpoint) {
        console.log(
          `Checkpoint:  ${checkpoint.completedSessions} already done`
        );
      }

      console.log(`To process:  ${remaining.length} sessions\n`);

      if (remaining.length > 0) {
        console.log("Sessions to sync:");
        for (const session of remaining.slice(0, 20)) {
          const project = session.projectPath.decoded.split(/[/\\]/).pop() ?? "unknown";
          console.log(`  ${session.id.slice(0, 16)}... ${project}`);
        }
        if (remaining.length > 20) {
          console.log(`  ... and ${remaining.length - 20} more`);
        }
      }
    }

    return { exitCode: 0 };
  } catch (error) {
    handleError(error, options);
    return { exitCode: 1 };
  }
}

/** Handle error with appropriate formatting. */
export function handleError(error: unknown, options: SyncCommandOptions): void {
  const normalized = unknownToError(error);
  if (options.json) {
    console.error(formatErrorJson(normalized));
  } else {
    console.error(formatError(normalized, {
      verbose: !!options.verbose,
    }));
  }
}

/** Report sync results to console. */
export function reportResults(
  result: SyncResult,
  startTime: number,
  options: SyncCommandOptions,
  completion?: SyncCompletionMetadata,
): void {
  const duration = Date.now() - startTime;

  if (options.json) {
    const output = {
      success: completion?.success ?? result.success,
      aborted: result.aborted ?? false,
      duration: duration,
      discovered: result.sessionsDiscovered,
      processed: result.sessionsProcessed,
      skipped: result.sessionsSkipped,
      messages: result.messagesInserted,
      toolUses: result.toolUsesInserted,
      recoveredFromCheckpoint: result.recoveredFromCheckpoint,
      errors: result.errors,
      ...(completion ? {
        capture: { success: result.success && result.errors.length === 0 && !result.aborted },
        projections: completion.projections,
        remote: completion.remote,
        embedding: completion.embedding,
        ambient: completion.ambient,
        completionErrors: completion.errors,
        memoryFiles: { ...completion.memoryFileSync, ...(completion.memoryFiles ? {
          indexed: completion.memoryFiles.filesIndexed,
          skipped: completion.memoryFiles.filesSkipped,
          errors: completion.memoryFiles.errors,
        } : {}) },
      } : {}),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (options.quiet) {
    return;
  }

  if (result.aborted) {
    console.log("\nSync aborted (progress saved)");
  } else if (completion && !completion.success) {
    console.log(`\nSync incomplete after ${duration}ms (captured progress retained)`);
  } else {
    console.log(`\nSync complete in ${duration}ms`);
  }

  console.log(`  Discovered: ${result.sessionsDiscovered}`);
  console.log(`  Processed:  ${result.sessionsProcessed}`);
  console.log(`  Skipped:    ${result.sessionsSkipped}`);
  console.log(`  Messages:   ${result.messagesInserted}`);
  console.log(`  Tool uses:  ${result.toolUsesInserted}`);
  if (completion) {
    console.log(`  Projections: ${completion.projections.status}`);
    console.log(`  Remote: ${completion.remote.status}`);
    for (const [name, outcome] of [["Embedding", completion.embedding], ["Ambient", completion.ambient], ["Memory files", completion.memoryFileSync]] as const) {
      const detail = "error" in outcome ? outcome.error : "reason" in outcome ? outcome.reason : "";
      console.log(`  ${name}: ${outcome.status}${detail ? ` (${detail})` : ""}`);
    }
    for (const error of completion.errors) console.log(`  Error: ${error}`);
  }

  if (result.recoveredFromCheckpoint) {
    console.log(`  Recovered:  ${result.recoveredFromCheckpoint} from checkpoint`);
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`  ${err.sessionPath}: ${err.error}`);
    }
  }
}

/** Create a ProjectNameResolver rooted at the system drive. */
export function createDriveResolver(): ProjectNameResolver {
  // On Windows, use C:\ as root. On Unix, use /.
  const root = process.platform === "win32" ? "C:\\" : "/";
  return new ProjectNameResolver(root);
}
