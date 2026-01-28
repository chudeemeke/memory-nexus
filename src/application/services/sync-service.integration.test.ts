/**
 * SyncService Integration Tests
 *
 * End-to-end tests for the sync pipeline with real file I/O.
 * Tests full workflow: discover -> filter -> extract -> persist.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "bun:sqlite";
import { SyncService, type SyncProgress } from "./sync-service.js";
import {
  initializeDatabase,
  closeDatabase,
  bulkOperationCheckpoint,
  SqliteSessionRepository,
  SqliteMessageRepository,
  SqliteToolUseRepository,
  SqliteExtractionStateRepository,
} from "../../infrastructure/database/index.js";
import { FileSystemSessionSource } from "../../infrastructure/sources/index.js";
import { JsonlEventParser } from "../../infrastructure/parsers/index.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";

/**
 * Helper to create a test session with JSONL events
 */
function createTestSession(
  tempDir: string,
  projectPath: string,
  sessionId: string,
  events: object[]
): string {
  // Encode project path for directory name
  const encodedPath = ProjectPath.fromDecoded(projectPath).encoded;
  const sessionDir = join(tempDir, encodedPath);
  mkdirSync(sessionDir, { recursive: true });

  const jsonlPath = join(sessionDir, `${sessionId}.jsonl`);
  const content = events.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(jsonlPath, content);

  return jsonlPath;
}

/**
 * Helper to create minimal valid events
 */
function createMinimalEvents(timestamp: string = new Date().toISOString()): object[] {
  return [
    {
      type: "user",
      uuid: `user-${Date.now()}`,
      message: { role: "user", content: "Hello" },
      timestamp,
    },
    {
      type: "assistant",
      uuid: `asst-${Date.now()}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi there!" }],
      },
      timestamp,
    },
  ];
}

/**
 * Helper to create SyncService with all dependencies
 */
function createSyncService(
  db: Database,
  claudeDir: string
): SyncService {
  const sessionSource = new FileSystemSessionSource({ claudeDir });
  const eventParser = new JsonlEventParser();
  const sessionRepo = new SqliteSessionRepository(db);
  const messageRepo = new SqliteMessageRepository(db);
  const toolUseRepo = new SqliteToolUseRepository(db);
  const extractionStateRepo = new SqliteExtractionStateRepository(db);

  return new SyncService(
    sessionSource,
    eventParser,
    sessionRepo,
    messageRepo,
    toolUseRepo,
    extractionStateRepo,
    db
  );
}

describe("SyncService Integration", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    // Create unique temp directory for test sessions
    tempDir = join(tmpdir(), `sync-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    // Initialize in-memory database with full schema
    const result = initializeDatabase({ path: ":memory:" });
    db = result.db;
  });

  afterEach(() => {
    // Close database
    closeDatabase(db);

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Basic sync workflow", () => {
    test("syncs sessions from filesystem to database", async () => {
      // Create test session
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());

      // Create sync service
      const syncService = createSyncService(db, tempDir);

      // Run sync
      const result = await syncService.sync();

      // Verify results
      expect(result.sessionsDiscovered).toBe(1);
      expect(result.sessionsProcessed).toBe(1);
      expect(result.messagesInserted).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    });

    test("syncs multiple sessions", async () => {
      // Create multiple test sessions
      createTestSession(tempDir, "C:\\test\\project1", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project2", "session-2", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project3", "session-3", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      expect(result.sessionsDiscovered).toBe(3);
      expect(result.sessionsProcessed).toBe(3);
      expect(result.success).toBe(true);
    });

    test("handles empty projects directory", async () => {
      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      expect(result.sessionsDiscovered).toBe(0);
      expect(result.sessionsProcessed).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe("Incremental sync behavior", () => {
    test("skips unchanged sessions on second sync", async () => {
      // Create test session
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      // First sync
      const result1 = await syncService.sync();
      expect(result1.sessionsProcessed).toBe(1);
      expect(result1.sessionsSkipped).toBe(0);

      // Second sync (should skip)
      const result2 = await syncService.sync();
      expect(result2.sessionsDiscovered).toBe(1);
      expect(result2.sessionsProcessed).toBe(0);
      expect(result2.sessionsSkipped).toBe(1);
    });

    test("processes modified sessions (size change)", async () => {
      // Create test session
      const jsonlPath = createTestSession(
        tempDir,
        "C:\\test\\project",
        "session-1",
        createMinimalEvents()
      );

      const syncService = createSyncService(db, tempDir);

      // First sync
      await syncService.sync();

      // Modify file (append new event)
      const newEvent = JSON.stringify({
        type: "user",
        uuid: `user-new-${Date.now()}`,
        message: { role: "user", content: "Another message" },
        timestamp: new Date().toISOString(),
      });
      appendFileSync(jsonlPath, "\n" + newEvent);

      // Second sync (should process due to size change)
      const result2 = await syncService.sync();
      expect(result2.sessionsProcessed).toBe(1);
      expect(result2.sessionsSkipped).toBe(0);
    });

    test("processes multiple syncs with mixed changes", async () => {
      // Create two sessions
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());
      const jsonlPath2 = createTestSession(
        tempDir,
        "C:\\test\\project",
        "session-2",
        createMinimalEvents()
      );

      const syncService = createSyncService(db, tempDir);

      // First sync - both processed
      const result1 = await syncService.sync();
      expect(result1.sessionsProcessed).toBe(2);

      // Modify only session-2
      appendFileSync(jsonlPath2, "\n" + JSON.stringify({
        type: "user",
        uuid: "user-added",
        message: { role: "user", content: "Added" },
        timestamp: new Date().toISOString(),
      }));

      // Second sync - only session-2 processed
      const result2 = await syncService.sync();
      expect(result2.sessionsProcessed).toBe(1);
      expect(result2.sessionsSkipped).toBe(1);
    });
  });

  describe("Force option", () => {
    test("--force re-extracts all sessions", async () => {
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      // First sync
      await syncService.sync();

      // Force sync (should process again)
      const result2 = await syncService.sync({ force: true });
      expect(result2.sessionsProcessed).toBe(1);
      expect(result2.sessionsSkipped).toBe(0);
    });

    test("--force processes all sessions regardless of state", async () => {
      createTestSession(tempDir, "C:\\test\\project1", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project2", "session-2", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      // First sync
      await syncService.sync();

      // Force sync - both should be processed
      const result2 = await syncService.sync({ force: true });
      expect(result2.sessionsDiscovered).toBe(2);
      expect(result2.sessionsProcessed).toBe(2);
      expect(result2.sessionsSkipped).toBe(0);
    });
  });

  describe("Project filter", () => {
    test("--project filters by project path substring", async () => {
      createTestSession(tempDir, "C:\\test\\project-a", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project-b", "session-2", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\other", "session-3", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      // Sync with project filter
      const result = await syncService.sync({ projectFilter: "project" });

      expect(result.sessionsDiscovered).toBe(3);
      expect(result.sessionsProcessed).toBe(2); // project-a and project-b
      expect(result.sessionsSkipped).toBe(1); // other
    });

    test("--project with no matches processes nothing", async () => {
      createTestSession(tempDir, "C:\\test\\frontend", "session-1", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      const result = await syncService.sync({ projectFilter: "backend" });

      expect(result.sessionsDiscovered).toBe(1);
      expect(result.sessionsProcessed).toBe(0);
      expect(result.sessionsSkipped).toBe(1);
    });
  });

  describe("Session filter", () => {
    test("--session syncs specific session only", async () => {
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project", "session-2", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      const result = await syncService.sync({ sessionFilter: "session-1" });

      expect(result.sessionsDiscovered).toBe(2);
      expect(result.sessionsProcessed).toBe(1);
      expect(result.sessionsSkipped).toBe(1);
    });
  });

  describe("Progress callback", () => {
    test("invokes progress callback for each session", async () => {
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\project", "session-2", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      const progressCalls: SyncProgress[] = [];
      await syncService.sync({
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      // Should have discovering, extracting (x2), and complete phases
      expect(progressCalls.length).toBeGreaterThan(0);

      const extractingCalls = progressCalls.filter((p) => p.phase === "extracting");
      expect(extractingCalls.length).toBe(2);
      expect(extractingCalls[0].current).toBe(1);
      expect(extractingCalls[0].total).toBe(2);
      expect(extractingCalls[1].current).toBe(2);
      expect(extractingCalls[1].total).toBe(2);

      // Last call should be complete
      expect(progressCalls[progressCalls.length - 1].phase).toBe("complete");
    });

    test("progress callback shows correct total after filtering", async () => {
      createTestSession(tempDir, "C:\\test\\frontend", "session-1", createMinimalEvents());
      createTestSession(tempDir, "C:\\test\\backend", "session-2", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);

      const progressCalls: SyncProgress[] = [];
      await syncService.sync({
        projectFilter: "frontend",
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const extractingCalls = progressCalls.filter((p) => p.phase === "extracting");
      expect(extractingCalls.length).toBe(1);
      expect(extractingCalls[0].total).toBe(1);
    });
  });

  describe("Message extraction", () => {
    test("extracts user and assistant messages", async () => {
      const timestamp = new Date().toISOString();
      const events = [
        {
          type: "user",
          uuid: "user-1",
          message: { role: "user", content: "What is TypeScript?" },
          timestamp,
        },
        {
          type: "assistant",
          uuid: "asst-1",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "TypeScript is a superset of JavaScript." }],
          },
          timestamp,
        },
      ];

      createTestSession(tempDir, "C:\\test\\project", "session-1", events);

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      expect(result.messagesInserted).toBe(2);
    });

    test("extracts tool uses from assistant messages", async () => {
      const timestamp = new Date().toISOString();
      const events = [
        {
          type: "user",
          uuid: "user-1",
          message: { role: "user", content: "List files" },
          timestamp,
        },
        {
          type: "assistant",
          uuid: "asst-1",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Let me list the files" },
              { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "ls" } },
            ],
          },
          timestamp,
        },
        {
          type: "tool_result",
          uuid: "result-1",
          toolUseId: "tool-1",
          content: "file1.txt\nfile2.txt",
          isError: false,
          timestamp,
        },
      ];

      createTestSession(tempDir, "C:\\test\\project", "session-1", events);

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      expect(result.messagesInserted).toBe(2);
      expect(result.toolUsesInserted).toBe(1);
    });
  });

  describe("Database persistence", () => {
    test("persists sessions to database", async () => {
      createTestSession(tempDir, "C:\\test\\myproject", "session-1", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);
      await syncService.sync();

      // Query database directly
      const sessions = db
        .query<{ id: string; project_name: string }, []>(
          "SELECT id, project_name FROM sessions"
        )
        .all();

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("session-1");
      expect(sessions[0].project_name).toBe("myproject");
    });

    test("persists messages to database with FTS indexing", async () => {
      const events = [
        {
          type: "user",
          uuid: "user-1",
          message: { role: "user", content: "authentication flow" },
          timestamp: new Date().toISOString(),
        },
      ];

      createTestSession(tempDir, "C:\\test\\project", "session-1", events);

      const syncService = createSyncService(db, tempDir);
      await syncService.sync();

      // Query FTS table
      const ftsResults = db
        .query<{ content: string }, [string]>(
          "SELECT content FROM messages_fts WHERE messages_fts MATCH ?"
        )
        .all("authentication");

      expect(ftsResults.length).toBe(1);
      expect(ftsResults[0].content).toContain("authentication");
    });

    test("persists extraction state for incremental sync", async () => {
      createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);
      await syncService.sync();

      // Query extraction state
      const states = db
        .query<{ status: string; messages_extracted: number }, []>(
          "SELECT status, messages_extracted FROM extraction_state"
        )
        .all();

      expect(states.length).toBe(1);
      expect(states[0].status).toBe("complete");
      expect(states[0].messages_extracted).toBeGreaterThan(0);
    });
  });

  describe("WAL checkpoint", () => {
    test("WAL checkpoint works after sync with file database", async () => {
      // Use file-based database for WAL test
      const dbPath = join(tempDir, "test.db");
      const result = initializeDatabase({ path: dbPath });
      const fileDb = result.db;

      try {
        // Create and sync session
        createTestSession(tempDir, "C:\\test\\project", "session-1", createMinimalEvents());
        const syncService = createSyncService(fileDb, tempDir);
        await syncService.sync();

        // Perform checkpoint
        const checkpointResult = bulkOperationCheckpoint(fileDb);

        expect(checkpointResult).toBeDefined();
        expect(typeof checkpointResult.busy).toBe("number");
        expect(typeof checkpointResult.log).toBe("number");
        expect(typeof checkpointResult.checkpointed).toBe("number");
      } finally {
        closeDatabase(fileDb);
      }
    });
  });

  describe("Error handling", () => {
    test("handles malformed JSONL gracefully", async () => {
      // Create session with malformed JSON
      const encodedPath = ProjectPath.fromDecoded("C:\\test\\project").encoded;
      const sessionDir = join(tempDir, encodedPath);
      mkdirSync(sessionDir, { recursive: true });
      const jsonlPath = join(sessionDir, "session-1.jsonl");
      writeFileSync(jsonlPath, "{ malformed json\n{\"type\": \"user\", \"uuid\": \"u1\", \"message\": {\"content\": \"Hi\"}, \"timestamp\": \"2024-01-01T00:00:00Z\"}");

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      // Should process the session (parser skips malformed lines)
      expect(result.sessionsProcessed).toBe(1);
      expect(result.success).toBe(true);
    });

    test("malformed session content does not affect other sessions", async () => {
      // Create valid session
      createTestSession(tempDir, "C:\\test\\project1", "session-1", createMinimalEvents());

      // Create session with completely invalid content (parser skips malformed lines)
      const encodedPath = ProjectPath.fromDecoded("C:\\test\\project2").encoded;
      const sessionDir = join(tempDir, encodedPath);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, "session-2.jsonl"), "not json at all");

      // Create another valid session
      createTestSession(tempDir, "C:\\test\\project3", "session-3", createMinimalEvents());

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      // All sessions are processed (parser gracefully handles malformed lines)
      expect(result.sessionsProcessed).toBe(3);
      // Valid sessions should have messages extracted
      expect(result.messagesInserted).toBeGreaterThan(0);
    });
  });

  describe("Subagent sessions", () => {
    test("discovers and syncs subagent sessions", async () => {
      // Create main session
      const encodedPath = ProjectPath.fromDecoded("C:\\test\\project").encoded;
      const projectDir = join(tempDir, encodedPath);
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        join(projectDir, "main-session.jsonl"),
        createMinimalEvents().map((e) => JSON.stringify(e)).join("\n")
      );

      // Create subagent session
      const subagentDir = join(projectDir, "main-session", "subagents");
      mkdirSync(subagentDir, { recursive: true });
      writeFileSync(
        join(subagentDir, "sub-session.jsonl"),
        createMinimalEvents().map((e) => JSON.stringify(e)).join("\n")
      );

      const syncService = createSyncService(db, tempDir);
      const result = await syncService.sync();

      expect(result.sessionsDiscovered).toBe(2);
      expect(result.sessionsProcessed).toBe(2);
    });
  });
});
