/**
 * Friction Resolve Handler Tests
 *
 * Tests the friction resolve action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("friction resolve action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let oldXdgData: string | undefined;
    let oldXdgConfig: string | undefined;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "memory-status-resolve-test-"));
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

    it("resolve action returns exitCode 0 after logging", async () => {
        // Log first
        await executeFrictionCommand({
            action: "log",
            description: "To be resolved",
            json: true,
        });
        const logOutput = consoleLogSpy.mock.calls[0][0] as string;
        const logResult = JSON.parse(logOutput);
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "resolve",
            id: String(logResult.id),
            resolution: "Fixed the issue",
        });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining("Resolved friction #")
        );
    });

    it("resolve action returns exitCode 1 for non-existent id", async () => {
        const result = await executeFrictionCommand({
            action: "resolve",
            id: "99999",
            resolution: "Fixed",
        });

        expect(result.exitCode).toBe(1);
    });

    it("resolve action with JSON output", async () => {
        // Log first
        await executeFrictionCommand({
            action: "log",
            description: "To resolve JSON",
            json: true,
        });
        const logOutput = consoleLogSpy.mock.calls[0][0] as string;
        const logResult = JSON.parse(logOutput);
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "resolve",
            id: String(logResult.id),
            resolution: "Fixed",
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(output);
        expect(parsed.status).toBe("resolved");
    });

    it("resolve action returns exitCode 1 without id", async () => {
        const result = await executeFrictionCommand({
            action: "resolve",
            resolution: "Fixed",
        });

        expect(result.exitCode).toBe(1);
    });

    it("resolve action returns exitCode 1 with non-numeric id", async () => {
        const result = await executeFrictionCommand({
            action: "resolve",
            id: "abc",
            resolution: "Fixed",
        });

        expect(result.exitCode).toBe(1);
    });
});
