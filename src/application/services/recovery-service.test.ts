/**
 * RecoveryService Unit Tests
 *
 * Tests the recovery service logic for detecting and syncing pending sessions.
 * Uses mocked dependencies for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { RecoveryService, extractSessionId } from "./recovery-service.js";
import type { ISessionSource, SessionFileInfo } from "../../domain/ports/sources.js";
import type { IExtractionStateRepository } from "../../domain/ports/repositories.js";
import type { SyncService, SyncResult } from "./sync-service.js";
import { ExtractionState } from "../../domain/entities/extraction-state.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";
import { setTestConfigPath } from "../../infrastructure/hooks/config-manager.js";
import { setTestLogPath } from "../../infrastructure/hooks/log-writer.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a mock session file info
 */
function createMockSessionInfo(id: string, path: string): SessionFileInfo {
  const projectPath = ProjectPath.fromDecoded("C:\\Projects\\test");
  return {
    id,
    path,
    projectPath,
    modifiedTime: new Date(),
    size: 1000,
  };
}

/**
 * Create a complete extraction state for a session
 */
function createCompleteState(sessionPath: string): ExtractionState {
  return ExtractionState.create({
    id: crypto.randomUUID(),
    sessionPath,
    startedAt: new Date(),
    status: "complete",
    completedAt: new Date(),
    messagesExtracted: 10,
  });
}

describe("RecoveryService", () => {
  let testDir: string;
  let configPath: string;
  let logPath: string;

  // Mock dependencies
  let sessionSource: ISessionSource;
  let extractionStateRepo: IExtractionStateRepository;
  let syncService: SyncService;
  let recoveryService: RecoveryService;

  // Track mock behavior
  let sessions: SessionFileInfo[];
  let stateMap: Map<string, ExtractionState>;
  let syncCalls: string[];
  let syncShouldFail: Set<string>;

  beforeEach(() => {
    // Create unique test directory
    testDir = join(tmpdir(), `recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    // Set up config for recoveryOnStartup
    configPath = join(testDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ recoveryOnStartup: true }));
    setTestConfigPath(configPath);

    // Set up log path
    logPath = join(testDir, "sync.log");
    setTestLogPath(logPath);

    // Initialize tracking
    sessions = [];
    stateMap = new Map();
    syncCalls = [];
    syncShouldFail = new Set();

    // Create mock session source
    sessionSource = {
      discoverSessions: async () => sessions,
      getSessionFile: async (id: string) => {
        const session = sessions.find((s) => s.id === id);
        return session?.path ?? null;
      },
    };

    // Create mock extraction state repository
    extractionStateRepo = {
      findById: async () => null,
      findBySessionPath: async (path: string) => stateMap.get(path) ?? null,
      findPending: async () => [],
      save: async () => {},
    };

    // Create mock sync service
    syncService = {
      sync: async (options: { sessionFilter?: string }): Promise<SyncResult> => {
        const sessionId = options.sessionFilter;
        if (sessionId) {
          syncCalls.push(sessionId);

          if (syncShouldFail.has(sessionId)) {
            throw new Error(`Sync failed for ${sessionId}`);
          }
        }

        return {
          success: true,
          sessionsDiscovered: 1,
          sessionsProcessed: 1,
          sessionsSkipped: 0,
          messagesInserted: 5,
          toolUsesInserted: 2,
          errors: [],
          durationMs: 100,
        };
      },
    } as unknown as SyncService;

    // Create service
    recoveryService = new RecoveryService(
      sessionSource,
      extractionStateRepo,
      syncService
    );
  });

  afterEach(() => {
    // Reset test paths
    setTestConfigPath(null);
    setTestLogPath(null);

    // Clean up
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("recover()", () => {
    test("finds pending sessions correctly", async () => {
      // Set up: 3 sessions, 1 synced
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
        createMockSessionInfo("session-3", "/path/session-3.jsonl"),
      ];

      // Session 2 is complete
      stateMap.set("/path/session-2.jsonl", createCompleteState("/path/session-2.jsonl"));

      const result = await recoveryService.recover({ dryRun: true });

      expect(result.skipped).toBe(false);
      expect(result.pendingSessions).toHaveLength(2);
      expect(result.pendingSessions).toContain("/path/session-1.jsonl");
      expect(result.pendingSessions).toContain("/path/session-3.jsonl");
      expect(result.pendingSessions).not.toContain("/path/session-2.jsonl");
      expect(result.syncedSessions).toBe(0); // Dry run
    });

    test("respects recoveryOnStartup config when false", async () => {
      // Disable recovery
      writeFileSync(configPath, JSON.stringify({ recoveryOnStartup: false }));

      sessions = [createMockSessionInfo("session-1", "/path/session-1.jsonl")];

      const result = await recoveryService.recover();

      expect(result.skipped).toBe(true);
      expect(result.pendingSessions).toHaveLength(0);
      expect(result.syncedSessions).toBe(0);
    });

    test("dryRun returns pending without syncing", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
      ];

      const result = await recoveryService.recover({ dryRun: true });

      expect(result.skipped).toBe(false);
      expect(result.pendingSessions).toHaveLength(2);
      expect(result.syncedSessions).toBe(0);
      expect(syncCalls).toHaveLength(0); // No sync calls
    });

    test("syncs pending sessions when not dry run", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
      ];

      const result = await recoveryService.recover();

      expect(result.skipped).toBe(false);
      expect(result.pendingSessions).toHaveLength(2);
      expect(result.syncedSessions).toBe(2);
      expect(syncCalls).toContain("session-1");
      expect(syncCalls).toContain("session-2");
    });

    test("maxSessions limits sync count", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
        createMockSessionInfo("session-3", "/path/session-3.jsonl"),
      ];

      const result = await recoveryService.recover({ maxSessions: 2 });

      expect(result.pendingSessions).toHaveLength(3); // All pending
      expect(result.syncedSessions).toBe(2); // Only 2 synced
      expect(syncCalls).toHaveLength(2);
    });

    test("handles sync errors gracefully", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
        createMockSessionInfo("session-3", "/path/session-3.jsonl"),
      ];

      // Make session-2 fail
      syncShouldFail.add("session-2");

      const result = await recoveryService.recover();

      expect(result.pendingSessions).toHaveLength(3);
      expect(result.syncedSessions).toBe(2); // 2 succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sessionPath).toBe("/path/session-2.jsonl");
      expect(result.errors[0].error).toContain("Sync failed");
    });

    test("treats incomplete status as pending", async () => {
      sessions = [createMockSessionInfo("session-1", "/path/session-1.jsonl")];

      // Session has in_progress status (not complete)
      const inProgressState = ExtractionState.create({
        id: crypto.randomUUID(),
        sessionPath: "/path/session-1.jsonl",
        startedAt: new Date(),
        status: "in_progress",
      });
      stateMap.set("/path/session-1.jsonl", inProgressState);

      const result = await recoveryService.recover({ dryRun: true });

      expect(result.pendingSessions).toHaveLength(1);
    });

    test("treats error status as pending", async () => {
      sessions = [createMockSessionInfo("session-1", "/path/session-1.jsonl")];

      // Session has error status
      const errorState = ExtractionState.create({
        id: crypto.randomUUID(),
        sessionPath: "/path/session-1.jsonl",
        startedAt: new Date(),
        status: "error",
        errorMessage: "Previous sync failed",
      });
      stateMap.set("/path/session-1.jsonl", errorState);

      const result = await recoveryService.recover({ dryRun: true });

      expect(result.pendingSessions).toHaveLength(1);
    });

    test("dryRun bypasses recoveryOnStartup check", async () => {
      // Disable recovery
      writeFileSync(configPath, JSON.stringify({ recoveryOnStartup: false }));

      sessions = [createMockSessionInfo("session-1", "/path/session-1.jsonl")];

      // dryRun should still work
      const result = await recoveryService.recover({ dryRun: true });

      expect(result.skipped).toBe(false);
      expect(result.pendingSessions).toHaveLength(1);
    });
  });

  describe("getPendingCount()", () => {
    test("returns accurate count of pending sessions", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
        createMockSessionInfo("session-3", "/path/session-3.jsonl"),
        createMockSessionInfo("session-4", "/path/session-4.jsonl"),
      ];

      // 2 complete, 2 pending
      stateMap.set("/path/session-1.jsonl", createCompleteState("/path/session-1.jsonl"));
      stateMap.set("/path/session-3.jsonl", createCompleteState("/path/session-3.jsonl"));

      const count = await recoveryService.getPendingCount();

      expect(count).toBe(2);
    });

    test("returns 0 when all sessions are synced", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
      ];

      stateMap.set("/path/session-1.jsonl", createCompleteState("/path/session-1.jsonl"));
      stateMap.set("/path/session-2.jsonl", createCompleteState("/path/session-2.jsonl"));

      const count = await recoveryService.getPendingCount();

      expect(count).toBe(0);
    });

    test("returns total count when no sessions are synced", async () => {
      sessions = [
        createMockSessionInfo("session-1", "/path/session-1.jsonl"),
        createMockSessionInfo("session-2", "/path/session-2.jsonl"),
        createMockSessionInfo("session-3", "/path/session-3.jsonl"),
      ];

      // No states set

      const count = await recoveryService.getPendingCount();

      expect(count).toBe(3);
    });
  });
});

describe("extractSessionId()", () => {
  test("extracts ID from Unix path", () => {
    const result = extractSessionId("/home/user/.claude/projects/abc/session-123.jsonl");
    expect(result).toBe("session-123");
  });

  test("extracts ID from Windows path", () => {
    const result = extractSessionId("C:\\Users\\name\\.claude\\projects\\abc\\session-456.jsonl");
    expect(result).toBe("session-456");
  });

  test("handles path with mixed separators", () => {
    const result = extractSessionId("/path/to\\project/session-789.jsonl");
    expect(result).toBe("session-789");
  });

  test("handles UUID session IDs", () => {
    const result = extractSessionId("/path/550e8400-e29b-41d4-a716-446655440000.jsonl");
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("handles subagent paths", () => {
    const result = extractSessionId("/path/session-main/subagents/subagent-123.jsonl");
    expect(result).toBe("subagent-123");
  });
});
