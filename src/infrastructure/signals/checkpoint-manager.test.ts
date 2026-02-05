/**
 * Checkpoint Manager Tests
 *
 * Tests sync progress checkpointing for recovery from interrupted syncs.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    clearCheckpoint,
    getCheckpointPath,
    hasCheckpoint,
    loadCheckpoint,
    saveCheckpoint,
    setTestCheckpointPath,
    type SyncCheckpoint,
} from "./checkpoint-manager.js";

describe("checkpoint-manager", () => {
    let testDir: string;
    let testCheckpointFile: string;

    beforeEach(() => {
        // Create isolated test directory
        testDir = join(tmpdir(), `memory-nexus-checkpoint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(testDir, { recursive: true });
        testCheckpointFile = join(testDir, "sync-checkpoint.json");
        setTestCheckpointPath(testCheckpointFile);
    });

    afterEach(() => {
        // Reset test path
        setTestCheckpointPath(null);

        // Clean up test directory
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors on Windows
        }
    });

    describe("getCheckpointPath", () => {
        test("returns test path when override is set", () => {
            expect(getCheckpointPath()).toBe(testCheckpointFile);
        });

        test("returns default path when no override", () => {
            setTestCheckpointPath(null);
            const path = getCheckpointPath();
            expect(path).toContain(".memory-nexus");
            expect(path).toContain("sync-checkpoint.json");
        });
    });

    describe("saveCheckpoint", () => {
        test("creates file with correct JSON", () => {
            const checkpoint: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 100,
                completedSessions: 42,
                completedSessionIds: ["session-1", "session-2"],
                lastCompletedAt: "2026-02-05T14:05:00Z",
            };

            saveCheckpoint(checkpoint);

            expect(existsSync(testCheckpointFile)).toBe(true);
            const content = readFileSync(testCheckpointFile, "utf-8");
            const parsed = JSON.parse(content);
            expect(parsed).toEqual(checkpoint);
        });

        test("creates parent directory if missing", () => {
            const nestedPath = join(testDir, "nested", "dir", "checkpoint.json");
            setTestCheckpointPath(nestedPath);

            const checkpoint: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 10,
                completedSessions: 0,
                completedSessionIds: [],
                lastCompletedAt: null,
            };

            saveCheckpoint(checkpoint);

            expect(existsSync(nestedPath)).toBe(true);
        });

        test("overwrites existing checkpoint", () => {
            const checkpoint1: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 100,
                completedSessions: 10,
                completedSessionIds: ["s1"],
                lastCompletedAt: "2026-02-05T14:01:00Z",
            };
            const checkpoint2: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 100,
                completedSessions: 50,
                completedSessionIds: ["s1", "s2", "s3"],
                lastCompletedAt: "2026-02-05T14:10:00Z",
            };

            saveCheckpoint(checkpoint1);
            saveCheckpoint(checkpoint2);

            const loaded = loadCheckpoint();
            expect(loaded?.completedSessions).toBe(50);
            expect(loaded?.completedSessionIds).toEqual(["s1", "s2", "s3"]);
        });

        test("logs warning on write error", () => {
            const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

            // Set to an invalid path (directory that can't be created)
            // On Windows, null bytes in paths are invalid
            setTestCheckpointPath("/\0invalid/path/checkpoint.json");

            const checkpoint: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 10,
                completedSessions: 0,
                completedSessionIds: [],
                lastCompletedAt: null,
            };

            saveCheckpoint(checkpoint);

            expect(warnSpy).toHaveBeenCalled();
            const warningMsg = warnSpy.mock.calls[0]?.[0];
            expect(warningMsg).toContain("Failed to save checkpoint");

            warnSpy.mockRestore();
        });
    });

    describe("loadCheckpoint", () => {
        test("returns checkpoint data when file exists", () => {
            const checkpoint: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 75,
                completedSessions: 25,
                completedSessionIds: ["a", "b", "c"],
                lastCompletedAt: "2026-02-05T14:03:00Z",
            };
            writeFileSync(testCheckpointFile, JSON.stringify(checkpoint));

            const loaded = loadCheckpoint();

            expect(loaded).toEqual(checkpoint);
        });

        test("returns null for missing file", () => {
            const loaded = loadCheckpoint();
            expect(loaded).toBeNull();
        });

        test("returns null for invalid JSON", () => {
            const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

            writeFileSync(testCheckpointFile, "not valid json {{{");

            const loaded = loadCheckpoint();

            expect(loaded).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith("Invalid checkpoint JSON, ignoring");

            warnSpy.mockRestore();
        });

        test("returns null for invalid checkpoint format", () => {
            const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

            // Valid JSON but missing required fields
            writeFileSync(testCheckpointFile, JSON.stringify({ foo: "bar" }));

            const loaded = loadCheckpoint();

            expect(loaded).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith("Invalid checkpoint format, ignoring");

            warnSpy.mockRestore();
        });

        test("returns null when completedSessionIds is not array", () => {
            const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

            writeFileSync(
                testCheckpointFile,
                JSON.stringify({
                    startedAt: "2026-02-05T14:00:00Z",
                    totalSessions: 10,
                    completedSessions: 5,
                    completedSessionIds: "not-an-array", // Invalid
                    lastCompletedAt: null,
                })
            );

            const loaded = loadCheckpoint();

            expect(loaded).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith("Invalid checkpoint format, ignoring");

            warnSpy.mockRestore();
        });
    });

    describe("clearCheckpoint", () => {
        test("removes existing checkpoint file", () => {
            const checkpoint: SyncCheckpoint = {
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 10,
                completedSessions: 5,
                completedSessionIds: [],
                lastCompletedAt: null,
            };
            saveCheckpoint(checkpoint);
            expect(existsSync(testCheckpointFile)).toBe(true);

            clearCheckpoint();

            expect(existsSync(testCheckpointFile)).toBe(false);
        });

        test("does nothing if file does not exist", () => {
            expect(existsSync(testCheckpointFile)).toBe(false);

            // Should not throw
            clearCheckpoint();

            expect(existsSync(testCheckpointFile)).toBe(false);
        });
    });

    describe("hasCheckpoint", () => {
        test("returns true when checkpoint exists", () => {
            saveCheckpoint({
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 10,
                completedSessions: 0,
                completedSessionIds: [],
                lastCompletedAt: null,
            });

            expect(hasCheckpoint()).toBe(true);
        });

        test("returns false when checkpoint does not exist", () => {
            expect(hasCheckpoint()).toBe(false);
        });

        test("returns false after checkpoint is cleared", () => {
            saveCheckpoint({
                startedAt: "2026-02-05T14:00:00Z",
                totalSessions: 10,
                completedSessions: 0,
                completedSessionIds: [],
                lastCompletedAt: null,
            });
            expect(hasCheckpoint()).toBe(true);

            clearCheckpoint();

            expect(hasCheckpoint()).toBe(false);
        });
    });

    describe("integration", () => {
        test("full save/load/clear cycle", () => {
            // Start with no checkpoint
            expect(hasCheckpoint()).toBe(false);
            expect(loadCheckpoint()).toBeNull();

            // Save initial checkpoint
            const checkpoint: SyncCheckpoint = {
                startedAt: new Date().toISOString(),
                totalSessions: 100,
                completedSessions: 0,
                completedSessionIds: [],
                lastCompletedAt: null,
            };
            saveCheckpoint(checkpoint);
            expect(hasCheckpoint()).toBe(true);

            // Update checkpoint with progress
            checkpoint.completedSessions = 50;
            checkpoint.completedSessionIds = Array.from({ length: 50 }, (_, i) => `session-${i}`);
            checkpoint.lastCompletedAt = new Date().toISOString();
            saveCheckpoint(checkpoint);

            // Load and verify
            const loaded = loadCheckpoint();
            expect(loaded?.completedSessions).toBe(50);
            expect(loaded?.completedSessionIds.length).toBe(50);

            // Clear on completion
            clearCheckpoint();
            expect(hasCheckpoint()).toBe(false);
            expect(loadCheckpoint()).toBeNull();
        });
    });
});
