/**
 * query.coverage.test.ts
 *
 * Coverage closure for unified query command (Phase 32.5 Surface Consolidation).
 * Exercises all switch cases, option parsers, error branches, environment
 * variable overrides, and the Commander action callback.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createQueryCommand, executeQueryCommand } from "./query.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
import * as extMod from "../../../infrastructure/external/index.js";

describe("Unified Query Command — Option Parsers and Validation", () => {
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("parses valid days value", () => {
    const cmd = createQueryCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;
    expect(parser).toBeDefined();

    const result = parser?.("7", undefined);
    expect(result).toBe(7);
  });

  it("rejects non-numeric --days value", () => {
    const cmd = createQueryCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;
    expect(() => parser?.("abc", undefined)).toThrow("Days must be a positive number");
  });

  it("rejects zero --days value", () => {
    const cmd = createQueryCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;
    expect(() => parser?.("0", undefined)).toThrow("Days must be a positive number");
  });

  it("rejects negative --days value", () => {
    const cmd = createQueryCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;
    expect(() => parser?.("-5", undefined)).toThrow("Days must be a positive number");
  });
});

describe("executeQueryCommand — dynamic routing end-to-end", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "query-cov-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("routes message kind correctly (FTS/Search path)", async () => {
    const result = await executeQueryCommand("test query", {
      kind: "message",
      dbPath,
    });
    expect(result.exitCode).toBe(0);
  });

  it("routes file kind correctly (FTS/Search file path)", async () => {
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([]);
    try {
      const result = await executeQueryCommand("test file", {
        kind: "file",
        dbPath,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("routes session kind (show) with argument correctly", async () => {
    const result = await executeQueryCommand("some-session-id", {
      kind: "session",
      dbPath,
    });
    expect(result.exitCode).toBe(1); // Not found on empty DB
  });

  it("routes session kind (list) without argument correctly", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "session",
      dbPath,
    });
    expect(result.exitCode).toBe(0); // Empty list returns 0
  });

  it("routes stats kind correctly", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "stats",
      dbPath,
    });
    expect(result.exitCode).toBe(0);
  });

  it("routes context kind with project argument correctly", async () => {
    const result = await executeQueryCommand("my-project", {
      kind: "context",
      dbPath,
    });
    expect(result.exitCode).toBe(1); // Project not found on empty DB
  });

  it("handles context kind without project argument (text mode)", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "context",
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("handles context kind without project argument (JSON mode)", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "context",
      json: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENT");
  });

  it("routes related kind with source ID correctly", async () => {
    const result = await executeQueryCommand("source-id", {
      kind: "related",
      dbPath,
    });
    expect(result.exitCode).toBe(1); // Not found on empty DB
  });

  it("handles related kind without source ID (text mode)", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "related",
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("handles related kind without source ID (JSON mode)", async () => {
    const result = await executeQueryCommand(undefined, {
      kind: "related",
      json: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENT");
  });

  it("handles unsupported kind (text mode)", async () => {
    const result = await executeQueryCommand("arg", {
      kind: "unsupported" as any,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("handles unsupported kind (JSON mode)", async () => {
    const result = await executeQueryCommand("arg", {
      kind: "unsupported" as any,
      json: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENT");
  });

  it("preserves pre-existing environment override when routing", async () => {
    process.env.MEMORY_JSON_COMMAND_OVERRIDE = "original-override";
    try {
      const result = await executeQueryCommand("test query", {
        kind: "message",
        dbPath,
      });
      expect(result.exitCode).toBe(0);
      expect(process.env.MEMORY_JSON_COMMAND_OVERRIDE).toBe("original-override");
    } finally {
      delete process.env.MEMORY_JSON_COMMAND_OVERRIDE;
    }
  });
});

describe("createQueryCommand action callback (coverage)", () => {
  let originalExitCode: number | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("runs the action callback and sets process.exitCode in sandboxed environment", async () => {
    const cmd = createQueryCommand();
    const argTempDir = mkdtempSync(join(tmpdir(), "query-action-"));
    const oldXdgData = process.env.XDG_DATA_HOME;
    const oldXdgConfig = process.env.XDG_CONFIG_HOME;
    const oldMemoryHome = process.env.MEMORY_HOME;

    process.env.XDG_DATA_HOME = join(argTempDir, "data");
    process.env.XDG_CONFIG_HOME = join(argTempDir, "config");
    process.env.MEMORY_HOME = join(argTempDir, "memory");

    // Initialize an empty database at the sandboxed default path
    const { getDbPath } = await import("../../../infrastructure/paths.js");
    const sandboxedDbPath = getDbPath();
    const { db } = initializeDatabase({ path: sandboxedDbPath });
    closeDatabase(db);

    try {
      await cmd.parseAsync(["some-query"], { from: "user" });
      expect([0, 1]).toContain(process.exitCode ?? 0);
    } finally {
      if (oldXdgData) {
        process.env.XDG_DATA_HOME = oldXdgData;
      } else {
        delete process.env.XDG_DATA_HOME;
      }

      if (oldXdgConfig) {
        process.env.XDG_CONFIG_HOME = oldXdgConfig;
      } else {
        delete process.env.XDG_CONFIG_HOME;
      }

      if (oldMemoryHome) {
        process.env.MEMORY_HOME = oldMemoryHome;
      } else {
        delete process.env.MEMORY_HOME;
      }

      try { rmSync(argTempDir, { recursive: true, force: true }); } catch {}
    }
  });
});
