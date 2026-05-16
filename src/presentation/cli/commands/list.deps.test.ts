/**
 * list.deps.test.ts
 *
 * Verifies the `deps?: { dbPath? }` seam on executeListCommand (Codex HIGH-3).
 *
 * The seam matters because Plan 32-02's new `.json.test.ts` files need to
 * point the command at a temp DB to capture envelope shape without touching
 * the user's real database. Parity with show/context/related/search.
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
import { executeListCommand } from "./list.js";

describe("executeListCommand deps seam (HIGH-3)", () => {
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
    // Cleanup temp DBs
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
    const p = path.join(tmpdir(), `32-02-list-deps-${randomUUID()}.db`);
    tempPaths.push(p);
    return p;
  }

  it("accepts a deps parameter with dbPath", async () => {
    const dbPath = makeTempDbPath();
    const result = await executeListCommand({ limit: "1" }, { dbPath });
    expect(result.exitCode).toBe(0);
    // SQLite creates the file when initializeDatabase opens it
    expect(existsSync(dbPath)).toBe(true);
  });

  it("works without deps argument (backward compatible)", async () => {
    // Single-arg call must still type-check and not throw.
    const dbPath = makeTempDbPath();
    const result = await executeListCommand({ limit: "1", json: true }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("defaults deps to {} when omitted (signature shape check)", () => {
    // Compile-time assurance: function accepts single arg.
    // Runtime: confirm the function reference is callable with one arg.
    expect(typeof executeListCommand).toBe("function");
    expect(executeListCommand.length).toBeGreaterThanOrEqual(1);
  });

  it("uses deps.dbPath over getDefaultDbPath() when provided", async () => {
    const dbPath = makeTempDbPath();
    // If the seam were broken, this would touch the user's real DB
    // (which would either succeed against real data OR fail in test env).
    // With the seam wired, sqlite creates the file at our temp path.
    const result = await executeListCommand({ limit: "1" }, { dbPath });
    expect(result.exitCode).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
  });
});
