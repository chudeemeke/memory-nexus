/**
 * Sync Command
 *
 * Orchestrates session extraction, memory file sync, ambient context,
 * and optional embedding generation.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../../command-result.js";
import type { SyncCommandOptions } from "./types.js";
import { SyncService, type SyncOptions } from "../../../../application/services/index.js";
import { createProgressReporter } from "../../progress-reporter.js";
import { initializeDatabase, closeDatabase, bulkOperationCheckpoint, getDefaultDbPath, SqliteSessionRepository, SqliteMessageRepository, SqliteToolUseRepository, SqliteExtractionStateRepository } from "../../../../infrastructure/database/index.js";
import { FileSystemSessionSource } from "../../../../infrastructure/sources/index.js";
import { JsonlEventParser } from "../../../../infrastructure/parsers/index.js";
import { setupSignalHandlers, registerCleanup, unregisterCleanup, hasCheckpoint, loadCheckpoint, ProcessAbortSignal, FileCheckpointManager } from "../../../../infrastructure/signals/index.js";
import { formatError, formatErrorJson } from "../../formatters/index.js";
import { handleBackgroundMode } from "./background.js";
import { runEmbeddingPass } from "./embedding-pass.js";
import { runMemoryFileSync, reportMemoryFileResults } from "./memory-files.js";
import { runAmbientContextGeneration } from "./ambient.js";
import { executeDryRun, handleError, reportResults, createDriveResolver } from "./helpers.js";

/** Create the sync command for Commander.js. */
export function createSyncCommand(): Command {
  return new Command("sync")
    .description("Sync sessions from ~/.claude/projects/ to database")
    .option("-f, --force", "Re-extract all sessions regardless of state")
    .option("-p, --project <path>", "Sync only sessions from specific project")
    .option("-s, --session <id>", "Sync a specific session only")
    .option("-n, --dry-run", "Show what would be synced without syncing")
    .option("--fix-names", "Fix truncated project names in existing sessions")
    .option("--embed", "Generate embeddings for messages after sync")
    .option("--background", "Run embedding in background (use with --embed)")
    .option("--json", "Output results as JSON")
    .addOption(new Option("-q, --quiet", "Suppress progress output").conflicts("verbose"))
    .addOption(new Option("-v, --verbose", "Show detailed progress").conflicts("quiet"))
    .action(async (options: SyncCommandOptions) => {
      const result = await executeSyncCommand(options);
      process.exitCode = result.exitCode;
    });
}

/** Execute the sync command programmatically. */
export async function executeSyncCommand(options: SyncCommandOptions): Promise<CommandResult> {
  if (options.background) {
    return await handleBackgroundMode(options);
  }

  setupSignalHandlers();
  const startTime = Date.now();
  const reporter = createProgressReporter(options);

  // Check for recovery from previous interrupted sync
  if (!options.quiet && hasCheckpoint()) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      console.log(
        `Resuming from previous interrupted sync (${checkpoint.completedSessions}/${checkpoint.totalSessions} sessions done)`
      );
    }
  }

  const dbPath = getDefaultDbPath();
  if (options.dryRun) {
    return await executeDryRun(options);
  }

  let db: ReturnType<typeof initializeDatabase>["db"];
  try {
    const result = initializeDatabase({ path: dbPath });
    db = result.db;
  } catch (error) {
    handleError(error, options);
    return { exitCode: 1 };
  }

  const cleanupFn = async (): Promise<void> => { closeDatabase(db); };
  registerCleanup(cleanupFn);

  try {
    const resolver = createDriveResolver();
    const sessionSource = new FileSystemSessionSource({ projectNameResolver: resolver });
    const eventParser = new JsonlEventParser();
    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);

    const syncService = new SyncService(
      sessionSource, eventParser, sessionRepo, messageRepo,
      toolUseRepo, extractionStateRepo, db,
      new ProcessAbortSignal(), new FileCheckpointManager(),
    );

    if (options.fixNames) {
      reporter.log("Fixing project names...");
      const fixedCount = await syncService.fixProjectNames(resolver);
      if (!options.quiet) {
        console.log(`Fixed project names: ${fixedCount} sessions updated`);
      }
    }

    const syncOptions: SyncOptions = {
      force: options.force,
      projectFilter: options.project,
      sessionFilter: options.session,
      checkpointEnabled: true,
      onProgress: (progress: any) => {
        if (progress.phase === "discovering") {
          reporter.log("Discovering sessions...");
        } else if (progress.phase === "extracting") {
          if (progress.current === 1) reporter.start(progress.total);
          reporter.update(progress.current, progress.sessionId);
        }
      },
    } as any;

    const result = await syncService.sync(syncOptions);
    bulkOperationCheckpoint(db);
    reporter.stop();
    reportResults(result, startTime, options);

    // Memory file sync (after session extraction)
    const memoryResult = await runMemoryFileSync(db, options);
    if (memoryResult) reportMemoryFileResults(memoryResult, options);

    // Ambient context generation (after memory files are indexed)
    if (!options.dryRun) await runAmbientContextGeneration(db, options);

    const syncExitCode = (result.errors.length > 0 || result.aborted) ? 1 : 0;

    // Run embedding pass if requested (after sync completes)
    if (options.embed && !options.dryRun) {
      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";
      try {
        await runEmbeddingPass(db, options);
      } catch (embeddingError) {
        if (options.json) {
          console.error(formatErrorJson(
            embeddingError instanceof Error ? embeddingError : new Error(String(embeddingError))
          ));
        } else if (!options.quiet) {
          console.error(formatError(
            embeddingError instanceof Error ? embeddingError : new Error(String(embeddingError)),
            { verbose: options.verbose } as any
          ));
        }
        return { exitCode: 1 };
      } finally {
        if (isBackground) {
          const { removeLock } = await import("../../../../infrastructure/embedding/background-embedder.js");
          removeLock();
        }
      }
    }

    return { exitCode: syncExitCode };
  } catch (error) {
    reporter.stop();
    handleError(error, options);
    return { exitCode: 1 };
  } finally {
    unregisterCleanup(cleanupFn);
    closeDatabase(db);
  }
}

// Re-export types and key functions for external consumers
export type { SyncCommandOptions, EmbeddingPassDeps, BackgroundModeDeps, AmbientContextDeps } from "./types.js";
export { runEmbeddingPass, handleModelChange } from "./embedding-pass.js";
export { handleBackgroundMode } from "./background.js";
export { runAmbientContextGeneration } from "./ambient.js";
