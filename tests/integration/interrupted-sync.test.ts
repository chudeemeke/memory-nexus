/**
 * Interrupted Sync Integration Tests
 *
 * Validates that sync operations can be interrupted and resumed from checkpoint.
 * Tests requirements QUAL-04: Interrupted sync can be resumed from checkpoint.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncService, type SyncOptions } from "../../src/application/services/sync-service.js";
import type {
  ISessionSource,
  IEventParser,
  SessionFileInfo,
  ParsedEvent,
} from "../../src/domain/ports/index.js";
import { ProjectPath } from "../../src/domain/value-objects/project-path.js";
import { createSchema } from "../../src/infrastructure/database/schema.js";
import { SqliteSessionRepository } from "../../src/infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../src/infrastructure/database/repositories/message-repository.js";
import { SqliteToolUseRepository } from "../../src/infrastructure/database/repositories/tool-use-repository.js";
import { SqliteExtractionStateRepository } from "../../src/infrastructure/database/repositories/extraction-state-repository.js";
import {
  setTestCheckpointPath,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  setShuttingDown,
  resetState,
} from "../../src/infrastructure/signals/index.js";

/**
 * Create a mock session file info
 */
function createMockSessionInfo(
  id: string,
  projectDecoded: string,
  filePath: string
): SessionFileInfo {
  const projectPath = ProjectPath.fromDecoded(projectDecoded);
  return {
    id,
    path: filePath,
    projectPath,
    modifiedTime: new Date(),
    size: 1000,
  };
}

/**
 * Generate a simple JSONL session file
 */
function generateSessionFile(filePath: string): void {
  const timestamp = new Date().toISOString();
  const events = [
    {
      type: "user",
      message: { role: "user", content: "Hello" },
      uuid: `msg-${Date.now()}-1`,
      timestamp,
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi there!" }],
      },
      uuid: `msg-${Date.now()}-2`,
      timestamp,
    },
  ];
  writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

/**
 * Create a mock event parser that parses actual JSONL files
 */
function createFileBasedParser(): IEventParser {
  const { JsonlEventParser } = require("../../src/infrastructure/parsers/jsonl-parser.js");
  return new JsonlEventParser();
}

describe("Interrupted Sync Integration Tests", () => {
  let testDir: string;
  let db: Database;
  let sessionSource: ISessionSource;
  let sessionRepo: SqliteSessionRepository;
  let messageRepo: SqliteMessageRepository;
  let toolUseRepo: SqliteToolUseRepository;
  let extractionStateRepo: SqliteExtractionStateRepository;
  let sessions: SessionFileInfo[];
  let sessionFiles: string[];

  beforeEach(() => {
    // Create isolated temp directory
    testDir = mkdtempSync(join(tmpdir(), "interrupted-sync-test-"));
    setTestCheckpointPath(join(testDir, "sync-checkpoint.json"));

    // Create test session files
    sessionFiles = [];
    sessions = [];
    for (let i = 1; i <= 5; i++) {
      const filePath = join(testDir, `session-${i}.jsonl`);
      generateSessionFile(filePath);
      sessionFiles.push(filePath);
      sessions.push(createMockSessionInfo(`session-${i}`, "C:\\Projects\\test", filePath));
    }

    // Create in-memory database with schema
    db = new Database(":memory:");
    createSchema(db);

    // Create real repositories
    sessionRepo = new SqliteSessionRepository(db);
    messageRepo = new SqliteMessageRepository(db);
    toolUseRepo = new SqliteToolUseRepository(db);
    extractionStateRepo = new SqliteExtractionStateRepository(db);

    // Create mock session source
    sessionSource = {
      discoverSessions: async () => sessions,
      getSessionFile: async (id: string) => {
        const session = sessions.find((s) => s.id === id);
        return session?.path ?? null;
      },
    };

    // Reset signal state
    resetState();
  });

  afterEach(() => {
    // Reset checkpoint path and signals
    setTestCheckpointPath(null);
    resetState();

    // Clean up temp directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  test("resumes sync from checkpoint after interruption", async () => {
    const parser = createFileBasedParser();
    const syncService = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // First sync: abort after 2 sessions by setting abort flag after session completes
    let sessionsCompleted = 0;
    const abortAfter = 2;

    const firstResult = await syncService.sync({
      checkpointEnabled: true,
      onSessionComplete: () => {
        sessionsCompleted++;
        if (sessionsCompleted >= abortAfter) {
          // Set abort flag so next iteration stops
          setShuttingDown(true);
        }
      },
    });

    // Verify first sync was aborted
    expect(firstResult.aborted).toBe(true);
    expect(firstResult.sessionsProcessed).toBe(2);

    // Verify checkpoint was saved
    const checkpoint = loadCheckpoint();
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.completedSessions).toBe(2);
    expect(checkpoint!.completedSessionIds).toEqual(["session-1", "session-2"]);

    // Reset abort flag
    resetState();

    // Second sync: should resume from checkpoint
    const secondResult = await syncService.sync({
      checkpointEnabled: true,
    });

    // Verify second sync only processed remaining sessions
    expect(secondResult.aborted).toBe(false);
    expect(secondResult.sessionsProcessed).toBe(3); // session-3, session-4, session-5
    expect(secondResult.recoveredFromCheckpoint).toBe(2); // Recovered 2 completed sessions

    // Verify checkpoint was cleared after successful completion
    const checkpointAfter = loadCheckpoint();
    expect(checkpointAfter).toBeNull();
  });

  test("handles corrupted checkpoint gracefully", async () => {
    const parser = createFileBasedParser();
    const syncService = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Write corrupted checkpoint file
    const checkpointPath = join(testDir, "sync-checkpoint.json");
    writeFileSync(checkpointPath, "{ invalid json without closing brace");

    // Capture console.warn output
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = (...args: unknown[]) => {
      if (String(args[0]).includes("Invalid checkpoint")) {
        warnCalled = true;
      }
    };

    try {
      // Sync should proceed normally despite corrupted checkpoint
      const result = await syncService.sync({
        checkpointEnabled: true,
      });

      // Should process all sessions (fresh start)
      expect(result.success).toBe(true);
      expect(result.sessionsProcessed).toBe(5);
      expect(result.recoveredFromCheckpoint).toBeUndefined();

      // Warning should have been logged
      expect(warnCalled).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("handles missing sessions from checkpoint", async () => {
    const parser = createFileBasedParser();

    // Create checkpoint referencing a non-existent session
    saveCheckpoint({
      startedAt: new Date().toISOString(),
      totalSessions: 6,
      completedSessions: 1,
      completedSessionIds: ["non-existent-session"],
      lastCompletedAt: new Date().toISOString(),
    });

    const syncService = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    // Sync should proceed normally, processing all discovered sessions
    const result = await syncService.sync({
      checkpointEnabled: true,
    });

    // All 5 sessions should be processed since the checkpoint referenced a missing session
    expect(result.success).toBe(true);
    expect(result.sessionsProcessed).toBe(5);
    expect(result.recoveredFromCheckpoint).toBe(1); // Shows that checkpoint was read
  });

  test("checkpoint is saved incrementally after each session", async () => {
    const parser = createFileBasedParser();
    const syncService = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    const checkpointSnapshots: number[] = [];

    // Track checkpoint state after each session
    await syncService.sync({
      checkpointEnabled: true,
      onSessionComplete: () => {
        const checkpoint = loadCheckpoint();
        if (checkpoint) {
          checkpointSnapshots.push(checkpoint.completedSessions);
        }
      },
    });

    // Should have saved checkpoint after each session
    expect(checkpointSnapshots.length).toBe(5);
    expect(checkpointSnapshots).toEqual([1, 2, 3, 4, 5]);

    // Final checkpoint should be cleared
    const finalCheckpoint = loadCheckpoint();
    expect(finalCheckpoint).toBeNull();
  });

  test("checkpoint not used when checkpointEnabled=false", async () => {
    const parser = createFileBasedParser();

    // Create existing checkpoint
    saveCheckpoint({
      startedAt: new Date().toISOString(),
      totalSessions: 5,
      completedSessions: 2,
      completedSessionIds: ["session-1", "session-2"],
      lastCompletedAt: new Date().toISOString(),
    });

    const syncService = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );

    const result = await syncService.sync({
      checkpointEnabled: false,
    });

    // All sessions should be processed (checkpoint ignored)
    expect(result.sessionsProcessed).toBe(5);
    expect(result.recoveredFromCheckpoint).toBeUndefined();

    // Existing checkpoint should NOT be cleared
    const checkpointAfter = loadCheckpoint();
    expect(checkpointAfter).not.toBeNull();
    expect(checkpointAfter!.completedSessions).toBe(2);
  });

  test("maintains checkpoint across multiple abort-resume cycles", async () => {
    const parser = createFileBasedParser();

    // First cycle: process 1 session, abort
    let cycleCount = 0;
    let result: Awaited<ReturnType<SyncService["sync"]>>;

    // Cycle 1: Process 1 session
    cycleCount = 0;
    const syncService1 = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );
    result = await syncService1.sync({
      checkpointEnabled: true,
      onSessionComplete: () => {
        cycleCount++;
        if (cycleCount >= 1) {
          setShuttingDown(true);
        }
      },
    });
    expect(result.sessionsProcessed).toBe(1);
    resetState();

    // Cycle 2: Process 2 more sessions
    cycleCount = 0;
    const syncService2 = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );
    result = await syncService2.sync({
      checkpointEnabled: true,
      onSessionComplete: () => {
        cycleCount++;
        if (cycleCount >= 2) {
          setShuttingDown(true);
        }
      },
    });
    expect(result.sessionsProcessed).toBe(2); // Only new sessions
    expect(result.recoveredFromCheckpoint).toBe(1);
    resetState();

    // Verify checkpoint shows progress
    const checkpoint = loadCheckpoint();
    expect(checkpoint!.completedSessions).toBe(3); // 1 + 2

    // Cycle 3: Complete remaining sessions
    const syncService3 = new SyncService(
      sessionSource,
      parser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );
    result = await syncService3.sync({
      checkpointEnabled: true,
    });
    expect(result.sessionsProcessed).toBe(2); // Last 2 sessions
    expect(result.recoveredFromCheckpoint).toBe(3);

    // Checkpoint should be cleared
    expect(loadCheckpoint()).toBeNull();
  });
});
