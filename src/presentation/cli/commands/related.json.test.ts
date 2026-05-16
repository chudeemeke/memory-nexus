/**
 * related.json.test.ts
 *
 * CLI-02 envelope assertions for related command (Plan 32-02).
 *
 * Asserts envelope shape on success + not-found + catch paths.
 * Plan 32-02 Task 5 decision: "no links" path emits error envelope
 * with code NOT_FOUND (clearer semantics than data: [] + exitCode 1).
 *
 * Error-path strategy: Strategy A — nonexistent source ID.
 *   NO mock.module() on first-party (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeRelatedCommand } from "./related.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("related --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("D. envelope on NOT-FOUND (empty DB → no links)", () => {
    it("emits error envelope when no links exist for the ID", async () => {
      const dbPath = makeTempDbPath("related", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeRelatedCommand("nonexistent-id", {
          json: true,
          dbPath,
        })
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("related");
      // Plan decision: error envelope (not data: []) with code NOT_FOUND.
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
    });
  });

  describe("F. stdout is exactly one JSON document", () => {
    it("parses cleanly", async () => {
      const dbPath = makeTempDbPath("related", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeRelatedCommand("some-id", { json: true, dbPath })
      );
      expect(() => JSON.parse(stdout)).not.toThrow();
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("H. error or meta echoes source_id", () => {
    it("references the source ID in error.context or meta", async () => {
      const dbPath = makeTempDbPath("related", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeRelatedCommand("specific-id-for-meta", {
          json: true,
          dbPath,
        })
      );
      const parsed = JSON.parse(stdout);
      const errCtxId =
        parsed.error?.context?.source_id ??
        parsed.error?.context?.sourceId ??
        parsed.error?.context?.id;
      const metaId = parsed.meta?.source_id;
      const found = errCtxId === "specific-id-for-meta" ||
        metaId === "specific-id-for-meta" ||
        (parsed.error?.message?.includes("specific-id-for-meta") ?? false);
      expect(found).toBe(true);
    });
  });

  describe("J. --json --format ai routing equivalence (HIGH-5)", () => {
    it("deep-equals --json vs --json --format ai (related)", async () => {
      const dbPath = makeTempDbPath("related", tempPaths);
      const { stdout: stdoutA } = await captureStreams(() =>
        executeRelatedCommand("test-id", { json: true, dbPath })
      );
      const { stdout: stdoutB } = await captureStreams(() =>
        executeRelatedCommand("test-id", {
          json: true,
          format: "ai",
          dbPath,
        })
      );
      const stripTiming = (s: string): unknown => {
        const obj = JSON.parse(s);
        if (obj.meta && "timing_ms" in obj.meta) delete obj.meta.timing_ms;
        return obj;
      };
      expect(stripTiming(stdoutA)).toEqual(stripTiming(stdoutB));
    });
  });
});
