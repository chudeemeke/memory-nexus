/**
 * Memory Error
 *
 * Base error class with structured JSON output for programmatic handling.
 */

import type { ErrorCodeType } from "./error-codes.js";

/**
 * Context for error details.
 */
export type ErrorContext = Record<string, unknown>;

/**
 * JSON representation of a MemoryError.
 */
export interface ErrorJson {
  error: {
    code: ErrorCodeType;
    message: string;
    context?: ErrorContext;
  };
}

/**
 * Base error class for memory.
 *
 * Provides structured error information with:
 * - Stable error codes for programmatic handling
 * - Contextual information (file paths, line numbers, etc.)
 * - JSON serialization for machine-readable output
 */
export class MemoryError extends Error {
  /**
   * Stable error code for programmatic handling.
   */
  readonly code: ErrorCodeType;

  /**
   * Optional context with additional error details.
   */
  readonly context?: ErrorContext;

  /**
   * Create a new MemoryError.
   *
   * @param code Stable error code for programmatic handling
   * @param message Human-readable error message
   * @param context Optional additional context (file paths, line numbers, etc.)
   */
  constructor(code: ErrorCodeType, message: string, context?: ErrorContext) {
    super(message);
    this.name = "MemoryError";
    this.code = code;
    this.context = context;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MemoryError);
    }
  }

  /**
   * Convert error to JSON representation.
   *
   * @returns Structured error object for JSON output
   */
  toJSON(): ErrorJson {
    const result: ErrorJson = {
      error: {
        code: this.code,
        message: this.message,
      },
    };

    if (this.context && Object.keys(this.context).length > 0) {
      result.error.context = this.context;
    }

    return result;
  }
}
