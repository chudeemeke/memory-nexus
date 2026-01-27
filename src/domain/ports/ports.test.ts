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
  ISearchService,
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
import { ProjectPath } from "../value-objects/project-path.js";
import { SearchQuery } from "../value-objects/search-query.js";
import { SearchResult } from "../value-objects/search-result.js";

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
      const projectPath = ProjectPath.fromDecoded("C:\\Projects\\test");

      const options: SearchOptions = {
        limit: 10,
        projectFilter: projectPath,
        roleFilter: "user",
        sinceDate: new Date("2026-01-01"),
        beforeDate: new Date("2026-12-31"),
      };

      await mockService.search(query, options);

      expect(receivedOptions).toBeDefined();
      expect(receivedOptions!.limit).toBe(10);
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
