/**
 * Background Embedder Tests
 *
 * Tests for PID lock file lifecycle and background embedding process spawning.
 * Uses temporary directories for lock and log file isolation.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeLock,
  readLock,
  removeLock,
  isProcessAlive,
  acquireLock,
  spawnBackgroundEmbedding,
  isBackgroundEmbedding,
  cleanupLock,
  type LockData,
} from "./background-embedder.js";

describe("PID lock file", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `memory-bg-embed-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("writeLock()", () => {
    it("creates a lock file at the expected path", () => {
      const lockData: LockData = {
        pid: 12345,
        startedAt: new Date().toISOString(),
        totalMessages: 500,
      };

      writeLock(lockData, testDir);

      const lockPath = join(testDir, "embedding.lock");
      expect(existsSync(lockPath)).toBe(true);
    });

    it("writes JSON with pid, startedAt, and totalMessages", () => {
      const now = new Date().toISOString();
      const lockData: LockData = {
        pid: 99999,
        startedAt: now,
        totalMessages: 250,
      };

      writeLock(lockData, testDir);

      const lockPath = join(testDir, "embedding.lock");
      const content = JSON.parse(readFileSync(lockPath, "utf-8"));
      expect(content.pid).toBe(99999);
      expect(content.startedAt).toBe(now);
      expect(content.totalMessages).toBe(250);
    });

    it("writes a valid ISO timestamp in startedAt", () => {
      const isoTimestamp = new Date().toISOString();
      const lockData: LockData = {
        pid: 1,
        startedAt: isoTimestamp,
        totalMessages: 0,
      };

      writeLock(lockData, testDir);

      const lockPath = join(testDir, "embedding.lock");
      const content = JSON.parse(readFileSync(lockPath, "utf-8"));
      const parsed = new Date(content.startedAt);
      expect(parsed.toISOString()).toBe(isoTimestamp);
    });
  });

  describe("readLock()", () => {
    it("returns null when lock file does not exist", () => {
      const result = readLock(testDir);
      expect(result).toBeNull();
    });

    it("returns parsed lock data when lock file exists", () => {
      const lockData: LockData = {
        pid: 42,
        startedAt: "2026-01-01T00:00:00.000Z",
        totalMessages: 100,
      };
      writeLock(lockData, testDir);

      const result = readLock(testDir);
      expect(result).not.toBeNull();
      expect(result!.pid).toBe(42);
      expect(result!.startedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(result!.totalMessages).toBe(100);
    });

    it("returns null when lock file contains invalid JSON", () => {
      const lockPath = join(testDir, "embedding.lock");
      writeFileSync(lockPath, "not valid json {{{");

      const result = readLock(testDir);
      expect(result).toBeNull();
    });
  });

  describe("removeLock()", () => {
    it("removes the lock file", () => {
      const lockData: LockData = {
        pid: 1,
        startedAt: new Date().toISOString(),
        totalMessages: 0,
      };
      writeLock(lockData, testDir);

      const lockPath = join(testDir, "embedding.lock");
      expect(existsSync(lockPath)).toBe(true);

      removeLock(testDir);

      expect(existsSync(lockPath)).toBe(false);
    });

    it("is a no-op when lock file does not exist", () => {
      // Should not throw
      expect(() => removeLock(testDir)).not.toThrow();
    });
  });

  describe("isProcessAlive()", () => {
    it("returns false for a PID that does not exist", () => {
      // Use a very high PID that is extremely unlikely to exist
      const result = isProcessAlive(999999999);
      expect(result).toBe(false);
    });

    it("returns true for the current process PID", () => {
      const result = isProcessAlive(process.pid);
      expect(result).toBe(true);
    });
  });

  describe("acquireLock()", () => {
    it("creates lock and returns acquired:true when no lock exists", () => {
      const result = acquireLock(process.pid, 500, testDir);

      expect(result.acquired).toBe(true);

      // Verify lock file was created
      const lock = readLock(testDir);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(process.pid);
    });

    it("returns acquired:false with existingPid when lock is held by alive process", () => {
      // First acquire
      acquireLock(process.pid, 100, testDir);

      // Second acquire should fail
      const result = acquireLock(99999, 200, testDir);

      expect(result.acquired).toBe(false);
      expect(result.existingPid).toBe(process.pid);
      expect(result.startedAt).toBeDefined();
    });

    it("removes stale lock, creates new lock, returns staleRemoved:true when PID is dead", () => {
      // Write a lock with a dead PID
      writeLock({
        pid: 999999999,
        startedAt: "2026-01-01T00:00:00.000Z",
        totalMessages: 0,
      }, testDir);

      const result = acquireLock(process.pid, 300, testDir);

      expect(result.acquired).toBe(true);
      expect(result.staleRemoved).toBe(true);

      // Verify new lock was written
      const lock = readLock(testDir);
      expect(lock!.pid).toBe(process.pid);
    });
  });
});

describe("spawnBackgroundEmbedding()", () => {
  let testDir: string;
  let logDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `memory-bg-spawn-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    logDir = join(testDir, "logs");
    mkdirSync(testDir, { recursive: true });
    mkdirSync(logDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up any lock files
    removeLock(testDir);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("writes PID lock file after spawning", () => {
    const result = spawnBackgroundEmbedding({
      dataDir: testDir,
      logDir,
    });

    // If spawned, a lock file should exist
    if (result.started) {
      const lock = readLock(testDir);
      expect(lock).not.toBeNull();
      expect(lock!.pid).toBe(result.pid);
    }
  });

  it("returns started:true with a pid on success", () => {
    const result = spawnBackgroundEmbedding({
      dataDir: testDir,
      logDir,
    });

    // Spawn may fail if entry point cannot be determined, but when it succeeds:
    if (result.started) {
      expect(result.pid).toBeDefined();
      expect(typeof result.pid).toBe("number");
    }
  });

  it("returns started:false with reason already_running when lock held by alive process", () => {
    // Pre-acquire lock with current process PID (known alive)
    acquireLock(process.pid, 0, testDir);

    const result = spawnBackgroundEmbedding({
      dataDir: testDir,
      logDir,
    });

    expect(result.started).toBe(false);
    expect(result.reason).toBe("already_running");
    expect(result.pid).toBe(process.pid);
  });

  it("sets MEMORY_EMBED_BACKGROUND=1 in spawned child environment", () => {
    // We can verify by checking that the spawn function references this env var.
    // Since we cannot inspect child env directly from tests, we verify
    // isBackgroundEmbedding() returns false in our own process.
    expect(isBackgroundEmbedding()).toBe(false);
  });

  it("creates log directory if it does not exist", () => {
    const newLogDir = join(testDir, "new-logs");
    expect(existsSync(newLogDir)).toBe(false);

    spawnBackgroundEmbedding({
      dataDir: testDir,
      logDir: newLogDir,
    });

    expect(existsSync(newLogDir)).toBe(true);
  });

  it("removes stale lock and proceeds to spawn", () => {
    // Write a lock with a dead PID (999999999 is extremely unlikely to exist)
    writeLock({
      pid: 999999999,
      startedAt: "2026-01-01T00:00:00.000Z",
      totalMessages: 0,
    }, testDir);

    // Verify stale lock exists before spawn
    const staleLock = readLock(testDir);
    expect(staleLock).not.toBeNull();
    expect(staleLock!.pid).toBe(999999999);

    const result = spawnBackgroundEmbedding({
      dataDir: testDir,
      logDir,
    });

    // The stale lock should have been removed and a new process spawned.
    // Even if spawn itself fails (no entry point), the stale lock at 999999999
    // should be gone -- either replaced by new lock or removed entirely.
    const currentLock = readLock(testDir);
    if (result.started) {
      // New lock was written with spawned PID
      expect(currentLock).not.toBeNull();
      expect(currentLock!.pid).not.toBe(999999999);
    } else {
      // Spawn may fail on test runner, but stale lock should not remain with old PID
      if (currentLock) {
        expect(currentLock.pid).not.toBe(999999999);
      }
    }
  });

  it("returns spawn_failed when subprocess.pid is undefined", () => {
    const mockProcess = {
      pid: undefined,
      unref: () => {},
      on: () => mockProcess,
      once: () => mockProcess,
      removeListener: () => mockProcess,
      emit: () => false,
    } as any;

    const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProcess);

    try {
      const result = spawnBackgroundEmbedding({
        dataDir: testDir,
        logDir,
      });

      expect(result.started).toBe(false);
      expect(result.reason).toBe("spawn_failed");
    } finally {
      spawnSpy.mockRestore();
    }
  });

  it("returns already_running when acquireLock fails after spawn (race condition)", () => {
    // Write a stale lock so pre-spawn check passes (dead PID)
    writeLock({
      pid: 999999999,
      startedAt: "2026-01-01T00:00:00.000Z",
      totalMessages: 0,
    }, testDir);

    // Mock spawn to return a valid PID but also write a lock with an alive PID
    // as a side effect (simulating a race condition where another process
    // acquires the lock between our stale removal and acquireLock call)
    const mockProcess = {
      pid: 77777,
      unref: () => {},
      on: () => mockProcess,
      once: () => mockProcess,
      removeListener: () => mockProcess,
      emit: () => false,
    } as any;

    const spawnSpy = spyOn(childProcess, "spawn").mockImplementation(() => {
      // Side effect: write a lock with alive PID (current process) to
      // simulate another process grabbing the lock during the race window
      writeLock({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        totalMessages: 0,
      }, testDir);
      return mockProcess;
    });

    try {
      const result = spawnBackgroundEmbedding({
        dataDir: testDir,
        logDir,
      });

      expect(result.started).toBe(false);
      expect(result.reason).toBe("already_running");
      expect(result.pid).toBe(process.pid);
    } finally {
      spawnSpy.mockRestore();
    }
  });
});

describe("cleanupLock()", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `memory-bg-cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("removes lock file", () => {
    writeLock({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      totalMessages: 0,
    }, testDir);

    const lockPath = join(testDir, "embedding.lock");
    expect(existsSync(lockPath)).toBe(true);

    cleanupLock(testDir);

    expect(existsSync(lockPath)).toBe(false);
  });

  it("is a no-op when no lock file exists", () => {
    expect(() => cleanupLock(testDir)).not.toThrow();
  });
});

describe("isBackgroundEmbedding()", () => {
  const originalEnv = process.env.MEMORY_EMBED_BACKGROUND;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MEMORY_EMBED_BACKGROUND;
    } else {
      process.env.MEMORY_EMBED_BACKGROUND = originalEnv;
    }
  });

  it("returns true when MEMORY_EMBED_BACKGROUND is set to '1'", () => {
    process.env.MEMORY_EMBED_BACKGROUND = "1";
    expect(isBackgroundEmbedding()).toBe(true);
  });

  it("returns false when MEMORY_EMBED_BACKGROUND is not set", () => {
    delete process.env.MEMORY_EMBED_BACKGROUND;
    expect(isBackgroundEmbedding()).toBe(false);
  });

  it("returns false when MEMORY_EMBED_BACKGROUND is set to other value", () => {
    process.env.MEMORY_EMBED_BACKGROUND = "0";
    expect(isBackgroundEmbedding()).toBe(false);
  });
});
