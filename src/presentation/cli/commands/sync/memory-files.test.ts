/**
 * Memory Files Tests
 *
 * Tests for runMemoryFileSync and reportMemoryFileResults functions.
 */

import { describe, it, expect, afterEach, spyOn } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, type TestDatabase } from "../../../../../tests/helpers/test-database.js";
import { reportMemoryFileResults, runMemoryFileSync } from "./memory-files.js";

let consoleLogSpy: ReturnType<typeof spyOn> | undefined;
let testDb: TestDatabase | undefined;
let tempDirs: string[] = [];
const originalMemoryHome = process.env.MEMORY_HOME;

afterEach(() => {
  consoleLogSpy?.mockRestore();
  consoleLogSpy = undefined;
  testDb?.cleanup();
  testDb = undefined;
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  if (originalMemoryHome === undefined) delete process.env.MEMORY_HOME;
  else process.env.MEMORY_HOME = originalMemoryHome;
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

  it("prints default text summary without error rows when sync has no errors", () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    reportMemoryFileResults({
      filesIndexed: 2,
      filesSkipped: 3,
      errors: [],
    }, {});

    const output = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
    expect(output).toContain("Memory files: 2 indexed, 3 skipped");
    expect(output).not.toContain("Error:");
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

  it("returns indexed results when MEMORY_HOME contains recognized markdown files", async () => {
    testDb = createTestDatabase({ prefix: "memory-files-command-" });
    const memoryHome = mkdtempSync(join(tmpdir(), "memory-files-home-"));
    tempDirs.push(memoryHome);
    process.env.MEMORY_HOME = memoryHome;
    mkdirSync(join(memoryHome, "daily"), { recursive: true });
    writeFileSync(join(memoryHome, "daily", "2026-05-30.md"), "# Daily log\n");

    const result = await runMemoryFileSync(testDb.db, {});

    expect(result).not.toBeNull();
    expect(result?.filesIndexed).toBe(1);
    expect(result?.filesSkipped).toBe(0);
    expect(result?.errors).toHaveLength(0);
  });

  it("returns null when MEMORY_HOME has nothing reportable", async () => {
    testDb = createTestDatabase({ prefix: "memory-files-command-empty-" });
    const memoryHome = mkdtempSync(join(tmpdir(), "memory-files-empty-"));
    tempDirs.push(memoryHome);
    process.env.MEMORY_HOME = memoryHome;

    const result = await runMemoryFileSync(testDb.db, {});

    expect(result).toBeNull();
  });
});
