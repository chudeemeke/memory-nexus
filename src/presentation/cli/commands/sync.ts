/**
 * Sync Command Handler
 *
 * CLI command for syncing Claude Code sessions to the database.
 * Thin wrapper around SyncService with progress reporting.
 */

import { Command, Option } from "commander";
import {
  SyncService,
  type SyncOptions,
  type SyncResult,
} from "../../../application/services/index.js";
import { createProgressReporter, type ProgressReporter } from "../progress-reporter.js";
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
import { FileSystemSessionSource } from "../../../infrastructure/sources/index.js";
import { JsonlEventParser } from "../../../infrastructure/parsers/index.js";

/**
 * Options parsed from CLI arguments.
 */
interface SyncCommandOptions {
  force?: boolean;
  project?: string;
  session?: string;
  quiet?: boolean;
  verbose?: boolean;
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
    .addOption(
      new Option("-q, --quiet", "Suppress progress output")
        .conflicts("verbose")
    )
    .addOption(
      new Option("-v, --verbose", "Show detailed progress")
        .conflicts("quiet")
    )
    .action(async (options: SyncCommandOptions) => {
      await executeSyncCommand(options);
    });
}

/**
 * Execute the sync command with given options.
 *
 * Creates dependencies, runs SyncService, and reports results.
 *
 * @param options Command options from CLI
 */
export async function executeSyncCommand(options: SyncCommandOptions): Promise<void> {
  const startTime = Date.now();
  const reporter = createProgressReporter(options);

  // Initialize database
  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Create dependencies
    const sessionSource = new FileSystemSessionSource();
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

    // Configure sync options with progress callback
    const syncOptions: SyncOptions = {
      force: options.force,
      projectFilter: options.project,
      sessionFilter: options.session,
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

    // Exit with error code if there were failures
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    closeDatabase(db);
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
  if (options.quiet) {
    return;
  }

  const duration = Date.now() - startTime;

  console.log(`\nSync complete in ${duration}ms`);
  console.log(`  Discovered: ${result.sessionsDiscovered}`);
  console.log(`  Processed:  ${result.sessionsProcessed}`);
  console.log(`  Skipped:    ${result.sessionsSkipped}`);
  console.log(`  Messages:   ${result.messagesInserted}`);
  console.log(`  Tool uses:  ${result.toolUsesInserted}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`  ${err.sessionPath}: ${err.error}`);
    }
  }
}
