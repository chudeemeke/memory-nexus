/**
 * Search Command Tests
 *
 * Tests the CLI search command handler.
 * Tests command structure, option parsing, and result formatting.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { Command, CommanderError } from "commander";
import { createSearchCommand, executeSearchCommand, filterCaseSensitive } from "./search.js";
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
import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import { ErrorCode } from "../../../domain/errors/index.js";

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

    it("has --verbose option", () => {
      const command = createSearchCommand();
      const verboseOption = command.options.find(
        (o) => o.short === "-v" || o.long === "--verbose"
      );
      expect(verboseOption).toBeDefined();
    });

    it("has --quiet option", () => {
      const command = createSearchCommand();
      const quietOption = command.options.find(
        (o) => o.short === "-q" || o.long === "--quiet"
      );
      expect(quietOption).toBeDefined();
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

    it("parses --verbose flag", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--verbose"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses -v shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-v"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses --quiet flag", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--quiet"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses -q shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-q"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });
  });

  describe("verbose/quiet conflicts", () => {
    it("throws error when --verbose and --quiet used together", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--verbose", "--quiet"], { from: "user" });
      }).toThrow();
    });

    it("throws error when -v and -q used together", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "-v", "-q"], { from: "user" });
      }).toThrow();
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

    it("returns role field from search results", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        const projectPath = ProjectPath.fromDecoded("/home/test/project");
        const session = Session.create({
          id: "session-role-test",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const userMessage = Message.create({
          id: "message-user",
          role: "user",
          content: "Question about authentication implementation",
          timestamp: new Date("2026-01-28T10:01:00Z"),
        });

        const assistantMessage = Message.create({
          id: "message-assistant",
          role: "assistant",
          content: "Here is how authentication works",
          timestamp: new Date("2026-01-28T10:02:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);
        await messageRepo.save(userMessage, "session-role-test");
        await messageRepo.save(assistantMessage, "session-role-test");

        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("authentication");
        const results = await searchService.search(query, { limit: 10 });

        expect(results.length).toBe(2);

        // Find each result by messageId
        const userResult = results.find(r => r.messageId === "message-user");
        const assistantResult = results.find(r => r.messageId === "message-assistant");

        expect(userResult?.role).toBe("user");
        expect(assistantResult?.role).toBe("assistant");
      } finally {
        closeDatabase(db);
      }
    });

    it("project filter uses substring matching", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        // Create two sessions with different project names
        const wowPath = ProjectPath.fromDecoded("/home/test/wow-system");
        const wowSession = Session.create({
          id: "session-wow",
          projectPath: wowPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const nexusPath = ProjectPath.fromDecoded("/home/test/memory-nexus");
        const nexusSession = Session.create({
          id: "session-nexus",
          projectPath: nexusPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(wowSession);
        await sessionRepo.save(nexusSession);

        // Add messages to both sessions
        const wowMsg = Message.create({
          id: "msg-wow",
          role: "user",
          content: "Authentication implementation in wow-system",
          timestamp: new Date("2026-01-28T10:01:00Z"),
        });
        await messageRepo.save(wowMsg, "session-wow");

        const nexusMsg = Message.create({
          id: "msg-nexus",
          role: "user",
          content: "Authentication implementation in memory-nexus",
          timestamp: new Date("2026-01-28T10:01:00Z"),
        });
        await messageRepo.save(nexusMsg, "session-nexus");

        // Search with partial project name "system"
        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("authentication");
        const results = await searchService.search(query, {
          limit: 10,
          projectFilter: "system",
        });

        // Should only match wow-system (contains "system")
        expect(results.length).toBe(1);
        expect(results[0].sessionId).toBe("session-wow");

        // Also test case-insensitivity
        const results2 = await searchService.search(query, {
          limit: 10,
          projectFilter: "SYSTEM",
        });
        expect(results2.length).toBe(1);
        expect(results2[0].sessionId).toBe("session-wow");
      } finally {
        closeDatabase(db);
      }
    });
  });

  describe("filter options", () => {
    it("has --session option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.short === "-s" || o.long === "--session"
      );
      expect(option).toBeDefined();
    });

    it("has --role option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.long === "--role"
      );
      expect(option).toBeDefined();
    });

    it("has --since option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.long === "--since"
      );
      expect(option).toBeDefined();
    });

    it("has --before option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.long === "--before"
      );
      expect(option).toBeDefined();
    });

    it("has --days option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.long === "--days"
      );
      expect(option).toBeDefined();
    });

    it("parses --session value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--session", "abc-123"], { from: "user" });

      expect(capturedOptions?.session).toBe("abc-123");
    });

    it("parses -s shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-s", "session-xyz"], { from: "user" });

      expect(capturedOptions?.session).toBe("session-xyz");
    });

    it("parses --role single value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--role", "user"], { from: "user" });

      expect(capturedOptions?.role).toBe("user");
    });

    it("parses --role comma-separated values", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--role", "user,assistant"], { from: "user" });

      expect(capturedOptions?.role).toBe("user,assistant");
    });

    it("parses --since value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--since", "yesterday"], { from: "user" });

      expect(capturedOptions?.since).toBe("yesterday");
    });

    it("parses --before value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--before", "2 weeks ago"], { from: "user" });

      expect(capturedOptions?.before).toBe("2 weeks ago");
    });

    it("parses --days value", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--days", "7"], { from: "user" });

      expect(capturedOptions?.days).toBe(7);
    });

    it("includes filter options in help", () => {
      const command = createSearchCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-s, --session");
      expect(helpInfo).toContain("--role");
      expect(helpInfo).toContain("--since");
      expect(helpInfo).toContain("--before");
      expect(helpInfo).toContain("--days");
    });
  });

  describe("days/since/before conflicts", () => {
    it("throws error when --days and --since used together", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--days", "7", "--since", "yesterday"], { from: "user" });
      }).toThrow();
    });

    it("throws error when --days and --before used together", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--days", "7", "--before", "2 weeks ago"], { from: "user" });
      }).toThrow();
    });

    it("allows --since and --before together", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--since", "2 weeks ago", "--before", "yesterday"], { from: "user" });

      expect(capturedOptions?.since).toBe("2 weeks ago");
      expect(capturedOptions?.before).toBe("yesterday");
    });
  });

  describe("--days validation", () => {
    it("throws error for invalid days value", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--days", "invalid"], { from: "user" });
      }).toThrow();
    });

    it("throws error for negative days value", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--days", "-5"], { from: "user" });
      }).toThrow();
    });

    it("throws error for zero days value", () => {
      const command = createSearchCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["test", "--days", "0"], { from: "user" });
      }).toThrow();
    });
  });

  describe("case sensitivity options", () => {
    it("has --ignore-case option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.short === "-i" || o.long === "--ignore-case"
      );
      expect(option).toBeDefined();
    });

    it("has --case-sensitive option", () => {
      const command = createSearchCommand();
      const option = command.options.find(
        (o) => o.short === "-c" || o.long === "--case-sensitive"
      );
      expect(option).toBeDefined();
    });

    it("parses --case-sensitive flag", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--case-sensitive"], { from: "user" });

      expect(capturedOptions?.caseSensitive).toBe(true);
    });

    it("parses -c shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-c"], { from: "user" });

      expect(capturedOptions?.caseSensitive).toBe(true);
    });

    it("parses --ignore-case flag", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "--ignore-case"], { from: "user" });

      expect(capturedOptions?.ignoreCase).toBe(true);
    });

    it("parses -i shorthand", () => {
      const command = createSearchCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((_query, options) => {
        capturedOptions = options;
      });

      command.parse(["test", "-i"], { from: "user" });

      expect(capturedOptions?.ignoreCase).toBe(true);
    });

    it("includes case sensitivity options in help", () => {
      const command = createSearchCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-i, --ignore-case");
      expect(helpInfo).toContain("-c, --case-sensitive");
      expect(helpInfo).toContain("Case-insensitive search");
      expect(helpInfo).toContain("Case-sensitive search");
    });
  });

  describe("filterCaseSensitive", () => {
    const createMockResult = (snippet: string, id = "test-id"): SearchResult => ({
      sessionId: "session-123",
      messageId: id,
      role: "user",
      score: 0.8,
      timestamp: new Date("2026-01-28T10:00:00Z"),
      snippet,
    });

    it("filters results that match exact case", () => {
      const results = [
        createMockResult("This is a <mark>Test</mark> message", "m1"),
        createMockResult("Another <mark>test</mark> example", "m2"),
        createMockResult("The <mark>TEST</mark> case", "m3"),
      ];

      const filtered = filterCaseSensitive(results, "Test", 10);

      expect(filtered.length).toBe(1);
      expect(filtered[0].messageId).toBe("m1");
    });

    it("returns empty array when no results match case", () => {
      const results = [
        createMockResult("all <mark>lowercase</mark> text", "m1"),
        createMockResult("more <mark>lowercase</mark> content", "m2"),
      ];

      const filtered = filterCaseSensitive(results, "LOWERCASE", 10);

      expect(filtered.length).toBe(0);
    });

    it("respects limit after filtering", () => {
      const results = [
        createMockResult("First <mark>Match</mark>", "m1"),
        createMockResult("Second <mark>Match</mark>", "m2"),
        createMockResult("Third <mark>Match</mark>", "m3"),
      ];

      const filtered = filterCaseSensitive(results, "Match", 2);

      expect(filtered.length).toBe(2);
      expect(filtered[0].messageId).toBe("m1");
      expect(filtered[1].messageId).toBe("m2");
    });

    it("removes mark tags before matching", () => {
      const results = [
        createMockResult("<mark>AUTH</mark>entication", "m1"),
        createMockResult("auth<mark>ENT</mark>ication", "m2"),
      ];

      // The actual text is "AUTHentication" and "authENTication"
      const filtered = filterCaseSensitive(results, "AUTHentication", 10);

      expect(filtered.length).toBe(1);
      expect(filtered[0].messageId).toBe("m1");
    });

    it("handles empty results array", () => {
      const filtered = filterCaseSensitive([], "query", 10);

      expect(filtered.length).toBe(0);
    });

    it("handles query with special characters", () => {
      const results = [
        createMockResult("Using <mark>process.env</mark> variable", "m1"),
        createMockResult("Using <mark>process.ENV</mark> variable", "m2"),
      ];

      const filtered = filterCaseSensitive(results, "process.env", 10);

      expect(filtered.length).toBe(1);
      expect(filtered[0].messageId).toBe("m1");
    });
  });

  describe("error handling", () => {
    it("outputs JSON error when --json flag is set with empty query", async () => {
      // Empty query should trigger an error
      await executeSearchCommand("", { json: true });

      expect(process.exitCode).toBe(1);
      // Error is output via console.error for validation errors
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("exits with code 1 on empty query error", async () => {
      await executeSearchCommand("", {});

      expect(process.exitCode).toBe(1);
    });

    it("wraps query errors in consistent error format", async () => {
      // Testing that executeSearchCommand properly handles errors
      // Query validation error should be handled
      await executeSearchCommand("", { limit: "10" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("uses consistent exit code 1 for all error types", async () => {
      // Invalid limit should exit with code 1
      await executeSearchCommand("test", { limit: "-5" });

      expect(process.exitCode).toBe(1);
    });
  });

  describe("performance test", () => {
    it("searches 1000+ messages under 100ms", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        const projectPath = ProjectPath.fromDecoded("/home/test/project");
        const session = Session.create({
          id: "session-performance-test",
          projectPath,
          startTime: new Date("2026-01-28T10:00:00Z"),
        });

        const sessionRepo = new SqliteSessionRepository(db);
        const messageRepo = new SqliteMessageRepository(db);

        await sessionRepo.save(session);

        // Insert 1000 messages with varied content
        const messages = [];
        for (let i = 0; i < 1000; i++) {
          const content = i % 10 === 0
            ? `Authentication JWT token implementation ${i}`
            : `Generic content about coding and development ${i}`;
          messages.push(Message.create({
            id: `msg-${i}`,
            role: i % 2 === 0 ? "user" : "assistant",
            content,
            timestamp: new Date(`2026-01-28T10:${String(i % 60).padStart(2, "0")}:00Z`),
          }));
        }

        // Batch insert
        for (const message of messages) {
          await messageRepo.save(message, "session-performance-test");
        }

        // Time the search
        const searchService = new Fts5SearchService(db);
        const query = SearchQuery.from("authentication");

        const startTime = performance.now();
        const results = await searchService.search(query, { limit: 10 });
        const endTime = performance.now();

        const duration = endTime - startTime;

        // Verify results were found
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(10);

        // Verify performance (< 100ms)
        expect(duration).toBeLessThan(100);
      } finally {
        closeDatabase(db);
      }
    });
  });
});
