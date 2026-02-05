/**
 * Error Formatter
 *
 * Formats errors for CLI output with context, suggestions, and color.
 */

import {
  ErrorCode,
  MemoryNexusError,
  type ErrorCodeType,
} from "../../../domain/index.js";
import { red, shouldUseColor } from "./color.js";

/**
 * Options for error formatting.
 */
export interface ErrorFormatOptions {
  /**
   * Include stack trace in output.
   */
  verbose?: boolean;

  /**
   * Override TTY detection for color.
   */
  useColor?: boolean;
}

/**
 * Get a suggestion for corrective action based on error code.
 *
 * @param code Error code
 * @returns Suggestion string or null if no suggestion available
 */
export function getSuggestion(code: ErrorCodeType): string | null {
  switch (code) {
    case ErrorCode.DB_CONNECTION_FAILED:
      return "Check database file permissions";
    case ErrorCode.DB_CORRUPTED:
      return "Run 'memory doctor' to diagnose or recreate database";
    case ErrorCode.DB_LOCKED:
      return "Wait and retry, or check for other running processes";
    case ErrorCode.INVALID_SESSION_ID:
      return "Check session ID format (expected UUID)";
    case ErrorCode.SESSION_NOT_FOUND:
      return "Run 'memory list' to see available sessions";
    case ErrorCode.SOURCE_INACCESSIBLE:
      return "Check that ~/.claude/projects exists and is readable";
    case ErrorCode.DISK_FULL:
      return "Free up disk space and retry";
    case ErrorCode.INVALID_JSON:
      return "Check file for JSON syntax errors";
    case ErrorCode.UNKNOWN_FORMAT:
      return "File may be incompatible with current version";
    case ErrorCode.SYNC_INTERRUPTED:
      return "Run 'memory sync' again to resume";
    case ErrorCode.SYNC_FAILED:
      return "Check logs at ~/.memory-nexus/logs for details";
    case ErrorCode.INVALID_ARGUMENT:
      return "Run command with --help to see valid options";
    case ErrorCode.MISSING_ARGUMENT:
      return "Run command with --help to see required arguments";
    case ErrorCode.UNKNOWN:
    default:
      return null;
  }
}

/**
 * Format a context value for display.
 *
 * @param key Context key
 * @param value Context value
 * @returns Formatted context line
 */
function formatContextValue(key: string, value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return `  ${key}: ${value}`;
  }
  return `  ${key}: ${JSON.stringify(value)}`;
}

/**
 * Format an error for human-readable CLI output.
 *
 * @param error Error to format
 * @param options Formatting options
 * @returns Formatted error string
 */
export function formatError(
  error: Error | MemoryNexusError,
  options: ErrorFormatOptions = {}
): string {
  const useColor = options.useColor ?? shouldUseColor();
  const lines: string[] = [];

  if (error instanceof MemoryNexusError) {
    // Format: "Error [CODE]: message"
    const prefix = red(`Error [${error.code}]:`, useColor);
    lines.push(`${prefix} ${error.message}`);

    // Add context if available
    if (error.context && Object.keys(error.context).length > 0) {
      for (const [key, value] of Object.entries(error.context)) {
        lines.push(formatContextValue(key, value));
      }
    }

    // Add suggestion if available
    const suggestion = getSuggestion(error.code);
    if (suggestion) {
      lines.push("");
      lines.push(`Suggestion: ${suggestion}`);
    }
  } else {
    // Generic error
    const prefix = red("Error:", useColor);
    lines.push(`${prefix} ${error.message}`);
  }

  // Add stack trace if verbose
  if (options.verbose && error.stack) {
    lines.push("");
    lines.push("Stack trace:");
    lines.push(error.stack);
  }

  return lines.join("\n");
}

/**
 * JSON error structure for regular Error objects.
 */
interface GenericErrorJson {
  error: {
    code: "UNKNOWN";
    message: string;
  };
}

/**
 * Format an error as JSON for programmatic consumption.
 *
 * @param error Error to format
 * @returns JSON string with structured error
 */
export function formatErrorJson(error: Error | MemoryNexusError): string {
  if (error instanceof MemoryNexusError) {
    return JSON.stringify(error.toJSON());
  }

  // Generic error
  const json: GenericErrorJson = {
    error: {
      code: "UNKNOWN",
      message: error.message,
    },
  };
  return JSON.stringify(json);
}
