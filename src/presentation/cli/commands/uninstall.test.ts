/**
 * Uninstall Command Tests
 *
 * Tests for the uninstall CLI command.
 * Uses isolated test directories via path overrides.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { executeUninstallCommand } from "./uninstall.js";
import {
    setTestPathOverrides,
    installHooks,
} from "../../../infrastructure/hooks/settings-manager.js";

describe("uninstall command", () => {
    // Use a test-specific directory to avoid modifying actual settings
    const testBaseDir = join(homedir(), ".memory-nexus-test-uninstall");
    const testSettingsPath = join(testBaseDir, ".claude", "settings.json");
    const testBackupPath = join(testBaseDir, ".memory-nexus", "backups", "settings.json.backup");
    const testHookScriptPath = join(testBaseDir, ".memory-nexus", "hooks", "sync-hook.js");

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

        // Capture console output
        logOutput = [];
        consoleLogSpy = spyOn(console, "log").mockImplementation((...args) => {
            logOutput.push(args.join(" "));
        });
    });

    afterEach(() => {
        // Reset path overrides
        setTestPathOverrides(null);

        // Restore console
        consoleLogSpy.mockRestore();

        // Clean up test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    describe("executeUninstallCommand", () => {
        test("reports when hooks not installed", async () => {
            await executeUninstallCommand({});

            expect(logOutput.join("\n")).toContain("Hooks are not installed");
        });

        test("removes hooks from settings.json", async () => {
            // First install hooks
            installHooks();

            // Create hook script file
            mkdirSync(dirname(testHookScriptPath), { recursive: true });
            writeFileSync(testHookScriptPath, "// hook script");

            // Verify hooks are installed
            const beforeSettings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(beforeSettings.hooks?.SessionEnd).toBeDefined();
            expect(beforeSettings.hooks?.PreCompact).toBeDefined();

            // Uninstall
            await executeUninstallCommand({});

            // Check hooks were removed
            const afterSettings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(afterSettings.hooks?.SessionEnd).toBeUndefined();
            expect(afterSettings.hooks?.PreCompact).toBeUndefined();

            expect(logOutput.join("\n")).toContain("Hooks uninstalled successfully");
        });

        test("removes hook script file", async () => {
            // Install hooks and create script
            installHooks();
            mkdirSync(dirname(testHookScriptPath), { recursive: true });
            writeFileSync(testHookScriptPath, "// hook script");

            expect(existsSync(testHookScriptPath)).toBe(true);

            // Uninstall
            await executeUninstallCommand({});

            expect(existsSync(testHookScriptPath)).toBe(false);
            expect(logOutput.join("\n")).toContain("Removed hook script");
        });

        test("restores from backup with --restore option", async () => {
            // Create original settings with custom value
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ originalValue: "before hooks" })
            );

            // Install hooks (creates backup)
            installHooks();

            // Verify backup was created
            expect(existsSync(testBackupPath)).toBe(true);

            // Uninstall with restore
            await executeUninstallCommand({ restore: true });

            // Check original settings were restored
            const restored = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(restored.originalValue).toBe("before hooks");
            expect(restored.hooks).toBeUndefined();

            expect(logOutput.join("\n")).toContain("Restored settings.json from backup");
        });

        test("falls back to uninstall when backup missing with --restore", async () => {
            // Install hooks without existing settings (no backup created)
            installHooks();

            // Uninstall with restore (but no backup exists)
            await executeUninstallCommand({ restore: true });

            // Hooks should still be uninstalled
            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks?.SessionEnd).toBeUndefined();

            expect(logOutput.join("\n")).toContain("Hooks uninstalled successfully");
        });

        test("preserves other hooks when uninstalling", async () => {
            // Create settings with other hooks
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({
                    hooks: {
                        Stop: [{ hooks: [{ type: "command", command: "echo stopped" }] }],
                    },
                })
            );

            // Install memory-nexus hooks
            installHooks();

            // Verify both are present
            const beforeSettings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(beforeSettings.hooks.Stop).toBeDefined();
            expect(beforeSettings.hooks.SessionEnd).toBeDefined();

            // Uninstall
            await executeUninstallCommand({});

            // Check other hooks are preserved
            const afterSettings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(afterSettings.hooks.Stop).toBeDefined();
            expect(afterSettings.hooks.Stop[0].hooks[0].command).toBe("echo stopped");
            expect(afterSettings.hooks.SessionEnd).toBeUndefined();
        });

        test("shows help messages after uninstall", async () => {
            installHooks();

            await executeUninstallCommand({});

            expect(logOutput.join("\n")).toContain("Sessions will no longer sync automatically");
            expect(logOutput.join("\n")).toContain("Manual sync still available");
        });
    });
});
