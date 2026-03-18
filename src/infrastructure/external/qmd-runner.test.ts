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
import type { Readable } from "node:stream";
import { QmdRunner, isQmdAvailable, getQmdInfo } from "./qmd-runner.js";

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
  let execSyncSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    runner = new QmdRunner();
  });

  afterEach(() => {
    spawnSpy?.mockRestore();
    execSyncSpy?.mockRestore();
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
    it("returns true when which succeeds", () => {
      execSyncSpy = spyOn(childProcess, "execSync").mockReturnValue(
        Buffer.from("/usr/bin/qmd\n"),
      );

      expect(runner.isAvailable()).toBe(true);
      expect(execSyncSpy).toHaveBeenCalledWith("which qmd", {
        stdio: "ignore",
      });
    });

    it("returns false when which throws", () => {
      execSyncSpy = spyOn(childProcess, "execSync").mockImplementation(() => {
        throw new Error("Command not found");
      });

      expect(runner.isAvailable()).toBe(false);
    });
  });

  describe("getHealthInfo()", () => {
    it("returns available=true with path", () => {
      execSyncSpy = spyOn(childProcess, "execSync").mockReturnValue(
        "/usr/bin/qmd\n" as any,
      );

      const info = runner.getHealthInfo();
      expect(info).toEqual({ available: true, path: "/usr/bin/qmd" });
    });

    it("returns available=false, path=null", () => {
      execSyncSpy = spyOn(childProcess, "execSync").mockImplementation(() => {
        throw new Error("Command not found");
      });

      const info = runner.getHealthInfo();
      expect(info).toEqual({ available: false, path: null });
    });
  });
});

describe("standalone functions", () => {
  let execSyncSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    execSyncSpy?.mockRestore();
  });

  it("isQmdAvailable() returns true when qmd found", () => {
    execSyncSpy = spyOn(childProcess, "execSync").mockReturnValue(
      Buffer.from("/usr/bin/qmd\n"),
    );
    expect(isQmdAvailable()).toBe(true);
  });

  it("isQmdAvailable() returns false when qmd not found", () => {
    execSyncSpy = spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("Command not found");
    });
    expect(isQmdAvailable()).toBe(false);
  });

  it("getQmdInfo() returns available=true with path", () => {
    execSyncSpy = spyOn(childProcess, "execSync").mockReturnValue(
      "/usr/local/bin/qmd\n" as any,
    );
    const info = getQmdInfo();
    expect(info).toEqual({ available: true, path: "/usr/local/bin/qmd" });
  });

  it("getQmdInfo() returns available=false, path=null", () => {
    execSyncSpy = spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("Command not found");
    });
    const info = getQmdInfo();
    expect(info).toEqual({ available: false, path: null });
  });
});
