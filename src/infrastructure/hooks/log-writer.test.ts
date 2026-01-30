/**
 * Log Writer Tests
 *
 * Tests for structured JSON logging and rotation.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    logSync,
    rotateLogsIfNeeded,
    readRecentLogs,
    getLogDir,
    getLogPath,
    type LogEntry,
    type LogEntryInput,
} from "./log-writer.js";

describe("log-writer", () => {
    let testDir: string;
    let originalHome: string;

    beforeEach(() => {
        // Create unique temp directory for each test
        testDir = join(
            tmpdir(),
            `log-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });

        // Store original HOME and override for testing
        originalHome = process.env.HOME ?? "";
        process.env.HOME = testDir;
        process.env.USERPROFILE = testDir;
    });

    afterEach(() => {
        // Restore original HOME
        process.env.HOME = originalHome;
        process.env.USERPROFILE = originalHome;

        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("getLogDir", () => {
        test("returns path under home directory", () => {
            const logDir = getLogDir();
            expect(logDir).toContain(".memory-nexus");
            expect(logDir).toContain("logs");
        });
    });

    describe("getLogPath", () => {
        test("returns path to sync.log", () => {
            const logPath = getLogPath();
            expect(logPath).toContain(".memory-nexus");
            expect(logPath).toContain("logs");
            expect(logPath).toEndWith("sync.log");
        });
    });

    describe("logSync", () => {
        test("creates directory if missing", () => {
            const logDir = join(testDir, ".memory-nexus", "logs");
            expect(existsSync(logDir)).toBe(false);

            logSync({ level: "info", message: "test" });

            expect(existsSync(logDir)).toBe(true);
        });

        test("appends entry with timestamp", () => {
            logSync({ level: "info", message: "test message" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const entry = JSON.parse(content.trim()) as LogEntry;

            expect(entry.timestamp).toBeDefined();
            expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(entry.level).toBe("info");
            expect(entry.message).toBe("test message");
        });

        test("writes valid JSON lines", () => {
            logSync({ level: "info", message: "message 1" });
            logSync({ level: "warn", message: "message 2" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const lines = content.trim().split("\n");

            expect(lines).toHaveLength(2);

            // Each line should be valid JSON
            for (const line of lines) {
                expect(() => JSON.parse(line)).not.toThrow();
            }
        });

        test("multiple calls append correctly", () => {
            logSync({ level: "info", message: "first" });
            logSync({ level: "warn", message: "second" });
            logSync({ level: "error", message: "third" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const lines = content.trim().split("\n");

            expect(lines).toHaveLength(3);

            const entries = lines.map((line) => JSON.parse(line) as LogEntry);
            expect(entries[0]?.message).toBe("first");
            expect(entries[1]?.message).toBe("second");
            expect(entries[2]?.message).toBe("third");
        });

        test("includes optional sessionId", () => {
            logSync({ level: "info", message: "sync started", sessionId: "abc-123" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const entry = JSON.parse(content.trim()) as LogEntry;

            expect(entry.sessionId).toBe("abc-123");
        });

        test("includes optional durationMs", () => {
            logSync({ level: "info", message: "sync complete", durationMs: 1234 });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const entry = JSON.parse(content.trim()) as LogEntry;

            expect(entry.durationMs).toBe(1234);
        });

        test("includes optional error", () => {
            logSync({ level: "error", message: "sync failed", error: "Connection timeout" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const entry = JSON.parse(content.trim()) as LogEntry;

            expect(entry.error).toBe("Connection timeout");
        });

        test("includes optional hookEvent", () => {
            logSync({ level: "info", message: "hook triggered", hookEvent: "SessionEnd" });

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const entry = JSON.parse(content.trim()) as LogEntry;

            expect(entry.hookEvent).toBe("SessionEnd");
        });

        test("handles all log levels", () => {
            const levels: Array<"debug" | "info" | "warn" | "error"> = [
                "debug",
                "info",
                "warn",
                "error",
            ];

            for (const level of levels) {
                logSync({ level, message: `${level} message` });
            }

            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            const content = readFileSync(logPath, "utf-8");
            const lines = content.trim().split("\n");

            expect(lines).toHaveLength(4);

            const entries = lines.map((line) => JSON.parse(line) as LogEntry);
            expect(entries.map((e) => e.level)).toEqual(levels);
        });
    });

    describe("rotateLogsIfNeeded", () => {
        test("renames old log file", () => {
            // Create log directory and old log file
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");
            writeFileSync(logPath, '{"level":"info","message":"old entry"}\n');

            // Set modification time to 10 days ago
            const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            utimesSync(logPath, tenDaysAgo, tenDaysAgo);

            // Rotate with 7 day retention
            rotateLogsIfNeeded(7);

            // Original log should be gone
            expect(existsSync(logPath)).toBe(false);

            // Archive should exist with date suffix
            const today = new Date().toISOString().split("T")[0];
            const archivePath = `${logPath}.${today}`;
            expect(existsSync(archivePath)).toBe(true);
        });

        test("no-op if file is recent", () => {
            // Create log directory and recent log file
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");
            writeFileSync(logPath, '{"level":"info","message":"recent entry"}\n');

            // File is fresh (just created), rotate with 7 day retention
            rotateLogsIfNeeded(7);

            // Original log should still exist
            expect(existsSync(logPath)).toBe(true);

            // No archive should be created
            const today = new Date().toISOString().split("T")[0];
            const archivePath = `${logPath}.${today}`;
            expect(existsSync(archivePath)).toBe(false);
        });

        test("no-op if file missing", () => {
            // Don't create any log file
            // Should not throw
            rotateLogsIfNeeded(7);

            // No file created
            const logPath = join(testDir, ".memory-nexus", "logs", "sync.log");
            expect(existsSync(logPath)).toBe(false);
        });

        test("handles zero retention days", () => {
            // Create log directory and log file
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");
            writeFileSync(logPath, '{"level":"info","message":"entry"}\n');

            // Set modification time to yesterday
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            utimesSync(logPath, yesterday, yesterday);

            // Rotate with 0 day retention (rotate anything older than now)
            rotateLogsIfNeeded(0);

            // Original log should be gone
            expect(existsSync(logPath)).toBe(false);
        });
    });

    describe("readRecentLogs", () => {
        test("returns parsed entries", () => {
            // Create log directory and log file
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");

            const entries = [
                { timestamp: "2026-01-30T10:00:00.000Z", level: "info", message: "entry 1" },
                { timestamp: "2026-01-30T10:01:00.000Z", level: "warn", message: "entry 2" },
            ];
            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

            const result = readRecentLogs();

            expect(result).toHaveLength(2);
            expect(result[0]?.message).toBe("entry 1");
            expect(result[1]?.message).toBe("entry 2");
        });

        test("returns empty array if file missing", () => {
            const result = readRecentLogs();
            expect(result).toEqual([]);
        });

        test("handles malformed lines gracefully", () => {
            // Create log directory and log file with mixed content
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");

            const content = [
                '{"timestamp":"2026-01-30T10:00:00.000Z","level":"info","message":"valid 1"}',
                "not valid json",
                '{"timestamp":"2026-01-30T10:01:00.000Z","level":"info","message":"valid 2"}',
                "{ broken json",
                '{"timestamp":"2026-01-30T10:02:00.000Z","level":"info","message":"valid 3"}',
            ].join("\n");
            writeFileSync(logPath, content);

            const result = readRecentLogs();

            // Should only have the 3 valid entries
            expect(result).toHaveLength(3);
            expect(result.map((e) => e.message)).toEqual(["valid 1", "valid 2", "valid 3"]);
        });

        test("respects limit parameter", () => {
            // Create log directory and log file with many entries
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");

            const entries = [];
            for (let i = 0; i < 50; i++) {
                entries.push({
                    timestamp: `2026-01-30T10:${String(i).padStart(2, "0")}:00.000Z`,
                    level: "info",
                    message: `entry ${i}`,
                });
            }
            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

            // Request only last 10
            const result = readRecentLogs(10);

            expect(result).toHaveLength(10);
            // Should be the last 10 entries
            expect(result[0]?.message).toBe("entry 40");
            expect(result[9]?.message).toBe("entry 49");
        });

        test("handles empty file", () => {
            // Create empty log file
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");
            writeFileSync(logPath, "");

            const result = readRecentLogs();
            expect(result).toEqual([]);
        });

        test("handles file with only whitespace", () => {
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");
            writeFileSync(logPath, "   \n   \n   ");

            const result = readRecentLogs();
            expect(result).toEqual([]);
        });

        test("returns all entries when under limit", () => {
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");

            const entries = [
                { timestamp: "2026-01-30T10:00:00.000Z", level: "info", message: "entry 1" },
                { timestamp: "2026-01-30T10:01:00.000Z", level: "info", message: "entry 2" },
            ];
            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

            // Request 100, but only 2 exist
            const result = readRecentLogs(100);

            expect(result).toHaveLength(2);
        });

        test("default limit is 100", () => {
            const logDir = join(testDir, ".memory-nexus", "logs");
            mkdirSync(logDir, { recursive: true });
            const logPath = join(logDir, "sync.log");

            // Create 150 entries
            const entries = [];
            for (let i = 0; i < 150; i++) {
                entries.push({
                    timestamp: `2026-01-30T10:00:${String(i).padStart(2, "0")}.000Z`,
                    level: "info",
                    message: `entry ${i}`,
                });
            }
            writeFileSync(logPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

            const result = readRecentLogs(); // No limit specified

            expect(result).toHaveLength(100);
            // Should be the last 100 entries
            expect(result[0]?.message).toBe("entry 50");
            expect(result[99]?.message).toBe("entry 149");
        });
    });
});
