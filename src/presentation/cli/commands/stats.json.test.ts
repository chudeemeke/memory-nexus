/**
 * stats.json.test.ts
 *
 * CLI-02 envelope assertions for stats command (Plan 32-02).
 *
 * Asserts envelope shape on success + empty + validation paths.
 *
 * Error-path strategy: Strategy A — invalid projects count.
 *   NO mock.module() on first-party (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeStatsCommand } from "./stats.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("stats --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("A. valid JSON on success path (empty DB)", () => {
    it("emits envelope with schema_version, command, kind, data", async () => {
      const dbPath = makeTempDbPath("stats", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeStatsCommand({ json: true }, { dbPath })
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("stats");
      expect(parsed.kind).toBe("stats");
      expect(parsed.data).toBeDefined();
      expect(parsed.error).toBeUndefined();
    });
  });

  describe("C. envelope on VALIDATION error", () => {
    it("emits error envelope on invalid projects count", async () => {
      const dbPath = makeTempDbPath("stats", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeStatsCommand(
          { json: true, projects: "-1" },
          { dbPath }
        )
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("stats");
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
    });

    it("emits error envelope on NaN projects count", async () => {
      const dbPath = makeTempDbPath("stats", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeStatsCommand(
          { json: true, projects: "abc" },
          { dbPath }
        )
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("stats");
      expect(parsed.error).toBeDefined();
    });
  });

  describe("F. stdout is exactly one JSON document", () => {
    it("parses cleanly", async () => {
      const dbPath = makeTempDbPath("stats", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeStatsCommand({ json: true }, { dbPath })
      );
      expect(() => JSON.parse(stdout)).not.toThrow();
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("J. --json --format ai routing equivalence (HIGH-5)", () => {
    it("deep-equals --json vs --json --format ai (stats)", async () => {
      const dbPath = makeTempDbPath("stats", tempPaths);
      const { stdout: stdoutA } = await captureStreams(() =>
        executeStatsCommand({ json: true }, { dbPath })
      );
      const { stdout: stdoutB } = await captureStreams(() =>
        executeStatsCommand({ json: true, format: "ai" }, { dbPath })
      );
      // Strip non-deterministic fields:
      //  - meta.timing_ms / meta.generated_at (per-call wall clock)
      //  - data.databaseSizeBytes (SQLite checkpoints between calls
      //    can grow the file size even with no schema changes)
      const stripVolatile = (s: string): unknown => {
        const obj = JSON.parse(s);
        if (obj.meta) {
          delete obj.meta.timing_ms;
          delete obj.meta.generated_at;
        }
        if (obj.data) {
          delete obj.data.databaseSizeBytes;
        }
        return obj;
      };
      expect(stripVolatile(stdoutA)).toEqual(stripVolatile(stdoutB));
    });
  });
});
