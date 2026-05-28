/**
 * Friction Command Structure Tests
 *
 * Tests the createFrictionCommand Commander.js command registration.
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { Command } from "commander";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrictionCommand, executeFrictionCommand } from "./index.js";

describe("createFrictionCommand", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            try {
                rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
            } catch {
                // Best-effort cleanup for Windows SQLite handles.
            }
        }
    });

    it("returns a Command instance", () => {
        const command = createFrictionCommand();
        expect(command).toBeInstanceOf(Command);
    });

    it("has name 'friction'", () => {
        const command = createFrictionCommand();
        expect(command.name()).toBe("friction");
    });

    it("has description", () => {
        const command = createFrictionCommand();
        expect(command.description()).toContain("friction");
    });

    it("has log subcommand", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "log"
        );
        expect(sub).toBeDefined();
    });

    it("has list subcommand", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "list"
        );
        expect(sub).toBeDefined();
    });

    it("has resolve subcommand", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "resolve"
        );
        expect(sub).toBeDefined();
    });

    it("has wont-fix subcommand", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "wont-fix"
        );
        expect(sub).toBeDefined();
    });

    it("has dashboard subcommand", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "dashboard"
        );
        expect(sub).toBeDefined();
    });

    it("log subcommand has --json option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "log"
        );
        const jsonOption = sub?.options.find(
            (o: { long?: string }) => o.long === "--json"
        );
        expect(jsonOption).toBeDefined();
    });

    it("list subcommand has --json option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "list"
        );
        const jsonOption = sub?.options.find(
            (o: { long?: string }) => o.long === "--json"
        );
        expect(jsonOption).toBeDefined();
    });

    it("resolve subcommand has --json option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "resolve"
        );
        const jsonOption = sub?.options.find(
            (o: { long?: string }) => o.long === "--json"
        );
        expect(jsonOption).toBeDefined();
    });

    it("wont-fix subcommand has --json option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "wont-fix"
        );
        const jsonOption = sub?.options.find(
            (o: { long?: string }) => o.long === "--json"
        );
        expect(jsonOption).toBeDefined();
    });

    it("dashboard subcommand has --json option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "dashboard"
        );
        const jsonOption = sub?.options.find(
            (o: { long?: string }) => o.long === "--json"
        );
        expect(jsonOption).toBeDefined();
    });

    it("has --format option on parent command with default and ai choice", () => {
        const command = createFrictionCommand();
        const formatOpt = command.options.find(
            (o: { long?: string }) => o.long === "--format"
        );
        expect(formatOpt).toBeDefined();
        expect(formatOpt?.argChoices).toContain("default");
        expect(formatOpt?.argChoices).toContain("ai");
        expect(formatOpt?.defaultValue).toBe("default");
    });

    it("log subcommand has --severity option with default", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "log"
        );
        const opt = sub?.options.find(
            (o: { long?: string }) => o.long === "--severity"
        );
        expect(opt).toBeDefined();
        expect(opt?.defaultValue).toBe("medium");
    });

    it("log subcommand has --category option with default", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "log"
        );
        const opt = sub?.options.find(
            (o: { long?: string }) => o.long === "--category"
        );
        expect(opt).toBeDefined();
        expect(opt?.defaultValue).toBe("cli");
    });

    it("list subcommand has --all option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "list"
        );
        const opt = sub?.options.find(
            (o: { long?: string }) => o.long === "--all"
        );
        expect(opt).toBeDefined();
    });

    it("resolve subcommand has required --resolution option", () => {
        const command = createFrictionCommand();
        const sub = command.commands.find(
            (c: Command) => c.name() === "resolve"
        );
        const opt = sub?.options.find(
            (o: { long?: string }) => o.long === "--resolution"
        );
        expect(opt).toBeDefined();
        expect(opt?.required).toBe(true);
    });

    it("executeFrictionCommand reports unknown actions through command result", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "memory-friction-index-"));
        tempDirs.push(tempDir);
        const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

        try {
            const result = await executeFrictionCommand(
                { action: "unknown" } as any,
                { dbPath: join(tempDir, "memory.db") },
            );

            expect(result.exitCode).toBe(1);
            expect(consoleSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"))
                .toContain("Unknown friction action: unknown");
        } finally {
            consoleSpy.mockRestore();
        }
    });

    it("executeFrictionCommand formats database initialization failures as JSON", async () => {
        const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
        const invalidPath = process.platform === "win32"
            ? "NUL/cannot/create/friction.db"
            : "/dev/null/cannot/create/friction.db";

        try {
            const result = await executeFrictionCommand(
                { action: "list", json: true } as any,
                { dbPath: invalidPath },
            );

            expect(result.exitCode).toBe(1);
            const output = JSON.parse(consoleSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n"));
            expect(output.error.code).toBe("DB_CONNECTION_FAILED");
        } finally {
            consoleSpy.mockRestore();
        }
    });
});
