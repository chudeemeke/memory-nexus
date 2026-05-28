/**
 * Friction Purge Handler Tests
 *
 * Tests the friction purge action via executeFrictionCommand.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { executeFrictionCommand } from "./index.js";
import { handlePurge } from "./purge.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FrictionService } from "../../../../application/services/friction-service.js";

describe("friction purge action", () => {
    let consoleLogSpy: ReturnType<typeof spyOn>;
    let consoleErrorSpy: ReturnType<typeof spyOn>;
    let tempDir: string;
    let oldXdgData: string | undefined;
    let oldXdgConfig: string | undefined;

    beforeEach(() => {
        consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
        consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

        tempDir = mkdtempSync(join(tmpdir(), "memory-status-purge-test-"));
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

    it("purge without --force requires --dry-run or --force", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
            pattern: "Some entry",
        });

        expect(result.exitCode).toBe(1);
        const errorCalls = consoleErrorSpy.mock.calls.map((c: any[]) => c[0]);
        const hintLine = errorCalls.find((s: string) =>
            typeof s === "string" && s.includes("--force")
        );
        expect(hintLine).toBeDefined();
    });

    it("purge returns exitCode 1 without pattern", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
        });

        expect(result.exitCode).toBe(1);
    });

    it("purge with --force on non-matching pattern reports zero", async () => {
        const result = await executeFrictionCommand({
            action: "purge",
            pattern: "zzz_nonexistent_pattern_zzz",
            force: true,
        });

        expect(result.exitCode).toBe(0);
        const logCalls = consoleLogSpy.mock.calls.map((c: any[]) => c[0]);
        const noMatchLine = logCalls.find((s: string) =>
            typeof s === "string" && s.includes("No entries match")
        );
        expect(noMatchLine).toBeDefined();
    });

    it("dry-run outputs JSON when no entries match", async () => {
        const service = {
            list: async () => [],
        } as unknown as FrictionService;

        const result = await handlePurge(service, {
            action: "purge",
            pattern: "missing%",
            dryRun: true,
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        expect(parsed).toEqual({ wouldDelete: 0, pattern: "missing%" });
    });

    it("dry-run lists matching entries and caps preview after ten rows", async () => {
        const entries = Array.from({ length: 12 }, (_, index) => ({
            id: index + 1,
            description: `cleanup target ${index + 1}`,
        }));
        const service = {
            list: async () => entries,
        } as unknown as FrictionService;

        const result = await handlePurge(service, {
            action: "purge",
            pattern: "cleanup target %",
            dryRun: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain("Would delete 12 entries");
        expect(output).toContain("#1: cleanup target 1");
        expect(output).toContain("... and 2 more");
    });

    it("dry-run outputs JSON match counts", async () => {
        const service = {
            list: async () => [
                { id: 1, description: "provider timeout" },
                { id: 2, description: "provider retry" },
            ],
        } as unknown as FrictionService;

        const result = await handlePurge(service, {
            action: "purge",
            pattern: "provider %",
            dryRun: true,
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        expect(parsed).toEqual({ wouldDelete: 2, pattern: "provider %" });
    });

    it("force purge reports JSON deleted count", async () => {
        const service = {
            purge: async () => 3,
        } as unknown as FrictionService;

        const result = await handlePurge(service, {
            action: "purge",
            pattern: "old%",
            force: true,
            json: true,
        });

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
        expect(parsed).toEqual({ deleted: 3, pattern: "old%" });
    });

    it("force purge reports nonzero text deletion count", async () => {
        const service = {
            purge: async () => 2,
        } as unknown as FrictionService;

        const result = await handlePurge(service, {
            action: "purge",
            pattern: "stale%",
            force: true,
        });

        expect(result.exitCode).toBe(0);
        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
        expect(output).toContain('Purged 2 friction entries matching "stale%"');
    });
});
