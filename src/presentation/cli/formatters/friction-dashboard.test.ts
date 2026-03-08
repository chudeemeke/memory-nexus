/**
 * Friction Dashboard Formatter Tests
 *
 * Tests for CLI dashboard formatting and HTML dashboard generation.
 * Uses FrictionStats, FrictionEntry, and weekly trend data.
 */

import { describe, expect, it } from "bun:test";
import { formatFrictionDashboard, generateFrictionHtml } from "./friction-dashboard.js";
import type { FrictionStats } from "../../../domain/ports/repositories.js";
import { FrictionEntry } from "../../../domain/entities/friction-entry.js";

function makeStats(overrides?: Partial<FrictionStats>): FrictionStats {
    return {
        total: 42,
        open: 12,
        resolved: 28,
        wontFix: 2,
        bySeverity: { low: 14, medium: 16, high: 8, critical: 4 },
        byCategory: { search: 12, sync: 8, cli: 10, context: 5, integration: 4, ux: 3 },
        meanTimeToResolve: 3.2,
        oldestOpen: { id: 7, description: "Search fails on unicode", daysOpen: 14 },
        ...overrides,
    };
}

function makeTrends() {
    return [
        { week: "2026-W09", newCount: 5, resolvedCount: 3 },
        { week: "2026-W10", newCount: 3, resolvedCount: 4 },
        { week: "2026-W11", newCount: 2, resolvedCount: 2 },
    ];
}

function makeOpenItems() {
    return [
        FrictionEntry.create({
            id: 7,
            description: "Search fails on unicode",
            severity: "high",
            category: "search",
            status: "open",
            loggedAt: new Date(Date.now() - 14 * 86400000),
        }),
        FrictionEntry.create({
            id: 12,
            description: "Context command too slow",
            severity: "medium",
            category: "context",
            status: "open",
            loggedAt: new Date(Date.now() - 3 * 86400000),
        }),
    ];
}

describe("formatFrictionDashboard", () => {
    it("renders stats summary with correct counts", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("42");
        expect(output).toContain("12");
        expect(output).toContain("28");
        expect(output).toContain("2");
    });

    it("renders severity breakdown", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("critical");
        expect(output).toContain("high");
        expect(output).toContain("medium");
        expect(output).toContain("low");
        expect(output).toContain("4");  // critical count
        expect(output).toContain("8");  // high count
        expect(output).toContain("16"); // medium count
        expect(output).toContain("14"); // low count
    });

    it("renders category breakdown", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("search");
        expect(output).toContain("sync");
        expect(output).toContain("cli");
        expect(output).toContain("context");
        expect(output).toContain("integration");
        expect(output).toContain("ux");
    });

    it("handles empty stats (total=0)", () => {
        const emptyStats = makeStats({
            total: 0,
            open: 0,
            resolved: 0,
            wontFix: 0,
            bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
            byCategory: { search: 0, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
            meanTimeToResolve: null,
            oldestOpen: null,
        });

        const output = formatFrictionDashboard(emptyStats, [], [], false);

        expect(output).toContain("No friction entries logged yet");
    });

    it("renders trends table", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("2026-W09");
        expect(output).toContain("2026-W10");
        expect(output).toContain("2026-W11");
    });

    it("shows MTTR when available", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("3.2");
    });

    it("shows oldest open entry", () => {
        const output = formatFrictionDashboard(makeStats(), makeTrends(), makeOpenItems(), false);

        expect(output).toContain("#7");
        expect(output).toContain("14");
    });

    it("handles no trends data", () => {
        const output = formatFrictionDashboard(makeStats(), [], makeOpenItems(), false);

        expect(output).toContain("No trend data available");
    });

    it("handles no open items", () => {
        const stats = makeStats({ open: 0, oldestOpen: null });
        const output = formatFrictionDashboard(stats, makeTrends(), [], false);

        expect(output).not.toContain("Oldest Open");
    });
});

describe("generateFrictionHtml", () => {
    it("returns valid HTML with DOCTYPE", () => {
        const html = generateFrictionHtml(makeStats(), makeTrends(), makeOpenItems());

        expect(html).toMatch(/^<!DOCTYPE html>/i);
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
    });

    it("embeds Chart.js source inline", () => {
        const html = generateFrictionHtml(makeStats(), makeTrends(), makeOpenItems());

        // Chart.js UMD source contains "Chart" constructor
        expect(html).toContain("Chart");
        // Inline script, no CDN reference
        expect(html).not.toContain("cdn.jsdelivr.net");
        expect(html).not.toContain("cdnjs.cloudflare.com");
    });

    it("uses dark theme (#1a1a2e)", () => {
        const html = generateFrictionHtml(makeStats(), makeTrends(), makeOpenItems());

        expect(html).toContain("#1a1a2e");
    });

    it("includes all 4 canvas elements", () => {
        const html = generateFrictionHtml(makeStats(), makeTrends(), makeOpenItems());

        expect(html).toContain("overTimeChart");
        expect(html).toContain("byCategoryChart");
        expect(html).toContain("bySeverityChart");
        expect(html).toContain("resolutionTrendChart");
    });

    it("includes open items table", () => {
        const html = generateFrictionHtml(makeStats(), makeTrends(), makeOpenItems());

        expect(html).toContain("Open Items");
        expect(html).toContain("Search fails on unicode");
        expect(html).toContain("Context command too slow");
    });

    it("handles empty stats", () => {
        const emptyStats = makeStats({
            total: 0,
            open: 0,
            resolved: 0,
            wontFix: 0,
            bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
            byCategory: { search: 0, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
            meanTimeToResolve: null,
            oldestOpen: null,
        });

        const html = generateFrictionHtml(emptyStats, [], []);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("Memory Friction Dashboard");
    });

    it("serializes stats as JSON in script tag", () => {
        const stats = makeStats();
        const html = generateFrictionHtml(stats, makeTrends(), makeOpenItems());

        // Stats should be serialized as JSON within a script tag
        expect(html).toContain('"total":42');
        expect(html).toContain('"open":12');
    });
});
