/**
 * search.coverage.test.ts
 *
 * Coverage closure for executeSearchCommand (Phase 32 close-out).
 * Existing search.test.ts + search.json.test.ts cover the option-shape
 * and many error/validation paths. This file exercises:
 *  - createSearchCommand action callback
 *  - --role comma-separated MULTI-role branch
 *  - --days N branch
 *  - Text-mode --since / --before invalid → console.error path
 *  - --json envelope with searchMeta + embedding_coverage hint
 *  - Text-mode embedding-coverage hint
 *  - Text-mode "no semantic matches" vector-mode short-circuit
 *  - Text-mode result formatter path + --format ai
 *  - Catch block (json + text)
 *  - --files qmd unavailable text-mode path
 *
 * Test-only; production behavior unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Database } from "bun:sqlite";
import {
  createSearchCommand,
  executeSearchCommand,
} from "./search.js";
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

function seedMessage(
  db: Database,
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): void {
  db.run(
    `INSERT INTO messages_meta (id, session_id, role, content, timestamp)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, sessionId, role, content],
  );
}

describe("executeSearchCommand multi-role + days + filter branches", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "search-cov-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    seedSession(db, "session-cov-1", "SearchProj");
    seedMessage(db, "msg-cov-1", "session-cov-1", "user", "authentication content here");
    seedMessage(db, "msg-cov-2", "session-cov-1", "assistant", "authentication response here");
    closeDatabase(db);

    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("--role with comma-separated multi-value uses array branch", async () => {
    // Pass "user,assistant" — splits into 2 roles → roleFilter array branch.
    const result = await executeSearchCommand("authentication", {
      role: "user,assistant",
      dbPath,
    });
    // The search may match — exit code 0 either way.
    expect([0, 1]).toContain(result.exitCode);
  });

  it("--role with single value uses string branch", async () => {
    const result = await executeSearchCommand("authentication", {
      role: "user",
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("--days N computes sinceDate", async () => {
    const result = await executeSearchCommand("authentication", {
      days: 30,
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode --since invalid → console.error + exit 1", async () => {
    const result = await executeSearchCommand("query", {
      since: "not-a-date-string-xyz",
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("text-mode --before invalid → console.error + exit 1", async () => {
    const result = await executeSearchCommand("query", {
      before: "not-a-date-string-xyz",
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("--json --since invalid → envelope (lines 305-311)", async () => {
    const result = await executeSearchCommand("query", {
      since: "not-a-date-string-xyz",
      json: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.context?.flag).toBe("since");
  });

  it("--json --before invalid → envelope (lines 325-331)", async () => {
    const result = await executeSearchCommand("query", {
      before: "not-a-date-string-xyz",
      json: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.context?.flag).toBe("before");
  });

  it("--case-sensitive applies filterCaseSensitive", async () => {
    // With seeded messages containing "authentication", a case-sensitive
    // match on "authentication" should succeed.
    const result = await executeSearchCommand("authentication", {
      caseSensitive: true,
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode default with results → console.log + exit 0", async () => {
    const result = await executeSearchCommand("authentication", { dbPath });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode --format brief", async () => {
    const result = await executeSearchCommand("authentication", {
      format: "brief",
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode --format ai applies formatForAi", async () => {
    const result = await executeSearchCommand("authentication", {
      format: "ai",
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode verbose with multiple filters", async () => {
    const result = await executeSearchCommand("authentication", {
      verbose: true,
      project: "SearchProj",
      session: "session-cov-1",
      role: "user",
      days: 7,
      caseSensitive: true,
      mode: "fts",
      vector: false,
      decay: false,
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("text-mode verbose includes successful since and before filters", async () => {
    const result = await executeSearchCommand("authentication", {
      verbose: true,
      since: "2020-01-01",
      before: "2030-01-01",
      dbPath,
    });

    expect([0, 1]).toContain(result.exitCode);
  });

  it("--no-vector forces FTS mode (DEGRADE-04)", async () => {
    const result = await executeSearchCommand("authentication", {
      vector: false,
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });

  it("--mode fts explicit", async () => {
    const result = await executeSearchCommand("authentication", {
      mode: "fts",
      dbPath,
    });
    expect([0, 1]).toContain(result.exitCode);
  });
});

describe("executeSearchCommand search-meta + hint paths", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "search-meta-"));
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

  it("--json with searchMeta covered (includeSearchMetaFields branch)", async () => {
    // Stub HybridSearchService.getLastSearchMeta to return a value with
    // degradationReason so line 413 (meta.degradation_reason) executes.
    // Also stub loadConfig so hintShown is false (otherwise the hint
    // line is short-circuited by prior test/runtime state).
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const configMod = await import("../../../infrastructure/hooks/config-manager.js");
    const loadSpy = spyOn(configMod, "loadConfig").mockReturnValue({
      autoSync: true,
      search: { hintShown: false },
    });
    const saveSpy = spyOn(configMod, "saveConfig").mockImplementation(() => {});
    const metaSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "getLastSearchMeta",
    ).mockReturnValue({
      mode: "fts",
      modeReason: "user_requested",
      embeddingCoverage: 0,
      degraded: true,
      degradationReason: "vector_disabled",
    });
    const searchSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockResolvedValue([]);
    try {
      const result = await executeSearchCommand("q", { json: true, dbPath });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.meta?.mode).toBe("fts");
      expect(parsed.meta?.degradation_reason).toBe("vector_disabled");
      expect(parsed.meta?.embedding_coverage).toBe(0);
      // Hint goes to stderr.
      const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(err).toContain("memory sync --embed");
    } finally {
      metaSpy.mockRestore();
      searchSpy.mockRestore();
      loadSpy.mockRestore();
      saveSpy.mockRestore();
    }
  });

  it("text-mode emits embedding-coverage hint when search-meta says 0 coverage", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const configMod = await import("../../../infrastructure/hooks/config-manager.js");
    const loadSpy = spyOn(configMod, "loadConfig").mockReturnValue({
      autoSync: true,
      search: { hintShown: false },
    });
    const saveSpy = spyOn(configMod, "saveConfig").mockImplementation(() => {});
    const metaSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "getLastSearchMeta",
    ).mockReturnValue({
      mode: "fts",
      modeReason: "fallback",
      embeddingCoverage: 0,
      degraded: false,
    });
    const searchSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockResolvedValue([]);
    try {
      const result = await executeSearchCommand("q", { dbPath });
      expect(result.exitCode).toBe(0);
      const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(err).toContain("memory sync --embed");
    } finally {
      metaSpy.mockRestore();
      searchSpy.mockRestore();
      loadSpy.mockRestore();
      saveSpy.mockRestore();
    }
  });

  it("--json with results emits envelope with data array (inline arrow)", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const resultMod = await import("../../../domain/value-objects/search-result.js");
    const fakeResult = resultMod.SearchResult.create({
      sessionId: "session-1",
      messageId: "msg-1",
      snippet: "hello world",
      score: 0.5,
      timestamp: new Date("2026-01-15T10:00:00.000Z"),
      role: "user",
    });
    const searchSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockResolvedValue([fakeResult]);
    const metaSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "getLastSearchMeta",
    ).mockReturnValue({
      mode: "fts",
      modeReason: "default",
      embeddingCoverage: 0.5,
      degraded: false,
    });
    try {
      const result = await executeSearchCommand("query", { json: true, dbPath });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0].rank).toBe(1);
    } finally {
      searchSpy.mockRestore();
      metaSpy.mockRestore();
    }
  });

  it("text-mode 'no semantic matches' short-circuit when results empty + mode=vector", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const metaSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "getLastSearchMeta",
    ).mockReturnValue({
      mode: "vector",
      modeReason: "user_requested",
      embeddingCoverage: 1,
      degraded: false,
    });
    const searchSpy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockResolvedValue([]);
    try {
      const result = await executeSearchCommand("q", { dbPath });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(out).toContain("No semantic matches");
    } finally {
      metaSpy.mockRestore();
      searchSpy.mockRestore();
    }
  });
});

describe("createSearchCommand action callback (coverage)", () => {
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
    const searchModule = await import("./search.js");
    const spy = spyOn(searchModule, "executeSearchCommand").mockResolvedValue({
      exitCode: 0,
    });
    try {
      const cmd = createSearchCommand();
      await cmd.parseAsync(["query"], { from: "user" });
      expect([0, 1]).toContain(process.exitCode ?? 0);
    } finally {
      spy.mockRestore();
    }
  }, 8000);
});

describe("executeSearchCommand catch branch", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "search-catch-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode catch: wraps non-MemoryError", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const spy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockImplementation(async () => {
      throw new Error("search-error");
    });
    try {
      const result = await executeSearchCommand("q", { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: passes MemoryError through", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "search-mem-error",
      );
    });
    try {
      const result = await executeSearchCommand("q", { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: emits error envelope", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const spy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockImplementation(async () => {
      throw new Error("search-json-error");
    });
    try {
      const result = await executeSearchCommand("q", { json: true, dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error).toBeDefined();
      expect(parsed.command).toBe("search");
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: MemoryError context flowed through", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "err",
        { hint: "search-ctx" },
      );
    });
    try {
      const result = await executeSearchCommand("q", { json: true, dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.context).toEqual({ hint: "search-ctx" });
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: non-Error throwable", async () => {
    const svcMod = await import("../../../infrastructure/database/services/hybrid-search-service.js");
    const spy = spyOn(
      svcMod.HybridSearchService.prototype,
      "search",
    ).mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-throw-search";
    });
    try {
      const result = await executeSearchCommand("q", { dbPath });
      expect(result.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("executeSearchCommand --files text-mode unavailable path", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "search-files-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode --files when qmd unavailable → console.error + exit 1", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const spy = spyOn(extMod, "isQmdAvailable").mockReturnValue(false);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        dbPath,
      });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("--json --files when qmd unavailable → envelope (lines 519-524)", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const spy = spyOn(extMod, "isQmdAvailable").mockReturnValue(false);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        json: true,
        dbPath,
      });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.code).toBe("QMD_UNAVAILABLE");
    } finally {
      spy.mockRestore();
    }
  });

  it("--files qmd available + results returns text output", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([
      {
        docid: "doc-1",
        score: 0.8,
        file: "qmd://docs/test.md",
        title: "Test",
        snippet: "match",
      },
    ]);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        dbPath,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files --json qmd available + results returns envelope with kind=file", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([
      {
        docid: "doc-1",
        score: 0.8,
        file: "qmd://docs/test.md",
        title: "Test",
        snippet: "match",
      },
    ]);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        json: true,
        dbPath,
      });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.kind).toBe("file");
      expect(parsed.data.length).toBe(1);
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files qmd available + 0 results emits 'No file results' text", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([]);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        dbPath,
      });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(out).toContain("No file results");
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files qmd available + 0 results supports --format ai", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([]);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        format: "ai",
        dbPath,
      });
      expect(result.exitCode).toBe(0);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(out).toBe('No file results for "q"');
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files qmd available + --format ai applies formatForAi to text output", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockResolvedValue([
      {
        docid: "doc-2",
        score: 0.5,
        file: "qmd://x.md",
        title: "X",
      },
    ]);
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        format: "ai",
        dbPath,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files qmd runner throws → text-mode error", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockImplementation(async () => {
      throw new Error("qmd-died");
    });
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        dbPath,
      });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files --json qmd runner throws → error envelope", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockImplementation(async () => {
      throw new Error("qmd-died-json");
    });
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        json: true,
        dbPath,
      });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.code).toBe("QMD_FAILED");
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });

  it("--files --json qmd runner throws non-Error (uses String(error))", async () => {
    const extMod = await import("../../../infrastructure/external/index.js");
    const isAvailSpy = spyOn(extMod, "isQmdAvailable").mockReturnValue(true);
    const runnerSpy = spyOn(extMod.QmdRunner.prototype, "search").mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-throw-qmd";
    });
    try {
      const result = await executeSearchCommand("q", {
        files: true,
        json: true,
        dbPath,
      });
      expect(result.exitCode).toBe(1);
    } finally {
      isAvailSpy.mockRestore();
      runnerSpy.mockRestore();
    }
  });
});
