/**
 * Friction List Handler Tests
 *
 * Tests the friction list action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";
import { handleList } from "./list.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FrictionEntry } from "../../../../domain/entities/friction-entry.js";

describe("friction list action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let oldXdgData: string | undefined;
    let oldXdgConfig: string | undefined;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "memory-status-list-test-"));
        oldXdgData = process.env.XDG_DATA_HOME;
        oldXdgConfig = process.env.XDG_CONFIG_HOME;
        process.env.XDG_DATA_HOME = join(tempDir, "data");
        process.env.XDG_CONFIG_HOME = join(tempDir, "config");
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();

        if (oldXdgData !== undefined) {
            process.env.XDG_DATA_HOME = oldXdgData;
        } else {
            delete process.env.XDG_DATA_HOME;
        }
        if (oldXdgConfig !== undefined) {
            process.env.XDG_CONFIG_HOME = oldXdgConfig;
        } else {
            delete process.env.XDG_CONFIG_HOME;
        }

        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {}
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
        expect(parsed.schema_version).toBe("1");
        expect(parsed.command).toBe("friction");
        expect(parsed.kind).toBe("friction");
        expect(parsed.meta.count).toBe(1);
        expect(Array.isArray(parsed.data)).toBe(true);
        expect(parsed.data[0].description).toBe("Entry for list test");
    });

    it("filters list output through the durable JSON contract", async () => {
        await executeFrictionCommand({
            action: "log",
            description: "Retry failed after shell output",
            severity: "high",
            category: "sync",
            tool: "memory",
            source: "conversations",
            context: "Windows path escaped",
        });
        await executeFrictionCommand({
            action: "log",
            description: "Retry failed after shell output",
            severity: "medium",
            category: "sync",
            tool: "memory",
            source: "conversations",
            context: "Windows path escaped",
        });
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "list",
            json: true,
            severity: "high",
            category: "sync",
            tool: "memory",
            project: "conversations",
            descriptionContains: "retry failed",
            contextContains: "WINDOWS PATH",
        } as any);

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"));
        expect(parsed.meta.count).toBe(1);
        expect(parsed.meta.filters_applied).toContain("severity:high");
        expect(parsed.meta.filters_applied).toContain("project:conversations");
        expect(parsed.data).toHaveLength(1);
        expect(parsed.data[0].severity).toBe("high");
    });

    it("count mode returns only count and redacted filter fingerprints", async () => {
        await executeFrictionCommand({
            action: "log",
            description: "Sensitive marker alpha-never-echo should match",
            tool: "memory",
            context: "Context marker beta-never-echo should match",
        });
        consoleLogSpy.mockClear();

        const result = await executeFrictionCommand({
            action: "list",
            json: true,
            count: true,
            descriptionContains: "alpha-never-echo",
            contextContains: "beta-never-echo",
        } as any);

        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        const parsed = JSON.parse(output);
        expect(result.exitCode).toBe(0);
        expect(parsed.data).toEqual({ count: 1 });
        expect(parsed.meta.filters_applied.join(" ")).toMatch(/description_contains:\[redacted:[a-f0-9]{8}\]/);
        expect(parsed.meta.filters_applied.join(" ")).toMatch(/context_contains:\[redacted:[a-f0-9]{8}\]/);
        expect(output).not.toContain("alpha-never-echo");
        expect(output).not.toContain("beta-never-echo");
    });

    it("min threshold uses durable count exit codes", async () => {
        await executeFrictionCommand({
            action: "log",
            description: "Threshold entry",
            tool: "memory",
        });
        consoleLogSpy.mockClear();

        const unmet = await executeFrictionCommand({
            action: "list",
            count: true,
            min: "2",
            tool: "memory",
        } as any);
        expect(unmet.exitCode).toBe(1);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n")).toBe("1");

        consoleLogSpy.mockClear();
        const met = await executeFrictionCommand({
            action: "list",
            count: true,
            min: "1",
            tool: "memory",
        } as any);
        expect(met.exitCode).toBe(0);
        expect(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n")).toBe("1");
    });

    it("invalid list arguments return exit code 2 without echoing contains filters", async () => {
        const result = await executeFrictionCommand({
            action: "list",
            json: true,
            min: "0",
            descriptionContains: "do-not-echo-this",
        } as any);

        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        const parsed = JSON.parse(output);
        expect(result.exitCode).toBe(2);
        expect(parsed.error.code).toBe("INVALID_ARGUMENT");
        expect(output).not.toContain("do-not-echo-this");
    });

    it("renders filtered text list with truncation, reviewed entries, and tool summary", async () => {
        const longDescription = "A".repeat(70);
        await executeFrictionCommand({
            action: "log",
            description: longDescription,
            severity: "high",
            category: "sync",
            tool: "memory",
        });

        consoleLogSpy.mockClear();
        await executeFrictionCommand({
            action: "list",
            tool: "memory",
        });
        const firstOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(firstOutput).toContain("[NEW]");
        expect(firstOutput).toContain("AAA...");
        expect(firstOutput).toContain("1 open entries for memory (1 high)");
        expect(firstOutput).toContain("1 new since last review");

        consoleLogSpy.mockClear();
        await executeFrictionCommand({
            action: "list",
            tool: "memory",
        });
        const reviewedOutput = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(reviewedOutput).not.toContain("[NEW]");
        expect(reviewedOutput).toContain("1 open entries for memory (1 high)");
        expect(reviewedOutput).not.toContain("new since last review");
    }, 15000);

    it("renders aged text entries without a tool filter or new-entry summary", async () => {
        const service = createListService([
            makeEntry({
                loggedAt: new Date("2026-06-01T12:00:00.000Z"),
                lastReviewedAt: new Date("2026-06-02T12:00:00.000Z"),
            }),
        ]);
        const nowSpy = spyOn(Date, "now").mockReturnValue(new Date("2026-06-04T12:00:00.000Z").getTime());

        try {
            const result = await handleList(service as any, { action: "list" } as any);

            expect(result.exitCode).toBe(0);
            const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
            expect(output).toContain("3d");
            expect(output).toContain("1 open entries (1 medium)");
            expect(output).not.toContain("for memory");
            expect(output).not.toContain("new since last review");
            expect(service.markReviewedCalls).toEqual([]);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("validates all durable list argument variants without echoing raw filters", async () => {
        const service = createListService([]);

        const nonJson = await handleList(service as any, {
            action: "list",
            limit: "0",
            descriptionContains: "do-not-echo-limit",
        } as any);
        expect(nonJson.exitCode).toBe(2);
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n")).toContain(
            "Limit must be a positive integer"
        );
        expect(consoleErrorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n")).not.toContain(
            "do-not-echo-limit"
        );

        for (const options of [
            { severity: "urgent", expected: "Severity must be one of" },
            { status: "closed", expected: "Status must be one of" },
            { since: "2026-6-1", expected: "Since must use YYYY-MM-DD" },
            { since: "2026-02-30", expected: "Since must use YYYY-MM-DD" },
        ]) {
            consoleLogSpy.mockClear();
            const result = await handleList(service as any, {
                action: "list",
                json: true,
                descriptionContains: "do-not-echo-json",
                ...options,
            } as any);

            expect(result.exitCode).toBe(2);
            const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
            const parsed = JSON.parse(output);
            expect(parsed.error.code).toBe("INVALID_ARGUMENT");
            expect(parsed.error.message).toContain(options.expected);
            expect(output).not.toContain("do-not-echo-json");
        }
    });

    it("emits JSON metadata for all, status, since, limit, and min threshold filters", async () => {
        const entries = [makeEntry(), makeEntry({ id: 2, severity: "high" })];
        const service = createListService(entries, 2);

        const listResult = await handleList(service as any, {
            action: "list",
            json: true,
            all: true,
            since: "2026-06-01",
            limit: "1",
        } as any);
        expect(listResult.exitCode).toBe(0);
        const listEnvelope = JSON.parse(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"));
        expect(listEnvelope.meta.filters_applied).toContain("status:all");
        expect(listEnvelope.meta.filters_applied).toContain("since:2026-06-01T00:00:00.000Z");
        expect(listEnvelope.meta.limit).toBe(1);
        expect(listEnvelope.meta.returned).toBe(1);

        consoleLogSpy.mockClear();
        const countResult = await handleList(service as any, {
            action: "list",
            json: true,
            count: true,
            status: "resolved",
            min: "3",
        } as any);
        expect(countResult.exitCode).toBe(1);
        const countEnvelope = JSON.parse(consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"));
        expect(countEnvelope.data).toEqual({ count: 2 });
        expect(countEnvelope.meta.filters_applied).toContain("status:resolved");
        expect(countEnvelope.meta.min).toBe(3);
        expect(countEnvelope.meta.threshold_met).toBe(false);
        expect(countEnvelope.meta.returned).toBe(0);
    });
});

function makeEntry(overrides: Partial<FrictionEntry> = {}): FrictionEntry {
    return {
        id: 1,
        description: "A command failed during sync",
        severity: "medium",
        category: "workflow",
        status: "open",
        tool: null,
        sourceProject: null,
        context: null,
        loggedAt: new Date("2026-06-06T08:00:00.000Z"),
        resolvedAt: null,
        resolution: null,
        tags: [],
        lastReviewedAt: null,
        ...overrides,
    };
}

function createListService(entries: FrictionEntry[], totalCount = entries.length) {
    const markReviewedCalls: string[] = [];

    return {
        markReviewedCalls,
        query: async (options: { limit?: number } = {}) => ({
            entries: options.limit === undefined ? entries : entries.slice(0, options.limit),
            totalCount,
        }),
        markReviewed: async (tool: string) => {
            markReviewedCalls.push(tool);
        },
    };
}
