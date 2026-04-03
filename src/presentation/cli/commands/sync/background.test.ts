/**
 * Background Mode Tests
 *
 * Tests for handleBackgroundMode function.
 */

import { describe, expect, it, spyOn } from "bun:test";
import { handleBackgroundMode } from "./background.js";

describe("handleBackgroundMode", () => {
  it("prints hint and returns exitCode 0 when --embed is not set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true },
      {
        spawnBackgroundEmbedding: () => ({ started: true, pid: 1 }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const hintLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("--background requires --embed")
    );
    expect(hintLine).toBeDefined();

    logSpy.mockRestore();
  });

  it("prints started message with PID when background process starts", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: true, pid: 12345 }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const startLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Background embedding started")
    );
    expect(startLine).toBeDefined();
    expect(startLine).toContain("PID 12345");
    expect(startLine).toContain("memory status");

    logSpy.mockRestore();
  });

  it("prints already-in-progress message when lock is held by alive process", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: false, reason: "already_running" as const, pid: 99999 }),
        readLock: () => ({
          pid: 99999,
          startedAt: new Date().toISOString(),
          totalMessages: 0,
        }),
        isProcessAlive: () => true,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const inProgressLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("already in progress")
    );
    expect(inProgressLine).toBeDefined();
    expect(inProgressLine).toContain("PID 99999");

    logSpy.mockRestore();
  });

  it("returns exitCode 1 when spawn fails", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: false, reason: "spawn_failed" as const }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(1);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
