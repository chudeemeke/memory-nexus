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
import { homedir, tmpdir } from "node:os";
import {
    executeStatusCommand,
    gatherStatus,
    formatStatusOutput,
    formatTimeAgo,
    type StatusInfo,
    type GatherStatusOptions,
} from "./status.js";
import {
    installHooks,
    type PathOverrides,
} from "../../../infrastructure/hooks/settings-manager.js";
import { DEFAULT_CONFIG } from "../../../infrastructure/hooks/config-manager.js";
import {
    setTestPaths,
    resetTestPaths,
} from "../../../infrastructure/paths.js";
import {
    writeLock,
    removeLock,
} from "../../../infrastructure/embedding/background-embedder.js";
import {
    initializeDatabase,
    closeDatabase,
} from "../../../infrastructure/database/index.js";

describe("status command", () => {
    // Use a test-specific directory to avoid modifying actual settings
    const testBaseDir = join(homedir(), ".memory-nexus-test-status");
    const testSettingsPath = join(testBaseDir, ".claude", "settings.json");
    const testBackupPath = join(testBaseDir, ".memory-nexus", "backups", "settings.json.backup");
    const testHookScriptPath = join(testBaseDir, ".memory-nexus", "hooks", "sync-hook.js");
    const testConfigPath = join(testBaseDir, ".memory-nexus", "config.json");
    const testLogPath = join(testBaseDir, ".memory-nexus", "logs", "sync.log");
    const testDbPath = join(testBaseDir, ".memory-nexus", "test.db");

    /** Hook path overrides used throughout the suite. */
    const hookOverrides: PathOverrides = {
        settingsPath: testSettingsPath,
        backupPath: testBackupPath,
        hookScriptPath: testHookScriptPath,
    };

    let consoleLogSpy: ReturnType<typeof spyOn>;
    let logOutput: string[];

    beforeEach(() => {
        // Clean test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
        mkdirSync(testBaseDir, { recursive: true });

        // Capture console output
        logOutput = [];
        consoleLogSpy = spyOn(console, "log").mockImplementation((...args) => {
            logOutput.push(args.join(" "));
        });
    });

    afterEach(() => {
        // Restore console
        consoleLogSpy.mockRestore();

        // Clean up test directory
        if (existsSync(testBaseDir)) {
            try {
                rmSync(testBaseDir, { recursive: true, force: true });
            } catch {
                // Best-effort cleanup on Windows (EBUSY from WAL file locks)
            }
        }
    });

    describe("gatherStatus", () => {
        test("returns hook status when not installed", async () => {
            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.hooks.sessionEnd).toBe(false);
            expect(status.hooks.preCompact).toBe(false);
            expect(status.hooks.hookScriptExists).toBe(false);
            expect(status.hooks.backupExists).toBe(false);
        });

        test("returns hook status when installed", async () => {
            installHooks(hookOverrides);
            mkdirSync(dirname(testHookScriptPath), { recursive: true });
            writeFileSync(testHookScriptPath, "// hook script");

            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.hooks.sessionEnd).toBe(true);
            expect(status.hooks.preCompact).toBe(true);
            expect(status.hooks.hookScriptExists).toBe(true);
        });

        test("returns default config when no config file", async () => {
            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.config).toEqual(DEFAULT_CONFIG);
        });

        test("returns config values from file", async () => {
            mkdirSync(dirname(testConfigPath), { recursive: true });
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: false,
                timeout: 10000,
            }));

            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.config.autoSync).toBe(false);
            expect(status.config.timeout).toBe(10000);
        });

        test("returns null lastSync when no logs", async () => {
            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.lastSync).toBeNull();
        });

        test("handles missing database gracefully", async () => {
            // No database created, should not throw
            // Uses test database path passed via deps
            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.pendingSessions).toBe(0);
        });

        test("returns active embedding with DB counts when lock has alive PID", async () => {
            // Use a separate temp dir for this test to avoid EBUSY on Windows
            const isolatedDir = join(tmpdir(), `memory-status-embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            mkdirSync(isolatedDir, { recursive: true });

            // Set up data dir for the lock file
            setTestPaths({ dataDir: isolatedDir });

            // Write a lock file with the current process PID (always alive)
            writeLock({
                pid: process.pid,
                startedAt: new Date().toISOString(),
                totalMessages: 0,
            }, isolatedDir);

            // Create a real database with some messages and embedding_state rows
            const embeddingTestDb = join(isolatedDir, "embed-test.db");
            const { db } = initializeDatabase({ path: embeddingTestDb });

            try {
                // Insert test sessions and messages using correct schema columns
                db.exec(`
                    INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time, message_count)
                    VALUES ('test-session-1', 'encoded-path', '/test/project', 'test-project', '2026-01-01T00:00:00Z', 5)
                `);
                for (let i = 1; i <= 5; i++) {
                    db.exec(`
                        INSERT INTO messages_meta (id, session_id, role, content, timestamp)
                        VALUES ('msg-${i}', 'test-session-1', 'assistant', 'message content ${i}', '2026-01-01T00:00:00Z')
                    `);
                }

                // Insert embedding_state for 3 of the 5 messages (partially embedded)
                for (let i = 1; i <= 3; i++) {
                    db.exec(`
                        INSERT INTO embedding_state (message_id, embedded_at, model_hash, model_name)
                        VALUES (${i}, '2026-01-01T00:00:00Z', 'test-hash-123', 'test-model')
                    `);
                }

                closeDatabase(db);

                const status = await gatherStatus({ dbPath: embeddingTestDb });

                expect(status.embedding.active).toBe(true);
                expect(status.embedding.pid).toBe(process.pid);
                expect(status.embedding.embeddedCount).toBe(3);
                expect(status.embedding.totalMessages).toBe(5);
                expect(status.embedding.startedAt).toBeDefined();
            } finally {
                // Clean up
                removeLock(isolatedDir);
                resetTestPaths();
                try {
                    rmSync(isolatedDir, { recursive: true, force: true });
                } catch {
                    // Best-effort cleanup on Windows
                }
            }
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
                embedding: { active: false },
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
                embedding: { active: false },
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
                embedding: { active: false },
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
                embedding: { active: false },
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("Recommendation: Run 'memory install'");
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
                embedding: { active: false },
            };

            formatStatusOutput(status);

            expect(logOutput.join("\n")).toContain("5 session(s) pending sync");
            expect(logOutput.join("\n")).toContain("memory sync");
        });
    });

    describe("executeStatusCommand", () => {
        test("displays formatted output by default", async () => {
            await executeStatusCommand({}, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(logOutput.join("\n")).toContain("Memory Status");
            expect(logOutput.join("\n")).toContain("Hooks:");
            expect(logOutput.join("\n")).toContain("Configuration:");
            expect(logOutput.join("\n")).toContain("Activity:");
        });

        test("outputs JSON with --json flag", async () => {
            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

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
            installHooks(hookOverrides);

            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed.hooks.sessionEnd).toBe(true);
            expect(parsed.hooks.preCompact).toBe(true);
        });
    });

    describe("embedding status section", () => {
        test("formatStatusOutput shows 'Embedding: idle' when not active", () => {
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
                embedding: { active: false },
            };

            formatStatusOutput(status);

            const output = logOutput.join("\n");
            expect(output).toContain("Embedding:");
            expect(output).toContain("idle");
        });

        test("formatStatusOutput shows active with PID and progress when embedding active", () => {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
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
                embedding: {
                    active: true,
                    pid: 12345,
                    startedAt: fiveMinAgo,
                    embeddedCount: 150,
                    totalMessages: 500,
                },
            };

            formatStatusOutput(status);

            const output = logOutput.join("\n");
            expect(output).toContain("Embedding:");
            expect(output).toContain("active");
            expect(output).toContain("PID 12345");
            expect(output).toContain("150/500 messages");
        });

        test("formatStatusOutput shows idle when lock has dead PID", () => {
            // The StatusInfo with active:false represents dead PID case
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
                embedding: { active: false },
            };

            formatStatusOutput(status);

            const output = logOutput.join("\n");
            expect(output).toContain("idle");
        });

        test("JSON output includes embedding field", async () => {
            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed).toHaveProperty("embedding");
            expect(parsed.embedding).toHaveProperty("active");
        });
    });

    describe("formatTimeAgo", () => {
        test("returns 'just now' for timestamps less than 1 minute ago", () => {
            const now = new Date().toISOString();
            expect(formatTimeAgo(now)).toBe("just now");
        });

        test("returns minutes for timestamps less than 1 hour ago", () => {
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            expect(formatTimeAgo(thirtyMinAgo)).toBe("30 min ago");
        });

        test("returns hours for timestamps less than 24 hours ago", () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
        });

        test("returns days for timestamps more than 24 hours ago", () => {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            expect(formatTimeAgo(threeDaysAgo)).toBe("3d ago");
        });
    });
});
