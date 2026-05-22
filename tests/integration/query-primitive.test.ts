/**
 * Query Primitive Integration Tests
 *
 * Verifies that the new executeQueryCommand functions properly and unifies
 * all read-oriented surfaces (search, list, stats, context, related, show)
 * and that it respects the process.env.MEMORY_JSON_COMMAND_OVERRIDE to
 * output the correct envelope name.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  executeQueryCommand,
  executeSearchCommand,
  executeListCommand,
  executeStatsCommand,
  executeContextCommand,
  executeRelatedCommand,
  executeShowCommand,
  type CommandResult,
} from "../../src/index.js";

function expectCommandResult(result: unknown): asserts result is CommandResult {
  expect(result).toBeDefined();
  expect(result).not.toBeNull();
  expect(typeof result).toBe("object");
  expect(typeof (result as CommandResult).exitCode).toBe("number");
}

describe("Query Primitive", () => {
  let exportDir: string;
  let oldXdgConfig: string | undefined;
  let oldXdgData: string | undefined;
  let oldMemoryHome: string | undefined;
  let oldUserProfile: string | undefined;
  let oldHome: string | undefined;

  beforeAll(() => {
    exportDir = mkdtempSync(join(tmpdir(), "memory-query-test-"));

    // Save old environment variables
    oldXdgConfig = process.env.XDG_CONFIG_HOME;
    oldXdgData = process.env.XDG_DATA_HOME;
    oldMemoryHome = process.env.MEMORY_HOME;
    oldUserProfile = process.env.USERPROFILE;
    oldHome = process.env.HOME;

    // Set new sandboxed environments
    process.env.XDG_CONFIG_HOME = join(exportDir, "config");
    process.env.XDG_DATA_HOME = join(exportDir, "data");
    process.env.MEMORY_HOME = join(exportDir, "memory");
    process.env.USERPROFILE = exportDir;
    process.env.HOME = exportDir;
  });

  afterAll(() => {
    // Restore environment variables
    if (oldXdgConfig !== undefined) {
      process.env.XDG_CONFIG_HOME = oldXdgConfig;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    if (oldXdgData !== undefined) {
      process.env.XDG_DATA_HOME = oldXdgData;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    if (oldMemoryHome !== undefined) {
      process.env.MEMORY_HOME = oldMemoryHome;
    } else {
      delete process.env.MEMORY_HOME;
    }

    if (oldUserProfile !== undefined) {
      process.env.USERPROFILE = oldUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }

    if (oldHome !== undefined) {
      process.env.HOME = oldHome;
    } else {
      delete process.env.HOME;
    }

    try {
      rmSync(exportDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  test("message search kind works and returns exitCode 0", async () => {
    const result = await executeQueryCommand("test", {
      kind: "message",
      json: true,
      quiet: true,
    });
    expectCommandResult(result);
    expect(result.exitCode).toBe(0);
  });

  test("file search kind returns error without qmd installed or gracefully handles it", async () => {
    const result = await executeQueryCommand("test", {
      kind: "file",
      json: true,
      quiet: true,
    });
    expectCommandResult(result);
    // Should be 1 because qmd is not installed in the test env
    expect(result.exitCode).toBe(1);
  });

  test("session list and show kinds work", async () => {
    // List sessions
    const listResult = await executeQueryCommand(undefined, {
      kind: "session",
      json: true,
      quiet: true,
    });
    expectCommandResult(listResult);
    expect(listResult.exitCode).toBe(0);

    // Show nonexistent session
    const showResult = await executeQueryCommand("nonexistent-session-id", {
      kind: "session",
      json: true,
      quiet: true,
    });
    expectCommandResult(showResult);
    expect(showResult.exitCode).toBe(1);
  });

  test("stats kind works and returns exitCode 0", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "stats",
      json: true,
      quiet: true,
    });
    expectCommandResult(result);
    expect(result.exitCode).toBe(0);
  });

  test("context kind returns exitCode 1 for nonexistent project", async () => {
    const result = await executeQueryCommand("nonexistent-project", {
      kind: "context",
      json: true,
      quiet: true,
    });
    expectCommandResult(result);
    expect(result.exitCode).toBe(1);
  });

  test("related kind returns exitCode 1 for nonexistent session", async () => {
    const result = await executeQueryCommand("nonexistent-session", {
      kind: "related",
      json: true,
      quiet: true,
    });
    expectCommandResult(result);
    expect(result.exitCode).toBe(1);
  });

  test("original commands wrap query command and output original command names in JSON envelopes", async () => {
    let capturedJson = "";
    const originalConsoleLog = console.log;
    console.log = (msg: string) => {
      capturedJson = msg;
    };

    try {
      // 1. Search wrapped command
      await executeSearchCommand("test", { json: true, quiet: true });
      expect(capturedJson).toContain('"command": "search"');

      // 2. List wrapped command
      await executeListCommand({ json: true, quiet: true });
      expect(capturedJson).toContain('"command": "list"');
    } finally {
      console.log = originalConsoleLog;
    }
  });
});
