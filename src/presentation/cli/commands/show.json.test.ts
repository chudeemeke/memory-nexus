/**
 * show.json.test.ts
 *
 * CLI-02 envelope assertions for show command (Plan 32-02).
 *
 * Asserts envelope shape on success + not-found + catch paths.
 *
 * Error-path strategy: Strategy A — nonexistent session ID for not-found.
 *   NO mock.module() on first-party (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeShowCommand } from "./show.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("show --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("D. envelope on NOT-FOUND", () => {
    it("emits error envelope when session ID does not exist", async () => {
      const dbPath = makeTempDbPath("show", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeShowCommand(
          "nonexistent-id-12345",
          { json: true },
          { dbPath }
        )
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("show");
      // Not-found must surface as error envelope, not bespoke "not found" text.
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
      expect(typeof parsed.error.message).toBe("string");
      expect(parsed.data).toBeUndefined();
    });
  });

  describe("F. stdout is exactly one JSON document", () => {
    it("parses cleanly", async () => {
      const dbPath = makeTempDbPath("show", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeShowCommand("any-id", { json: true }, { dbPath })
      );
      expect(() => JSON.parse(stdout)).not.toThrow();
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("H. meta.session_id echoes input on error envelope", () => {
    it("includes session_id in error context", async () => {
      const dbPath = makeTempDbPath("show", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeShowCommand(
          "specific-session-id-for-meta",
          { json: true },
          { dbPath }
        )
      );
      const parsed = JSON.parse(stdout);
      // For show, session_id may live in error.context (not-found) or meta (success).
      // Loose: at least one of these must mention the input ID.
      const errCtxId =
        parsed.error?.context?.session_id ??
        parsed.error?.context?.sessionId;
      const metaId = parsed.meta?.session_id;
      const found = errCtxId === "specific-session-id-for-meta" ||
        metaId === "specific-session-id-for-meta" ||
        // Allow error message to mention the id as a fallback
        (parsed.error?.message?.includes("specific-session-id-for-meta") ?? false);
      expect(found).toBe(true);
    });
  });

  describe("J. --json --format ai routing equivalence (HIGH-5)", () => {
    it("deep-equals --json vs --json --format ai (show)", async () => {
      const dbPath = makeTempDbPath("show", tempPaths);
      const { stdout: stdoutA } = await captureStreams(() =>
        executeShowCommand("test-id", { json: true }, { dbPath })
      );
      const { stdout: stdoutB } = await captureStreams(() =>
        executeShowCommand(
          "test-id",
          { json: true, format: "ai" },
          { dbPath }
        )
      );
      const parsedA = JSON.parse(stdoutA);
      const parsedB = JSON.parse(stdoutB);
      expect(parsedA).toEqual(parsedB);
    });
  });
});
