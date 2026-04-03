/**
 * Friction List Handler Tests
 *
 * Tests the friction list action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction list action", () => {
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

    it("list action returns exitCode 0", async () => {
        const result = await executeFrictionCommand({
            action: "list",
        });

        expect(result.exitCode).toBe(0);
    });

    it("list action with --all returns exitCode 0", async () => {
        const result = await executeFrictionCommand({
            action: "list",
            all: true,
        });

        expect(result.exitCode).toBe(0);
    });

    it("list action with JSON output", async () => {
        // Log an entry first
        await executeFrictionCommand({
            action: "log",
            description: "Entry for list test",
        });
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "list",
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
    });
});
