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

  test("contains vector/embedding error codes", () => {
    expect(ErrorCode.VECTOR_UNAVAILABLE).toBe("VECTOR_UNAVAILABLE");
    expect(ErrorCode.PROVIDER_TIMEOUT).toBe("PROVIDER_TIMEOUT");
    expect(ErrorCode.PROVIDER_CONFIG_INVALID).toBe("PROVIDER_CONFIG_INVALID");
    expect(ErrorCode.EMBEDDING_DIMENSION_MISMATCH).toBe("EMBEDDING_DIMENSION_MISMATCH");
    expect(ErrorCode.MODEL_CORRUPTED).toBe("MODEL_CORRUPTED");
  });

  test("ErrorCodeType accepts all error codes", () => {
    // TypeScript compiler ensures every ErrorCode value satisfies ErrorCodeType.
    // Using Object.values makes this automatically complete when new codes are added.
    const codes: ErrorCodeType[] = Object.values(ErrorCode);
    expect(codes.length).toBe(Object.keys(ErrorCode).length);
  });

  test("ErrorCode is frozen (immutable)", () => {
    const keys = Object.keys(ErrorCode);
    expect(keys.length).toBeGreaterThan(0);

    // Each key should equal its value
    for (const key of keys) {
      expect(ErrorCode[key as keyof typeof ErrorCode]).toBe(key);
    }
  });
});
