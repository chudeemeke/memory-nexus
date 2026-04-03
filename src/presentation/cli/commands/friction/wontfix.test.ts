/**
 * Friction Won't-Fix Handler Tests
 *
 * Tests the friction wont-fix action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction wont-fix action", () => {
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
