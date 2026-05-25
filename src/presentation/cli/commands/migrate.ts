/**
 * Database Migration Command
 *
 * Handles cross-environment migrations, checking structural integrity,
 * checkpointing WAL logs, purging stale sync locks, and natively re-installing hooks.
 */

import { Command } from "commander";
import type { CommandResult } from "../command-result.js";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
} from "../../../infrastructure/database/index.js";
import { getDataDir } from "../../../infrastructure/paths.js";
import { SqliteStatsService } from "../../../infrastructure/database/services/stats-service.js";
import {
  uninstallHooks,
  installHooks,
} from "../../../infrastructure/hooks/index.js";
import {
  green,
  red,
  yellow,
  shouldUseColor,
} from "../formatters/color.js";

/**
 * Options for the migrate command.
 */
export interface MigrateCommandOptions {
  /** Migrate database from Windows host env */
  fromWindows?: boolean;
}

/**
 * Test overrides and programmatic dependencies.
 */
export interface MigrateCommandDeps {
  /** Database path. Defaults to getDefaultDbPath(). */
  dbPath?: string;
  /** Data directory. Defaults to getDataDir(). */
  dataDir?: string;
  /** Custom uninstall hooks handler. */
  uninstallHooks?: () => any;
  /** Custom install hooks handler. */
  installHooks?: () => any;
}

/**
 * Create the migrate command for Commander.js.
 */
export function createMigrateCommand(): Command {
  return new Command("migrate")
    .description("Migrate database across platform environments")
    .option("--from-windows", "Migrate database from native Windows/desktop host")
    .action(async (options: MigrateCommandOptions) => {
      const result = await executeMigrateCommand(options);
      process.exitCode = result.exitCode;
    });
}

/**
 * Execute the migrate command programmatically.
 */
export async function executeMigrateCommand(
  options: MigrateCommandOptions,
  deps: MigrateCommandDeps = {}
): Promise<CommandResult> {
  const useColor = shouldUseColor();
  const dbPath = deps.dbPath ?? getDefaultDbPath();
  const dataDir = deps.dataDir ?? getDataDir();

  const uninstallFn = deps.uninstallHooks ?? uninstallHooks;
  const installFn = deps.installHooks ?? installHooks;

  if (!existsSync(dbPath)) {
    console.error(red(`Error: Database not found at ${dbPath}. Run 'memory sync' first.`, useColor));
    return { exitCode: 1 };
  }

  let db;
  try {
    const initResult = initializeDatabase({ path: dbPath });
    db = initResult.db;

    // 1. Structural Integrity Check
    const integrityRow = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string } | null;
    if (!integrityRow || integrityRow.integrity_check !== "ok") {
      const checkResult = integrityRow?.integrity_check ?? "unknown";
      throw new Error(`Database integrity check failed: ${checkResult}`);
    }

    // 2. Commit and Truncate WAL sidecars
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(red(`Error during migration: ${msg}`, useColor));
    if (db) {
      closeDatabase(db);
    }
    return { exitCode: 2 };
  }

  // 3. Stale lock file removal
  const embeddingLockPath = join(dataDir, "embedding.lock");
  if (existsSync(embeddingLockPath)) {
    try {
      unlinkSync(embeddingLockPath);
      console.log(green("Cleaned up stale embedding lock file.", useColor));
    } catch (e) {
      // Ignore lock deletion errors
    }
  }

  // 4. Git Hooks native re-installation
  try {
    uninstallFn();
    installFn();
    console.log(green("Successfully re-installed Git hooks natively.", useColor));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(yellow(`Warning: Failed to re-install Git hooks: ${msg}`, useColor));
  }

  // 5. Output beautiful stats breakdown
  try {
    const statsService = new SqliteStatsService(db);
    const stats = await statsService.getStats();

    console.log("");
    console.log(green("Database migration successful!", useColor));
    console.log("=================================");
    console.log(`Total sessions: ${stats.totalSessions}`);
    console.log(`Total messages: ${stats.totalMessages}`);
    console.log("");
    console.log("Project Breakdown:");
    if (stats.projectBreakdown.length === 0) {
      console.log("  No projects found.");
    } else {
      for (const project of stats.projectBreakdown) {
        console.log(`  - ${project.projectName}: ${project.sessionCount} sessions, ${project.messageCount} messages`);
      }
    }
    console.log("");
  } catch (err) {
    // Non-fatal error showing stats
  } finally {
    closeDatabase(db);
  }

  return { exitCode: 0 };
}
