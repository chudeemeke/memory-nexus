/**
 * Friction Command Tests
 *
 * Tests the CLI friction command handler and executeFrictionCommand.
 * Uses real in-memory database for integration-style tests.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { Command } from "commander";
import {
    createFrictionCommand,
    executeFrictionCommand,
} from "./friction.js";

describe("Friction Command", () => {
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

    describe("createFrictionCommand", () => {
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
    });

    describe("executeFrictionCommand", () => {
        it("log action returns exitCode 0", async () => {
            const result = await executeFrictionCommand({
                action: "log",
                description: "Test friction entry",
                severity: "high",
                category: "search",
            });

            expect(result.exitCode).toBe(0);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("Logged friction #")
            );
        });

        it("log action with JSON output", async () => {
            const result = await executeFrictionCommand({
                action: "log",
                description: "JSON friction entry",
                severity: "low",
                category: "sync",
                json: true,
            });

            expect(result.exitCode).toBe(0);
            const output = consoleLogSpy.mock.calls[0][0] as string;
            const parsed = JSON.parse(output);
            expect(parsed.description).toBe("JSON friction entry");
            expect(parsed.severity).toBe("low");
            expect(parsed.category).toBe("sync");
            expect(parsed.id).toBeDefined();
        });

        it("log action returns exitCode 1 without description", async () => {
            const result = await executeFrictionCommand({
                action: "log",
            });

            expect(result.exitCode).toBe(1);
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
            expect(Array.isArray(parsed)).toBe(true);
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

        it("dashboard action returns exitCode 0 with rich output", async () => {
            // Prior tests log entries, so dashboard renders full output
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
            });

            expect(result.exitCode).toBe(0);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("Dashboard written to")
            );
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

        it("wont-fix action returns exitCode 1 without id", async () => {
            const result = await executeFrictionCommand({
                action: "wont-fix",
                resolution: "By design",
            });

            expect(result.exitCode).toBe(1);
        });
    });
});
