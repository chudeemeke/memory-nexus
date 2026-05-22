/**
 * Unified Status Command Integration Tests
 *
 * Verifies that the consolidated executeStatusCommand behaves correctly,
 * supports all section flags, handles diagnostics, and that the doctor
 * and stats wrapper commands delegate to it successfully.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  executeStatusCommand,
  executeDoctorCommand,
  executeStatsCommand,
  type CommandResult,
} from "../../src/index.js";

function expectCommandResult(result: unknown): asserts result is CommandResult {
  expect(result).toBeDefined();
  expect(result).not.toBeNull();
  expect(typeof result).toBe("object");
  expect(typeof (result as CommandResult).exitCode).toBe("number");
}

describe("Unified Status Command", () => {
  let exportDir: string;
  let oldXdgConfig: string | undefined;
  let oldXdgData: string | undefined;
  let oldMemoryHome: string | undefined;
  let oldUserProfile: string | undefined;
  let oldHome: string | undefined;

  beforeAll(() => {
    exportDir = mkdtempSync(join(tmpdir(), "memory-status-test-"));

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

  test("status with no flags returns exitCode 0", async () => {
    const result = await executeStatusCommand({ quiet: true });
    expectCommandResult(result);
    expect(result.exitCode).toBe(0);
  });

  test("status --json returns structured diagnostic data with exitCode 0", async () => {
    let capturedJson = "";
    const originalConsoleLog = console.log;
    console.log = (msg: string) => {
      capturedJson = msg;
    };

    try {
      const result = await executeStatusCommand({ json: true });
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(capturedJson);
      expect(parsed.health).toBeDefined();
      expect(parsed.config).toBeDefined();
      expect(parsed.hooks).toBeDefined();
      expect(parsed.embedding).toBeDefined();
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test("stats wrapper command returns exitCode 0 and outputs json", async () => {
    let capturedJson = "";
    const originalConsoleLog = console.log;
    console.log = (msg: string) => {
      capturedJson = msg;
    };

    try {
      const result = await executeStatsCommand({ json: true });
      expectCommandResult(result);
      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(capturedJson);
      expect(parsed.command).toBe("stats");
      expect(parsed.kind).toBe("stats");
      expect(parsed.data.totalSessions).toBeDefined();
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test("doctor wrapper command returns exitCode 1 due to sandboxed environment warnings", async () => {
    const result = await executeDoctorCommand({ fix: false });
    expectCommandResult(result);
    // Sandboxed Doctor returns 1 due to missing hooks and un-indexed vector search
    expect(result.exitCode).toBe(1);
  });
});
