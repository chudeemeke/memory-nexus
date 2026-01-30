/**
 * Hook Runner Tests
 *
 * Tests for background process spawning for sync operations.
 * Uses dependency injection to verify spawn() arguments without
 * actually spawning processes.
 */

import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as childProcess from "node:child_process";

// Import after mocking setup
import {
    spawnBackgroundSync,
    getLogPath,
    ensureLogDirectory,
    type SpawnOptions,
} from "./hook-runner.js";

describe("hook-runner", () => {
    const testDir = join(homedir(), ".memory-nexus-test-hook-runner");
    const testLogDir = join(testDir, "logs");

    beforeEach(() => {
        // Clean test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("getLogPath", () => {
        test("returns path under .memory-nexus/logs", () => {
            const logPath = getLogPath();
            expect(logPath).toContain(".memory-nexus");
            expect(logPath).toContain("logs");
            expect(logPath).toEndWith("sync.log");
        });

        test("uses homedir for base path", () => {
            const logPath = getLogPath();
            expect(logPath.startsWith(homedir())).toBe(true);
        });
    });

    describe("ensureLogDirectory", () => {
        test("creates log directory if missing", () => {
            // Use custom path for test isolation
            const customLogDir = testLogDir;
            mkdirSync(testDir, { recursive: true });

            ensureLogDirectory(customLogDir);

            expect(existsSync(customLogDir)).toBe(true);
        });

        test("no-op if directory exists", () => {
            mkdirSync(testLogDir, { recursive: true });

            // Should not throw
            expect(() => ensureLogDirectory(testLogDir)).not.toThrow();
        });

        test("creates nested directories", () => {
            const deepPath = join(testDir, "a", "b", "c", "logs");

            ensureLogDirectory(deepPath);

            expect(existsSync(deepPath)).toBe(true);
        });
    });

    describe("spawnBackgroundSync", () => {
        test("calls spawn with detached: true", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("test-session-123", {
                logDir: testLogDir,
            });

            expect(spawnSpy).toHaveBeenCalledTimes(1);
            const [, , options] = spawnSpy.mock.calls[0];
            expect(options).toHaveProperty("detached", true);

            spawnSpy.mockRestore();
        });

        test("spawns with correct command and arguments", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("my-session-id", {
                logDir: testLogDir,
            });

            expect(spawnSpy).toHaveBeenCalledTimes(1);
            const [command, args] = spawnSpy.mock.calls[0];
            expect(command).toBe("aidev");
            expect(args).toContain("memory");
            expect(args).toContain("sync");
            expect(args).toContain("--session");
            expect(args).toContain("my-session-id");

            spawnSpy.mockRestore();
        });

        test("includes --quiet flag by default", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            const [, args] = spawnSpy.mock.calls[0];
            expect(args).toContain("--quiet");

            spawnSpy.mockRestore();
        });

        test("omits --quiet flag when quiet: false", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
                quiet: false,
            });

            const [, args] = spawnSpy.mock.calls[0];
            expect(args).not.toContain("--quiet");

            spawnSpy.mockRestore();
        });

        test("allows custom command override", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
                command: "custom-cli",
            });

            const [command] = spawnSpy.mock.calls[0];
            expect(command).toBe("custom-cli");

            spawnSpy.mockRestore();
        });

        test("calls unref() to allow parent exit", () => {
            let unrefCalled = false;
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {
                    unrefCalled = true;
                },
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            expect(unrefCalled).toBe(true);

            spawnSpy.mockRestore();
        });

        test("sets MEMORY_NEXUS_HOOK environment variable", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            const [, , options] = spawnSpy.mock.calls[0];
            expect(options.env).toHaveProperty("MEMORY_NEXUS_HOOK", "1");

            spawnSpy.mockRestore();
        });

        test("creates log directory before spawning", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            // Ensure directory doesn't exist
            expect(existsSync(testLogDir)).toBe(false);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            // Directory should now exist
            expect(existsSync(testLogDir)).toBe(true);

            spawnSpy.mockRestore();
        });

        test("uses stdio with file descriptors for logging", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            const [, , options] = spawnSpy.mock.calls[0];
            // stdio should be array with [ignore, fd, fd] pattern
            expect(Array.isArray(options.stdio)).toBe(true);
            expect(options.stdio[0]).toBe("ignore"); // stdin

            spawnSpy.mockRestore();
        });

        test("returns spawn result with pid", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 98765,
            } as unknown as childProcess.ChildProcess);

            const result = spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            expect(result).toHaveProperty("pid", 98765);

            spawnSpy.mockRestore();
        });

        test("handles spawn returning undefined pid gracefully", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: undefined,
            } as unknown as childProcess.ChildProcess);

            const result = spawnBackgroundSync("session-123", {
                logDir: testLogDir,
            });

            expect(result).toHaveProperty("pid", undefined);

            spawnSpy.mockRestore();
        });
    });

    describe("argument construction", () => {
        test("builds args array in correct order", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            spawnBackgroundSync("sess-abc-123", {
                logDir: testLogDir,
            });

            const [, args] = spawnSpy.mock.calls[0];
            // Expected: ["memory", "sync", "--session", "sess-abc-123", "--quiet"]
            expect(args[0]).toBe("memory");
            expect(args[1]).toBe("sync");
            expect(args[2]).toBe("--session");
            expect(args[3]).toBe("sess-abc-123");
            expect(args[4]).toBe("--quiet");

            spawnSpy.mockRestore();
        });

        test("session ID with special characters is passed correctly", () => {
            const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue({
                unref: () => {},
                pid: 12345,
            } as unknown as childProcess.ChildProcess);

            const sessionId = "session-with-dashes-and_underscores.and.dots";
            spawnBackgroundSync(sessionId, {
                logDir: testLogDir,
            });

            const [, args] = spawnSpy.mock.calls[0];
            expect(args).toContain(sessionId);

            spawnSpy.mockRestore();
        });
    });
});
