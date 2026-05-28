/**
 * MemoryFileSyncService
 *
 * Application service for syncing ~/.memory/ files to the database.
 *
 * Separate from SyncService to avoid constructor inflation.
 * The CLI sync command orchestrates both services sequentially.
 *
 * Uses IMemoryFileScanner (domain port) to discover files and
 * IMemoryFileRepository (domain port) to persist them, maintaining
 * proper hexagonal architecture boundaries.
 */

import type { IMemoryFileRepository } from "../../domain/ports/repositories.js";
import type { IMemoryFileScanner } from "../../domain/ports/sources.js";
import { MemoryFile } from "../../domain/entities/memory-file.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

/**
 * Progress callback for memory file sync.
 */
export interface MemoryFileSyncProgress {
  current: number;
  total: number;
  filePath: string;
  action: "indexing" | "skipped";
}

/**
 * Result of memory file sync operation.
 */
export interface MemoryFileSyncResult {
  filesIndexed: number;
  filesSkipped: number;
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Options for memory file sync.
 */
export interface MemoryFileSyncOptions {
  onProgress?: (progress: MemoryFileSyncProgress) => void;
}

/**
 * Application service for syncing ~/.memory/ files to the database.
 *
 * Separate from SyncService to avoid constructor inflation.
 * The CLI sync command orchestrates both services sequentially.
 */
export class MemoryFileSyncService {
  constructor(
    private readonly repository: IMemoryFileRepository,
    private readonly scanner: IMemoryFileScanner,
  ) {}

  /**
   * Discover and index memory files.
   *
   * Performs incremental indexing: files where content hash matches
   * the stored hash are skipped. New and changed files are upserted.
   */
  async syncMemoryFiles(options: MemoryFileSyncOptions = {}): Promise<MemoryFileSyncResult> {
    const result: MemoryFileSyncResult = {
      filesIndexed: 0,
      filesSkipped: 0,
      errors: [],
    };

    let files;
    try {
      files = await this.scanner.discoverFiles();
    } catch (err) {
      result.errors.push({
        filePath: "~/.memory/",
        error: unknownErrorMessage(err),
      });
      return result;
    }

    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      if (!fileInfo) continue;
      try {
        const existing = await this.repository.findByPath(fileInfo.filePath);
        if (existing && existing.contentHash === fileInfo.contentHash) {
          result.filesSkipped++;
          options.onProgress?.({
            current: i + 1,
            total: files.length,
            filePath: fileInfo.filePath,
            action: "skipped",
          });
          continue;
        }

        const memoryFile = MemoryFile.create({
          filePath: fileInfo.filePath,
          fileType: fileInfo.fileType,
          projectEncoded: fileInfo.projectEncoded,
          content: fileInfo.content,
          contentHash: fileInfo.contentHash,
          lastIndexedAt: new Date(),
        } as any);

        await this.repository.save(memoryFile);
        result.filesIndexed++;

        options.onProgress?.({
          current: i + 1,
          total: files.length,
          filePath: fileInfo.filePath,
          action: "indexing",
        });
      } catch (err) {
        result.errors.push({
          filePath: fileInfo.filePath,
          error: unknownErrorMessage(err),
        });
      }
    }

    return result;
  }
}
