/**
 * Purge Command Tests
 *
 * Tests for CLI purge command structure, option parsing, and duration parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createPurgeCommand,
  executePurgeCommand,
  parseDuration,
  setConfirmationMock,
  resetConfirmationMock,
  setTestDbPath,
  type PurgeCommandOptions,
} from "./purge.js";
import { SqliteSessionRepository } from "../../../infrastructure/database/repositories/session-repository.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import { createSchema } from "../../../infrastructure/database/schema.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("createPurgeCommand", () => {
  it("should create a command named 'purge'", () => {
    const command = createPurgeCommand();
    expect(command.name()).toBe("purge");
  });

  it("should have description", () => {
    const command = createPurgeCommand();
    expect(command.description()).toBe("Remove old sessions from database");
  });

  it("should have required --older-than option", () => {
    const command = createPurgeCommand();
    const options = command.options;

    const olderThanOpt = options.find((o) => o.long === "--older-than");
    expect(olderThanOpt).toBeDefined();
    expect(olderThanOpt?.required).toBe(true);
  });

  it("should have --force option with short -f", () => {
    const command = createPurgeCommand();
    const options = command.options;

    const forceOpt = options.find((o) => o.long === "--force");
    expect(forceOpt).toBeDefined();
    expect(forceOpt?.short).toBe("-f");
  });

  it("should have --dry-run option", () => {
    const command = createPurgeCommand();
    const options = command.options;

    const dryRunOpt = options.find((o) => o.long === "--dry-run");
    expect(dryRunOpt).toBeDefined();
  });

  it("should have --json option", () => {
    const command = createPurgeCommand();
    const options = command.options;

    const jsonOpt = options.find((o) => o.long === "--json");
    expect(jsonOpt).toBeDefined();
  });

  it("should have --quiet option with short -q", () => {
    const command = createPurgeCommand();
    const options = command.options;

    const quietOpt = options.find((o) => o.long === "--quiet");
    expect(quietOpt).toBeDefined();
    expect(quietOpt?.short).toBe("-q");
  });

  it("should configure --quiet to conflict with --json", () => {
    const command = createPurgeCommand();
    const quietOpt = command.options.find((o) => o.long === "--quiet");

    expect(quietOpt?.conflictsWith).toContain("json");
  });
});

describe("parseDuration", () => {
  describe("days", () => {
    it("should parse days duration", () => {
      const result = parseDuration("30d");
      const now = new Date();
      const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it("should parse single day", () => {
      const result = parseDuration("1d");
      const now = new Date();
      const expected = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it("should parse large day values", () => {
      const result = parseDuration("365d");
      const now = new Date();
      const expected = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe("months", () => {
    it("should parse months duration", () => {
      const result = parseDuration("6m");
      const now = new Date();
      const expected = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

      // Allow 1 day tolerance for month boundary differences
      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });

    it("should parse single month", () => {
      const result = parseDuration("1m");
      const now = new Date();
      const expected = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });
  });

  describe("years", () => {
    it("should parse years duration", () => {
      const result = parseDuration("1y");
      const now = new Date();
      const expected = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });

    it("should parse multiple years", () => {
      const result = parseDuration("3y");
      const now = new Date();
      const expected = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });
  });

  describe("case insensitivity", () => {
    it("should parse uppercase D", () => {
      const result = parseDuration("30D");
      const now = new Date();
      const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it("should parse uppercase M", () => {
      const result = parseDuration("6M");
      const now = new Date();
      const expected = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });

    it("should parse uppercase Y", () => {
      const result = parseDuration("1Y");
      const now = new Date();
      const expected = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(86400000);
    });
  });

  describe("error handling", () => {
    it("should throw for invalid format (no unit)", () => {
      expect(() => parseDuration("30")).toThrow(/Invalid duration format/);
    });

    it("should throw for invalid format (no number)", () => {
      expect(() => parseDuration("d")).toThrow(/Invalid duration format/);
    });

    it("should throw for invalid unit", () => {
      expect(() => parseDuration("30w")).toThrow(/Invalid duration format/);
    });

    it("should throw for zero value", () => {
      expect(() => parseDuration("0d")).toThrow(/Duration value must be a positive number/);
    });

    it("should throw for negative value", () => {
      expect(() => parseDuration("-5d")).toThrow(/Invalid duration format/);
    });

    it("should throw for empty string", () => {
      expect(() => parseDuration("")).toThrow(/Invalid duration format/);
    });

    it("should throw for whitespace", () => {
      expect(() => parseDuration("30 d")).toThrow(/Invalid duration format/);
    });
  });
});

describe("executePurgeCommand integration", () => {
  let testDir: string;
  let testDbPath: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalExitCode: number | undefined;

  function createTestSession(
    db: Database,
    id: string,
    projectName: string,
    updatedAt: string
  ): void {
    const projectPath = ProjectPath.fromDecoded(`C:\\Users\\Test\\Projects\\${projectName}`);
    const session = Session.create({
      id,
      projectPath,
      startTime: new Date(updatedAt),
    });
    const repo = new SqliteSessionRepository(db);
    repo.save(session);
    db.run(`UPDATE sessions SET updated_at = '${updatedAt}' WHERE id = '${id}'`);
  }

  beforeEach(() => {
    // Create unique test directory
    testDir = path.join(os.tmpdir(), `purge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });
    testDbPath = path.join(testDir, "memory.db");
    setTestDbPath(testDbPath);

    // Initialize database with schema
    const { db } = initializeDatabase({ path: testDbPath });
    closeDatabase(db);

    // Capture console output
    consoleOutput = [];
    consoleErrorOutput = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(" "));
    };

    // Capture exit code
    originalExitCode = process.exitCode;
    process.exitCode = undefined;

    // Reset confirmation mock
    resetConfirmationMock();
  });

  afterEach(() => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Restore exit code
    process.exitCode = originalExitCode;

    // Reset test path
    setTestDbPath(null);

    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("zero sessions found", () => {
    it("should show message when no sessions are older", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "30d",
        force: true,
      };

      await executePurgeCommand(options);

      expect(consoleOutput.join("\n")).toContain("No sessions older than");
      expect(process.exitCode).toBeUndefined();
    });

    it("should output JSON when no sessions found with --json", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "30d",
        json: true,
      };

      await executePurgeCommand(options);

      const output = JSON.parse(consoleOutput.join("\n"));
      expect(output.sessionsDeleted).toBe(0);
      expect(output.dryRun).toBe(false);
    });
  });

  describe("dry-run mode", () => {
    it("should show sessions that would be deleted without deleting", async () => {
      // Create old sessions
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      createTestSession(db, "old-2", "project-b", "2025-01-15T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d", // Sessions are more than 1 year old
        dryRun: true,
      };

      await executePurgeCommand(options);

      const output = consoleOutput.join("\n");
      expect(output).toContain("Would delete 2 session(s)");
      expect(output).toContain("project-a");
      expect(output).toContain("project-b");

      // Verify sessions still exist
      const { db: db2 } = initializeDatabase({ path: testDbPath });
      const repo = new SqliteSessionRepository(db2);
      const session1 = await repo.findById("old-1");
      const session2 = await repo.findById("old-2");
      closeDatabase(db2);

      expect(session1).not.toBeNull();
      expect(session2).not.toBeNull();
    });

    it("should output JSON in dry-run mode with --json", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        dryRun: true,
        json: true,
      };

      await executePurgeCommand(options);

      const output = JSON.parse(consoleOutput.join("\n"));
      expect(output.sessionsToDelete).toBe(1);
      expect(output.dryRun).toBe(true);
      expect(output.sessions).toHaveLength(1);
      expect(output.sessions[0].id).toBe("old-1");
      expect(output.sessions[0].project).toBe("project-a");
    });

    it("should output count only in dry-run mode with --quiet", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      createTestSession(db, "old-2", "project-b", "2025-01-15T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        dryRun: true,
        quiet: true,
      };

      await executePurgeCommand(options);

      expect(consoleOutput).toEqual(["2"]);
    });
  });

  describe("confirmation prompt", () => {
    it("should prompt for confirmation without --force", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      let promptCalled = false;
      setConfirmationMock(async (message: string) => {
        promptCalled = true;
        expect(message).toContain("Delete 1 session(s)");
        expect(message).toContain("y/n");
        return false; // Decline
      });

      const options: PurgeCommandOptions = {
        olderThan: "365d",
      };

      await executePurgeCommand(options);

      expect(promptCalled).toBe(true);
      expect(consoleOutput.join("\n")).toContain("cancelled");
    });

    it("should delete sessions when confirmed", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      setConfirmationMock(async () => true);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
      };

      await executePurgeCommand(options);

      expect(consoleOutput.join("\n")).toContain("Deleted 1 session(s)");

      // Verify session is deleted
      const { db: db2 } = initializeDatabase({ path: testDbPath });
      const repo = new SqliteSessionRepository(db2);
      const session = await repo.findById("old-1");
      closeDatabase(db2);

      expect(session).toBeNull();
    });

    it("should output cancelled JSON when declined with --json", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      setConfirmationMock(async () => false);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        json: true,
      };

      await executePurgeCommand(options);

      const output = JSON.parse(consoleOutput.join("\n"));
      expect(output.cancelled).toBe(true);
    });
  });

  describe("force mode", () => {
    it("should skip confirmation with --force", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      let promptCalled = false;
      setConfirmationMock(async () => {
        promptCalled = true;
        return false;
      });

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        force: true,
      };

      await executePurgeCommand(options);

      expect(promptCalled).toBe(false);
      expect(consoleOutput.join("\n")).toContain("Deleted 1 session(s)");
    });
  });

  describe("actual deletion", () => {
    it("should delete sessions and show count", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      createTestSession(db, "old-2", "project-b", "2025-01-15T10:00:00Z");
      createTestSession(db, "recent", "project-c", "2026-01-28T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        force: true,
      };

      await executePurgeCommand(options);

      expect(consoleOutput.join("\n")).toContain("Deleted 2 session(s)");

      // Verify old sessions deleted, recent remains
      const { db: db2 } = initializeDatabase({ path: testDbPath });
      const repo = new SqliteSessionRepository(db2);
      expect(await repo.findById("old-1")).toBeNull();
      expect(await repo.findById("old-2")).toBeNull();
      expect(await repo.findById("recent")).not.toBeNull();
      closeDatabase(db2);
    });

    it("should output JSON after deletion with --json", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        force: true,
        json: true,
      };

      await executePurgeCommand(options);

      const output = JSON.parse(consoleOutput.join("\n"));
      expect(output.sessionsDeleted).toBe(1);
      expect(output.dryRun).toBe(false);
      expect(output.cutoffDate).toBeDefined();
    });

    it("should output count only with --quiet", async () => {
      const { db } = initializeDatabase({ path: testDbPath });
      createTestSession(db, "old-1", "project-a", "2025-01-10T10:00:00Z");
      createTestSession(db, "old-2", "project-b", "2025-01-15T10:00:00Z");
      closeDatabase(db);

      const options: PurgeCommandOptions = {
        olderThan: "365d",
        force: true,
        quiet: true,
      };

      await executePurgeCommand(options);

      expect(consoleOutput).toEqual(["2"]);
    });
  });

  describe("error handling", () => {
    it("should show error for invalid duration format", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "invalid",
        force: true,
      };

      await executePurgeCommand(options);

      expect(consoleErrorOutput.join("\n")).toContain("Invalid duration format");
      expect(process.exitCode).toBe(1);
    });

    it("should output JSON error for invalid duration with --json", async () => {
      const options: PurgeCommandOptions = {
        olderThan: "invalid",
        json: true,
      };

      await executePurgeCommand(options);

      const output = JSON.parse(consoleOutput.join("\n"));
      expect(output.error).toContain("Invalid duration format");
      expect(process.exitCode).toBe(1);
    });
  });
});
