/**
 * Sync Command
 *
 * Orchestrates session extraction, memory file sync, ambient context,
 * and optional embedding generation.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../../command-result.js";
import type { SyncCommandDeps, SyncCommandOptions, SyncCompletionMetadata } from "./types.js";
import { SyncService, type SyncOptions, type SyncResult } from "../../../../application/services/index.js";
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
    recoverProjections: recoverDefaultProjections,
    loadConfig,
    createRemoteEventSyncService: createDefaultRemoteEventSyncService,
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
    .option("--remote", "Synchronize canonical event logs with configured remote")
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
  const workOptions = options.json ? { ...options, quiet: true } : options;
  const reporter = resolved.createProgressReporter(workOptions);

  // Check for recovery from previous interrupted sync
  if (!workOptions.quiet && resolved.hasCheckpoint()) {
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
  let captureResult: SyncResult | undefined;
  const completion: SyncCompletionMetadata = { success: false, projections: { status: "not_run" },
    remote: { status: options.remote ? "not_run" : "not_requested" }, errors: [] };
  const outcome: CommandResult = { exitCode: 1 };
  const finish = (exitCode: number): CommandResult => { outcome.exitCode = exitCode; return outcome; };

  try {
    resolved.registerCleanup(cleanupFn);
    const resolver = resolved.createDriveResolver();
    const syncService = resolved.createSyncService({ db, resolver });

    if (options.fixNames) {
      reporter.log("Fixing project names...");
      const fixedCount = await syncService.fixProjectNames(resolver);
      if (!workOptions.quiet) {
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

    const result = captureResult = await syncService.sync(syncOptions);
    resolved.bulkOperationCheckpoint(db);
    reporter.stop();
    if (result.aborted) return finish(1);

    try {
      const recovery = await resolved.recoverProjections(db);
      if (!recovery || typeof recovery.rebuilt !== "boolean" || typeof recovery.pending !== "boolean") {
        throw new Error("Projection recovery returned an invalid result");
      }
      completion.projections = { status: recovery.pending ? "pending" : "current", rebuilt: recovery.rebuilt };
      if (recovery.pending) {
        completion.projections.error = "Projection recovery remains pending; retry sync before derived output or remote synchronization";
        console.error(completion.projections.error);
        return finish(1);
      }
    } catch (error) {
      completion.projections = { status: "failed", error: unknownErrorMessage(error) };
      resolved.handleError(error, options);
      return finish(1);
    }

    // Git remote sync is explicit to avoid hidden data egress from an ordinary
    // local session sync.
    const config = resolved.loadConfig();
    let remoteFailed = false;
    const remoteUrl = config.remoteSync?.repositoryUrl;
    const remoteConfigured =
      config.remoteSync?.enabled === true &&
      typeof remoteUrl === "string" &&
      remoteUrl.trim().length > 0;
    if (remoteConfigured && options.remote === true) {
      if (!workOptions.quiet) {
        console.log("Synchronizing events with remote Git repository...");
      }
      let remoteStarted = false;
      try {
        const remoteSyncService = await resolved.createRemoteEventSyncService({ db });
        remoteStarted = true;
        const syncResult = await remoteSyncService.sync({
          machineId: config.machineId,
          repositoryUrl: remoteUrl,
          autoPull: config.remoteSync.autoPull,
          autoPush: config.remoteSync.autoPush,
        });
        completion.remote = { status: syncResult.status, result: syncResult };
        if (syncResult.projectionRebuilt) completion.projections.rebuilt = true;
        if (syncResult.projectionPending || (syncResult.rebuildNeeded && !syncResult.projectionRebuilt)) {
          completion.projections.status = "pending";
        }

        if (syncResult.success) {
          if (syncResult.projectionPending || (syncResult.rebuildNeeded && !syncResult.projectionRebuilt)) {
            remoteFailed = true;
            console.error("Projection recovery remains pending; retry sync before treating remote synchronization as complete.");
          } else if (syncResult.projectionRebuilt) {
            if (!workOptions.quiet) {
              console.log("Database projections recovered from recorded events.");
            }
          } else {
            if (!workOptions.quiet) {
              console.log("Git events are already up to date.");
            }
          }
        } else if (syncResult.status === "blocked") {
          const message = [
            syncResult.error ?? "Remote synchronization blocked.",
            "Run 'memory audit-secrets --skip-db --quarantine-events' and retry after reviewing the quarantine output.",
          ].join(" ");
          console.error(message);
          return finish(1);
        } else {
          remoteFailed = true;
          console.error(`Warning: Remote synchronization failed: ${syncResult.error}`);
        }
      } catch (err: any) {
        remoteFailed = true;
        completion.remote = { status: "failed", error: unknownErrorMessage(err) };
        if (remoteStarted) completion.projections.status = "pending";
        console.error(`Warning: Remote synchronization failed to execute: ${unknownErrorMessage(err)}`);
      }
    } else if (options.remote === true) {
      completion.remote = { status: "not_configured" };
      console.error("Remote synchronization requested but no remote repository is configured. Run 'memory remote set <repository-url>' first.");
      return finish(1);
    } else if (remoteConfigured && !workOptions.quiet) {
      console.warn("Remote synchronization is configured but skipped. Run 'memory sync --remote' to synchronize canonical event logs.");
    }
    if (completion.projections.status !== "current") return finish(1);

    const legacyMemoryFilesEnabled =
      options.includeMemoryFiles === true ||
      config.legacyMemoryFiles?.enabled === true ||
      process.env.MEMORY_LEGACY_MEMORY_FILES === "1";

    if (legacyMemoryFilesEnabled) {
      const memoryResult = await resolved.runMemoryFileSync(db, workOptions);
      if (memoryResult) {
        completion.memoryFiles = memoryResult;
        if (!options.json) resolved.reportMemoryFileResults(memoryResult, options);
      }
    } else if (options.verbose && !workOptions.quiet) {
      console.log("  Memory files: skipped (legacy opt-in disabled)");
    }

    // Ambient context generation (after facts/session projections are updated)
    if (!options.dryRun) await resolved.runAmbientContextGeneration(db, workOptions);

    const syncExitCode = (!result.success || result.errors.length > 0 || remoteFailed || (completion.memoryFiles?.errors.length ?? 0) > 0) ? 1 : 0;

    // Run embedding pass if requested (after sync completes)
    if (options.embed && !options.dryRun) {
      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";
      try {
        await resolved.runEmbeddingPass(db, workOptions);
      } catch (embeddingError) {
        completion.errors.push(unknownErrorMessage(embeddingError));
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
        return finish(1);
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

    return finish(syncExitCode);
  } catch (error) {
    reporter.stop();
    completion.errors.push(unknownErrorMessage(error));
    resolved.handleError(error, options);
    return finish(1);
  } finally {
    for (const cleanup of [() => resolved.unregisterCleanup(cleanupFn), () => resolved.closeDatabase(db)]) {
      try { cleanup(); }
      catch (error) {
        outcome.exitCode = 1;
        completion.errors.push(unknownErrorMessage(error));
        resolved.handleError(error, options);
      }
    }
    if (captureResult) resolved.reportResults(captureResult, startTime, options, { ...completion, success: outcome.exitCode === 0 });
  }
}

// Re-export types and key functions for external consumers
export type { SyncCommandOptions, EmbeddingPassDeps, BackgroundModeDeps, AmbientContextDeps } from "./types.js";
export { runEmbeddingPass, handleModelChange } from "./embedding-pass.js";
export { handleBackgroundMode } from "./background.js";
export { runAmbientContextGeneration } from "./ambient.js";

async function createDefaultRemoteEventSyncService({ db }: { db: ReturnType<typeof initializeDatabase>["db"] }) {
  const { RemoteEventSyncService } = await import("../../../../application/services/remote-event-sync-service.js");
  const { GitRemoteEventTransport } = await import("../../../../infrastructure/remote/git-remote-event-transport.js");
  const { getEventsDir } = await import("../../../../infrastructure/paths.js");
  const { SecretAuditService } = await import("../../../../infrastructure/security/secret-audit-service.js");
  const { getAllLogFiles } = await import("../../../../infrastructure/paths.js");
  const transport = new GitRemoteEventTransport(getEventsDir());
  const recover = () => recoverDefaultProjections(db);
  return new RemoteEventSyncService({
    transport,
    privacyPreflight: {
      audit: async () => {
        const report = await new SecretAuditService(new PatternRedactor()).audit({
          eventLogPaths: getAllLogFiles(),
        });
        return { eventLogFindings: report.summary.eventLogFindings };
      },
    },
    projectionRebuilder: {
      recover,
      rebuild: async () => {
        if ((await recover()).pending) throw new Error("Projection recovery remains pending; retry sync");
      },
    },
  });
}

async function recoverDefaultProjections(db: ReturnType<typeof initializeDatabase>["db"]) {
  const { GitRemoteEventTransport } = await import("../../../../infrastructure/remote/git-remote-event-transport.js");
  const { getEventsDir } = await import("../../../../infrastructure/paths.js");
  const { recoverPendingProjections } = await import("../../../../infrastructure/database/projection-recovery.js");
  await new GitRemoteEventTransport(getEventsDir()).assertProjectionSourceSettled();
  return recoverPendingProjections(db);
}
