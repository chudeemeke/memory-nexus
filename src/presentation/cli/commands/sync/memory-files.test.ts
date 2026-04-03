/**
 * Memory Files Tests
 *
 * Tests for runMemoryFileSync and reportMemoryFileResults functions.
 */

import { describe, it, expect } from "bun:test";

describe("memory-files", () => {
  it("module exports runMemoryFileSync and reportMemoryFileResults", async () => {
    const mod = await import("./memory-files.js");
    expect(typeof mod.runMemoryFileSync).toBe("function");
    expect(typeof mod.reportMemoryFileResults).toBe("function");
  });
});
