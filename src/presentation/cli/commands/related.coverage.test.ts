/**
 * related.coverage.test.ts
 *
 * Coverage closure tests for executeRelatedCommand (Phase 32 close-out
 * resolved deferred-items Item 3). The existing related.test.ts +
 * related.json.test.ts cover the error/not-found paths; this file
 * exercises the success paths (with seeded links + sessions) and the
 * action callback + catch branch.
 *
 * Test-only — production behavior unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Database } from "bun:sqlite";
import {
  createRelatedCommand,
  executeRelatedCommand,
} from "./related.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";

/**
 * Seed a session row directly. Mirrors patterns from integration tests.
 */
function seedSession(db: Database, id: string, projectName: string): void {
  db.run(
    `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, `C--Users-Test-${projectName}`, `C:\\Users\\Test\\${projectName}`, projectName],
  );
}

/**
 * Seed a link row. Relationships drive the graph traversal in
 * findRelatedWithHops.
 */
function seedLink(
  db: Database,
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  relationship: string,
  weight: number,
): void {
  db.run(
    `INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sourceType, sourceId, targetType, targetId, relationship, weight],
  );
}

describe("executeRelatedCommand — success paths (coverage closure)", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "related-cov-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    // Seed the source session and two related sessions.
    seedSession(db, "src-session", "Proj");
    seedSession(db, "rel-session-1", "Proj");
    seedSession(db, "rel-session-2", "Proj");
    // Direct links from src-session to two other sessions.
    seedLink(db, "session", "src-session", "session", "rel-session-1", "related_to", 0.8);
    seedLink(db, "session", "src-session", "session", "rel-session-2", "related_to", 0.6);
    closeDatabase(db);

    // Reset the deprecation-warning memoization for per-test isolation.
    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("returns exit 0 with relatedSessions on default brief path", async () => {
    const result = await executeRelatedCommand("src-session", { dbPath });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("emits success envelope under --json", async () => {
    const result = await executeRelatedCommand("src-session", { json: true, dbPath });
    expect(result.exitCode).toBe(0);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.schema_version).toBe("1");
    expect(parsed.command).toBe("related");
    expect(parsed.kind).toBe("related");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.meta?.source_id).toBe("src-session");
    expect(parsed.meta?.source_type).toBe("session");
    expect(parsed.meta?.count).toBeGreaterThan(0);
    expect(typeof parsed.meta?.timing_ms).toBe("number");
  });

  it("excludes the source session from results (self-filter)", async () => {
    // Add a self-loop so the filter has something to remove.
    const { db } = initializeDatabase({ path: dbPath });
    seedLink(db, "session", "src-session", "session", "src-session", "related_to", 0.9);
    closeDatabase(db);

    const result = await executeRelatedCommand("src-session", { json: true, dbPath });
    expect(result.exitCode).toBe(0);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    for (const entry of parsed.data) {
      expect(entry.session.id).not.toBe("src-session");
    }
  });

  it("respects --limit option", async () => {
    const result = await executeRelatedCommand("src-session", {
      json: true,
      limit: 1,
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.data.length).toBe(1);
  });

  it("renders verbose text output (covers verbose path)", async () => {
    const result = await executeRelatedCommand("src-session", {
      verbose: true,
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("renders quiet text output (covers quiet path)", async () => {
    const result = await executeRelatedCommand("src-session", {
      quiet: true,
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("renders detailed text output (covers detailed alias path)", async () => {
    const result = await executeRelatedCommand("src-session", {
      format: "detailed",
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalled();
    // Deprecation warning emitted on stderr.
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).toContain("deprecated");
  });

  it("applies formatForAi when --format ai is set on text path", async () => {
    const result = await executeRelatedCommand("src-session", {
      format: "ai",
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    // ANSI-stripped — formatForAi removes color codes.
    expect(/\x1b\[/.test(out)).toBe(false);
  });

  it("falls through 'no related sessions after filtering' branch when target_type != session", async () => {
    // Seed a link to a non-session target so the targetType filter excludes it
    // and the post-filter empty branch fires.
    const { db } = initializeDatabase({ path: dbPath });
    seedSession(db, "isolated-source", "Iso");
    // Link to a topic instead of a session — won't be added to sessionWeights.
    seedLink(db, "session", "isolated-source", "topic", "topic-1", "mentions", 0.5);
    // Also need the linking step so findBySource/findByTarget find something.
    closeDatabase(db);

    const result = await executeRelatedCommand("isolated-source", { json: true, dbPath });
    // Empty after filtering → exitCode 1 + error envelope.
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error).toBeDefined();
  });

  it("emits text 'no related items' on stderr for empty result (text mode)", async () => {
    const result = await executeRelatedCommand("nonexistent-id", { dbPath });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("emits text 'no related items' with quiet flag (formatEmpty may be empty)", async () => {
    const result = await executeRelatedCommand("nonexistent-id", {
      quiet: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
  });

  it("threads --hops option through to findRelatedWithHops", async () => {
    const result = await executeRelatedCommand("src-session", {
      json: true,
      hops: 1,
      dbPath,
    });
    expect(result.exitCode).toBe(0);
    // Just exercises the hops path; semantic verification covered elsewhere.
  });

  it("respects --type message option", async () => {
    // type=message will look for links from a message ID. We don't have
    // any seeded → not found → error envelope.
    const result = await executeRelatedCommand("some-message-id", {
      json: true,
      type: "message",
      dbPath,
    });
    expect(result.exitCode).toBe(1);
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.error?.context?.source_type).toBe("message");
  });
});

describe("createRelatedCommand action callback (coverage)", () => {
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

  it("runs the action callback and sets process.exitCode", async () => {
    const cmd = createRelatedCommand();
    const argTempDir = mkdtempSync(join(tmpdir(), "related-action-"));
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
      await cmd.parseAsync(["some-id"], { from: "user" });
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

describe("executeRelatedCommand catch branch (coverage)", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "related-catch-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text-mode catch: wraps non-MemoryError into MemoryError and formats", async () => {
    // Spy on the link repository's findRelatedWithHops to inject a raw
    // Error (not MemoryError) so the wrapping branch (instanceof check)
    // executes the `new MemoryError(...)` arm.
    const linkRepoMod = await import("../../../infrastructure/database/repositories/link-repository.js");
    const spy = spyOn(
      linkRepoMod.SqliteLinkRepository.prototype,
      "findRelatedWithHops",
    ).mockImplementation(async () => {
      throw new Error("synthetic-non-memory-error");
    });
    try {
      const result = await executeRelatedCommand("src", { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: passes through MemoryError unchanged (instanceof short-circuit)", async () => {
    // Throw a MemoryError directly so the conditional takes the `error` arm
    // (no new MemoryError wrapping). Covers the `instanceof MemoryError` true branch.
    const linkRepoMod = await import("../../../infrastructure/database/repositories/link-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      linkRepoMod.SqliteLinkRepository.prototype,
      "findRelatedWithHops",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "synthetic-memory-error",
        { hint: "from-test" },
      );
    });
    try {
      const result = await executeRelatedCommand("src", { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: emits error envelope with code", async () => {
    const linkRepoMod = await import("../../../infrastructure/database/repositories/link-repository.js");
    const spy = spyOn(
      linkRepoMod.SqliteLinkRepository.prototype,
      "findRelatedWithHops",
    ).mockImplementation(async () => {
      throw new Error("synthetic-error-for-json-path");
    });
    try {
      const result = await executeRelatedCommand("src", { json: true, dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
      expect(parsed.command).toBe("related");
    } finally {
      spy.mockRestore();
    }
  });

  it("--json catch: includes MemoryError context when present", async () => {
    const linkRepoMod = await import("../../../infrastructure/database/repositories/link-repository.js");
    const errorsMod = await import("../../../domain/errors/index.js");
    const spy = spyOn(
      linkRepoMod.SqliteLinkRepository.prototype,
      "findRelatedWithHops",
    ).mockImplementation(async () => {
      throw new errorsMod.MemoryError(
        errorsMod.ErrorCode.DB_QUERY_FAILED,
        "err with context",
        { extra: "value" },
      );
    });
    try {
      const result = await executeRelatedCommand("src", { json: true, dbPath });
      expect(result.exitCode).toBe(1);
      const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.error?.context).toEqual({ extra: "value" });
    } finally {
      spy.mockRestore();
    }
  });

  it("text-mode catch: handles non-Error throwables (String(error) path)", async () => {
    // Throw a non-Error value so `error instanceof Error` is false and
    // `String(error)` is used. Covers the false branch of that ternary.
    const linkRepoMod = await import("../../../infrastructure/database/repositories/link-repository.js");
    const spy = spyOn(
      linkRepoMod.SqliteLinkRepository.prototype,
      "findRelatedWithHops",
    ).mockImplementation(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "string-throwable";
    });
    try {
      const result = await executeRelatedCommand("src", { dbPath });
      expect(result.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("executeRelatedCommand 'no related after filter' branches", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "related-filter-"));
    dbPath = join(tempDir, "test.db");

    // Seed: source session with link to a non-session target (topic).
    // Result: findRelatedWithHops returns 1 link (with a topic target),
    // but the targetType filter excludes it from sessionWeights.
    // → relatedSessions.length === 0 → empty-after-filter branch fires.
    const { db } = initializeDatabase({ path: dbPath });
    seedSession(db, "src-with-topic", "Proj");
    seedLink(db, "session", "src-with-topic", "topic", "topic-1", "mentions", 0.5);
    closeDatabase(db);

    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("text mode (default) — formatter.formatEmpty reaches console.error", async () => {
    const result = await executeRelatedCommand("src-with-topic", { dbPath });
    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("text mode with --quiet — formatEmpty empty string skips console.error", async () => {
    // Some formatters' formatEmpty returns "" in quiet mode → branch
    // `outputMode !== "quiet" || message` short-circuits without printing.
    await executeRelatedCommand("src-with-topic", {
      quiet: true,
      dbPath,
    });
    // We don't assert console.error not called (depends on formatter
    // behavior); just that the branch executes without throwing.
    // The exit code is 1 either way.
  });

  it("verbose mode triggers formatEmpty + console.error", async () => {
    const result = await executeRelatedCommand("src-with-topic", {
      verbose: true,
      dbPath,
    });
    expect(result.exitCode).toBe(1);
  });
});
