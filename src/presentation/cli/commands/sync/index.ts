/**
 * Sync Command
 *
 * Orchestrates session extraction, memory file sync, ambient context,
 * and optional embedding generation.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../../command-result.js";
import type { SyncCommandDeps, SyncCommandOptions } from "./types.js";
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
import { loadConfig } from "../../../../infrastructure/hooks/config-manager.js";
import { PatternRedactor } from "../../../../infrastructure/security/pattern-redactor.js";
import { unknownErrorMessage, unknownToError } from "../../../../domain/errors/unknown-error.js";

type ResolvedSyncCommandDeps = Omit<Required<SyncCommandDeps>, "removeBackgroundLock"> & {
  removeBackgroundLock?: () => void;
};

function createDefaultSyncService({ db, resolver }: { db: ReturnType<typeof initializeDatabase>["db"]; resolver: unknown }) {
  const sessionSource = new FileSystemSessionSource({ projectNameResolver: resolver as any });
  const eventParser = new JsonlEventParser();
  const sessionRepo = new SqliteSessionRepository(db);
  const messageRepo = new SqliteMessageRepository(db);
  const toolUseRepo = new SqliteToolUseRepository(db);
  const extractionStateRepo = new SqliteExtractionStateRepository(db);

  const service = new SyncService(
    sessionSource, eventParser, sessionRepo, messageRepo,
    toolUseRepo, extractionStateRepo, db,
    new ProcessAbortSignal(), new FileCheckpointManager(),
    new PatternRedactor(),
  );

  return {
    fixProjectNames: (resolver: unknown) => service.fixProjectNames(resolver as any),
    sync: (options: SyncOptions) => service.sync(options),
  };
}

async function rebuildDefaultProjections(db: ReturnType<typeof initializeDatabase>["db"]): Promise<void> {
  const rebuild = await loadDefaultRebuildProjections();
  await rebuild(db);
}

function resolveSyncCommandDeps(deps: SyncCommandDeps): ResolvedSyncCommandDeps {
  return {
    handleBackgroundMode,
    setupSignalHandlers,
    hasCheckpoint,
    loadCheckpoint,
    createProgressReporter,
    getDefaultDbPath,
    executeDryRun,
    handleError,
    reportResults,
    createDriveResolver,
    initializeDatabase,
    closeDatabase,
    bulkOperationCheckpoint,
    registerCleanup,
    unregisterCleanup,
    createSyncService: createDefaultSyncService,
    loadConfig,
    createGitSyncer: createDefaultGitSyncer,
    rebuildProjections: rebuildDefaultProjections,
    experimentalRemoteSync: process.env.MEMORY_EXPERIMENTAL_REMOTE_SYNC === "1",
    runMemoryFileSync,
    reportMemoryFileResults,
    runAmbientContextGeneration,
    runEmbeddingPass,
    ...deps,
  };
}

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
    .option("--include-memory-files", "Index legacy ~/.memory / MEMORY_HOME markdown files")
    .option("--json", "Output results as JSON")
    .addOption(new Option("-q, --quiet", "Suppress progress output").conflicts("verbose"))
    .addOption(new Option("-v, --verbose", "Show detailed progress").conflicts("quiet"))
    .action(async (options: SyncCommandOptions) => {
      const result = await executeSyncCommand(options);
      process.exitCode = result.exitCode;
    });
}

/** Execute the sync command programmatically. */
export async function executeSyncCommand(
  options: SyncCommandOptions,
  deps: SyncCommandDeps = {},
): Promise<CommandResult> {
  const resolved = resolveSyncCommandDeps(deps);

  if (options.background) {
    return await resolved.handleBackgroundMode(options);
  }

  resolved.setupSignalHandlers();
  const startTime = Date.now();
  const reporter = resolved.createProgressReporter(options);

  // Check for recovery from previous interrupted sync
  if (!options.quiet && resolved.hasCheckpoint()) {
    const checkpoint = resolved.loadCheckpoint();
    if (checkpoint) {
      console.log(
        `Resuming from previous interrupted sync (${checkpoint.completedSessions}/${checkpoint.totalSessions} sessions done)`
      );
    }
  }

  const dbPath = resolved.getDefaultDbPath();
  if (options.dryRun) {
    return await resolved.executeDryRun(options);
  }

  let db: ReturnType<typeof initializeDatabase>["db"];
  try {
    const result = resolved.initializeDatabase({ path: dbPath });
    db = result.db;
  } catch (error) {
    resolved.handleError(error, options);
    return { exitCode: 1 };
  }

  const cleanupFn = async (): Promise<void> => { resolved.closeDatabase(db); };
  resolved.registerCleanup(cleanupFn);

  try {
    const resolver = resolved.createDriveResolver();
    const syncService = resolved.createSyncService({ db, resolver });

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
    resolved.bulkOperationCheckpoint(db);
    reporter.stop();
    resolved.reportResults(result, startTime, options);

    // Git Remote Sync is Phase 38 work. Keep it opt-in until its threat model,
    // event envelope, conflict semantics, and privacy gates are finished.
    const config = resolved.loadConfig();
    const remoteUrl = config.remoteSync?.repositoryUrl;
    const remoteConfigured =
      config.remoteSync?.enabled === true &&
      typeof remoteUrl === "string" &&
      remoteUrl.trim().length > 0;
    const remoteEnabled = resolved.experimentalRemoteSync;
    if (remoteConfigured && remoteEnabled) {
      if (!options.quiet) {
        console.log("Synchronizing events with remote Git repository...");
      }
      try {
        const syncer = await resolved.createGitSyncer();
        
        const syncResult = await syncer.sync(
          config.machineId,
          remoteUrl,
          config.remoteSync.autoPull,
          config.remoteSync.autoPush
        );

        if (syncResult.success) {
          if (syncResult.rebuildNeeded) {
            if (!options.quiet) {
              console.log("Remote events pulled. Rebuilding database projections...");
            }
            await resolved.rebuildProjections(db);
          } else {
            if (!options.quiet) {
              console.log("Git events are already up to date.");
            }
          }
        } else {
          console.error(`Warning: Remote synchronization failed: ${syncResult.error}`);
        }
      } catch (err: any) {
        console.error(`Warning: Remote synchronization failed to execute: ${unknownErrorMessage(err)}`);
      }
    } else if (remoteConfigured && !options.quiet) {
      console.warn("Remote synchronization is configured but disabled until Phase 38 readiness. Set MEMORY_EXPERIMENTAL_REMOTE_SYNC=1 only for explicit prototype testing.");
    }

    const legacyMemoryFilesEnabled =
      options.includeMemoryFiles === true ||
      config.legacyMemoryFiles?.enabled === true ||
      process.env.MEMORY_LEGACY_MEMORY_FILES === "1";

    if (legacyMemoryFilesEnabled) {
      const memoryResult = await resolved.runMemoryFileSync(db, options);
      if (memoryResult) resolved.reportMemoryFileResults(memoryResult, options);
    } else if (options.verbose && !options.quiet) {
      console.log("  Memory files: skipped (legacy opt-in disabled)");
    }

    // Ambient context generation (after facts/session projections are updated)
    if (!options.dryRun) await resolved.runAmbientContextGeneration(db, options);

    const syncExitCode = (result.errors.length > 0 || result.aborted) ? 1 : 0;

    // Run embedding pass if requested (after sync completes)
    if (options.embed && !options.dryRun) {
      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";
      try {
        await resolved.runEmbeddingPass(db, options);
      } catch (embeddingError) {
        if (options.json) {
          console.error(formatErrorJson(
            unknownToError(embeddingError)
          ));
        } else if (!options.quiet) {
          console.error(formatError(
            unknownToError(embeddingError),
            { verbose: options.verbose } as any
          ));
        }
        return { exitCode: 1 };
      } finally {
        if (isBackground) {
          if (resolved.removeBackgroundLock) {
            resolved.removeBackgroundLock();
          } else {
            const { removeLock } = await import("../../../../infrastructure/embedding/background-embedder.js");
            removeLock();
          }
        }
      }
    }

    return { exitCode: syncExitCode };
  } catch (error) {
    reporter.stop();
    resolved.handleError(error, options);
    return { exitCode: 1 };
  } finally {
    resolved.unregisterCleanup(cleanupFn);
    resolved.closeDatabase(db);
  }
}

// Re-export types and key functions for external consumers
export type { SyncCommandOptions, EmbeddingPassDeps, BackgroundModeDeps, AmbientContextDeps } from "./types.js";
export { runEmbeddingPass, handleModelChange } from "./embedding-pass.js";
export { handleBackgroundMode } from "./background.js";
export { runAmbientContextGeneration } from "./ambient.js";

async function createDefaultGitSyncer() {
  const { GitSyncer } = await import("../../../../infrastructure/hooks/git-syncer.js");
  return new GitSyncer();
}

async function loadDefaultRebuildProjections() {
  const { rebuildProjections } = await import("../../../../infrastructure/database/event-log.js");
  return rebuildProjections;
}
