/**
 * Friction Won't-Fix Handler Tests
 *
 * Tests the friction wont-fix action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("friction wont-fix action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let oldXdgData: string | undefined;
    let oldXdgConfig: string | undefined;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "memory-status-wontfix-test-"));
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

    it("wont-fix action returns exitCode 0 after logging", async () => {
        // Log first
        await executeFrictionCommand({
            action: "log",
            description: "Won't fix this",
            json: true,
        });
        const logOutput = consoleLogSpy.mock.calls[0][0] as string;
        const logResult = JSON.parse(logOutput);
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "wont-fix",
            id: String(logResult.id),
            resolution: "By design",
        });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining("won't fix")
        );
    });

    it("wont-fix action returns exitCode 1 for non-existent id", async () => {
        const result = await executeFrictionCommand({
            action: "wont-fix",
            id: "99999",
            resolution: "By design",
        });

        expect(result.exitCode).toBe(1);
    });

    it("wont-fix action returns exitCode 1 without id", async () => {
        const result = await executeFrictionCommand({
            action: "wont-fix",
            resolution: "By design",
        });

        expect(result.exitCode).toBe(1);
    });
});
