/**
 * Backfill Command Tests
 *
 * Tests for the CLI backfill command handler.
 * Tests command structure, option parsing, and the executeBackfillCommand
 * programmatic API with mocked BackfillService.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { createBackfillCommand, executeBackfillCommand, FileDailyLogWriter } from "./backfill.js";
import type { BackfillResult, DryRunResult } from "../../../application/services/backfill-service.js";

describe("Backfill Command", () => {
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

  describe("createBackfillCommand", () => {
    it("returns a Command instance", () => {
      const command = createBackfillCommand();
      expect(command).toBeInstanceOf(Command);
    });

    it("has name 'backfill'", () => {
      const command = createBackfillCommand();
      expect(command.name()).toBe("backfill");
    });

    it("has description", () => {
      const command = createBackfillCommand();
      expect(command.description()).toBeTruthy();
    });

    it("has --dry-run option", () => {
      const command = createBackfillCommand();
      const opt = command.options.find(
        (o: any) => o.long === "--dry-run",
      );
      expect(opt).toBeDefined();
    });

    it("has --project option", () => {
      const command = createBackfillCommand();
      const opt = command.options.find(
        (o: any) => o.long === "--project",
      );
      expect(opt).toBeDefined();
    });

    it("has --batch option with default 50", () => {
      const command = createBackfillCommand();
      const opt = command.options.find(
        (o: any) => o.long === "--batch",
      );
      expect(opt).toBeDefined();
      expect(opt.defaultValue).toBe("50");
    });

    it("has --force / -f option", () => {
      const command = createBackfillCommand();
      const opt = command.options.find(
        (o: any) => o.long === "--force",
      );
      expect(opt).toBeDefined();
      expect(opt.short).toBe("-f");
    });
  });

  describe("executeBackfillCommand", () => {
    it("dry-run displays session count and estimated cost", async () => {
      const dryRunResult: DryRunResult = {
        unprocessedCount: 42,
        estimatedCost: 0.042,
      };

      const result = await executeBackfillCommand(
        { dryRun: true, batch: "50" },
        {
          dryRun: async () => dryRunResult,
          backfill: async () => ({
            sessionsProcessed: 0,
            sessionsFailed: 0,
            sessionsSkipped: 0,
            dailyLogsCreated: 0,
            dailyLogsUpdated: 0,
            errors: [],
          }),
        },
      );

      expect(result.exitCode).toBe(0);
      const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(output).toContain("42");
      expect(output).toContain("$0.04");
    });

    it("dry-run with zero sessions shows no-sessions message", async () => {
      const result = await executeBackfillCommand(
        { dryRun: true, batch: "50" },
        {
          dryRun: async () => ({ unprocessedCount: 0, estimatedCost: 0 }),
          backfill: async () => ({
            sessionsProcessed: 0,
            sessionsFailed: 0,
            sessionsSkipped: 0,
            dailyLogsCreated: 0,
            dailyLogsUpdated: 0,
            errors: [],
          }),
        },
      );

      expect(result.exitCode).toBe(0);
      const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(output).toContain("No sessions");
    });

    it("shows success output with session counts", async () => {
      const backfillResult: BackfillResult = {
        sessionsProcessed: 10,
        sessionsFailed: 2,
        sessionsSkipped: 1,
        dailyLogsCreated: 5,
        dailyLogsUpdated: 3,
        errors: [
          { sessionId: "s1", error: "timeout" },
          { sessionId: "s2", error: "rate limit" },
        ],
      };

      const result = await executeBackfillCommand(
        { force: true, batch: "50" },
        {
          dryRun: async () => ({ unprocessedCount: 13, estimatedCost: 0.013 }),
          backfill: async () => backfillResult,
        },
      );

      expect(result.exitCode).toBe(0);
      const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(output).toContain("10");
      expect(output).toContain("processed");
    });

    it("reports errors in output", async () => {
      const backfillResult: BackfillResult = {
        sessionsProcessed: 1,
        sessionsFailed: 1,
        sessionsSkipped: 0,
        dailyLogsCreated: 1,
        dailyLogsUpdated: 0,
        errors: [{ sessionId: "s-fail", error: "API timeout" }],
      };

      await executeBackfillCommand(
        { force: true, batch: "50" },
        {
          dryRun: async () => ({ unprocessedCount: 2, estimatedCost: 0.002 }),
          backfill: async () => backfillResult,
        },
      );

      const errorOutput = consoleErrorSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(errorOutput).toContain("s-fail");
      expect(errorOutput).toContain("API timeout");
    });

    it("passes project option to service", async () => {
      let capturedProject: string | undefined;

      await executeBackfillCommand(
        { force: true, batch: "50", project: "kanbanflow" },
        {
          dryRun: async (opts) => {
            capturedProject = opts?.project;
            return { unprocessedCount: 5, estimatedCost: 0.005 };
          },
          backfill: async () => ({
            sessionsProcessed: 5,
            sessionsFailed: 0,
            sessionsSkipped: 0,
            dailyLogsCreated: 1,
            dailyLogsUpdated: 0,
            errors: [],
          }),
        },
      );

      expect(capturedProject).toBe("kanbanflow");
    });

    it("passes batch option to service", async () => {
      let capturedBatch: number | undefined;

      await executeBackfillCommand(
        { force: true, batch: "20" },
        {
          dryRun: async () => ({ unprocessedCount: 50, estimatedCost: 0.05 }),
          backfill: async (opts) => {
            capturedBatch = opts?.batch;
            return {
              sessionsProcessed: 20,
              sessionsFailed: 0,
              sessionsSkipped: 0,
              dailyLogsCreated: 10,
              dailyLogsUpdated: 5,
              errors: [],
            };
          },
        },
      );

      expect(capturedBatch).toBe(20);
    });

    it("returns exitCode 0 when no sessions to backfill (non-dry-run)", async () => {
      const result = await executeBackfillCommand(
        { force: true, batch: "50" },
        {
          dryRun: async () => ({ unprocessedCount: 0, estimatedCost: 0 }),
          backfill: async () => ({
            sessionsProcessed: 0,
            sessionsFailed: 0,
            sessionsSkipped: 0,
            dailyLogsCreated: 0,
            dailyLogsUpdated: 0,
            errors: [],
          }),
        },
      );

      expect(result.exitCode).toBe(0);
      const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(output).toContain("No sessions");
    });

    it("displays daily log stats", async () => {
      await executeBackfillCommand(
        { force: true, batch: "50" },
        {
          dryRun: async () => ({ unprocessedCount: 3, estimatedCost: 0.003 }),
          backfill: async () => ({
            sessionsProcessed: 3,
            sessionsFailed: 0,
            sessionsSkipped: 0,
            dailyLogsCreated: 2,
            dailyLogsUpdated: 1,
            errors: [],
          }),
        },
      );

      const output = consoleLogSpy.mock.calls.map((c: any) => c[0]).join(" ");
      expect(output).toContain("2 created");
      expect(output).toContain("1 updated");
    });
  });

  describe("FileDailyLogWriter", () => {
    it("creates parent directories and reports a new file", async () => {
      const dir = mkdtempSync(join(tmpdir(), "memory-backfill-writer-"));
      try {
        const writer = new FileDailyLogWriter(dir);

        const created = await writer.writeOrAppend("daily/2026-05-28.md", "first entry");

        expect(created).toBe(true);
        expect(readFileSync(join(dir, "daily", "2026-05-28.md"), "utf-8")).toBe("first entry");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("appends to existing daily logs and reports an update", async () => {
      const dir = mkdtempSync(join(tmpdir(), "memory-backfill-writer-"));
      try {
        const writer = new FileDailyLogWriter(dir);

        await writer.writeOrAppend("daily/2026-05-28.md", "first entry");
        const created = await writer.writeOrAppend("daily/2026-05-28.md", "second entry");

        expect(created).toBe(false);
        expect(readFileSync(join(dir, "daily", "2026-05-28.md"), "utf-8")).toBe("first entry\nsecond entry");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
