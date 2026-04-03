/**
 * Friction Purge Handler Tests
 *
 * Tests the friction purge action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction purge action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
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
