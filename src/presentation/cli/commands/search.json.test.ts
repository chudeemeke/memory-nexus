/**
 * search.json.test.ts
 *
 * CLI-02 envelope assertions for search command (Plan 32-02).
 *
 * Asserts that --json output on EVERY exit path emits a QueryResultEnvelope
 * (success/empty) or QueryErrorEnvelope (validation/catch). Per Codex HIGH-2,
 * not just the catch block.
 *
 * Includes:
 *   - describe("--files --json")  Codex HIGH-4: envelope on file-search branch
 *   - describe("--json --format ai routing")  Codex HIGH-5: deep-equal payload
 *
 * Error-path strategy (Codex HIGH-3 resolution):
 *   Strategy A — deterministic invalid input (empty query / negative limit /
 *   invalid date). NO mock.module() on first-party (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking non-deterministic).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeSearchCommand } from "./search.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("search --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("A. valid JSON on success path (empty DB → empty results)", () => {
    it("emits envelope with schema_version, command, kind, data", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("query", { json: true, dbPath })
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      expect(parsed.kind).toBe("message");
      expect(parsed.data).toBeDefined();
      expect(parsed.error).toBeUndefined();
    });
  });

  describe("B. envelope on EMPTY result", () => {
    it("emits envelope with data: [] not plain text", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("definitely-no-results-zxqv-12345", {
          json: true,
          dbPath,
        })
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data.length).toBe(0);
      expect(parsed.error).toBeUndefined();
    });
  });

  describe("C. envelope on VALIDATION error", () => {
    it("emits error envelope on empty query", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("", { json: true, dbPath })
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
      expect(typeof parsed.error.message).toBe("string");
      expect(parsed.data).toBeUndefined();
    });

    it("emits error envelope on invalid limit", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("q", { json: true, dbPath, limit: "-1" })
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      expect(parsed.error).toBeDefined();
    });

    it("emits error envelope on invalid since-date", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("q", {
          json: true,
          dbPath,
          since: "garbage-date-zzz",
        })
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      expect(parsed.error).toBeDefined();
    });
  });

  describe("F. stdout is EXACTLY ONE JSON document in --json mode", () => {
    it("emits parseable JSON without preceding/trailing non-JSON lines", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeSearchCommand("query", { json: true, dbPath })
      );
      // Should not throw — single JSON document.
      expect(() => JSON.parse(stdout)).not.toThrow();
      // No content before the first `{` or after the final `}`.
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("H. per-command meta assertion", () => {
    it("includes meta.query and meta.mode for empty search", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeSearchCommand("specific-query-for-meta", {
          json: true,
          dbPath,
        })
      );
      const parsed = JSON.parse(stdout);
      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.query).toBe("specific-query-for-meta");
    });
  });

  describe("I. --files --json (Codex HIGH-4)", () => {
    it("emits envelope with kind: 'file' regardless of qmd availability", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeSearchCommand("foo", { json: true, files: true, dbPath })
      );
      // Parse the captured stdout as JSON — must succeed.
      const parsed = JSON.parse(stdout);
      // The envelope shape is the SAME contract as the DB path.
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("search");
      if (exitCode === 0) {
        // qmd available: kind is "file", data is an array.
        expect(parsed.kind).toBe("file");
        expect(Array.isArray(parsed.data)).toBe(true);
      } else {
        // qmd unavailable: error envelope with code referring to qmd-unavailable.
        expect(parsed.error).toBeDefined();
        expect(typeof parsed.error.code).toBe("string");
      }
    });
  });

  describe("J. --json --format ai routing equivalence (Codex HIGH-5)", () => {
    it("deep-equals --json alone vs --json --format ai (search)", async () => {
      const dbPath = makeTempDbPath("search", tempPaths);
      // Run with --json alone
      const { stdout: stdoutA } = await captureStreams(() =>
        executeSearchCommand("equivalence-test", { json: true, dbPath })
      );
      // Run with --json --format ai (same DB, fresh capture)
      const { stdout: stdoutB } = await captureStreams(() =>
        executeSearchCommand("equivalence-test", {
          json: true,
          format: "ai",
          dbPath,
        })
      );
      // Strip meta.timing_ms before comparison (non-deterministic).
      const stripTiming = (s: string): unknown => {
        const obj = JSON.parse(s);
        if (obj.meta && "timing_ms" in obj.meta) delete obj.meta.timing_ms;
        return obj;
      };
      expect(stripTiming(stdoutA)).toEqual(stripTiming(stdoutB));
    });
  });
});
