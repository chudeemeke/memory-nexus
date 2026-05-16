/**
 * deprecation-warning.test.ts
 *
 * Direct coverage tests for the deprecation-warning helper used by the
 * Phase 32 CLI-03 `--format` alias paths. Validates:
 *   - One-shot emission per command+alias key (memoization)
 *   - JSON suppression
 *   - Test-only reset hook
 *
 * The command-level tests exercise this helper indirectly, but the
 * once-only branch (return when emitted.has(key)) was uncovered until
 * Phase 32 coverage closure. This file pins the branch directly.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  emitFormatDeprecationWarning,
  resetFormatDeprecationWarningsForTesting,
} from "./deprecation-warning.js";

describe("emitFormatDeprecationWarning", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    resetFormatDeprecationWarningsForTesting();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    resetFormatDeprecationWarningsForTesting();
  });

  it("emits a stderr warning once for a fresh command+alias pair", () => {
    emitFormatDeprecationWarning({
      command: "search",
      alias: "default",
      replacement: "Use --format brief or --format ai.",
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const message = String(consoleErrorSpy.mock.calls[0][0]);
    expect(message).toContain("warning:");
    expect(message).toContain("--format default is deprecated");
    expect(message).toContain("Use --format brief or --format ai.");
  });

  it("suppresses the warning when json is true (JSON-on-stdout contract)", () => {
    emitFormatDeprecationWarning({
      command: "search",
      alias: "default",
      replacement: "Use --format brief or --format ai.",
      json: true,
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("emits the warning when json is false (explicit non-JSON)", () => {
    emitFormatDeprecationWarning({
      command: "list",
      alias: "default",
      replacement: "Use --format brief or --format ai.",
      json: false,
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not emit twice for the same command+alias key (memoization)", () => {
    emitFormatDeprecationWarning({
      command: "context",
      alias: "detailed",
      replacement: "Use --format brief or --format ai.",
    });
    emitFormatDeprecationWarning({
      command: "context",
      alias: "detailed",
      replacement: "Use --format brief or --format ai.",
    });
    // Second call hits the `if (emitted.has(key)) return;` early-exit.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("emits separately for different commands sharing an alias", () => {
    emitFormatDeprecationWarning({
      command: "search",
      alias: "default",
      replacement: "x",
    });
    emitFormatDeprecationWarning({
      command: "list",
      alias: "default",
      replacement: "x",
    });
    // Distinct keys → two emissions.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it("emits separately for different aliases on the same command", () => {
    // Hypothetical: a command that could in principle warn on two
    // different aliases. The helper key is command+alias so the second
    // distinct alias must produce a fresh emission.
    emitFormatDeprecationWarning({
      command: "context",
      alias: "detailed",
      replacement: "x",
    });
    emitFormatDeprecationWarning({
      command: "context",
      alias: "default",
      replacement: "x",
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it("re-emits after resetFormatDeprecationWarningsForTesting()", () => {
    emitFormatDeprecationWarning({
      command: "list",
      alias: "default",
      replacement: "x",
    });
    resetFormatDeprecationWarningsForTesting();
    emitFormatDeprecationWarning({
      command: "list",
      alias: "default",
      replacement: "x",
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it("treats undefined json as not-suppressed (emits)", () => {
    // exactOptionalPropertyTypes path — undefined is the no-flag default.
    emitFormatDeprecationWarning({
      command: "stats",
      alias: "default",
      replacement: "x",
      json: undefined,
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
