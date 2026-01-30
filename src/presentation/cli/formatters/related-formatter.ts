/**
 * Related Formatter
 *
 * Strategy pattern for formatting related sessions output.
 * Supports default, brief, detailed, JSON, quiet, and verbose output modes.
 */

import type { Session } from "../../../domain/entities/session.js";
import { formatTimestamp, formatRelativeTime } from "./timestamp-formatter.js";
import { dim, green, yellow } from "./color.js";

/**
 * Output mode for related formatter.
 */
export type RelatedOutputMode = "default" | "json" | "brief" | "detailed" | "quiet" | "verbose";

/**
 * A session with its relationship weight and hop count.
 */
export interface RelatedSession {
  session: Session;
  weight: number;
  hops: number;
}

/**
 * Options for formatting related sessions.
 */
export interface RelatedFormatOptions {
  /** The source ID used for the query */
  sourceId: string;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
}

/**
 * Related formatter interface.
 */
export interface RelatedFormatter {
  /**
   * Format related sessions for display.
   */
  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string;

  /**
   * Format an error message.
   */
  formatError(error: Error): string;

  /**
   * Format empty result message (no relationships found for ID).
   */
  formatEmpty(sourceId: string): string;

  /**
   * Format message when links table is empty.
   */
  formatNoLinks(): string;
}

/**
 * Create a related formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns RelatedFormatter instance
 */
export function createRelatedFormatter(
  mode: RelatedOutputMode,
  useColor: boolean
): RelatedFormatter {
  switch (mode) {
    case "json":
      return new JsonRelatedFormatter();
    case "quiet":
      return new QuietRelatedFormatter();
    case "verbose":
      return new VerboseRelatedFormatter(useColor);
    case "detailed":
      return new DetailedRelatedFormatter(useColor);
    case "brief":
    case "default":
    default:
      return new BriefRelatedFormatter(useColor);
  }
}

/**
 * Format weight as colored percentage string.
 *
 * @param weight Weight value 0-1
 * @param useColor Whether to apply color
 * @returns Formatted percentage string
 */
function formatWeight(weight: number, useColor: boolean): string {
  const percentage = `${Math.round(weight * 100)}%`;

  if (!useColor) {
    return percentage;
  }

  // Color code based on weight thresholds
  if (weight > 0.75) {
    return green(percentage, useColor);
  }
  if (weight >= 0.50) {
    return yellow(percentage, useColor);
  }

  // No color for low weights
  return percentage;
}

/**
 * Format hops display for brief mode.
 *
 * @param hops Number of hops
 * @returns Formatted hops string
 */
function formatHopsBrief(hops: number): string {
  return hops === 1 ? "1 hop" : `${hops} hops`;
}

/**
 * Format hops display for detailed mode with direct/indirect.
 *
 * @param hops Number of hops
 * @returns Formatted hops string with qualifier
 */
function formatHopsDetailed(hops: number): string {
  const hopText = hops === 1 ? "1" : `${hops}`;
  const qualifier = hops === 1 ? "direct" : "indirect";
  return `${hopText} (${qualifier})`;
}

/**
 * Brief related formatter - compact numbered list.
 */
class BriefRelatedFormatter implements RelatedFormatter {
  constructor(private useColor: boolean) {}

  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string {
    if (sessions.length === 0) {
      return "";
    }

    const sourceId = options?.sourceId ?? "unknown";
    let output = `Related to session ${sourceId}...\n`;

    sessions.forEach((rel, index) => {
      const projectName = rel.session.projectPath.projectName;
      const relative = formatRelativeTime(rel.session.startTime);
      const weight = formatWeight(rel.weight, this.useColor);
      const hops = formatHopsBrief(rel.hops);

      output += `${index + 1}. ${projectName} (${weight}) - ${relative} [${hops}]\n`;
    });

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(sourceId: string): string {
    return `No relationships found for '${sourceId}'`;
  }

  formatNoLinks(): string {
    return "No relationships extracted yet. Run 'memory sync' to extract session data.";
  }
}

/**
 * Detailed related formatter - full session information.
 */
class DetailedRelatedFormatter implements RelatedFormatter {
  constructor(private useColor: boolean) {}

  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string {
    if (sessions.length === 0) {
      return "";
    }

    const sourceId = options?.sourceId ?? "unknown";
    let output = `Related to session ${sourceId}...\n`;
    output += "=".repeat(40) + "\n\n";

    sessions.forEach((rel, index) => {
      const session = rel.session;
      const projectName = session.projectPath.projectName;
      const projectPath = session.projectPath.decoded;
      const weight = formatWeight(rel.weight, this.useColor);
      const hops = formatHopsDetailed(rel.hops);
      const lastActive = formatTimestamp(session.startTime);
      const messageCount = session.messages.length;

      output += `${index + 1}. ${projectName}\n`;
      output += `   Weight: ${weight} | Hops: ${hops}\n`;
      output += `   Path: ${projectPath}\n`;
      output += `   Last active: ${lastActive}\n`;
      output += `   Messages: ${messageCount}\n\n`;
    });

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(sourceId: string): string {
    return `No relationships found for '${sourceId}'`;
  }

  formatNoLinks(): string {
    return "No relationships extracted yet. Run 'memory sync' to extract session data.";
  }
}

/**
 * JSON related formatter - machine-readable output.
 */
class JsonRelatedFormatter implements RelatedFormatter {
  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string {
    const sourceId = options?.sourceId ?? "unknown";

    const jsonOutput = {
      sourceId,
      related: sessions.map((rel) => ({
        sessionId: rel.session.id,
        projectName: rel.session.projectPath.projectName,
        weight: rel.weight,
        hops: rel.hops,
        lastActivity: rel.session.startTime.toISOString(),
        messageCount: rel.session.messages.length,
      })),
    };

    return JSON.stringify(jsonOutput, null, 2);
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }

  formatEmpty(sourceId: string): string {
    return JSON.stringify({ error: `No relationships found for '${sourceId}'` });
  }

  formatNoLinks(): string {
    return JSON.stringify({ error: "No relationships extracted yet" });
  }
}

/**
 * Quiet related formatter - session IDs only.
 */
class QuietRelatedFormatter implements RelatedFormatter {
  formatRelated(sessions: RelatedSession[], _options?: RelatedFormatOptions): string {
    if (sessions.length === 0) {
      return "";
    }

    return sessions.map((rel) => rel.session.id).join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatEmpty(_sourceId: string): string {
    return "";
  }

  formatNoLinks(): string {
    return "";
  }
}

/**
 * Verbose related formatter - detailed with execution timing.
 */
class VerboseRelatedFormatter implements RelatedFormatter {
  private detailed: DetailedRelatedFormatter;

  constructor(private useColor: boolean) {
    this.detailed = new DetailedRelatedFormatter(useColor);
  }

  formatRelated(sessions: RelatedSession[], options?: RelatedFormatOptions): string {
    let output = "";

    // Show execution details if provided
    if (options?.executionTimeMs !== undefined) {
      output += "=== Execution Details ===\n";
      output += `Time: ${options.executionTimeMs}ms\n`;
      output += "\n";
    }

    // Then detailed output
    output += this.detailed.formatRelated(sessions, options);

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatEmpty(sourceId: string): string {
    return this.detailed.formatEmpty(sourceId);
  }

  formatNoLinks(): string {
    return this.detailed.formatNoLinks();
  }
}
