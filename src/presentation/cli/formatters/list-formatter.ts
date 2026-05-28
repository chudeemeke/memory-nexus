/**
 * List Formatter
 *
 * Strategy pattern for formatting session list results.
 * Supports default, JSON, quiet, and verbose output modes.
 */

import type { Session } from "../../../domain/entities/session.js";
import { formatTimestamp, formatRelativeTime } from "./timestamp-formatter.js";
import { dim } from "./color.js";
import { padToWidth } from "./text-width.js";
import { unknownErrorMessage } from "../../../domain/errors/unknown-error.js";

/**
 * Output mode for list formatter.
 *
 * Phase 32 (CLI-03) extension: `brief` produces single-line-per-session
 * output for AI/script consumption. See {@link BriefListFormatter}.
 */
export type ListOutputMode = "default" | "json" | "quiet" | "verbose" | "brief";

/**
 * Options for formatting session list.
 */
export interface ListFormatOptions {
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** List of filters that were applied */
  filtersApplied?: string[];
}

/**
 * List formatter interface.
 */
export interface ListFormatter {
  /**
   * Format sessions for display.
   */
  formatSessions(sessions: Session[], options?: ListFormatOptions): string;

  /**
   * Format an error message.
   */
  formatError(error: Error): string;

  /**
   * Format empty result message.
   */
  formatEmpty(): string;
}

/**
 * Create a list formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns ListFormatter instance
 */
export function createListFormatter(
  mode: ListOutputMode,
  useColor: boolean
): ListFormatter {
  switch (mode) {
    case "json":
      return new JsonListFormatter();
    case "quiet":
      return new QuietListFormatter();
    case "verbose":
      return new VerboseListFormatter(useColor);
    case "brief":
      return new BriefListFormatter();
    default:
      return new DefaultListFormatter(useColor);
  }
}

/**
 * Pluralize a word based on count.
 */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * Default list formatter with table-like output.
 */
class DefaultListFormatter implements ListFormatter {
  constructor(private useColor: boolean) {}

  formatSessions(sessions: Session[], _options?: ListFormatOptions): string {
    const count = sessions.length;
    let output = `Sessions (${count} ${pluralize(count, "result", "results")}):\n\n`;

    for (const session of sessions) {
      output += this.formatSession(session);
    }

    return output;
  }

  private formatSession(session: Session): string {
    const idShort = session.id.substring(0, 8);
    const projectName = session.projectPath.projectName;
    const relative = formatRelativeTime(session.startTime);
    const messageCount = session.messageCount;
    const messageText = `${messageCount} ${pluralize(messageCount, "message", "messages")}`;

    // Pad columns for alignment (width-aware for CJK/emoji content)
    const idCol = padToWidth(idShort, 10);
    const projectCol = padToWidth(projectName, 20);
    const timeCol = padToWidth(relative, 18);

    return `  ${idCol}${projectCol}${timeCol}${dim(messageText, this.useColor)}\n`;
  }

  formatError(error: Error): string {
    const message = unknownErrorMessage(error);
    return `Error: ${message}`;
  }

  formatEmpty(): string {
    return "No sessions found. Run 'memory sync' to import sessions.";
  }
}

/**
 * Brief list formatter — single-line-per-session, AI/script-optimized.
 *
 * Phase 32 (CLI-03) addition. Produces:
 *   <sessionId-short> <projectName> <messageCount> <relativeTime>
 *
 * No headers, no execution-details block. No color (brief is for
 * plain text consumers).
 */
class BriefListFormatter implements ListFormatter {
  formatSessions(sessions: Session[], _options?: ListFormatOptions): string {
    if (sessions.length === 0) {
      return this.formatEmpty();
    }
    return sessions
      .map((s) => {
        const idShort = s.id.substring(0, 8);
        const project = s.projectPath.projectName;
        const msgs = s.messageCount;
        const time = formatRelativeTime(s.startTime);
        return `${idShort} ${project} ${msgs} ${time}`;
      })
      .join("\n");
  }

  formatError(error: Error): string {
    const message = unknownErrorMessage(error);
    return `Error: ${message}`;
  }

  formatEmpty(): string {
    return "No sessions found.";
  }
}

/**
 * JSON list formatter - full session data as JSON array.
 */
class JsonListFormatter implements ListFormatter {
  formatSessions(sessions: Session[], _options?: ListFormatOptions): string {
    const jsonSessions = sessions.map((s) => ({
      id: s.id,
      projectPath: s.projectPath.decoded,
      projectName: s.projectPath.projectName,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime?.toISOString() ?? null,
      messageCount: s.messageCount,
    }));

    return JSON.stringify(jsonSessions, null, 2);
  }

  formatError(error: Error): string {
    const message = unknownErrorMessage(error);
    return JSON.stringify({ error: message });
  }

  formatEmpty(): string {
    return "[]";
  }
}

/**
 * Quiet list formatter - session IDs only.
 */
class QuietListFormatter implements ListFormatter {
  formatSessions(sessions: Session[], _options?: ListFormatOptions): string {
    if (sessions.length === 0) {
      return "";
    }

    return sessions.map((s) => s.id).join("\n");
  }

  formatError(error: Error): string {
    const message = unknownErrorMessage(error);
    return `Error: ${message}`;
  }

  formatEmpty(): string {
    return "";
  }
}

/**
 * Verbose list formatter - full details with timing.
 */
class VerboseListFormatter implements ListFormatter {
  constructor(private useColor: boolean) {}

  formatSessions(sessions: Session[], options?: ListFormatOptions): string {
    let output = "";

    // Show execution details if provided
    if (options) {
      output += "=== Execution Details ===\n";
      if (options.executionTimeMs !== undefined) {
        output += `Time: ${options.executionTimeMs}ms\n`;
      }
      if (options.filtersApplied && options.filtersApplied.length > 0) {
        output += `Filters: ${options.filtersApplied.join(", ")}\n`;
      }
      output += "\n";
    }

    const count = sessions.length;
    output += `Sessions (${count} ${pluralize(count, "result", "results")}):\n\n`;

    for (const session of sessions) {
      output += this.formatSession(session);
    }

    return output;
  }

  private formatSession(session: Session): string {
    // Full session ID in verbose mode
    const projectName = session.projectPath.projectName;
    const projectPath = session.projectPath.decoded;
    const timestamp = formatTimestamp(session.startTime);
    const messageCount = session.messageCount;
    const messageText = `${messageCount} ${pluralize(messageCount, "message", "messages")}`;

    let output = `  ${session.id}\n`;
    output += `    Project: ${projectName} (${projectPath})\n`;
    output += `    Started: ${timestamp}\n`;
    output += `    ${dim(messageText, this.useColor)}\n\n`;

    return output;
  }

  formatError(error: Error): string {
    const message = unknownErrorMessage(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatEmpty(): string {
    return "No sessions found. Run 'memory sync' to import sessions.";
  }
}
