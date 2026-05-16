/**
 * Stats Command Tests
 *
 * Tests the CLI stats command handler.
 * Tests command structure, option parsing, and result formatting.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Command } from "commander";
import { createStatsCommand, executeStatsCommand } from "./stats.js";
import {
  initializeDatabase,
  closeDatabase,
  SqliteStatsService,
} from "../../../infrastructure/database/index.js";
import { ErrorCode } from "../../../domain/errors/index.js";

describe("Stats Command", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
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

    it("has --format option with default and ai choice", () => {
      const command = createStatsCommand();
      const formatOption = command.options.find(
        (o) => o.long === "--format"
      );
      expect(formatOption).toBeDefined();
      expect(formatOption?.argChoices).toContain("default");
      expect(formatOption?.argChoices).toContain("ai");
      expect(formatOption?.defaultValue).toBe("default");
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
      const result = await executeStatsCommand({ projects: "invalid" });

      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });

    it("sets exit code 1 for negative projects value", async () => {
      const result = await executeStatsCommand({ projects: "-5" });

      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });

    it("sets exit code 1 for zero projects value", async () => {
      const result = await executeStatsCommand({ projects: "0" });

      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error: Projects count must be a positive number"
      );
    });

    it("outputs JSON error envelope when --json flag is set with invalid projects (Plan 32-02 HIGH-2)", async () => {
      // Plan 32-02: validation errors in --json mode emit envelope to stdout
      // (not text to stderr). CLI-02 industry pattern (gh, kubectl).
      const result = await executeStatsCommand({ projects: "invalid", json: true });

      expect(result.exitCode).toBe(1);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = (consoleLogSpy.mock.calls as unknown[][])
        .map((c) => String(c[0]))
        .join("\n");
      const parsed = JSON.parse(output);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("stats");
      expect(parsed.error).toBeDefined();
    });

    it("exits with code 1 consistently for errors", async () => {
      const result = await executeStatsCommand({ projects: "-1" });

      expect(result.exitCode).toBe(1);
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

  describe("CLI-03: --format normalization (Phase 32)", () => {
    let cli03TempDir: string;
    let cli03DbPath: string;

    beforeEach(() => {
      cli03TempDir = mkdtempSync(join(tmpdir(), "stats-cli03-"));
      cli03DbPath = join(cli03TempDir, "test.db");
      const { db } = initializeDatabase({ path: cli03DbPath });
      closeDatabase(db);
    });

    afterEach(() => {
      try { rmSync(cli03TempDir, { recursive: true, force: true }); } catch {}
    });

    // 1, 2, 3: choices include brief, ai, default (deprecated alias parity per MEDIUM-2)
    it("accepts 'brief' in --format choices", () => {
      const cmd = createStatsCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("brief");
    });

    it("accepts 'ai' in --format choices", () => {
      const cmd = createStatsCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("ai");
    });

    it("retains 'default' as deprecated alias in --format choices (MEDIUM-2)", () => {
      const cmd = createStatsCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.argChoices).toContain("default");
    });

    it("does not set defaultValue on --format (undefined = no-flag default)", () => {
      const cmd = createStatsCommand();
      const formatOpt = cmd.options.find((o) => o.long === "--format");
      expect(formatOpt?.defaultValue).toBeUndefined();
    });

    // Pitfall 4 Option A: stats --format brief = top-line counters, ≤5 lines
    it("--format brief produces top-line counters (≤5 lines, W5)", async () => {
      await executeStatsCommand(
        { format: "brief" as unknown as "default" | "ai" },
        { dbPath: cli03DbPath }
      );
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const trimmed = out.trim();
      if (trimmed.length > 0) {
        const lineCount = trimmed.split("\n").length;
        expect(lineCount).toBeLessThanOrEqual(5);
      }
      // No "=== Database Statistics ===" header in brief
      expect(out).not.toContain("=== Database Statistics ===");
    });

    // 7: no flag = backward-compat default text output
    it("no --format flag preserves existing default text output", async () => {
      await executeStatsCommand({}, { dbPath: cli03DbPath });
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      // Default mode shows empty-state hint or header
      expect(out.length).toBeGreaterThan(0);
    });

    // 8: --format ai = no ANSI codes
    it("--format ai emits ANSI-stripped output", async () => {
      await executeStatsCommand({ format: "ai" }, { dbPath: cli03DbPath });
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(/\x1b\[/.test(out)).toBe(false);
    });

    // 9: --json --format ai precedence regression
    it("--json --format ai emits envelope (formatForAi NOT applied)", async () => {
      await executeStatsCommand(
        { json: true, format: "ai" },
        { dbPath: cli03DbPath }
      );
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("stats");
      expect(parsed.kind).toBe("stats");
    });

    // 10: --format default emits deprecation warning to stderr
    it("--format default emits deprecation warning to stderr", async () => {
      await executeStatsCommand(
        { format: "default" as unknown as "default" | "ai" },
        { dbPath: cli03DbPath }
      );
      const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(err).toContain("deprecated");
    });

    // 11: --format default --json suppresses deprecation warning
    it("--format default --json suppresses deprecation warning", async () => {
      await executeStatsCommand(
        { format: "default" as unknown as "default" | "ai", json: true },
        { dbPath: cli03DbPath }
      );
      const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(err).not.toContain("deprecated");
    });
  });
});
