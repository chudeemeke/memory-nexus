/**
 * Extract CLI Command Tests
 *
 * [TDD-RED]
 * Verifies commander options parsing, dependency wiring, session filtering,
 * and text/JSON outputs for the extract CLI command.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import * as connectionModule from "../../../infrastructure/database/connection.js";
import { ClaudeCliExtractionProvider } from "../../../infrastructure/llm/claude-cli-extractor.js";
import { Command } from "commander";
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createSchema } from "../../../infrastructure/database/schema.js";
import { Session } from "../../../domain/entities/session.js";
import { Message } from "../../../domain/entities/message.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../infrastructure/database/repositories/message-repository.js";
import { SqliteExtractionLogRepository } from "../../../infrastructure/database/repositories/extraction-log-repository.js";
import { DEFAULT_CONFIG } from "../../../infrastructure/hooks/config-manager.js";
import type { IEmbeddingProvider } from "../../../domain/ports/embedding.js";
import { createDefaultEmbedder, createExtractCommand, executeExtractCommand, ExtractProgress } from "./extract.js";

describe("Extract CLI Command", () => {
  let db: Database;
  let sessionRepo: SqliteSessionRepository;
  let messageRepo: SqliteMessageRepository;
  let testDbPath: string;
  let testLogPath: string;

  let oldConfigHome: string | undefined;
  let oldDataHome: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    oldConfigHome = process.env.XDG_CONFIG_HOME;
    oldDataHome = process.env.XDG_DATA_HOME;

    tempDir = join(tmpdir(), `memory-nexus-extract-test-xdg-${Math.random().toString(36).slice(2)}`);
    const configDir = join(tempDir, "config", "memory");
    const dataDir = join(tempDir, "data", "memory");

    const fs = require("fs");
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // Write a dummy config file with embedding disabled to prevent network calls to remote hosts
    fs.writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        embedding: {
          enabled: false
        }
      })
    );

    process.env.XDG_CONFIG_HOME = join(tempDir, "config");
    process.env.XDG_DATA_HOME = join(tempDir, "data");

    testDbPath = join(dataDir, "memory.db");
    db = new Database(testDbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);

    sessionRepo = new SqliteSessionRepository(db);
    messageRepo = new SqliteMessageRepository(db);

    testLogPath = join(dataDir, "events.jsonl");
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}

    if (oldConfigHome !== undefined) {
      process.env.XDG_CONFIG_HOME = oldConfigHome;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    if (oldDataHome !== undefined) {
      process.env.XDG_DATA_HOME = oldDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    try {
      if (existsSync(tempDir)) {
        const fs = require("fs");
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test("createExtractCommand registers commander properties correctly", () => {
    const cmd = createExtractCommand();
    expect(cmd.name()).toBe("extract");
    expect(cmd.description()).toContain("Extract facts from session messages");

    // Verify option registration
    expect(cmd.options.some(o => o.long === "--all")).toBe(true);
    expect(cmd.options.some(o => o.long === "--since")).toBe(true);
    expect(cmd.options.some(o => o.long === "--force")).toBe(true);
    expect(cmd.options.some(o => o.long === "--json")).toBe(true);
    expect(cmd.options.some(o => o.long === "--quiet")).toBe(true);
  }, 15000);

  test("ExtractProgress renders TTY updates, truncates long session names, and stops cleanly", () => {
    const oldIsTty = process.stdout.isTTY;
    const originalWrite = process.stdout.write;
    const writes: string[] = [];

    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const progress = new ExtractProgress(2);
      progress.update("short-session");
      progress.update("session-name-that-is-definitely-too-long-for-the-progress-line");
      progress.stop();

      expect(writes[0]).toContain("[0/2]");
      expect(writes.join("\n")).toContain("short-session");
      expect(writes.join("\n")).toContain("session-name-that-is-d...");
      expect(writes[writes.length - 1]).toBe("\n");
    } finally {
      process.stdout.write = originalWrite;
      Object.defineProperty(process.stdout, "isTTY", {
        value: oldIsTty,
        configurable: true,
      });
    }
  });

  test("createDefaultEmbedder builds and initializes the configured provider", async () => {
    const embedder = await createDefaultEmbedder({
      ...DEFAULT_CONFIG,
      embedding: {
        ...DEFAULT_CONFIG.embedding,
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        batchSize: 10,
        apiKey: "test-key-not-secret",
      },
    });

    expect(embedder.name).toBe("openai");
    expect(embedder.isReady()).toBe(true);
    await embedder.dispose();
  });

  test("executeExtractCommand filters sessions and prints summaries (text mode)", async () => {
    // Populate session 1: 12 hours old
    const session1 = Session.create({
      id: "session-old",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date(Date.now() - 12 * 60 * 60 * 1000)
    });
    await sessionRepo.save(session1);
    await messageRepo.save(
      Message.create({ id: "msg-old", role: "user", content: "I decide to build things", timestamp: new Date() }),
      "session-old"
    );

    // Populate session 2: 36 hours old
    const session2 = Session.create({
      id: "session-very-old",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date(Date.now() - 36 * 60 * 60 * 1000)
    });
    await sessionRepo.save(session2);
    await messageRepo.save(
      Message.create({ id: "msg-very-old", role: "user", content: "We prefer standard conventions", timestamp: new Date() }),
      "session-very-old"
    );

    // Test with --since 1d: only session1 should be processed!
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        since: "1d"
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        // Mock provider returning fact candidates
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "decision", content: "Decided to build things", confidence: 0.9 }]
        }
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("Extraction Completed Successfully"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("Added"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand processes all sessions when --all is specified", async () => {
    const session1 = Session.create({
      id: "session-old",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date(Date.now() - 48 * 60 * 60 * 1000)
    });
    await sessionRepo.save(session1);
    await messageRepo.save(
      Message.create({ id: "msg-old", role: "user", content: "Convention A", timestamp: new Date() }),
      "session-old"
    );

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        all: true
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "preference", content: "Convention A preference", confidence: 0.95 }]
        }
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs.some(l => l.includes("Added") && l.includes("1"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand outputs JSON envelope with --json option", async () => {
    const session = Session.create({
      id: "session-json",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-json", role: "user", content: "A friction point", timestamp: new Date() }),
      "session-json"
    );

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        json: true
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "friction", content: "Build timeouts are slow", confidence: 0.8 }]
        }
      });

      expect(result.exitCode).toBe(0);
      const lastLog = consoleLogs[consoleLogs.length - 1];
      const parsed = JSON.parse(lastLog);
      expect(parsed.status).toBe("success");
      expect(parsed.data.added).toBe(1);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand uses injected embedder factory when embeddings are enabled", async () => {
    const fs = require("fs");
    fs.writeFileSync(
      join(tempDir, "config", "memory", "config.json"),
      JSON.stringify({
        embedding: {
          enabled: true,
          provider: "local",
          model: "test-model",
          dimensions: 1,
          batchSize: 10,
        },
      })
    );

    const session = Session.create({
      id: "session-embedder",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-embedder", role: "user", content: "Embedding-backed extraction", timestamp: new Date() }),
      "session-embedder"
    );

    const embedder = {
      name: "mock-embedder",
      model: "test-model",
      dimensions: 1,
      isReady: mock(() => true),
      initialize: mock(() => Promise.resolve()),
      embed: mock(() => Promise.resolve({ embedding: new Float32Array([1]), model: "test-model", dimensions: 1 })),
      embedBatch: mock((values: string[]) =>
        Promise.resolve(values.map(() => ({ embedding: new Float32Array([1]), model: "test-model", dimensions: 1 })))
      ),
      dispose: mock(() => Promise.resolve()),
    } as IEmbeddingProvider;
    const createEmbedder = mock(() => Promise.resolve(embedder));

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(String(msg));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        json: true,
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        createEmbedder,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "observation", content: "Embedding path was used", confidence: 0.9 }],
        },
      });

      expect(result.exitCode).toBe(0);
      expect(createEmbedder).toHaveBeenCalled();
      expect(embedder.isReady).toHaveBeenCalled();
      expect(embedder.embedBatch).toHaveBeenCalled();
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.data.added).toBe(1);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand outputs quiet metrics with --quiet option", async () => {
    const session = Session.create({
      id: "session-quiet",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-quiet", role: "user", content: "Observation C", timestamp: new Date() }),
      "session-quiet"
    );

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        quiet: true
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "observation", content: "Observing state", confidence: 0.9 }]
        }
      });

      expect(result.exitCode).toBe(0);
      // Quiet mode outputs the summary metrics in a minimal, quiet fashion
      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toBe("added: 1, updated: 0, superseded: 0, skipped: 0");
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand rejects unsupported LLM provider instead of falling back", async () => {
    const oldProvider = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "unknown-provider";
    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (msg) => consoleErrors.push(String(msg));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
      });

      expect(result.exitCode).toBe(1);
      expect(consoleErrors.some((line) => line.includes('Unsupported extraction provider: "unknown-provider"'))).toBe(true);
    } finally {
      console.error = originalError;
      if (oldProvider === undefined) {
        delete process.env.LLM_PROVIDER;
      } else {
        process.env.LLM_PROVIDER = oldProvider;
      }
    }
  });

  test("executeExtractCommand emits JSON error for unsupported LLM provider", async () => {
    const oldProvider = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "unknown-provider";
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(String(msg));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        json: true,
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
      });

      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.error.code).toBe("PROVIDER_INIT_FAILED");
      expect(parsed.error.message).toContain("unknown-provider");
    } finally {
      console.log = originalLog;
      if (oldProvider === undefined) {
        delete process.env.LLM_PROVIDER;
      } else {
        process.env.LLM_PROVIDER = oldProvider;
      }
    }
  });

  test("executeExtractCommand returns database error when connection fails", async () => {
    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (msg) => consoleErrors.push(String(msg));

    const invalidPath = process.platform === "win32"
      ? "NUL/cannot/create/extract.db"
      : "/dev/null/cannot/create/extract.db";

    try {
      const result = await executeExtractCommand({
        project: "nexus",
      }, {
        dbPath: invalidPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(result.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("Database connection failed");
    } finally {
      console.error = originalError;
    }
  });

  test("executeExtractCommand emits JSON database error when connection fails", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(String(msg));

    const invalidPath = process.platform === "win32"
      ? "NUL/cannot/create/extract-json.db"
      : "/dev/null/cannot/create/extract-json.db";

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        json: true,
      }, {
        dbPath: invalidPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.error.code).toBe("DB_CONNECTION_FAILED");
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand rejects invalid since duration in text and JSON modes", async () => {
    const session = Session.create({
      id: "session-invalid-since",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);

    const consoleErrors: string[] = [];
    const consoleLogs: string[] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (msg) => consoleErrors.push(String(msg));
    console.log = (msg) => consoleLogs.push(String(msg));

    try {
      const textResult = await executeExtractCommand({
        project: "nexus",
        since: "nonsense",
      }, {
        dbPath: testDbPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(textResult.exitCode).toBe(1);
      expect(consoleErrors.join("\n")).toContain("Invalid duration");

      const jsonResult = await executeExtractCommand({
        project: "nexus",
        since: "nonsense",
        json: true,
      }, {
        dbPath: testDbPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(jsonResult.exitCode).toBe(1);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.error.code).toBe("INVALID_ARGUMENT");
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });

  test("executeExtractCommand reports no sessions in text and JSON modes", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg, ...args) => consoleLogs.push([msg, ...args].map(String).join(" "));

    try {
      const textResult = await executeExtractCommand({
        project: "missing-project",
      }, {
        dbPath: testDbPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(textResult.exitCode).toBe(0);
      expect(consoleLogs.join("\n")).toContain("No new sessions to extract for project: missing-project");

      consoleLogs.length = 0;
      const jsonResult = await executeExtractCommand({
        project: "missing-project",
        json: true,
      }, {
        dbPath: testDbPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(jsonResult.exitCode).toBe(0);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.data.added).toBe(0);
      expect(parsed.meta.sessions_processed).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand suppresses no-session output in quiet mode", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg, ...args) => consoleLogs.push([msg, ...args].map(String).join(" "));

    try {
      const result = await executeExtractCommand({
        project: "missing-project",
        quiet: true,
      }, {
        dbPath: testDbPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [],
        },
      });

      expect(result.exitCode).toBe(0);
      expect(consoleLogs).toEqual([]);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand skips already logged sessions unless forced", async () => {
    const session = Session.create({
      id: "session-already-logged",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-already-logged", role: "user", content: "Already extracted", timestamp: new Date() }),
      "session-already-logged"
    );
    const logRepo = new SqliteExtractionLogRepository(db);
    await logRepo.save({
      sessionId: "session-already-logged",
      mode: "manual",
      factsAdded: 1,
      factsUpdated: 0,
      factsSuperseded: 0,
      factsSkipped: 0,
      provider: "mock-llm",
      model: "mock-model",
      tokensConsumed: 0,
      extractedAt: new Date(),
    });

    const extract = mock(async () => [{ type: "learning" as const, content: "Should not run", confidence: 0.9 }]);
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg, ...args) => consoleLogs.push([msg, ...args].map(String).join(" "));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(extract).not.toHaveBeenCalled();
      expect(consoleLogs.join("\n")).toContain("No new sessions to extract for project: nexus");
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand reprocesses already logged sessions when forced", async () => {
    const session = Session.create({
      id: "session-force",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-force", role: "user", content: "Force this extraction", timestamp: new Date() }),
      "session-force"
    );
    const logRepo = new SqliteExtractionLogRepository(db);
    await logRepo.save({
      sessionId: "session-force",
      mode: "manual",
      factsAdded: 0,
      factsUpdated: 0,
      factsSuperseded: 0,
      factsSkipped: 0,
      provider: "mock-llm",
      model: "mock-model",
      tokensConsumed: 0,
      extractedAt: new Date(),
    });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(String(msg));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        force: true,
        json: true,
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => [{ type: "learning", content: "Forced extraction ran", confidence: 0.9 }],
        },
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.data.added).toBe(1);
      expect(parsed.meta.sessions_processed).toBe(1);
    } finally {
      console.log = originalLog;
    }
  });

  test("executeExtractCommand emits JSON when pipeline execution fails", async () => {
    const session = Session.create({
      id: "session-pipeline-error",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-pipeline-error", role: "user", content: "Trigger extraction failure", timestamp: new Date() }),
      "session-pipeline-error"
    );

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(String(msg));

    try {
      const result = await executeExtractCommand({
        project: "nexus",
        json: true,
      }, {
        dbPath: testDbPath,
        eventLogPath: testLogPath,
        mockExtractor: {
          providerId: "mock-llm",
          modelName: "mock-model",
          extract: async () => {
            throw new Error("provider exploded");
          },
        },
      });

      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(consoleLogs.join("\n"));
      expect(parsed.status).toBe("error");
      expect(parsed.error.code).toBe("UNEXPECTED_ERROR");
      expect(parsed.error.message).toBe("provider exploded");
    } finally {
      console.log = originalLog;
    }
  });

  test("createExtractCommand action parses arguments, executes, and sets process.exitCode", async () => {
    const session = Session.create({
      id: "session-action",
      projectPath: ProjectPath.fromDecoded("C:\\Projects\\nexus"),
      startTime: new Date()
    });
    await sessionRepo.save(session);
    await messageRepo.save(
      Message.create({ id: "msg-action", role: "user", content: "Observation action content", timestamp: new Date() }),
      "session-action"
    );

    const originalExitCode = process.exitCode;
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg) => consoleLogs.push(msg);

    const dbPathSpy = spyOn(connectionModule, "getDefaultDbPath").mockReturnValue(testDbPath);
    const extractSpy = spyOn(ClaudeCliExtractionProvider.prototype, "extract").mockResolvedValue([
      { type: "observation", content: "Action observed in test", confidence: 0.95 }
    ]);

    try {
      const cmd = createExtractCommand();
      await cmd.parseAsync(["node", "memory", "nexus", "--json"]);

      const lastLog = consoleLogs[consoleLogs.length - 1];
      const parsed = JSON.parse(lastLog);
      expect(parsed.status).toBe("success");
      expect(parsed.data.added).toBe(1);
      expect(process.exitCode).toBe(0);
    } finally {
      console.log = originalLog;
      process.exitCode = originalExitCode;
      dbPathSpy.mockRestore();
      extractSpy.mockRestore();
    }
  });
});
