/**
 * Related Command Tests
 *
 * Tests for CLI related command structure and option parsing.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createRelatedCommand, executeRelatedCommand } from "./related.js";
import { ErrorCode } from "../../../domain/errors/index.js";

describe("createRelatedCommand", () => {
  it("should create a command named 'related'", () => {
    const command = createRelatedCommand();
    expect(command.name()).toBe("related");
  });

  it("should have description", () => {
    const command = createRelatedCommand();
    expect(command.description()).toContain("related");
  });

  it("should require an id argument", () => {
    const command = createRelatedCommand();
    // Commander.js registeredArguments stores argument info
    const args = command.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].name()).toBe("id");
    expect(args[0].required).toBe(true);
  });
});

describe("related command options", () => {
  it("should have --limit option with default of 10", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const limitOpt = options.find(o => o.long === "--limit");
    expect(limitOpt).toBeDefined();
    expect(limitOpt?.defaultValue).toBe(10);
  });

  it("should have --hops option with default of 2", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const hopsOpt = options.find(o => o.long === "--hops");
    expect(hopsOpt).toBeDefined();
    expect(hopsOpt?.defaultValue).toBe(2);
  });

  it("should have --type option with choices", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const typeOpt = options.find(o => o.long === "--type");
    expect(typeOpt).toBeDefined();
    expect(typeOpt?.argChoices).toEqual(["session", "message", "topic"]);
    expect(typeOpt?.defaultValue).toBe("session");
  });

  it("should have --format option with choices", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const formatOpt = options.find(o => o.long === "--format");
    expect(formatOpt).toBeDefined();
    expect(formatOpt?.argChoices).toEqual(["brief", "detailed"]);
    expect(formatOpt?.defaultValue).toBe("brief");
  });

  it("should have --json option", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const jsonOpt = options.find(o => o.long === "--json");
    expect(jsonOpt).toBeDefined();
  });

  it("should have --verbose option with short -v", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const verboseOpt = options.find(o => o.long === "--verbose");
    expect(verboseOpt).toBeDefined();
    expect(verboseOpt?.short).toBe("-v");
  });

  it("should have --quiet option with short -q", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const quietOpt = options.find(o => o.long === "--quiet");
    expect(quietOpt).toBeDefined();
    expect(quietOpt?.short).toBe("-q");
  });
});

describe("related command option conflicts", () => {
  it("should configure --verbose to conflict with --quiet", () => {
    const command = createRelatedCommand();
    const verboseOpt = command.options.find(o => o.long === "--verbose");

    expect(verboseOpt?.conflictsWith).toContain("quiet");
  });

  it("should configure --quiet to conflict with --verbose", () => {
    const command = createRelatedCommand();
    const quietOpt = command.options.find(o => o.long === "--quiet");

    expect(quietOpt?.conflictsWith).toContain("verbose");
  });
});

describe("related command --limit validation", () => {
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("should parse valid limit value", () => {
    const command = createRelatedCommand();
    const limitOpt = command.options.find(o => o.long === "--limit") as OptionWithParseArg | undefined;
    const parser = limitOpt?.parseArg;

    expect(parser).toBeDefined();
    const result = parser?.("5", undefined);
    expect(result).toBe(5);
  });

  it("should reject non-numeric limit value", () => {
    const command = createRelatedCommand();
    const limitOpt = command.options.find(o => o.long === "--limit") as OptionWithParseArg | undefined;
    const parser = limitOpt?.parseArg;

    expect(() => parser?.("abc", undefined)).toThrow("Limit must be a positive number");
  });

  it("should reject zero limit value", () => {
    const command = createRelatedCommand();
    const limitOpt = command.options.find(o => o.long === "--limit") as OptionWithParseArg | undefined;
    const parser = limitOpt?.parseArg;

    expect(() => parser?.("0", undefined)).toThrow("Limit must be a positive number");
  });

  it("should reject negative limit value", () => {
    const command = createRelatedCommand();
    const limitOpt = command.options.find(o => o.long === "--limit") as OptionWithParseArg | undefined;
    const parser = limitOpt?.parseArg;

    expect(() => parser?.("-5", undefined)).toThrow("Limit must be a positive number");
  });
});

describe("related command --hops validation", () => {
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("should parse valid hops value", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    expect(parser).toBeDefined();
    const result = parser?.("2", undefined);
    expect(result).toBe(2);
  });

  it("should accept hops value of 1", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    const result = parser?.("1", undefined);
    expect(result).toBe(1);
  });

  it("should accept hops value of 3", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    const result = parser?.("3", undefined);
    expect(result).toBe(3);
  });

  it("should reject hops value of 0", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    expect(() => parser?.("0", undefined)).toThrow("Hops must be 1, 2, or 3");
  });

  it("should reject hops value of 4", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    expect(() => parser?.("4", undefined)).toThrow("Hops must be 1, 2, or 3");
  });

  it("should reject non-numeric hops value", () => {
    const command = createRelatedCommand();
    const hopsOpt = command.options.find(o => o.long === "--hops") as OptionWithParseArg | undefined;
    const parser = hopsOpt?.parseArg;

    expect(() => parser?.("two", undefined)).toThrow("Hops must be 1, 2, or 3");
  });
});

describe("executeRelatedCommand error handling", () => {
  let originalExitCode: number | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("sets exit code 1 when session not found", async () => {
    // Non-existent session ID should trigger not found
    await executeRelatedCommand("nonexistent-session-xyz", {});

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("uses consistent exit code 1 for errors", async () => {
    await executeRelatedCommand("nonexistent-session", {});

    expect(process.exitCode).toBe(1);
  });

  it("outputs JSON error when --json flag is set", async () => {
    await executeRelatedCommand("nonexistent-session", { json: true });

    expect(process.exitCode).toBe(1);
    // JSON errors go to console.log for structured output
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
