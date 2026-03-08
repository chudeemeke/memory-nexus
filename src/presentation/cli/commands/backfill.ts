/**
 * Backfill Command Handler
 *
 * CLI command for generating daily log entries from historical sessions
 * via claude -p. Provides dry-run preview, confirmation prompt, progress bar,
 * and project/batch filtering.
 */

import { Command } from "commander";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { CommandResult } from "../command-result.js";
import type {
  BackfillOptions,
  BackfillResult,
  DryRunResult,
  IDailyLogWriter,
} from "../../../application/services/backfill-service.js";

/**
 * Options parsed from the CLI.
 */
export interface BackfillCommandOptions {
  dryRun?: boolean;
  project?: string;
  batch: string;
  force?: boolean;
}

/**
 * Service interface for dependency injection in tests.
 */
export interface BackfillServiceDeps {
  dryRun(options?: { project?: string }): Promise<DryRunResult>;
  backfill(options?: BackfillOptions): Promise<BackfillResult>;
}

/**
 * Daily log writer implementation.
 *
 * Writes or appends daily log entries to ~/.memory/daily/<date>.md.
 * Creates parent directories if needed.
 */
export class FileDailyLogWriter implements IDailyLogWriter {
  constructor(private readonly memoryDir: string) {}

  async writeOrAppend(datePath: string, content: string): Promise<boolean> {
    const fullPath = join(this.memoryDir, datePath);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });

    const existed = existsSync(fullPath);
    if (existed) {
      appendFileSync(fullPath, "\n" + content);
    } else {
      writeFileSync(fullPath, content);
    }
    return !existed;
  }
}

/**
 * Execute the backfill command programmatically.
 *
 * Separated from createBackfillCommand for testability.
 * Tests inject mock BackfillServiceDeps; CLI injects real ones.
 */
export async function executeBackfillCommand(
  options: BackfillCommandOptions,
  service: BackfillServiceDeps,
): Promise<CommandResult> {
  const batch = parseInt(options.batch, 10);
  const project = options.project;

  if (options.dryRun) {
    const dryResult = await service.dryRun({ project });
    if (dryResult.unprocessedCount === 0) {
      console.log("No sessions to backfill. All sessions have been processed.");
      return { exitCode: 0 };
    }
    console.log(
      `${dryResult.unprocessedCount} sessions to backfill. ` +
      `Estimated cost: ~$${dryResult.estimatedCost.toFixed(2)}`
    );
    return { exitCode: 0 };
  }

  // Get count for confirmation
  const dryResult = await service.dryRun({ project });
  if (dryResult.unprocessedCount === 0) {
    console.log("No sessions to backfill. All sessions have been processed.");
    return { exitCode: 0 };
  }

  const count = Math.min(dryResult.unprocessedCount, batch);

  // Confirmation prompt
  if (!options.force) {
    const confirmed = await promptConfirmation(
      `Process ${count} sessions? Estimated cost: ~$${(count * 0.001).toFixed(2)} [y/N] `
    );
    if (!confirmed) {
      console.error("Cancelled.");
      return { exitCode: 0 };
    }
  }

  // Progress bar (only in TTY environments)
  let progressBar: { start: Function; update: Function; stop: Function } | null = null;
  try {
    if (process.stderr.isTTY) {
      const cliProgress = await import("cli-progress");
      const bar = new cliProgress.default.SingleBar(
        {
          format: "Backfill |{bar}| {percentage}% | {value}/{total} sessions | {sessionId}",
          hideCursor: true,
          stream: process.stderr,
        },
        cliProgress.default.Presets.shades_classic,
      );
      bar.start(count, 0, { sessionId: "" });
      progressBar = bar;
    }
  } catch {
    // cli-progress not available, continue without progress bar
  }

  const result = await service.backfill({
    batch,
    project,
    onProgress: (progress) => {
      progressBar?.update(progress.current, {
        sessionId: progress.sessionId.slice(0, 8),
      });
    },
  });

  progressBar?.stop();

  // Report results
  console.log(
    `\nBackfill complete: ${result.sessionsProcessed} processed, ` +
    `${result.sessionsFailed} failed, ${result.sessionsSkipped} skipped`
  );
  if (result.dailyLogsCreated > 0 || result.dailyLogsUpdated > 0) {
    console.log(
      `Daily logs: ${result.dailyLogsCreated} created, ${result.dailyLogsUpdated} updated`
    );
  }
  if (result.errors.length > 0) {
    console.error("\nErrors:");
    for (const err of result.errors) {
      console.error(`  ${err.sessionId}: ${err.error}`);
    }
  }

  return { exitCode: 0 };
}

export function createBackfillCommand(): Command {
  return new Command("backfill")
    .description("Generate daily log entries from historical sessions via claude -p")
    .option("--dry-run", "Show session count and estimated cost without processing")
    .option("--project <name>", "Only backfill sessions for one project")
    .option("--batch <n>", "Process N sessions per run (default: 50)", "50")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (options: BackfillCommandOptions) => {
      // Lazy-load infrastructure to avoid import cost when not used
      const { initializeDatabase, closeDatabase } = await import(
        "../../../infrastructure/database/index.js"
      );
      const { SqliteSessionRepository } = await import(
        "../../../infrastructure/database/repositories/session-repository.js"
      );
      const { SqliteMessageRepository } = await import(
        "../../../infrastructure/database/repositories/message-repository.js"
      );
      const { SqliteBackfillStateRepository } = await import(
        "../../../infrastructure/database/repositories/backfill-state-repository.js"
      );
      const { ClaudeSummaryGenerator } = await import(
        "../../../infrastructure/llm/claude-summary-generator.js"
      );
      const { getMemoryDir } = await import(
        "../../../infrastructure/paths.js"
      );
      const { BackfillService } = await import(
        "../../../application/services/backfill-service.js"
      );
      const { getDefaultDbPath } = await import(
        "../../../infrastructure/database/index.js"
      );

      const dbPath = getDefaultDbPath();
      const result = initializeDatabase({ path: dbPath });
      const db = result.db;

      try {
        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);
        const backfillStateRepo = new SqliteBackfillStateRepository(db);
        const summaryGenerator = new ClaudeSummaryGenerator();
        const memoryDir = getMemoryDir();
        const dailyLogWriter = new FileDailyLogWriter(memoryDir);

        const service = new BackfillService(
          sessionRepo,
          messageRepo,
          backfillStateRepo,
          summaryGenerator,
          dailyLogWriter,
        );

        await executeBackfillCommand(options, service);
      } finally {
        closeDatabase(db);
      }
    });
}

async function promptConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
