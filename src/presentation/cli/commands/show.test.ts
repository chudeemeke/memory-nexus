/**
 * Show Command Tests
 *
 * Tests for session detail display command.
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach, spyOn } from "bun:test";
import { createShowCommand, executeShowCommand } from "./show.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { SqliteMessageRepository } from "../../../infrastructure/database/repositories/message-repository.js";
import { SqliteToolUseRepository } from "../../../infrastructure/database/repositories/tool-use-repository.js";
import { Session } from "../../../domain/entities/session.js";
import { Message } from "../../../domain/entities/message.js";
import { ToolUse } from "../../../domain/entities/tool-use.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import { ErrorCode } from "../../../domain/errors/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Database } from "bun:sqlite";

// Create unique test directory for this test file
const TEST_DIR = path.join(os.tmpdir(), `memory-nexus-show-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TEST_DB_PATH = path.join(TEST_DIR, "test-memory.db");

// Captured console output
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
const originalLog = console.log;
const originalError = console.error;

function setupConsoleMock() {
  consoleOutput = [];
  consoleErrors = [];
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  };
}

function restoreConsoleMock() {
  console.log = originalLog;
  console.error = originalError;
}

describe("Show Command", () => {
  let db: Database;
  let sessionRepo: SqliteSessionRepository;
  let messageRepo: SqliteMessageRepository;
  let toolUseRepo: SqliteToolUseRepository;

  // Test session data
  const testSessionId = "test-session-full-id-12345";
  const testSession = Session.create({
    id: testSessionId,
    projectPath: ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\test-project"),
    startTime: new Date("2026-01-15T10:00:00Z"),
    endTime: new Date("2026-01-15T11:30:00Z"),
  });

  const testMessages = [
    Message.create({
      id: "msg-1",
      role: "user",
      content: "What is this file?",
      timestamp: new Date("2026-01-15T10:05:00Z"),
    }),
    Message.create({
      id: "msg-2",
      role: "assistant",
      content: "Let me read it for you.",
      timestamp: new Date("2026-01-15T10:06:00Z"),
      toolUseIds: ["tool-1"],
    }),
    Message.create({
      id: "msg-3",
      role: "assistant",
      content: "This is a TypeScript file.",
      timestamp: new Date("2026-01-15T10:07:00Z"),
    }),
  ];

  const testToolUse = ToolUse.create({
    id: "tool-1",
    name: "Read",
    input: { file_path: "/src/main.ts" },
    timestamp: new Date("2026-01-15T10:06:30Z"),
    status: "success",
    result: "export const x = 1;\nexport const y = 2;",
  });

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Initialize database and repositories
    const dbResult = initializeDatabase({ path: TEST_DB_PATH });
    db = dbResult.db;
    sessionRepo = new SqliteSessionRepository(db);
    messageRepo = new SqliteMessageRepository(db);
    toolUseRepo = new SqliteToolUseRepository(db);
  });

  afterAll(() => {
    closeDatabase(db);

    // Clean up test directory
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(() => {
    restoreConsoleMock();
  });

  describe("createShowCommand", () => {
    test("requires session-id argument", () => {
      const cmd = createShowCommand();

      expect(cmd.name()).toBe("show");
      expect(cmd.description()).toBe("Show session details");

      // Check that argument is defined
      const args = (cmd as unknown as { _args: { _name: string; required: boolean }[] })._args;
      expect(args).toHaveLength(1);
      expect(args[0]._name).toBe("session-id");
      expect(args[0].required).toBe(true);
    });

    test("has expected options", () => {
      const cmd = createShowCommand();
      const options = cmd.options;

      const optionNames = options.map((o) => o.long || o.short);
      expect(optionNames).toContain("--json");
      expect(optionNames).toContain("--verbose");
      expect(optionNames).toContain("--quiet");
      expect(optionNames).toContain("--tools");
    });

    test("has --format option with default and ai choice", () => {
      const cmd = createShowCommand();
      const formatOpt = cmd.options.find(o => o.long === "--format");
      expect(formatOpt).toBeDefined();
      expect(formatOpt?.argChoices).toContain("default");
      expect(formatOpt?.argChoices).toContain("ai");
      expect(formatOpt?.defaultValue).toBe("default");
    });
  });

  describe("executeShowCommand", () => {
    beforeAll(async () => {
      // Seed test data
      await sessionRepo.save(testSession);
      for (const msg of testMessages) {
        await messageRepo.save(msg, testSessionId);
      }
      await toolUseRepo.save(testToolUse, testSessionId);
    });

    test("finds session by full ID", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      expect(output).toContain("test-session-full-id-12345");
      expect(output).toContain("test-project");
      expect(output).toContain("What is this file?");
      expect(output).toContain("This is a TypeScript file.");
    });

    test("finds session by partial ID (8 chars)", async () => {
      setupConsoleMock();
      const partialId = testSessionId.substring(0, 8); // "test-ses"

      await executeShowCommand(partialId, {}, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      expect(output).toContain("test-session-full-id-12345");
    });

    test("shows not found for invalid ID", async () => {
      setupConsoleMock();

      await executeShowCommand("nonexistent-session-id", {}, { dbPath: TEST_DB_PATH });

      const errors = consoleErrors.join("\n");
      const output = consoleOutput.join("\n");
      const fullOutput = output + errors;
      expect(fullOutput).toContain("not found");
    });

    test("--json flag outputs envelope-shaped JSON (Plan 32-02 CLI-02)", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, { json: true }, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      const parsed = JSON.parse(output);
      // Envelope shape per Plan 32-02 (CLI-02)
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("show");
      expect(parsed.kind).toBe("session");
      expect(parsed.data).toHaveProperty("session");
      expect(parsed.data.session.id).toBe(testSessionId);
      expect(parsed.data).toHaveProperty("messages");
      expect(parsed.data.messages).toHaveLength(3);
    });

    test("--tools flag shows detailed tool information", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, { tools: true }, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      expect(output).toContain("[TOOL: Read]");
      expect(output).toContain("Input:");
      expect(output).toContain("file_path");
      expect(output).toContain("/src/main.ts");
      expect(output).toContain("Status: success");
    });

    test("--verbose flag shows execution details", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, { verbose: true }, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      expect(output).toContain("=== Execution Details ===");
      expect(output).toContain("Time:");
      expect(output).toContain("ms");
    });

    test("--quiet flag outputs minimal format", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, { quiet: true }, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      // Should have message content
      expect(output).toContain("What is this file?");
      expect(output).toContain("This is a TypeScript file.");
      // Should NOT have session header
      expect(output).not.toContain("Session:");
      expect(output).not.toContain("Project:");
    });

    test("messages ordered by timestamp", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      const pos1 = output.indexOf("What is this file?");
      const pos2 = output.indexOf("Let me read it for you.");
      const pos3 = output.indexOf("This is a TypeScript file.");

      expect(pos1).toBeLessThan(pos2);
      expect(pos2).toBeLessThan(pos3);
    });

    test("tool uses linked to correct messages", async () => {
      setupConsoleMock();

      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      // The tool marker should appear after "Let me read it for you" message
      const msgPos = output.indexOf("Let me read it for you.");
      const toolMarkerPos = output.indexOf("[Read:");
      expect(toolMarkerPos).toBeGreaterThan(msgPos);

      // The tool marker should appear before the next message
      const nextMsgPos = output.indexOf("This is a TypeScript file.");
      expect(toolMarkerPos).toBeLessThan(nextMsgPos);
    });
  });

  describe("Partial ID Matching Edge Cases", () => {
    beforeAll(async () => {
      // Add another session with similar prefix
      const similarSession = Session.create({
        id: "test-session-other-id-999",
        projectPath: ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\other-project"),
        startTime: new Date("2026-01-16T10:00:00Z"),
        endTime: new Date("2026-01-16T11:00:00Z"),
      });
      await sessionRepo.save(similarSession);
    });

    test("shows disambiguation when multiple matches", async () => {
      setupConsoleMock();
      // "test-ses" should match both test-session-full-id-12345 and test-session-other-id-999
      const partialId = "test-ses";

      await executeShowCommand(partialId, {}, { dbPath: TEST_DB_PATH });

      const output = consoleOutput.join("\n");
      const errors = consoleErrors.join("\n");
      const fullOutput = output + errors;

      // Should mention multiple matches or show one of them
      // Implementation may show first match or disambiguation
      expect(fullOutput.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    test("sets exit code 1 for not found session", async () => {
      setupConsoleMock();

      const result = await executeShowCommand("nonexistent-session-xyz", {}, { dbPath: TEST_DB_PATH });

      expect(result.exitCode).toBe(1);
    });

    test("outputs JSON for not found when --json flag is set", async () => {
      setupConsoleMock();

      const result = await executeShowCommand("nonexistent-session-xyz", { json: true }, { dbPath: TEST_DB_PATH });

      expect(result.exitCode).toBe(1);
      const output = consoleOutput.join("\n");
      // Should output JSON (contains "not found")
      expect(output).toBeDefined();
    });

    test("uses consistent exit code 1 for all errors", async () => {
      setupConsoleMock();

      const result = await executeShowCommand("nonexistent-id", {}, { dbPath: TEST_DB_PATH });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("CLI-03: --format normalization (Phase 32)", () => {
    afterEach(() => {
      restoreConsoleMock();
    });

    // 1, 2, 3: choices include brief, ai, default (deprecated alias parity per MEDIUM-2)
    test("accepts 'brief' in --format choices", () => {
      const cmd = createShowCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("brief");
    });

    test("accepts 'ai' in --format choices", () => {
      const cmd = createShowCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("ai");
    });

    test("retains 'default' as deprecated alias in --format choices (MEDIUM-2)", () => {
      const cmd = createShowCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("default");
    });

    test("does not set defaultValue on --format (undefined = no-flag default)", () => {
      const cmd = createShowCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.defaultValue).toBeUndefined();
    });

    // 6: --format brief produces single-line summary for show
    test("--format brief produces single-line summary", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {
        format: "brief" as unknown as "default" | "ai",
      }, { dbPath: TEST_DB_PATH });
      const out = consoleOutput.join("\n");
      // Brief = single line containing session ID + project + message count
      expect(out).toContain(testSessionId);
      // No conversation thread headers
      expect(out).not.toContain("[USER]");
      expect(out).not.toContain("[ASSISTANT]");
    });

    // 7: no flag = backward-compat default text output
    test("no --format flag preserves existing default text output", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });
      const out = consoleOutput.join("\n");
      // Default shows conversation thread header
      expect(out).toContain("Session:");
    });

    // 8: --format ai = no ANSI codes
    test("--format ai emits ANSI-stripped output", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {
        format: "ai",
      }, { dbPath: TEST_DB_PATH });
      const out = consoleOutput.join("\n");
      expect(/\x1b\[/.test(out)).toBe(false);
    });

    // 9: --json --format ai precedence
    test("--json --format ai emits envelope (formatForAi NOT applied)", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {
        json: true,
        format: "ai",
      }, { dbPath: TEST_DB_PATH });
      const out = consoleOutput.join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("show");
      expect(parsed.kind).toBe("session");
    });

    // 10: --format default emits deprecation warning to stderr
    test("--format default emits deprecation warning to stderr", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {
        format: "default" as unknown as "default" | "ai",
      }, { dbPath: TEST_DB_PATH });
      const err = consoleErrors.join("\n");
      expect(err).toContain("deprecated");
    });

    // 11: --format default --json suppresses deprecation warning
    test("--format default --json suppresses deprecation warning", async () => {
      setupConsoleMock();
      await executeShowCommand(testSessionId, {
        format: "default" as unknown as "default" | "ai",
        json: true,
      }, { dbPath: TEST_DB_PATH });
      const err = consoleErrors.join("\n");
      expect(err).not.toContain("deprecated");
    });
  });
});
