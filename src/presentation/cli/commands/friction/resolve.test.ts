/**
 * Friction Resolve Handler Tests
 *
 * Tests the friction resolve action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction resolve action", () => {
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
