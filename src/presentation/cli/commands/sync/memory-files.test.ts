/**
 * Memory Files Tests
 *
 * Tests for runMemoryFileSync and reportMemoryFileResults functions.
 */

import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { reportMemoryFileResults } from "./memory-files.js";

let consoleLogSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  consoleLogSpy?.mockRestore();
  consoleLogSpy = undefined;
});

describe("memory-files", () => {
  it("module exports runMemoryFileSync and reportMemoryFileResults", async () => {
    const mod = await import("./memory-files.js");
    expect(typeof mod.runMemoryFileSync).toBe("function");
    expect(typeof mod.reportMemoryFileResults).toBe("function");
  });

  it("reports memory file results as JSON for machine consumers", () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    reportMemoryFileResults({
      filesIndexed: 2,
      filesSkipped: 1,
      errors: [{ filePath: "bad.md", error: "parse failed" }],
    }, { json: true });

    const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
    expect(parsed.memoryFiles).toEqual({
      indexed: 2,
      skipped: 1,
      errors: [{ filePath: "bad.md", error: "parse failed" }],
    });
  });

  it("does not print memory file results in quiet mode", () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    reportMemoryFileResults({
      filesIndexed: 2,
      filesSkipped: 0,
      errors: [],
    }, { quiet: true });

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("prints text summaries and individual errors by default", () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    reportMemoryFileResults({
      filesIndexed: 1,
      filesSkipped: 2,
      errors: [{ filePath: "notes.md", error: "not readable" }],
    }, {});

    const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
    expect(output).toContain("Memory files: 1 indexed, 2 skipped");
    expect(output).toContain("Error: notes.md: not readable");
  });
});
