/**
 * Friction Purge Handler Tests
 *
 * Tests the friction purge action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("friction purge action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let oldXdgData: string | undefined;
    let oldXdgConfig: string | undefined;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "memory-status-purge-test-"));
        oldXdgData = process.env.XDG_DATA_HOME;
        oldXdgConfig = process.env.XDG_CONFIG_HOME;
        process.env.XDG_DATA_HOME = join(tempDir, "data");
        process.env.XDG_CONFIG_HOME = join(tempDir, "config");
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();

        if (oldXdgData !== undefined) {
            process.env.XDG_DATA_HOME = oldXdgData;
        } else {
            delete process.env.XDG_DATA_HOME;
        }
        if (oldXdgConfig !== undefined) {
            process.env.XDG_CONFIG_HOME = oldXdgConfig;
        } else {
            delete process.env.XDG_CONFIG_HOME;
        }

        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    });

    it("purge without --force requires --dry-run or --force", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
            pattern: "Some entry",
        });

        expect(result.exitCode).toBe(1);
        const errorCalls = consoleErrorSpy.mock.calls.map((c: any[]) => c[0]);
        const hintLine = errorCalls.find((s: string) =>
            typeof s === "string" && s.includes("--force")
        );
        expect(hintLine).toBeDefined();
    });

    it("purge returns exitCode 1 without pattern", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
        });

        expect(result.exitCode).toBe(1);
    });

    it("purge with --force on non-matching pattern reports zero", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
            pattern: "zzz_nonexistent_pattern_zzz",
            force: true,
        });

        expect(result.exitCode).toBe(0);
        const logCalls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
        const noMatchLine = logCalls.find((s: string) =>
            typeof s === "string" && s.includes("No entries match")
        );
        expect(noMatchLine).toBeDefined();
    });
});
