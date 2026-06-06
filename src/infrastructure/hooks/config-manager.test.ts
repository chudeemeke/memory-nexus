/**
 * Configuration Manager Tests
 *
 * Tests for config loading, saving, and default handling.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { installEnvOverrides, type EnvOverrides } from "../../../tests/helpers/env-overrides.js";

// We need to mock homedir for testing
// Import the module and test with actual temp directories
import {
    loadConfig,
    saveConfig,
    getConfigPath,
    getConfigDir,
    DEFAULT_CONFIG,
    DEFAULT_EMBEDDING_CONFIG,
    DEFAULT_SEARCH_CONFIG,
    DEFAULT_AMBIENT_CONTEXT_CONFIG,
    PROVIDER_DEFAULTS,
    resolveEmbeddingApiKey,
    resolveProviderDefaults,
    type MemoryConfig,
    type EmbeddingConfigData,
    type SearchConfigData,
    type AmbientContextConfigData,
} from "./config-manager.js";

describe("config-manager", () => {
    let testDir: string;
    let env: EnvOverrides;

    beforeEach(() => {
        // Create unique temp directory for each test
        testDir = join(
            tmpdir(),
            `config-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });

        env = installEnvOverrides();
        env.set("HOME", testDir);
        env.set("USERPROFILE", testDir);
        env.set("XDG_CONFIG_HOME", join(testDir, ".config"));
        env.set("XDG_DATA_HOME", join(testDir, ".local", "share"));
    });

    afterEach(() => {
        env.cleanup();

        // Clean up test directory
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("DEFAULT_CONFIG", () => {
        test("has all required fields", () => {
            expect(DEFAULT_CONFIG).toHaveProperty("autoSync");
            expect(DEFAULT_CONFIG).toHaveProperty("recoveryOnStartup");
            expect(DEFAULT_CONFIG).toHaveProperty("syncOnCompaction");
            expect(DEFAULT_CONFIG).toHaveProperty("timeout");
            expect(DEFAULT_CONFIG).toHaveProperty("logLevel");
            expect(DEFAULT_CONFIG).toHaveProperty("logRetentionDays");
            expect(DEFAULT_CONFIG).toHaveProperty("showFailures");
        });

        test("has all features enabled by default", () => {
            expect(DEFAULT_CONFIG.autoSync).toBe(true);
            expect(DEFAULT_CONFIG.recoveryOnStartup).toBe(true);
            expect(DEFAULT_CONFIG.syncOnCompaction).toBe(true);
        });

        test("has 5 second timeout", () => {
            expect(DEFAULT_CONFIG.timeout).toBe(5000);
        });

        test("has info log level", () => {
            expect(DEFAULT_CONFIG.logLevel).toBe("info");
        });

        test("has 7 day log retention", () => {
            expect(DEFAULT_CONFIG.logRetentionDays).toBe(7);
        });

        test("has silent failures (showFailures false)", () => {
            expect(DEFAULT_CONFIG.showFailures).toBe(false);
        });
    });

    describe("getConfigDir", () => {
        test("returns path under home directory", () => {
            const configDir = getConfigDir();
            expect(configDir).toContain("memory");
        });
    });

    describe("getConfigPath", () => {
        test("returns path to config.json", () => {
            const configPath = getConfigPath();
            expect(configPath).toContain("memory");
            expect(configPath).toEndWith("config.json");
        });
    });

    describe("loadConfig", () => {
        test("returns defaults when config file missing", () => {
            const config = loadConfig();
            expect(config.machineId).not.toBe("");
            const { machineId, ...rest } = config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
        });

        test("merges partial config with defaults", () => {
            // Create config directory and write partial config
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ autoSync: false, timeout: 10000 })
            );

            const config = loadConfig();

            // Overridden values
            expect(config.autoSync).toBe(false);
            expect(config.timeout).toBe(10000);

            // Default values preserved
            expect(config.recoveryOnStartup).toBe(true);
            expect(config.syncOnCompaction).toBe(true);
            expect(config.logLevel).toBe("info");
            expect(config.logRetentionDays).toBe(7);
            expect(config.showFailures).toBe(false);
        });

        test("handles invalid JSON (returns defaults)", () => {
            // Create config directory and write invalid JSON
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "{ invalid json }");

            const config = loadConfig();
            expect(config.machineId).not.toBe("");
            const { machineId, ...rest } = config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
        });

        test("handles malformed JSON (syntax error)", () => {
            // Create config directory and write malformed JSON
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "not json at all");

            const config = loadConfig();
            expect(config.machineId).not.toBe("");
            const { machineId, ...rest } = config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
        });

        test("handles empty config file", () => {
            // Create config directory and write empty file
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "");

            const config = loadConfig();
            expect(config.machineId).not.toBe("");
            const { machineId, ...rest } = config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
        });

        test("handles empty JSON object", () => {
            // Create config directory and write empty object
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "{}");

            const config = loadConfig();
            expect(config.machineId).not.toBe("");
            const { machineId, ...rest } = config;
            const { machineId: _, ...expectedRest } = DEFAULT_CONFIG;
            expect(rest).toEqual(expectedRest);
        });

        test("loads all config values correctly", () => {
            const customConfig: MemoryConfig = {
                autoSync: false,
                recoveryOnStartup: false,
                syncOnCompaction: false,
                timeout: 3000,
                logLevel: "debug",
                logRetentionDays: 14,
                showFailures: true,
                embedding: {
                    enabled: false,
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    batchSize: 200,
                },
                search: {
                    defaultMode: "hybrid",
                    temporalDecay: {
                        enabled: false,
                        halfLifeDays: 60,
                    },
                },
                ambientContext: {
                    enabled: false,
                    budget: 1200,
                },
                machineId: "custom-machine-id",
                remoteSync: {
                    enabled: false,
                    autoPush: true,
                    autoPull: true,
                },
                legacyMemoryFiles: {
                    enabled: false,
                },
                providerEgress: {
                    ...DEFAULT_CONFIG.providerEgress,
                },
            };

            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), JSON.stringify(customConfig));

            const config = loadConfig();
            expect(config).toEqual(customConfig);
        });

        test("returns a copy, not the default reference", () => {
            const config1 = loadConfig();
            const config2 = loadConfig();

            config1.autoSync = false;

            expect(config2.autoSync).toBe(true);
            expect(DEFAULT_CONFIG.autoSync).toBe(true);
        });
    });

    describe("saveConfig", () => {
        test("creates directory if missing", () => {
            const configDir = join(testDir, ".config", "memory");
            expect(existsSync(configDir)).toBe(false);

            saveConfig({ autoSync: true });

            expect(existsSync(configDir)).toBe(true);
        });

        test("writes valid JSON", () => {
            saveConfig({ autoSync: false });

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");

            // Should not throw
            const parsed = JSON.parse(content);
            expect(parsed.autoSync).toBe(false);
        });

        test("merges with existing config", () => {
            // First save
            saveConfig({ autoSync: false, timeout: 3000 });

            // Second save (should merge)
            saveConfig({ recoveryOnStartup: false });

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);

            // Both values should be present
            expect(parsed.autoSync).toBe(false);
            expect(parsed.timeout).toBe(3000);
            expect(parsed.recoveryOnStartup).toBe(false);
        });

        test("overwrites existing values", () => {
            saveConfig({ timeout: 3000 });
            saveConfig({ timeout: 5000 });

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);

            expect(parsed.timeout).toBe(5000);
        });

        test("writes with 2-space indent for readability", () => {
            saveConfig({ autoSync: true, timeout: 5000 });

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");

            // Should be pretty-printed with 2 spaces
            expect(content).toContain("  ");
            expect(content).toContain('  "autoSync"');
        });

        test("adds trailing newline", () => {
            saveConfig({ autoSync: true });

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");

            expect(content).toEndWith("\n");
        });

        test("handles invalid existing config gracefully", () => {
            // Create config directory with invalid JSON
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "invalid json");

            // Should not throw
            saveConfig({ autoSync: false });

            // New config should be saved
            const configPath = join(configDir, "config.json");
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);

            expect(parsed.autoSync).toBe(false);
        });
    });

    describe("embedding config", () => {
        test("DEFAULT_CONFIG has embedding property with expected defaults", () => {
            expect(DEFAULT_CONFIG).toHaveProperty("embedding");
            expect(DEFAULT_CONFIG.embedding).toEqual({
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
                batchSize: 100,
            });
        });

        test("DEFAULT_EMBEDDING_CONFIG matches DEFAULT_CONFIG.embedding", () => {
            expect(DEFAULT_EMBEDDING_CONFIG).toEqual(DEFAULT_CONFIG.embedding);
        });

        test("loadConfig() with no config file returns default embedding config", () => {
            const config = loadConfig();
            expect(config.embedding).toEqual(DEFAULT_EMBEDDING_CONFIG);
        });

        test("loadConfig() with partial embedding config merges correctly", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { model: "custom/model" } })
            );

            const config = loadConfig();

            // Overridden value
            expect(config.embedding.model).toBe("custom/model");

            // Default values preserved
            expect(config.embedding.enabled).toBe(true);
            expect(config.embedding.provider).toBe("local");
            expect(config.embedding.dimensions).toBe(384);
        });

        test("saveConfig() with embedding section persists correctly", () => {
            saveConfig({ embedding: { enabled: true, provider: "local", model: "custom/model", dimensions: 768 } } as Partial<MemoryConfig>);

            const configPath = join(testDir, ".config", "memory", "config.json");
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);

            expect(parsed.embedding.model).toBe("custom/model");
            expect(parsed.embedding.dimensions).toBe(768);
        });

        test("DEFAULT_EMBEDDING_CONFIG includes batchSize of 100", () => {
            expect(DEFAULT_EMBEDDING_CONFIG).toHaveProperty("batchSize");
            expect(DEFAULT_EMBEDDING_CONFIG.batchSize).toBe(100);
        });

        test("loadConfig() with custom batchSize merges correctly", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { batchSize: 50 } })
            );

            const config = loadConfig();
            expect(config.embedding.batchSize).toBe(50);
            // Other defaults preserved
            expect(config.embedding.enabled).toBe(true);
            expect(config.embedding.provider).toBe("local");
            expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(config.embedding.dimensions).toBe(384);
        });

        test("loadConfig() deep-merges nested embedding section", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({
                    autoSync: false,
                    embedding: { dimensions: 768 },
                })
            );

            const config = loadConfig();

            // Top-level override
            expect(config.autoSync).toBe(false);

            // Embedding deep-merge: overridden field
            expect(config.embedding.dimensions).toBe(768);

            // Embedding deep-merge: default fields preserved
            expect(config.embedding.enabled).toBe(true);
            expect(config.embedding.provider).toBe("local");
            expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
        });
    });

    describe("embedding config apiKey and baseUrl", () => {
        test("EmbeddingConfigData accepts optional apiKey field (undefined by default)", () => {
            const config = loadConfig();
            expect(config.embedding.apiKey).toBeUndefined();
        });

        test("EmbeddingConfigData accepts optional apiKeyEnv and apiKeyRef fields", () => {
            const config = loadConfig();
            expect(config.embedding.apiKeyEnv).toBeUndefined();
            expect(config.embedding.apiKeyRef).toBeUndefined();
        });

        test("EmbeddingConfigData accepts optional baseUrl field (undefined by default)", () => {
            const config = loadConfig();
            expect(config.embedding.baseUrl).toBeUndefined();
        });

        test("loadConfig() preserves deprecated apiKey from config file for compatibility", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { apiKey: "sk-test-key" } })
            );

            const config = loadConfig();
            expect(config.embedding.apiKey).toBe("sk-test-key");
        });

        test("loadConfig() preserves apiKeyEnv and apiKeyRef from config file", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({
                    embedding: {
                        apiKeyEnv: "MEMORY_OPENAI_API_KEY",
                        apiKeyRef: "authkey://memory/openai-api-key",
                    },
                })
            );

            const config = loadConfig();
            expect(config.embedding.apiKeyEnv).toBe("MEMORY_OPENAI_API_KEY");
            expect(config.embedding.apiKeyRef).toBe("authkey://memory/openai-api-key");
        });

        test("loadConfig() preserves baseUrl from config file", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { baseUrl: "https://custom.api.com/v1" } })
            );

            const config = loadConfig();
            expect(config.embedding.baseUrl).toBe("https://custom.api.com/v1");
        });

        test("loadConfig() returns undefined for apiKey/baseUrl when not present in file", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "openai" } })
            );

            const config = loadConfig();
            expect(config.embedding.apiKey).toBeUndefined();
            expect(config.embedding.apiKeyEnv).toBeUndefined();
            expect(config.embedding.apiKeyRef).toBeUndefined();
            expect(config.embedding.baseUrl).toBeUndefined();
        });

        test("DEFAULT_EMBEDDING_CONFIG does NOT include secret or endpoint overrides", () => {
            expect(DEFAULT_EMBEDDING_CONFIG).not.toHaveProperty("apiKey");
            expect(DEFAULT_EMBEDDING_CONFIG).not.toHaveProperty("apiKeyEnv");
            expect(DEFAULT_EMBEDDING_CONFIG).not.toHaveProperty("apiKeyRef");
            expect(DEFAULT_EMBEDDING_CONFIG).not.toHaveProperty("baseUrl");
        });

        test("resolveEmbeddingApiKey prefers explicit apiKeyEnv over provider defaults", () => {
            env.set("MEMORY_OPENAI_API_KEY", "env-key");
            env.set("OPENAI_API_KEY", "default-key");

            const resolution = resolveEmbeddingApiKey(
                { apiKeyEnv: "MEMORY_OPENAI_API_KEY", apiKey: "plaintext-key" },
                ["OPENAI_API_KEY"],
            );

            expect(resolution.apiKey).toBe("env-key");
            expect(resolution.source).toBe("environment");
            expect(resolution.envVar).toBe("MEMORY_OPENAI_API_KEY");
            expect(resolution.ref).toBeUndefined();
            expect(resolution.deprecatedPlaintext).toBe(false);
        });

        test("resolveEmbeddingApiKey falls back to provider environment variables", () => {
            env.set("OPENAI_API_KEY", "default-key");

            const resolution = resolveEmbeddingApiKey({}, ["OPENAI_API_KEY"]);

            expect(resolution.apiKey).toBe("default-key");
            expect(resolution.source).toBe("environment");
            expect(resolution.envVar).toBe("OPENAI_API_KEY");
        });

        test("resolveEmbeddingApiKey marks plaintext config as deprecated", () => {
            const resolution = resolveEmbeddingApiKey(
                { apiKey: "plaintext-key", apiKeyRef: "authkey://memory/openai-api-key" },
                ["OPENAI_API_KEY"],
            );

            expect(resolution.apiKey).toBe("plaintext-key");
            expect(resolution.source).toBe("plaintext-config");
            expect(resolution.ref).toBe("authkey://memory/openai-api-key");
            expect(resolution.deprecatedPlaintext).toBe(true);
        });

        test("resolveEmbeddingApiKey does not resolve opaque apiKeyRef", () => {
            const resolution = resolveEmbeddingApiKey(
                { apiKeyRef: "authkey://memory/openai-api-key" },
                ["OPENAI_API_KEY"],
            );

            expect(resolution.apiKey).toBeUndefined();
            expect(resolution.source).toBe("missing");
            expect(resolution.ref).toBe("authkey://memory/openai-api-key");
        });
    });

    describe("PROVIDER_DEFAULTS", () => {
        test("has entries for local, openai, and ollama", () => {
            expect(PROVIDER_DEFAULTS).toHaveProperty("local");
            expect(PROVIDER_DEFAULTS).toHaveProperty("openai");
            expect(PROVIDER_DEFAULTS).toHaveProperty("ollama");
        });

        test("openai has correct model and dimensions", () => {
            expect(PROVIDER_DEFAULTS.openai.model).toBe("text-embedding-3-small");
            expect(PROVIDER_DEFAULTS.openai.dimensions).toBe(1536);
        });

        test("ollama has correct model and dimensions", () => {
            expect(PROVIDER_DEFAULTS.ollama.model).toBe("nomic-embed-text");
            expect(PROVIDER_DEFAULTS.ollama.dimensions).toBe(768);
        });

        test("local matches DEFAULT_EMBEDDING_CONFIG model and dimensions", () => {
            expect(PROVIDER_DEFAULTS.local.model).toBe(DEFAULT_EMBEDDING_CONFIG.model);
            expect(PROVIDER_DEFAULTS.local.dimensions).toBe(DEFAULT_EMBEDDING_CONFIG.dimensions);
        });
    });

    describe("resolveProviderDefaults", () => {
        test("applies openai defaults to raw merge result", () => {
            const merged: EmbeddingConfigData = {
                ...DEFAULT_EMBEDDING_CONFIG,
                provider: "openai",
            };
            const userEmbedding = { provider: "openai" };

            const resolved = resolveProviderDefaults(merged, userEmbedding);
            expect(resolved.model).toBe("text-embedding-3-small");
            expect(resolved.dimensions).toBe(1536);
        });

        test("preserves user-explicit model field", () => {
            const merged: EmbeddingConfigData = {
                ...DEFAULT_EMBEDDING_CONFIG,
                provider: "openai",
                model: "text-embedding-3-large",
            };
            const userEmbedding = { provider: "openai", model: "text-embedding-3-large" };

            const resolved = resolveProviderDefaults(merged, userEmbedding);
            expect(resolved.model).toBe("text-embedding-3-large");
            expect(resolved.dimensions).toBe(1536);
        });
    });

    describe("provider-specific default resolution", () => {
        test("loadConfig() returns openai defaults when provider is openai without explicit model/dimensions", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "openai" } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("text-embedding-3-small");
            expect(config.embedding.dimensions).toBe(1536);
        });

        test("loadConfig() returns ollama defaults when provider is ollama without explicit model/dimensions", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "ollama" } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("nomic-embed-text");
            expect(config.embedding.dimensions).toBe(768);
        });

        test("loadConfig() preserves explicit model when provider is openai and model is set", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "openai", model: "text-embedding-3-large" } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("text-embedding-3-large");
            expect(config.embedding.dimensions).toBe(1536);
        });

        test("loadConfig() preserves explicit dimensions when provider is openai and dimensions is set", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "openai", dimensions: 3072 } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("text-embedding-3-small");
            expect(config.embedding.dimensions).toBe(3072);
        });

        test("loadConfig() preserves both explicit model and dimensions when both are set", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "openai", model: "custom-model", dimensions: 512 } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("custom-model");
            expect(config.embedding.dimensions).toBe(512);
        });

        test("loadConfig() returns local defaults for provider: local (unchanged behavior)", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "local" } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(config.embedding.dimensions).toBe(384);
        });

        test("loadConfig() returns local defaults for unknown provider (safe fallback)", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ embedding: { provider: "cohere" } })
            );

            const config = loadConfig();
            expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(config.embedding.dimensions).toBe(384);
        });

        test("loadConfig() returns local defaults when no config file exists (unchanged behavior)", () => {
            const config = loadConfig();
            expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(config.embedding.dimensions).toBe(384);
        });
    });

    describe("search config", () => {
        test("DEFAULT_CONFIG.search.defaultMode equals 'auto'", () => {
            expect(DEFAULT_CONFIG.search.defaultMode).toBe("auto");
        });

        test("DEFAULT_CONFIG.search.temporalDecay.enabled equals true", () => {
            expect(DEFAULT_CONFIG.search.temporalDecay.enabled).toBe(true);
        });

        test("DEFAULT_CONFIG.search.temporalDecay.halfLifeDays equals 30", () => {
            expect(DEFAULT_CONFIG.search.temporalDecay.halfLifeDays).toBe(30);
        });

        test("DEFAULT_SEARCH_CONFIG matches DEFAULT_CONFIG.search", () => {
            expect(DEFAULT_SEARCH_CONFIG).toEqual(DEFAULT_CONFIG.search);
        });

        test("loadConfig() with search.defaultMode override deep-merges correctly", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ search: { defaultMode: "hybrid" } })
            );

            const config = loadConfig();

            // Overridden
            expect(config.search.defaultMode).toBe("hybrid");

            // Nested defaults preserved
            expect(config.search.temporalDecay.enabled).toBe(true);
            expect(config.search.temporalDecay.halfLifeDays).toBe(30);
        });

        test("loadConfig() with search.temporalDecay.halfLifeDays override deep-merges nested", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ search: { temporalDecay: { halfLifeDays: 60 } } })
            );

            const config = loadConfig();

            // Nested override
            expect(config.search.temporalDecay.halfLifeDays).toBe(60);

            // Other nested defaults preserved
            expect(config.search.temporalDecay.enabled).toBe(true);

            // Sibling defaults preserved
            expect(config.search.defaultMode).toBe("auto");
        });

        test("loadConfig() with no search key returns full defaults", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ autoSync: false })
            );

            const config = loadConfig();
            expect(config.search).toEqual(DEFAULT_SEARCH_CONFIG);
        });
    });

    describe("ambient context config", () => {
        test("DEFAULT_AMBIENT_CONTEXT_CONFIG has expected defaults", () => {
            expect(DEFAULT_AMBIENT_CONTEXT_CONFIG).toEqual({
                enabled: true,
                budget: 800,
            });
        });

        test("DEFAULT_CONFIG has ambientContext property matching DEFAULT_AMBIENT_CONTEXT_CONFIG", () => {
            expect(DEFAULT_CONFIG).toHaveProperty("ambientContext");
            expect(DEFAULT_CONFIG.ambientContext).toEqual(DEFAULT_AMBIENT_CONTEXT_CONFIG);
        });

        test("loadConfig() returns default ambientContext when no config file", () => {
            const config = loadConfig();
            expect(config.ambientContext).toEqual(DEFAULT_AMBIENT_CONTEXT_CONFIG);
        });

        test("loadConfig() deep-merges partial ambientContext (only budget set, enabled uses default)", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ ambientContext: { budget: 1500 } })
            );

            const config = loadConfig();

            // Overridden value
            expect(config.ambientContext.budget).toBe(1500);

            // Default value preserved
            expect(config.ambientContext.enabled).toBe(true);
        });

        test("loadConfig() preserves explicitly set ambientContext values", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ ambientContext: { enabled: false, budget: 400 } })
            );

            const config = loadConfig();
            expect(config.ambientContext.enabled).toBe(false);
            expect(config.ambientContext.budget).toBe(400);
        });

        test("loadConfig() with no ambientContext key returns full defaults", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(
                join(configDir, "config.json"),
                JSON.stringify({ autoSync: false })
            );

            const config = loadConfig();
            expect(config.ambientContext).toEqual(DEFAULT_AMBIENT_CONTEXT_CONFIG);
        });
    });

    describe("machineId and remoteSync config", () => {
        test("generates and saves a stable machineId if missing in newly loaded config", () => {
            const configPath = join(testDir, ".config", "memory", "config.json");
            expect(existsSync(configPath)).toBe(false);

            const config = loadConfig(configPath);
            expect(config.machineId).toBeDefined();
            expect(config.machineId.length).toBeGreaterThan(0);
            
            // Check that it saved it to disk
            expect(existsSync(configPath)).toBe(true);
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);
            expect(parsed.machineId).toBe(config.machineId);
        });

        test("preserves existing machineId when loading", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            const configPath = join(configDir, "config.json");
            writeFileSync(
                configPath,
                JSON.stringify({ machineId: "existing-machine-id-xyz" })
            );

            const config = loadConfig(configPath);
            expect(config.machineId).toBe("existing-machine-id-xyz");
        });

        test("loads remoteSync defaults correctly", () => {
            const config = loadConfig();
            expect(config.remoteSync.enabled).toBe(false);
            expect(config.remoteSync.autoPush).toBe(true);
            expect(config.remoteSync.autoPull).toBe(true);
        });

        test("merges custom remoteSync config correctly", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            const configPath = join(configDir, "config.json");
            writeFileSync(
                configPath,
                JSON.stringify({ remoteSync: { enabled: true, repositoryUrl: "git@github.com:user/repo.git" } })
            );

            const config = loadConfig(configPath);
            expect(config.remoteSync.enabled).toBe(true);
            expect(config.remoteSync.repositoryUrl).toBe("git@github.com:user/repo.git");
            expect(config.remoteSync.autoPush).toBe(true); // default preserved
            expect(config.remoteSync.autoPull).toBe(true); // default preserved
        });

        test("loads legacyMemoryFiles defaults as disabled", () => {
            const config = loadConfig();
            expect(config.legacyMemoryFiles.enabled).toBe(false);
        });

        test("merges custom legacyMemoryFiles config correctly", () => {
            const configDir = join(testDir, ".config", "memory");
            mkdirSync(configDir, { recursive: true });
            const configPath = join(configDir, "config.json");
            writeFileSync(
                configPath,
                JSON.stringify({ legacyMemoryFiles: { enabled: true } })
            );

            const config = loadConfig(configPath);
            expect(config.legacyMemoryFiles.enabled).toBe(true);
        });
    });
});
