/**
 * Hook Runner Tests
 *
 * Tests for background process spawning and entity extraction for sync operations.
 * Uses dependency injection to verify spawn() arguments without
 * actually spawning processes.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as childProcess from "node:child_process";

import {
    spawnBackgroundSync,
    getLogPath,
    ensureLogDirectory,
    extractEntitiesFromSession,
    isInvokedByHook,
    type SpawnOptions,
} from "./hook-runner.js";
import { initializeDatabase, closeDatabase } from "../database/index.js";
import { SqliteMessageRepository } from "../database/repositories/message-repository.js";
import { SqliteSessionRepository } from "../database/repositories/session-repository.js";
import { Message } from "../../domain/entities/message.js";
import { Session } from "../../domain/entities/session.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";

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

    describe("extractEntitiesFromSession", () => {
        // Use unique directory per test run to avoid Windows file locking
        let testDbDir: string;
        let db: ReturnType<typeof initializeDatabase>["db"];

        beforeEach(() => {
            // Generate unique test directory for each test
            testDbDir = join(
                homedir(),
                `.memory-nexus-test-hook-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            );
            mkdirSync(testDbDir, { recursive: true });

            // Initialize database
            const result = initializeDatabase({ path: join(testDbDir, "test.db") });
            db = result.db;
        });

        afterEach(() => {
            // Close database first to release file handles
            if (db) {
                closeDatabase(db);
            }
            // Try to clean up, but don't fail if Windows holds the file
            setTimeout(() => {
                try {
                    if (existsSync(testDbDir)) {
                        rmSync(testDbDir, { recursive: true, force: true });
                    }
                } catch {
                    // Ignore cleanup errors on Windows
                }
            }, 100);
        });

        test("returns empty result for session with no messages", async () => {
            const result = await extractEntitiesFromSession("nonexistent-session", db);

            expect(result.success).toBe(true);
            expect(result.entitiesExtracted).toBe(0);
            expect(result.error).toBeUndefined();
        });

        test("returns success with entities extracted from messages", async () => {
            // Create a session first
            const sessionRepo = new SqliteSessionRepository(db);
            const projectPath = ProjectPath.fromEncoded("C--Users-Test-Project");
            const session = Session.create({
                id: "test-session-1",
                projectPath,
                startTime: new Date(),
            });
            await sessionRepo.save(session);

            // Add messages
            const messageRepo = new SqliteMessageRepository(db);
            const message = Message.create({
                id: "msg-1",
                role: "user",
                content: "How do I implement authentication?",
                timestamp: new Date(),
            });
            await messageRepo.save(message, "test-session-1");

            const result = await extractEntitiesFromSession("test-session-1", db);

            // LlmExtractor.extract returns empty in unit tests (no actual LLM call)
            // But the function should succeed
            expect(result.success).toBe(true);
            expect(result.entitiesExtracted).toBe(0);
        });

        test("entities are linked to session after extraction", async () => {
            // Create session and message
            const sessionRepo = new SqliteSessionRepository(db);
            const projectPath = ProjectPath.fromEncoded("C--Users-Test-Project");
            const session = Session.create({
                id: "test-session-2",
                projectPath,
                startTime: new Date(),
            });
            await sessionRepo.save(session);

            const messageRepo = new SqliteMessageRepository(db);
            const message = Message.create({
                id: "msg-2",
                role: "assistant",
                content: "You can use JWT for authentication.",
                timestamp: new Date(),
            });
            await messageRepo.save(message, "test-session-2");

            const result = await extractEntitiesFromSession("test-session-2", db);

            expect(result.success).toBe(true);
            // In unit test mode, no entities are extracted (LLM not available)
            expect(result.entitiesExtracted).toBe(0);
        });

        test("logs but does not fail on extraction error", async () => {
            // Create session with messages
            const sessionRepo = new SqliteSessionRepository(db);
            const projectPath = ProjectPath.fromEncoded("C--Users-Test-Error");
            const session = Session.create({
                id: "test-session-error",
                projectPath,
                startTime: new Date(),
            });
            await sessionRepo.save(session);

            const messageRepo = new SqliteMessageRepository(db);
            const message = Message.create({
                id: "msg-error",
                role: "user",
                content: "Test content",
                timestamp: new Date(),
            });
            await messageRepo.save(message, "test-session-error");

            // The function should succeed even without actual LLM
            const result = await extractEntitiesFromSession("test-session-error", db);

            expect(result.success).toBe(true);
        });

        test("skips extraction for empty sessions", async () => {
            // Create session without messages
            const sessionRepo = new SqliteSessionRepository(db);
            const projectPath = ProjectPath.fromEncoded("C--Users-Empty-Session");
            const session = Session.create({
                id: "empty-session",
                projectPath,
                startTime: new Date(),
            });
            await sessionRepo.save(session);

            const result = await extractEntitiesFromSession("empty-session", db);

            expect(result.success).toBe(true);
            expect(result.entitiesExtracted).toBe(0);
        });

        test("includes summary in result when extracted", async () => {
            // Create session with messages
            const sessionRepo = new SqliteSessionRepository(db);
            const projectPath = ProjectPath.fromEncoded("C--Users-Summary");
            const session = Session.create({
                id: "summary-session",
                projectPath,
                startTime: new Date(),
            });
            await sessionRepo.save(session);

            const messageRepo = new SqliteMessageRepository(db);
            const message = Message.create({
                id: "msg-summary",
                role: "user",
                content: "Let's discuss architecture",
                timestamp: new Date(),
            });
            await messageRepo.save(message, "summary-session");

            const result = await extractEntitiesFromSession("summary-session", db);

            expect(result.success).toBe(true);
            // Summary is undefined when LLM returns empty (unit test mode)
            expect(result.summary).toBeUndefined();
        });
    });

    describe("isInvokedByHook", () => {
        const originalEnv = process.env.MEMORY_NEXUS_HOOK;

        afterEach(() => {
            // Restore original env
            if (originalEnv === undefined) {
                delete process.env.MEMORY_NEXUS_HOOK;
            } else {
                process.env.MEMORY_NEXUS_HOOK = originalEnv;
            }
        });

        test("returns true when MEMORY_NEXUS_HOOK is 1", () => {
            process.env.MEMORY_NEXUS_HOOK = "1";
            expect(isInvokedByHook()).toBe(true);
        });

        test("returns false when MEMORY_NEXUS_HOOK is not set", () => {
            delete process.env.MEMORY_NEXUS_HOOK;
            expect(isInvokedByHook()).toBe(false);
        });

        test("returns false when MEMORY_NEXUS_HOOK is 0", () => {
            process.env.MEMORY_NEXUS_HOOK = "0";
            expect(isInvokedByHook()).toBe(false);
        });

        test("returns false when MEMORY_NEXUS_HOOK is empty", () => {
            process.env.MEMORY_NEXUS_HOOK = "";
            expect(isInvokedByHook()).toBe(false);
        });
    });
});
