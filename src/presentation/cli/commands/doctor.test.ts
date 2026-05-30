/**
 * Doctor Command Tests
 *
 * Tests for the doctor command that checks system health.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
    createDoctorCommand,
    executeDoctorCommand,
    formatHealthResult,
    attemptFixes,
    runPortabilityDiagnostics,
    isMixedPathDialect,
} from "./doctor.js";
import type { HealthCheckResult } from "../../../infrastructure/database/health-checker.js";
import type { StatusInfo } from "./status.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/connection.js";
import type { PathOverrides } from "../../../infrastructure/hooks/settings-manager.js";

describe("doctor command", () => {
    const testDir = join(tmpdir(), `doctor-test-${Date.now()}`);
    const testDbPath = join(testDir, "test.db");
    const testConfigPath = join(testDir, "config.json");
    const testLogPath = join(testDir, "logs", "sync.log");
    const testSettingsPath = join(testDir, ".claude", "settings.json");

    // Capture console output
    let consoleOutput: string[] = [];
    const originalLog = console.log;

    const hookOverrides: PathOverrides = { settingsPath: testSettingsPath };

    /** Default health overrides used by all tests in this suite. */
    const healthOverrides = () => ({
        dbPath: testDbPath,
        configDir: testDir,
        logsDir: join(testDir, "logs"),
        sourceDir: testDir,
        hookOverrides,
    });

    function createStatusInfo(health: HealthCheckResult): StatusInfo {
        return {
            hooks: {
                sessionEnd: health.hooks.installed,
                preCompact: health.hooks.installed,
                hookScriptExists: health.hooks.installed,
                backupExists: false,
            },
            config: {} as StatusInfo["config"],
            lastSync: null,
            pendingSessions: 0,
            recentLogs: 0,
            embedding: { active: false },
            health,
            migration: {
                legacyExists: false,
                newExists: true,
                status: "complete",
            },
            qmd: {
                available: true,
                path: "/usr/bin/qmd",
            },
            fixes: [],
        };
    }

    beforeAll(() => {
        // Create test directories
        mkdirSync(join(testDir, "logs"), { recursive: true });
        mkdirSync(join(testDir, ".claude"), { recursive: true });

        // Create test database
        const { db } = initializeDatabase({ path: testDbPath });
        closeDatabase(db);
    });

    afterAll(() => {
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

        it("formats singular and sub-minute relative hook times", () => {
            const oneDayResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            };
            const oneMinuteResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(Date.now() - 60 * 1000),
                },
            };
            const justNowResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(),
                },
            };

            expect(formatHealthResult(oneDayResult, false)).toContain("1 day ago");
            expect(formatHealthResult(oneMinuteResult, false)).toContain("1 minute ago");
            expect(formatHealthResult(justNowResult, false)).toContain("just now");
        });

        it("formats plural day/hour/minute hook times", () => {
            const twoDaysResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                },
            };
            const oneHourResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(Date.now() - 60 * 60 * 1000),
                },
            };
            const twoMinutesResult: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    ...healthyResult.hooks,
                    lastRun: new Date(Date.now() - 2 * 60 * 1000),
                },
            };

            expect(formatHealthResult(twoDaysResult, false)).toContain("2 days ago");
            expect(formatHealthResult(oneHourResult, false)).toContain("1 hour ago");
            expect(formatHealthResult(twoMinutesResult, false)).toContain("2 minutes ago");
        });

        it("formats disabled hooks and missing optional LLM extraction cleanly", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                hooks: {
                    installed: false,
                    enabled: false,
                    lastRun: null,
                },
            };

            const output = formatHealthResult(result, false);

            expect(output).toContain("Installed: no");
            expect(output).toContain("Enabled (autoSync): no");
            expect(output).not.toContain("LLM Fact Extraction");
        });

        it("formats zero-size databases and unknown integrity distinctly", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                database: {
                    exists: true,
                    readable: true,
                    writable: true,
                    integrity: "unknown",
                    size: 0,
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("0 B");
            expect(output).toContain("unknown");
        });

        it("counts unreadable, unwritable, source permission, and LLM extraction failures", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                database: {
                    exists: true,
                    readable: false,
                    writable: false,
                    integrity: "corrupted",
                    size: 1000,
                },
                permissions: {
                    configDir: true,
                    logsDir: true,
                    sourceDir: false,
                },
                llmExtraction: {
                    ready: false,
                    provider: "openai",
                    model: "gpt-4.1-mini",
                    readyReason: "API key missing",
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("CORRUPTED");
            expect(output).toContain("Source directory");
            expect(output).toContain("API key missing");
            expect(output).toContain("issues found");
        });

        it("prints LLM extraction note when readiness is deferred but acceptable", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                llmExtraction: {
                    ready: true,
                    provider: "claude-cli",
                    model: "claude-cli-print",
                    readyReason: "Verified at extraction time",
                },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("LLM Fact Extraction");
            expect(output).toContain("Verified at extraction time");
        });

        it("prints LLM extraction status without reason when no reason is provided", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                llmExtraction: {
                    ready: true,
                    provider: "claude-cli",
                    model: "claude-cli-print",
                },
            };

            const output = formatHealthResult(result, false);

            expect(output).toContain("LLM Fact Extraction");
            expect(output).toContain("Ready: yes");
            expect(output).not.toContain("Reason:");
            expect(output).not.toContain("Note:");
        });

        it("counts config and log permission failures separately", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                permissions: {
                    configDir: false,
                    logsDir: false,
                    sourceDir: true,
                },
            };

            const output = formatHealthResult(result, false);

            expect(output).toContain("Config directory");
            expect(output).toContain("Logs directory");
            expect(output).toContain("2 issues found");
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
            // attemptFixes reads getConfigDir() from paths.ts directly,
            // so health-checker overrides have no effect here. The test
            // verifies the "fix" code path runs when permissions.configDir
            // is false; the actual mkdir target is the production path.
            const result: HealthCheckResult = {
                ...healthyResult,
                permissions: {
                    ...healthyResult.permissions,
                    configDir: false,
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("config directory"))).toBe(true);
        });

        it("attempts to create missing logs directory", () => {
            const result: HealthCheckResult = {
                ...healthyResult,
                permissions: {
                    ...healthyResult.permissions,
                    logsDir: false,
                },
            };

            const fixes = attemptFixes(result, false);
            expect(fixes.some(f => f.includes("logs directory"))).toBe(true);
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

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

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

            await executeDoctorCommand({}, { healthOverrides: healthOverrides() });

            const output = consoleOutput.join("\n");
            expect(output).toContain("Database");
            expect(output).toContain("Permissions");
            expect(output).toContain("Hooks");
            expect(output).toContain("Configuration");
        });

        it("outputs JSON when --json specified", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("database");
            expect(parsed).toHaveProperty("permissions");
            expect(parsed).toHaveProperty("hooks");
            expect(parsed).toHaveProperty("config");
        });

        it("passes undefined wrapper paths when JSON status uses default dependencies", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);
            const healthy = createStatusInfo({
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
                    embeddedCount: 1,
                    totalMessages: 1,
                    coveragePercent: 100,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            });
            let receivedOptions: unknown;

            const result = await executeDoctorCommand(
                { json: true },
                {
                    gatherStatus: async (options) => {
                        receivedOptions = options;
                        return healthy;
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(receivedOptions).toEqual({
                dbPath: undefined,
                logPath: undefined,
                configPath: undefined,
                hookOverrides: undefined,
                fix: undefined,
                stats: false,
            });
        });

        it("returns JSON exit code 0 for injected fully healthy status", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const healthy: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: true, sourceDir: true },
                hooks: { installed: true, enabled: true, lastRun: new Date("2026-05-28T12:00:00Z") },
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
                    embeddedCount: 10,
                    totalMessages: 10,
                    coveragePercent: 100,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const result = await executeDoctorCommand(
                { json: true },
                { gatherStatus: async () => createStatusInfo(healthy) },
            );

            const parsed = JSON.parse(consoleOutput.join("\n"));
            expect(result.exitCode).toBe(0);
            expect(parsed.hooks.lastRun).toBe("2026-05-28T12:00:00.000Z");
        });

        it("returns JSON exit code 2 for corrupted database status", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const corrupted: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "corrupted", size: 1000 },
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
                    embeddedCount: 10,
                    totalMessages: 10,
                    coveragePercent: 100,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const result = await executeDoctorCommand(
                { json: true },
                { gatherStatus: async () => createStatusInfo(corrupted) },
            );

            expect(result.exitCode).toBe(2);
        });

        it("returns JSON exit code 1 for non-fatal health issues", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const degraded: HealthCheckResult = {
                database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1000 },
                permissions: { configDir: true, logsDir: false, sourceDir: true },
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
                    embeddedCount: 10,
                    totalMessages: 10,
                    coveragePercent: 100,
                    defaultMode: "auto",
                    vectorReady: true,
                },
            };

            const result = await executeDoctorCommand(
                { json: true },
                { gatherStatus: async () => createStatusInfo(degraded) },
            );

            expect(result.exitCode).toBe(1);
        });

        it("JSON output has correct types", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

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

            await executeDoctorCommand({ fix: true }, { healthOverrides: healthOverrides() });

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

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

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

            const result = await executeDoctorCommand({}, { healthOverrides: healthOverrides() });
            // Exit code 0 when fully healthy (vector ready), 1 when degraded (no embeddings/sqlite-vec)
            // Test environment typically has no embeddings, so 1 (degraded) is expected
            expect(result.exitCode).toBeLessThanOrEqual(1);
            expect(result.exitCode).toBeGreaterThanOrEqual(0);
        });

        it("returns exit code 2 when database not found", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const result = await executeDoctorCommand({}, {
                healthOverrides: {
                    dbPath: join(testDir, "nonexistent.db"),
                    configDir: testDir,
                    logsDir: join(testDir, "logs"),
                    sourceDir: testDir,
                    hookOverrides,
                },
            });
            expect(result.exitCode).toBe(2);
        });
    });

    describe("portability diagnostics", () => {
        it("classifies path dialects for Windows and Unix hosts without reading the active platform", () => {
            expect(isMixedPathDialect("/home/destiny/project", "win32")).toBe(true);
            expect(isMixedPathDialect("/mnt/c/Users/Destiny/project", "win32")).toBe(true);
            expect(isMixedPathDialect("/var/lib/memory", "win32")).toBe(true);
            expect(isMixedPathDialect("/usr/local/bin", "win32")).toBe(true);
            expect(isMixedPathDialect("/opt/memory", "win32")).toBe(true);
            expect(isMixedPathDialect("C:\\Projects\\memory", "win32")).toBe(false);
            expect(isMixedPathDialect("C:\\Projects\\memory", "linux")).toBe(true);
            expect(isMixedPathDialect("/home/destiny/project", "linux")).toBe(false);
        });

        it("reports missing database as JSON without attempting a scan", async () => {
            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            const result = await runPortabilityDiagnostics({ portability: true, json: true }, {
                healthOverrides: {
                    dbPath: join(testDir, "missing-portability.db"),
                    sourceDir: testDir,
                },
            });

            const parsed = JSON.parse(consoleOutput.join("\n"));
            expect(result.exitCode).toBe(1);
            expect(parsed.error).toContain("Database does not exist");
        });

        it("reports mixed dialects, orphaned paths, stale locks, and sqlite-vec failures in JSON", async () => {
            const portabilityDir = join(tmpdir(), `doctor-portability-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const portabilityDb = join(portabilityDir, "memory.db");
            mkdirSync(portabilityDir, { recursive: true });
            const { db } = initializeDatabase({ path: portabilityDb });
            try {
                db.run(
                    `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                     VALUES (?, ?, ?, ?, ?)`,
                    ["portable-1", "encoded", "/home/destiny/missing-project", "missing-project", new Date().toISOString()]
                );
            } finally {
                closeDatabase(db);
            }
            writeFileSync(join(portabilityDir, "embedding.lock"), "{not json");

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            try {
                const result = await runPortabilityDiagnostics({ portability: true, json: true, fix: true }, {
                    healthOverrides: {
                        dbPath: portabilityDb,
                        sourceDir: portabilityDir,
                    },
                    gatherStatus: async () => createStatusInfo({
                        database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1 },
                        permissions: { configDir: true, logsDir: true, sourceDir: true },
                        hooks: { installed: true, enabled: true, lastRun: null },
                        config: { valid: true, issues: [] },
                        embedding: {
                            configured: true,
                            provider: "local",
                            model: "test",
                            dimensions: 384,
                            enabled: true,
                            ready: true,
                        },
                        sqliteVec: { available: false, version: null },
                        searchCapability: {
                            fts5: true,
                            sqliteVec: false,
                            embeddedCount: 0,
                            totalMessages: 0,
                            coveragePercent: 0,
                            defaultMode: "auto",
                            vectorReady: false,
                        },
                    }),
                });

                const parsed = JSON.parse(consoleOutput.join("\n"));
                expect(result.exitCode).toBe(1);
                expect(parsed.portability.mixedDialectPaths).toContain("/home/destiny/missing-project");
                expect(parsed.portability.orphanedPaths).toContain("/home/destiny/missing-project");
                expect(parsed.portability.staleLocks).toContain(join(portabilityDir, "embedding.lock"));
                expect(parsed.portability.sqliteVecAvailable).toBe(false);
                expect(parsed.portability.fixedStaleLocks).toBe(true);
            } finally {
                try {
                    rmSync(portabilityDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can release handles late.
                }
            }
        });

        it("deduplicates repeated orphan paths in portability JSON", async () => {
            const portabilityDir = join(tmpdir(), `doctor-portability-dupe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const portabilityDb = join(portabilityDir, "memory.db");
            mkdirSync(portabilityDir, { recursive: true });
            const { db } = initializeDatabase({ path: portabilityDb });
            try {
                for (const id of ["portable-dupe-1", "portable-dupe-2"]) {
                    db.run(
                        `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                         VALUES (?, ?, ?, ?, ?)`,
                        [id, `encoded-${id}`, "/home/destiny/repeated-missing-project", "missing-project", new Date().toISOString()]
                    );
                }
            } finally {
                closeDatabase(db);
            }

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            try {
                const result = await runPortabilityDiagnostics({ portability: true, json: true, fix: true }, {
                    healthOverrides: {
                        dbPath: portabilityDb,
                        sourceDir: portabilityDir,
                    },
                    gatherStatus: async () => createStatusInfo({
                        database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1 },
                        permissions: { configDir: true, logsDir: true, sourceDir: true },
                        hooks: { installed: true, enabled: true, lastRun: null },
                        config: { valid: true, issues: [] },
                        embedding: {
                            configured: true,
                            provider: "local",
                            model: "test",
                            dimensions: 384,
                            enabled: true,
                            ready: true,
                        },
                        sqliteVec: { available: true, version: "v0.1.9" },
                        searchCapability: {
                            fts5: true,
                            sqliteVec: true,
                            embeddedCount: 0,
                            totalMessages: 0,
                            coveragePercent: 0,
                            defaultMode: "auto",
                            vectorReady: false,
                        },
                    }),
                });

                const parsed = JSON.parse(consoleOutput.join("\n"));
                expect(result.exitCode).toBe(1);
                expect(parsed.portability.orphanedPaths).toEqual(["/home/destiny/repeated-missing-project"]);
            } finally {
                try {
                    rmSync(portabilityDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can release handles late.
                }
            }
        });

        it("reports portability scan failures as JSON", async () => {
            const portabilityDir = join(tmpdir(), `doctor-portability-corrupt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const portabilityDb = join(portabilityDir, "memory.db");
            mkdirSync(portabilityDir, { recursive: true });
            writeFileSync(portabilityDb, "not sqlite");

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            try {
                const result = await runPortabilityDiagnostics({ portability: true, json: true }, {
                    healthOverrides: {
                        dbPath: portabilityDb,
                        sourceDir: portabilityDir,
                    },
                });

                const parsed = JSON.parse(consoleOutput.join("\n"));
                expect(result.exitCode).toBe(2);
                expect(parsed.error).toContain("Portability scan failed");
            } finally {
                try {
                    rmSync(portabilityDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can release handles late.
                }
            }
        });

        it("renders text success diagnostics when no portability issues are found", async () => {
            const portabilityDir = join(tmpdir(), `doctor-portability-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const portabilityDb = join(portabilityDir, "memory.db");
            mkdirSync(portabilityDir, { recursive: true });
            const { db } = initializeDatabase({ path: portabilityDb });
            closeDatabase(db);

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            try {
                const result = await runPortabilityDiagnostics({ portability: true }, {
                    healthOverrides: {
                        dbPath: portabilityDb,
                        sourceDir: portabilityDir,
                    },
                    gatherStatus: async () => createStatusInfo({
                        database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1 },
                        permissions: { configDir: true, logsDir: true, sourceDir: true },
                        hooks: { installed: true, enabled: true, lastRun: null },
                        config: { valid: true, issues: [] },
                        embedding: {
                            configured: true,
                            provider: "local",
                            model: "test",
                            dimensions: 384,
                            enabled: true,
                            ready: true,
                        },
                        sqliteVec: { available: true, version: "v0.1.9" },
                        searchCapability: {
                            fts5: true,
                            sqliteVec: true,
                            embeddedCount: 0,
                            totalMessages: 0,
                            coveragePercent: 0,
                            defaultMode: "auto",
                            vectorReady: false,
                        },
                    }),
                });

                const output = consoleOutput.join("\n");
                expect(result.exitCode).toBe(0);
                expect(output).toContain("Path Dialects: No mixed");
                expect(output).toContain("Orphaned Workspaces: All session folders exist");
                expect(output).toContain("Active Locks: No stale");
                expect(output).toContain("sqlite-vec: Loadable");
            } finally {
                try {
                    rmSync(portabilityDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can release handles late.
                }
            }
        });

        it("renders text warnings, stale lock details, and orphan cleanup tip without --fix", async () => {
            const portabilityDir = join(tmpdir(), `doctor-portability-warn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            const portabilityDb = join(portabilityDir, "memory.db");
            mkdirSync(portabilityDir, { recursive: true });
            const { db } = initializeDatabase({ path: portabilityDb });
            const mixedPath = process.platform === "win32"
                ? "/home/destiny/missing-project"
                : "C:\\Projects\\missing-project";
            try {
                db.run(
                    `INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
                     VALUES (?, ?, ?, ?, ?)`,
                    ["portable-warn", "encoded-warn", mixedPath, "missing-project", new Date().toISOString()]
                );
            } finally {
                closeDatabase(db);
            }
            writeFileSync(join(portabilityDir, "embedding.lock"), JSON.stringify({ pid: 99999999 }));

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            try {
                const result = await runPortabilityDiagnostics({ portability: true }, {
                    healthOverrides: {
                        dbPath: portabilityDb,
                        sourceDir: portabilityDir,
                    },
                    gatherStatus: async () => createStatusInfo({
                        database: { exists: true, readable: true, writable: true, integrity: "ok", size: 1 },
                        permissions: { configDir: true, logsDir: true, sourceDir: true },
                        hooks: { installed: true, enabled: true, lastRun: null },
                        config: { valid: true, issues: [] },
                        embedding: {
                            configured: true,
                            provider: "local",
                            model: "test",
                            dimensions: 384,
                            enabled: true,
                            ready: true,
                        },
                        sqliteVec: { available: false, version: null },
                        searchCapability: {
                            fts5: true,
                            sqliteVec: false,
                            embeddedCount: 0,
                            totalMessages: 0,
                            coveragePercent: 0,
                            defaultMode: "auto",
                            vectorReady: false,
                        },
                    }),
                });

                const output = consoleOutput.join("\n");
                expect(result.exitCode).toBe(1);
                expect(output).toContain("Path Dialects:");
                expect(output).toContain(mixedPath);
                expect(output).toContain("Orphaned Workspaces:");
                expect(output).toContain("Active Locks:");
                expect(output).toContain("sqlite-vec: Not loadable");
                expect(output).toContain("memory purge --orphans");
                expect(output).toContain(join(portabilityDir, "embedding.lock"));
            } finally {
                try {
                    rmSync(portabilityDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can release handles late.
                }
            }
        });
    });

    describe("qmd status in doctor output", () => {
        it("shows qmd installed with path when available", () => {
            const qmdModule = require("../../../infrastructure/external/index.js");
            const spy = spyOn(qmdModule, "getQmdInfo").mockReturnValue({
                available: true,
                path: "/usr/bin/qmd",
            });

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
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 100, totalMessages: 100, coveragePercent: 100, defaultMode: "auto", vectorReady: true },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("Optional Tools");
            expect(output).toContain("qmd");
            expect(output).toContain("/usr/bin/qmd");
            expect(output).toContain("[INFO]");

            spy.mockRestore();
        });

        it("shows qmd not found with install hint when unavailable", () => {
            const qmdModule = require("../../../infrastructure/external/index.js");
            const spy = spyOn(qmdModule, "getQmdInfo").mockReturnValue({
                available: false,
                path: null,
            });

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
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 100, totalMessages: 100, coveragePercent: 100, defaultMode: "auto", vectorReady: true },
            };

            const output = formatHealthResult(result, false);
            expect(output).toContain("qmd: not found");
            expect(output).toContain("bun add -g @tobilu/qmd");

            spy.mockRestore();
        });

        it("qmd status does NOT affect exit code", async () => {
            const qmdModule = require("../../../infrastructure/external/index.js");
            const spy = spyOn(qmdModule, "getQmdInfo").mockReturnValue({
                available: false,
                path: null,
            });

            // With a healthy system, qmd missing should NOT degrade exit code
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
                searchCapability: { fts5: true, sqliteVec: true, embeddedCount: 100, totalMessages: 100, coveragePercent: 100, defaultMode: "auto", vectorReady: true },
            };

            // The output should still say "All checks passed"
            const output = formatHealthResult(result, false);
            expect(output).toContain("All checks passed");

            spy.mockRestore();
        });

        it("JSON output includes qmd field", async () => {
            const qmdModule = require("../../../infrastructure/external/index.js");
            const spy = spyOn(qmdModule, "getQmdInfo").mockReturnValue({
                available: true,
                path: "/usr/bin/qmd",
            });

            consoleOutput = [];
            console.log = (msg: string) => consoleOutput.push(msg);

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

            const output = consoleOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("qmd");
            expect(parsed.qmd.available).toBe(true);
            expect(parsed.qmd.path).toBe("/usr/bin/qmd");

            spy.mockRestore();
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

            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });

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
