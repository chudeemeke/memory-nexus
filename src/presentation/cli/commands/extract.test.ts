/**
 * Extract CLI Command Tests
 *
 * [TDD-RED]
 * Verifies commander options parsing, dependency wiring, session filtering,
 * and text/JSON outputs for the extract CLI command.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
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
import { createExtractCommand, executeExtractCommand } from "./extract.js";

describe("Extract CLI Command", () => {
  let db: Database;
  let sessionRepo: SqliteSessionRepository;
  let messageRepo: SqliteMessageRepository;
  let testDbPath: string;
  let testLogPath: string;

  beforeEach(() => {
    testDbPath = join(tmpdir(), `memory-nexus-cli-extract-db-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(testDbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);

    sessionRepo = new SqliteSessionRepository(db);
    messageRepo = new SqliteMessageRepository(db);

    testLogPath = join(tmpdir(), `memory-nexus-cli-extract-events-${Math.random().toString(36).slice(2)}.jsonl`);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    try {
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
    } catch {}
    try {
      if (existsSync(testLogPath)) unlinkSync(testLogPath);
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
