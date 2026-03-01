/**
 * Sync Command Handler
 *
 * CLI command for syncing Claude Code sessions to the database.
 * Includes signal handling for graceful shutdown and checkpoint recovery.
 * Optionally generates embeddings via --embed flag.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  SyncService,
  type SyncOptions,
  type SyncResult,
  type ModelState,
} from "../../../application/services/index.js";
import { createProgressReporter } from "../progress-reporter.js";
import {
  initializeDatabase,
  closeDatabase,
  bulkOperationCheckpoint,
  getDefaultDbPath,
  SqliteSessionRepository,
  SqliteMessageRepository,
  SqliteToolUseRepository,
  SqliteExtractionStateRepository,
} from "../../../infrastructure/database/index.js";
import {
  FileSystemSessionSource,
  ProjectNameResolver,
} from "../../../infrastructure/sources/index.js";
import { JsonlEventParser } from "../../../infrastructure/parsers/index.js";
import {
  setupSignalHandlers,
  registerCleanup,
  unregisterCleanup,
  hasCheckpoint,
  loadCheckpoint,
} from "../../../infrastructure/signals/index.js";
import {
  formatError,
  formatErrorJson,
} from "../formatters/index.js";

/**
 * Options for the sync command.
 */
export interface SyncCommandOptions {
  /** Force re-sync of all sessions, ignoring extraction state */
  force?: boolean;
  /** Filter to sessions from a specific project */
  project?: string;
  /** Filter to a specific session by ID */
  session?: string;
  /** Suppress non-essential output */
  quiet?: boolean;
  /** Show detailed output with timing information */
  verbose?: boolean;
  /** Output results as JSON */
  json?: boolean;
  /** Preview sync without modifying the database */
  dryRun?: boolean;
  /** Fix project names using the resolver */
  fixNames?: boolean;
  /** Generate embeddings for synced messages */
  embed?: boolean;
  /** Run embedding generation in a background process */
  background?: boolean;
}

/**
 * Dependency overrides for runEmbeddingPass (testing support).
 *
 * When not provided, real dependencies are loaded via dynamic import.
 */
export interface EmbeddingPassDeps {
  /** Override embedding provider factory (avoids loading real ONNX runtime) */
  factory?: import("../../../infrastructure/embedding/embedding-provider-factory.js").EmbeddingProviderFactory;
  /** Override configuration (avoids reading config file) */
  config?: import("../../../infrastructure/hooks/config-manager.js").MemoryConfig;
  /** Override embedding repository (avoids real database operations) */
  repositoryOverride?: import("../../../infrastructure/database/repositories/embedding-repository.js").EmbeddingRepository;
}

/**
 * Dependency overrides for handleBackgroundMode (testing support).
 *
 * Allows injection of background-embedder functions for unit testing
 * without spawning real child processes.
 */
export interface BackgroundModeDeps {
  /** Override background process spawning */
  spawnBackgroundEmbedding: (options?: any) => import("../../../infrastructure/embedding/background-embedder.js").SpawnResult;
  /** Override lock file reading */
  readLock: (dataDir?: string) => import("../../../infrastructure/embedding/background-embedder.js").LockData | null;
  /** Override process liveness check */
  isProcessAlive: (pid: number) => boolean;
}

/**
 * Create the sync command for Commander.js.
 *
 * @returns Configured Command instance
 */
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
    .addOption(
      new Option("-q, --quiet", "Suppress progress output")
        .conflicts("verbose")
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed progress")
        .conflicts("quiet")
    )
    .action(async (options: SyncCommandOptions) => {
      const result = await executeSyncCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the sync command programmatically.
 *
 * Syncs Claude Code sessions from JSONL files into the SQLite database.
 * Optionally generates embeddings with `embed: true`. Handles its own
 * database initialization and teardown.
 *
 * @param options - Sync command options
 * @returns CommandResult with exitCode 0 (success) or 1 (error)
 */
export async function executeSyncCommand(options: SyncCommandOptions): Promise<CommandResult> {
  // Handle --background mode before anything else
  if (options.background) {
    return await handleBackgroundMode(options);
  }

  // Set up signal handlers for graceful shutdown
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

  // Initialize database
  const dbPath = getDefaultDbPath();

  // For dry-run, check if database exists first
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

  // Register database close as cleanup for signal handling
  const cleanupFn = async (): Promise<void> => {
    closeDatabase(db);
  };
  registerCleanup(cleanupFn);

  try {
    // Create resolver for correct project name resolution
    const resolver = createDriveResolver();

    // Create dependencies (pass resolver to session source for new syncs)
    const sessionSource = new FileSystemSessionSource({
      projectNameResolver: resolver,
    });
    const eventParser = new JsonlEventParser();
    const sessionRepo = new SqliteSessionRepository(db);
    const messageRepo = new SqliteMessageRepository(db);
    const toolUseRepo = new SqliteToolUseRepository(db);
    const extractionStateRepo = new SqliteExtractionStateRepository(db);

    const syncService = new SyncService(
      sessionSource,
      eventParser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Fix existing project names if requested
    if (options.fixNames) {
      reporter.log("Fixing project names...");
      const fixedCount = await syncService.fixProjectNames(resolver);
      if (!options.quiet) {
        console.log(`Fixed project names: ${fixedCount} sessions updated`);
      }
    }

    // Configure sync options with progress callback
    const syncOptions: SyncOptions = {
      force: options.force,
      projectFilter: options.project,
      sessionFilter: options.session,
      checkpointEnabled: true,
      onProgress: (progress) => {
        if (progress.phase === "discovering") {
          reporter.log("Discovering sessions...");
        } else if (progress.phase === "extracting") {
          if (progress.current === 1) {
            reporter.start(progress.total);
          }
          reporter.update(progress.current, progress.sessionId);
        }
      },
    };

    // Execute sync
    const result = await syncService.sync(syncOptions);

    // Checkpoint WAL after bulk operations
    bulkOperationCheckpoint(db);

    reporter.stop();

    // Report results
    reportResults(result, startTime, options);

    // Exit with error code if there were failures or abort
    const syncExitCode = (result.errors.length > 0 || result.aborted) ? 1 : 0;

    // Run embedding pass if requested (after sync completes)
    if (options.embed && !options.dryRun) {
      const isBackground = process.env.MEMORY_EMBED_BACKGROUND === "1";

      try {
        await runEmbeddingPass(db, options);
      } catch (embeddingError) {
        // Embedding failed, but sync data is safe
        if (options.json) {
          console.error(formatErrorJson(
            embeddingError instanceof Error ? embeddingError : new Error(String(embeddingError))
          ));
        } else if (!options.quiet) {
          console.error(formatError(
            embeddingError instanceof Error ? embeddingError : new Error(String(embeddingError)),
            { verbose: options.verbose }
          ));
        }
        return { exitCode: 1 };
      } finally {
        // Background process cleans up lock file on completion (success or failure)
        if (isBackground) {
          const { removeLock } = await import(
            "../../../infrastructure/embedding/background-embedder.js"
          );
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
    // Unregister cleanup before closing (prevents double-close)
    unregisterCleanup(cleanupFn);
    closeDatabase(db);
  }
}

/**
 * Run the embedding pass after sync completes.
 *
 * Lazy-loads embedding infrastructure to avoid ONNX runtime overhead
 * when --embed is not used. All embedding modules are dynamically imported.
 *
 * @param db Database connection
 * @param options Sync command options
 * @param deps Optional dependency overrides for testing
 */
export async function runEmbeddingPass(
  db: ReturnType<typeof initializeDatabase>["db"],
  options: SyncCommandOptions,
  deps: EmbeddingPassDeps = {},
): Promise<void> {
  // Load dependencies (lazy import for production, overrides for testing)
  const factory = deps.factory ?? await loadFactory();
  const config = deps.config ?? await loadConfig();
  const provider = factory.createFromConfig(config);

  if (!provider) {
    if (!options.quiet) {
      console.error("Embedding is disabled in configuration. Enable it in ~/.config/memory/config.json");
    }
    return;
  }

  // Create repository (override for testing, real for production)
  const repository = deps.repositoryOverride ?? await loadRepository(db);

  const { EmbeddingService } = await import(
    "../../../application/services/embedding-service.js"
  );
  const { createEmbeddingProgressReporter, createModelDownloadHandler } = await import(
    "../progress-reporter.js"
  );

  const service = new EmbeddingService({
    repository,
    provider,
    config: config.embedding,
  });

  // Check for model change
  const modelState = service.checkModelState();
  if (modelState.modelChanged && modelState.needsReEmbed) {
    const proceed = await handleModelChange(modelState, options);
    if (!proceed) {
      await factory.dispose();
      return;
    }

    // Check for dimension change -- requires vec0 table recreation
    const storedDimensions = repository.getStoredEmbeddingDimensions();
    const newDimensions = config.embedding.dimensions;
    if (storedDimensions !== null && storedDimensions !== newDimensions) {
      if (!options.quiet) {
        console.log(`Recreating embedding table for ${newDimensions}-dimensional vectors...`);
      }
      repository.recreateVecTable(newDimensions);
    }

    if (!options.quiet) {
      console.log("Clearing existing embeddings for re-embedding...");
    }
  }

  // Initialize provider (triggers model download on first run)
  const downloadHandler = createModelDownloadHandler({ quiet: options.quiet });
  await provider.initialize(downloadHandler);

  // Calculate how many messages need embedding
  const totalToEmbed = repository.getTotalMessageCount() - repository.getEmbeddedCount();

  if (totalToEmbed === 0) {
    if (!options.quiet) {
      console.log("\nAll messages already embedded.");
    }
    await factory.dispose();
    return;
  }

  // Run embedding pass with progress
  const embeddingReporter = createEmbeddingProgressReporter({ quiet: options.quiet });
  embeddingReporter.start(totalToEmbed);

  try {
    let result;
    if (modelState.modelChanged && modelState.needsReEmbed) {
      result = await service.clearAndReembed({
        onProgress: (p) => embeddingReporter.update(p.current),
      });
    } else {
      result = await service.embedUnembedded({
        onProgress: (p) => embeddingReporter.update(p.current),
      });
    }

    embeddingReporter.stop();

    if (!options.quiet) {
      const seconds = Math.max(1, Math.round(result.durationMs / 1000));
      const rate = result.rate.toFixed(1);
      console.log(`\nEmbedded ${result.embedded} messages in ${seconds}s (${rate} msg/s)`);
    }
  } catch (error) {
    embeddingReporter.stop();
    const embeddedSoFar = repository.getEmbeddedCount();
    const total = repository.getTotalMessageCount();
    if (!options.quiet) {
      console.error(
        `\nEmbedding failed at ${embeddedSoFar}/${total} messages. ` +
        `Run memory sync --embed to resume from where it stopped.`
      );
    }
    throw error;
  } finally {
    await factory.dispose();
  }
}

/**
 * Handle model change detection with user confirmation.
 *
 * Uses human-readable model names from ModelState for prompts.
 * Auto-confirms with --force, skips in non-interactive mode.
 *
 * @param modelState Model state comparison result
 * @param options Sync command options
 * @returns true if embedding should proceed, false to skip
 */
export async function handleModelChange(
  modelState: ModelState,
  options: SyncCommandOptions,
): Promise<boolean> {
  const count = modelState.embeddedCount ?? 0;
  // Use human-readable model names (fall back to hash only for legacy data)
  const fromModel = modelState.storedModelName ?? modelState.storedHash ?? "unknown";
  const toModel = modelState.currentModelName;

  // --force: auto-confirm
  if (options.force) {
    return true;
  }

  // Non-interactive: skip with warning
  if (!process.stdin.isTTY || options.quiet) {
    console.error(
      `Model changed from ${fromModel} to ${toModel}. ` +
      `Skipping re-embedding in non-interactive mode. ` +
      `Run 'memory sync --embed' interactively to re-embed.`
    );
    return false;
  }

  // Interactive prompt
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `Model changed from ${fromModel} to ${toModel}. ` +
      `Re-embed all ${count} messages? [y/N] `,
      (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      }
    );
  });
}

/**
 * Handle --background mode for embedding.
 *
 * Checks that --embed is also set, then spawns a detached background
 * process to run embedding asynchronously. Returns immediately with
 * a status message including the PID.
 *
 * Accepts optional dependency overrides for testing (avoid spawning
 * real child processes in tests).
 *
 * @param options Sync command options
 * @param deps Optional dependency overrides (testing support)
 * @returns Command result with exit code
 */
export async function handleBackgroundMode(
  options: SyncCommandOptions,
  deps?: BackgroundModeDeps,
): Promise<CommandResult> {
  if (!options.embed) {
    console.log("--background requires --embed flag");
    console.log("  Usage: memory sync --embed --background");
    return { exitCode: 0 };
  }

  // Load dependencies (lazy import for production, overrides for testing)
  const {
    spawnBackgroundEmbedding: spawnFn,
    readLock: readLockFn,
    isProcessAlive: isAliveFn,
  } = deps ?? await loadBackgroundDeps();

  // Check existing lock
  const existingLock = readLockFn();
  if (existingLock && isAliveFn(existingLock.pid)) {
    console.log(
      `Embedding already in progress (PID ${existingLock.pid}). ` +
      `Use 'memory status' to check progress.`
    );
    return { exitCode: 0 };
  }

  // Spawn background process
  const result = spawnFn();

  if (result.started) {
    console.log(
      `Background embedding started (PID ${result.pid}). ` +
      `Use 'memory status' to check progress.`
    );
  } else {
    console.error(`Failed to start background embedding: ${result.reason}`);
    return { exitCode: 1 };
  }

  return { exitCode: 0 };
}

// --- Lazy loaders for dynamic import (avoid ONNX when --embed not used) ---

async function loadBackgroundDeps(): Promise<BackgroundModeDeps> {
  const mod = await import(
    "../../../infrastructure/embedding/background-embedder.js"
  );
  return {
    spawnBackgroundEmbedding: mod.spawnBackgroundEmbedding,
    readLock: mod.readLock,
    isProcessAlive: mod.isProcessAlive,
  };
}

async function loadFactory() {
  const { EmbeddingProviderFactory } = await import(
    "../../../infrastructure/embedding/embedding-provider-factory.js"
  );
  return new EmbeddingProviderFactory();
}

async function loadConfig() {
  const { loadConfig } = await import(
    "../../../infrastructure/hooks/config-manager.js"
  );
  return loadConfig();
}

async function loadRepository(db: ReturnType<typeof initializeDatabase>["db"]) {
  const { EmbeddingRepository } = await import(
    "../../../infrastructure/database/repositories/embedding-repository.js"
  );
  return new EmbeddingRepository(db);
}

/**
 * Execute dry-run mode: show what would be synced without syncing.
 */
async function executeDryRun(options: SyncCommandOptions): Promise<CommandResult> {
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

/**
 * Handle error with appropriate formatting.
 */
function handleError(error: unknown, options: SyncCommandOptions): void {
  if (options.json) {
    console.error(formatErrorJson(error instanceof Error ? error : new Error(String(error))));
  } else {
    console.error(formatError(error instanceof Error ? error : new Error(String(error)), {
      verbose: options.verbose,
    }));
  }
}

/**
 * Report sync results to console.
 *
 * @param result Sync result from service
 * @param startTime Start time for duration calculation
 * @param options Command options
 */
function reportResults(
  result: SyncResult,
  startTime: number,
  options: SyncCommandOptions
): void {
  const duration = Date.now() - startTime;

  if (options.json) {
    const output = {
      success: result.success,
      aborted: result.aborted ?? false,
      duration: duration,
      discovered: result.sessionsDiscovered,
      processed: result.sessionsProcessed,
      skipped: result.sessionsSkipped,
      messages: result.messagesInserted,
      toolUses: result.toolUsesInserted,
      recoveredFromCheckpoint: result.recoveredFromCheckpoint,
      errors: result.errors,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (options.quiet) {
    return;
  }

  if (result.aborted) {
    console.log("\nSync aborted (progress saved)");
  } else {
    console.log(`\nSync complete in ${duration}ms`);
  }

  console.log(`  Discovered: ${result.sessionsDiscovered}`);
  console.log(`  Processed:  ${result.sessionsProcessed}`);
  console.log(`  Skipped:    ${result.sessionsSkipped}`);
  console.log(`  Messages:   ${result.messagesInserted}`);
  console.log(`  Tool uses:  ${result.toolUsesInserted}`);

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

/**
 * Create a ProjectNameResolver rooted at the system drive.
 * Detects the drive root from platform conventions.
 */
function createDriveResolver(): ProjectNameResolver {
  // On Windows, use C:\ as root. On Unix, use /.
  const root = process.platform === "win32" ? "C:\\" : "/";
  return new ProjectNameResolver(root);
}
