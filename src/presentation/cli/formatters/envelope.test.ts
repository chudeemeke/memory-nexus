/**
 * Envelope (CLI-02 foundation) tests
 *
 * Phase 32 Plan 01: Tests for shared QueryResultEnvelope contract,
 * runtime tuples (HIGH-1), discriminated EnvelopeScope (MEDIUM-4),
 * and shared emission helpers (HIGH-2).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  ENVELOPE_SCHEMA_VERSION,
  QUERY_COMMAND_NAMES,
  QUERY_RESULT_KINDS,
  buildEnvelope,
  buildErrorEnvelope,
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
  type QueryCommandName,
  type QueryResultKind,
  type EnvelopeScope,
} from "./envelope.js";

describe("envelope (CLI-02 foundation)", () => {
  describe("runtime tuples (HIGH-1)", () => {
    test("QUERY_COMMAND_NAMES is an array of strings with 7 entries", () => {
      expect(Array.isArray(QUERY_COMMAND_NAMES)).toBe(true);
      expect(QUERY_COMMAND_NAMES.length).toBe(7);
      for (const name of QUERY_COMMAND_NAMES) {
        expect(typeof name).toBe("string");
      }
    });

    test("QUERY_COMMAND_NAMES includes search", () => {
      expect(QUERY_COMMAND_NAMES.includes("search" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes context", () => {
      expect(QUERY_COMMAND_NAMES.includes("context" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes show", () => {
      expect(QUERY_COMMAND_NAMES.includes("show" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes list", () => {
      expect(QUERY_COMMAND_NAMES.includes("list" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes related", () => {
      expect(QUERY_COMMAND_NAMES.includes("related" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes stats", () => {
      expect(QUERY_COMMAND_NAMES.includes("stats" as QueryCommandName)).toBe(true);
    });

    test("QUERY_COMMAND_NAMES includes query", () => {
      expect(QUERY_COMMAND_NAMES.includes("query" as QueryCommandName)).toBe(true);
    });

    test("QUERY_RESULT_KINDS is an array with at least 5 string entries", () => {
      expect(Array.isArray(QUERY_RESULT_KINDS)).toBe(true);
      expect(QUERY_RESULT_KINDS.length).toBeGreaterThanOrEqual(5);
      for (const kind of QUERY_RESULT_KINDS) {
        expect(typeof kind).toBe("string");
      }
    });

    test("QUERY_RESULT_KINDS includes message, session, context, related, stats", () => {
      expect(QUERY_RESULT_KINDS.includes("message" as QueryResultKind)).toBe(true);
      expect(QUERY_RESULT_KINDS.includes("session" as QueryResultKind)).toBe(true);
      expect(QUERY_RESULT_KINDS.includes("context" as QueryResultKind)).toBe(true);
      expect(QUERY_RESULT_KINDS.includes("related" as QueryResultKind)).toBe(true);
      expect(QUERY_RESULT_KINDS.includes("stats" as QueryResultKind)).toBe(true);
    });

    test("QUERY_RESULT_KINDS includes file (HIGH-4: search --files branch)", () => {
      expect(QUERY_RESULT_KINDS.includes("file" as QueryResultKind)).toBe(true);
    });

    test("ENVELOPE_SCHEMA_VERSION equals \"1\"", () => {
      expect(ENVELOPE_SCHEMA_VERSION).toBe("1");
    });
  });

  describe("buildEnvelope (success path)", () => {
    test("minimal args produce envelope without undefined keys", () => {
      const env = buildEnvelope({ command: "search", kind: "message", data: [] });
      expect(env).toEqual({
        schema_version: "1",
        command: "search",
        kind: "message",
        data: [],
      });
      // Critical: undefined keys must not leak into JSON output
      const serialized = JSON.stringify(env);
      expect(serialized.includes("\"scope\":")).toBe(false);
      expect(serialized.includes("\"meta\":")).toBe(false);
      expect(serialized.includes("undefined")).toBe(false);
    });

    test("full args produce envelope with project scope and meta", () => {
      const scope: EnvelopeScope = { type: "project", project: "memory-nexus" };
      const env = buildEnvelope({
        command: "list",
        kind: "session",
        data: [],
        scope,
        meta: { count: 0 },
      });
      expect(env.schema_version).toBe("1");
      expect(env.command).toBe("list");
      expect(env.kind).toBe("session");
      expect(env.data).toEqual([]);
      expect(env.scope).toEqual({ type: "project", project: "memory-nexus" });
      expect(env.meta).toEqual({ count: 0 });
    });

    test("global scope round-trips through JSON.stringify+parse", () => {
      const env = buildEnvelope({
        command: "context",
        kind: "context",
        data: { project: "x" },
        scope: { type: "global" },
      });
      const roundTripped = JSON.parse(JSON.stringify(env));
      expect(roundTripped).toEqual(env);
      expect(roundTripped.scope).toEqual({ type: "global" });
    });

    test("project scope round-trips through JSON.stringify+parse", () => {
      const env = buildEnvelope({
        command: "show",
        kind: "session",
        data: { id: "s1" },
        scope: { type: "project", project: "p1" },
      });
      const roundTripped = JSON.parse(JSON.stringify(env));
      expect(roundTripped).toEqual(env);
    });

    test("no-scope variant round-trips through JSON.stringify+parse", () => {
      const env = buildEnvelope({
        command: "stats",
        kind: "stats",
        data: { total: 5 },
      });
      const roundTripped = JSON.parse(JSON.stringify(env));
      expect(roundTripped).toEqual(env);
      expect(roundTripped.scope).toBeUndefined();
      expect(roundTripped.meta).toBeUndefined();
    });
  });

  describe("buildErrorEnvelope", () => {
    test("minimal args produce error envelope without context key when omitted", () => {
      const env = buildErrorEnvelope({
        command: "search",
        code: "DB_CONNECTION_FAILED",
        message: "boom",
      });
      expect(env).toEqual({
        schema_version: "1",
        command: "search",
        error: {
          code: "DB_CONNECTION_FAILED",
          message: "boom",
        },
      });
      const serialized = JSON.stringify(env);
      expect(serialized.includes("\"context\":")).toBe(false);
    });

    test("full args carry error.context project field", () => {
      const env = buildErrorEnvelope({
        command: "context",
        code: "X",
        message: "y",
        context: { project: "p" },
      });
      expect(env.error.context).toEqual({ project: "p" });
      expect(env.error.code).toBe("X");
      expect(env.error.message).toBe("y");
    });

    test("round-trips through JSON.stringify+parse cleanly", () => {
      const env = buildErrorEnvelope({
        command: "list",
        code: "E_X",
        message: "boom",
        context: { reason: "test" },
      });
      const roundTripped = JSON.parse(JSON.stringify(env));
      expect(roundTripped).toEqual(env);
    });
  });

  describe("emitJsonEnvelope (HIGH-2)", () => {
    let captured: string[] = [];
    const originalLog = console.log;

    beforeEach(() => {
      captured = [];
      console.log = (...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
      };
    });

    afterEach(() => {
      console.log = originalLog;
    });

    test("writes JSON to stdout that parses to buildEnvelope output", () => {
      emitJsonEnvelope({ command: "search", kind: "message", data: [] });
      expect(captured.length).toBe(1);
      const parsed = JSON.parse(captured[0]!);
      const expected = buildEnvelope({ command: "search", kind: "message", data: [] });
      expect(parsed).toEqual(expected);
    });

    test("returns void", () => {
      const result = emitJsonEnvelope({
        command: "list",
        kind: "session",
        data: [],
      });
      expect(result).toBeUndefined();
    });

    test("pretty-prints with 2-space indent", () => {
      emitJsonEnvelope({ command: "stats", kind: "stats", data: { total: 1 } });
      expect(captured.length).toBe(1);
      // 2-space indent shows as a newline followed by two spaces
      expect(captured[0]!.includes("\n  ")).toBe(true);
    });

    test("carries scope and meta when provided", () => {
      emitJsonEnvelope({
        command: "list",
        kind: "session",
        data: [],
        scope: { type: "project", project: "p" },
        meta: { count: 0 },
      });
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.scope).toEqual({ type: "project", project: "p" });
      expect(parsed.meta).toEqual({ count: 0 });
    });
  });

  describe("emitJsonErrorEnvelope (HIGH-2)", () => {
    let captured: string[] = [];
    const originalLog = console.log;

    beforeEach(() => {
      captured = [];
      console.log = (...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
      };
    });

    afterEach(() => {
      console.log = originalLog;
    });

    test("writes JSON to stdout that parses to buildErrorEnvelope output", () => {
      emitJsonErrorEnvelope({ command: "list", code: "E_X", message: "boom" });
      expect(captured.length).toBe(1);
      const parsed = JSON.parse(captured[0]!);
      const expected = buildErrorEnvelope({
        command: "list",
        code: "E_X",
        message: "boom",
      });
      expect(parsed).toEqual(expected);
    });

    test("returns void", () => {
      const result = emitJsonErrorEnvelope({
        command: "search",
        code: "E_Y",
        message: "z",
      });
      expect(result).toBeUndefined();
    });

    test("pretty-prints with 2-space indent", () => {
      emitJsonErrorEnvelope({ command: "show", code: "E_Z", message: "m" });
      expect(captured.length).toBe(1);
      expect(captured[0]!.includes("\n  ")).toBe(true);
    });

    test("carries context when provided", () => {
      emitJsonErrorEnvelope({
        command: "context",
        code: "E",
        message: "m",
        context: { project: "p" },
      });
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.error.context).toEqual({ project: "p" });
    });
  });
});
