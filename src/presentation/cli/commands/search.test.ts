/**
 * Search Command Tests
 *
 * Tests the CLI search command handler.
 * Tests command structure, option parsing, and result formatting.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { Command } from "commander";
import { createSearchCommand, executeSearchCommand } from "./search.js";
import {
  initializeDatabase,
  closeDatabase,
  SqliteSessionRepository,
  SqliteMessageRepository,
  Fts5SearchService,
} from "../../../infrastructure/database/index.js";
import { Session } from "../../../domain/entities/session.js";
import { Message } from "../../../domain/entities/message.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";

describe("Search Command", () => {
  let originalExitCode: number | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Save original exit code
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    // Spy on console methods
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore exit code
    process.exitCode = originalExitCode;
    // Restore console
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("createSearchCommand", () => {
    it("returns a Command instance", () => {
      const command = createSearchCommand();
      expect(command).toBeInstanceOf(Command);
    });

    it("has name 'search'", () => {
      const command = createSearchCommand();
      expect(command.name()).toBe("search");
    });

    it("has description", () => {
      const command = createSearchCommand();
      expect(command.description()).toContain("Full-text search");
    });

    it("has required <query> argument", () => {
      const command = createSearchCommand();
      // Commander stores arguments in _args array
      const args = (command as unknown as { registeredArguments: Array<{ name: () => string; required: boolean }> }).registeredArguments;
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe("query");
      expect(args[0].required).toBe(true);
    });

    it("has --limit option with default", () => {
      const command = createSearchCommand();
      const limitOption = command.options.find(
        (o) => o.short === "-l" || o.long === "--limit"
      );
      expect(limitOption).toBeDefined();
      expect(limitOption?.defaultValue).toBe("10");
    });

    it("has --project option", () => {
      const command = createSearchCommand();
      const projectOption = command.options.find(
        (o) => o.short === "-p" || o.long === "--project"
      );
      expect(projectOption).toBeDefined();
    });

    it("has --json option", () => {
      const command = createSearchCommand();
      const jsonOption = command.options.find(
        (o) => o.long === "--json"
      );
      expect(jsonOption).toBeDefined();
    });
  });

  describe("option parsing", () => {
    it("parses query argument", () => {
      const command = createSearchCommand();
      let capturedQuery: string | undefined;
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((query, options) => {
        capturedQuery = query;
        capturedOptions = options;
      });

      command.parse(["test query"], { from: "user" });

      expect(capturedQuery).toBe("test query");
    });

    it("parses --limit value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--limit", "25"], { from: "user" });

      expect(capturedOptions?.limit).toBe("25");
    });

    it("parses -l shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-l", "50"], { from: "user" });

      expect(capturedOptions?.limit).toBe("50");
    });

    it("uses default limit of 10", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test"], { from: "user" });

      expect(capturedOptions?.limit).toBe("10");
    });

    it("parses --project value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--project", "my-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("my-project");
    });

    it("parses -p shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-p", "another-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("another-project");
    });

    it("parses --json flag", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--json"], { from: "user" });

      expect(capturedOptions?.json).toBe(true);
    });

    it("parses multiple options together", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-l", "20", "-p", "proj", "--json"], { from: "user" });

      expect(capturedOptions?.limit).toBe("20");
      expect(capturedOptions?.project).toBe("proj");
      expect(capturedOptions?.json).toBe(true);
    });

    it("defaults to undefined for unset options", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test"], { from: "user" });

      expect(capturedOptions?.project).toBeUndefined();
      expect(capturedOptions?.json).toBeUndefined();
    });
  });

  describe("help output", () => {
    it("includes all options in help", () => {
      const command = createSearchCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-l, --limit");
      expect(helpInfo).toContain("-p, --project");
      expect(helpInfo).toContain("--json");
    });

    it("includes option descriptions", () => {
      const command = createSearchCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("Maximum results");
      expect(helpInfo).toContain("Filter by project");
      expect(helpInfo).toContain("JSON");
    });

    it("shows query argument", () => {
      const command = createSearchCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("<query>");
    });
  });

  describe("executeSearchCommand", () => {
    it("sets exit code 1 for empty query", async () => {
      await executeSearchCommand("", {});

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Query cannot be empty");
    });

    it("sets exit code 1 for whitespace-only query", async () => {
      await executeSearchCommand("   ", {});

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Query cannot be empty");
    });

    it("sets exit code 1 for invalid limit", async () => {
      await executeSearchCommand("test", { limit: "invalid" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Limit must be a positive number");
    });

    it("sets exit code 1 for negative limit", async () => {
      await executeSearchCommand("test", { limit: "-5" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Limit must be a positive number");
    });

    it("sets exit code 1 for zero limit", async () => {
      await executeSearchCommand("test", { limit: "0" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Limit must be a positive number");
    });
  });

  describe("integration smoke test", () => {
    it("searches in-memory database with test data", async () => {
      // Create in-memory database
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        // Create test session
        const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\project");
        const session = Session.create({
          id: "test-session-123",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        // Create test message with searchable content
        const message = Message.create({
          id: "test-message-456",
          role: "user",
          content: "How do I implement authentication with JWT tokens?",
          timestamp: new Date("2026-01-28T10:01:00Z"),
        });

        // Insert via repositories
        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);
        await messageRepo.save(message, "test-session-123");

        // Search using Fts5SearchService
        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("authentication");
        const results = await searchService.search(query, { limit: 10 });

        // Verify results
        expect(results.length).toBe(1);
        expect(results[0].sessionId).toBe("test-session-123");
        expect(results[0].snippet).toContain("authentication");
      } finally {
        closeDatabase(db);
      }
    });

    it("returns empty array when no results match", async () => {
      // Create in-memory database
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        // Create test session and message
        const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\project");
        const session = Session.create({
          id: "test-session-789",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const message = Message.create({
          id: "test-message-abc",
          role: "assistant",
          content: "This is some unrelated content",
          timestamp: new Date("2026-01-28T10:02:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);
        await messageRepo.save(message, "test-session-789");

        // Search for non-existent term
        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("nonexistent");
        const results = await searchService.search(query, { limit: 10 });

        expect(results.length).toBe(0);
      } finally {
        closeDatabase(db);
      }
    });

    it("respects limit option", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        const projectPath = ProjectPath.fromDecoded("/home/test/project");
        const session = Session.create({
          id: "session-limit-test",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);

        // Insert multiple messages
        for (let i = 0; i < 5; i++) {
          const message = Message.create({
            id: `message-${i}`,
            role: "user",
            content: `Testing authentication method ${i}`,
            timestamp: new Date(`2026-01-28T10:0${i}:00Z`),
          });
          await messageRepo.save(message, "session-limit-test");
        }

        // Search with limit 2
        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("authentication");
        const results = await searchService.search(query, { limit: 2 });

        expect(results.length).toBe(2);
      } finally {
        closeDatabase(db);
      }
    });

    it("highlights matched terms in snippets", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        const projectPath = ProjectPath.fromDecoded("/home/test/project");
        const session = Session.create({
          id: "session-highlight-test",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const message = Message.create({
          id: "message-highlight",
          role: "user",
          content: "How do I configure database connection pooling?",
          timestamp: new Date("2026-01-28T10:01:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);
        await messageRepo.save(message, "session-highlight-test");

        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("database");
        const results = await searchService.search(query, { limit: 10 });

        expect(results.length).toBe(1);
        // FTS5 wraps matched terms in <mark> tags
        expect(results[0].snippet).toContain("<mark>database</mark>");
      } finally {
        closeDatabase(db);
      }
    });
  });
});
