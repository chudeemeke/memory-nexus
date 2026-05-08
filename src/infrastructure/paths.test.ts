/**
 * Centralized Paths Module Tests
 *
 * Tests for XDG-aware path definitions with test override support.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
    getConfigDir,
    getDataDir,
    getLegacyDir,
    getMemoryDir,
    getConfigPath,
    getDbPath,
    getLogDir,
    getHookDir,
    getBackupDir,
    getCheckpointPath,
} from "./paths.js";
import { installEnvOverrides, type EnvOverrides } from "../../tests/helpers/env-overrides.js";

describe("paths", () => {
    const home = homedir();
    let env: EnvOverrides;

    beforeEach(() => {
        env = installEnvOverrides();
        // Start each test with these env vars unset so the default branches
        // are exercised. Tests that need a value use env.set() explicitly.
        env.unset("XDG_CONFIG_HOME");
        env.unset("XDG_DATA_HOME");
        env.unset("MEMORY_HOME");
    });

    afterEach(() => {
        env.cleanup();
    });

    describe("getConfigDir", () => {
        test("returns ~/.config/memory by default", () => {
            const configDir = getConfigDir();
            expect(configDir).toBe(join(home, ".config", "memory"));
        });

        test("respects XDG_CONFIG_HOME", () => {
            process.env.XDG_CONFIG_HOME = "/custom/config";
            const configDir = getConfigDir();
            expect(configDir).toBe(join("/custom/config", "memory"));
        });
    });

    describe("getDataDir", () => {
        test("returns ~/.local/share/memory by default", () => {
            const dataDir = getDataDir();
            expect(dataDir).toBe(join(home, ".local", "share", "memory"));
        });

        test("respects XDG_DATA_HOME", () => {
            process.env.XDG_DATA_HOME = "/custom/data";
            const dataDir = getDataDir();
            expect(dataDir).toBe(join("/custom/data", "memory"));
        });
    });

    describe("XDG independence", () => {
        test("XDG_CONFIG_HOME does not affect data dir", () => {
            process.env.XDG_CONFIG_HOME = "/custom/config";
            const dataDir = getDataDir();
            expect(dataDir).toBe(join(home, ".local", "share", "memory"));
        });

        test("XDG_DATA_HOME does not affect config dir", () => {
            process.env.XDG_DATA_HOME = "/custom/data";
            const configDir = getConfigDir();
            expect(configDir).toBe(join(home, ".config", "memory"));
        });

        test("both XDG vars set simultaneously", () => {
            process.env.XDG_CONFIG_HOME = "/custom/config";
            process.env.XDG_DATA_HOME = "/custom/data";
            expect(getConfigDir()).toBe(join("/custom/config", "memory"));
            expect(getDataDir()).toBe(join("/custom/data", "memory"));
        });
    });

    describe("getLegacyDir", () => {
        test("returns ~/.memory-nexus", () => {
            const legacyDir = getLegacyDir();
            expect(legacyDir).toBe(join(home, ".memory-nexus"));
        });

        test("ignores XDG_CONFIG_HOME", () => {
            process.env.XDG_CONFIG_HOME = "/custom/config";
            const legacyDir = getLegacyDir();
            expect(legacyDir).toBe(join(home, ".memory-nexus"));
        });

        test("ignores XDG_DATA_HOME", () => {
            process.env.XDG_DATA_HOME = "/custom/data";
            const legacyDir = getLegacyDir();
            expect(legacyDir).toBe(join(home, ".memory-nexus"));
        });
    });

    describe("derived paths", () => {
        test("getConfigPath derives from getConfigDir", () => {
            const configPath = getConfigPath();
            expect(configPath).toBe(join(getConfigDir(), "config.json"));
        });

        test("getDbPath derives from getDataDir", () => {
            const dbPath = getDbPath();
            expect(dbPath).toBe(join(getDataDir(), "memory.db"));
        });

        test("getLogDir derives from getDataDir", () => {
            const logDir = getLogDir();
            expect(logDir).toBe(join(getDataDir(), "logs"));
        });

        test("getHookDir derives from getDataDir", () => {
            const hookDir = getHookDir();
            expect(hookDir).toBe(join(getDataDir(), "hooks"));
        });

        test("getBackupDir derives from getDataDir", () => {
            const backupDir = getBackupDir();
            expect(backupDir).toBe(join(getDataDir(), "backups"));
        });

        test("getCheckpointPath derives from getDataDir", () => {
            const checkpointPath = getCheckpointPath();
            expect(checkpointPath).toBe(join(getDataDir(), "sync-checkpoint.json"));
        });

        test("derived paths respect XDG overrides", () => {
            process.env.XDG_CONFIG_HOME = "/xdg/config";
            process.env.XDG_DATA_HOME = "/xdg/data";

            expect(getConfigPath()).toBe(join("/xdg/config", "memory", "config.json"));
            expect(getDbPath()).toBe(join("/xdg/data", "memory", "memory.db"));
            expect(getLogDir()).toBe(join("/xdg/data", "memory", "logs"));
            expect(getHookDir()).toBe(join("/xdg/data", "memory", "hooks"));
            expect(getBackupDir()).toBe(join("/xdg/data", "memory", "backups"));
            expect(getCheckpointPath()).toBe(join("/xdg/data", "memory", "sync-checkpoint.json"));
        });
    });

    describe("getMemoryDir", () => {
        test("returns ~/.memory by default", () => {
            const memoryDir = getMemoryDir();
            expect(memoryDir).toBe(join(home, ".memory"));
        });

        test("ignores XDG_CONFIG_HOME", () => {
            process.env.XDG_CONFIG_HOME = "/custom/config";
            expect(getMemoryDir()).toBe(join(home, ".memory"));
        });

        test("ignores XDG_DATA_HOME", () => {
            process.env.XDG_DATA_HOME = "/custom/data";
            expect(getMemoryDir()).toBe(join(home, ".memory"));
        });

        test("respects MEMORY_HOME when set", () => {
            env.set("MEMORY_HOME", "/custom/memory");
            expect(getMemoryDir()).toBe("/custom/memory");
        });

        test("ignores empty MEMORY_HOME (falls through to default)", () => {
            env.set("MEMORY_HOME", "");
            expect(getMemoryDir()).toBe(join(home, ".memory"));
        });

        test("falls back to ~/.memory when MEMORY_HOME is unset", () => {
            // unset already done in beforeEach; assert behaviour explicitly
            expect(getMemoryDir()).toBe(join(home, ".memory"));
        });

        test("MEMORY_HOME does not affect getConfigDir or getDataDir", () => {
            env.set("MEMORY_HOME", "/custom/memory");
            expect(getConfigDir()).toBe(join(home, ".config", "memory"));
            expect(getDataDir()).toBe(join(home, ".local", "share", "memory"));
        });

        test("MEMORY_HOME uses value as-is (no ~ expansion, no APP_NAME suffix)", () => {
            // GNUPGHOME-style: $MEMORY_HOME=/foo means the memory dir IS /foo,
            // not /foo/memory. Diverges from XDG_*_HOME base+APP_NAME convention.
            env.set("MEMORY_HOME", "/exact/path");
            expect(getMemoryDir()).toBe("/exact/path");
        });

        test("getLegacyDir ignores MEMORY_HOME", () => {
            env.set("MEMORY_HOME", "/custom/memory");
            expect(getLegacyDir()).toBe(join(home, ".memory-nexus"));
        });
    });
});
