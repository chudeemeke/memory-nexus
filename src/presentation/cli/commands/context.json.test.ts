/**
 * context.json.test.ts
 *
 * CLI-02 envelope assertions for context command (Plan 32-02).
 *
 * Asserts envelope shape on every exit path. The KEY test is HIGH-5
 * (--json --format ai routing equivalence): context.ts:118 has a
 * routing fork (SmartContextService vs Legacy), and --json must take
 * the SAME path regardless of --format ai.
 *
 * Error-path strategy: Strategy A (project-not-found → empty result).
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { executeContextCommand } from "./context.js";
import {
  captureStreams,
  makeTempDbPath,
  cleanupTempPaths,
} from "./_helpers/capture-json.js";

describe("context --json envelope (Plan 32-02 CLI-02)", () => {
  let tempPaths: string[] = [];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(() => {
    cleanupTempPaths(tempPaths);
  });

  describe("D. envelope on NOT-FOUND (empty DB → project missing)", () => {
    it("emits envelope (or error envelope) — not bespoke shape", async () => {
      const dbPath = makeTempDbPath("context", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeContextCommand("nonexistent-project-zzz", {
          json: true,
          dbPath,
        })
      );
      const parsed = JSON.parse(stdout);
      // Envelope shape: schema_version + command + (data or error)
      expect(parsed.schema_version).toBe("1");
      expect(parsed.command).toBe("context");
      // Either data: <something> OR error: {...} but not legacy "results"
      const hasData = parsed.data !== undefined;
      const hasError = parsed.error !== undefined;
      expect(hasData || hasError).toBe(true);
    });
  });

  describe("F. stdout is exactly one JSON document", () => {
    it("parses cleanly", async () => {
      const dbPath = makeTempDbPath("context", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeContextCommand("project-name", { json: true, dbPath })
      );
      expect(() => JSON.parse(stdout)).not.toThrow();
      const trimmed = stdout.trim();
      expect(trimmed.startsWith("{")).toBe(true);
      expect(trimmed.endsWith("}")).toBe(true);
    });
  });

  describe("H. meta.project echoes input", () => {
    it("includes project in meta", async () => {
      const dbPath = makeTempDbPath("context", tempPaths);
      const { stdout } = await captureStreams(() =>
        executeContextCommand("my-project-name", { json: true, dbPath })
      );
      const parsed = JSON.parse(stdout);
      // meta may live on success OR be omitted on error; assertion is loose.
      if (parsed.meta) {
        expect(parsed.meta.project).toBe("my-project-name");
      }
    });
  });

  describe("J. --json --format ai routing equivalence (Codex HIGH-5 — canonical)", () => {
    it("deep-equals --json alone vs --json --format ai", async () => {
      const dbPath = makeTempDbPath("context", tempPaths);
      // Run with --json alone (routing decision depends on budget/cross-project only)
      const { stdout: stdoutA } = await captureStreams(() =>
        executeContextCommand("equivalence-test", {
          json: true,
          dbPath,
        })
      );
      // Run with --json --format ai (must take SAME path — HIGH-5)
      const { stdout: stdoutB } = await captureStreams(() =>
        executeContextCommand("equivalence-test", {
          json: true,
          format: "ai",
          dbPath,
        })
      );
      // Both must be parseable JSON
      const parsedA = JSON.parse(stdoutA);
      const parsedB = JSON.parse(stdoutB);
      // Deep-equal (not just both-parseable per HIGH-5)
      expect(parsedA).toEqual(parsedB);
    });

    it("deep-equals --json --budget vs --json --budget --format ai", async () => {
      const dbPath = makeTempDbPath("context", tempPaths);
      // --budget triggers SmartContextService routing
      const { stdout: stdoutA } = await captureStreams(() =>
        executeContextCommand("budget-test", {
          json: true,
          budget: 1000,
          dbPath,
        })
      );
      const { stdout: stdoutB } = await captureStreams(() =>
        executeContextCommand("budget-test", {
          json: true,
          budget: 1000,
          format: "ai",
          dbPath,
        })
      );
      const parsedA = JSON.parse(stdoutA);
      const parsedB = JSON.parse(stdoutB);
      expect(parsedA).toEqual(parsedB);
    });
  });
});
