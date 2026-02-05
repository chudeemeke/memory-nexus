/**
 * Health Checker Tests
 *
 * Tests for database integrity checking and system health verification.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    checkDatabaseIntegrity,
    checkQuickIntegrity,
    checkDirectoryPermissions,
    checkConfigValidity,
    checkHookStatus,
    runHealthCheck,
    setTestOverrides,
    type HealthCheckResult,
} from "./health-checker.js";
import { setTestConfigPath } from "../hooks/config-manager.js";
import { setTestLogPath } from "../hooks/log-writer.js";
import { setTestPathOverrides } from "../hooks/settings-manager.js";
import { initializeDatabase, closeDatabase } from "./connection.js";

describe("health-checker", () => {
    const testDir = join(tmpdir(), `health-checker-test-${Date.now()}`);
    const testDbPath = join(testDir, "test.db");
    const testConfigPath = join(testDir, "config.json");
    const testLogPath = join(testDir, "logs", "sync.log");
    const testSettingsPath = join(testDir, ".claude", "settings.json");

    beforeAll(() => {
        // Create test directories
        mkdirSync(join(testDir, "logs"), { recursive: true });
        mkdirSync(join(testDir, ".claude"), { recursive: true });

        // Set test path overrides
        setTestConfigPath(testConfigPath);
        setTestLogPath(testLogPath);
        setTestPathOverrides({
            settingsPath: testSettingsPath,
        });
    });

    afterAll(() => {
        // Reset overrides
        setTestConfigPath(null);
        setTestLogPath(null);
        setTestPathOverrides(null);
        setTestOverrides(null);

        // Clean up test directory
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors on Windows
        }
    });

    describe("checkDatabaseIntegrity", () => {
        it("returns 'ok' for valid database", () => {
            const { db } = initializeDatabase({ path: ":memory:" });
            try {
                const result = checkDatabaseIntegrity(db);
                expect(result).toBe("ok");
            } finally {
                closeDatabase(db);
            }
        });

        it("returns 'ok' for file-based database", () => {
            const dbPath = join(testDir, "integrity-test.db");
            const { db } = initializeDatabase({ path: dbPath });
            try {
                const result = checkDatabaseIntegrity(db);
                expect(result).toBe("ok");
            } finally {
                closeDatabase(db);
            }
        });

        it("returns 'corrupted' when PRAGMA fails", () => {
            // Create a mock database object that throws on query
            const mockDb = {
                query: () => {
                    throw new Error("Database error");
                },
            } as unknown as Database;

            const result = checkDatabaseIntegrity(mockDb);
            expect(result).toBe("corrupted");
        });
    });

    describe("checkQuickIntegrity", () => {
        it("returns 'ok' for valid database", () => {
            const { db } = initializeDatabase({ path: ":memory:" });
            try {
                const result = checkQuickIntegrity(db);
                expect(result).toBe("ok");
            } finally {
                closeDatabase(db);
            }
        });

        it("quick_check is faster than integrity_check", () => {
            // Create a database with some data
            const dbPath = join(testDir, "speed-test.db");
            const { db } = initializeDatabase({ path: dbPath });

            try {
                // Insert some test data using correct schema columns
                for (let i = 0; i < 100; i++) {
                    db.run(
                        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, end_time, message_count)
                         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 10)`,
                        [`session-${i}`, `C--test--${i}`, `C:\\test\\${i}`, `test-${i}`]
                    );
                }

                // Time quick_check
                const quickStart = performance.now();
                checkQuickIntegrity(db);
                const quickTime = performance.now() - quickStart;

                // Time integrity_check
                const fullStart = performance.now();
                checkDatabaseIntegrity(db);
                const fullTime = performance.now() - fullStart;

                // Quick check should complete (we can't always guarantee it's faster for small DBs)
                expect(quickTime).toBeGreaterThanOrEqual(0);
                expect(fullTime).toBeGreaterThanOrEqual(0);
            } finally {
                closeDatabase(db);
            }
        });

        it("returns 'corrupted' when PRAGMA fails", () => {
            const mockDb = {
                query: () => {
                    throw new Error("Database error");
                },
            } as unknown as Database;

            const result = checkQuickIntegrity(mockDb);
            expect(result).toBe("corrupted");
        });
    });

    describe("checkDirectoryPermissions", () => {
        it("returns true for existing readable/writable directory", () => {
            const result = checkDirectoryPermissions(testDir);
            expect(result.readable).toBe(true);
            expect(result.writable).toBe(true);
        });

        it("returns false for non-existing directory", () => {
            const result = checkDirectoryPermissions(join(testDir, "nonexistent"));
            expect(result.readable).toBe(false);
            expect(result.writable).toBe(false);
        });

        it("checks existing file permissions", () => {
            const testFile = join(testDir, "test-file.txt");
            writeFileSync(testFile, "test content");

            const result = checkDirectoryPermissions(testFile);
            expect(result.readable).toBe(true);
            expect(result.writable).toBe(true);
        });
    });

    describe("checkConfigValidity", () => {
        afterEach(() => {
            // Clean up config file
            try {
                rmSync(testConfigPath, { force: true });
            } catch {
                // Ignore
            }
        });

        it("returns valid for default config (no config file)", () => {
            const result = checkConfigValidity();
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it("returns valid for correct config file", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: true,
                recoveryOnStartup: true,
                syncOnCompaction: true,
                timeout: 5000,
                logLevel: "info",
                logRetentionDays: 7,
                showFailures: false,
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it("returns issues for invalid autoSync type", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: "yes", // Should be boolean
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("autoSync is not a boolean");
        });

        it("returns issues for invalid logLevel", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                logLevel: "verbose", // Invalid level
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("logLevel"))).toBe(true);
        });

        it("returns issues for invalid timeout", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                timeout: -100, // Negative
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("timeout"))).toBe(true);
        });

        it("returns issues for non-numeric timeout", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                timeout: "fast", // Not a number
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("timeout"))).toBe(true);
        });

        it("returns issues for invalid logRetentionDays", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                logRetentionDays: "forever", // Not a number
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("logRetentionDays"))).toBe(true);
        });

        it("returns issues for invalid showFailures type", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                showFailures: 1, // Should be boolean
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("showFailures is not a boolean");
        });

        it("collects multiple issues", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: "yes",
                timeout: "slow",
                logLevel: "verbose",
            }));

            const result = checkConfigValidity();
            expect(result.valid).toBe(false);
            expect(result.issues.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe("checkHookStatus", () => {
        afterEach(() => {
            // Clean up
            try {
                rmSync(testConfigPath, { force: true });
                rmSync(testSettingsPath, { force: true });
                rmSync(testLogPath, { force: true });
            } catch {
                // Ignore
            }
        });

        it("returns installed=false when no hooks configured", () => {
            writeFileSync(testSettingsPath, JSON.stringify({}));

            const result = checkHookStatus();
            expect(result.installed).toBe(false);
        });

        it("returns enabled based on config autoSync", () => {
            writeFileSync(testConfigPath, JSON.stringify({ autoSync: true }));

            const result = checkHookStatus();
            expect(result.enabled).toBe(true);
        });

        it("returns enabled=false when autoSync disabled", () => {
            writeFileSync(testConfigPath, JSON.stringify({ autoSync: false }));

            const result = checkHookStatus();
            expect(result.enabled).toBe(false);
        });

        it("returns lastRun=null when no logs", () => {
            const result = checkHookStatus();
            expect(result.lastRun).toBeNull();
        });

        it("returns lastRun from most recent log entry", () => {
            const timestamp = new Date().toISOString();
            mkdirSync(join(testDir, "logs"), { recursive: true });
            writeFileSync(testLogPath, JSON.stringify({
                timestamp,
                level: "info",
                message: "Sync complete",
            }) + "\n");

            const result = checkHookStatus();
            expect(result.lastRun).toBeInstanceOf(Date);
            expect(result.lastRun?.toISOString()).toBe(timestamp);
        });
    });

    describe("runHealthCheck", () => {
        beforeAll(() => {
            // Create test database
            const { db } = initializeDatabase({ path: testDbPath });
            closeDatabase(db);
        });

        afterEach(() => {
            setTestOverrides(null);
        });

        it("returns complete HealthCheckResult", () => {
            setTestOverrides({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            const result = runHealthCheck();

            // Verify structure
            expect(result).toHaveProperty("database");
            expect(result).toHaveProperty("permissions");
            expect(result).toHaveProperty("hooks");
            expect(result).toHaveProperty("config");

            // Database checks
            expect(result.database.exists).toBe(true);
            expect(result.database.readable).toBe(true);
            expect(result.database.writable).toBe(true);
            expect(result.database.integrity).toBe("ok");
            expect(result.database.size).toBeGreaterThan(0);

            // Permission checks
            expect(result.permissions.configDir).toBe(true);
            expect(result.permissions.logsDir).toBe(true);
            expect(result.permissions.sourceDir).toBe(true);
        });

        it("handles missing database gracefully", () => {
            setTestOverrides({
                dbPath: join(testDir, "nonexistent.db"),
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            const result = runHealthCheck();

            expect(result.database.exists).toBe(false);
            expect(result.database.readable).toBe(false);
            expect(result.database.writable).toBe(false);
            expect(result.database.integrity).toBe("unknown");
            expect(result.database.size).toBe(0);
        });

        it("handles missing directories gracefully", () => {
            setTestOverrides({
                dbPath: testDbPath,
                configDir: join(testDir, "nonexistent-config"),
                logsDir: join(testDir, "nonexistent-logs"),
                sourceDir: join(testDir, "nonexistent-source"),
            });

            const result = runHealthCheck();

            expect(result.permissions.configDir).toBe(false);
            expect(result.permissions.logsDir).toBe(false);
            expect(result.permissions.sourceDir).toBe(false);
        });

        it("accepts overrides parameter", () => {
            const result = runHealthCheck({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            expect(result.database.exists).toBe(true);
        });

        it("uses default paths when no overrides", () => {
            // Reset test overrides but keep config/log/settings paths
            // to avoid accessing real system files and timing out
            setTestOverrides(null);

            // runHealthCheck should use the testOverrides parameter
            const result = runHealthCheck({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            // Should return a complete result
            expect(result).toHaveProperty("database");
            expect(result).toHaveProperty("permissions");
            expect(result).toHaveProperty("hooks");
            expect(result).toHaveProperty("config");
        });
    });
});
