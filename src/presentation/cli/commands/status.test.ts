/**
 * Status Command Tests
 *
 * Tests for the status CLI command.
 * Uses isolated test directories via path overrides.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
    existsSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
    executeStatusCommand,
    gatherStatus,
    formatStatusOutput,
    setTestDbPath,
    type StatusInfo,
    type GatherStatusOptions,
} from "./status.js";
import {
    setTestPathOverrides,
    installHooks,
} from "../../../infrastructure/hooks/settings-manager.js";
import {
    setTestConfigPath,
    DEFAULT_CONFIG,
} from "../../../infrastructure/hooks/config-manager.js";
import {
    setTestLogPath,
} from "../../../infrastructure/hooks/log-writer.js";

describe("status command", () => {
    // Use a test-specific directory to avoid modifying actual settings
    const testBaseDir = join(homedir(), ".memory-nexus-test-status");
    const testSettingsPath = join(testBaseDir, ".claude", "settings.json");
    const testBackupPath = join(testBaseDir, ".memory-nexus", "backups", "settings.json.backup");
    const testHookScriptPath = join(testBaseDir, ".memory-nexus", "hooks", "sync-hook.js");
    const testConfigPath = join(testBaseDir, ".memory-nexus", "config.json");
    const testLogPath = join(testBaseDir, ".memory-nexus", "logs", "sync.log");
    const testDbPath = join(testBaseDir, ".memory-nexus", "test.db");

    let consoleLogSpy: ReturnType<typeof spyOn>;
    let logOutput: string[];

    beforeEach(() => {
        // Clean test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
        mkdirSync(testBaseDir, { recursive: true });

        // Set path overrides for testing
        setTestPathOverrides({
            settingsPath: testSettingsPath,
            backupPath: testBackupPath,
            hookScriptPath: testHookScriptPath,
        });
        setTestConfigPath(testConfigPath);
        setTestLogPath(testLogPath);
        setTestDbPath(testDbPath);

        // Capture console output
        logOutput = [];
        consoleLogSpy = spyOn(console, "log").mockImplementation((...args) => {
            logOutput.push(args.join(" "));
        });
    });

    afterEach(() => {
        // Reset path overrides
        setTestPathOverrides(null);
        setTestConfigPath(null);
        setTestLogPath(null);
        setTestDbPath(null);

        // Restore console
        consoleLogSpy.mockRestore();

        // Clean up test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    describe("gatherStatus", () => {
        test("returns hook status when not installed", async () => {
            const status = await gatherStatus();

            expect(status.hooks.sessionEnd).toBe(false);
            expect(status.hooks.preCompact).toBe(false);
            expect(status.hooks.hookScriptExists).toBe(false);
            expect(status.hooks.backupExists).toBe(false);
        });

        test("returns hook status when installed", async () => {
            installHooks();
            mkdirSync(dirname(testHookScriptPath), { recursive: true });
            writeFileSync(testHookScriptPath, "// hook script");

            const status = await gatherStatus();

            expect(status.hooks.sessionEnd).toBe(true);
            expect(status.hooks.preCompact).toBe(true);
            expect(status.hooks.hookScriptExists).toBe(true);
        });

        test("returns default config when no config file", async () => {
            const status = await gatherStatus();

            expect(status.config).toEqual(DEFAULT_CONFIG);
        });

        test("returns config values from file", async () => {
            mkdirSync(dirname(testConfigPath), { recursive: true });
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: false,
                timeout: 10000,
            }));

            const status = await gatherStatus();

            expect(status.config.autoSync).toBe(false);
            expect(status.config.timeout).toBe(10000);
        });

        test("returns null lastSync when no logs", async () => {
            const status = await gatherStatus();

            expect(status.lastSync).toBeNull();
        });

        test("handles missing database gracefully", async () => {
            // No database created, should not throw
            // Uses test database path via setTestDbPath override
            const status = await gatherStatus();

            expect(status.pendingSessions).toBe(0);
        });
    });

    describe("formatStatusOutput", () => {
        test("displays hooks section", () => {
            const status: StatusInfo = {
                hooks: {
                    sessionEnd: true,
                    preCompact: true,
                    hookScriptExists: true,
                    backupExists: false,
                },
                config: DEFAULT_CONFIG,
                lastSync: null,
                pendingSessions: 0,
                recentLogs: 0,
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("SessionEnd:  installed");
            expect(logOutput.join("\n")).toContain("PreCompact:  installed");
            expect(logOutput.join("\n")).toContain("Hook script: present");
            expect(logOutput.join("\n")).toContain("Backup:      none");
        });

        test("displays configuration section", () => {
            const status: StatusInfo = {
                hooks: {
                    sessionEnd: false,
                    preCompact: false,
                    hookScriptExists: false,
                    backupExists: false,
                },
                config: {
                    autoSync: true,
                    syncOnCompaction: true,
                    recoveryOnStartup: true,
                    timeout: 5000,
                    logLevel: "info",
                    showFailures: true,
                },
                lastSync: null,
                pendingSessions: 0,
                recentLogs: 0,
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("autoSync:          true");
            expect(logOutput.join("\n")).toContain("syncOnCompaction:  true");
            expect(logOutput.join("\n")).toContain("timeout:           5000ms");
            expect(logOutput.join("\n")).toContain("logLevel:          info");
        });

        test("displays activity section", () => {
            const status: StatusInfo = {
                hooks: {
                    sessionEnd: true,
                    preCompact: true,
                    hookScriptExists: true,
                    backupExists: true,
                },
                config: DEFAULT_CONFIG,
                lastSync: "2024-01-15T10:30:00Z",
                pendingSessions: 3,
                recentLogs: 25,
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("Last sync:         2024-01-15T10:30:00Z");
            expect(logOutput.join("\n")).toContain("Pending sessions:  3");
            expect(logOutput.join("\n")).toContain("Recent log entries: 25");
        });

        test("shows recommendation when hooks not installed", () => {
            const status: StatusInfo = {
                hooks: {
                    sessionEnd: false,
                    preCompact: false,
                    hookScriptExists: false,
                    backupExists: false,
                },
                config: DEFAULT_CONFIG,
                lastSync: null,
                pendingSessions: 0,
                recentLogs: 0,
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("Recommendation: Run 'memory-nexus install'");
        });

        test("shows note when sessions pending", () => {
            const status: StatusInfo = {
                hooks: {
                    sessionEnd: true,
                    preCompact: true,
                    hookScriptExists: true,
                    backupExists: false,
                },
                config: DEFAULT_CONFIG,
                lastSync: null,
                pendingSessions: 5,
                recentLogs: 0,
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("5 session(s) pending sync");
            expect(logOutput.join("\n")).toContain("memory-nexus sync");
        });
    });

    describe("executeStatusCommand", () => {
        test("displays formatted output by default", async () => {
            await executeStatusCommand({});

            expect(logOutput.join("\n")).toContain("Memory-Nexus Status");
            expect(logOutput.join("\n")).toContain("Hooks:");
            expect(logOutput.join("\n")).toContain("Configuration:");
            expect(logOutput.join("\n")).toContain("Activity:");
        });

        test("outputs JSON with --json flag", async () => {
            await executeStatusCommand({ json: true });

            // Should be valid JSON
            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("hooks");
            expect(parsed).toHaveProperty("config");
            expect(parsed).toHaveProperty("lastSync");
            expect(parsed).toHaveProperty("pendingSessions");
            expect(parsed).toHaveProperty("recentLogs");
        });

        test("JSON output contains hook status", async () => {
            installHooks();

            await executeStatusCommand({ json: true });

            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed.hooks.sessionEnd).toBe(true);
            expect(parsed.hooks.preCompact).toBe(true);
        });
    });
});
