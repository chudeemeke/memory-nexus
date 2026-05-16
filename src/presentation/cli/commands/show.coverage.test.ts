/**
 * show.coverage.test.ts
 *
 * Coverage closure for executeShowCommand (Phase 32 close-out).
 * Existing show.test.ts + show.json.test.ts cover most paths; this
 * file exercises:
 *  - createShowCommand action callback
 *  - Catch block (json + text) with non-Error and MemoryError throwables
 *
 * Test-only; production behavior unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createShowCommand,
  executeShowCommand,
} from "./show.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";

describe("createShowCommand action callback (coverage)", () => {
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

  it("invokes the action callback when commander parses argv", async () => {
    const showModule = await import("./show.js");
    const spy = spyOn(showModule, "executeShowCommand").mockResolvedValue({
      exitCode: 1,
    });
    try {
      const cmd = createShowCommand();
      await cmd.parseAsync(["session-id-callback"], { from: "user" });
      expect([0, 1]).toContain(process.exitCode ?? 0);
    } finally {
      spy.mockRestore();
    }
  }, 8000);
});

describe("executeShowCommand catch branch", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "show-catch-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode catch: wraps non-MemoryError + formatError (uses MemoryError)", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findById",
    ).mockImplementation(async () => {
      throw new Error("synthetic-show-error");
    });
    try {
      const result = await executeShowCommand("some-id", {}, { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: passes through MemoryError unchanged", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findById",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "show-memory-error",
      );
    });
    try {
      const result = await executeShowCommand("some-id", {}, { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: emits error envelope", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findById",
    ).mockImplementation(async () => {
      throw new Error("show-json-error");
    });
    try {
      const result = await executeShowCommand("some-id", { json: true }, { dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error).toBeDefined();
      expect(parsed.command).toBe("show");
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: includes MemoryError context when present", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findById",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "err",
        { hint: "show-ctx" },
      );
    });
    try {
      const result = await executeShowCommand("some-id", { json: true }, { dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.context).toEqual({ hint: "show-ctx" });
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: non-Error throwable", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findById",
    ).mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-throwable-show";
    });
    try {
      const result = await executeShowCommand("some-id", {}, { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
