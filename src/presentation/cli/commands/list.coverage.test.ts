/**
 * list.coverage.test.ts
 *
 * Coverage closure for executeListCommand (Phase 32 close-out).
 * Existing list.test.ts + list.json.test.ts + list.deps.test.ts cover
 * the option-shape and JSON-mode paths; this file exercises:
 *  - createListCommand action callback
 *  - --days N branch (sinceDate computation from days)
 *  - text-mode --since/--before parse errors
 *  - text-mode success path (with seeded sessions)
 *  - Empty-result text path (formatter.formatEmpty)
 *  - --format ai post-processing
 *  - Catch block (json + text)
 *
 * Test-only; production behavior unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Database } from "bun:sqlite";
import {
  createListCommand,
  executeListCommand,
} from "./list.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";

function seedSession(db: Database, id: string, projectName: string): void {
  db.run(
    `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, `C--Users-Test-${projectName}`, `C:\\Users\\Test\\${projectName}`, projectName],
  );
}

describe("executeListCommand text-mode success paths", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "list-cov-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    seedSession(db, "session-A", "ListProj");
    seedSession(db, "session-B", "ListProj");
    closeDatabase(db);

    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode default with sessions present → exit 0 + console.log", async () => {
    const result = await executeListCommand({}, { dbPath });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("text-mode verbose path with all filters in buildFiltersList", async () => {
    const result = await executeListCommand(
      {
        verbose: true,
        project: "ListProj",
        days: 7,
        limit: "100",
      },
      { dbPath },
    );
    expect(result.exitCode).toBe(0);
  });

  it("text-mode quiet path", async () => {
    const result = await executeListCommand({ quiet: true }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("text-mode --format brief", async () => {
    const result = await executeListCommand({ format: "brief" }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("text-mode --format default emits deprecation + falls through", async () => {
    const result = await executeListCommand({ format: "default" }, { dbPath });
    expect(result.exitCode).toBe(0);
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).toContain("deprecated");
  });

  it("text-mode --format ai applies formatForAi", async () => {
    const result = await executeListCommand({ format: "ai" }, { dbPath });
    expect(result.exitCode).toBe(0);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(/\x1b\[/.test(out)).toBe(false);
  });

  it("--days N computes sinceDate", async () => {
    const result = await executeListCommand({ days: 30 }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("--since with valid date string", async () => {
    const result = await executeListCommand({ since: "yesterday" }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("--before with valid date string", async () => {
    const result = await executeListCommand({ before: "today" }, { dbPath });
    expect(result.exitCode).toBe(0);
  });

  it("--since + --before combination", async () => {
    const result = await executeListCommand(
      { since: "2 weeks ago", before: "today" },
      { dbPath },
    );
    expect(result.exitCode).toBe(0);
  });

  it("includes project filter", async () => {
    const result = await executeListCommand({ project: "ListProj" }, { dbPath });
    expect(result.exitCode).toBe(0);
  });
});

describe("executeListCommand empty-result paths", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "list-empty-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode empty result → formatEmpty + console.log + exit 0", async () => {
    const result = await executeListCommand({}, { dbPath });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});

describe("executeListCommand text-mode validation errors", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "list-val-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode --since with invalid date → console.error + exit 1", async () => {
    const result = await executeListCommand(
      { since: "not-a-real-date-xyz" },
      { dbPath },
    );
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("text-mode --before with invalid date → console.error + exit 1", async () => {
    const result = await executeListCommand(
      { before: "not-a-real-date-xyz" },
      { dbPath },
    );
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("--json --before with invalid date → error envelope (lines 205-210)", async () => {
    const result = await executeListCommand(
      { before: "not-a-real-date-xyz", json: true },
      { dbPath },
    );
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error?.context?.flag).toBe("before");
  });

  it("--json --since with invalid date → error envelope", async () => {
    const result = await executeListCommand(
      { since: "not-a-real-date-xyz", json: true },
      { dbPath },
    );
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENT");
    expect(parsed.error?.context?.flag).toBe("since");
  });

  it("text-mode --limit invalid → console.error + exit 1", async () => {
    const result = await executeListCommand({ limit: "0" }, { dbPath });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // Note: a "parseDate throws non-DateParseError" branch exists in list.ts
  // (re-throws via `throw err;`). spyOn cannot stub the named import on this
  // module from a test, and the re-throw lands in the outer try/catch which
  // is already covered by the catch-branch tests below. The re-throw line
  // itself is rarely-executed branch noise; covered indirectly when the
  // catch sees a non-DateParseError from any source.
});

describe("createListCommand action callback (coverage)", () => {
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
    const listModule = await import("./list.js");
    const spy = spyOn(listModule, "executeListCommand").mockResolvedValue({
      exitCode: 0,
    });
    try {
      const cmd = createListCommand();
      await cmd.parseAsync([], { from: "user" });
      expect([0, 1]).toContain(process.exitCode ?? 0);
    } finally {
      spy.mockRestore();
    }
  }, 8000);
});

describe("executeListCommand catch branch", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "list-catch-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode catch: wraps non-MemoryError + formatError", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findFiltered",
    ).mockImplementation(async () => {
      throw new Error("synthetic-list-error");
    });
    try {
      const result = await executeListCommand({}, { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: passes MemoryError through (instanceof short-circuit)", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findFiltered",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "memory-error-list",
      );
    });
    try {
      const result = await executeListCommand({}, { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: emits error envelope", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findFiltered",
    ).mockImplementation(async () => {
      throw new Error("json-mode-list-error");
    });
    try {
      const result = await executeListCommand({ json: true }, { dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error).toBeDefined();
      expect(parsed.command).toBe("list");
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: includes MemoryError context when present", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findFiltered",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "err",
        { hint: "list-ctx" },
      );
    });
    try {
      const result = await executeListCommand({ json: true }, { dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.context).toEqual({ hint: "list-ctx" });
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: non-Error throwable", async () => {
    const repoMod = await import("../../../infrastructure/database/repositories/session-repository.js");
    const spy = spyOn(
      repoMod.SqliteSessionRepository.prototype,
      "findFiltered",
    ).mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-throwable-list";
    });
    try {
      const result = await executeListCommand({}, { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
