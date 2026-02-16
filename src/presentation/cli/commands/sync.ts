/**
 * Sync Command Handler
 *
 * CLI command for syncing Claude Code sessions to the database.
 * Includes signal handling for graceful shutdown and checkpoint recovery.
 */

import { Command, Option } from "commander";
import type { CommandResult } from "../command-result.js";
import {
  SyncService,
  type SyncOptions,
  type SyncResult,
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
 * Options parsed from CLI arguments.
 */
interface SyncCommandOptions {
  force?: boolean;
  project?: string;
  session?: string;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
  dryRun?: boolean;
  fixNames?: boolean;
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
 * Execute the sync command with given options.
 *
 * Creates dependencies, runs SyncService, and reports results.
 * Handles errors gracefully with formatted output.
 *
 * @param options Command options from CLI
 */
export async function executeSyncCommand(options: SyncCommandOptions): Promise<CommandResult> {
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
    const exitCode = (result.errors.length > 0 || result.aborted) ? 1 : 0;
    return { exitCode };
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
