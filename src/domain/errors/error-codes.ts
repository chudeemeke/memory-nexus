/**
 * Error Codes
 *
 * Stable error codes for programmatic handling.
 * These codes are used in JSON error responses and for scripting.
 */

/**
 * Error code constant object.
 * All error types with stable string identifiers.
 */
export const ErrorCode = {
  // Database errors
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  DB_CORRUPTED: "DB_CORRUPTED",
  DB_LOCKED: "DB_LOCKED",

  // Session errors
  INVALID_SESSION_ID: "INVALID_SESSION_ID",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",

  // File errors
  SOURCE_INACCESSIBLE: "SOURCE_INACCESSIBLE",
  DISK_FULL: "DISK_FULL",

  // Parse errors
  INVALID_JSON: "INVALID_JSON",
  UNKNOWN_FORMAT: "UNKNOWN_FORMAT",

  // Sync errors
  SYNC_INTERRUPTED: "SYNC_INTERRUPTED",
  SYNC_FAILED: "SYNC_FAILED",

  // CLI errors
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  MISSING_ARGUMENT: "MISSING_ARGUMENT",

  // Generic
  UNKNOWN: "UNKNOWN",
} as const;

/**
 * Union type of all error codes.
 */
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
