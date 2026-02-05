/**
 * Error Codes Tests
 */

import { describe, expect, test } from "bun:test";
import { ErrorCode, type ErrorCodeType } from "./error-codes.js";

describe("ErrorCode", () => {
  test("contains database error codes", () => {
    expect(ErrorCode.DB_CONNECTION_FAILED).toBe("DB_CONNECTION_FAILED");
    expect(ErrorCode.DB_CORRUPTED).toBe("DB_CORRUPTED");
    expect(ErrorCode.DB_LOCKED).toBe("DB_LOCKED");
  });

  test("contains session error codes", () => {
    expect(ErrorCode.INVALID_SESSION_ID).toBe("INVALID_SESSION_ID");
    expect(ErrorCode.SESSION_NOT_FOUND).toBe("SESSION_NOT_FOUND");
  });

  test("contains file error codes", () => {
    expect(ErrorCode.SOURCE_INACCESSIBLE).toBe("SOURCE_INACCESSIBLE");
    expect(ErrorCode.DISK_FULL).toBe("DISK_FULL");
  });

  test("contains parse error codes", () => {
    expect(ErrorCode.INVALID_JSON).toBe("INVALID_JSON");
    expect(ErrorCode.UNKNOWN_FORMAT).toBe("UNKNOWN_FORMAT");
  });

  test("contains sync error codes", () => {
    expect(ErrorCode.SYNC_INTERRUPTED).toBe("SYNC_INTERRUPTED");
    expect(ErrorCode.SYNC_FAILED).toBe("SYNC_FAILED");
  });

  test("contains CLI error codes", () => {
    expect(ErrorCode.INVALID_ARGUMENT).toBe("INVALID_ARGUMENT");
    expect(ErrorCode.MISSING_ARGUMENT).toBe("MISSING_ARGUMENT");
  });

  test("contains UNKNOWN error code", () => {
    expect(ErrorCode.UNKNOWN).toBe("UNKNOWN");
  });

  test("ErrorCodeType accepts all error codes", () => {
    // Type check - these should compile without error
    const codes: ErrorCodeType[] = [
      ErrorCode.DB_CONNECTION_FAILED,
      ErrorCode.DB_CORRUPTED,
      ErrorCode.DB_LOCKED,
      ErrorCode.INVALID_SESSION_ID,
      ErrorCode.SESSION_NOT_FOUND,
      ErrorCode.SOURCE_INACCESSIBLE,
      ErrorCode.DISK_FULL,
      ErrorCode.INVALID_JSON,
      ErrorCode.UNKNOWN_FORMAT,
      ErrorCode.SYNC_INTERRUPTED,
      ErrorCode.SYNC_FAILED,
      ErrorCode.INVALID_ARGUMENT,
      ErrorCode.MISSING_ARGUMENT,
      ErrorCode.UNKNOWN,
    ];
    expect(codes).toHaveLength(14);
  });

  test("ErrorCode is frozen (immutable)", () => {
    // Verify that ErrorCode values are string literals (const assertion)
    const keys = Object.keys(ErrorCode);
    expect(keys.length).toBe(14);

    // Each key should equal its value
    for (const key of keys) {
      expect(ErrorCode[key as keyof typeof ErrorCode]).toBe(key);
    }
  });
});
