/**
 * List Command Tests
 *
 * Tests for CLI list command structure and option parsing.
 */

import { describe, it, expect } from "bun:test";
import { createListCommand } from "./list.js";

describe("createListCommand", () => {
  it("should create a command named 'list'", () => {
    const command = createListCommand();
    expect(command.name()).toBe("list");
  });

  it("should have description", () => {
    const command = createListCommand();
    expect(command.description()).toBe("List sessions");
  });

  it("should have --limit option with default of 20", () => {
    const command = createListCommand();
    const options = command.options;

    const limitOpt = options.find(o => o.long === "--limit");
    expect(limitOpt).toBeDefined();
    expect(limitOpt?.defaultValue).toBe("20");
  });

  it("should have --project option", () => {
    const command = createListCommand();
    const options = command.options;

    const projectOpt = options.find(o => o.long === "--project");
    expect(projectOpt).toBeDefined();
    expect(projectOpt?.short).toBe("-p");
  });

  it("should have --since option", () => {
    const command = createListCommand();
    const options = command.options;

    const sinceOpt = options.find(o => o.long === "--since");
    expect(sinceOpt).toBeDefined();
  });

  it("should have --before option", () => {
    const command = createListCommand();
    const options = command.options;

    const beforeOpt = options.find(o => o.long === "--before");
    expect(beforeOpt).toBeDefined();
  });

  it("should have --days option", () => {
    const command = createListCommand();
    const options = command.options;

    const daysOpt = options.find(o => o.long === "--days");
    expect(daysOpt).toBeDefined();
  });

  it("should have --json option", () => {
    const command = createListCommand();
    const options = command.options;

    const jsonOpt = options.find(o => o.long === "--json");
    expect(jsonOpt).toBeDefined();
  });

  it("should have --verbose option with short -v", () => {
    const command = createListCommand();
    const options = command.options;

    const verboseOpt = options.find(o => o.long === "--verbose");
    expect(verboseOpt).toBeDefined();
    expect(verboseOpt?.short).toBe("-v");
  });

  it("should have --quiet option with short -q", () => {
    const command = createListCommand();
    const options = command.options;

    const quietOpt = options.find(o => o.long === "--quiet");
    expect(quietOpt).toBeDefined();
    expect(quietOpt?.short).toBe("-q");
  });
});

describe("list command option conflicts", () => {
  it("should configure --days to conflict with --since", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days");

    // Commander stores conflicts as array
    expect(daysOpt?.conflictsWith).toContain("since");
  });

  it("should configure --days to conflict with --before", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days");

    expect(daysOpt?.conflictsWith).toContain("before");
  });

  it("should configure --verbose to conflict with --quiet", () => {
    const command = createListCommand();
    const verboseOpt = command.options.find(o => o.long === "--verbose");

    expect(verboseOpt?.conflictsWith).toContain("quiet");
  });

  it("should configure --quiet to conflict with --verbose", () => {
    const command = createListCommand();
    const quietOpt = command.options.find(o => o.long === "--quiet");

    expect(quietOpt?.conflictsWith).toContain("verbose");
  });
});

describe("list command --days validation", () => {
  // Access Commander.js internal parseArg property for testing
  type OptionWithParseArg = { parseArg?: (value: string, previous: unknown) => unknown };

  it("should parse valid days value", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days") as OptionWithParseArg | undefined;

    // Access the parseArg function (Commander.js internal name)
    const parser = daysOpt?.parseArg;
    expect(parser).toBeDefined();

    // Test valid input
    const result = parser?.("7", undefined);
    expect(result).toBe(7);
  });

  it("should reject non-numeric days value", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("abc", undefined)).toThrow("Days must be a positive number");
  });

  it("should reject zero days value", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("0", undefined)).toThrow("Days must be a positive number");
  });

  it("should reject negative days value", () => {
    const command = createListCommand();
    const daysOpt = command.options.find(o => o.long === "--days") as OptionWithParseArg | undefined;
    const parser = daysOpt?.parseArg;

    expect(() => parser?.("-5", undefined)).toThrow("Days must be a positive number");
  });
});
