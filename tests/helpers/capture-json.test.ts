import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureStreams, createTempDatabaseTracker } from "./capture-json.js";
import { createOwnedTestDirectory } from "./owned-test-directory.js";

describe("capture-json test helpers", () => {
  it("captures both streams, non-string arguments, and returned exit code", async () => {
    const captured = await captureStreams(async () => {
      console.log("status", 200, { ok: true });
      console.error("warning", false);
      return { exitCode: 7 };
    });
    expect(captured).toEqual({ stdout: "status 200 [object Object]", stderr: "warning false", exitCode: 7 });
  });

  it("omits exitCode for undefined or an empty result", async () => {
    expect(await captureStreams(async () => undefined)).toEqual({ stdout: "", stderr: "" });
    expect(await captureStreams(async () => ({}))).toEqual({ stdout: "", stderr: "" });
  });

  it("restores console methods and preserves a command failure", async () => {
    const log = console.log, error = console.error, failure = new Error("boom");
    await expect(captureStreams(async () => {
      console.log("before throw");
      throw failure;
    })).rejects.toBe(failure);
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
  });

  it("allocates an absent database in an owned directory and removes its sidecars", async () => {
    const tracker = createTempDatabaseTracker();
    const db = tracker.makePath("helper");
    try {
      expect(existsSync(db)).toBe(false);
      expect(existsSync(dirname(db))).toBe(true);
      for (const suffix of ["", "-wal", "-shm"]) writeFileSync(db + suffix, "synthetic");
      await tracker.cleanup();
      expect(existsSync(dirname(db))).toBe(false);
      await tracker.cleanup();
    } finally { await tracker.cleanup(); }
  });

  it("cannot acquire deletion authority from caller-provided foreign paths", async () => {
    const foreign = createOwnedTestDirectory("memory-json-foreign-");
    const sentinel = join(foreign.dir, "foreign.db");
    writeFileSync(sentinel, "synthetic foreign data");
    const tracker = createTempDatabaseTracker();
    try {
      // JavaScript callers may supply extra arguments; none are deletion inputs.
      await Reflect.apply(tracker.cleanup, tracker, [[sentinel]]);
      expect(readFileSync(sentinel, "utf8")).toBe("synthetic foreign data");
      expect(() => tracker.makePath(sentinel)).toThrow("Invalid test directory prefix");
    } finally { foreign.cleanup(); }
  });

  it("rejects separators and oversized labels before allocating storage", () => {
    const tracker = createTempDatabaseTracker();
    for (const label of ["../escape", "..\\escape", "a".repeat(80)]) {
      expect(() => tracker.makePath(label)).toThrow("Invalid test directory prefix");
    }
  });

  it("preserves allocation failures", async () => {
    const failure = new Error("allocation unavailable");
    const tracker = createTempDatabaseTracker(() => { throw failure; });
    expect(() => tracker.makePath("helper")).toThrow(failure);
    await tracker.cleanup();
  });

  it("refuses a replaced directory and retains authority for a safe retry", async () => {
    const original = createOwnedTestDirectory("memory-json-replaced-");
    const tracker = createTempDatabaseTracker(() => original);
    const db = tracker.makePath("helper");
    const saved = original.dir + "-original";
    renameSync(original.dir, saved);
    mkdirSync(original.dir);
    const sentinel = join(original.dir, "foreign.txt");
    writeFileSync(sentinel, "replacement must survive");
    try {
      await expect(tracker.cleanup()).rejects.toThrow(original.dir);
      expect(readFileSync(sentinel, "utf8")).toBe("replacement must survive");
      expect(existsSync(saved)).toBe(true);
    } finally {
      // Only the exact synthetic sentinel and now-empty replacement are removed.
      unlinkSync(sentinel);
      rmdirSync(original.dir);
      renameSync(saved, original.dir);
      await tracker.cleanup();
    }
    expect(existsSync(dirname(db))).toBe(false);
  });

  it("retains multiple failures and causes while cleaning independent fixtures", async () => {
    let locked = true;
    const failures = [new Error("busy-one"), new Error("busy-two")];
    const storage = failures.map(failure => createOwnedTestDirectory("memory-json-busy-", {
      remove(path) {
        if (locked) throw failure;
        rmSync(path, { recursive: true, force: false });
      },
    }));
    const healthy = createOwnedTestDirectory("memory-json-healthy-");
    const queue = [...storage, healthy];
    const tracker = createTempDatabaseTracker(() => queue.shift()!);
    for (let n = 0; n < 3; n++) tracker.makePath("helper");
    try {
      let result: unknown;
      try { await tracker.cleanup(); } catch (error) { result = error; }
      expect(result).toBeInstanceOf(AggregateError);
      const aggregate = result as AggregateError;
      expect(aggregate.errors).toHaveLength(2);
      for (const [index, item] of storage.entries()) {
        expect(aggregate.message).toContain(item.dir);
        expect(aggregate.errors[index].cause.cause).toBe(failures[index]);
        expect(existsSync(item.dir)).toBe(true);
      }
      expect(existsSync(healthy.dir)).toBe(false);
      locked = false;
      await tracker.cleanup();
      for (const item of storage) expect(existsSync(item.dir)).toBe(false);
    } finally {
      locked = false;
      await tracker.cleanup();
      for (const item of [...storage, healthy]) item.cleanup();
    }
  });

  it("does not forget allocations made while cleanup yields", async () => {
    const tracker = createTempDatabaseTracker();
    const first = tracker.makePath("first");
    try {
      const cleanup = tracker.cleanup();
      const second = tracker.makePath("second");
      await cleanup;
      expect(existsSync(dirname(first))).toBe(false);
      expect(existsSync(dirname(second))).toBe(true);
      await tracker.cleanup();
      expect(existsSync(dirname(second))).toBe(false);
    } finally { await tracker.cleanup(); }
  });
});
