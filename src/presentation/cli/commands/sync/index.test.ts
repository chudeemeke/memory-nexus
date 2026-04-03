/**
 * Sync Command Tests
 *
 * Tests the createSyncCommand CLI command handler.
 * Tests option parsing, conflict detection, and help output.
 */

import { describe, expect, it } from "bun:test";
import { Command } from "commander";
import { createSyncCommand } from "./index.js";

describe("Sync Command", () => {

  describe("createSyncCommand", () => {
    it("returns a Command instance", () => {
      const command = createSyncCommand();
      expect(command).toBeInstanceOf(Command);
    });

    it("has name 'sync'", () => {
      const command = createSyncCommand();
      expect(command.name()).toBe("sync");
    });

    it("has description", () => {
      const command = createSyncCommand();
      expect(command.description()).toContain("Sync sessions");
    });

    it("has --force option", () => {
      const command = createSyncCommand();
      const forceOption = command.options.find(
        (o) => o.short === "-f" || o.long === "--force"
      );
      expect(forceOption).toBeDefined();
    });

    it("has --project option with argument", () => {
      const command = createSyncCommand();
      const projectOption = command.options.find(
        (o) => o.short === "-p" || o.long === "--project"
      );
      expect(projectOption).toBeDefined();
      expect(projectOption?.required).toBe(true); // has required argument
    });

    it("has --session option with argument", () => {
      const command = createSyncCommand();
      const sessionOption = command.options.find(
        (o) => o.short === "-s" || o.long === "--session"
      );
      expect(sessionOption).toBeDefined();
      expect(sessionOption?.required).toBe(true);
    });

    it("has --quiet option", () => {
      const command = createSyncCommand();
      const quietOption = command.options.find(
        (o) => o.short === "-q" || o.long === "--quiet"
      );
      expect(quietOption).toBeDefined();
    });

    it("has --verbose option", () => {
      const command = createSyncCommand();
      const verboseOption = command.options.find(
        (o) => o.short === "-v" || o.long === "--verbose"
      );
      expect(verboseOption).toBeDefined();
    });
  });

  describe("option parsing", () => {
    it("parses --force flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--force"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
    });

    it("parses -f shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-f"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
    });

    it("parses --project value", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--project", "my-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("my-project");
    });

    it("parses -p shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-p", "another-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("another-project");
    });

    it("parses --session value", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--session", "session-123"], { from: "user" });

      expect(capturedOptions?.session).toBe("session-123");
    });

    it("parses -s shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-s", "session-456"], { from: "user" });

      expect(capturedOptions?.session).toBe("session-456");
    });

    it("parses --quiet flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--quiet"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses -q shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-q"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses --verbose flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--verbose"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses -v shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-v"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses multiple options together", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-f", "-p", "proj", "-v"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
      expect(capturedOptions?.project).toBe("proj");
      expect(capturedOptions?.verbose).toBe(true);
    });

    it("defaults to undefined for unset options", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse([], { from: "user" });

      expect(capturedOptions?.force).toBeUndefined();
      expect(capturedOptions?.project).toBeUndefined();
      expect(capturedOptions?.session).toBeUndefined();
      expect(capturedOptions?.quiet).toBeUndefined();
      expect(capturedOptions?.verbose).toBeUndefined();
    });
  });

  describe("verbose/quiet conflicts", () => {
    it("throws error when --verbose and --quiet used together", () => {
      const command = createSyncCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["--verbose", "--quiet"], { from: "user" });
      }).toThrow();
    });

    it("throws error when -v and -q used together", () => {
      const command = createSyncCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["-v", "-q"], { from: "user" });
      }).toThrow();
    });
  });

  describe("help output", () => {
    it("includes all options in help", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-f, --force");
      expect(helpInfo).toContain("-p, --project");
      expect(helpInfo).toContain("-s, --session");
      expect(helpInfo).toContain("-q, --quiet");
      expect(helpInfo).toContain("-v, --verbose");
    });

    it("includes option descriptions", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("Re-extract");
      expect(helpInfo).toContain("project");
      expect(helpInfo).toContain("session");
      expect(helpInfo).toContain("progress");
      expect(helpInfo).toContain("detailed");
    });
  });

  describe("new options", () => {
    it("has --dry-run option", () => {
      const command = createSyncCommand();
      const dryRunOption = command.options.find(
        (o) => o.short === "-n" || o.long === "--dry-run"
      );
      expect(dryRunOption).toBeDefined();
    });

    it("has --json option", () => {
      const command = createSyncCommand();
      const jsonOption = command.options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("parses --dry-run flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--dry-run"], { from: "user" });

      expect(capturedOptions?.dryRun).toBe(true);
    });

    it("parses -n shorthand for dry-run", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-n"], { from: "user" });

      expect(capturedOptions?.dryRun).toBe(true);
    });

    it("parses --json flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--json"], { from: "user" });

      expect(capturedOptions?.json).toBe(true);
    });

    it("dry-run and json options in help", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-n, --dry-run");
      expect(helpInfo).toContain("--json");
    });
  });

  describe("--fix-names option", () => {
    it("has --fix-names option", () => {
      const command = createSyncCommand();
      const fixNamesOption = command.options.find(
        (o) => o.long === "--fix-names"
      );
      expect(fixNamesOption).toBeDefined();
    });

    it("parses --fix-names flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--fix-names"], { from: "user" });

      expect(capturedOptions?.fixNames).toBe(true);
    });

    it("fix-names appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--fix-names");
      expect(helpInfo).toContain("project names");
    });
  });

  describe("--embed flag", () => {
    it("has --embed option", () => {
      const command = createSyncCommand();
      const embedOption = command.options.find(
        (o) => o.long === "--embed"
      );
      expect(embedOption).toBeDefined();
    });

    it("parses --embed flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--embed"], { from: "user" });

      expect(capturedOptions?.embed).toBe(true);
    });

    it("--embed appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--embed");
    });

    it("has --background option", () => {
      const command = createSyncCommand();
      const bgOption = command.options.find(
        (o) => o.long === "--background"
      );
      expect(bgOption).toBeDefined();
    });

    it("parses --background flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--background"], { from: "user" });

      expect(capturedOptions?.background).toBe(true);
    });

    it("--background appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--background");
    });

    it("defaults to undefined for embed and background when not set", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse([], { from: "user" });

      expect(capturedOptions?.embed).toBeUndefined();
      expect(capturedOptions?.background).toBeUndefined();
    });
  });
});
