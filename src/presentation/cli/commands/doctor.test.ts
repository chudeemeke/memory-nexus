/**
 * Doctor Command Tests
 *
 * Tests for the doctor command that checks system health.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    createDoctorCommand,
    executeDoctorCommand,
    formatHealthResult,
    attemptFixes,
} from "./doctor.js";
import {
    setTestOverrides,
    type HealthCheckResult,
} from "../../../infrastructure/database/health-checker.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/connection.js";
import { setTestConfigPath } from "../../../infrastructure/hooks/config-manager.js";
import { setTestLogPath } from "../../../infrastructure/hooks/log-writer.js";
import { setTestPathOverrides } from "../../../infrastructure/hooks/settings-manager.js";

describe("doctor command", () => {
    const testDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    const testDbPath = join(testDir, "test.db");
    const testConfigPath = join(testDir, "config.json");
    const testLogPath = join(testDir, "logs", "sync.log");
    const testSettingsPath = join(testDir, ".claude", "settings.json");

    // Capture console output
    let consoleOutput: string[] = [];
    const originalLog = console.log;

    beforeAll(() => {
        // Create test directories
        mkdirSync(join(testDir, "logs"), { recursive: true });
        mkdirSync(join(testDir, ".claude"), { recursive: true });

        // Create test database
        const { db } = initializeDatabase({ path: testDbPath });
        closeDatabase(db);

        // Set test path overrides
        setTestConfigPath(testConfigPath);
        setTestLogPath(testLogPath);
        setTestPathOverrides({
            settingsPath: testSettingsPath,
        });
        setTestOverrides({
            dbPath: testDbPath,
            configDir: testDir,
            logsDir: join(testDir, "logs"),
            sourceDir: testDir,
        });
    });

    afterAll(() => {
        // Reset overrides
        setTestConfigPath(null);
        setTestLogPath(null);
        setTestPathOverrides(null);
        setTestOverrides(null);

        // Restore console
        console.log = originalLog;

        // Clean up test directory
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors on Windows
        }
    });

    afterEach(() => {
        consoleOutput = [];
        console.log = originalLog;
    });

    describe("createDoctorCommand", () => {
        it("creates command with correct name", () => {
            const cmd = createDoctorCommand();
            expect(cmd.name()).toBe("doctor");
        });

        it("has description", () => {
            const cmd = createDoctorCommand();
            expect(cmd.description()).toContain("health");
        });

        it("has --json option", () => {
            const cmd = createDoctorCommand();
            const options = cmd.options;
            const jsonOption = options.find(o => o.long === "--json");
            expect(jsonOption).toBeDefined();
        });

        it("has --fix option", () => {
            const cmd = createDoctorCommand();
            const options = cmd.options;
            const fixOption = options.find(o => o.long === "--fix");
            expect(fixOption).toBeDefined();
        });
    });

    describe("formatHealthResult", () => {
        const healthyResult: HealthCheckResult = {
            database: {
                exists: true,
                readable: true,
                writable: true,
                integrity: "ok",
                size: 2500000,
            },
            permissions: {
                configDir: true,
                logsDir: true,
                sourceDir: true,
            },
            hooks: {
                installed: true,
                enabled: true,
                lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            },
            config: {
                valid: true,
                issues: [],
            },
            embedding: {
                configured: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
                enabled: true,
                ready: true,
            },
            sqliteVec: {
                available: true,
                version: "0.1.6",
            },
            searchCapability: {
                fts5: true,
                sqliteVec: true,
                embeddedCount: 100,
                totalMessages: 100,
                coveragePercent: 100,
                defaultMode: "auto",
                vectorReady: true,
            },
        };

        it("formats healthy result with all passes", () => {
            const output = formatHealthResult(healthyResult, false);

            expect(output).toContain("Database");
            expect(output).toContain("[OK]");
            expect(output).toContain("All checks passed");
        });

        it("includes database size", () => {
            const output = formatHealthResult(healthyResult, false);
            expect(output).toContain("2.4 MB");
        });

        it("includes permissions section", () => {
            const output = formatHealthResult(healthyResult, false);

            expect(output).toContain("Permissions");
            expect(output).toContain("Config directory");
            expect(output).toContain("Logs directory");
            expect(output).toContain("Source directory");
        });

        it("includes hooks section", () => {
            const output = formatHealthResult(healthyResult, false);

            expect(output).toContain("Hooks");
            expect(output).toContain("Installed");
            expect(output).toContain("Enabled");
            expect(output).toContain("Last run");
        });

        it("formats lastRun as relative time", () => {
            const output = formatHealthResult(healthyResult, false);
            expect(output).toContain("2 hours ago");
        });

        it("includes configuration section", () => {
            const output = formatHealthResult(healthyResult, false);

            expect(output).toContain("Configuration");
            expect(output).toContain("Valid");
        });

        it("shows issues when present", () => {
            const unhealthyResult: HealthCheckResult = {
                ...healthyResult,
                config: {
                    valid: false,
                    issues: ["timeout is invalid", "logLevel is not valid"],
                },
            };

            const output = formatHealthResult(unhealthyResult, false);

            expect(output).toContain("[FAIL]");
            expect(output).toContain("Invalid");
            expect(output).toContain("timeout is invalid");
            expect(output).toContain("logLevel is not valid");
        });

        it("shows issue count when problems found", () => {
            const unhealthyResult: HealthCheckResult = {
                ...healthyResult,
                database: {
                    ...healthyResult.database,
                    integrity: "corrupted",
                },
            };

            const output = formatHealthResult(unhealthyResult, false);
            expect(output).toContain("issue");
        });

        it("handles missing database", () => {
            const noDbResult: HealthCheckResult = {
                ...healthyResult,
                database: {
                    exists: false,
                    readable: false,
                    writable: false,
                    integrity: "unknown",
                    size: 0,
                },
            };

            const output = formatHealthResult(noDbResult, false);

            expect(output).toContain("[FAIL]");
            expect(output).toContain("not found");
            expect(output).toContain("memory sync");
        });

        it("handles never-run hooks", () => {
            const neverRunResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: null,
                },
            };

            const output = formatHealthResult(neverRunResult, false);
            expect(output).toContain("never");
        });
    });

    describe("attemptFixes", () => {
        const healthyResult: HealthCheckResult = {
            database: {
                exists: true,
                readable: true,
                writable: true,
                integrity: "ok",
                size: 2500000,
            },
            permissions: {
                configDir: true,
                logsDir: true,
                sourceDir: true,
            },
            hooks: {
                installed: true,
                enabled: true,
                lastRun: new Date(),
            },
            config: {
                valid: true,
                issues: [],
            },
            embedding: {
                configured: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
                enabled: true,
                ready: true,
            },
            sqliteVec: {
                available: true,
                version: "0.1.6",
            },
            searchCapability: {
                fts5: true,
                sqliteVec: true,
                embeddedCount: 100,
                totalMessages: 100,
                coveragePercent: 100,
                defaultMode: "auto",
                vectorReady: true,
            },
        };

        it("returns empty array for healthy result", () => {
            const fixes = attemptFixes(healthyResult, false);
            expect(fixes.length).toBe(0);
        });

        it("attempts to create missing config directory", () => {
            const missingConfigDir = join(testDir, "missing-config-fix");
            setTestOverrides({
                dbPath: testDbPath,
                configDir: missingConfigDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            const result: HealthCheckResult = {
                ...healthyResult,
                permissions: {
                    ...healthyResult.permissions,
                    configDir: false,
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("config directory"))).toBe(true);

            // Reset
            setTestOverrides({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });
        });

        it("attempts to create missing logs directory", () => {
            const missingLogsDir = join(testDir, "missing-logs-fix");
            setTestOverrides({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: missingLogsDir,
                sourceDir: testDir,
            });

            const result: HealthCheckResult = {
                ...healthyResult,
                permissions: {
                    ...healthyResult.permissions,
                    logsDir: false,
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("logs directory"))).toBe(true);

            // Reset
            setTestOverrides({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });
        });

        it("warns about corrupted database", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                database: {
                    ...healthyResult.database,
                    integrity: "corrupted",
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("corruption"))).toBe(true);
        });

        it("suggests installing hooks when not installed", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    installed: false,
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("memory install"))).toBe(true);
        });
    });

    describe("migration status", () => {
        it("JSON output includes migration field", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("migration");
            expect(parsed.migration).toHaveProperty("status");
            expect(parsed.migration).toHaveProperty("legacyExists");
            expect(parsed.migration).toHaveProperty("newExists");
        });
    });

    describe("executeDoctorCommand", () => {
        it("outputs formatted result by default", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({});

            const output = consoleOutput.join("\n");
            expect(output).toContain("Database");
            expect(output).toContain("Permissions");
            expect(output).toContain("Hooks");
            expect(output).toContain("Configuration");
        });

        it("outputs JSON when --json specified", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("database");
            expect(parsed).toHaveProperty("permissions");
            expect(parsed).toHaveProperty("hooks");
            expect(parsed).toHaveProperty("config");
        });

        it("JSON output has correct types", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(typeof parsed.database.exists).toBe("boolean");
            expect(typeof parsed.database.size).toBe("number");
            expect(typeof parsed.permissions.configDir).toBe("boolean");
            expect(typeof parsed.config.valid).toBe("boolean");
            expect(Array.isArray(parsed.config.issues)).toBe(true);
        });

        it("attempts fixes when --fix specified", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ fix: true });

            const output = consoleOutput.join("\n");
            expect(output).toContain("fixes");
        });
    });

    describe("search capability section", () => {
        it("formatHealthResult includes Search Capability section", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 500,
                    totalMessages: 1000,
                    coveragePercent: 50,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("Search Capability");
        });

        it("shows FTS5 and sqlite-vec status in search capability", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 500,
                    totalMessages: 1000,
                    coveragePercent: 50,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("FTS5");
            expect(output).toContain("Vector search");
        });

        it("shows embedding count and coverage percentage", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 500,
                    totalMessages: 1000,
                    coveragePercent: 50,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("500/1000");
            expect(output).toContain("50%");
        });

        it("shows default mode", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 100,
                    totalMessages: 100,
                    coveragePercent: 100,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("auto");
        });

        it("shows vector not ready when sqlite-vec unavailable", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: false, version: null },
                searchCapability: {
                    fts5: true,
                    sqliteVec: false,
                    embeddedCount: 0,
                    totalMessages: 100,
                    coveragePercent: 0,
                    defaultMode: "auto",
                    vectorReady: false,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("not ready");
        });
    });

    describe("provider readiness in output", () => {
        it("shows provider readiness status line", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("Ready");
        });

        it("shows readyReason when provider is not ready", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    enabled: true,
                    ready: false,
                    readyReason: "API key not set",
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("API key not set");
        });

        it("shows readyReason as informational note for deferred-check providers", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "ollama",
                    model: "nomic-embed-text",
                    dimensions: 768,
                    enabled: true,
                    ready: true,
                    readyReason: "Server reachability verified at sync time",
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("Server reachability verified at sync time");
        });

        it("JSON output includes ready and readyReason fields", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed.embedding).toHaveProperty("ready");
            expect(typeof parsed.embedding.ready).toBe("boolean");
        });
    });

    describe("doctor exit codes", () => {
        it("returns exit code 0 or 1 depending on vector readiness", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const result = await executeDoctorCommand({});
            // Exit code 0 when fully healthy (vector ready), 1 when degraded (no embeddings/sqlite-vec)
            // Test environment typically has no embeddings, so 1 (degraded) is expected
            expect(result.exitCode).toBeLessThanOrEqual(1);
            expect(result.exitCode).toBeGreaterThanOrEqual(0);
        });

        it("returns exit code 2 when database not found", async () => {
            // Override with non-existent database path
            setTestOverrides({
                dbPath: join(testDir, "nonexistent.db"),
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const result = await executeDoctorCommand({});
            expect(result.exitCode).toBe(2);

            // Reset overrides
            setTestOverrides({
                dbPath: testDbPath,
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });
        });
    });

    describe("embedding section in output", () => {
        it("formatHealthResult includes Embeddings section header", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("Embeddings");
        });

        it("shows provider, model, and dimensions", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("local");
            expect(output).toContain("Xenova/all-MiniLM-L6-v2");
            expect(output).toContain("384");
        });

        it("shows enabled/disabled status", () => {
            const disabledResult: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: false,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(disabledResult, false);
            expect(output).toContain("no");
        });

        it("shows sqlite-vec status in Database section", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: true, version: "0.1.6" },
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("sqlite-vec");
            expect(output).toContain("v0.1.6");
        });

        it("shows sqlite-vec not available status", () => {
            const result: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: null },
                config: { valid: true, issues: [] },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: { available: false, version: null },
                searchCapability: { fts5: true, sqliteVec: false, embeddedCount: 0, totalMessages: 0, coveragePercent: 0, defaultMode: "auto", vectorReady: false },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("sqlite-vec");
            expect(output).toContain("not available");
        });

        it("JSON output includes embedding and sqliteVec fields", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("embedding");
            expect(parsed.embedding).toHaveProperty("provider");
            expect(parsed.embedding).toHaveProperty("model");
            expect(parsed.embedding).toHaveProperty("dimensions");
            expect(parsed.embedding).toHaveProperty("enabled");

            expect(parsed).toHaveProperty("sqliteVec");
            expect(parsed.sqliteVec).toHaveProperty("available");
            expect(parsed.sqliteVec).toHaveProperty("version");
        });
    });
});
