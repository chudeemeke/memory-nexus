/**
 * SyncService Unit Tests
 *
 * Tests the sync orchestration logic with mocked dependencies.
 * Verifies filtering, incremental detection, and progress callbacks.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SyncService, type SyncOptions, type SyncProgress } from "./sync-service.js";
import type {
  ISessionSource,
  IEventParser,
  SessionFileInfo,
  ParsedEvent,
} from "../../domain/ports/index.js";
import type {
  ISessionRepository,
  IMessageRepository,
  IToolUseRepository,
  IExtractionStateRepository,
} from "../../domain/ports/repositories.js";
import { ExtractionState } from "../../domain/entities/extraction-state.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";
import { createSchema } from "../../infrastructure/database/schema.js";

/**
 * Create a mock session file info
 */
function createMockSessionInfo(
  id: string,
  projectDecoded: string,
  modifiedTime: Date,
  size: number
): SessionFileInfo {
  const projectPath = ProjectPath.fromDecoded(projectDecoded);
  return {
    id,
    path: `/mock/path/${id}.jsonl`,
    projectPath,
    modifiedTime,
    size,
  };
}

/**
 * Create a mock event parser that returns specified events
 */
function createMockParser(eventsMap: Map<string, ParsedEvent[]>): IEventParser {
  return {
    parse: async function* (filePath: string) {
      const events = eventsMap.get(filePath) ?? [];
      for (const event of events) {
        yield event;
      }
    },
  };
}

/**
 * Create mock events for a simple session
 */
function createSimpleSessionEvents(): ParsedEvent[] {
  const timestamp = new Date().toISOString();
  return [
    {
      type: "user",
      data: {
        uuid: "msg-1",
        message: { content: "Hello" },
        timestamp,
      },
    },
    {
      type: "assistant",
      data: {
        uuid: "msg-2",
        message: {
          content: [{ type: "text", text: "Hi there!" }],
        },
        timestamp,
      },
    },
  ];
}

describe("SyncService", () => {
  let db: Database;
  let sessionSource: ISessionSource;
  let eventParser: IEventParser;
  let sessionRepo: ISessionRepository;
  let messageRepo: IMessageRepository;
  let toolUseRepo: IToolUseRepository;
  let extractionStateRepo: IExtractionStateRepository;
  let syncService: SyncService;

  // Track mock calls
  let discoverSessionsCalls: number;
  let saveSessionCalls: { id: string }[];
  let saveMessagesCalls: { count: number; sessionId: string }[];
  let saveToolUsesCalls: { count: number; sessionId: string }[];
  let saveStateCalls: ExtractionState[];
  let findBySessionPathResults: Map<string, ExtractionState | null>;

  beforeEach(() => {
    // Create in-memory database with schema
    db = new Database(":memory:");
    createSchema(db);

    // Reset tracking
    discoverSessionsCalls = 0;
    saveSessionCalls = [];
    saveMessagesCalls = [];
    saveToolUsesCalls = [];
    saveStateCalls = [];
    findBySessionPathResults = new Map();

    // Create mock session source
    sessionSource = {
      discoverSessions: mock(async () => {
        discoverSessionsCalls++;
        return [];
      }),
      getSessionFile: mock(async () => null),
    };

    // Create mock event parser
    eventParser = createMockParser(new Map());

    // Create mock repositories
    sessionRepo = {
      findById: mock(async () => null),
      findByProject: mock(async () => []),
      findRecent: mock(async () => []),
      save: mock(async (session) => {
        saveSessionCalls.push({ id: session.id });
      }),
      saveMany: mock(async () => {}),
      delete: mock(async () => {}),
    };

    messageRepo = {
      findById: mock(async () => null),
      findBySession: mock(async () => []),
      save: mock(async () => {}),
      saveMany: mock(async (messages) => {
        if (messages.length > 0) {
          saveMessagesCalls.push({
            count: messages.length,
            sessionId: messages[0].sessionId,
          });
        }
        return { inserted: messages.length, skipped: 0, errors: [] };
      }),
    };

    toolUseRepo = {
      findById: mock(async () => null),
      findBySession: mock(async () => []),
      save: mock(async () => {}),
      saveMany: mock(async (toolUses) => {
        if (toolUses.length > 0) {
          saveToolUsesCalls.push({
            count: toolUses.length,
            sessionId: toolUses[0].sessionId,
          });
        }
        return { inserted: toolUses.length, skipped: 0, errors: [] };
      }),
    };

    extractionStateRepo = {
      findById: mock(async () => null),
      findBySessionPath: mock(async (path) => {
        return findBySessionPathResults.get(path) ?? null;
      }),
      findPending: mock(async () => []),
      save: mock(async (state) => {
        saveStateCalls.push(state);
      }),
    };

    // Create sync service
    syncService = new SyncService(
      sessionSource,
      eventParser,
      sessionRepo,
      messageRepo,
      toolUseRepo,
      extractionStateRepo,
      db
    );
  });

  describe("sync() basic behavior", () => {
    test("discovers sessions from session source", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      const discoverMock = mock(async () => sessions);
      sessionSource.discoverSessions = discoverMock;

      const eventsMap = new Map([["/mock/path/session-1.jsonl", createSimpleSessionEvents()]]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(discoverMock).toHaveBeenCalledTimes(1);
      expect(result.sessionsDiscovered).toBe(1);
    });

    test("returns correct SyncResult structure", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([["/mock/path/session-1.jsonl", createSimpleSessionEvents()]]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("sessionsDiscovered");
      expect(result).toHaveProperty("sessionsProcessed");
      expect(result).toHaveProperty("sessionsSkipped");
      expect(result).toHaveProperty("messagesInserted");
      expect(result).toHaveProperty("toolUsesInserted");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("durationMs");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.durationMs).toBe("number");
    });

    test("processes all sessions when no filters", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test1", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\test2", new Date(), 2000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
        ["/mock/path/session-2.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(2);
      expect(result.sessionsSkipped).toBe(0);
    });
  });

  describe("projectFilter", () => {
    test("filters sessions by project path substring", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
        createMockSessionInfo("session-3", "C:\\Projects\\frontend-app", new Date(), 3000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
        ["/mock/path/session-3.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync({ projectFilter: "frontend" });

      expect(result.sessionsDiscovered).toBe(3);
      expect(result.sessionsProcessed).toBe(2); // session-1 and session-3
      expect(result.sessionsSkipped).toBe(1); // session-2
    });

    test("returns zero processed when filter matches nothing", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const result = await syncService.sync({ projectFilter: "nonexistent" });

      expect(result.sessionsProcessed).toBe(0);
      expect(result.sessionsSkipped).toBe(1);
    });
  });

  describe("sessionFilter", () => {
    test("filters to specific session by ID", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([
        ["/mock/path/session-2.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync({ sessionFilter: "session-2" });

      expect(result.sessionsProcessed).toBe(1);
      expect(result.sessionsSkipped).toBe(1);
    });

    test("returns zero processed when session ID not found", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const result = await syncService.sync({ sessionFilter: "nonexistent" });

      expect(result.sessionsProcessed).toBe(0);
      expect(result.sessionsSkipped).toBe(1);
    });
  });

  describe("force option", () => {
    test("force=true processes all sessions regardless of state", async () => {
      const mtime = new Date("2024-01-01");
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Set up existing complete extraction state with matching metadata
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "complete",
      }).withFileMetadata(mtime, 1000);
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync({ force: true });

      expect(result.sessionsProcessed).toBe(1);
      expect(result.sessionsSkipped).toBe(0);
    });
  });

  describe("incremental sync", () => {
    test("skips unchanged sessions (same mtime and size)", async () => {
      const mtime = new Date("2024-01-01T12:00:00Z");
      const size = 1000;
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, size),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing complete state with matching metadata
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "complete",
      }).withFileMetadata(mtime, size);
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(0);
      expect(result.sessionsSkipped).toBe(1);
    });

    test("processes changed sessions (different mtime)", async () => {
      const oldMtime = new Date("2024-01-01T12:00:00Z");
      const newMtime = new Date("2024-01-02T12:00:00Z");
      const size = 1000;
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", newMtime, size),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing state with old mtime
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "complete",
      }).withFileMetadata(oldMtime, size);
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });

    test("processes changed sessions (different size)", async () => {
      const mtime = new Date("2024-01-01T12:00:00Z");
      const oldSize = 1000;
      const newSize = 2000;
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, newSize),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing state with old size
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "complete",
      }).withFileMetadata(mtime, oldSize);
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });

    test("processes sessions with no existing state", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // No existing state
      findBySessionPathResults.set("/mock/path/session-1.jsonl", null);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });

    test("processes sessions with null mtime in extraction state", async () => {
      const mtime = new Date("2024-01-01T12:00:00Z");
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing state without file metadata
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "complete",
      });
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });

    test("processes sessions with error status", async () => {
      const mtime = new Date("2024-01-01T12:00:00Z");
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing state with error status
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "pending",
      }).withFileMetadata(mtime, 1000).fail("Previous error");
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });

    test("processes sessions with in_progress status", async () => {
      const mtime = new Date("2024-01-01T12:00:00Z");
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", mtime, 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Existing state with in_progress status
      const existingState = ExtractionState.create({
        id: "state-1",
        sessionPath: "/mock/path/session-1.jsonl",
        startedAt: new Date(),
        status: "in_progress",
      }).withFileMetadata(mtime, 1000);
      findBySessionPathResults.set("/mock/path/session-1.jsonl", existingState);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(1);
    });
  });

  describe("error handling", () => {
    test("error in one session does not affect others", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
        createMockSessionInfo("session-3", "C:\\Projects\\test", new Date(), 3000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // session-2 will throw an error
      const errorParser: IEventParser = {
        parse: async function* (filePath: string) {
          if (filePath.includes("session-2")) {
            throw new Error("Parse error");
          }
          for (const event of createSimpleSessionEvents()) {
            yield event;
          }
        },
      };
      (syncService as any).eventParser = errorParser;

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(2); // session-1 and session-3
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].sessionPath).toContain("session-2");
      expect(result.errors[0].error).toBe("Parse error");
      expect(result.success).toBe(false);
    });

    test("tracks multiple errors in result", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      // Both sessions will throw errors
      const errorParser: IEventParser = {
        parse: async function* (filePath: string) {
          if (filePath.includes("session-1")) {
            throw new Error("Error 1");
          }
          if (filePath.includes("session-2")) {
            throw new Error("Error 2");
          }
          yield { type: "skipped", reason: "should not reach" };
        },
      };
      (syncService as any).eventParser = errorParser;

      const result = await syncService.sync();

      expect(result.sessionsProcessed).toBe(0);
      expect(result.errors.length).toBe(2);
      expect(result.success).toBe(false);
    });
  });

  describe("onProgress callback", () => {
    test("calls onProgress for each session", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\test", new Date(), 2000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
        ["/mock/path/session-2.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const progressCalls: SyncProgress[] = [];
      await syncService.sync({
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      // Should have: discovering, session-1 extracting, session-2 extracting, complete
      expect(progressCalls.length).toBeGreaterThanOrEqual(4);

      // First call is discovering
      expect(progressCalls[0].phase).toBe("discovering");

      // Should have extracting calls for each session
      const extractingCalls = progressCalls.filter((p) => p.phase === "extracting");
      expect(extractingCalls.length).toBe(2);
      expect(extractingCalls[0].sessionId).toBe("session-1");
      expect(extractingCalls[0].current).toBe(1);
      expect(extractingCalls[0].total).toBe(2);
      expect(extractingCalls[1].sessionId).toBe("session-2");
      expect(extractingCalls[1].current).toBe(2);
      expect(extractingCalls[1].total).toBe(2);

      // Last call is complete
      expect(progressCalls[progressCalls.length - 1].phase).toBe("complete");
    });

    test("onProgress shows correct total when filtering", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\frontend", new Date(), 1000),
        createMockSessionInfo("session-2", "C:\\Projects\\backend", new Date(), 2000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const eventsMap = new Map([
        ["/mock/path/session-1.jsonl", createSimpleSessionEvents()],
      ]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const progressCalls: SyncProgress[] = [];
      await syncService.sync({
        projectFilter: "frontend",
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      const extractingCalls = progressCalls.filter((p) => p.phase === "extracting");
      expect(extractingCalls.length).toBe(1);
      expect(extractingCalls[0].total).toBe(1); // Only 1 session after filtering
    });
  });

  describe("extraction", () => {
    test("extracts messages and tool uses from events", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const timestamp = new Date().toISOString();
      const eventsWithToolUse: ParsedEvent[] = [
        {
          type: "user",
          data: {
            uuid: "msg-1",
            message: { content: "Run a command" },
            timestamp,
          },
        },
        {
          type: "assistant",
          data: {
            uuid: "msg-2",
            message: {
              content: [
                { type: "text", text: "Running command" },
                { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "ls" } },
              ],
            },
            timestamp,
          },
        },
        {
          type: "tool_result",
          data: {
            uuid: "result-tool-1",
            toolUseId: "tool-1",
            content: "file1.txt\nfile2.txt",
            isError: false,
            timestamp,
          },
        },
      ];

      const eventsMap = new Map([["/mock/path/session-1.jsonl", eventsWithToolUse]]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.messagesInserted).toBe(2);
      expect(result.toolUsesInserted).toBe(1);
    });

    test("handles tool use errors", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const timestamp = new Date().toISOString();
      const eventsWithToolError: ParsedEvent[] = [
        {
          type: "user",
          data: {
            uuid: "msg-1",
            message: { content: "Run a bad command" },
            timestamp,
          },
        },
        {
          type: "assistant",
          data: {
            uuid: "msg-2",
            message: {
              content: [
                { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "bad" } },
              ],
            },
            timestamp,
          },
        },
        {
          type: "tool_result",
          data: {
            uuid: "result-tool-1",
            toolUseId: "tool-1",
            content: "Command not found",
            isError: true,
            timestamp,
          },
        },
      ];

      const eventsMap = new Map([["/mock/path/session-1.jsonl", eventsWithToolError]]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.toolUsesInserted).toBe(1);
      expect(result.success).toBe(true);
    });

    test("skips skipped events", async () => {
      const sessions = [
        createMockSessionInfo("session-1", "C:\\Projects\\test", new Date(), 1000),
      ];
      (sessionSource.discoverSessions as ReturnType<typeof mock>).mockResolvedValue(sessions);

      const timestamp = new Date().toISOString();
      const eventsWithSkipped: ParsedEvent[] = [
        { type: "skipped", reason: "Empty line" },
        {
          type: "user",
          data: {
            uuid: "msg-1",
            message: { content: "Hello" },
            timestamp,
          },
        },
        { type: "skipped", reason: "Malformed JSON" },
      ];

      const eventsMap = new Map([["/mock/path/session-1.jsonl", eventsWithSkipped]]);
      (syncService as any).eventParser = createMockParser(eventsMap);

      const result = await syncService.sync();

      expect(result.messagesInserted).toBe(1);
    });
  });
});
