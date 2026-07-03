/**
 * QmdRunner Tests
 *
 * Tests for the infrastructure adapter that shells out to qmd
 * for searching markdown files. Follows the ClaudeSummaryGenerator
 * test pattern: spyOn child_process.spawn with EventEmitter mocks.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { QmdRunner, findExecutableOnPath, getQmdInfo, isQmdAvailable } from "./qmd-runner.js";

/**
 * Creates a mock child process with controllable stdout/stderr streams.
 * No stdin needed since qmd reads from CLI args, not stdin.
 */
function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
  };

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 54321;

  return proc;
}

describe("QmdRunner", () => {
  let runner: QmdRunner;
  let spawnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    runner = new QmdRunner();
  });

  afterEach(() => {
    spawnSpy?.mockRestore();
  });

  describe("search()", () => {
    it("spawns qmd with correct args", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("authentication patterns");

      const results = [{ score: 0.95, file: "auth.md", title: "Auth Guide" }];
      mockProc.stdout.emit("data", Buffer.from(JSON.stringify(results)));
      mockProc.emit("close", 0);

      await promise;

      expect(spawnSpy).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = spawnSpy.mock.calls[0];
      expect(cmd).toBe("qmd");
      expect(args).toEqual(["search", "authentication patterns", "--json"]);
      expect(opts.stdio).toEqual(["pipe", "pipe", "pipe"]);
    });

    it("parses multi-field JSON results", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("test query");

      const results = [
        {
          docid: "doc-001",
          score: 0.92,
          file: "qmd://docs/patterns.md",
          title: "Design Patterns",
          context: "surrounding text about patterns",
          snippet: "...design **patterns** are...",
        },
        {
          docid: "doc-002",
          score: 0.85,
          file: "decisions.md",
          title: "Decisions Log",
          context: "decision context",
          snippet: "...key decisions...",
        },
      ];
      mockProc.stdout.emit("data", Buffer.from(JSON.stringify(results)));
      mockProc.emit("close", 0);

      const parsed = await promise;

      expect(parsed).toHaveLength(2);
      expect(parsed[0].docid).toBe("doc-001");
      expect(parsed[0].score).toBe(0.92);
      expect(parsed[0].file).toBe("qmd://docs/patterns.md");
      expect(parsed[0].title).toBe("Design Patterns");
      expect(parsed[0].context).toBe("surrounding text about patterns");
      expect(parsed[0].snippet).toBe("...design **patterns** are...");
      expect(parsed[1].docid).toBe("doc-002");
      expect(parsed[1].score).toBe(0.85);
    });

    it("handles empty results (empty array)", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("nonexistent");

      mockProc.stdout.emit("data", Buffer.from("[]"));
      mockProc.emit("close", 0);

      const results = await promise;
      expect(results).toEqual([]);
    });

    it("rejects on non-zero exit code", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("bad query");

      mockProc.stderr.emit("data", Buffer.from("Index not found"));
      mockProc.emit("close", 1);

      await expect(promise).rejects.toThrow("qmd exited with code 1");
      await expect(promise).rejects.toThrow("Index not found");
    });

    it("rejects on spawn error (ENOENT)", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("test");

      mockProc.emit("error", new Error("spawn qmd ENOENT"));

      await expect(promise).rejects.toThrow("Failed to spawn qmd");
      await expect(promise).rejects.toThrow("ENOENT");
    });

    it("rejects on invalid JSON output", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("test");

      mockProc.stdout.emit("data", Buffer.from("not valid json {{{"));
      mockProc.emit("close", 0);

      await expect(promise).rejects.toThrow("Failed to parse qmd output");
    });

    it("handles multi-chunk stdout", async () => {
      const mockProc = createMockProcess();
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc as any);

      const promise = runner.search("chunked");

      const fullJson = JSON.stringify([
        { score: 0.8, file: "chunk.md", title: "Chunked Result" },
      ]);
      const mid = Math.floor(fullJson.length / 2);
      mockProc.stdout.emit("data", Buffer.from(fullJson.slice(0, mid)));
      mockProc.stdout.emit("data", Buffer.from(fullJson.slice(mid)));
      mockProc.emit("close", 0);

      const results = await promise;
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Chunked Result");
      expect(results[0].score).toBe(0.8);
    });
  });

  describe("isAvailable()", () => {
    it("returns true when qmd exists on PATH", () => {
      const fixture = createExecutableFixture("qmd");
      const originalPath = process.env.PATH;
      const originalPathAlias = process.env.Path;
      const originalPathExt = process.env.PATHEXT;

      try {
        process.env.PATH = fixture.dir;
        process.env.Path = fixture.dir;
        process.env.PATHEXT = "";

        expect(runner.isAvailable()).toBe(true);
      } finally {
        restorePathEnv(originalPath, originalPathAlias, originalPathExt);
        fixture.cleanup();
      }
    });

    it("returns false when qmd is not on PATH", () => {
      const originalPath = process.env.PATH;
      const originalPathAlias = process.env.Path;

      try {
        process.env.PATH = "";
        delete process.env.Path;

        expect(runner.isAvailable()).toBe(false);
      } finally {
        restorePathEnv(originalPath, originalPathAlias, process.env.PATHEXT);
      }
    });
  });

  describe("getHealthInfo()", () => {
    it("returns available=true with path", () => {
      const fixture = createExecutableFixture("qmd");
      const originalPath = process.env.PATH;
      const originalPathAlias = process.env.Path;
      const originalPathExt = process.env.PATHEXT;

      try {
        process.env.PATH = fixture.dir;
        process.env.Path = fixture.dir;
        process.env.PATHEXT = "";

        const info = runner.getHealthInfo();
        expect(info).toEqual({ available: true, path: fixture.path });
      } finally {
        restorePathEnv(originalPath, originalPathAlias, originalPathExt);
        fixture.cleanup();
      }
    });

    it("returns available=false, path=null", () => {
      const originalPath = process.env.PATH;
      const originalPathAlias = process.env.Path;

      try {
        process.env.PATH = "";
        delete process.env.Path;

        const info = runner.getHealthInfo();
        expect(info).toEqual({ available: false, path: null });
      } finally {
        restorePathEnv(originalPath, originalPathAlias, process.env.PATHEXT);
      }
    });
  });
});

describe("standalone functions", () => {
  it("isQmdAvailable() returns true when qmd found", () => {
    const fixture = createExecutableFixture("qmd");
    const originalPath = process.env.PATH;
    const originalPathAlias = process.env.Path;
    const originalPathExt = process.env.PATHEXT;

    try {
      process.env.PATH = fixture.dir;
      process.env.Path = fixture.dir;
      process.env.PATHEXT = "";

      expect(isQmdAvailable()).toBe(true);
    } finally {
      restorePathEnv(originalPath, originalPathAlias, originalPathExt);
      fixture.cleanup();
    }
  });

  it("isQmdAvailable() returns false when qmd not found", () => {
    const originalPath = process.env.PATH;
    const originalPathAlias = process.env.Path;

    try {
      process.env.PATH = "";
      delete process.env.Path;

      expect(isQmdAvailable()).toBe(false);
    } finally {
      restorePathEnv(originalPath, originalPathAlias, process.env.PATHEXT);
    }
  });

  it("getQmdInfo() returns available=true with path", () => {
    const fixture = createExecutableFixture("qmd");
    const originalPath = process.env.PATH;
    const originalPathAlias = process.env.Path;
    const originalPathExt = process.env.PATHEXT;

    try {
      process.env.PATH = fixture.dir;
      process.env.Path = fixture.dir;
      process.env.PATHEXT = "";

      const info = getQmdInfo();
      expect(info).toEqual({ available: true, path: fixture.path });
    } finally {
      restorePathEnv(originalPath, originalPathAlias, originalPathExt);
      fixture.cleanup();
    }
  });

  it("getQmdInfo() returns available=false, path=null", () => {
    const originalPath = process.env.PATH;
    const originalPathAlias = process.env.Path;

    try {
      process.env.PATH = "";
      delete process.env.Path;

      const info = getQmdInfo();
      expect(info).toEqual({ available: false, path: null });
    } finally {
      restorePathEnv(originalPath, originalPathAlias, process.env.PATHEXT);
    }
  });
});

describe("findExecutableOnPath", () => {
  it("finds an exact executable path without shelling out", () => {
    const fixture = createExecutableFixture("qmd");

    try {
      expect(findExecutableOnPath("qmd", { PATH: fixture.dir, PATHEXT: "" }, process.platform)).toBe(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("uses Path as a Windows-compatible PATH alias", () => {
    const fixture = createExecutableFixture("qmd");

    try {
      expect(findExecutableOnPath("qmd", { Path: fixture.dir, PATHEXT: "" }, process.platform)).toBe(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("resolves direct command paths even when PATH is empty", () => {
    const fixture = createExecutableFixture("qmd");

    try {
      expect(findExecutableOnPath(fixture.path, { PATH: "", PATHEXT: "" }, process.platform)).toBe(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("returns null for direct command paths that do not exist", () => {
    const fixture = createExecutableFixture("qmd");

    try {
      expect(findExecutableOnPath(join(fixture.dir, "missing-qmd"), { PATH: fixture.dir, PATHEXT: "" }, process.platform)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("honors Windows PATHEXT candidates", () => {
    const fixture = createExecutableFixture("qmd.CMD");

    try {
      expect(findExecutableOnPath("qmd", { PATH: fixture.dir, PATHEXT: ".CMD;.EXE" }, "win32")).toBe(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });

  it("does not expand PATHEXT when the command already has an extension", () => {
    const fixture = createExecutableFixture("qmd.CMD");

    try {
      expect(findExecutableOnPath("qmd.CMD", { PATH: fixture.dir, PATHEXT: ".EXE" }, "win32")).toBe(fixture.path);
      expect(findExecutableOnPath("qmd", { PATH: fixture.dir, PATHEXT: ".EXE" }, "win32")).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("returns null when PATH and Path are both absent for a bare command", () => {
    expect(findExecutableOnPath("qmd", { PATHEXT: "" }, process.platform)).toBeNull();
  });

  it("ignores directories that happen to match the command name", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-qmd-test-"));

    try {
      mkdirSync(join(dir, "qmd"));
      expect(findExecutableOnPath("qmd", { PATH: dir, PATHEXT: "" }, process.platform)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores non-executable files on POSIX platforms", () => {
    const dir = mkdtempSync(join(tmpdir(), "memory-qmd-test-"));
    const path = join(dir, "qmd");

    try {
      writeFileSync(path, "echo qmd\n");
      if (process.platform !== "win32") chmodSync(path, 0o644);

      const expected = process.platform === "win32" ? path : null;
      expect(findExecutableOnPath("qmd", { PATH: dir, PATHEXT: "" }, process.platform)).toBe(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts executable files on POSIX platforms", () => {
    const fixture = createExecutableFixture("qmd");

    try {
      chmodSync(fixture.path, 0o755);
      expect(findExecutableOnPath("qmd", { PATH: fixture.dir, PATHEXT: "" }, "linux")).toBe(fixture.path);
    } finally {
      fixture.cleanup();
    }
  });
});

function createExecutableFixture(name: string): { dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "memory-qmd-test-"));
  const path = join(dir, name);

  writeFileSync(path, "echo qmd\n");
  if (process.platform !== "win32") chmodSync(path, 0o755);

  return {
    dir,
    path,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function restorePathEnv(
  originalPath: string | undefined,
  originalPathAlias: string | undefined,
  originalPathExt: string | undefined,
): void {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;

  if (originalPathAlias === undefined) delete process.env.Path;
  else process.env.Path = originalPathAlias;

  if (originalPathExt === undefined) delete process.env.PATHEXT;
  else process.env.PATHEXT = originalPathExt;
}
