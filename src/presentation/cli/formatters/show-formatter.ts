/**
 * Show Formatter
 *
 * Strategy pattern for formatting session detail with conversation thread display.
 * Supports default, JSON, quiet, verbose, and tools output modes.
 */

import type { Session } from "../../../domain/entities/session.js";
import type { Message } from "../../../domain/entities/message.js";
import type { ToolUse } from "../../../domain/entities/tool-use.js";
import { formatAbsoluteTime } from "./timestamp-formatter.js";
import { dim, bold } from "./color.js";

/**
 * Output mode for show formatter.
 */
export type ShowOutputMode = "default" | "json" | "quiet" | "verbose" | "tools";

/**
 * Session detail containing session, messages, and tool uses.
 */
export interface SessionDetail {
  session: Session;
  messages: Message[];
  toolUses: Map<string, ToolUse>;
}

/**
 * Options for formatting session detail.
 */
export interface ShowFormatOptions {
  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

/**
 * Show formatter interface.
 */
export interface ShowFormatter {
  /**
   * Format session detail for display.
   */
  formatSession(detail: SessionDetail, options?: ShowFormatOptions): string;

  /**
   * Format an error message.
   */
  formatError(error: Error): string;

  /**
   * Format session not found message.
   */
  formatNotFound(sessionId: string): string;
}

/**
 * Create a show formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns ShowFormatter instance
 */
export function createShowFormatter(
  mode: ShowOutputMode,
  useColor: boolean
): ShowFormatter {
  switch (mode) {
    case "json":
      return new JsonShowFormatter();
    case "quiet":
      return new QuietShowFormatter();
    case "verbose":
      return new VerboseShowFormatter(useColor);
    case "tools":
      return new ToolsShowFormatter(useColor);
    default:
      return new DefaultShowFormatter(useColor);
  }
}

/**
 * Extract basename from a file path.
 */
function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

/**
 * Summarize a tool result for inline display.
 *
 * @param tool Tool use to summarize
 * @returns Brief summary string
 */
export function summarizeToolResult(tool: ToolUse): string {
  switch (tool.name) {
    case "Read": {
      const path = tool.input.file_path as string;
      const lines = tool.result?.split("\n").length ?? 0;
      return `${basename(path)} -> ${lines} lines`;
    }
    case "Write": {
      const path = tool.input.file_path as string;
      return basename(path);
    }
    case "Edit": {
      const path = tool.input.file_path as string;
      return `${basename(path)} edited`;
    }
    case "Bash": {
      if (!tool.isSuccess) {
        return "FAILED";
      }
      const cmd = (tool.input.command as string).substring(0, 20);
      return cmd.length < (tool.input.command as string).length
        ? `${cmd}...`
        : cmd;
    }
    case "Glob": {
      const count = tool.result?.split("\n").filter(Boolean).length ?? 0;
      return `${count} files`;
    }
    case "Grep": {
      return tool.isSuccess ? "matches" : "no matches";
    }
    default:
      return tool.status;
  }
}

/**
 * Format duration in human-readable format.
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return "< 1m";
}

/**
 * Format session header.
 */
function formatHeader(
  detail: SessionDetail,
  _useColor: boolean
): string {
  const { session, messages, toolUses } = detail;
  const lines: string[] = [];

  lines.push(`Session: ${session.id}`);
  lines.push(`Project: ${session.projectPath.projectName}`);

  // Date range
  const startStr = formatAbsoluteTime(session.startTime);
  const endStr = session.endTime
    ? formatAbsoluteTime(session.endTime)
    : "ongoing";
  lines.push(`Date: ${startStr} - ${endStr}`);

  // Duration
  if (session.durationMs !== undefined) {
    lines.push(`Duration: ${formatDuration(session.durationMs)}`);
  } else {
    lines.push(`Duration: ongoing`);
  }

  // Counts
  const toolCount = toolUses.size;
  lines.push(`Messages: ${messages.length} | Tools: ${toolCount}`);
  lines.push("---");

  return lines.join("\n");
}

/**
 * Format a message with role prefix and timestamp.
 */
function formatMessage(
  message: Message,
  toolUses: Map<string, ToolUse>,
  useColor: boolean,
  showInlineTools: boolean
): string {
  const rolePrefix =
    message.role === "user"
      ? bold("[USER]", useColor)
      : bold("[ASSISTANT]", useColor);
  const timestamp = formatAbsoluteTime(message.timestamp);

  let output = `${rolePrefix} ${dim(timestamp, useColor)}\n`;
  output += message.content;

  // Add inline tool markers for assistant messages
  if (showInlineTools && message.role === "assistant" && message.hasToolUses) {
    const markers: string[] = [];
    for (const toolId of message.toolUses) {
      const tool = toolUses.get(toolId);
      if (tool) {
        markers.push(`[${tool.name}: ${summarizeToolResult(tool)}]`);
      }
    }
    if (markers.length > 0) {
      output += `\n${markers.join(" ")}`;
    }
  }

  return output;
}

/**
 * Default show formatter with conversation thread display.
 */
class DefaultShowFormatter implements ShowFormatter {
  constructor(private useColor: boolean) {}

  formatSession(detail: SessionDetail, _options?: ShowFormatOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(formatHeader(detail, this.useColor));
    lines.push("");

    // Conversation thread
    for (const message of detail.messages) {
      lines.push(formatMessage(message, detail.toolUses, this.useColor, true));
      lines.push("");
    }

    return lines.join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatNotFound(sessionId: string): string {
    return `Session not found: ${sessionId}`;
  }
}

/**
 * JSON show formatter - full session detail as JSON.
 */
class JsonShowFormatter implements ShowFormatter {
  formatSession(detail: SessionDetail, _options?: ShowFormatOptions): string {
    const { session, messages, toolUses } = detail;

    const jsonOutput = {
      session: {
        id: session.id,
        projectPath: session.projectPath.decoded,
        projectName: session.projectPath.projectName,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString() ?? null,
        durationMs: session.durationMs ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        toolUseIds: m.toolUses,
      })),
      toolUses: Object.fromEntries(
        Array.from(toolUses.entries()).map(([id, tool]) => [
          id,
          {
            id: tool.id,
            name: tool.name,
            input: tool.input,
            timestamp: tool.timestamp.toISOString(),
            status: tool.status,
            result: tool.result ?? null,
          },
        ])
      ),
    };

    return JSON.stringify(jsonOutput, null, 2);
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }

  formatNotFound(sessionId: string): string {
    return JSON.stringify({ error: `Session not found: ${sessionId}` });
  }
}

/**
 * Quiet show formatter - message content only, minimal decoration.
 */
class QuietShowFormatter implements ShowFormatter {
  formatSession(detail: SessionDetail, _options?: ShowFormatOptions): string {
    const lines: string[] = [];

    for (const message of detail.messages) {
      const prefix = message.role === "user" ? "U:" : "A:";
      lines.push(`${prefix} ${message.content}`);
    }

    return lines.join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatNotFound(sessionId: string): string {
    return `Session not found: ${sessionId}`;
  }
}

/**
 * Verbose show formatter - full details with execution info and full tool results.
 */
class VerboseShowFormatter implements ShowFormatter {
  constructor(private useColor: boolean) {}

  formatSession(detail: SessionDetail, options?: ShowFormatOptions): string {
    const lines: string[] = [];

    // Execution details
    if (options?.executionTimeMs !== undefined) {
      lines.push("=== Execution Details ===");
      lines.push(`Time: ${options.executionTimeMs}ms`);
      lines.push("");
    }

    // Header
    lines.push(formatHeader(detail, this.useColor));
    lines.push("");

    // Conversation thread with full tool details
    for (const message of detail.messages) {
      lines.push(formatMessage(message, detail.toolUses, this.useColor, true));

      // Show full tool details after message
      if (message.role === "assistant" && message.hasToolUses) {
        for (const toolId of message.toolUses) {
          const tool = detail.toolUses.get(toolId);
          if (tool) {
            lines.push("");
            lines.push(`  [TOOL: ${tool.name}]`);
            lines.push(`  Input: ${JSON.stringify(tool.input)}`);
            if (tool.result) {
              // No truncation in verbose mode
              lines.push(`  Result: ${tool.result}`);
            }
            lines.push(`  Status: ${tool.status}`);
          }
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatNotFound(sessionId: string): string {
    return `Session not found: ${sessionId}`;
  }
}

/**
 * Tools show formatter - shows detailed tool inputs and outputs.
 */
class ToolsShowFormatter implements ShowFormatter {
  private static readonly RESULT_TRUNCATE_LENGTH = 500;

  constructor(private useColor: boolean) {}

  formatSession(detail: SessionDetail, _options?: ShowFormatOptions): string {
    const lines: string[] = [];

    // Header
    lines.push(formatHeader(detail, this.useColor));
    lines.push("");

    // Conversation thread with detailed tool info
    for (const message of detail.messages) {
      lines.push(formatMessage(message, detail.toolUses, this.useColor, false));

      // Show detailed tool info after assistant messages
      if (message.role === "assistant" && message.hasToolUses) {
        for (const toolId of message.toolUses) {
          const tool = detail.toolUses.get(toolId);
          if (tool) {
            lines.push("");
            lines.push(`  [TOOL: ${tool.name}]`);
            lines.push(`  Input: ${JSON.stringify(tool.input)}`);
            if (tool.result) {
              const truncated = tool.result.length > ToolsShowFormatter.RESULT_TRUNCATE_LENGTH
                ? tool.result.substring(0, ToolsShowFormatter.RESULT_TRUNCATE_LENGTH) + "..."
                : tool.result;
              lines.push(`  Result: ${truncated}`);
            }
            lines.push(`  Status: ${tool.status}`);
          }
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatNotFound(sessionId: string): string {
    return `Session not found: ${sessionId}`;
  }
}
