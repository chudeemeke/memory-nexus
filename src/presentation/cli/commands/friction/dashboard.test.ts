/**
 * Friction Dashboard Handler Tests
 *
 * Tests the friction dashboard action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";

describe("friction dashboard action", () => {
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

    it("dashboard action returns exitCode 0 with rich output", async () => {
        const result = await executeFrictionCommand({
            action: "dashboard",
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        // formatFrictionDashboard output includes these sections
        expect(output).toContain("Friction Dashboard");
        expect(output).toContain("Overview");
        expect(output).toContain("By Severity");
        expect(output).toContain("By Category");
    });

    it("dashboard action with JSON output", async () => {
        const result = await executeFrictionCommand({
            action: "dashboard",
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(output);
        expect(typeof parsed.stats.total).toBe("number");
        expect(typeof parsed.stats.open).toBe("number");
        expect(Array.isArray(parsed.trends)).toBe(true);
    });

    it("dashboard action with --html writes file", async () => {
        const result = await executeFrictionCommand({
            action: "dashboard",
            html: true,
        }, { openInBrowser: () => {} });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining("Dashboard written to")
        );
    });
});
