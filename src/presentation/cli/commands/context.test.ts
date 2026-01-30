/**
 * Context Command Tests
 *
 * Tests for the context CLI command handler structure and option parsing.
 */

import { describe, it, expect } from "bun:test";
import { createContextCommand } from "./context.js";

describe("createContextCommand", () => {
  it("should create a command named 'context'", () => {
    const cmd = createContextCommand();
    expect(cmd.name()).toBe("context");
  });

  it("should have description", () => {
    const cmd = createContextCommand();
    expect(cmd.description()).toContain("context");
  });

  it("should require project argument", () => {
    const cmd = createContextCommand();
    const args = cmd.registeredArguments;
    expect(args).toHaveLength(1);
    expect(args[0].name()).toBe("project");
    expect(args[0].required).toBe(true);
  });

  it("should have --days option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--days");
    expect(option).toBeDefined();
    expect(option?.flags).toContain("<n>");
  });

  it("should have --format option with choices", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--format");
    expect(option).toBeDefined();
    expect(option?.flags).toContain("<type>");
  });

  it("should have --json option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--json");
    expect(option).toBeDefined();
  });

  it("should have -v/--verbose option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--verbose");
    expect(option).toBeDefined();
    expect(option?.short).toBe("-v");
  });

  it("should have -q/--quiet option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--quiet");
    expect(option).toBeDefined();
    expect(option?.short).toBe("-q");
  });
});

describe("Context Command Option Conflicts", () => {
  it("should configure --verbose to conflict with --quiet", () => {
    const cmd = createContextCommand();
    const verboseOpt = cmd.options.find((o) => o.long === "--verbose");
    expect(verboseOpt?.conflictsWith).toContain("quiet");
  });

  it("should configure --quiet to conflict with --verbose", () => {
    const cmd = createContextCommand();
    const quietOpt = cmd.options.find((o) => o.long === "--quiet");
    expect(quietOpt?.conflictsWith).toContain("verbose");
  });
});

describe("Context Command --days Validation", () => {
  // Access Commander.js internal parseArg property for testing
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("should parse valid days value", () => {
    const cmd = createContextCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;

    const parser = daysOpt?.parseArg;
    expect(parser).toBeDefined();

    const result = parser?.("7", undefined);
    expect(result).toBe(7);
  });

  it("should reject non-numeric days value", () => {
    const cmd = createContextCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("abc", undefined)).toThrow("Days must be a positive number");
  });

  it("should reject zero days value", () => {
    const cmd = createContextCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("0", undefined)).toThrow("Days must be a positive number");
  });

  it("should reject negative days value", () => {
    const cmd = createContextCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("-5", undefined)).toThrow("Days must be a positive number");
  });
});

describe("Context Command --format Choices", () => {
  it("should have brief as choice", () => {
    const cmd = createContextCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("brief");
  });

  it("should have detailed as choice", () => {
    const cmd = createContextCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("detailed");
  });

  it("should default to brief", () => {
    const cmd = createContextCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.defaultValue).toBe("brief");
  });
});

describe("Context Command Registration", () => {
  it("should be addable to parent program", async () => {
    const { Command } = await import("commander");
    const program = new Command();
    const contextCmd = createContextCommand();

    expect(() => {
      program.addCommand(contextCmd);
    }).not.toThrow();
  });

  it("should be findable in parent program", async () => {
    const { Command } = await import("commander");
    const program = new Command();
    program.addCommand(createContextCommand());

    const cmd = program.commands.find((c) => c.name() === "context");
    expect(cmd).toBeDefined();
  });
});
