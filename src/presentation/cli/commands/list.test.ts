/**
 * List Command Tests
 *
 * Tests for CLI list command structure and option parsing.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createListCommand, executeListCommand } from "./list.js";
import {
  initializeDatabase,
  closeDatabase,
} from "../../../infrastructure/database/index.js";
import { ErrorCode } from "../../../domain/errors/index.js";

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

  it("should have --format option with default and ai choice", () => {
    const command = createListCommand();
    const options = command.options;

    const formatOpt = options.find(o => o.long === "--format");
    expect(formatOpt).toBeDefined();
    expect(formatOpt?.argChoices).toContain("default");
    expect(formatOpt?.argChoices).toContain("ai");
    expect(formatOpt?.defaultValue).toBe("default");
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

describe("executeListCommand error handling", () => {
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

  it("returns exit code 1 for invalid limit", async () => {
    const result = await executeListCommand({ limit: "invalid" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Limit must be a positive number"
    );
  });

  it("returns exit code 1 for negative limit", async () => {
    const result = await executeListCommand({ limit: "-5" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Limit must be a positive number"
    );
  });

  it("returns exit code 1 for zero limit", async () => {
    const result = await executeListCommand({ limit: "0" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Limit must be a positive number"
    );
  });

  it("outputs JSON error envelope when --json flag is set with invalid limit (Plan 32-02 HIGH-2)", async () => {
    // Plan 32-02: validation errors in --json mode emit envelope to stdout
    // (not text to stderr). CLI-02 industry pattern (gh, kubectl).
    const result = await executeListCommand({ limit: "invalid", json: true });

    expect(result.exitCode).toBe(1);
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = (consoleLogSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.schema_version).toBe("1");
    expect(parsed.command).toBe("list");
    expect(parsed.error).toBeDefined();
  });

  it("returns consistent exit code 1 for all error types", async () => {
    // Invalid negative limit should return exit code 1
    const result = await executeListCommand({ limit: "-10" });

    expect(result.exitCode).toBe(1);
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

describe("executeListCommand date parsing", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it("handles invalid --since date", async () => {
    const result = await executeListCommand({ since: "not-a-real-date-at-all" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("handles invalid --before date", async () => {
    const result = await executeListCommand({ before: "not-a-real-date-at-all" });

    expect(result.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

describe("list: CLI-03: --format normalization (Phase 32)", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let cli03TempDir: string;
  let cli03DbPath: string;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    cli03TempDir = mkdtempSync(join(tmpdir(), "list-cli03-"));
    cli03DbPath = join(cli03TempDir, "test.db");
    const { db } = initializeDatabase({ path: cli03DbPath });
    closeDatabase(db);
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    try { rmSync(cli03TempDir, { recursive: true, force: true }); } catch {}
  });

  // 1, 2, 3: choices include brief, ai, default (deprecated alias parity per MEDIUM-2)
  it("accepts 'brief' in --format choices", () => {
    const cmd = createListCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("brief");
  });

  it("accepts 'ai' in --format choices", () => {
    const cmd = createListCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("ai");
  });

  it("retains 'default' as deprecated alias in --format choices (MEDIUM-2)", () => {
    const cmd = createListCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.argChoices).toContain("default");
  });

  it("does not set defaultValue on --format (undefined = no-flag default)", () => {
    const cmd = createListCommand();
    const formatOpt = cmd.options.find((o) => o.long === "--format");
    expect(formatOpt?.defaultValue).toBeUndefined();
  });

  // 6: --format brief produces empty-state for empty DB (no headers)
  it("emits condensed brief output (empty DB)", async () => {
    await executeListCommand(
      { format: "brief" as unknown as "default" | "ai" },
      { dbPath: cli03DbPath }
    );
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    // Brief output: empty-state message (no "Sessions (N results):" header)
    expect(out).not.toContain("Sessions (");
  });

  // 7: no flag = backward-compat
  it("no --format flag preserves existing default text output", async () => {
    await executeListCommand({}, { dbPath: cli03DbPath });
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    // Default mode shows empty-state hint
    expect(out).toContain("No sessions found");
  });

  // 8: --format ai = no ANSI codes
  it("--format ai emits ANSI-stripped output", async () => {
    await executeListCommand({ format: "ai" }, { dbPath: cli03DbPath });
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(/\x1b\[/.test(out)).toBe(false);
  });

  // 9: --json --format ai precedence regression
  it("--json --format ai emits envelope (formatForAi NOT applied)", async () => {
    await executeListCommand(
      { json: true, format: "ai" },
      { dbPath: cli03DbPath }
    );
    const out = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.schema_version).toBe("1");
    expect(parsed.command).toBe("list");
    expect(parsed.kind).toBe("session");
  });

  // 10: --format default emits deprecation warning to stderr
  it("--format default emits deprecation warning to stderr", async () => {
    await executeListCommand(
      { format: "default" as unknown as "default" | "ai" },
      { dbPath: cli03DbPath }
    );
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).toContain("deprecated");
  });

  // 11: --format default --json suppresses deprecation warning
  it("--format default --json suppresses deprecation warning", async () => {
    await executeListCommand(
      { format: "default" as unknown as "default" | "ai", json: true },
      { dbPath: cli03DbPath }
    );
    const err = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(err).not.toContain("deprecated");
  });
});
