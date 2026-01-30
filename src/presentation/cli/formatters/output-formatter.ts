/**
 * Output Formatter
 *
 * Strategy pattern for formatting search results.
 * Supports default, JSON, quiet, and verbose output modes.
 */

import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import { formatTimestamp } from "./timestamp-formatter.js";
import { bold } from "./color.js";

/**
 * Context budget for Claude consumption (50K characters).
 */
export const CONTEXT_BUDGET = 50000;

/**
 * Output mode enum.
 */
export type OutputMode = "default" | "json" | "quiet" | "verbose";

/**
 * Execution details for verbose mode.
 */
export interface ExecutionDetails {
  timeMs?: number;
  ftsQuery?: string;
  filtersApplied?: string[];
}

/**
 * Options for formatting results.
 */
export interface FormatOptions {
  query?: string;
  executionDetails?: ExecutionDetails;
  contextBudget?: number;
}

/**
 * Summary statistics.
 */
export interface SummaryStats {
  found: number;
  shown: number;
  truncated?: boolean;
}

/**
 * Output formatter interface.
 */
export interface OutputFormatter {
  formatResults(results: SearchResult[], options?: FormatOptions): string;
  formatError(error: Error): string;
  formatSummary(stats: SummaryStats): string;
}

/**
 * Create an output formatter for the given mode.
 *
 * @param mode Output mode
 * @param useColor Whether to use ANSI colors
 * @returns OutputFormatter instance
 */
export function createOutputFormatter(mode: OutputMode, useColor: boolean): OutputFormatter {
  switch (mode) {
    case "json":
      return new JsonOutputFormatter();
    case "quiet":
      return new QuietOutputFormatter();
    case "verbose":
      return new VerboseOutputFormatter(useColor);
    default:
      return new DefaultOutputFormatter(useColor);
  }
}

/**
 * Convert <mark> tags to ANSI bold codes.
 */
function highlightSnippet(snippet: string, useColor: boolean): string {
  if (!useColor) {
    // Remove <mark> tags entirely when not using color
    return snippet.replace(/<\/?mark>/g, "");
  }
  return snippet
    .replace(/<mark>/g, "\x1b[1m")
    .replace(/<\/mark>/g, "\x1b[0m");
}

/**
 * Default output formatter with headers and formatting.
 */
class DefaultOutputFormatter implements OutputFormatter {
  constructor(private useColor: boolean) {}

  formatResults(results: SearchResult[], options?: FormatOptions): string {
    const budget = options?.contextBudget ?? CONTEXT_BUDGET;

    if (results.length === 0) {
      return `No results found for: ${options?.query ?? "query"}`;
    }

    let output = `Found ${results.length} result(s):\n\n`;
    let truncated = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const line = this.formatResult(result, i + 1);

      if (output.length + line.length > budget) {
        truncated = true;
        output += `\n(Output truncated - ${CONTEXT_BUDGET.toLocaleString()} char limit)\n`;
        break;
      }

      output += line;
    }

    return output;
  }

  private formatResult(result: SearchResult, index: number): string {
    const scorePercent = (result.score * 100).toFixed(0);
    const sessionShort = result.sessionId.substring(0, 8);
    const timestamp = formatTimestamp(result.timestamp);
    const snippet = highlightSnippet(result.snippet, this.useColor);

    return `${index}. [${scorePercent}%] ${sessionShort}...\n   ${timestamp}\n   ${snippet}\n\n`;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatSummary(stats: SummaryStats): string {
    let summary = `Found ${stats.found} results (showing ${stats.shown})`;
    if (stats.truncated) {
      summary += " - truncated";
    }
    return summary;
  }
}

/**
 * JSON output formatter.
 */
class JsonOutputFormatter implements OutputFormatter {
  formatResults(results: SearchResult[], options?: FormatOptions): string {
    const budget = options?.contextBudget ?? CONTEXT_BUDGET;

    // Transform to JSON-friendly format
    const jsonResults = results.map((r) => ({
      sessionId: r.sessionId,
      messageId: r.messageId,
      score: r.score,
      timestamp: r.timestamp.toISOString(),
      snippet: r.snippet.replace(/<\/?mark>/g, ""), // Remove HTML tags
    }));

    // Check budget and truncate if needed
    let output = JSON.stringify(jsonResults, null, 2);

    if (output.length > budget) {
      // Find how many results fit
      let fitCount = jsonResults.length;
      while (fitCount > 0) {
        const truncatedResults = jsonResults.slice(0, fitCount);
        output = JSON.stringify(truncatedResults, null, 2);
        if (output.length <= budget) {
          break;
        }
        fitCount--;
      }
    }

    return output;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: message });
  }

  formatSummary(_stats: SummaryStats): string {
    // JSON mode includes summary in the data itself
    return "";
  }
}

/**
 * Quiet output formatter - minimal decoration.
 */
class QuietOutputFormatter implements OutputFormatter {
  formatResults(results: SearchResult[], _options?: FormatOptions): string {
    if (results.length === 0) {
      return "";
    }

    return results
      .map((r) => {
        const sessionShort = r.sessionId.substring(0, 8);
        const snippet = r.snippet.replace(/<\/?mark>/g, "");
        return `${sessionShort} ${snippet}`;
      })
      .join("\n");
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    return `Error: ${message}`;
  }

  formatSummary(_stats: SummaryStats): string {
    // No summary in quiet mode
    return "";
  }
}

/**
 * Verbose output formatter - full details.
 */
class VerboseOutputFormatter implements OutputFormatter {
  constructor(private useColor: boolean) {}

  formatResults(results: SearchResult[], options?: FormatOptions): string {
    const budget = options?.contextBudget ?? CONTEXT_BUDGET;

    if (results.length === 0) {
      return `No results found for: ${options?.query ?? "query"}`;
    }

    let output = "";

    // Show execution details if provided
    if (options?.executionDetails) {
      const details = options.executionDetails;
      output += "=== Execution Details ===\n";
      if (details.timeMs !== undefined) {
        output += `Time: ${details.timeMs}ms\n`;
      }
      if (details.ftsQuery) {
        output += `FTS5 Query: ${details.ftsQuery}\n`;
      }
      if (details.filtersApplied && details.filtersApplied.length > 0) {
        output += `Filters: ${details.filtersApplied.join(", ")}\n`;
      }
      output += "\n";
    }

    output += `Found ${results.length} result(s):\n\n`;
    let truncated = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const line = this.formatResult(result, i + 1);

      if (output.length + line.length > budget) {
        truncated = true;
        output += `\n(Output truncated - ${CONTEXT_BUDGET.toLocaleString()} char limit)\n`;
        break;
      }

      output += line;
    }

    return output;
  }

  private formatResult(result: SearchResult, index: number): string {
    const scorePercent = (result.score * 100).toFixed(0);
    const timestamp = formatTimestamp(result.timestamp);
    const snippet = highlightSnippet(result.snippet, this.useColor);

    // Full session ID in verbose mode
    return `${index}. [${scorePercent}%] ${result.sessionId}\n   ${timestamp}\n   ${snippet}\n\n`;
  }

  formatError(error: Error): string {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    return `Error: ${message}\n${stack ?? ""}`;
  }

  formatSummary(stats: SummaryStats): string {
    let summary = `=== Summary ===\nFound ${stats.found} results (showing ${stats.shown})`;
    if (stats.truncated) {
      summary += " - truncated due to context budget";
    }
    return summary;
  }
}
