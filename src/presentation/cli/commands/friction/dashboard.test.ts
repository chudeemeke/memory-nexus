/**
 * Friction Dashboard Handler Tests
 *
 * Tests the friction dashboard action via executeFrictionCommand.
 * Uses an isolated temp database per test so the dashboard action
 * does not depend on the user's real friction state.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeFrictionCommand } from "./index.js";
import { initializeDatabase, closeDatabase } from "../../../../infrastructure/database/index.js";

describe("friction dashboard action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let dbPath: string;

    beforeEach(async () => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "friction-dashboard-test-"));
        dbPath = join(tempDir, "test.db");
        // Initialize empty schema so dashboard queries succeed
        const { db } = initializeDatabase({ path: dbPath });
        closeDatabase(db);

        // Seed a friction entry so the dashboard has data to render.
        // Empty DB triggers an "no entries" branch that the rich-output
        // assertions don't apply to.
        await executeFrictionCommand({
            action: "log",
            description: "test seed entry",
            severity: "low",
            category: "cli",
            source: "test",
        }, { dbPath });
        // Reset the spy so dashboard tests see only the dashboard's output
        consoleLogSpy.mockClear();
        consoleErrorSpy.mockClear();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows file locking */ }
    });

    it("dashboard action returns exitCode 0 with rich output", async () => {
        const result = await executeFrictionCommand({
            action: "dashboard",
        }, { dbPath });

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
        }, { dbPath });

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
        }, { dbPath, openInBrowser: () => {} });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining("Dashboard written to")
        );
    });
});
