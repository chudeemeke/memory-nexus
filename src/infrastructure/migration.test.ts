/**
 * Migration Module Tests
 *
 * Tests for legacy path detection and migration with rollback safety.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setTestPaths, resetTestPaths } from "./paths.js";
import {
    getMigrationStatus,
    migrateFromLegacy,
    moveFileOrDir,
    type MigrationResult,
    type MigrationStatusResult,
} from "./migration.js";

// Mock settings-manager to avoid actual hook manipulation
import * as settingsManager from "./hooks/settings-manager.js";

describe("migration", () => {
    let testDir: string;
    let legacyDir: string;
    let configDir: string;
    let dataDir: string;

    // Save original HOME
    let originalHome: string | undefined;

    beforeEach(() => {
        // Create isolated temp directory for each test
        testDir = mkdtempSync(join(tmpdir(), "memory-migration-test-"));
        legacyDir = join(testDir, ".memory-nexus");
        configDir = join(testDir, "config", "memory");
        dataDir = join(testDir, "data", "memory");

        // Override HOME so getLegacyDir() points to our test dir
        originalHome = process.env.HOME;
        process.env.HOME = testDir;
        process.env.USERPROFILE = testDir;

        // Override paths module for new paths
        setTestPaths({ configDir, dataDir });
    });

    afterEach(() => {
        // Restore HOME
        if (originalHome !== undefined) {
            process.env.HOME = originalHome;
            process.env.USERPROFILE = originalHome;
        }

        resetTestPaths();

        // Clean up
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors on Windows
        }
    });

    describe("getMigrationStatus", () => {
        test("returns not-needed when no legacy dir exists", () => {
            const result = getMigrationStatus();
            expect(result.status).toBe("not-needed");
            expect(result.legacyExists).toBe(false);
            expect(result.newExists).toBe(false);
        });

        test("returns pending when legacy dir exists but new paths do not", () => {
            mkdirSync(legacyDir, { recursive: true });

            const result = getMigrationStatus();
            expect(result.status).toBe("pending");
            expect(result.legacyExists).toBe(true);
            expect(result.newExists).toBe(false);
        });

        test("returns complete when new paths exist and no legacy dir", () => {
            mkdirSync(configDir, { recursive: true });
            mkdirSync(dataDir, { recursive: true });

            const result = getMigrationStatus();
            expect(result.status).toBe("complete");
            expect(result.legacyExists).toBe(false);
            expect(result.newExists).toBe(true);
        });

        test("returns partial when both legacy and new paths exist", () => {
            mkdirSync(legacyDir, { recursive: true });
            mkdirSync(configDir, { recursive: true });
            mkdirSync(dataDir, { recursive: true });

            const result = getMigrationStatus();
            expect(result.status).toBe("partial");
            expect(result.legacyExists).toBe(true);
            expect(result.newExists).toBe(true);
        });
    });

    describe("migrateFromLegacy", () => {
        test("returns synchronously (not a Promise)", () => {
            const result = migrateFromLegacy();
            // If it returned a Promise, result would not have .migrated directly
            expect(typeof result.migrated).toBe("boolean");
            expect(Array.isArray(result.itemsMoved)).toBe(true);
            expect(Array.isArray(result.errors)).toBe(true);
        });

        test("is a no-op when legacy dir does not exist", () => {
            const result = migrateFromLegacy();
            expect(result.migrated).toBe(false);
            expect(result.itemsMoved).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        test("moves database file from legacy to new data dir", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "fake-database-content");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("memory.db");
            expect(existsSync(join(dataDir, "memory.db"))).toBe(true);
            expect(readFileSync(join(dataDir, "memory.db"), "utf-8")).toBe("fake-database-content");

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves config file from legacy to new config dir", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "config.json"), '{"autoSync":true}');

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("config.json");
            expect(existsSync(join(configDir, "config.json"))).toBe(true);
            expect(readFileSync(join(configDir, "config.json"), "utf-8")).toBe('{"autoSync":true}');

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves checkpoint file from legacy to new data dir", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "sync-checkpoint.json"), '{"totalSessions":10}');

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("sync-checkpoint.json");
            expect(existsSync(join(dataDir, "sync-checkpoint.json"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves logs directory from legacy to new data dir", () => {
            const legacyLogs = join(legacyDir, "logs");
            mkdirSync(legacyLogs, { recursive: true });
            writeFileSync(join(legacyLogs, "sync.log"), "log entry\n");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("logs");
            expect(existsSync(join(dataDir, "logs", "sync.log"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves hooks directory from legacy to new data dir", () => {
            const legacyHooks = join(legacyDir, "hooks");
            mkdirSync(legacyHooks, { recursive: true });
            writeFileSync(join(legacyHooks, "sync-hook.js"), "// hook script");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("hooks");
            expect(existsSync(join(dataDir, "hooks", "sync-hook.js"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves backups directory from legacy to new data dir", () => {
            const legacyBackups = join(legacyDir, "backups");
            mkdirSync(legacyBackups, { recursive: true });
            writeFileSync(join(legacyBackups, "settings.json.backup"), "{}");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("backups");
            expect(existsSync(join(dataDir, "backups", "settings.json.backup"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("moves all files in priority order (db first, config second)", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");
            writeFileSync(join(legacyDir, "config.json"), "{}");
            writeFileSync(join(legacyDir, "sync-checkpoint.json"), "{}");
            mkdirSync(join(legacyDir, "logs"), { recursive: true });
            mkdirSync(join(legacyDir, "hooks"), { recursive: true });
            mkdirSync(join(legacyDir, "backups"), { recursive: true });

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toHaveLength(6);
            // DB should be first
            expect(result.itemsMoved[0]).toBe("memory.db");
            // Config second
            expect(result.itemsMoved[1]).toBe("config.json");

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("handles individual missing items gracefully", () => {
            // Only create legacy dir with db file, no config, no logs, etc.
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db-only");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("memory.db");
            // Only moved items that existed
            expect(result.itemsMoved).toHaveLength(1);
            expect(result.errors).toHaveLength(0);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("removes empty legacy directory after successful migration", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            migrateFromLegacy();

            expect(existsSync(legacyDir)).toBe(false);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("calls uninstallHooks then installHooks after data moves", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");

            const callOrder: string[] = [];
            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockImplementation(() => {
                callOrder.push("uninstall");
                return { success: true, message: "Hooks uninstalled successfully" };
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockImplementation(() => {
                callOrder.push("install");
                return { success: true, message: "Hooks installed successfully" };
            });

            migrateFromLegacy();

            expect(uninstallSpy).toHaveBeenCalledTimes(1);
            expect(installSpy).toHaveBeenCalledTimes(1);
            expect(callOrder).toEqual(["uninstall", "install"]);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("hook re-install failure does not fail migration", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockImplementation(() => {
                throw new Error("Hook uninstall failed");
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            // Migration succeeded for data
            expect(result.migrated).toBe(true);
            expect(result.itemsMoved).toContain("memory.db");
            // Hook error is recorded
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.includes("hook"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("rolls back completed moves on failure", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db-content");
            writeFileSync(join(legacyDir, "config.json"), "config-content");

            // Create the data dir but make the config dir target problematic
            // by creating a FILE where a directory is expected
            mkdirSync(dataDir, { recursive: true });
            // Write a file where configDir parent should be a directory
            // This will cause the config.json move to fail since we can't create the config dir
            const configParent = join(testDir, "config");
            rmSync(configParent, { recursive: true, force: true });
            writeFileSync(configParent, "blocker-file");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            // Migration should report failure
            expect(result.migrated).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            // DB should have been rolled back to legacy dir
            expect(existsSync(join(legacyDir, "memory.db"))).toBe(true);
            expect(readFileSync(join(legacyDir, "memory.db"), "utf-8")).toBe("db-content");

            uninstallSpy.mockRestore();
            installSpy.mockRestore();

            // Clean up the blocker file
            rmSync(configParent, { force: true });
        });

        test("rolls back on move failure using renameSync mock", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db-to-rollback");
            writeFileSync(join(legacyDir, "config.json"), "config-to-fail");

            // We need renameSync to work for:
            //   call 1: mkdirSync ensureParent for memory.db dest (no rename)
            //   call 2: renameSync for memory.db move (succeed)
            //   call 3: mkdirSync ensureParent for config.json dest (no rename)
            //   call 4: renameSync for config.json move (fail)
            //   call 5: renameSync for rollback of memory.db (succeed)
            let renameCallCount = 0;
            const originalRenameSync = nodeFs.renameSync.bind(nodeFs);
            const renameSpy = spyOn(nodeFs, "renameSync").mockImplementation((src: any, dest: any) => {
                renameCallCount++;
                // Fail the second renameSync call (config.json move attempt)
                if (renameCallCount === 2) {
                    throw new Error("Simulated move failure");
                }
                return originalRenameSync(src, dest);
            });

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            const result = migrateFromLegacy();

            // Restore mocks immediately after call
            renameSpy.mockRestore();
            uninstallSpy.mockRestore();
            installSpy.mockRestore();

            expect(result.migrated).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain("config.json");
            // DB should be rolled back to legacy dir
            expect(existsSync(join(legacyDir, "memory.db"))).toBe(true);
            expect(readFileSync(join(legacyDir, "memory.db"), "utf-8")).toBe("db-to-rollback");
        });

        test("reports rollback failure when rollback move also fails", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db-data");
            writeFileSync(join(legacyDir, "config.json"), "config-data");

            let renameCallCount = 0;
            const originalRenameSync = nodeFs.renameSync.bind(nodeFs);
            const renameSpy = spyOn(nodeFs, "renameSync").mockImplementation((src: any, dest: any) => {
                renameCallCount++;
                if (renameCallCount === 1) {
                    // Let memory.db move succeed
                    return originalRenameSync(src, dest);
                }
                // Fail on config.json forward move AND the rollback move
                throw new Error("Simulated failure");
            });

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "ok",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "ok",
            });

            const result = migrateFromLegacy();

            renameSpy.mockRestore();
            uninstallSpy.mockRestore();
            installSpy.mockRestore();

            expect(result.migrated).toBe(false);
            // Should have both the forward failure and the rollback failure
            expect(result.errors.length).toBeGreaterThanOrEqual(2);
            expect(result.errors.some(e => e.includes("Rollback failed"))).toBe(true);
        });

        test("creates new config and data directories if they do not exist", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");
            writeFileSync(join(legacyDir, "config.json"), "{}");

            expect(existsSync(configDir)).toBe(false);
            expect(existsSync(dataDir)).toBe(false);

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            migrateFromLegacy();

            expect(existsSync(configDir)).toBe(true);
            expect(existsSync(dataDir)).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("returns migrated false when legacy dir has no known items", () => {
            mkdirSync(legacyDir, { recursive: true });
            // Create unknown files that are not in the move list
            writeFileSync(join(legacyDir, "unknown-file.txt"), "unknown");

            const result = migrateFromLegacy();

            expect(result.migrated).toBe(false);
            expect(result.itemsMoved).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
            // Legacy dir should still exist since it has remaining files
            expect(existsSync(legacyDir)).toBe(true);
        });

        test("does not remove legacy dir when it still has files", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");
            writeFileSync(join(legacyDir, "extra-unknown.txt"), "unknown");

            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            migrateFromLegacy();

            // Legacy dir should remain since it has unknown files
            expect(existsSync(legacyDir)).toBe(true);
            expect(existsSync(join(legacyDir, "extra-unknown.txt"))).toBe(true);

            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });

        test("prints notice to stderr on successful migration", () => {
            mkdirSync(legacyDir, { recursive: true });
            writeFileSync(join(legacyDir, "memory.db"), "db");

            const stderrSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
            const uninstallSpy = spyOn(settingsManager, "uninstallHooks").mockReturnValue({
                success: true,
                message: "Hooks uninstalled successfully",
            });
            const installSpy = spyOn(settingsManager, "installHooks").mockReturnValue({
                success: true,
                message: "Hooks installed successfully",
            });

            migrateFromLegacy();

            const output = stderrSpy.mock.calls.map(c => String(c[0])).join("");
            expect(output).toContain("Migrated");

            stderrSpy.mockRestore();
            uninstallSpy.mockRestore();
            installSpy.mockRestore();
        });
    });

    describe("moveFileOrDir", () => {
        test("moves a file using renameSync on same filesystem", () => {
            const src = join(testDir, "source-file.txt");
            const dest = join(testDir, "dest-dir", "moved-file.txt");
            writeFileSync(src, "file-content");

            moveFileOrDir(src, dest, false);

            expect(existsSync(dest)).toBe(true);
            expect(readFileSync(dest, "utf-8")).toBe("file-content");
            expect(existsSync(src)).toBe(false);
        });

        test("moves a directory using renameSync on same filesystem", () => {
            const srcDir = join(testDir, "source-dir");
            const destDir = join(testDir, "dest-parent", "moved-dir");
            mkdirSync(srcDir, { recursive: true });
            writeFileSync(join(srcDir, "inner.txt"), "inner-content");

            moveFileOrDir(srcDir, destDir, true);

            expect(existsSync(join(destDir, "inner.txt"))).toBe(true);
            expect(readFileSync(join(destDir, "inner.txt"), "utf-8")).toBe("inner-content");
            expect(existsSync(srcDir)).toBe(false);
        });

        test("falls back to copy+delete for files on EXDEV", () => {
            const src = join(testDir, "exdev-file.txt");
            const dest = join(testDir, "exdev-dest", "file.txt");
            writeFileSync(src, "exdev-content");

            // Mock renameSync to throw EXDEV
            const renameSpy = spyOn(nodeFs, "renameSync").mockImplementation(() => {
                const err = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException;
                err.code = "EXDEV";
                throw err;
            });

            moveFileOrDir(src, dest, false);

            expect(existsSync(dest)).toBe(true);
            expect(readFileSync(dest, "utf-8")).toBe("exdev-content");
            expect(existsSync(src)).toBe(false);

            renameSpy.mockRestore();
        });

        test("falls back to copy+delete for directories on EXDEV", () => {
            const srcDir = join(testDir, "exdev-dir");
            const destDir = join(testDir, "exdev-dest-dir", "dir");
            mkdirSync(srcDir, { recursive: true });
            writeFileSync(join(srcDir, "data.txt"), "dir-data");

            // Mock renameSync to throw EXDEV
            const renameSpy = spyOn(nodeFs, "renameSync").mockImplementation(() => {
                const err = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException;
                err.code = "EXDEV";
                throw err;
            });

            moveFileOrDir(srcDir, destDir, true);

            expect(existsSync(join(destDir, "data.txt"))).toBe(true);
            expect(readFileSync(join(destDir, "data.txt"), "utf-8")).toBe("dir-data");
            expect(existsSync(srcDir)).toBe(false);

            renameSpy.mockRestore();
        });

        test("re-throws non-EXDEV errors", () => {
            const src = join(testDir, "nonexistent-source.txt");
            const dest = join(testDir, "dest", "file.txt");

            expect(() => moveFileOrDir(src, dest, false)).toThrow();
        });
    });
});
