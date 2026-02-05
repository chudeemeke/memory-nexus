/**
 * MemoryNexusError Tests
 */

import { describe, expect, test } from "bun:test";
import { ErrorCode } from "./error-codes.js";
import { MemoryNexusError, type ErrorJson } from "./memory-nexus-error.js";

describe("MemoryNexusError", () => {
  describe("constructor", () => {
    test("creates error with code and message", () => {
      const error = new MemoryNexusError(
        ErrorCode.DB_CONNECTION_FAILED,
        "Could not connect to database"
      );

      expect(error.code).toBe("DB_CONNECTION_FAILED");
      expect(error.message).toBe("Could not connect to database");
      expect(error.context).toBeUndefined();
    });

    test("creates error with code, message, and context", () => {
      const error = new MemoryNexusError(
        ErrorCode.SOURCE_INACCESSIBLE,
        "Cannot read session file",
        { path: "/home/user/.claude/sessions/abc.jsonl", permissions: "000" }
      );

      expect(error.code).toBe("SOURCE_INACCESSIBLE");
      expect(error.message).toBe("Cannot read session file");
      expect(error.context).toEqual({
        path: "/home/user/.claude/sessions/abc.jsonl",
        permissions: "000",
      });
    });

    test("sets name to MemoryNexusError", () => {
      const error = new MemoryNexusError(
        ErrorCode.INVALID_JSON,
        "Invalid JSON"
      );

      expect(error.name).toBe("MemoryNexusError");
    });

    test("extends Error class", () => {
      const error = new MemoryNexusError(
        ErrorCode.SYNC_FAILED,
        "Sync failed"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MemoryNexusError);
    });

    test("has stack trace", () => {
      const error = new MemoryNexusError(
        ErrorCode.DB_CORRUPTED,
        "Database corrupted"
      );

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("MemoryNexusError");
    });
  });

  describe("toJSON", () => {
    test("returns structured error without context", () => {
      const error = new MemoryNexusError(
        ErrorCode.SESSION_NOT_FOUND,
        "Session abc123 not found"
      );

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: "SESSION_NOT_FOUND",
          message: "Session abc123 not found",
        },
      });
    });

    test("returns structured error with context", () => {
      const error = new MemoryNexusError(
        ErrorCode.INVALID_JSON,
        "Failed to parse line 42",
        {
          file: "session.jsonl",
          line: 42,
          content: '{"incomplete":',
        }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: "INVALID_JSON",
          message: "Failed to parse line 42",
          context: {
            file: "session.jsonl",
            line: 42,
            content: '{"incomplete":',
          },
        },
      });
    });

    test("omits empty context object", () => {
      const error = new MemoryNexusError(
        ErrorCode.DISK_FULL,
        "Disk is full",
        {}
      );

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: "DISK_FULL",
          message: "Disk is full",
        },
      });
      expect(json.error.context).toBeUndefined();
    });

    test("can be serialized to JSON string", () => {
      const error = new MemoryNexusError(
        ErrorCode.DB_LOCKED,
        "Database is locked by another process",
        { pid: 12345 }
      );

      const jsonString = JSON.stringify(error.toJSON());
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual({
        error: {
          code: "DB_LOCKED",
          message: "Database is locked by another process",
          context: { pid: 12345 },
        },
      });
    });

    test("context with nested objects", () => {
      const error = new MemoryNexusError(
        ErrorCode.SYNC_INTERRUPTED,
        "Sync was interrupted",
        {
          progress: {
            completed: 45,
            total: 100,
          },
          lastSession: "abc123",
        }
      );

      const json = error.toJSON();

      expect(json.error.context).toEqual({
        progress: {
          completed: 45,
          total: 100,
        },
        lastSession: "abc123",
      });
    });
  });

  describe("type safety", () => {
    test("ErrorJson interface matches toJSON output", () => {
      const error = new MemoryNexusError(
        ErrorCode.UNKNOWN,
        "Unknown error"
      );

      // Type check - this should compile
      const json: ErrorJson = error.toJSON();
      expect(json.error.code).toBe("UNKNOWN");
      expect(json.error.message).toBe("Unknown error");
    });
  });
});
