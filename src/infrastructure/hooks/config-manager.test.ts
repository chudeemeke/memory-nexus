/**
 * Configuration Manager Tests
 *
 * Tests for config loading, saving, and default handling.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to mock homedir for testing
// Import the module and test with actual temp directories
import {
    loadConfig,
    saveConfig,
    getConfigPath,
    getConfigDir,
    DEFAULT_CONFIG,
    type MemoryNexusConfig,
} from "./config-manager.js";

describe("config-manager", () => {
    let testDir: string;
    let originalHome: string;

    beforeEach(() => {
        // Create unique temp directory for each test
        testDir = join(
            tmpdir(),
            `config-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        mkdirSync(testDir, { recursive: true });

        // Store original HOME and override for testing
        originalHome = process.env.HOME ?? "";
        process.env.HOME = testDir;
        // Also set USERPROFILE for Windows
        process.env.USERPROFILE = testDir;
    });

    afterEach(() => {
        // Restore original HOME
        process.env.HOME = originalHome;
        process.env.USERPROFILE = originalHome;

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
            expect(configDir).toContain(".memory-nexus");
        });
    });

    describe("getConfigPath", () => {
        test("returns path to config.json", () => {
            const configPath = getConfigPath();
            expect(configPath).toContain(".memory-nexus");
            expect(configPath).toEndWith("config.json");
        });
    });

    describe("loadConfig", () => {
        test("returns defaults when config file missing", () => {
            const config = loadConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test("merges partial config with defaults", () => {
            // Create config directory and write partial config
            const configDir = join(testDir, ".memory-nexus");
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
            const configDir = join(testDir, ".memory-nexus");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "{ invalid json }");

            const config = loadConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test("handles malformed JSON (syntax error)", () => {
            // Create config directory and write malformed JSON
            const configDir = join(testDir, ".memory-nexus");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "not json at all");

            const config = loadConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test("handles empty config file", () => {
            // Create config directory and write empty file
            const configDir = join(testDir, ".memory-nexus");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "");

            const config = loadConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test("handles empty JSON object", () => {
            // Create config directory and write empty object
            const configDir = join(testDir, ".memory-nexus");
            mkdirSync(configDir, { recursive: true });
            writeFileSync(join(configDir, "config.json"), "{}");

            const config = loadConfig();
            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test("loads all config values correctly", () => {
            const customConfig: MemoryNexusConfig = {
                autoSync: false,
                recoveryOnStartup: false,
                syncOnCompaction: false,
                timeout: 3000,
                logLevel: "debug",
                logRetentionDays: 14,
                showFailures: true,
            };

            const configDir = join(testDir, ".memory-nexus");
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
            const configDir = join(testDir, ".memory-nexus");
            expect(existsSync(configDir)).toBe(false);

            saveConfig({ autoSync: true });

            expect(existsSync(configDir)).toBe(true);
        });

        test("writes valid JSON", () => {
            saveConfig({ autoSync: false });

            const configPath = join(testDir, ".memory-nexus", "config.json");
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

            const configPath = join(testDir, ".memory-nexus", "config.json");
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

            const configPath = join(testDir, ".memory-nexus", "config.json");
            const content = readFileSync(configPath, "utf-8");
            const parsed = JSON.parse(content);

            expect(parsed.timeout).toBe(5000);
        });

        test("writes with 2-space indent for readability", () => {
            saveConfig({ autoSync: true, timeout: 5000 });

            const configPath = join(testDir, ".memory-nexus", "config.json");
            const content = readFileSync(configPath, "utf-8");

            // Should be pretty-printed with 2 spaces
            expect(content).toContain("  ");
            expect(content).toContain('  "autoSync"');
        });

        test("adds trailing newline", () => {
            saveConfig({ autoSync: true });

            const configPath = join(testDir, ".memory-nexus", "config.json");
            const content = readFileSync(configPath, "utf-8");

            expect(content).toEndWith("\n");
        });

        test("handles invalid existing config gracefully", () => {
            // Create config directory with invalid JSON
            const configDir = join(testDir, ".memory-nexus");
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
});
