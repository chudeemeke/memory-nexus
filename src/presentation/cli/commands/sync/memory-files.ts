/**
 * Sync Memory Files
 *
 * Discovers and indexes ~/.memory/ markdown files after session extraction.
 */

import type { initializeDatabase } from "../../../../infrastructure/database/index.js";
import type { MemoryFileSyncResult } from "../../../../application/services/index.js";
import { MemoryFileSyncService } from "../../../../application/services/index.js";
import { SqliteMemoryFileRepository } from "../../../../infrastructure/database/repositories/memory-file-repository.js";
import { MemoryFileScanner } from "../../../../infrastructure/sources/index.js";
import type { SyncCommandOptions } from "./types.js";

/**
 * Run memory file sync: discover and index ~/.memory/ markdown files.
 *
 * Runs after session extraction. Returns null if no memory files
 * were processed (e.g., ~/.memory/ does not exist).
 *
 * @param db Database connection
 * @param options Sync command options
 * @returns Sync result, or null if nothing to report
 */
export async function runMemoryFileSync(
  db: ReturnType<typeof initializeDatabase>["db"],
  options: SyncCommandOptions,
): Promise<MemoryFileSyncResult | null> {
  try {
    const memoryFileRepo = new SqliteMemoryFileRepository(db);
    const memoryFileScanner = new MemoryFileScanner();
    const memoryFileSyncService = new MemoryFileSyncService(memoryFileRepo, memoryFileScanner);

    const result = await memoryFileSyncService.syncMemoryFiles();

    // Only return result if there was something to report
    if (result.filesIndexed > 0 || result.filesSkipped > 0 || result.errors.length > 0) {
      return result;
    }
    return null;
  } catch (error) {
    // Memory file sync failure should not fail the overall sync
    if (!options.quiet) {
      console.error(
        `  Memory files: error (${error instanceof Error ? error.message : String(error)})`
      );
    }
    return null;
  }
}

/**
 * Report memory file sync results to console.
 *
 * @param result Memory file sync result
 * @param options Command options
 */
export function reportMemoryFileResults(
  result: MemoryFileSyncResult,
  options: SyncCommandOptions,
): void {
  if (options.json) {
    // JSON output handled by the main reportResults -- just log extra fields
    const output = {
      memoryFiles: {
        indexed: result.filesIndexed,
        skipped: result.filesSkipped,
        errors: result.errors,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (options.quiet) {
    return;
  }

  console.log(`  Memory files: ${result.filesIndexed} indexed, ${result.filesSkipped} skipped`);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`    Error: ${err.filePath}: ${err.error}`);
    }
  }
}
