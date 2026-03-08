/**
 * BackfillService Tests
 *
 * Tests for the application service that orchestrates session backfilling:
 * querying unprocessed sessions, extracting content, generating summaries,
 * writing daily log files, and tracking backfill state.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Session } from "../../domain/entities/session.js";
import { Message } from "../../domain/entities/message.js";
import { BackfillState } from "../../domain/entities/backfill-state.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";
import type { ISessionRepository, SessionListOptions } from "../../domain/ports/repositories.js";
import type { IMessageRepository } from "../../domain/ports/repositories.js";
import type { IBackfillStateRepository } from "../../domain/ports/repositories.js";
import type { ISummaryGenerator } from "../../domain/ports/index.js";
import {
  BackfillService,
  type IDailyLogWriter,
  type BackfillProgress,
} from "./backfill-service.js";

// --- Mock Helpers ---

function createMockSession(
  id: string,
  projectDecoded: string,
  startTime: Date,
  endTime?: Date,
): Session {
  return Session.create({
    id,
    projectPath: ProjectPath.fromDecoded(projectDecoded),
    startTime,
    endTime,
  });
}

function createMockMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
): Message {
  return Message.create({
    id,
    role,
    content,
    timestamp: new Date("2026-03-08T10:00:00Z"),
  });
}

interface MockRepos {
  sessionRepo: ISessionRepository;
  messageRepo: IMessageRepository;
  backfillStateRepo: IBackfillStateRepository;
  summaryGenerator: ISummaryGenerator;
  dailyLogWriter: IDailyLogWriter;
}

function createMocks(overrides: {
  sessions?: Session[];
  messages?: Map<string, Message[]>;
  backfillStates?: Map<string, BackfillState>;
  summaryFn?: (content: string, sessionId: string) => Promise<string>;
  writerFiles?: Map<string, string[]>;
} = {}): MockRepos {
  const sessions = overrides.sessions ?? [];
  const messages = overrides.messages ?? new Map<string, Message[]>();
  const backfillStates = overrides.backfillStates ?? new Map<string, BackfillState>();
  const writerFiles = overrides.writerFiles ?? new Map<string, string[]>();

  const sessionRepo: ISessionRepository = {
    findById: async () => null,
    findByProject: async () => [],
    findRecent: async () => [],
    save: async () => {},
    saveMany: async () => {},
    delete: async () => {},
    findFiltered: async (options: SessionListOptions) => {
      let result = [...sessions];
      if (options.projectFilter) {
        result = result.filter((s) =>
          s.projectPath.decoded.toLowerCase().includes(options.projectFilter!.toLowerCase()),
        );
      }
      if (options.limit) {
        result = result.slice(0, options.limit);
      }
      return result;
    },
    updateProjectName: async () => 0,
    findDistinctEncodedPaths: async () => [],
  };

  const messageRepo: IMessageRepository = {
    findById: async () => null,
    findBySession: async (sessionId: string) => messages.get(sessionId) ?? [],
    save: async () => {},
    saveMany: async () => {},
  };

  const backfillStateRepo: IBackfillStateRepository = {
    findBySessionId: async (sessionId: string) =>
      backfillStates.get(sessionId) ?? null,
    findAll: async () => [...backfillStates.values()],
    save: async (state: BackfillState) => {
      backfillStates.set(state.sessionId, state);
    },
    countByStatus: async () => ({
      total: backfillStates.size,
      succeeded: [...backfillStates.values()].filter((s) => s.success).length,
      failed: [...backfillStates.values()].filter((s) => !s.success).length,
    }),
  };

  const summaryGenerator: ISummaryGenerator = {
    generateSummary: overrides.summaryFn ??
      (async (_content: string, sessionId: string) =>
        `## Session: ${sessionId}\n### Topic\nGenerated summary`),
  };

  const dailyLogWriter: IDailyLogWriter = {
    writeOrAppend: async (datePath: string, content: string) => {
      const existing = writerFiles.get(datePath);
      if (existing) {
        existing.push(content);
        return false;
      }
      writerFiles.set(datePath, [content]);
      return true;
    },
  };

  return { sessionRepo, messageRepo, backfillStateRepo, summaryGenerator, dailyLogWriter };
}

describe("BackfillService", () => {
  describe("dryRun", () => {
    it("returns count of unprocessed sessions and estimated cost", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z")),
      ];

      const backfillStates = new Map<string, BackfillState>();
      backfillStates.set(
        "s1",
        BackfillState.create({
          sessionId: "s1",
          backfilledAt: new Date(),
          dailyLogPath: "daily/2026-03-08.md",
          success: true,
        }),
      );

      const mocks = createMocks({ sessions, backfillStates });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.dryRun();
      expect(result.unprocessedCount).toBe(2);
      expect(result.estimatedCost).toBeCloseTo(0.002, 5);
    });

    it("respects project filter", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z")),
        createMockSession("s2", "C:\\Projects\\memory-nexus", new Date("2026-03-08T11:00:00Z")),
        createMockSession("s3", "C:\\Projects\\kanbanflow", new Date("2026-03-08T12:00:00Z")),
      ];

      const mocks = createMocks({ sessions });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.dryRun({ project: "kanbanflow" });
      expect(result.unprocessedCount).toBe(2);
    });

    it("returns zero when all sessions are processed", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
      ];
      const backfillStates = new Map<string, BackfillState>();
      backfillStates.set(
        "s1",
        BackfillState.create({
          sessionId: "s1",
          backfilledAt: new Date(),
          dailyLogPath: "daily/2026-03-08.md",
          success: true,
        }),
      );

      const mocks = createMocks({ sessions, backfillStates });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.dryRun();
      expect(result.unprocessedCount).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe("backfill", () => {
    it("processes unprocessed sessions", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [
          createMockMessage(`${s.id}-m1`, "user", "Hello"),
          createMockMessage(`${s.id}-m2`, "assistant", "Hi there"),
        ]);
      }

      let generateCount = 0;
      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async () => {
          generateCount++;
          return "## Summary";
        },
      });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill();
      expect(result.sessionsProcessed).toBe(3);
      expect(result.sessionsFailed).toBe(0);
      expect(generateCount).toBe(3);
    });

    it("extracts user and assistant message content", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      messages.set("s1", [
        createMockMessage("m1", "user", "What is Bun?"),
        createMockMessage("m2", "assistant", "Bun is a JavaScript runtime."),
        createMockMessage("m3", "user", "Thanks!"),
      ]);

      let capturedContent = "";
      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async (content: string) => {
          capturedContent = content;
          return "## Summary";
        },
      });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();
      expect(capturedContent).toContain("What is Bun?");
      expect(capturedContent).toContain("Bun is a JavaScript runtime.");
      expect(capturedContent).toContain("Thanks!");
    });

    it("truncates content at ~16000 characters", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      // Create messages totaling ~30000 characters
      const messages = new Map<string, Message[]>();
      const msgs: Message[] = [];
      for (let i = 0; i < 30; i++) {
        msgs.push(
          createMockMessage(`m${i}`, i % 2 === 0 ? "user" : "assistant", "x".repeat(1000)),
        );
      }
      messages.set("s1", msgs);

      let capturedContent = "";
      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async (content: string) => {
          capturedContent = content;
          return "## Summary";
        },
      });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();
      expect(capturedContent.length).toBeLessThanOrEqual(16100); // Allow small overflow for truncation notice
      expect(capturedContent).toContain("... [content truncated]");
    });

    it("limits processing to batch size", async () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(
          createMockSession(`s${i}`, "C:\\Projects\\proj1", new Date(`2026-03-0${i + 1}T10:00:00Z`), new Date(`2026-03-0${i + 1}T11:00:00Z`)),
        );
      }

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const mocks = createMocks({ sessions, messages });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill({ batch: 2 });
      expect(result.sessionsProcessed).toBe(2);
    });

    it("filters by project", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\memory-nexus", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
        createMockSession("s3", "C:\\Projects\\kanbanflow", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const mocks = createMocks({ sessions, messages });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill({ project: "kanbanflow" });
      expect(result.sessionsProcessed).toBe(2);
    });

    it("skips already-processed sessions (idempotency)", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
      ];

      const backfillStates = new Map<string, BackfillState>();
      backfillStates.set(
        "s1",
        BackfillState.create({
          sessionId: "s1",
          backfilledAt: new Date(),
          dailyLogPath: "daily/2026-03-08.md",
          success: true,
        }),
      );

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const mocks = createMocks({ sessions, backfillStates, messages });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill();
      expect(result.sessionsProcessed).toBe(2);
    });

    it("isolates errors: one session failure does not block others", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async (_content: string, sessionId: string) => {
          if (sessionId === "s2") {
            throw new Error("API rate limit exceeded");
          }
          return "## Summary";
        },
      });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill();
      expect(result.sessionsProcessed).toBe(2);
      expect(result.sessionsFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].sessionId).toBe("s2");
      expect(result.errors[0].error).toContain("rate limit");
    });

    it("writes daily log file to correct path based on session date", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      messages.set("s1", [createMockMessage("m1", "user", "Hello")]);

      const writerFiles = new Map<string, string[]>();
      const mocks = createMocks({ sessions, messages, writerFiles });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();

      expect(writerFiles.has("daily/2026-03-08.md")).toBe(true);
      const content = writerFiles.get("daily/2026-03-08.md")![0];
      expect(content).toContain("Session: s1");
    });

    it("appends to same daily log for sessions on same date", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T14:00:00Z"), new Date("2026-03-08T14:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const writerFiles = new Map<string, string[]>();
      const mocks = createMocks({ sessions, messages, writerFiles });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();

      expect(writerFiles.has("daily/2026-03-08.md")).toBe(true);
      const entries = writerFiles.get("daily/2026-03-08.md")!;
      expect(entries.length).toBe(2);
    });

    it("calls progress callback for each session", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T12:00:00Z"), new Date("2026-03-08T12:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const progressCalls: BackfillProgress[] = [];
      const mocks = createMocks({ sessions, messages });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill({
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      expect(progressCalls.length).toBe(3);
      expect(progressCalls[0].current).toBe(1);
      expect(progressCalls[0].total).toBe(3);
      expect(progressCalls[0].action).toBe("processing");
      expect(progressCalls[2].current).toBe(3);
    });

    it("reports skipped for sessions processed between query and loop", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-08T11:00:00Z"), new Date("2026-03-08T11:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      // s2 gets "processed" before the loop checks it
      const backfillStates = new Map<string, BackfillState>();

      const mocks = createMocks({ sessions, messages, backfillStates });

      // Override the backfill state repo to simulate race condition
      let firstCall = true;
      const originalFindBySessionId = mocks.backfillStateRepo.findBySessionId;
      mocks.backfillStateRepo.findBySessionId = async (sessionId: string) => {
        // On second call for s2 during loop double-check, return a state
        if (sessionId === "s2" && !firstCall) {
          return BackfillState.create({
            sessionId: "s2",
            backfilledAt: new Date(),
            dailyLogPath: "daily/2026-03-08.md",
            success: true,
          });
        }
        if (sessionId === "s2") firstCall = false;
        return originalFindBySessionId(sessionId);
      };

      const progressCalls: BackfillProgress[] = [];
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill({
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      expect(result.sessionsSkipped).toBe(1);
      expect(result.sessionsProcessed).toBe(1);

      const skippedProgress = progressCalls.find((p) => p.action === "skipped");
      expect(skippedProgress).toBeDefined();
      expect(skippedProgress!.sessionId).toBe("s2");
    });

    it("extracts project name from session.projectPath.decoded", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Users\\Destiny\\Projects\\kanbanflow", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      messages.set("s1", [createMockMessage("m1", "user", "Hello")]);

      let capturedProjectName = "";
      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async (_content: string, _sessionId: string, projectName?: string) => {
          // The summaryFn signature in ISummaryGenerator has 5 params, but our mock
          // captures what's passed via the mock overrides
          return `## Summary for ${projectName}`;
        },
      });

      // Override to capture project name
      const origGenerate = mocks.summaryGenerator.generateSummary;
      mocks.summaryGenerator.generateSummary = async (
        content: string,
        sessionId: string,
        projectName: string,
        startTime: string,
        endTime: string,
      ) => {
        capturedProjectName = projectName;
        return origGenerate(content, sessionId, projectName, startTime, endTime);
      };

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();
      expect(capturedProjectName).toBe("kanbanflow");
    });

    it("saves backfill state with success=false and error for failed sessions", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      messages.set("s1", [createMockMessage("m1", "user", "Hello")]);

      const backfillStates = new Map<string, BackfillState>();
      const mocks = createMocks({
        sessions,
        messages,
        backfillStates,
        summaryFn: async () => {
          throw new Error("LLM timeout");
        },
      });

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();

      const state = backfillStates.get("s1");
      expect(state).toBeDefined();
      expect(state!.success).toBe(false);
      expect(state!.errorMessage).toContain("LLM timeout");
    });

    it("tracks daily logs created vs updated counts", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-07T10:00:00Z"), new Date("2026-03-07T10:30:00Z")),
        createMockSession("s2", "C:\\Projects\\proj1", new Date("2026-03-07T14:00:00Z"), new Date("2026-03-07T14:30:00Z")),
        createMockSession("s3", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z"), new Date("2026-03-08T10:30:00Z")),
      ];

      const messages = new Map<string, Message[]>();
      for (const s of sessions) {
        messages.set(s.id, [createMockMessage(`${s.id}-m1`, "user", "Hello")]);
      }

      const mocks = createMocks({ sessions, messages });
      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      const result = await service.backfill();
      // s1 and s2 on same date (2026-03-07): first creates, second updates
      // s3 on different date (2026-03-08): creates
      expect(result.dailyLogsCreated).toBe(2);
      expect(result.dailyLogsUpdated).toBe(1);
    });

    it("uses session endTime or falls back to startTime for LLM call", async () => {
      const sessions = [
        createMockSession("s1", "C:\\Projects\\proj1", new Date("2026-03-08T10:00:00Z")),
        // No endTime
      ];

      const messages = new Map<string, Message[]>();
      messages.set("s1", [createMockMessage("m1", "user", "Hello")]);

      let capturedEndTime = "";
      const mocks = createMocks({
        sessions,
        messages,
        summaryFn: async () => "## Summary",
      });

      mocks.summaryGenerator.generateSummary = async (
        _content: string,
        _sessionId: string,
        _projectName: string,
        _startTime: string,
        endTime: string,
      ) => {
        capturedEndTime = endTime;
        return "## Summary";
      };

      const service = new BackfillService(
        mocks.sessionRepo,
        mocks.messageRepo,
        mocks.backfillStateRepo,
        mocks.summaryGenerator,
        mocks.dailyLogWriter,
      );

      await service.backfill();
      // No endTime, should fall back to startTime
      expect(capturedEndTime).toBe("2026-03-08T10:00:00.000Z");
    });
  });
});
