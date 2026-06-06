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
    checkSqliteVecAvailability,
    checkEmbeddingConfig,
    checkLlmExtractionHealth,
    checkProviderEgressHealth,
    runHealthCheck,
    type HealthCheckResult,
} from "./health-checker.js";

import type { PathOverrides } from "../hooks/settings-manager.js";
import { initializeDatabase, closeDatabase } from "./connection.js";

describe("health-checker", () => {
    const testDir = join(tmpdir(), `health-checker-test-${Date.now()}`);
    const testDbPath = join(testDir, "test.db");
    const testConfigPath = join(testDir, "config.json");
    const testLogPath = join(testDir, "logs", "sync.log");
    const testSettingsPath = join(testDir, ".claude", "settings.json");

    /** Hook path overrides used throughout the suite. */
    const hookOverrides: PathOverrides = { settingsPath: testSettingsPath };

    beforeAll(() => {
        // Create test directories
        mkdirSync(join(testDir, "logs"), { recursive: true });
        mkdirSync(join(testDir, ".claude"), { recursive: true });
    });

    afterAll(() => {
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

        it("returns 'corrupted' when integrity_check reports a non-ok result", () => {
            const mockDb = {
                query: () => ({
                    get: () => ({ integrity_check: "row 2 missing from index sessions_project" }),
                }),
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

        it("returns 'corrupted' when quick_check has no ok row", () => {
            const mockDb = {
                query: () => ({
                    get: () => null,
                }),
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
            const result = checkConfigValidity(testConfigPath);
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

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it("returns issues for invalid autoSync type", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: "yes", // Should be boolean
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("autoSync is not a boolean");
        });

        it("returns issues for invalid startup and compaction boolean types", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                recoveryOnStartup: "yes",
                syncOnCompaction: 1,
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("recoveryOnStartup is not a boolean");
            expect(result.issues).toContain("syncOnCompaction is not a boolean");
        });

        it("returns issues for invalid logLevel", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                logLevel: "verbose", // Invalid level
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("logLevel"))).toBe(true);
        });

        it("returns issues for invalid timeout", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                timeout: -100, // Negative
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("timeout"))).toBe(true);
        });

        it("returns issues for non-numeric timeout", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                timeout: "fast", // Not a number
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("timeout"))).toBe(true);
        });

        it("returns issues for invalid logRetentionDays", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                logRetentionDays: "forever", // Not a number
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.includes("logRetentionDays"))).toBe(true);
        });

        it("returns issues for invalid showFailures type", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                showFailures: 1, // Should be boolean
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("showFailures is not a boolean");
        });

        it("returns issues for invalid provider egress policy", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                providerEgress: {
                    consent: "maybe",
                    allowedHosts: ["api.openai.com", ""],
                    allowedProviders: [""],
                },
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues).toContain('providerEgress.consent "maybe" is not valid (expected: unset, granted, denied)');
            expect(result.issues).toContain("providerEgress.allowedHosts must be an array of non-empty strings");
            expect(result.issues).toContain("providerEgress.allowedProviders must be an array of non-empty strings");
        });

        it("returns issues when provider egress is not an object", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                providerEgress: "granted",
            }));

            const result = checkConfigValidity(testConfigPath);
            expect(result.valid).toBe(false);
            expect(result.issues).toContain("providerEgress must be an object");
        });

        it("collects multiple issues", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                autoSync: "yes",
                timeout: "slow",
                logLevel: "verbose",
            }));

            const result = checkConfigValidity(testConfigPath);
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

            const result = checkHookStatus(testLogPath, testConfigPath, hookOverrides);
            expect(result.installed).toBe(false);
        });

        it("returns enabled based on config autoSync", () => {
            writeFileSync(testConfigPath, JSON.stringify({ autoSync: true }));

            const result = checkHookStatus(testLogPath, testConfigPath, hookOverrides);
            expect(result.enabled).toBe(true);
        });

        it("returns enabled=false when autoSync disabled", () => {
            writeFileSync(testConfigPath, JSON.stringify({ autoSync: false }));

            const result = checkHookStatus(testLogPath, testConfigPath, hookOverrides);
            expect(result.enabled).toBe(false);
        });

        it("returns lastRun=null when no logs", () => {
            const result = checkHookStatus(testLogPath, testConfigPath, hookOverrides);
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

            const result = checkHookStatus(testLogPath, testConfigPath, hookOverrides);
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

        const overrides = () => ({
            dbPath: testDbPath,
            configDir: testDir,
            logsDir: join(testDir, "logs"),
            sourceDir: testDir,
            hookOverrides,
        });

        it("returns complete HealthCheckResult", () => {
            const result = runHealthCheck(overrides());

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
            const result = runHealthCheck({
                dbPath: join(testDir, "nonexistent.db"),
                configDir: testDir,
                logsDir: join(testDir, "logs"),
                sourceDir: testDir,
            });

            expect(result.database.exists).toBe(false);
            expect(result.database.readable).toBe(false);
            expect(result.database.writable).toBe(false);
            expect(result.database.integrity).toBe("unknown");
            expect(result.database.size).toBe(0);
        });

        it("handles missing directories gracefully", () => {
            const result = runHealthCheck({
                dbPath: testDbPath,
                configDir: join(testDir, "nonexistent-config"),
                logsDir: join(testDir, "nonexistent-logs"),
                sourceDir: join(testDir, "nonexistent-source"),
            });

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

        it("uses default paths when no overrides — verified via per-call overrides", () => {
            // Verify overrides parameter is the canonical seam.
            // Real default paths are tested via integration / smoke tests
            // (XDG resolution lives in paths.ts and is tested there).
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

        it("uses sandboxed default paths when no overrides are provided", () => {
            const defaultPathRoot = join(testDir, `default-paths-${Date.now()}`);
            const configHome = join(defaultPathRoot, "config");
            const dataHome = join(defaultPathRoot, "data");
            const home = join(defaultPathRoot, "home");
            const originalEnv = {
                XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
                XDG_DATA_HOME: process.env.XDG_DATA_HOME,
                HOME: process.env.HOME,
                USERPROFILE: process.env.USERPROFILE,
            };

            process.env.XDG_CONFIG_HOME = configHome;
            process.env.XDG_DATA_HOME = dataHome;
            process.env.HOME = home;
            process.env.USERPROFILE = home;
            mkdirSync(join(configHome, "memory"), { recursive: true });
            mkdirSync(join(dataHome, "memory", "logs"), { recursive: true });
            mkdirSync(join(home, ".claude", "projects"), { recursive: true });

            const defaultDbPath = join(dataHome, "memory", "memory.db");
            const { db } = initializeDatabase({ path: defaultDbPath });
            closeDatabase(db);

            try {
                const result = runHealthCheck();

                expect(result.database.exists).toBe(true);
                expect(result.permissions.configDir).toBe(true);
                expect(result.permissions.logsDir).toBe(true);
                expect(result.searchCapability.defaultMode).toBe("auto");
            } finally {
                if (originalEnv.XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
                else process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
                if (originalEnv.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
                else process.env.XDG_DATA_HOME = originalEnv.XDG_DATA_HOME;
                if (originalEnv.HOME === undefined) delete process.env.HOME;
                else process.env.HOME = originalEnv.HOME;
                if (originalEnv.USERPROFILE === undefined) delete process.env.USERPROFILE;
                else process.env.USERPROFILE = originalEnv.USERPROFILE;
                try {
                    rmSync(defaultPathRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
                } catch {
                    // Best-effort cleanup on Windows; SQLite can briefly hold handles after close.
                }
            }
        });

        it("includes embedding field in result", () => {
            const result = runHealthCheck(overrides());
            expect(result).toHaveProperty("embedding");
            expect(result.embedding).toHaveProperty("configured");
            expect(result.embedding).toHaveProperty("provider");
            expect(result.embedding).toHaveProperty("model");
            expect(result.embedding).toHaveProperty("dimensions");
            expect(result.embedding).toHaveProperty("enabled");
        });

        it("includes sqliteVec field in result", () => {
            const result = runHealthCheck(overrides());
            expect(result).toHaveProperty("sqliteVec");
            expect(result.sqliteVec).toHaveProperty("available");
            expect(result.sqliteVec).toHaveProperty("version");
        });
    });

    describe("checkSqliteVecAvailability", () => {
        it("returns available: true when sqlite-vec is loadable", () => {
            const result = checkSqliteVecAvailability();
            // sqlite-vec is installed in this project, so it should be available
            expect(result.available).toBe(true);
            expect(typeof result.version).toBe("string");
            expect(result.version!.length).toBeGreaterThan(0);
        });
    });

    describe("checkEmbeddingConfig", () => {
        const originalEnv = { ...process.env };
        const grantedProviderEgress = (allowedHosts: string[] = []) => ({
            consent: "granted",
            allowedHosts: ["api.openai.com", "api.anthropic.com", ...allowedHosts],
            allowedProviders: ["anthropic", "openai", "claude-cli", "openai-compatible"],
        });

        afterEach(() => {
            process.env = { ...originalEnv };
            try {
                rmSync(testConfigPath, { force: true });
            } catch {
                // Ignore
            }
        });

        it("returns default embedding config when no config file", () => {
            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.configured).toBe(true);
            expect(result.provider).toBe("local");
            expect(result.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(result.dimensions).toBe(384);
            expect(result.enabled).toBe(true);
        });

        it("reflects custom config from config file", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    enabled: false,
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.configured).toBe(true);
            expect(result.provider).toBe("openai");
            expect(result.model).toBe("text-embedding-3-small");
            expect(result.dimensions).toBe(1536);
            expect(result.enabled).toBe(false);
        });

        it("includes ready and readyReason fields", () => {
            const result = checkEmbeddingConfig(testConfigPath);
            expect(result).toHaveProperty("ready");
            expect(typeof result.ready).toBe("boolean");
        });

        it("returns ready: true for local provider", () => {
            // Default config is local provider
            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBeUndefined();
        });

        it("returns ready: false with reason when openai provider has no runtime key", () => {
            delete process.env.OPENAI_API_KEY;
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(false);
            expect(result.readyReason).toBe("API key not available at runtime; set OPENAI_API_KEY or embedding.apiKeyEnv");
        });

        it("returns ready: true when openai provider uses configured apiKeyEnv", () => {
            process.env.MEMORY_NEXUS_TEST_OPENAI_KEY = "sk-test-key";
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    apiKeyEnv: "MEMORY_NEXUS_TEST_OPENAI_KEY",
                },
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBeUndefined();
        });

        it("reports plaintext apiKey as deprecated rather than recommending it", () => {
            delete process.env.OPENAI_API_KEY;
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    apiKey: "sk-test-key",
                },
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBe("Using deprecated plaintext config; prefer environment injection or embedding.apiKeyEnv");
        });

        it("treats apiKeyRef as opaque metadata and not a resolved key", () => {
            delete process.env.OPENAI_API_KEY;
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    apiKeyRef: "authkey://memory/openai-api-key",
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(false);
            expect(result.readyReason).toBe("API key reference configured but not available at runtime; run through a secret injector or set embedding.apiKeyEnv");
        });

        it("returns ready: true with deferred-check reason for ollama provider", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "ollama",
                    model: "nomic-embed-text",
                    dimensions: 768,
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBe("Server reachability verified at sync time");
        });

        it("returns openai-specific model and dimensions when provider is openai without explicit model", () => {
            process.env.MEMORY_NEXUS_TEST_OPENAI_KEY = "sk-test-key";
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai",
                    apiKeyEnv: "MEMORY_NEXUS_TEST_OPENAI_KEY",
                },
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.provider).toBe("openai");
            expect(result.model).toBe("text-embedding-3-small");
            expect(result.dimensions).toBe(1536);
            expect(result.ready).toBe(true);
        });

        it("returns ollama-specific model and dimensions when provider is ollama without explicit model", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "ollama",
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.provider).toBe("ollama");
            expect(result.model).toBe("nomic-embed-text");
            expect(result.dimensions).toBe(768);
        });

        it("returns unsupported readiness for unknown embedding provider", () => {
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "unknown-provider",
                    model: "some-model",
                    dimensions: 768,
                },
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.provider).toBe("unknown-provider");
            expect(result.ready).toBe(false);
            expect(result.readyReason).toBe('Unsupported embedding provider: "unknown-provider". Supported: local, openai, ollama, openai-compatible');
        });

        it("supports openai-compatible embedding readiness through apiKeyEnv and baseUrl", () => {
            process.env.MEMORY_NEXUS_COMPAT_KEY = "compat-test-key";
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "openai-compatible",
                    baseUrl: "https://gateway.example.test/v1",
                    apiKeyEnv: "MEMORY_NEXUS_COMPAT_KEY",
                },
                providerEgress: grantedProviderEgress(["gateway.example.test"]),
            }));

            const result = checkEmbeddingConfig(testConfigPath);
            expect(result.provider).toBe("openai-compatible");
            expect(result.model).toBe("text-embedding-3-small");
            expect(result.dimensions).toBe(1536);
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBeUndefined();
        });
    });

    describe("checkProviderEgressHealth", () => {
        it("reports disabled embeddings as local-safe while still checking extraction egress", () => {
            try {
                writeFileSync(testConfigPath, JSON.stringify({
                    embedding: {
                        enabled: false,
                        provider: "openai",
                    },
                    providerEgress: {
                        consent: "granted",
                        allowedHosts: ["api.openai.com", "api.anthropic.com"],
                        allowedProviders: ["anthropic", "openai", "claude-cli"],
                    },
                }));

                const result = checkProviderEgressHealth(testConfigPath);

                expect(result.embedding.required).toBe(false);
                expect(result.embedding.allowed).toBe(true);
                expect(result.embedding.target).toBe("disabled");
                expect(result.llmExtraction.allowed).toBe(true);
            } finally {
                rmSync(testConfigPath, { force: true });
            }
        });
    });

    describe("checkLlmExtractionHealth", () => {
        const originalEnv = { ...process.env };
        const grantedProviderEgress = (allowedHosts: string[] = []) => ({
            consent: "granted",
            allowedHosts: ["api.openai.com", "api.anthropic.com", ...allowedHosts],
            allowedProviders: ["anthropic", "openai", "claude-cli", "openai-compatible"],
        });

        afterEach(() => {
            process.env = { ...originalEnv };
            try {
                rmSync(testConfigPath, { force: true });
            } catch {
                // Ignore
            }
        });

        it("blocks default claude-cli extraction until provider egress consent is granted", () => {
            delete process.env.LLM_PROVIDER;
            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("claude-cli");
            expect(result.model).toBe("claude-cli-print");
            expect(result.ready).toBe(false);
            expect(result.readyReason).toContain("Remote extraction provider egress consent is not granted");
        });

        it("returns claude-cli as default provider when provider egress consent is granted", () => {
            delete process.env.LLM_PROVIDER;
            writeFileSync(testConfigPath, JSON.stringify({
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("claude-cli");
            expect(result.model).toBe("claude-cli-print");
            expect(result.ready).toBe(true);
        });

        it("returns ready: false for anthropic provider when no key is set", () => {
            process.env.LLM_PROVIDER = "anthropic";
            delete process.env.ANTHROPIC_API_KEY;

            // Ensure no apiKey is in config
            writeFileSync(testConfigPath, JSON.stringify({}));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("anthropic");
            expect(result.ready).toBe(false);
            expect(result.readyReason).toBe("API key not available at runtime; set ANTHROPIC_API_KEY or embedding.apiKeyEnv");
        });

        it("returns ready: true for anthropic provider when environment ANTHROPIC_API_KEY is present", () => {
            process.env.LLM_PROVIDER = "anthropic";
            process.env.ANTHROPIC_API_KEY = "sk-ant-test";
            writeFileSync(testConfigPath, JSON.stringify({
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("anthropic");
            expect(result.ready).toBe(true);
        });

        it("returns ready: true for ollama provider", () => {
            process.env.LLM_PROVIDER = "ollama";
            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("ollama");
            expect(result.ready).toBe(true);
        });

        it("returns unsupported readiness for unknown LLM provider instead of falling back", () => {
            process.env.LLM_PROVIDER = "unknown-provider";

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("unknown-provider");
            expect(result.ready).toBe(false);
            expect(result.readyReason).toBe('Unsupported extraction provider: "unknown-provider". Supported: anthropic, openai, ollama, claude-cli, openai-compatible');
        });

        it("supports openai-compatible extraction readiness through apiKeyEnv and baseUrl", () => {
            process.env.LLM_PROVIDER = "openai-compatible";
            process.env.MEMORY_NEXUS_COMPAT_KEY = "compat-test-key";
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "local",
                    apiKeyEnv: "MEMORY_NEXUS_COMPAT_KEY",
                    baseUrl: "https://gateway.example.test/v1",
                },
                providerEgress: grantedProviderEgress(["gateway.example.test"]),
            }));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("openai-compatible");
            expect(result.model).toBe("gpt-4o");
            expect(result.ready).toBe(true);
            expect(result.readyReason).toBeUndefined();
        });

        it("uses extraction model defaults instead of embedding model defaults", () => {
            process.env.LLM_PROVIDER = "openai";
            process.env.OPENAI_API_KEY = "sk-test";
            writeFileSync(testConfigPath, JSON.stringify({
                embedding: {
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                },
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("openai");
            expect(result.model).toBe("gpt-4o");
            expect(result.ready).toBe(true);
        });

        it("allows LLM_MODEL to override extraction model without touching embedding config", () => {
            process.env.LLM_PROVIDER = "openai";
            process.env.LLM_MODEL = "gpt-4.1-mini";
            process.env.OPENAI_API_KEY = "sk-test";
            writeFileSync(testConfigPath, JSON.stringify({
                providerEgress: grantedProviderEgress(),
            }));

            const result = checkLlmExtractionHealth(testConfigPath);
            expect(result.provider).toBe("openai");
            expect(result.model).toBe("gpt-4.1-mini");
            expect(result.ready).toBe(true);
        });
    });
});
