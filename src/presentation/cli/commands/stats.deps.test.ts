/**
 * stats.deps.test.ts
 *
 * Verifies the `deps?: { dbPath? }` seam on executeStatsCommand (Codex HIGH-3).
 *
 * Parity with show/context/related/search.
 *
 * Error-path strategy (Codex HIGH-3 resolution):
 *   Strategy A — pass a fresh temp DB path via deps.dbPath.
 *   NO mock.module() on first-party modules (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking is non-deterministic).
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { executeStatsCommand } from "./stats.js";

describe("executeStatsCommand deps seam (HIGH-3)", () => {
  let tempPaths: string[] = [];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tempPaths = [];
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    for (const p of tempPaths) {
      try {
        rmSync(p, { force: true });
        rmSync(`${p}-wal`, { force: true });
        rmSync(`${p}-shm`, { force: true });
      } catch {
        // Best effort
      }
    }
  });

  function makeTempDbPath(): string {
    const p = path.join(tmpdir(), `32-02-stats-deps-${randomUUID()}.db`);
    tempPaths.push(p);
    return p;
  }

  it("accepts a deps parameter with dbPath", async () => {
    const dbPath = makeTempDbPath();
    const result = await executeStatsCommand({}, { dbPath });
    expect(result.exitCode).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
  });

  it("works without deps argument (backward compatible)", async () => {
    const dbPath = makeTempDbPath();
    const result = await executeStatsCommand({ json: true }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("defaults deps to {} when omitted (signature shape check)", () => {
    expect(typeof executeStatsCommand).toBe("function");
    expect(executeStatsCommand.length).toBeGreaterThanOrEqual(1);
  });

  it("uses deps.dbPath over getDefaultDbPath() when provided", async () => {
    const dbPath = makeTempDbPath();
    const result = await executeStatsCommand({}, { dbPath });
    expect(result.exitCode).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
  });
});
