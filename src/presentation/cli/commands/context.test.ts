/**
 * Context Command Tests
 *
 * Tests for the context CLI command handler structure and option parsing.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createContextCommand, executeContextCommand } from "./context.js";
import { ErrorCode } from "../../../domain/errors/index.js";

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

  it("should have ai as choice", () => {
    const cmd = createContextCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("ai");
  });

  it("should default to brief", () => {
    const cmd = createContextCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.defaultValue).toBe("brief");
  });
});

describe("Context Command --budget option", () => {
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("should have --budget option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--budget");
    expect(option).toBeDefined();
    expect(option?.flags).toContain("<tokens>");
  });

  it("should parse valid budget value", () => {
    const cmd = createContextCommand();
    const budgetOpt = cmd.options.find((o) => o.long === "--budget") as OptionWithParseArg | undefined;
    const parser = budgetOpt?.parseArg;
    expect(parser).toBeDefined();

    const result = parser?.("1500", undefined);
    expect(result).toBe(1500);
  });

  it("should reject non-numeric budget value", () => {
    const cmd = createContextCommand();
    const budgetOpt = cmd.options.find((o) => o.long === "--budget") as OptionWithParseArg | undefined;
    const parser = budgetOpt?.parseArg;

    expect(() => parser?.("abc", undefined)).toThrow("Budget must be a positive number");
  });
});

describe("Context Command --cross-project option", () => {
  it("should have --cross-project option", () => {
    const cmd = createContextCommand();
    const option = cmd.options.find((o) => o.long === "--cross-project");
    expect(option).toBeDefined();
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

describe("executeContextCommand error handling", () => {
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

  it("sets exit code 1 when project not found", async () => {
    // Non-existent project should trigger not found
    const result = await executeContextCommand("nonexistent-project-xyz", {});

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("uses consistent exit code 1 for errors", async () => {
    const result = await executeContextCommand("nonexistent-project", {});

    expect(result.exitCode).toBe(1);
  });

  it("outputs JSON error when --json flag is set", async () => {
    const result = await executeContextCommand("nonexistent-project", { json: true });

    expect(result.exitCode).toBe(1);
    // JSON errors go to console.log for structured output
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it("returns exit code 1 for nonexistent project with --format ai", async () => {
    const result = await executeContextCommand("nonexistent-project-xyz", { format: "ai" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("returns exit code 1 for nonexistent project with --budget", async () => {
    const result = await executeContextCommand("nonexistent-project-xyz", { budget: 1500 });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("returns exit code 1 for nonexistent project with --cross-project", async () => {
    const result = await executeContextCommand("nonexistent-project-xyz", { crossProject: true });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("existing --format brief still works (no regression)", async () => {
    const result = await executeContextCommand("nonexistent-project-xyz", { format: "brief" });

    expect(result.exitCode).toBe(1);
    // Brief format - project not found message goes to stderr
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("existing --format detailed still works (no regression)", async () => {
    const result = await executeContextCommand("nonexistent-project-xyz", { format: "detailed" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
