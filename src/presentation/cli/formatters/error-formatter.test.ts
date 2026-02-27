/**
 * Error Formatter Tests
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { ErrorCode, MemoryError } from "../../../domain/index.js";
import {
  formatError,
  formatErrorJson,
  getSuggestion,
} from "./error-formatter.js";
import { getLogDir } from "../../../infrastructure/paths.js";

describe("error-formatter", () => {
  describe("getSuggestion", () => {
    test("returns suggestion for DB_CONNECTION_FAILED", () => {
      expect(getSuggestion(ErrorCode.DB_CONNECTION_FAILED)).toBe(
        "Check database file permissions"
      );
    });

    test("returns suggestion for DB_CORRUPTED", () => {
      expect(getSuggestion(ErrorCode.DB_CORRUPTED)).toBe(
        "Run 'memory doctor' to diagnose or recreate database"
      );
    });

    test("returns suggestion for DB_LOCKED", () => {
      expect(getSuggestion(ErrorCode.DB_LOCKED)).toBe(
        "Wait and retry, or check for other running processes"
      );
    });

    test("returns suggestion for INVALID_SESSION_ID", () => {
      expect(getSuggestion(ErrorCode.INVALID_SESSION_ID)).toBe(
        "Check session ID format (expected UUID)"
      );
    });

    test("returns suggestion for SESSION_NOT_FOUND", () => {
      expect(getSuggestion(ErrorCode.SESSION_NOT_FOUND)).toBe(
        "Run 'memory list' to see available sessions"
      );
    });

    test("returns suggestion for SOURCE_INACCESSIBLE", () => {
      expect(getSuggestion(ErrorCode.SOURCE_INACCESSIBLE)).toBe(
        "Check that ~/.claude/projects exists and is readable"
      );
    });

    test("returns suggestion for DISK_FULL", () => {
      expect(getSuggestion(ErrorCode.DISK_FULL)).toBe(
        "Free up disk space and retry"
      );
    });

    test("returns suggestion for INVALID_JSON", () => {
      expect(getSuggestion(ErrorCode.INVALID_JSON)).toBe(
        "Check file for JSON syntax errors"
      );
    });

    test("returns suggestion for UNKNOWN_FORMAT", () => {
      expect(getSuggestion(ErrorCode.UNKNOWN_FORMAT)).toBe(
        "File may be incompatible with current version"
      );
    });

    test("returns suggestion for SYNC_INTERRUPTED", () => {
      expect(getSuggestion(ErrorCode.SYNC_INTERRUPTED)).toBe(
        "Run 'memory sync' again to resume"
      );
    });

    test("returns suggestion for SYNC_FAILED", () => {
      expect(getSuggestion(ErrorCode.SYNC_FAILED)).toBe(
        `Check logs at ${getLogDir()} for details`
      );
    });

    test("returns suggestion for INVALID_ARGUMENT", () => {
      expect(getSuggestion(ErrorCode.INVALID_ARGUMENT)).toBe(
        "Run command with --help to see valid options"
      );
    });

    test("returns suggestion for MISSING_ARGUMENT", () => {
      expect(getSuggestion(ErrorCode.MISSING_ARGUMENT)).toBe(
        "Run command with --help to see required arguments"
      );
    });

    test("returns suggestion for VECTOR_UNAVAILABLE", () => {
      const suggestion = getSuggestion(ErrorCode.VECTOR_UNAVAILABLE);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain("memory sync --embed");
    });

    test("returns suggestion for PROVIDER_TIMEOUT", () => {
      const suggestion = getSuggestion(ErrorCode.PROVIDER_TIMEOUT);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain("provider");
    });

    test("returns suggestion for PROVIDER_CONFIG_INVALID", () => {
      const suggestion = getSuggestion(ErrorCode.PROVIDER_CONFIG_INVALID);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain("config");
    });

    test("returns suggestion for EMBEDDING_DIMENSION_MISMATCH", () => {
      const suggestion = getSuggestion(ErrorCode.EMBEDDING_DIMENSION_MISMATCH);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain("re-embed");
    });

    test("returns suggestion for MODEL_CORRUPTED", () => {
      const suggestion = getSuggestion(ErrorCode.MODEL_CORRUPTED);
      expect(suggestion).not.toBeNull();
      expect(suggestion).toContain("memory sync --embed");
    });

    test("returns null for UNKNOWN", () => {
      expect(getSuggestion(ErrorCode.UNKNOWN)).toBeNull();
    });
  });

  describe("formatError", () => {
    describe("with MemoryError", () => {
      test("formats basic error with code and message", () => {
        const error = new MemoryError(
          ErrorCode.SESSION_NOT_FOUND,
          "Session abc123 not found"
        );

        const result = formatError(error, { useColor: false });

        expect(result).toContain("Error [SESSION_NOT_FOUND]:");
        expect(result).toContain("Session abc123 not found");
      });

      test("includes context values", () => {
        const error = new MemoryError(
          ErrorCode.INVALID_JSON,
          "Failed to parse line 42",
          {
            file: "session.jsonl",
            line: 42,
          }
        );

        const result = formatError(error, { useColor: false });

        expect(result).toContain("file: session.jsonl");
        expect(result).toContain("line: 42");
      });

      test("formats complex context values as JSON", () => {
        const error = new MemoryError(
          ErrorCode.SYNC_INTERRUPTED,
          "Sync was interrupted",
          {
            progress: { completed: 45, total: 100 },
          }
        );

        const result = formatError(error, { useColor: false });

        expect(result).toContain('progress: {"completed":45,"total":100}');
      });

      test("includes suggestion when available", () => {
        const error = new MemoryError(
          ErrorCode.SOURCE_INACCESSIBLE,
          "Cannot read session directory"
        );

        const result = formatError(error, { useColor: false });

        expect(result).toContain("Suggestion:");
        expect(result).toContain(
          "Check that ~/.claude/projects exists and is readable"
        );
      });

      test("omits suggestion for UNKNOWN errors", () => {
        const error = new MemoryError(
          ErrorCode.UNKNOWN,
          "Something went wrong"
        );

        const result = formatError(error, { useColor: false });

        expect(result).not.toContain("Suggestion:");
      });

      test("includes stack trace when verbose", () => {
        const error = new MemoryError(
          ErrorCode.DB_CORRUPTED,
          "Database corrupted"
        );

        const result = formatError(error, { verbose: true, useColor: false });

        expect(result).toContain("Stack trace:");
        expect(result).toContain("MemoryError");
      });

      test("omits stack trace when not verbose", () => {
        const error = new MemoryError(
          ErrorCode.DB_CORRUPTED,
          "Database corrupted"
        );

        const result = formatError(error, { verbose: false, useColor: false });

        expect(result).not.toContain("Stack trace:");
      });
    });

    describe("with regular Error", () => {
      test("formats basic error", () => {
        const error = new Error("Something went wrong");

        const result = formatError(error, { useColor: false });

        expect(result).toContain("Error:");
        expect(result).toContain("Something went wrong");
      });

      test("includes stack trace when verbose", () => {
        const error = new Error("Something went wrong");

        const result = formatError(error, { verbose: true, useColor: false });

        expect(result).toContain("Stack trace:");
      });

      test("does not include suggestion", () => {
        const error = new Error("Something went wrong");

        const result = formatError(error, { useColor: false });

        expect(result).not.toContain("Suggestion:");
      });
    });

    describe("color handling", () => {
      test("applies red color when useColor is true", () => {
        const error = new MemoryError(
          ErrorCode.DB_LOCKED,
          "Database locked"
        );

        const result = formatError(error, { useColor: true });

        // ANSI red: \x1b[31m
        expect(result).toContain("\x1b[31m");
        expect(result).toContain("\x1b[0m");
      });

      test("no color when useColor is false", () => {
        const error = new MemoryError(
          ErrorCode.DB_LOCKED,
          "Database locked"
        );

        const result = formatError(error, { useColor: false });

        expect(result).not.toContain("\x1b[31m");
        expect(result).not.toContain("\x1b[0m");
      });
    });
  });

  describe("formatErrorJson", () => {
    describe("with MemoryError", () => {
      test("returns valid JSON string", () => {
        const error = new MemoryError(
          ErrorCode.SESSION_NOT_FOUND,
          "Session not found"
        );

        const result = formatErrorJson(error);

        expect(() => JSON.parse(result)).not.toThrow();
      });

      test("returns correct structure without context", () => {
        const error = new MemoryError(
          ErrorCode.DISK_FULL,
          "Disk is full"
        );

        const result = JSON.parse(formatErrorJson(error));

        expect(result).toEqual({
          error: {
            code: "DISK_FULL",
            message: "Disk is full",
          },
        });
      });

      test("returns correct structure with context", () => {
        const error = new MemoryError(
          ErrorCode.INVALID_JSON,
          "Parse error at line 5",
          {
            file: "test.jsonl",
            line: 5,
          }
        );

        const result = JSON.parse(formatErrorJson(error));

        expect(result).toEqual({
          error: {
            code: "INVALID_JSON",
            message: "Parse error at line 5",
            context: {
              file: "test.jsonl",
              line: 5,
            },
          },
        });
      });
    });

    describe("with regular Error", () => {
      test("returns valid JSON string", () => {
        const error = new Error("Generic error");

        const result = formatErrorJson(error);

        expect(() => JSON.parse(result)).not.toThrow();
      });

      test("returns UNKNOWN code for regular errors", () => {
        const error = new Error("Something broke");

        const result = JSON.parse(formatErrorJson(error));

        expect(result).toEqual({
          error: {
            code: "UNKNOWN",
            message: "Something broke",
          },
        });
      });
    });

    describe("JSON validity", () => {
      test("escapes special characters in message", () => {
        const error = new MemoryError(
          ErrorCode.INVALID_JSON,
          'Invalid JSON: "unexpected token"'
        );

        const result = formatErrorJson(error);

        expect(() => JSON.parse(result)).not.toThrow();
        const parsed = JSON.parse(result);
        expect(parsed.error.message).toBe('Invalid JSON: "unexpected token"');
      });

      test("escapes newlines in message", () => {
        const error = new MemoryError(
          ErrorCode.UNKNOWN,
          "Line 1\nLine 2"
        );

        const result = formatErrorJson(error);

        expect(() => JSON.parse(result)).not.toThrow();
        const parsed = JSON.parse(result);
        expect(parsed.error.message).toBe("Line 1\nLine 2");
      });

      test("handles unicode in message", () => {
        const error = new MemoryError(
          ErrorCode.UNKNOWN,
          "Error with unicode: \u2603"
        );

        const result = formatErrorJson(error);

        expect(() => JSON.parse(result)).not.toThrow();
        const parsed = JSON.parse(result);
        expect(parsed.error.message).toContain("\u2603");
      });
    });
  });
});
