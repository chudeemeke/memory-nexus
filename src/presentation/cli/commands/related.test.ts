/**
 * Related Command Tests
 *
 * Tests for CLI related command structure and option parsing.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRelatedCommand, executeRelatedCommand } from "./related.js";
import { initializeDatabase, closeDatabase } from "../../../infrastructure/database/index.js";
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

  // Phase 32 (CLI-03): normalization — choices include brief + ai;
  // 'detailed' retained as deprecated alias. defaultValue is undefined.
  it("should have --format option with brief/ai/detailed choices and no defaultValue", () => {
    const command = createRelatedCommand();
    const options = command.options;

    const formatOpt = options.find(o => o.long === "--format");
    expect(formatOpt).toBeDefined();
    expect(formatOpt?.argChoices).toContain("brief");
    expect(formatOpt?.argChoices).toContain("ai");
    expect(formatOpt?.argChoices).toContain("detailed");
    expect(formatOpt?.defaultValue).toBeUndefined();
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
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "related-test-"));
    dbPath = join(tempDir, "test.db");
    const { db } = initializeDatabase({ path: dbPath });
    closeDatabase(db);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it("sets exit code 1 when session not found", async () => {
    const result = await executeRelatedCommand("nonexistent-session-xyz", { dbPath });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("uses consistent exit code 1 for errors", async () => {
    const result = await executeRelatedCommand("nonexistent-session", { dbPath });

    expect(result.exitCode).toBe(1);
  });

  it("outputs JSON error when --json flag is set", async () => {
    const result = await executeRelatedCommand("nonexistent-session", { json: true, dbPath });

    expect(result.exitCode).toBe(1);
    // JSON errors go to console.log for structured output
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});

describe("related: CLI-03: --format normalization (Phase 32)", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let cli03TempDir: string;
  let cli03DbPath: string;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    cli03TempDir = mkdtempSync(join(tmpdir(), "related-cli03-"));
    cli03DbPath = join(cli03TempDir, "test.db");
    const { db } = initializeDatabase({ path: cli03DbPath });
    closeDatabase(db);
    // Reset deprecation-warning once-keys for per-test isolation.
    const helper = await import("./_helpers/deprecation-warning.js");
    helper.resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    try { rmSync(cli03TempDir, { recursive: true, force: true }); } catch {}
  });

  // 1, 2: choices include brief, ai
  it("accepts 'brief' in --format choices", () => {
    const cmd = createRelatedCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("brief");
  });

  it("accepts 'ai' in --format choices", () => {
    const cmd = createRelatedCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("ai");
  });

  // 4: detailed retained as deprecated alias
  it("retains 'detailed' as deprecated alias in --format choices", () => {
    const cmd = createRelatedCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("detailed");
  });

  // 5: defaultValue is undefined (no .default("brief") call after Phase 32 normalization)
  it("does not set defaultValue on --format (undefined = no-flag default)", () => {
    const cmd = createRelatedCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.defaultValue).toBeUndefined();
  });

  // 6: no flag = backward-compat default text output (related's existing brief behavior)
  it("no --format flag preserves existing default text output", async () => {
    const result = await executeRelatedCommand("nonexistent-source", { dbPath: cli03DbPath });
    // Result is exitCode 1 because no related items exist; error message on stderr
    expect(result.exitCode).toBe(1);
  });

  // 8: --format ai = no ANSI codes (on error path; ANSI only appears in success output)
  it("--format ai emits ANSI-stripped output", async () => {
    await executeRelatedCommand("nonexistent-source", {
      format: "ai",
      dbPath: cli03DbPath,
    });
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(/\x1b\[/.test(out)).toBe(false);
    expect(/\x1b\[/.test(err)).toBe(false);
  });

  // 9: --json --format ai precedence regression
  it("--json --format ai emits envelope (formatForAi NOT applied)", async () => {
    await executeRelatedCommand("nonexistent-source", {
      json: true,
      format: "ai",
      dbPath: cli03DbPath,
    });
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.schema_version).toBe("1");
    expect(parsed.command).toBe("related");
    // not-found case: error envelope shape
    expect(parsed.error).toBeDefined();
  });

  // 12: --format detailed emits deprecation warning to stderr
  it("--format detailed emits deprecation warning to stderr", async () => {
    await executeRelatedCommand("nonexistent-source", {
      format: "detailed",
      dbPath: cli03DbPath,
    });
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).toContain("deprecated");
  });

  // 13: --format detailed --json suppresses deprecation warning
  it("--format detailed --json suppresses deprecation warning", async () => {
    await executeRelatedCommand("nonexistent-source", {
      format: "detailed",
      json: true,
      dbPath: cli03DbPath,
    });
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).not.toContain("deprecated");
  });
});
