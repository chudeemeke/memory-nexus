/**
 * Friction Command Structure Tests
 *
 * Tests the createFrictionCommand Commander.js command registration.
 */

import { describe, expect, it } from "bun:test";
import { Command } from "commander";
import { createFrictionCommand } from "./index.js";

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
});
