/**
 * Friction Log Handler Tests
 *
 * Tests the friction log action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction log action", () => {
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

    it("log action returns exitCode 0", async () => {
        const result = await executeFrictionCommand({
            action: "log",
            description: "Test friction entry",
            severity: "high",
            category: "search",
        });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining("Logged friction #")
        );
    });

    it("log action with JSON output", async () => {
        const result = await executeFrictionCommand({
            action: "log",
            description: "JSON friction entry",
            severity: "low",
            category: "sync",
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(output);
        expect(parsed.description).toBe("JSON friction entry");
        expect(parsed.severity).toBe("low");
        expect(parsed.category).toBe("sync");
        expect(parsed.id).toBeDefined();
    });

    it("log action returns exitCode 1 without description", async () => {
        const result = await executeFrictionCommand({
            action: "log",
        });

        expect(result.exitCode).toBe(1);
    });
});
