/**
 * Stats Command Tests
 *
 * Tests the CLI stats command handler.
 * Tests command structure, option parsing, and result formatting.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { Command } from "commander";
import { createStatsCommand, executeStatsCommand } from "./stats.js";
import {
  initializeDatabase,
  closeDatabase,
  SqliteStatsService,
} from "../../../infrastructure/database/index.js";

describe("Stats Command", () => {
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

  describe("createStatsCommand", () => {
    it("returns a Command instance", () => {
      const command = createStatsCommand();
      expect(command).toBeInstanceOf(Command);
    });

    it("has name 'stats'", () => {
      const command = createStatsCommand();
      expect(command.name()).toBe("stats");
    });

    it("has description", () => {
      const command = createStatsCommand();
      expect(command.description()).toContain("database statistics");
    });

    it("has no required arguments", () => {
      const command = createStatsCommand();
      const args = (
        command as unknown as {
          registeredArguments: Array<{ name: () => string; required: boolean }>;
        }
      ).registeredArguments;
      expect(args.length).toBe(0);
    });

    it("has --json option", () => {
      const command = createStatsCommand();
      const jsonOption = command.options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("has --verbose option", () => {
      const command = createStatsCommand();
      const verboseOption = command.options.find(
        (o) => o.short === "-v" || o.long === "--verbose"
      );
      expect(verboseOption).toBeDefined();
    });

    it("has --quiet option", () => {
      const command = createStatsCommand();
      const quietOption = command.options.find(
        (o) => o.short === "-q" || o.long === "--quiet"
      );
      expect(quietOption).toBeDefined();
    });

    it("has --projects option with default", () => {
      const command = createStatsCommand();
      const projectsOption = command.options.find(
        (o) => o.long === "--projects"
      );
      expect(projectsOption).toBeDefined();
      expect(projectsOption?.defaultValue).toBe("10");
    });
  });

  describe("option parsing", () => {
    it("parses --json flag", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--json"], { from: "user" });

      expect(capturedOptions?.json).toBe(true);
    });

    it("parses --verbose flag", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--verbose"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses -v shorthand", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-v"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses --quiet flag", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--quiet"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses -q shorthand", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-q"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses --projects value", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--projects", "5"], { from: "user" });

      expect(capturedOptions?.projects).toBe("5");
    });

    it("uses default projects of 10", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse([], { from: "user" });

      expect(capturedOptions?.projects).toBe("10");
    });

    it("parses multiple options together", () => {
      const command = createStatsCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--projects", "20", "--json"], { from: "user" });

      expect(capturedOptions?.projects).toBe("20");
      expect(capturedOptions?.json).toBe(true);
    });
  });

  describe("verbose/quiet conflicts", () => {
    it("throws error when --verbose and --quiet used together", () => {
      const command = createStatsCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["--verbose", "--quiet"], { from: "user" });
      }).toThrow();
    });

    it("throws error when -v and -q used together", () => {
      const command = createStatsCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["-v", "-q"], { from: "user" });
      }).toThrow();
    });
  });

  describe("help output", () => {
    it("includes all options in help", () => {
      const command = createStatsCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--json");
      expect(helpInfo).toContain("-v, --verbose");
      expect(helpInfo).toContain("-q, --quiet");
      expect(helpInfo).toContain("--projects");
    });

    it("includes option descriptions", () => {
      const command = createStatsCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("JSON");
      expect(helpInfo).toContain("detailed output");
      expect(helpInfo).toContain("Minimal");
      expect(helpInfo).toContain("Number of projects");
    });
  });

  describe("executeStatsCommand", () => {
    it("sets exit code 1 for invalid projects value", async () => {
      await executeStatsCommand({ projects: "invalid" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });

    it("sets exit code 1 for negative projects value", async () => {
      await executeStatsCommand({ projects: "-5" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });

    it("sets exit code 1 for zero projects value", async () => {
      await executeStatsCommand({ projects: "0" });

      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });
  });

  describe("integration smoke test", () => {
    it("returns stats from in-memory database", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        // Insert test data
        db.run(
          `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
           VALUES ('s1', 'proj1', '/proj1', 'TestProject', datetime('now'))`
        );
        db.run(
          `INSERT INTO messages_meta (id, session_id, role, content, timestamp)
           VALUES ('m1', 's1', 'user', 'Hello world', datetime('now'))`
        );

        const statsService = new SqliteStatsService(db);
        const stats = await statsService.getStats();

        expect(stats.totalSessions).toBe(1);
        expect(stats.totalMessages).toBe(1);
        expect(stats.projectBreakdown.length).toBe(1);
        expect(stats.projectBreakdown[0].projectName).toBe("TestProject");
      } finally {
        closeDatabase(db);
      }
    });

    it("returns zeros for empty database", async () => {
      const { db } = initializeDatabase({ path: ":memory:" });

      try {
        const statsService = new SqliteStatsService(db);
        const stats = await statsService.getStats();

        expect(stats.totalSessions).toBe(0);
        expect(stats.totalMessages).toBe(0);
        expect(stats.totalToolUses).toBe(0);
        expect(stats.projectBreakdown.length).toBe(0);
      } finally {
        closeDatabase(db);
      }
    });
  });
});
