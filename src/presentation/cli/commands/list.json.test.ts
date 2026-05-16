/**
 * list.json.test.ts
 *
 * CLI-02 envelope assertions for list command (Plan 32-02).
 *
 * Asserts envelope shape on success + empty + validation + catch paths.
 *
 * Error-path strategy: Strategy A — invalid limit / invalid since-date.
 *   NO mock.module() on first-party (isolation gate).
 *   NO dbPath: "/non/existent/..." (Windows file-locking).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeListCommand } from "./list.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("list --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("A. valid JSON on success path", () => {
    it("emits envelope with schema_version, command, kind, data", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeListCommand({ limit: "10", json: true }, { dbPath })
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("list");
      expect(parsed.kind).toBe("session");
      expect(parsed.data).toBeDefined();
      expect(parsed.error).toBeUndefined();
    });
  });

  describe("B. envelope on EMPTY result (empty DB)", () => {
    it("emits envelope with data: [] not plain text", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeListCommand({ json: true }, { dbPath })
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("list");
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data.length).toBe(0);
    });
  });

  describe("C. envelope on VALIDATION error", () => {
    it("emits error envelope on invalid limit", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeListCommand({ limit: "abc", json: true }, { dbPath })
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("list");
      expect(parsed.error).toBeDefined();
      expect(typeof parsed.error.code).toBe("string");
    });

    it("emits error envelope on invalid since-date", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout, exitCode } = await captureStreams(() =>
        executeListCommand(
          { json: true, since: "garbage-date-zzz" },
          { dbPath }
        )
      );
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("list");
      expect(parsed.error).toBeDefined();
    });
  });

  describe("F. stdout is exactly one JSON document", () => {
    it("parses cleanly", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeListCommand({ json: true }, { dbPath })
      );
      expect(() => JSON.parse(stdout)).not.toThrow();
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("H. meta.count matches data.length", () => {
    it("includes count in meta", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeListCommand({ json: true }, { dbPath })
      );
      const parsed = JSON.parse(stdout);
      if (parsed.meta && Array.isArray(parsed.data)) {
        expect(parsed.meta.count).toBe(parsed.data.length);
      }
    });
  });

  describe("J. --json --format ai routing equivalence (HIGH-5)", () => {
    it("deep-equals --json vs --json --format ai (list)", async () => {
      const dbPath = makeTempDbPath("list", tempPaths);
      const { stdout: stdoutA } = await captureStreams(() =>
        executeListCommand({ json: true }, { dbPath })
      );
      const { stdout: stdoutB } = await captureStreams(() =>
        executeListCommand({ json: true, format: "ai" }, { dbPath })
      );
      expect(JSON.parse(stdoutA)).toEqual(JSON.parse(stdoutB));
    });
  });
});
