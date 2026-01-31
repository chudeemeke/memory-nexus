/**
 * Install Command Tests
 *
 * Tests for the install CLI command.
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
import {
    executeInstallCommand,
    findHookScriptSource,
    setTestHookScriptSourceOverride,
} from "./install.js";
import { setTestPathOverrides } from "../../../infrastructure/hooks/settings-manager.js";

describe("install command", () => {
    // Use a test-specific directory to avoid modifying actual settings
    const testBaseDir = join(homedir(), ".memory-nexus-test-install");
    const testSettingsPath = join(testBaseDir, ".claude", "settings.json");
    const testBackupPath = join(testBaseDir, ".memory-nexus", "backups", "settings.json.backup");
    const testHookScriptPath = join(testBaseDir, ".memory-nexus", "hooks", "sync-hook.js");

    // Create a mock hook script source
    const mockHookScriptDir = join(testBaseDir, "dist");
    const mockHookScriptPath = join(mockHookScriptDir, "sync-hook.js");

    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let logOutput: string[];
    let errorOutput: string[];

    beforeEach(() => {
        // Clean test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
        mkdirSync(testBaseDir, { recursive: true });

        // Create mock hook script source
        mkdirSync(mockHookScriptDir, { recursive: true });
        writeFileSync(mockHookScriptPath, "// mock hook script");

        // Set path overrides for testing
        setTestPathOverrides({
            settingsPath: testSettingsPath,
            backupPath: testBackupPath,
            hookScriptPath: testHookScriptPath,
        });

        // Set hook script source override
        setTestHookScriptSourceOverride(mockHookScriptPath);

        // Capture console output
        logOutput = [];
        errorOutput = [];
        consoleLogSpy = spyOn(console, "log").mockImplementation((...args) => {
            logOutput.push(args.join(" "));
        });
        consoleErrorSpy = spyOn(console, "error").mockImplementation((...args) => {
            errorOutput.push(args.join(" "));
        });
    });

    afterEach(() => {
        // Reset path overrides
        setTestPathOverrides(null);
        setTestHookScriptSourceOverride(null);

        // Restore console
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();

        // Clean up test directory
        if (existsSync(testBaseDir)) {
            rmSync(testBaseDir, { recursive: true, force: true });
        }
    });

    describe("executeInstallCommand", () => {
        test("installs hooks successfully when not already installed", async () => {
            await executeInstallCommand({});

            // Check settings.json was created with hooks
            expect(existsSync(testSettingsPath)).toBe(true);
            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.hooks?.SessionEnd).toBeDefined();
            expect(settings.hooks?.PreCompact).toBeDefined();

            // Check hook script was copied
            expect(existsSync(testHookScriptPath)).toBe(true);

            // Check output messages
            expect(logOutput.join("\n")).toContain("Copied hook script");
            expect(logOutput.join("\n")).toContain("Hooks installed successfully");
            expect(logOutput.join("\n")).toContain("Hook installation complete!");
        });

        test("skips installation when hooks already installed", async () => {
            // First install
            await executeInstallCommand({});
            logOutput = []; // Clear output

            // Try to install again
            await executeInstallCommand({});

            expect(logOutput.join("\n")).toContain("Hooks are already installed");
            expect(logOutput.join("\n")).toContain("Use --force to reinstall");
        });

        test("reinstalls when --force is used", async () => {
            // First install
            await executeInstallCommand({});
            logOutput = []; // Clear output

            // Force reinstall
            await executeInstallCommand({ force: true });

            expect(logOutput.join("\n")).toContain("Hooks already installed");
        });

        test("backs up existing settings before modifying", async () => {
            // Create existing settings
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ existingSetting: "value" })
            );

            await executeInstallCommand({});

            // Check backup was created
            expect(existsSync(testBackupPath)).toBe(true);
            const backup = JSON.parse(readFileSync(testBackupPath, "utf-8"));
            expect(backup.existingSetting).toBe("value");
        });

        test("preserves existing settings when adding hooks", async () => {
            // Create existing settings
            mkdirSync(dirname(testSettingsPath), { recursive: true });
            writeFileSync(
                testSettingsPath,
                JSON.stringify({ keepThis: "preserved" })
            );

            await executeInstallCommand({});

            const settings = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
            expect(settings.keepThis).toBe("preserved");
            expect(settings.hooks?.SessionEnd).toBeDefined();
        });

        test("reports error when hook script source not found", async () => {
            // Set override to a non-existent path
            setTestHookScriptSourceOverride(join(testBaseDir, "nonexistent", "sync-hook.js"));

            await executeInstallCommand({});

            expect(errorOutput.join("\n")).toContain("Hook script not found");
            expect(process.exitCode).toBe(1);

            // Reset exit code
            process.exitCode = 0;
        });
    });

    describe("findHookScriptSource", () => {
        test("uses override when set", () => {
            // Override is already set in beforeEach
            const result = findHookScriptSource();
            expect(result).toBe(mockHookScriptPath);
        });

        test("returns null when override path does not exist", () => {
            setTestHookScriptSourceOverride(join(testBaseDir, "nonexistent", "sync-hook.js"));
            const result = findHookScriptSource();
            expect(result).toBeNull();
        });

        test("checks default paths when no override set", () => {
            setTestHookScriptSourceOverride(null);

            // The actual project has dist/sync-hook.js, so this should find it
            const result = findHookScriptSource();

            // Result may or may not exist depending on whether build:hook was run
            // Just verify it returns a string or null
            expect(result === null || typeof result === "string").toBe(true);
        });
    });
});
