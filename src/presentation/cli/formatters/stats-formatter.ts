/**
 * Stats Formatter
 *
 * Strategy pattern for formatting stats results.
 * Supports default, JSON, quiet, and verbose output modes.
 */

import type { StatsResult, ProjectStats } from "../../../domain/ports/services.js";

/**
 * Output mode for stats formatting.
 */
export type StatsOutputMode = "default" | "json" | "quiet" | "verbose";

/**
 * Hook status summary for stats display.
 */
export interface HooksSummary {
  /** Hooks are installed in Claude Code */
  installed: boolean;
  /** Auto-sync is enabled in config */
  autoSync: boolean;
  /** Number of sessions not yet synced */
  pendingSessions: number;
}

/**
 * Extended stats result with optional hook summary.
 */
export interface ExtendedStatsResult extends StatsResult {
  hooks?: HooksSummary;
}

/**
 * Options for formatting stats.
 */
export interface StatsFormatOptions {
  executionTimeMs?: number;
}

/**
 * Stats formatter interface.
 */
export interface StatsFormatter {
  formatStats(stats: ExtendedStatsResult, options?: StatsFormatOptions): string;
  formatError(error: Error): string;
  formatEmpty(): string;
}

/**
 * Format bytes into human-readable string.
 *
 * @param bytes Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * Format number with thousands separators.
 *
 * @param num Number to format
 * @returns Formatted string (e.g., "1,234,567")
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

/**
 * Create a stats formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns StatsFormatter instance
 */
export function createStatsFormatter(
  mode: StatsOutputMode,
  useColor: boolean
): StatsFormatter {
  switch (mode) {
    case "json":
      return new JsonStatsFormatter();
    case "quiet":
      return new QuietStatsFormatter();
    case "verbose":
      return new VerboseStatsFormatter(useColor);
    default:
      return new DefaultStatsFormatter(useColor);
  }
}

/**
 * Default stats formatter with headers and sections.
 */
class DefaultStatsFormatter implements StatsFormatter {
  constructor(private useColor: boolean) {}

  formatStats(stats: ExtendedStatsResult, _options?: StatsFormatOptions): string {
    let output = "";

    // Header
    output += "=== Database Statistics ===\n\n";

    // Totals section
    output += "Totals:\n";
    output += `  Sessions:   ${formatNumber(stats.totalSessions)}\n`;
    output += `  Messages:   ${formatNumber(stats.totalMessages)}\n`;
    output += `  Tool Uses:  ${formatNumber(stats.totalToolUses)}\n`;
    output += `  Size:       ${formatBytes(stats.databaseSizeBytes)}\n`;

    // Project breakdown
    if (stats.projectBreakdown.length > 0) {
      output += "\nProjects:\n";
      for (const project of stats.projectBreakdown) {
        output += `  ${project.projectName}\n`;
        output += `    Sessions: ${formatNumber(project.sessionCount)}`;
        output += `, Messages: ${formatNumber(project.messageCount)}\n`;
      }
    }

    // Hooks section
    if (stats.hooks) {
      output += "\nHooks:\n";
      output += `  Installed:        ${stats.hooks.installed ? "yes" : "no"}\n`;
      output += `  Auto-sync:        ${stats.hooks.autoSync ? "enabled" : "disabled"}\n`;
      output += `  Pending sessions: ${stats.hooks.pendingSessions}\n`;

      if (!stats.hooks.installed) {
        output += "\n  Run 'aidev memory install' to enable automatic sync\n";
      }
    }

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(): string {
    return "No sessions synced. Run 'memory sync' to import data.";
  }
}

/**
 * JSON stats formatter.
 */
class JsonStatsFormatter implements StatsFormatter {
  formatStats(stats: ExtendedStatsResult, options?: StatsFormatOptions): string {
    const output: Record<string, unknown> = {
      totalSessions: stats.totalSessions,
      totalMessages: stats.totalMessages,
      totalToolUses: stats.totalToolUses,
      databaseSizeBytes: stats.databaseSizeBytes,
      projectBreakdown: stats.projectBreakdown.map((p) => ({
        projectName: p.projectName,
        sessionCount: p.sessionCount,
        messageCount: p.messageCount,
      })),
    };

    if (options?.executionTimeMs !== undefined) {
      output.executionTimeMs = options.executionTimeMs;
    }

    if (stats.hooks) {
      output.hooks = {
        installed: stats.hooks.installed,
        autoSync: stats.hooks.autoSync,
        pendingSessions: stats.hooks.pendingSessions,
      };
    }

    return JSON.stringify(output, null, 2);
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }

  formatEmpty(): string {
    return JSON.stringify({
      totalSessions: 0,
      totalMessages: 0,
      totalToolUses: 0,
      databaseSizeBytes: 0,
      projectBreakdown: [],
      empty: true,
      message: "No sessions synced. Run 'memory sync' to import data.",
    });
  }
}

/**
 * Quiet stats formatter - minimal output.
 */
class QuietStatsFormatter implements StatsFormatter {
  formatStats(stats: ExtendedStatsResult, _options?: StatsFormatOptions): string {
    // Just numbers on separate lines: sessions, messages, tools, size
    return [
      String(stats.totalSessions),
      String(stats.totalMessages),
      String(stats.totalToolUses),
      String(stats.databaseSizeBytes),
    ].join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(): string {
    return "0\n0\n0\n0";
  }
}

/**
 * Verbose stats formatter - full details.
 */
class VerboseStatsFormatter implements StatsFormatter {
  constructor(private useColor: boolean) {}

  formatStats(stats: ExtendedStatsResult, options?: StatsFormatOptions): string {
    let output = "";

    // Execution header
    if (options?.executionTimeMs !== undefined) {
      output += "=== Execution Details ===\n";
      output += `Time: ${options.executionTimeMs}ms\n\n`;
    }

    // Header
    output += "=== Database Statistics ===\n\n";

    // Totals section with more detail
    output += "Totals:\n";
    output += `  Sessions:   ${formatNumber(stats.totalSessions)}\n`;
    output += `  Messages:   ${formatNumber(stats.totalMessages)}\n`;
    output += `  Tool Uses:  ${formatNumber(stats.totalToolUses)}\n`;
    output += `  Size:       ${formatBytes(stats.databaseSizeBytes)} (${formatNumber(stats.databaseSizeBytes)} bytes)\n`;

    // Project breakdown with full detail
    if (stats.projectBreakdown.length > 0) {
      output += `\nProjects (${stats.projectBreakdown.length}):\n`;
      for (const project of stats.projectBreakdown) {
        const avgMsgs =
          project.sessionCount > 0
            ? (project.messageCount / project.sessionCount).toFixed(1)
            : "0";
        output += `  ${project.projectName}\n`;
        output += `    Sessions: ${formatNumber(project.sessionCount)}`;
        output += `, Messages: ${formatNumber(project.messageCount)}`;
        output += ` (avg ${avgMsgs}/session)\n`;
      }
    }

    // Hooks section with detail
    if (stats.hooks) {
      output += "\nHooks:\n";
      output += `  Installed:        ${stats.hooks.installed ? "yes" : "no"}\n`;
      output += `  Auto-sync:        ${stats.hooks.autoSync ? "enabled" : "disabled"}\n`;
      output += `  Pending sessions: ${stats.hooks.pendingSessions}\n`;

      if (!stats.hooks.installed) {
        output += "\n  Run 'aidev memory install' to enable automatic sync\n";
      }
    }

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatEmpty(): string {
    return "No sessions synced. Run 'memory sync' to import data.";
  }
}
