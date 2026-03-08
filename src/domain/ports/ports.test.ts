/**
 * Port Interface Tests
 *
 * Verifies that all port interfaces are properly defined and usable.
 * These are structural tests - they verify interface contracts work
 * with mock implementations, not behavioral tests.
 */

import { describe, it, expect } from "bun:test";
import type {
  ISessionRepository,
  IMessageRepository,
  IToolUseRepository,
  ILinkRepository,
  IExtractionStateRepository,
  IMemoryFileRepository,
  IFrictionRepository,
  IBackfillStateRepository,
  BackfillStatusCounts,
  FrictionStats,
  IMemoryFileScanner,
  MemoryFileInfo,
  IEmbeddingProvider,
  DownloadProgress,
  EmbeddingModelInfo,
  ISearchService,
  ISummaryGenerator,
  ISessionSource,
  IEventParser,
  SearchOptions,
  SessionFileInfo,
  ParsedEvent,
  UserEventData,
  AssistantEventData,
  ToolUseEventData,
  ToolResultEventData,
  SummaryEventData,
  SystemEventData,
  ContentBlock,
} from "./index.js";
import { Session } from "../entities/session.js";
import { Message } from "../entities/message.js";
import { ToolUse } from "../entities/tool-use.js";
import { Link } from "../entities/link.js";
import { ExtractionState } from "../entities/extraction-state.js";
import { MemoryFile } from "../entities/memory-file.js";
import type { MemoryFileType } from "../entities/memory-file.js";
import { FrictionEntry } from "../entities/friction-entry.js";
import type { FrictionSeverity, FrictionCategory, FrictionStatus } from "../entities/friction-entry.js";
import { BackfillState } from "../entities/backfill-state.js";
import { ProjectPath } from "../value-objects/project-path.js";
import { SearchQuery } from "../value-objects/search-query.js";
import { SearchResult } from "../value-objects/search-result.js";
import { EmbeddingResult } from "../value-objects/embedding-result.js";

describe("Repository Port Interfaces", () => {
  describe("ISessionRepository", () => {
    it("can be implemented with a mock", async () => {
      const projectPath = ProjectPath.fromDecoded("C:\\Projects\\test");
      const session = Session.create({
        id: "test-session-1",
        projectPath,
        startTime: new Date(),
      });

      const mockRepo: ISessionRepository = {
        findById: async (id: string) => (id === session.id ? session : null),
        findByProject: async () => [session],
        findRecent: async () => [session],
        save: async () => {},
        saveMany: async () => {},
        delete: async () => {},
      };

      const found = await mockRepo.findById("test-session-1");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("test-session-1");

      const byProject = await mockRepo.findByProject(projectPath);
      expect(byProject).toHaveLength(1);

      const recent = await mockRepo.findRecent(10);
      expect(recent).toHaveLength(1);
    });

    it("returns null for non-existent session", async () => {
      const mockRepo: ISessionRepository = {
        findById: async () => null,
        findByProject: async () => [],
        findRecent: async () => [],
        save: async () => {},
        saveMany: async () => {},
        delete: async () => {},
      };

      const found = await mockRepo.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("IMessageRepository", () => {
    it("can be implemented with a mock", async () => {
      const message = Message.create({
        id: "msg-1",
        role: "user",
        content: "Test message",
        timestamp: new Date(),
      });

      const mockRepo: IMessageRepository = {
        findById: async (id: string) => (id === message.id ? message : null),
        findBySession: async () => [message],
        save: async () => {},
        saveMany: async () => {},
      };

      const found = await mockRepo.findById("msg-1");
      expect(found).not.toBeNull();
      expect(found!.content).toBe("Test message");

      const bySession = await mockRepo.findBySession("session-1");
      expect(bySession).toHaveLength(1);
    });

    it("supports bulk save operations", async () => {
      const savedMessages: Array<{ message: Message; sessionId: string }> = [];

      const mockRepo: IMessageRepository = {
        findById: async () => null,
        findBySession: async () => [],
        save: async () => {},
        saveMany: async (messages) => {
          savedMessages.push(...messages);
        },
      };

      const messages = [
        {
          message: Message.create({
            id: "msg-1",
            role: "user" as const,
            content: "First",
            timestamp: new Date(),
          }),
          sessionId: "session-1",
        },
        {
          message: Message.create({
            id: "msg-2",
            role: "assistant" as const,
            content: "Second",
            timestamp: new Date(),
          }),
          sessionId: "session-1",
        },
      ];

      await mockRepo.saveMany(messages);
      expect(savedMessages).toHaveLength(2);
    });
  });

  describe("IToolUseRepository", () => {
    it("can be implemented with a mock", async () => {
      const toolUse = ToolUse.create({
        id: "tool-1",
        name: "Read",
        input: { file_path: "/test.ts" },
        timestamp: new Date(),
      });

      const mockRepo: IToolUseRepository = {
        findById: async (id: string) => (id === toolUse.id ? toolUse : null),
        findBySession: async () => [toolUse],
        save: async () => {},
        saveMany: async () => {},
      };

      const found = await mockRepo.findById("tool-1");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Read");
    });
  });

  describe("ILinkRepository", () => {
    it("can be implemented with a mock", async () => {
      const link = Link.create({
        sourceType: "message",
        sourceId: "msg-1",
        targetType: "session",
        targetId: "session-1",
        relationship: "mentions",
      });

      const mockRepo: ILinkRepository = {
        findBySource: async () => [link],
        findByTarget: async () => [link],
        findRelated: async () => [link],
        save: async () => {},
        saveMany: async () => {},
      };

      const bySource = await mockRepo.findBySource("message", "msg-1");
      expect(bySource).toHaveLength(1);

      const byTarget = await mockRepo.findByTarget("session", "session-1");
      expect(byTarget).toHaveLength(1);

      const related = await mockRepo.findRelated("message", "msg-1", 2);
      expect(related).toHaveLength(1);
    });
  });

  describe("IExtractionStateRepository", () => {
    it("can be implemented with a mock", async () => {
      const state = ExtractionState.create({
        id: "extract-1",
        sessionPath: "/path/to/session.jsonl",
        startedAt: new Date(),
        status: "pending",
      });

      const mockRepo: IExtractionStateRepository = {
        findById: async (id: string) => (id === state.id ? state : null),
        findBySessionPath: async (path: string) =>
          path === state.sessionPath ? state : null,
        findPending: async () => [state],
        save: async () => {},
      };

      const found = await mockRepo.findById("extract-1");
      expect(found).not.toBeNull();

      const byPath = await mockRepo.findBySessionPath("/path/to/session.jsonl");
      expect(byPath).not.toBeNull();

      const pending = await mockRepo.findPending();
      expect(pending).toHaveLength(1);
    });
  });

  describe("IMemoryFileRepository", () => {
    it("can be implemented with a mock", async () => {
      const memoryFile = MemoryFile.create({
        id: 1,
        filePath: "daily/2026-03-07.md",
        fileType: "daily_log",
        content: "# 2026-03-07\n\nSession notes",
        contentHash: "a".repeat(64),
        lastIndexedAt: new Date(),
      });

      const store: MemoryFile[] = [memoryFile];

      const mockRepo: IMemoryFileRepository = {
        findByPath: async (filePath: string) =>
          store.find((f) => f.filePath === filePath) ?? null,
        findByType: async (fileType: MemoryFileType) =>
          store.filter((f) => f.fileType === fileType),
        findByProject: async (projectEncoded: string) =>
          store.filter((f) => f.projectEncoded === projectEncoded),
        save: async (file: MemoryFile) => {
          store.push(file);
        },
        saveMany: async (files: MemoryFile[]) => {
          store.push(...files);
        },
        searchContent: async (_query: string, _limit?: number) =>
          store,
      };

      const found = await mockRepo.findByPath("daily/2026-03-07.md");
      expect(found).not.toBeNull();
      expect(found!.filePath).toBe("daily/2026-03-07.md");
      expect(found!.fileType).toBe("daily_log");

      const byType = await mockRepo.findByType("daily_log");
      expect(byType).toHaveLength(1);

      const byProject = await mockRepo.findByProject("nonexistent");
      expect(byProject).toHaveLength(0);

      const searchResults = await mockRepo.searchContent("session", 10);
      expect(searchResults).toHaveLength(1);
    });

    it("mock flow: save then findByPath returns it", async () => {
      const store: MemoryFile[] = [];

      const mockRepo: IMemoryFileRepository = {
        findByPath: async (filePath: string) =>
          store.find((f) => f.filePath === filePath) ?? null,
        findByType: async (fileType: MemoryFileType) =>
          store.filter((f) => f.fileType === fileType),
        findByProject: async (projectEncoded: string) =>
          store.filter((f) => f.projectEncoded === projectEncoded),
        save: async (file: MemoryFile) => {
          store.push(file);
        },
        saveMany: async (files: MemoryFile[]) => {
          store.push(...files);
        },
        searchContent: async () => store,
      };

      // Initially empty
      const notFound = await mockRepo.findByPath("daily/2026-03-07.md");
      expect(notFound).toBeNull();

      // Save a file
      const file = MemoryFile.create({
        filePath: "daily/2026-03-07.md",
        fileType: "daily_log",
        content: "# Daily log content",
        contentHash: "b".repeat(64),
        lastIndexedAt: new Date(),
      });
      await mockRepo.save(file);

      // Now findable
      const found = await mockRepo.findByPath("daily/2026-03-07.md");
      expect(found).not.toBeNull();
      expect(found!.content).toBe("# Daily log content");
    });

    it("returns null for non-existent path", async () => {
      const mockRepo: IMemoryFileRepository = {
        findByPath: async () => null,
        findByType: async () => [],
        findByProject: async () => [],
        save: async () => {},
        saveMany: async () => {},
        searchContent: async () => [],
      };

      const found = await mockRepo.findByPath("nonexistent.md");
      expect(found).toBeNull();
    });
  });

  describe("IFrictionRepository", () => {
    it("can be implemented with a mock", async () => {
      const entry = FrictionEntry.create({
        id: 1,
        description: "Search fails on hyphens",
        severity: "high",
        category: "search",
        status: "open",
        loggedAt: new Date("2026-03-08T10:00:00Z"),
      });

      const store: FrictionEntry[] = [entry];

      const mockRepo: IFrictionRepository = {
        save: async (e: FrictionEntry) => {
          store.push(e);
          return FrictionEntry.create({
            id: store.length,
            description: e.description,
            severity: e.severity,
            category: e.category,
            status: e.status,
            loggedAt: e.loggedAt,
          });
        },
        findById: async (id: number) =>
          store.find((e) => e.id === id) ?? null,
        findOpen: async () =>
          store.filter((e) => e.status === "open"),
        findAll: async () => store,
        resolve: async () => {},
        updateStatus: async () => {},
        getStats: async () => ({
          total: store.length,
          open: store.filter((e) => e.status === "open").length,
          resolved: 0,
          wontFix: 0,
          bySeverity: { low: 0, medium: 0, high: 1, critical: 0 },
          byCategory: { search: 1, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
          meanTimeToResolve: null,
          oldestOpen: { id: 1, description: "Search fails on hyphens", daysOpen: 5 },
        }),
        getWeeklyTrends: async () => [
          { week: "2026-W10", newCount: 1, resolvedCount: 0 },
        ],
      };

      const found = await mockRepo.findById(1);
      expect(found).not.toBeNull();
      expect(found!.description).toBe("Search fails on hyphens");

      const open = await mockRepo.findOpen();
      expect(open).toHaveLength(1);

      const all = await mockRepo.findAll();
      expect(all).toHaveLength(1);

      const stats = await mockRepo.getStats();
      expect(stats.total).toBe(1);
      expect(stats.open).toBe(1);
      expect(stats.bySeverity.high).toBe(1);

      const trends = await mockRepo.getWeeklyTrends(4);
      expect(trends).toHaveLength(1);
      expect(trends[0].newCount).toBe(1);
    });

    it("FrictionStats interface shape is correct", () => {
      const stats: FrictionStats = {
        total: 10,
        open: 3,
        resolved: 5,
        wontFix: 2,
        bySeverity: { low: 2, medium: 3, high: 4, critical: 1 },
        byCategory: { search: 2, sync: 1, cli: 3, context: 1, integration: 2, ux: 1 },
        meanTimeToResolve: 3.5,
        oldestOpen: { id: 42, description: "Old issue", daysOpen: 14 },
      };

      expect(stats.total).toBe(10);
      expect(stats.open).toBe(3);
      expect(stats.resolved).toBe(5);
      expect(stats.wontFix).toBe(2);
      expect(stats.bySeverity.low).toBe(2);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.byCategory.search).toBe(2);
      expect(stats.byCategory.ux).toBe(1);
      expect(stats.meanTimeToResolve).toBe(3.5);
      expect(stats.oldestOpen!.id).toBe(42);
      expect(stats.oldestOpen!.daysOpen).toBe(14);
    });

    it("FrictionStats handles null meanTimeToResolve and oldestOpen", () => {
      const emptyStats: FrictionStats = {
        total: 0,
        open: 0,
        resolved: 0,
        wontFix: 0,
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        byCategory: { search: 0, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
        meanTimeToResolve: null,
        oldestOpen: null,
      };

      expect(emptyStats.meanTimeToResolve).toBeNull();
      expect(emptyStats.oldestOpen).toBeNull();
    });
  });
});

describe("Memory File Scanner Port Interface", () => {
  describe("IMemoryFileScanner", () => {
    it("can be implemented with a mock", async () => {
      const mockInfo: MemoryFileInfo[] = [
        {
          filePath: "daily/2026-03-07.md",
          absolutePath: "/home/user/.memory/daily/2026-03-07.md",
          fileType: "daily_log",
          contentHash: "a".repeat(64),
          content: "# 2026-03-07\n\nSession notes",
        },
        {
          filePath: "projects/test-project/DECISIONS.md",
          absolutePath: "/home/user/.memory/projects/test-project/DECISIONS.md",
          fileType: "decisions",
          projectEncoded: "test-project",
          contentHash: "b".repeat(64),
          content: "# Decisions\n\nUsed Redis",
        },
      ];

      const mockScanner: IMemoryFileScanner = {
        discoverFiles: async () => mockInfo,
      };

      const files = await mockScanner.discoverFiles();
      expect(files).toHaveLength(2);
      expect(files[0].filePath).toBe("daily/2026-03-07.md");
      expect(files[0].fileType).toBe("daily_log");
      expect(files[0].absolutePath).toContain(".memory");
      expect(files[0].projectEncoded).toBeUndefined();
      expect(files[1].projectEncoded).toBe("test-project");
    });

    it("returns empty array when no files exist", async () => {
      const mockScanner: IMemoryFileScanner = {
        discoverFiles: async () => [],
      };

      const files = await mockScanner.discoverFiles();
      expect(files).toHaveLength(0);
    });

    it("MemoryFileInfo has all required fields", () => {
      const info: MemoryFileInfo = {
        filePath: "daily/2026-03-07.md",
        absolutePath: "/home/user/.memory/daily/2026-03-07.md",
        fileType: "daily_log",
        contentHash: "c".repeat(64),
        content: "file content here",
      };

      expect(info.filePath).toBe("daily/2026-03-07.md");
      expect(info.absolutePath).toContain(".memory");
      expect(info.fileType).toBe("daily_log");
      expect(info.contentHash).toBe("c".repeat(64));
      expect(info.content).toBe("file content here");
      expect(info.projectEncoded).toBeUndefined();
    });
  });
});

describe("Service Port Interfaces", () => {
  describe("ISearchService", () => {
    it("can be implemented with a mock", async () => {
      const result = SearchResult.create({
        sessionId: "session-1",
        messageId: "msg-1",
        snippet: "matching text",
        score: 0.95,
        timestamp: new Date(),
        role: "user",
      });

      const mockService: ISearchService = {
        search: async () => [result],
      };

      const query = SearchQuery.from("test query");
      const results = await mockService.search(query);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
    });

    it("supports search options", async () => {
      let receivedOptions: SearchOptions | undefined;

      const mockService: ISearchService = {
        search: async (_query, options) => {
          receivedOptions = options;
          return [];
        },
      };

      const query = SearchQuery.from("test");

      const options: SearchOptions = {
        limit: 10,
        projectFilter: "test-project",
        roleFilter: "user",
        sinceDate: new Date("2026-01-01"),
        beforeDate: new Date("2026-12-31"),
      };

      await mockService.search(query, options);

      expect(receivedOptions).toBeDefined();
      expect(receivedOptions!.limit).toBe(10);
      expect(receivedOptions!.projectFilter).toBe("test-project");
      expect(receivedOptions!.roleFilter).toBe("user");
    });

    it("SearchOptions has all optional properties", () => {
      // Verify that an empty SearchOptions is valid
      const emptyOptions: SearchOptions = {};
      expect(emptyOptions.limit).toBeUndefined();
      expect(emptyOptions.projectFilter).toBeUndefined();
      expect(emptyOptions.roleFilter).toBeUndefined();
      expect(emptyOptions.sinceDate).toBeUndefined();
      expect(emptyOptions.beforeDate).toBeUndefined();
    });
  });
});

describe("Embedding Provider Port Interface", () => {
  describe("IEmbeddingProvider", () => {
    it("can be implemented with a mock", async () => {
      const mockProvider: IEmbeddingProvider = {
        name: "mock",
        dimensions: 384,
        model: "test-model",
        embed: async () =>
          EmbeddingResult.create({
            embedding: new Float32Array(384).fill(0.1),
            model: "test-model",
            dimensions: 384,
          }),
        embedBatch: async (texts) =>
          texts.map(() =>
            EmbeddingResult.create({
              embedding: new Float32Array(384).fill(0.1),
              model: "test-model",
              dimensions: 384,
            }),
          ),
        isReady: () => true,
        initialize: async () => {},
        dispose: async () => {},
      };

      expect(mockProvider.name).toBe("mock");
      expect(mockProvider.dimensions).toBe(384);
      expect(mockProvider.model).toBe("test-model");
      expect(mockProvider.isReady()).toBe(true);

      const result = await mockProvider.embed("test");
      expect(result.dimensions).toBe(384);

      const batch = await mockProvider.embedBatch(["a", "b"]);
      expect(batch).toHaveLength(2);
    });

    it("types are exported from ports index", () => {
      // This test verifies the types compile correctly
      // by using them in type positions
      const progress: DownloadProgress = {
        status: "downloading",
        file: "model.onnx",
        loaded: 1000,
        total: 23_000_000,
      };
      expect(progress.status).toBe("downloading");

      const info: EmbeddingModelInfo = {
        name: "test",
        dimensions: 384,
        sizeBytes: 23_000_000,
      };
      expect(info.name).toBe("test");
    });
  });
});

describe("Source Port Interfaces", () => {
  describe("ISessionSource", () => {
    it("can be implemented with a mock", async () => {
      const projectPath = ProjectPath.fromDecoded("C:\\Projects\\test");
      const sessionInfo: SessionFileInfo = {
        id: "session-1",
        path: "/path/to/session-1.jsonl",
        projectPath,
        modifiedTime: new Date(),
        size: 1024,
      };

      const mockSource: ISessionSource = {
        discoverSessions: async () => [sessionInfo],
        getSessionFile: async (id: string) =>
          id === "session-1" ? sessionInfo.path : null,
      };

      const sessions = await mockSource.discoverSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("session-1");
      expect(sessions[0].projectPath.decoded).toBe("C:\\Projects\\test");

      const filePath = await mockSource.getSessionFile("session-1");
      expect(filePath).toBe("/path/to/session-1.jsonl");

      const notFound = await mockSource.getSessionFile("non-existent");
      expect(notFound).toBeNull();
    });

    it("SessionFileInfo has required projectPath property", () => {
      const projectPath = ProjectPath.fromDecoded("/home/user/project");
      const info: SessionFileInfo = {
        id: "test",
        path: "/path/to/file.jsonl",
        projectPath,
        modifiedTime: new Date(),
        size: 500,
      };

      expect(info.projectPath).toBeDefined();
      expect(info.projectPath.projectName).toBe("project");
    });
  });

  describe("IEventParser", () => {
    it("can be implemented with async generator", async () => {
      const events: ParsedEvent[] = [
        {
          type: "user",
          data: {
            uuid: "event-1",
            message: { content: "Hello" },
            timestamp: new Date().toISOString(),
          },
        },
        {
          type: "assistant",
          data: {
            uuid: "event-2",
            message: {
              content: [{ type: "text", text: "Hi there!" }],
            },
            timestamp: new Date().toISOString(),
          },
        },
        {
          type: "skipped",
          reason: "progress event",
        },
      ];

      const mockParser: IEventParser = {
        async *parse(_filePath: string): AsyncIterable<ParsedEvent> {
          for (const event of events) {
            yield event;
          }
        },
      };

      const parsedEvents: ParsedEvent[] = [];
      for await (const event of mockParser.parse("/test.jsonl")) {
        parsedEvents.push(event);
      }

      expect(parsedEvents).toHaveLength(3);
    });
  });
});

describe("ParsedEvent Discriminated Union", () => {
  it("enables type narrowing with switch/case", () => {
    const processEvent = (event: ParsedEvent): string => {
      switch (event.type) {
        case "user":
          // TypeScript knows event.data is UserEventData
          return `User: ${event.data.message.content}`;
        case "assistant":
          // TypeScript knows event.data is AssistantEventData
          return `Assistant: ${event.data.message.content.length} blocks`;
        case "tool_use":
          // TypeScript knows event.data is ToolUseEventData
          return `Tool: ${event.data.name}`;
        case "tool_result":
          // TypeScript knows event.data is ToolResultEventData
          return `Result: ${event.data.isError ? "error" : "success"}`;
        case "summary":
          // TypeScript knows event.data is SummaryEventData
          return `Summary: ${event.data.content.substring(0, 20)}...`;
        case "system":
          // TypeScript knows event.data is SystemEventData
          return `System: ${event.data.subtype}`;
        case "skipped":
          // TypeScript knows event has reason
          return `Skipped: ${event.reason}`;
      }
    };

    const userEvent: ParsedEvent = {
      type: "user",
      data: {
        uuid: "1",
        message: { content: "Hello" },
        timestamp: new Date().toISOString(),
      },
    };

    const toolUseEvent: ParsedEvent = {
      type: "tool_use",
      data: {
        uuid: "2",
        name: "Read",
        input: { file_path: "/test.ts" },
        timestamp: new Date().toISOString(),
      },
    };

    const skippedEvent: ParsedEvent = {
      type: "skipped",
      reason: "progress event",
    };

    expect(processEvent(userEvent)).toBe("User: Hello");
    expect(processEvent(toolUseEvent)).toBe("Tool: Read");
    expect(processEvent(skippedEvent)).toBe("Skipped: progress event");
  });

  it("supports all event types", () => {
    const timestamp = new Date().toISOString();

    const userEvent: ParsedEvent = {
      type: "user",
      data: {
        uuid: "1",
        message: { content: "test" },
        timestamp,
      },
    };

    const assistantEvent: ParsedEvent = {
      type: "assistant",
      data: {
        uuid: "2",
        message: { content: [{ type: "text", text: "response" }] },
        timestamp,
      },
    };

    const toolUseEvent: ParsedEvent = {
      type: "tool_use",
      data: {
        uuid: "3",
        name: "Bash",
        input: { command: "ls" },
        timestamp,
      },
    };

    const toolResultEvent: ParsedEvent = {
      type: "tool_result",
      data: {
        uuid: "4",
        toolUseId: "3",
        content: "file1.ts\nfile2.ts",
        isError: false,
        timestamp,
      },
    };

    const summaryEvent: ParsedEvent = {
      type: "summary",
      data: {
        content: "Session summary...",
        timestamp,
      },
    };

    const systemEvent: ParsedEvent = {
      type: "system",
      data: {
        subtype: "turn_duration",
        data: { durationMs: 5000 },
        timestamp,
      },
    };

    const skippedEvent: ParsedEvent = {
      type: "skipped",
      reason: "binary content",
    };

    const allEvents: ParsedEvent[] = [
      userEvent,
      assistantEvent,
      toolUseEvent,
      toolResultEvent,
      summaryEvent,
      systemEvent,
      skippedEvent,
    ];

    expect(allEvents).toHaveLength(7);
  });
});

describe("ContentBlock Type", () => {
  it("supports text blocks", () => {
    const textBlock: ContentBlock = {
      type: "text",
      text: "Hello world",
    };

    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toBe("Hello world");
  });

  it("supports tool_use blocks", () => {
    const toolBlock: ContentBlock = {
      type: "tool_use",
      id: "toolu_123",
      name: "Read",
      input: { file_path: "/test.ts" },
    };

    expect(toolBlock.type).toBe("tool_use");
    expect(toolBlock.name).toBe("Read");
  });

  it("can be used in assistant message content", () => {
    const assistantData: AssistantEventData = {
      uuid: "test",
      message: {
        content: [
          { type: "text", text: "Let me read that file." },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "Read",
            input: { file_path: "/test.ts" },
          },
        ],
        model: "claude-opus-4-5-20251101",
      },
      timestamp: new Date().toISOString(),
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    };

    expect(assistantData.message.content).toHaveLength(2);
    expect(assistantData.message.content[0].type).toBe("text");
    expect(assistantData.message.content[1].type).toBe("tool_use");
  });
});

describe("Event Data Interfaces", () => {
  it("UserEventData has optional fields", () => {
    const minimal: UserEventData = {
      uuid: "1",
      message: { content: "test" },
      timestamp: new Date().toISOString(),
    };

    const full: UserEventData = {
      uuid: "2",
      message: { content: "test" },
      timestamp: new Date().toISOString(),
      cwd: "C:\\Projects\\test",
      gitBranch: "main",
    };

    expect(minimal.cwd).toBeUndefined();
    expect(full.cwd).toBe("C:\\Projects\\test");
    expect(full.gitBranch).toBe("main");
  });

  it("AssistantEventData has optional usage", () => {
    const withoutUsage: AssistantEventData = {
      uuid: "1",
      message: {
        content: [{ type: "text", text: "response" }],
      },
      timestamp: new Date().toISOString(),
    };

    const withUsage: AssistantEventData = {
      uuid: "2",
      message: {
        content: [{ type: "text", text: "response" }],
        model: "claude-opus-4-5-20251101",
      },
      timestamp: new Date().toISOString(),
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    };

    expect(withoutUsage.usage).toBeUndefined();
    expect(withUsage.usage!.inputTokens).toBe(100);
  });

  it("SummaryEventData has optional leafUuid", () => {
    const minimal: SummaryEventData = {
      content: "Summary content",
      timestamp: new Date().toISOString(),
    };

    const withLeaf: SummaryEventData = {
      content: "Summary content",
      timestamp: new Date().toISOString(),
      leafUuid: "last-event-uuid",
    };

    expect(minimal.leafUuid).toBeUndefined();
    expect(withLeaf.leafUuid).toBe("last-event-uuid");
  });
});

describe("IBackfillStateRepository", () => {
    it("can be implemented with a mock", async () => {
        const state = BackfillState.create({
            sessionId: "abc-123",
            backfilledAt: new Date("2026-03-08T10:00:00Z"),
            dailyLogPath: "daily/2026-03-08.md",
            success: true,
        });

        const store: BackfillState[] = [];

        const mockRepo: IBackfillStateRepository = {
            findBySessionId: async (sessionId: string) =>
                store.find((s) => s.sessionId === sessionId) ?? null,
            findAll: async () => [...store],
            save: async (s: BackfillState) => {
                const idx = store.findIndex((x) => x.sessionId === s.sessionId);
                if (idx >= 0) {
                    store[idx] = s;
                } else {
                    store.push(s);
                }
            },
            countByStatus: async () => ({
                total: store.length,
                succeeded: store.filter((s) => s.success).length,
                failed: store.filter((s) => !s.success).length,
            }),
        };

        // findBySessionId returns null before save
        const notFound = await mockRepo.findBySessionId("abc-123");
        expect(notFound).toBeNull();

        // findAll returns empty array
        const empty = await mockRepo.findAll();
        expect(empty).toHaveLength(0);

        // save then findBySessionId returns it
        await mockRepo.save(state);
        const found = await mockRepo.findBySessionId("abc-123");
        expect(found).not.toBeNull();
        expect(found!.sessionId).toBe("abc-123");
        expect(found!.dailyLogPath).toBe("daily/2026-03-08.md");
        expect(found!.success).toBe(true);

        // findAll returns the saved state
        const all = await mockRepo.findAll();
        expect(all).toHaveLength(1);
    });

    it("mock countByStatus returns correct structure", async () => {
        const store: BackfillState[] = [];

        const mockRepo: IBackfillStateRepository = {
            findBySessionId: async () => null,
            findAll: async () => [...store],
            save: async (s: BackfillState) => { store.push(s); },
            countByStatus: async () => ({
                total: store.length,
                succeeded: store.filter((s) => s.success).length,
                failed: store.filter((s) => !s.success).length,
            }),
        };

        // Empty counts
        const emptyCounts = await mockRepo.countByStatus();
        expect(emptyCounts.total).toBe(0);
        expect(emptyCounts.succeeded).toBe(0);
        expect(emptyCounts.failed).toBe(0);

        // Add some states
        await mockRepo.save(BackfillState.create({
            sessionId: "s1",
            backfilledAt: new Date(),
            dailyLogPath: "daily/2026-03-08.md",
            success: true,
        }));
        await mockRepo.save(BackfillState.create({
            sessionId: "s2",
            backfilledAt: new Date(),
            dailyLogPath: "daily/2026-03-08.md",
            success: false,
            errorMessage: "timeout",
        }));

        const counts: BackfillStatusCounts = await mockRepo.countByStatus();
        expect(counts.total).toBe(2);
        expect(counts.succeeded).toBe(1);
        expect(counts.failed).toBe(1);
    });

    it("returns null for non-existent session", async () => {
        const mockRepo: IBackfillStateRepository = {
            findBySessionId: async () => null,
            findAll: async () => [],
            save: async () => {},
            countByStatus: async () => ({ total: 0, succeeded: 0, failed: 0 }),
        };

        const found = await mockRepo.findBySessionId("nonexistent");
        expect(found).toBeNull();
    });
});

describe("ISummaryGenerator", () => {
  it("can be implemented with a mock", async () => {
    const mockGenerator: ISummaryGenerator = {
      generateSummary: async (
        content: string,
        sessionId: string,
        projectName: string,
        startTime: string,
        endTime: string,
      ) => {
        return `## Session: ${sessionId}\n**Project:** ${projectName}\n### Topic\nSummary of content`;
      },
    };

    const result = await mockGenerator.generateSummary(
      "User: hello\n\nAssistant: hi",
      "session-123",
      "kanbanflow",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    expect(result).toContain("session-123");
    expect(result).toContain("kanbanflow");
    expect(result).toContain("Topic");
  });

  it("returns a Promise<string>", async () => {
    const mockGenerator: ISummaryGenerator = {
      generateSummary: async () => "summary text",
    };

    const result = await mockGenerator.generateSummary(
      "content",
      "s1",
      "proj",
      "2026-03-08T10:00:00Z",
      "2026-03-08T11:00:00Z",
    );

    expect(typeof result).toBe("string");
  });
});
