/**
 * Friction Dashboard Handler Tests
 *
 * Tests the friction dashboard action via executeFrictionCommand.
 * Uses an isolated temp database per test so the dashboard action
 * does not depend on the user's real friction state.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeFrictionCommand } from "./index.js";
import { handleDashboard } from "./dashboard.js";
import { initializeDatabase, closeDatabase } from "../../../../infrastructure/database/index.js";

describe("friction dashboard action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let dbPath: string;
    let originalMemoryHome: string | undefined;

    beforeEach(async () => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "friction-dashboard-test-"));
        dbPath = join(tempDir, "test.db");
        originalMemoryHome = process.env.MEMORY_HOME;
        process.env.MEMORY_HOME = tempDir;
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
        if (originalMemoryHome === undefined) {
            delete process.env.MEMORY_HOME;
        } else {
            process.env.MEMORY_HOME = originalMemoryHome;
        }
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

    it("dashboard action with --html --json writes without logging or opening", async () => {
        let openedPath: string | undefined;

        const result = await handleDashboard(createFakeDashboardService(), {
            action: "dashboard",
            html: true,
            json: true,
        }, (path) => {
            openedPath = path;
        });

        expect(result.exitCode).toBe(0);
        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(openedPath).toBeUndefined();
        expect(existsSync(join(tempDir, "dashboard.html"))).toBe(true);
    });

    it("dashboard action with AI format emits normalized text", async () => {
        const result = await handleDashboard(createFakeDashboardService(), {
            action: "dashboard",
            format: "ai",
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls[0][0] as string;
        expect(output).toBe(output.trim());
        expect(output).toContain("Friction Dashboard");
        expect(output).toContain("Pattern Alerts");
        expect(output).not.toContain("\x1b[");
    });
});

function createFakeDashboardService() {
    return {
        getStats: async () => ({
            total: 3,
            open: 2,
            resolved: 1,
            wontFix: 0,
            bySeverity: { critical: 0, high: 1, medium: 1, low: 1 },
            byCategory: { cli: 3 },
            byTool: { memory: 3 },
            meanTimeToResolve: null,
            oldestOpen: { id: 10, description: "oldest", daysOpen: 5 },
        }),
        getWeeklyTrends: async (weeks: number) => {
            expect(weeks).toBe(12);
            return [{ week: "2026-W20", newCount: 2, resolvedCount: 1 }];
        },
        list: async (options: { tool?: string }) => {
            expect(options).toEqual({});
            return [];
        },
        detectPatterns: async () => [{
            tool: "memory",
            category: "cli",
            count: 3,
            entries: [],
        }],
    } as any;
}
