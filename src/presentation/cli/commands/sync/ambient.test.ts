/**
 * Ambient Context Tests
 *
 * Tests for runAmbientContextGeneration function.
 */

import { describe, expect, it, spyOn } from "bun:test";
import { runAmbientContextGeneration } from "./ambient.js";

describe("runAmbientContextGeneration", () => {
  it("calls AmbientContextService when enabled", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let generateCalled = false;
    let generateOptions: any = null;

    await runAmbientContextGeneration(
      {} as any, // db (unused with deps override)
      {},        // options (not quiet, not dryRun)
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test-auto-memory",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async (opts: any) => {
            generateCalled = true;
            generateOptions = opts;
            return { success: true, contextTokens: 500 };
          },
        }),
      },
    );

    expect(generateCalled).toBe(true);
    expect(generateOptions.projectName).toBe("test-project");
    expect(generateOptions.budget).toBe(800);

    logSpy.mockRestore();
  });

  it("skips when config.ambientContext.enabled is false", async () => {
    let generateCalled = false;

    await runAmbientContextGeneration(
      {} as any,
      {},
      {
        loadConfig: () => ({
          ambientContext: { enabled: false, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => {
            generateCalled = true;
            return { success: true, contextTokens: 0 };
          },
        }),
      },
    );

    expect(generateCalled).toBe(false);
  });

  it("does not throw on error (non-fatal)", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    await runAmbientContextGeneration(
      {} as any,
      {},
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => {
            throw new Error("test error");
          },
        }),
      },
    );

    // Should have logged error to stderr
    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const errorLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: error")
    );
    expect(errorLine).toBeDefined();
    expect(errorLine).toContain("test error");

    errorSpy.mockRestore();
  });

  it("logs success message with token count when not quiet", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runAmbientContextGeneration(
      {} as any,
      {}, // not quiet
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: true,
            contextTokens: 750,
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const successLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: updated")
    );
    expect(successLine).toBeDefined();
    expect(successLine).toContain("750");

    logSpy.mockRestore();
  });

  it("suppresses output when quiet option is set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runAmbientContextGeneration(
      {} as any,
      { quiet: true },
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: true,
            contextTokens: 500,
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const ambientLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context")
    );
    expect(ambientLine).toBeUndefined();

    logSpy.mockRestore();
  });

  it("logs skip reason when generateAmbientContext returns success: false", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runAmbientContextGeneration(
      {} as any,
      {}, // not quiet
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: false,
            reason: "project-not-found",
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const skipLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: skipped")
    );
    expect(skipLine).toBeDefined();
    expect(skipLine).toContain("project-not-found");

    logSpy.mockRestore();
  });

  it("suppresses skip message when quiet option is set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await runAmbientContextGeneration(
      {} as any,
      { quiet: true },
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: false,
            reason: "no-context",
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const ambientLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context")
    );
    expect(ambientLine).toBeUndefined();

    logSpy.mockRestore();
  });
});
