/**
 * Integration Tests: Sync with Memory Files
 *
 * Exercises the full stack: MemoryFileScanner discovers files,
 * MemoryFileSyncService processes them, SqliteMemoryFileRepository
 * stores them, and FTS5 indexes the content for search.
 *
 * Uses a real SQLite database (in-memory via temp file) with schema
 * and a temporary directory simulating ~/.memory/.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestDatabase, type TestDatabase } from "../helpers/test-database.js";
import { MemoryFileSyncService } from "../../src/application/services/memory-file-sync-service.js";
import { MemoryFileScanner } from "../../src/infrastructure/sources/memory-file-scanner.js";
import { SqliteMemoryFileRepository } from "../../src/infrastructure/database/repositories/memory-file-repository.js";
import { setTestPaths, resetTestPaths } from "../../src/infrastructure/paths.js";

describe("sync with memory files (integration)", () => {
  let testDb: TestDatabase;
  let memoryDir: string;

  beforeEach(() => {
    testDb = createTestDatabase();
    memoryDir = mkdtempSync(join(tmpdir(), "memory-test-memdir-"));
    setTestPaths({ memoryDir });
  });

  afterEach(() => {
    resetTestPaths();
    testDb.cleanup();
    try {
      rmSync(memoryDir, { recursive: true, force: true });
    } catch {
      // Best-effort
    }
  });

  it("indexes all discovered files and makes them searchable via FTS5", async () => {
    // Create test files in the temp memory directory
    mkdirSync(join(memoryDir, "daily"), { recursive: true });
    writeFileSync(
      join(memoryDir, "daily", "2026-03-07.md"),
      "# 2026-03-07\n\n## Session: abc123 (10:00 - 11:00)\n\n### Topic\nWorked on authentication patterns for the kanbanflow project.\n"
    );
    writeFileSync(
      join(memoryDir, "DECISIONS.md"),
      "# Decisions\n\n## [2026-03-07] Use JWT over session cookies\n- **Chose:** JWT tokens\n- **Over:** Session cookies\n- **Because:** Stateless, works with API consumers\n- **Status:** active\n"
    );

    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    const result = await service.syncMemoryFiles();

    expect(result.filesIndexed).toBe(2);
    expect(result.filesSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify rows in memory_files table
    const rows = testDb.db.prepare("SELECT * FROM memory_files ORDER BY file_path").all() as any[];
    expect(rows).toHaveLength(2);

    // Verify FTS5 search works
    const ftsResults = await repo.searchContent("authentication");
    expect(ftsResults.length).toBeGreaterThanOrEqual(1);
    expect(ftsResults[0].filePath).toBe("daily/2026-03-07.md");

    // Verify JWT search across decisions file
    const jwtResults = await repo.searchContent("JWT");
    expect(jwtResults.length).toBeGreaterThanOrEqual(1);
  });

  it("skips already-indexed files on second sync (incremental)", async () => {
    mkdirSync(join(memoryDir, "daily"), { recursive: true });
    writeFileSync(
      join(memoryDir, "daily", "2026-03-07.md"),
      "# 2026-03-07\n\nSession content here.\n"
    );
    writeFileSync(
      join(memoryDir, "DECISIONS.md"),
      "# Decisions\n\nSome decisions.\n"
    );

    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    // First sync: indexes both files
    const firstResult = await service.syncMemoryFiles();
    expect(firstResult.filesIndexed).toBe(2);

    // Second sync: skips both files (no changes)
    const secondResult = await service.syncMemoryFiles();
    expect(secondResult.filesIndexed).toBe(0);
    expect(secondResult.filesSkipped).toBe(2);
    expect(secondResult.errors).toHaveLength(0);
  });

  it("re-indexes only modified files", async () => {
    mkdirSync(join(memoryDir, "daily"), { recursive: true });
    writeFileSync(
      join(memoryDir, "daily", "2026-03-07.md"),
      "# 2026-03-07\n\nOriginal content.\n"
    );
    writeFileSync(
      join(memoryDir, "DECISIONS.md"),
      "# Decisions\n\nOriginal decisions.\n"
    );

    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    // First sync
    await service.syncMemoryFiles();

    // Modify one file
    writeFileSync(
      join(memoryDir, "DECISIONS.md"),
      "# Decisions\n\nUpdated decisions with new content about Redis caching.\n"
    );

    // Second sync: re-indexes only the modified file
    const result = await service.syncMemoryFiles();
    expect(result.filesIndexed).toBe(1);
    expect(result.filesSkipped).toBe(1);

    // Verify stored content is updated
    const updated = await repo.findByPath("DECISIONS.md");
    expect(updated).not.toBeNull();
    expect(updated!.content).toContain("Redis caching");
  });

  it("searches memory file content through repository", async () => {
    writeFileSync(
      join(memoryDir, "LEARNINGS.md"),
      "# Learnings\n\n## Bun test mock leakage\n- **Context:** When testing with spyOn\n- **Wrong approach:** Not restoring mocks\n- **Correct approach:** Always restore in afterEach\n- **Applies to:** cross-project\n"
    );

    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    await service.syncMemoryFiles();

    const results = await repo.searchContent("mock leakage");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toBe("LEARNINGS.md");
    expect(results[0].fileType).toBe("learnings");
  });

  it("handles empty memory directory gracefully", async () => {
    // memoryDir exists but has no .md files
    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    const result = await service.syncMemoryFiles();
    expect(result.filesIndexed).toBe(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("indexes project-specific memory files with project encoded path", async () => {
    const projectDir = join(memoryDir, "projects", "C--Users-Destiny-Projects-kanbanflow");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "DECISIONS.md"),
      "# Decisions\n\n## [2026-03-07] Use React Query for data fetching\n"
    );

    const repo = new SqliteMemoryFileRepository(testDb.db);
    const scanner = new MemoryFileScanner();
    const service = new MemoryFileSyncService(repo, scanner);

    await service.syncMemoryFiles();

    const projectFiles = await repo.findByProject("C--Users-Destiny-Projects-kanbanflow");
    expect(projectFiles).toHaveLength(1);
    expect(projectFiles[0].fileType).toBe("decisions");
    expect(projectFiles[0].projectEncoded).toBe("C--Users-Destiny-Projects-kanbanflow");
  });
});
