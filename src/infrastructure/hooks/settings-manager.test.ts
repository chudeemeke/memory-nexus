/**
 * Settings Manager Tests
 *
 * Tests for Claude Code settings.json manipulation.
 * Uses isolated test directories via path overrides to avoid modifying actual settings.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import {
    getClaudeSettingsPath,
    getBackupPath,
    getHookScriptPath,
    loadClaudeSettings,
    backupSettings,
    restoreFromBackup,
    installHooks,
    uninstallHooks,
    checkHooksInstalled,
    setTestPathOverrides,
} from "./settings-manager.js";

describe("settings-manager", () => {
    // Use a test-specific directory to avoid modifying actual settings
    const testBaseDir = join(homedir(), ".memory-nexus-test-settings");
    const testSettingsPath = join(testBaseDir, ".claude", "settings.json");
    const testBackupPath = join(testBaseDir, ".memory-nexus", "backups", "settings.json.backup");
    const testHookScriptPath = join(testBaseDir, ".memory-nexus", "hooks", "sync-hook.js");

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
    });

    afterEach(() => {
        // Reset path overrides
        setTestPathOverrides(null);

        // Clean up test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    describe("path helpers", () => {
        test("getClaudeSettingsPath returns correct path with override", () => {
            const path = getClaudeSettingsPath();
            expect(path).toBe(testSettingsPath);
        });

        test("getBackupPath returns correct path with override", () => {
            const path = getBackupPath();
            expect(path).toBe(testBackupPath);
        });

        test("getHookScriptPath returns correct path with override", () => {
            const path = getHookScriptPath();
            expect(path).toBe(testHookScriptPath);
        });

        test("path helpers return default paths when no override", () => {
            setTestPathOverrides(null);

            expect(getClaudeSettingsPath()).toContain(".claude");
            expect(getClaudeSettingsPath()).toContain("settings.json");
            expect(getBackupPath()).toContain(".memory-nexus");
            expect(getBackupPath()).toContain("backups");
            expect(getHookScriptPath()).toContain(".memory-nexus");
            expect(getHookScriptPath()).toContain("hooks");

            // Restore for other tests
            setTestPathOverrides({
                settingsPath: testSettingsPath,
                backupPath: testBackupPath,
                hookScriptPath: testHookScriptPath,
            });
        });
    });

    describe("loadClaudeSettings", () => {
        test("returns empty object when file does not exist", () => {
            const settings = loadClaudeSettings();
            expect(settings).toEqual({});
        });

        test("returns parsed settings when file exists", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ testKey: "testValue" })
            );

            const settings = loadClaudeSettings();
            expect(settings).toHaveProperty("testKey", "testValue");
        });

        test("returns empty object for invalid JSON", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(testSettingsPath, "not valid json");

            const settings = loadClaudeSettings();
            expect(settings).toEqual({});
        });
    });

    describe("backupSettings", () => {
        test("returns false when settings do not exist", () => {
            const result = backupSettings();
            expect(result).toBe(false);
        });

        test("creates backup when settings exist", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ original: true })
            );

            const result = backupSettings();

            expect(result).toBe(true);
            expect(existsSync(testBackupPath)).toBe(true);
        });

        test("backup contains original content", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            const originalSettings = { foo: "bar", hooks: {} };
            writeFileSync(testSettingsPath, JSON.stringify(originalSettings));

            backupSettings();

            const backupContent = JSON.parse(readFileSync(testBackupPath, "utf-8"));
            expect(backupContent).toEqual(originalSettings);
        });
    });

    describe("restoreFromBackup", () => {
        test("returns false when backup does not exist", () => {
            const result = restoreFromBackup();
            expect(result).toBe(false);
        });

        test("restores settings from backup", () => {
            mkdirSync(dirname(testBackupPath), { recursive: true });
            const backupData = { restored: true };
            writeFileSync(testBackupPath, JSON.stringify(backupData));

            const result = restoreFromBackup();

            expect(result).toBe(true);
            expect(existsSync(testSettingsPath)).toBe(true);

            const restored = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(restored).toEqual(backupData);
        });

        test("creates settings directory if missing", () => {
            mkdirSync(dirname(testBackupPath), { recursive: true });
            writeFileSync(testBackupPath, JSON.stringify({ test: true }));

            restoreFromBackup();

            expect(existsSync(dirname(testSettingsPath))).toBe(true);
        });
    });

    describe("installHooks", () => {
        test("creates hooks in empty settings", () => {
            const result = installHooks();

            expect(result.success).toBe(true);
            expect(result.message).toBe("Hooks installed successfully");

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks).toBeDefined();
            expect(settings.hooks.SessionEnd).toBeDefined();
            expect(settings.hooks.PreCompact).toBeDefined();
        });

        test("backs up existing settings before modifying", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ existing: "setting" })
            );

            installHooks();

            expect(existsSync(testBackupPath)).toBe(true);
            const backup = JSON.parse(readFileSync(testBackupPath, "utf-8"));
            expect(backup).toHaveProperty("existing", "setting");
        });

        test("preserves existing settings when adding hooks", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ keepThis: "value" })
            );

            installHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings).toHaveProperty("keepThis", "value");
            expect(settings.hooks).toBeDefined();
        });

        test("is idempotent - does not duplicate hooks", () => {
            installHooks();
            installHooks();
            const result = installHooks();

            expect(result.message).toBe("Hooks already installed");

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks.SessionEnd.length).toBe(1);
            expect(settings.hooks.PreCompact.length).toBe(1);
        });

        test("adds SessionEnd hook with correct structure", () => {
            installHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            const sessionEndHook = settings.hooks.SessionEnd[0];

            expect(sessionEndHook.hooks[0]).toHaveProperty("type", "command");
            expect(sessionEndHook.hooks[0]).toHaveProperty("timeout", 5);
            expect(sessionEndHook.hooks[0].command).toContain("memory-nexus");
        });

        test("adds PreCompact hook with matcher", () => {
            installHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            const preCompactHook = settings.hooks.PreCompact[0];

            expect(preCompactHook).toHaveProperty("matcher", "auto");
            expect(preCompactHook.hooks[0]).toHaveProperty("type", "command");
        });

        test("uses forward slashes in hook command path", () => {
            installHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            const command = settings.hooks.SessionEnd[0].hooks[0].command;

            // Should not contain backslashes
            expect(command).not.toMatch(/\\/);
            // Should contain forward slashes
            expect(command).toContain("/");
        });

        test("preserves existing hooks of other types", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({
                    hooks: {
                        Stop: [{ hooks: [{ type: "command", command: "echo stopped" }] }],
                    },
                })
            );

            installHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks.Stop).toBeDefined();
            expect(settings.hooks.Stop[0].hooks[0].command).toBe("echo stopped");
        });
    });

    describe("uninstallHooks", () => {
        test("removes memory-nexus hooks", () => {
            installHooks();
            const result = uninstallHooks();

            expect(result.success).toBe(true);
            expect(result.message).toBe("Hooks uninstalled successfully");

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks?.SessionEnd).toBeUndefined();
            expect(settings.hooks?.PreCompact).toBeUndefined();
        });

        test("preserves other hooks", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({
                    hooks: {
                        SessionEnd: [
                            { hooks: [{ type: "command", command: "echo memory-nexus" }] },
                            { hooks: [{ type: "command", command: "echo other" }] },
                        ],
                    },
                })
            );

            uninstallHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks.SessionEnd).toBeDefined();
            expect(settings.hooks.SessionEnd.length).toBe(1);
            expect(settings.hooks.SessionEnd[0].hooks[0].command).toBe("echo other");
        });

        test("returns success when no hooks to uninstall", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(testSettingsPath, JSON.stringify({}));

            const result = uninstallHooks();

            expect(result.success).toBe(true);
            expect(result.message).toBe("No hooks to uninstall");
        });

        test("removes empty hooks object after uninstall", () => {
            installHooks();
            uninstallHooks();

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks).toBeUndefined();
        });
    });

    describe("checkHooksInstalled", () => {
        test("returns all false when nothing installed", () => {
            const status = checkHooksInstalled();

            expect(status.sessionEnd).toBe(false);
            expect(status.preCompact).toBe(false);
            expect(status.hookScriptExists).toBe(false);
            expect(status.backupExists).toBe(false);
        });

        test("detects installed hooks", () => {
            installHooks();

            const status = checkHooksInstalled();

            expect(status.sessionEnd).toBe(true);
            expect(status.preCompact).toBe(true);
        });

        test("detects hook script existence", () => {
            mkdirSync(dirname(testHookScriptPath), { recursive: true });
            writeFileSync(testHookScriptPath, "// hook script");

            const status = checkHooksInstalled();

            expect(status.hookScriptExists).toBe(true);
        });

        test("detects backup existence", () => {
            mkdirSync(dirname(testBackupPath), { recursive: true });
            writeFileSync(testBackupPath, JSON.stringify({}));

            const status = checkHooksInstalled();

            expect(status.backupExists).toBe(true);
        });

        test("returns false for non-memory-nexus hooks", () => {
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({
                    hooks: {
                        SessionEnd: [
                            { hooks: [{ type: "command", command: "echo other" }] },
                        ],
                    },
                })
            );

            const status = checkHooksInstalled();

            expect(status.sessionEnd).toBe(false);
        });
    });
});
