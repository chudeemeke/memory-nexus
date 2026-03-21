/**
 * Friction Dashboard Formatter Tests
 *
 * Tests for de-branded title, By Tool chart, and pattern alerts
 * in both terminal and HTML formatters.
 */

import { describe, expect, it } from "bun:test";
import {
    formatFrictionDashboard,
    generateFrictionHtml,
} from "../../../../src/presentation/cli/formatters/friction-dashboard.js";
import { FrictionEntry } from "../../../../src/domain/entities/friction-entry.js";
import type { FrictionStats, FrictionPattern } from "../../../../src/domain/ports/repositories.js";

function makeStats(overrides?: Partial<FrictionStats>): FrictionStats {
    return {
        total: 10,
        open: 5,
        resolved: 4,
        wontFix: 1,
        bySeverity: { critical: 1, high: 2, medium: 5, low: 2 },
        byCategory: { cli: 4, search: 3, sync: 2, ux: 1 },
        byTool: { aidev: 5, memory: 3, gsd: 2 },
        meanTimeToResolve: 3.5,
        oldestOpen: { id: 1, description: "old item", daysOpen: 10 },
        ...overrides,
    };
}

function makeEntry(overrides?: Record<string, unknown>): FrictionEntry {
    return FrictionEntry.create({
        description: "test entry",
        severity: "medium",
        category: "cli",
        tool: "memory",
        status: "open",
        loggedAt: new Date(),
        ...overrides,
    });
}

function makePattern(overrides?: Partial<FrictionPattern>): FrictionPattern {
    return {
        tool: "aidev",
        category: "cli",
        count: 4,
        entries: [makeEntry(), makeEntry(), makeEntry(), makeEntry()],
        ...overrides,
    };
}

const emptyTrends: Array<{ week: string; newCount: number; resolvedCount: number }> = [];

describe("formatFrictionDashboard (terminal)", () => {
    it("title is 'Friction Dashboard' not 'Memory Friction Dashboard'", () => {
        const stats = makeStats();
        const output = formatFrictionDashboard(stats, emptyTrends, [], false);
        expect(output).toContain("Friction Dashboard");
        expect(output).not.toContain("Memory Friction Dashboard");
    });

    it("includes By Tool section with tool counts", () => {
        const stats = makeStats({ byTool: { aidev: 5, memory: 3 } });
        const output = formatFrictionDashboard(stats, emptyTrends, [], false);
        expect(output).toContain("By Tool");
        expect(output).toContain("aidev");
        expect(output).toMatch(/aidev.*5/);
        expect(output).toContain("memory");
        expect(output).toMatch(/memory.*3/);
    });

    it("includes pattern alerts when patterns provided", () => {
        const stats = makeStats();
        const patterns = [makePattern({ tool: "aidev", category: "cli", count: 4 })];
        const output = formatFrictionDashboard(stats, emptyTrends, [], false, patterns);
        expect(output).toContain("Pattern detected: 4 open entries for aidev/cli");
    });

    it("omits pattern alerts when no patterns", () => {
        const stats = makeStats();
        const output = formatFrictionDashboard(stats, emptyTrends, [], false, []);
        expect(output).not.toContain("Pattern detected");
    });

    it("omits pattern alerts when patterns undefined", () => {
        const stats = makeStats();
        const output = formatFrictionDashboard(stats, emptyTrends, [], false);
        expect(output).not.toContain("Pattern detected");
    });

    it("iterates byCategory dynamically", () => {
        const stats = makeStats({ byCategory: { api: 2, deployment: 1 } });
        const output = formatFrictionDashboard(stats, emptyTrends, [], false);
        expect(output).toContain("api");
        expect(output).toContain("deployment");
    });
});

describe("generateFrictionHtml", () => {
    it("title is 'Friction Dashboard' not 'Memory Friction Dashboard'", () => {
        const stats = makeStats();
        const html = generateFrictionHtml(stats, emptyTrends, []);
        expect(html).toContain("<title>Friction Dashboard</title>");
        expect(html).toContain(">Friction Dashboard</h1>");
        expect(html).not.toContain("Memory Friction Dashboard");
    });

    it("includes By Tool donut chart", () => {
        const stats = makeStats({ byTool: { aidev: 5, memory: 3 } });
        const html = generateFrictionHtml(stats, emptyTrends, []);
        expect(html).toContain("byToolChart");
        expect(html).toContain("By Tool");
    });

    it("includes pattern alert section when patterns provided", () => {
        const stats = makeStats();
        const patterns = [makePattern({ tool: "aidev", category: "cli", count: 4 })];
        const html = generateFrictionHtml(stats, emptyTrends, [], patterns);
        expect(html).toContain("Pattern Alerts");
        expect(html).toContain("Pattern detected: 4 open entries for aidev/cli");
    });

    it("omits pattern section when no patterns", () => {
        const stats = makeStats();
        const html = generateFrictionHtml(stats, emptyTrends, [], []);
        expect(html).not.toContain("Pattern Alerts");
        expect(html).not.toContain("Pattern detected");
    });
});
