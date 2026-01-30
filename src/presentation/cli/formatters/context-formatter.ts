/**
 * Context Formatter
 *
 * Strategy pattern for formatting project context output.
 * Supports brief, detailed, JSON, quiet, and verbose output modes.
 */

import type { ProjectContext, ToolUsage } from "../../../infrastructure/database/services/context-service.js";
import { formatTimestamp, formatRelativeTime } from "./timestamp-formatter.js";
import { dim, bold } from "./color.js";

/**
 * Output mode for context formatter.
 */
export type ContextOutputMode = "default" | "json" | "brief" | "detailed" | "quiet" | "verbose";

/**
 * Options for formatting context.
 */
export interface ContextFormatOptions {
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** List of filters that were applied */
  filtersApplied?: string[];
}

/**
 * Context formatter interface.
 */
export interface ContextFormatter {
  /**
   * Format project context for display.
   */
  formatContext(context: ProjectContext, options?: ContextFormatOptions): string;

  /**
   * Format an error message.
   */
  formatError(error: Error): string;

  /**
   * Format empty result message (project not found).
   */
  formatEmpty(projectName: string): string;

  /**
   * Format message when no topics extracted yet.
   */
  formatNoTopics(): string;
}

/**
 * Create a context formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns ContextFormatter instance
 */
export function createContextFormatter(
  mode: ContextOutputMode,
  useColor: boolean
): ContextFormatter {
  switch (mode) {
    case "json":
      return new JsonContextFormatter();
    case "quiet":
      return new QuietContextFormatter();
    case "verbose":
      return new VerboseContextFormatter(useColor);
    case "detailed":
      return new DetailedContextFormatter(useColor);
    case "brief":
    case "default":
    default:
      return new BriefContextFormatter(useColor);
  }
}

/**
 * Format number with thousands separator.
 */
function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * Format tool usage as compact string.
 */
function formatToolsCompact(tools: ToolUsage[], maxShow: number = 3): string {
  if (tools.length === 0) {
    return "";
  }

  const shown = tools.slice(0, maxShow);
  const rest = tools.length - maxShow;

  const formatted = shown.map((t) => `${t.name} (${t.count})`).join(", ");

  if (rest > 0) {
    return `${formatted} (+${rest} more)`;
  }

  return formatted;
}

/**
 * Format topics as compact string.
 */
function formatTopicsCompact(topics: string[], maxShow: number = 3): string {
  if (topics.length === 0) {
    return "";
  }

  const shown = topics.slice(0, maxShow);
  const rest = topics.length - maxShow;

  const formatted = shown.join(", ");

  if (rest > 0) {
    return `${formatted} (+${rest} more)`;
  }

  return formatted;
}

/**
 * Brief context formatter - compact single-line structure.
 */
class BriefContextFormatter implements ContextFormatter {
  constructor(private useColor: boolean) {}

  formatContext(context: ProjectContext, _options?: ContextFormatOptions): string {
    let output = "";

    // Header
    output += bold(`${context.projectName} Context`, this.useColor) + "\n";

    // Summary line
    const lastActive = context.lastActivity
      ? formatRelativeTime(context.lastActivity)
      : "never";
    output += `Sessions: ${formatNumber(context.sessionCount)} | `;
    output += `Messages: ${formatNumber(context.totalMessages)} | `;
    output += `Last active: ${lastActive}\n`;

    // Topics (if any)
    const topicsStr = formatTopicsCompact(context.recentTopics);
    if (topicsStr) {
      output += `Topics: ${topicsStr}\n`;
    }

    // Tools (if any)
    const toolsStr = formatToolsCompact(context.recentToolUses);
    if (toolsStr) {
      output += `Tools: ${toolsStr}\n`;
    }

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(projectName: string): string {
    return `No sessions found for project matching '${projectName}'`;
  }

  formatNoTopics(): string {
    return dim("No topics extracted yet", this.useColor);
  }
}

/**
 * Detailed context formatter - full breakdown.
 */
class DetailedContextFormatter implements ContextFormatter {
  constructor(private useColor: boolean) {}

  formatContext(context: ProjectContext, _options?: ContextFormatOptions): string {
    let output = "";

    // Header with separator
    output += bold(`${context.projectName} Context`, this.useColor) + "\n";
    output += "=".repeat(40) + "\n\n";

    // Project info
    output += `Project: ${context.projectPathDecoded}\n`;
    output += `Sessions: ${formatNumber(context.sessionCount)}\n`;
    output += `Messages: ${formatNumber(context.totalMessages)}`;
    output += ` (user: ${formatNumber(context.userMessages)}, assistant: ${formatNumber(context.assistantMessages)})\n`;

    // Last activity with full timestamp
    if (context.lastActivity) {
      output += `Last active: ${formatTimestamp(context.lastActivity)}\n`;
    } else {
      output += `Last active: never\n`;
    }

    // Topics section
    output += "\nTopics:\n";
    if (context.recentTopics.length > 0) {
      for (const topic of context.recentTopics) {
        output += `  - ${topic}\n`;
      }
    } else {
      output += dim("  (no topics extracted yet)\n", this.useColor);
    }

    // Tool usage section
    output += "\nTool Usage:\n";
    if (context.recentToolUses.length > 0) {
      for (const tool of context.recentToolUses) {
        output += `  - ${tool.name}: ${formatNumber(tool.count)} times\n`;
      }
    } else {
      output += dim("  (no tool usage recorded)\n", this.useColor);
    }

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(projectName: string): string {
    return `No sessions found for project matching '${projectName}'`;
  }

  formatNoTopics(): string {
    return dim("(no topics extracted yet)", this.useColor);
  }
}

/**
 * JSON context formatter - machine-readable output.
 */
class JsonContextFormatter implements ContextFormatter {
  formatContext(context: ProjectContext, _options?: ContextFormatOptions): string {
    const jsonContext = {
      projectName: context.projectName,
      projectPath: context.projectPathDecoded,
      sessionCount: context.sessionCount,
      totalMessages: context.totalMessages,
      userMessages: context.userMessages,
      assistantMessages: context.assistantMessages,
      lastActivity: context.lastActivity?.toISOString() ?? null,
      topics: context.recentTopics,
      toolUsage: context.recentToolUses,
    };

    return JSON.stringify(jsonContext, null, 2);
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }

  formatEmpty(projectName: string): string {
    return JSON.stringify({ error: `No sessions found for project matching '${projectName}'` });
  }

  formatNoTopics(): string {
    return JSON.stringify({ topics: [] });
  }
}

/**
 * Quiet context formatter - minimal single-line output.
 */
class QuietContextFormatter implements ContextFormatter {
  formatContext(context: ProjectContext, _options?: ContextFormatOptions): string {
    return `${context.projectName}: ${context.sessionCount} sessions, ${formatNumber(context.totalMessages)} messages`;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(_projectName: string): string {
    return "";
  }

  formatNoTopics(): string {
    return "";
  }
}

/**
 * Verbose context formatter - detailed with execution timing.
 */
class VerboseContextFormatter implements ContextFormatter {
  private detailed: DetailedContextFormatter;

  constructor(private useColor: boolean) {
    this.detailed = new DetailedContextFormatter(useColor);
  }

  formatContext(context: ProjectContext, options?: ContextFormatOptions): string {
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

    // Then detailed output
    output += this.detailed.formatContext(context, options);

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatEmpty(projectName: string): string {
    return `No sessions found for project matching '${projectName}'`;
  }

  formatNoTopics(): string {
    return this.detailed.formatNoTopics();
  }
}
