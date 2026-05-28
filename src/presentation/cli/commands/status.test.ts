/**
 * Status Command Tests
 *
 * Tests for the status CLI command.
 * Uses isolated test directories via path overrides.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
    createStatusCommand,
    attemptFixes,
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
    installEnvOverrides,
} from "../../../../tests/helpers/env-overrides.js";
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
    const testBaseDir = join(tmpdir(), `memory-nexus-test-status-${process.pid}`);
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

    function removeTestBaseDir(): void {
        rmSync(testBaseDir, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 50,
        });
    }

    function createStatusInfo(overrides: Partial<StatusInfo> = {}): StatusInfo {
        const status = {
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
            health: {
                database: {
                    exists: true,
                    readable: true,
                    writable: true,
                    integrity: "ok",
                    size: 1024,
                },
                permissions: {
                    configDir: true,
                    logsDir: true,
                    sourceDir: true,
                },
                hooks: {
                    installed: false,
                    enabled: true,
                    lastRun: null,
                },
                config: {
                    valid: true,
                    issues: [],
                },
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "test-model",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                },
                sqliteVec: {
                    available: true,
                    version: "v0.1.9",
                },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 3,
                    totalMessages: 5,
                    coveragePercent: 60,
                    defaultMode: "auto",
                    vectorReady: true,
                },
                llmExtraction: {
                    provider: "claude-cli",
                    model: "claude-cli-print",
                    ready: true,
                },
            },
            stats: {
                totalSessions: 2,
                totalMessages: 12,
                totalToolUses: 3,
                databaseSizeBytes: 2048,
                projectBreakdown: [
                    { projectName: "memory", sessionCount: 2, messageCount: 12 },
                ],
                hooks: {
                    installed: false,
                    autoSync: true,
                    pendingSessions: 0,
                },
            },
            migration: {
                legacyExists: false,
                newExists: true,
                status: "complete",
            },
            qmd: {
                available: true,
                path: "qmd",
            },
            fixes: [],
            ...overrides,
        };
        return status as StatusInfo;
    }

    function withHealth(
        healthOverrides: Partial<StatusInfo["health"]>,
        statusOverrides: Partial<StatusInfo> = {}
    ): StatusInfo {
        const base = createStatusInfo(statusOverrides);
        return {
            ...base,
            health: {
                ...base.health,
                ...healthOverrides,
            },
        } as StatusInfo;
    }

    beforeEach(() => {
        // Clean test directory
        if (existsSync(testBaseDir)) {
            removeTestBaseDir();
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
                removeTestBaseDir();
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

            expect(status.config.machineId).not.toBe("");
            const { machineId, ...rest } = status.config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
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

        test("redacts deprecated plaintext embedding apiKey in gathered status", async () => {
            const secret = ["sk", "ant", "123456789012345678901234567890"].join("-");
            mkdirSync(dirname(testConfigPath), { recursive: true });
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    apiKey: secret,
                },
            }));

            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            expect(status.config.embedding.apiKey).toBe("[REDACTED:api_key]");
            expect(JSON.stringify(status.config)).not.toContain(secret);
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
            // Use a separate temp dir for this test to avoid EBUSY on Windows.
            // Layout: ${parent}/memory/ — XDG_DATA_HOME=${parent} makes
            // getDataDir() resolve to ${parent}/memory because paths.ts
            // appends APP_NAME ("memory").
            const parent = join(tmpdir(), `memory-status-embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            const isolatedDir = join(parent, "memory");
            mkdirSync(isolatedDir, { recursive: true });

            const env = installEnvOverrides();
            env.set("XDG_DATA_HOME", parent);

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
                env.cleanup();
                try {
                    rmSync(parent, { recursive: true, force: true });
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

        test("JSON output never prints deprecated plaintext embedding apiKey", async () => {
            const secret = ["sk", "ant", "123456789012345678901234567890"].join("-");
            mkdirSync(dirname(testConfigPath), { recursive: true });
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    apiKey: secret,
                },
            }));

            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);
            expect(output).not.toContain(secret);
            expect(parsed.config.embedding.apiKey).toBe("[REDACTED:api_key]");
        });

        test("JSON output contains hook status", async () => {
            installHooks(hookOverrides);

            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });

            const output = logOutput.join("\n");
            const parsed = JSON.parse(output);

            expect(parsed.hooks.sessionEnd).toBe(true);
            expect(parsed.hooks.preCompact).toBe(true);
        });

        test("createStatusCommand action parses options and sets process.exitCode", async () => {
            const originalExitCode = process.exitCode;
            try {
                const command = createStatusCommand();
                await command.parseAsync(["node", "memory", "--json", "--projects", "0"]);

                const parsed = JSON.parse(logOutput.join("\n"));
                expect(parsed.error.code).toBe("INVALID_ARGUMENT");
                expect(process.exitCode).toBe(1);
            } finally {
                process.exitCode = originalExitCode;
            }
        });

        test("rejects invalid project limit in text mode", async () => {
            const errors: string[] = [];
            const errorSpy = spyOn(console, "error").mockImplementation((...args) => {
                errors.push(args.join(" "));
            });

            try {
                const result = await executeStatusCommand({ projects: "0" }, {
                    dbPath: testDbPath,
                    logPath: testLogPath,
                    configPath: testConfigPath,
                    hookOverrides,
                });

                expect(result.exitCode).toBe(1);
                expect(errors.join("\n")).toContain("Projects count must be a positive number");
            } finally {
                errorSpy.mockRestore();
            }
        });

        test("outputs stats-compatible JSON envelope for stats-only requests", async () => {
            const commandBase = mkdtempSync(join(tmpdir(), "memory-status-stats-"));
            try {
                const result = await executeStatusCommand({ stats: true, json: true }, {
                    dbPath: join(commandBase, "status.db"),
                    logPath: join(commandBase, "sync.log"),
                    configPath: join(commandBase, "config.json"),
                    hookOverrides,
                });

                const parsed = JSON.parse(logOutput.join("\n"));
                expect(result.exitCode).toBe(0);
                expect(parsed.command).toBe("stats");
                expect(parsed.kind).toBe("stats");
                expect(parsed.data.totalSessions).toBe(0);
            } finally {
                try {
                    rmSync(commandBase, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows (SQLite can release WAL handles late).
                }
            }
        });

        test("renders selected diagnostic sections and fix output with isolated XDG paths", async () => {
            const env = installEnvOverrides();
            const xdgRoot = join(tmpdir(), `memory-status-fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            const commandBase = mkdtempSync(join(tmpdir(), "memory-status-sections-"));
            try {
                env.set("XDG_CONFIG_HOME", join(xdgRoot, "config"));
                env.set("XDG_DATA_HOME", join(xdgRoot, "data"));

                const result = await executeStatusCommand({
                    hooks: true,
                    config: true,
                    db: true,
                    embedding: true,
                    stats: true,
                    fix: true,
                    format: "brief",
                }, {
                    dbPath: join(commandBase, "status.db"),
                    logPath: join(commandBase, "sync.log"),
                    configPath: join(commandBase, "config.json"),
                    hookOverrides,
                });

                const output = logOutput.join("\n");
                expect(result.exitCode).toBe(2);
                expect(output).toContain("Hooks");
                expect(output).toContain("Configuration");
                expect(output).toContain("Database");
                expect(output).toContain("Embeddings");
                expect(output).toContain("LLM Fact Extraction");
                expect(output).toContain("0 sessions");
                expect(output).toContain("Attempting fixes");
            } finally {
                env.cleanup();
                rmSync(xdgRoot, { recursive: true, force: true });
                try {
                    rmSync(commandBase, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows (SQLite can release WAL handles late).
                }
            }
        });

        test("attemptFixes creates missing dirs and reports manual corruption recovery", () => {
            const env = installEnvOverrides();
            const xdgRoot = join(tmpdir(), `memory-status-attempt-fixes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
            try {
                env.set("XDG_CONFIG_HOME", join(xdgRoot, "config"));
                env.set("XDG_DATA_HOME", join(xdgRoot, "data"));

                const messages = attemptFixes({
                    database: {
                        exists: true,
                        readable: true,
                        writable: true,
                        integrity: "corrupted",
                        size: 1024,
                    },
                    permissions: {
                        configDir: false,
                        logsDir: false,
                        sourceDir: true,
                    },
                    hooks: {
                        installed: false,
                        enabled: true,
                        lastRun: null,
                    },
                    config: {
                        valid: true,
                        issues: [],
                    },
                    embedding: {
                        configured: true,
                        provider: "local",
                        model: "test-model",
                        dimensions: 384,
                        enabled: true,
                        ready: true,
                    },
                    sqliteVec: {
                        available: true,
                        version: "v0.1.9",
                    },
                    searchCapability: {
                        fts5: true,
                        sqliteVec: true,
                        embeddedCount: 0,
                        totalMessages: 0,
                        coveragePercent: 0,
                        defaultMode: "auto",
                        vectorReady: false,
                    },
                    llmExtraction: {
                        provider: "claude-cli",
                        model: "claude-cli-print",
                        ready: true,
                    },
                }, false);

                const output = messages.join("\n");
                expect(output).toContain("Created config directory");
                expect(output).toContain("Created logs directory");
                expect(output).toContain("Database corruption detected");
                expect(output).toContain("memory install");
                expect(existsSync(join(xdgRoot, "config", "memory"))).toBe(true);
                expect(existsSync(join(xdgRoot, "data", "memory", "logs"))).toBe(true);
            } finally {
                env.cleanup();
                rmSync(xdgRoot, { recursive: true, force: true });
            }
        });

        test("default dashboard prints applied fix messages when gatherer reports fixes", async () => {
            const result = await executeStatusCommand({ fix: true }, {
                gatherStatus: async () => createStatusInfo({ fixes: ["Created logs directory"] }),
            });

            const output = logOutput.join("\n");
            expect(result.exitCode).toBe(0);
            expect(output).toContain("Applied fixes:");
            expect(output).toContain("Created logs directory");
        });

        test("all sections render invalid config, missing database, unavailable sqlite-vec, qmd absence, and pending migration", async () => {
            const status = withHealth({
                database: {
                    exists: false,
                    readable: false,
                    writable: false,
                    integrity: "unknown",
                    size: 0,
                },
                permissions: {
                    configDir: false,
                    logsDir: false,
                    sourceDir: false,
                },
                config: {
                    valid: false,
                    issues: ["bad config"],
                },
                sqliteVec: {
                    available: false,
                    version: null,
                },
                searchCapability: {
                    fts5: true,
                    sqliteVec: false,
                    embeddedCount: 0,
                    totalMessages: 0,
                    coveragePercent: 0,
                    defaultMode: "vector",
                    vectorReady: false,
                },
            } as any, {
                qmd: { available: false, path: null } as any,
                migration: { legacyExists: true, newExists: false, status: "pending" } as any,
            });

            const result = await executeStatusCommand({ all: true }, {
                gatherStatus: async () => status,
            });

            const output = logOutput.join("\n");
            expect(result.exitCode).toBe(2);
            expect(output).toContain("Invalid");
            expect(output).toContain("bad config");
            expect(output).toContain("Database not found");
            expect(output).toContain("sqlite-vec: not available");
            expect(output).toContain("qmd: not found");
            expect(output).toContain("Legacy data found");
        });

        test("database section reports partial migration and corrupted database exit code", async () => {
            const status = withHealth({
                database: {
                    exists: true,
                    readable: true,
                    writable: true,
                    integrity: "corrupted",
                    size: 0,
                },
            }, {
                migration: { legacyExists: true, newExists: true, status: "partial" } as any,
            });

            const result = await executeStatusCommand({ db: true }, {
                gatherStatus: async () => status,
            });

            const output = logOutput.join("\n");
            expect(result.exitCode).toBe(2);
            expect(output).toContain("CORRUPTED");
            expect(output).toContain("Size: 0 B");
            expect(output).toContain("Partial migration detected");
        });

        test("embedding and LLM sections render ready notes and failure reasons", async () => {
            const readyStatus = withHealth({
                embedding: {
                    configured: true,
                    provider: "local",
                    model: "test-model",
                    dimensions: 384,
                    enabled: true,
                    ready: true,
                    readyReason: "using local model",
                },
                llmExtraction: {
                    provider: "claude-cli",
                    model: "claude-cli-print",
                    ready: true,
                    readyReason: "claude command available",
                },
            } as any);

            await executeStatusCommand({ embedding: true }, {
                gatherStatus: async () => readyStatus,
            });
            expect(logOutput.join("\n")).toContain("Note: using local model");
            expect(logOutput.join("\n")).toContain("Note: claude command available");

            logOutput = [];
            const blockedStatus = withHealth({
                embedding: {
                    configured: true,
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    enabled: true,
                    ready: false,
                    readyReason: "missing apiKeyEnv",
                },
                llmExtraction: {
                    provider: "openai",
                    model: "gpt-4.1-mini",
                    ready: false,
                    readyReason: "missing provider credentials",
                },
            } as any);

            await executeStatusCommand({ embedding: true }, {
                gatherStatus: async () => blockedStatus,
            });
            const blockedOutput = logOutput.join("\n");
            expect(blockedOutput).toContain("Reason: missing apiKeyEnv");
            expect(blockedOutput).toContain("Reason: missing provider credentials");
        });

        test("hook section renders all relative time buckets", async () => {
            const cases = [
                { ageMs: 2 * 24 * 60 * 60 * 1000, expected: "2 days ago" },
                { ageMs: 2 * 60 * 60 * 1000, expected: "2 hours ago" },
                { ageMs: 2 * 60 * 1000, expected: "2 minutes ago" },
                { ageMs: 5 * 1000, expected: "just now" },
            ];

            for (const item of cases) {
                logOutput = [];
                const status = withHealth({
                    hooks: {
                        installed: true,
                        enabled: true,
                        lastRun: new Date(Date.now() - item.ageMs),
                    },
                });

                await executeStatusCommand({ hooks: true }, {
                    gatherStatus: async () => status,
                });

                expect(logOutput.join("\n")).toContain(item.expected);
            }
        });

        test("stats sections render unavailable, quiet, verbose, brief, and AI variants", async () => {
            const noStats = createStatusInfo({ stats: undefined });
            const unavailable = await executeStatusCommand({ stats: true }, {
                gatherStatus: async () => noStats,
            });
            expect(unavailable.exitCode).toBe(1);
            expect(logOutput.join("\n")).toContain("Database statistics are not available");

            for (const options of [
                { stats: true, quiet: true },
                { stats: true, verbose: true },
                { stats: true, format: "brief" as const },
                { stats: true, format: "ai" as const },
            ]) {
                logOutput = [];
                const result = await executeStatusCommand(options, {
                    gatherStatus: async () => createStatusInfo(),
                });
                expect(result.exitCode).toBe(0);
                expect(logOutput.join("\n").length).toBeGreaterThan(0);
            }
        });

        test("stats-only JSON emits an error envelope when stats are unavailable", async () => {
            const result = await executeStatusCommand({ stats: true, json: true }, {
                gatherStatus: async () => createStatusInfo({ stats: undefined }),
            });

            const parsed = JSON.parse(logOutput.join("\n"));
            expect(result.exitCode).toBe(1);
            expect(parsed.command).toBe("stats");
            expect(parsed.error.code).toBe("DB_CONNECTION_FAILED");
        });

        test("doctor exit code distinguishes warnings from clean health", async () => {
            const warningStatus = withHealth({
                database: {
                    exists: true,
                    readable: false,
                    writable: false,
                    integrity: "ok",
                    size: 1024,
                },
                searchCapability: {
                    fts5: true,
                    sqliteVec: true,
                    embeddedCount: 0,
                    totalMessages: 2,
                    coveragePercent: 0,
                    defaultMode: "auto",
                    vectorReady: false,
                },
            });

            const warning = await executeStatusCommand({ db: true }, {
                gatherStatus: async () => warningStatus,
            });
            expect(warning.exitCode).toBe(1);

            logOutput = [];
            const clean = await executeStatusCommand({ db: true }, {
                gatherStatus: async () => createStatusInfo(),
            });
            expect(clean.exitCode).toBe(0);
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
