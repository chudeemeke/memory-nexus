/**
 * MemoryFileSyncService Unit Tests
 *
 * Mock-based tests verifying sync behavior: discovery, incremental
 * indexing (hash-based skip), error handling, and progress callbacks.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  MemoryFileSyncService,
  type MemoryFileSyncResult,
  type MemoryFileSyncProgress,
} from "./memory-file-sync-service.js";
import type { IMemoryFileRepository } from "../../domain/ports/repositories.js";
import type { IMemoryFileScanner, MemoryFileInfo } from "../../domain/ports/sources.js";
import { MemoryFile } from "../../domain/entities/memory-file.js";

/**
 * Create a mock MemoryFileInfo with defaults.
 */
function createFileInfo(overrides: Partial<MemoryFileInfo> = {}): MemoryFileInfo {
  return {
    filePath: "daily/2026-03-08.md",
    absolutePath: "/home/user/.memory/daily/2026-03-08.md",
    fileType: "daily_log",
    contentHash: "a".repeat(64),
    content: "# 2026-03-08\n\nSome content here.",
    ...overrides,
  };
}

/**
 * Create a mock MemoryFile entity (as returned by repository.findByPath).
 */
function createMemoryFile(overrides: Partial<{
  filePath: string;
  fileType: "daily_log" | "decisions" | "learnings" | "user_prefs";
  projectEncoded?: string;
  content: string;
  contentHash: string;
  lastIndexedAt: Date;
}> = {}): MemoryFile {
  return MemoryFile.create({
    filePath: overrides.filePath ?? "daily/2026-03-08.md",
    fileType: overrides.fileType ?? "daily_log",
    projectEncoded: overrides.projectEncoded,
    content: overrides.content ?? "# 2026-03-08\n\nSome content here.",
    contentHash: overrides.contentHash ?? "a".repeat(64),
    lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
  });
}

describe("MemoryFileSyncService", () => {
  let mockRepo: IMemoryFileRepository;
  let mockScanner: IMemoryFileScanner;
  let saveCalls: MemoryFile[];

  beforeEach(() => {
    saveCalls = [];
    mockRepo = {
      findByPath: mock(() => Promise.resolve(null)),
      findByType: mock(() => Promise.resolve([])),
      findByProject: mock(() => Promise.resolve([])),
      save: mock((file: MemoryFile) => {
        saveCalls.push(file);
        return Promise.resolve();
      }),
      saveMany: mock(() => Promise.resolve()),
      searchContent: mock(() => Promise.resolve([])),
    };
    mockScanner = {
      discoverFiles: mock(() => Promise.resolve([])),
    };
  });

  it("indexes all new files when repo has no existing records", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({ filePath: "daily/2026-03-07.md", contentHash: "a".repeat(64) }),
      createFileInfo({ filePath: "DECISIONS.md", fileType: "decisions", contentHash: "b".repeat(64) }),
      createFileInfo({ filePath: "LEARNINGS.md", fileType: "learnings", contentHash: "c".repeat(64) }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(3);
    expect(result.filesSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockRepo.save).toHaveBeenCalledTimes(3);
  });

  it("skips files where content hash matches stored hash", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({ filePath: "daily/2026-03-07.md", contentHash: "a".repeat(64) }),
      createFileInfo({ filePath: "DECISIONS.md", fileType: "decisions", contentHash: "b".repeat(64) }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    // First file has matching hash in repo -> skip
    const existingFile = createMemoryFile({
      filePath: "daily/2026-03-07.md",
      contentHash: "a".repeat(64),
    });
    (mockRepo.findByPath as any).mockImplementation((path: string) => {
      if (path === "daily/2026-03-07.md") return Promise.resolve(existingFile);
      return Promise.resolve(null);
    });

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it("re-indexes files when content hash has changed", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({
        filePath: "DECISIONS.md",
        fileType: "decisions",
        contentHash: "a".repeat(64),
        content: "New content",
      }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    // Existing file has different hash -> re-index
    const existingFile = createMemoryFile({
      filePath: "DECISIONS.md",
      fileType: "decisions",
      contentHash: "d".repeat(64),
      content: "Old content",
    });
    (mockRepo.findByPath as any).mockReturnValue(Promise.resolve(existingFile));

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(0);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it("returns empty result when scanner discovers no files", async () => {
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve([]));

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("captures scanner errors without crashing", async () => {
    (mockScanner.discoverFiles as any).mockRejectedValue(
      new Error("Permission denied: ~/.memory/")
    );

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Permission denied");
  });

  it("captures per-file errors and continues processing", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({ filePath: "daily/2026-03-07.md", contentHash: "a".repeat(64) }),
      createFileInfo({ filePath: "DECISIONS.md", fileType: "decisions", contentHash: "b".repeat(64) }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    // First file's save throws, second succeeds
    let callCount = 0;
    (mockRepo.save as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("Disk full"));
      return Promise.resolve();
    });

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].filePath).toBe("daily/2026-03-07.md");
    expect(result.errors[0].error).toContain("Disk full");
  });

  it("calls onProgress for each file processed", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({ filePath: "daily/2026-03-07.md", contentHash: "a".repeat(64) }),
      createFileInfo({ filePath: "DECISIONS.md", fileType: "decisions", contentHash: "b".repeat(64) }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    // First file has matching hash -> skipped
    const existingFile = createMemoryFile({
      filePath: "daily/2026-03-07.md",
      contentHash: "a".repeat(64),
    });
    (mockRepo.findByPath as any).mockImplementation((path: string) => {
      if (path === "daily/2026-03-07.md") return Promise.resolve(existingFile);
      return Promise.resolve(null);
    });

    const progressCalls: MemoryFileSyncProgress[] = [];
    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    await service.syncMemoryFiles({
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0]).toEqual({
      current: 1,
      total: 2,
      filePath: "daily/2026-03-07.md",
      action: "skipped",
    });
    expect(progressCalls[1]).toEqual({
      current: 2,
      total: 2,
      filePath: "DECISIONS.md",
      action: "indexing",
    });
  });

  it("creates MemoryFile entities with correct properties from MemoryFileInfo", async () => {
    const files: MemoryFileInfo[] = [
      createFileInfo({
        filePath: "projects/C--Users-Destiny-Projects-kanbanflow/DECISIONS.md",
        fileType: "decisions",
        projectEncoded: "C--Users-Destiny-Projects-kanbanflow",
        contentHash: "f".repeat(64),
        content: "# Decisions\n\nSome project decisions.",
      }),
    ];
    (mockScanner.discoverFiles as any).mockReturnValue(Promise.resolve(files));

    const service = new MemoryFileSyncService(mockRepo, mockScanner);
    await service.syncMemoryFiles();

    expect(saveCalls).toHaveLength(1);
    const saved = saveCalls[0];
    expect(saved.filePath).toBe("projects/C--Users-Destiny-Projects-kanbanflow/DECISIONS.md");
    expect(saved.fileType).toBe("decisions");
    expect(saved.projectEncoded).toBe("C--Users-Destiny-Projects-kanbanflow");
    expect(saved.contentHash).toBe("f".repeat(64));
    expect(saved.content).toBe("# Decisions\n\nSome project decisions.");
    expect(saved.lastIndexedAt).toBeInstanceOf(Date);
  });
});
