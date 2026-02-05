/**
 * CLI Smoke Tests
 *
 * Verifies all CLI commands are accessible and respond to --help.
 * Uses Commander.js program directly for fast in-process testing.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { program } from "../../src/presentation/cli/index.js";

// Capture console output for testing
let capturedStdout: string[] = [];
let capturedStderr: string[] = [];
let exitCode: number | undefined;
const originalWrite = process.stdout.write.bind(process.stdout);
const originalErrWrite = process.stderr.write.bind(process.stderr);
const originalExit = process.exit;

function setupCapture(): void {
  capturedStdout = [];
  capturedStderr = [];
  exitCode = undefined;

  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    capturedStdout.push(chunk.toString());
    return true;
  };

  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    capturedStderr.push(chunk.toString());
    return true;
  };

  // @ts-expect-error - process.exit override for testing
  process.exit = (code?: number): never => {
    exitCode = code ?? 0;
    throw new Error(`EXIT_${code ?? 0}`);
  };
}

function teardownCapture(): void {
  process.stdout.write = originalWrite;
  process.stderr.write = originalErrWrite;
  process.exit = originalExit;
}

function getStdout(): string {
  return capturedStdout.join("");
}

function getStderr(): string {
  return capturedStderr.join("");
}

function parseCommand(
  args: string[]
): { exitCode: number; stdout: string; stderr: string } {
  setupCapture();
  try {
    program.parse(["node", "memory", ...args]);
    return { exitCode: exitCode ?? 0, stdout: getStdout(), stderr: getStderr() };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("EXIT_")) {
      return {
        exitCode: exitCode ?? 0,
        stdout: getStdout(),
        stderr: getStderr(),
      };
    }
    throw error;
  } finally {
    teardownCapture();
  }
}

describe("CLI Smoke Tests", () => {
  beforeEach(() => {
    // Reset Commander state for each test
    program.commands.forEach((cmd) => {
      cmd._optionValues = {};
    });
  });

  afterEach(() => {
    teardownCapture();
  });

  describe("main command", () => {
    it("memory --help exits 0", () => {
      const result = parseCommand(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("memory");
    });

    it("memory --version exits 0", () => {
      const result = parseCommand(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("sync command", () => {
    it("memory sync --help exits 0", () => {
      const result = parseCommand(["sync", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("sync");
    });
  });

  describe("search command", () => {
    it("memory search --help exits 0", () => {
      const result = parseCommand(["search", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("search");
    });
  });

  describe("list command", () => {
    it("memory list --help exits 0", () => {
      const result = parseCommand(["list", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("list");
    });
  });

  describe("stats command", () => {
    it("memory stats --help exits 0", () => {
      const result = parseCommand(["stats", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("stats");
    });
  });

  describe("context command", () => {
    it("memory context --help exits 0", () => {
      const result = parseCommand(["context", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("context");
    });
  });

  describe("related command", () => {
    it("memory related --help exits 0", () => {
      const result = parseCommand(["related", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("related");
    });
  });

  describe("show command", () => {
    it("memory show --help exits 0", () => {
      const result = parseCommand(["show", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("show");
    });
  });

  describe("browse command", () => {
    it("memory browse --help exits 0", () => {
      const result = parseCommand(["browse", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("browse");
    });
  });

  describe("install command", () => {
    it("memory install --help exits 0", () => {
      const result = parseCommand(["install", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("install");
    });
  });

  describe("uninstall command", () => {
    it("memory uninstall --help exits 0", () => {
      const result = parseCommand(["uninstall", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("uninstall");
    });
  });

  describe("status command", () => {
    it("memory status --help exits 0", () => {
      const result = parseCommand(["status", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("status");
    });
  });

  describe("doctor command", () => {
    it("memory doctor --help exits 0", () => {
      const result = parseCommand(["doctor", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("doctor");
    });
  });

  describe("export command", () => {
    it("memory export --help exits 0", () => {
      const result = parseCommand(["export", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("export");
    });
  });

  describe("import command", () => {
    it("memory import --help exits 0", () => {
      const result = parseCommand(["import", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("import");
    });
  });

  describe("purge command", () => {
    it("memory purge --help exits 0", () => {
      const result = parseCommand(["purge", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("purge");
    });
  });

  describe("completion command", () => {
    it("memory completion --help exits 0", () => {
      const result = parseCommand(["completion", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("completion");
    });
  });

  describe("error handling", () => {
    it("unknown command shows error and exits 1", () => {
      const result = parseCommand(["unknowncommand123"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("error");
    });

    it("missing required argument shows error", () => {
      // search requires a query argument
      const result = parseCommand(["search"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("error");
    });
  });
});
