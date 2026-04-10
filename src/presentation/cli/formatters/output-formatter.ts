/**
 * Output Formatter
 *
 * Strategy pattern for formatting search results.
 * Supports default, JSON, quiet, and verbose output modes.
 * JSON mode supports hybrid search metadata envelope (additive, backward-compatible).
 */

import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import { formatTimestamp } from "./timestamp-formatter.js";
import { bold } from "./color.js";
import { truncateToWidth, truncateForTerminal, getTerminalWidth } from "./text-width.js";

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
 * Hybrid search metadata for output formatting.
 * Re-exported from HybridSearchService for formatter consumption.
 */
export interface SearchMetaInfo {
  /** The effective search mode used */
  mode: string;
  /** Reason for the mode selection */
  modeReason: string;
  /** Whether the search degraded from requested mode */
  degraded: boolean;
  /** Reason for degradation, if any */
  degradationReason?: string;
  /** Fraction of messages with embeddings (0-1) */
  embeddingCoverage: number;
  /** System capabilities for this search */
  capabilities: { fts: boolean; vector: boolean; hybrid: boolean };
  /** Total search time in milliseconds */
  timingMs: number;
}

/**
 * Options for formatting results.
 */
export interface FormatOptions {
  query?: string;
  executionDetails?: ExecutionDetails;
  contextBudget?: number;
  /** Hybrid search metadata (additive: when absent, output is backward-compatible) */
  searchMeta?: SearchMetaInfo;
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
 * Extract highlight positions from a snippet containing <mark> tags.
 *
 * Parses <mark>...</mark> tags and returns offset/length pairs
 * relative to the clean (tag-free) text.
 *
 * @param snippet Raw snippet with <mark> tags
 * @returns Array of { offset, length } highlight positions
 */
export function extractHighlights(snippet: string): Array<{ offset: number; length: number }> {
  const highlights: Array<{ offset: number; length: number }> = [];
  let cleanLength = 0;
  let i = 0;

  while (i < snippet.length) {
    if (snippet.startsWith("<mark>", i)) {
      i += 6; // skip <mark>
      const end = snippet.indexOf("</mark>", i);
      if (end === -1) break;
      highlights.push({ offset: cleanLength, length: end - i });
      cleanLength += end - i;
      i = end + 7; // skip </mark>
    } else {
      cleanLength++;
      i++;
    }
  }

  return highlights;
}

/**
 * Convert <mark> tags to ANSI bold+cyan codes or asterisk markers.
 * When colors are disabled, uses asterisks for visible highlighting in non-TTY environments.
 * Uses bold+cyan (1;36m) for maximum visibility across terminals including Git Bash.
 */
function highlightSnippet(snippet: string, useColor: boolean): string {
  if (!useColor) {
    // Use asterisks for visible highlighting in non-TTY environments
    return snippet
      .replace(/<mark>/g, "*")
      .replace(/<\/mark>/g, "*");
  }
  // Use bold+cyan (1;36m) for maximum visibility across terminals
  return snippet
    .replace(/<mark>/g, "\x1b[1;36m")
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
    const sessionShort = result.sessionId.substring(0, 16);
    const timestamp = formatTimestamp(result.timestamp);
    const rawSnippet = highlightSnippet(result.snippet, this.useColor);
    const role = result.role.charAt(0).toUpperCase() + result.role.slice(1);
    const snippet = truncateForTerminal(rawSnippet, "   ");

    return `${index}. [${scorePercent}%] [${role}] ${sessionShort}...\n   ${timestamp}\n   ${snippet}\n\n`;
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
 *
 * When searchMeta is provided, wraps output in a metadata envelope:
 * { meta: {...}, results: [...] }
 *
 * When searchMeta is absent, outputs backward-compatible array format.
 */
class JsonOutputFormatter implements OutputFormatter {
  formatResults(results: SearchResult[], options?: FormatOptions): string {
    const budget = options?.contextBudget ?? CONTEXT_BUDGET;

    // Build per-result JSON objects
    const jsonResults = results.map((r, i) => {
      const base: Record<string, unknown> = {
        sessionId: r.sessionId,
        messageId: r.messageId,
        role: r.role,
        score: r.score,
        timestamp: r.timestamp.toISOString(),
        snippet: r.snippet.replace(/<\/?mark>/g, ""), // Remove HTML tags
      };

      // Add hybrid-specific fields when present (additive)
      if (options?.searchMeta) {
        base.rank = i + 1;
        if (r.rawScores) {
          base.raw_scores = r.rawScores;
        }
        if (r.source) {
          base.source = r.source;
        }
        // Extract highlights from original snippet
        const highlights = extractHighlights(r.snippet);
        if (highlights.length > 0) {
          base.highlights = highlights;
        }
      }

      return base;
    });

    // If searchMeta provided, wrap in metadata envelope
    if (options?.searchMeta) {
      const meta: Record<string, unknown> = {
        query: options.query ?? "",
        mode: options.searchMeta.mode,
        mode_reason: options.searchMeta.modeReason,
        total_results: results.length,
        embedding_coverage: options.searchMeta.embeddingCoverage,
        degraded: options.searchMeta.degraded,
        capabilities: options.searchMeta.capabilities,
        timing_ms: options.searchMeta.timingMs,
      };

      if (options.searchMeta.degradationReason) {
        meta.degradation_reason = options.searchMeta.degradationReason;
      }

      const envelope = {
        meta,
        results: jsonResults,
      };

      return JSON.stringify(envelope, null, 2);
    }

    // Backward-compatible: plain array
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

    const termWidth = getTerminalWidth();

    return results
      .map((r) => {
        const sessionShort = r.sessionId.substring(0, 16);
        const snippet = r.snippet
          .replace(/<mark>/g, "*")
          .replace(/<\/mark>/g, "*");
        const line = `${sessionShort} ${snippet}`;
        return truncateToWidth(line, termWidth);
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
 *
 * When searchMeta is provided, shows mode info and per-ranker breakdown.
 */
class VerboseOutputFormatter implements OutputFormatter {
  constructor(private useColor: boolean) {}

  formatResults(results: SearchResult[], options?: FormatOptions): string {
    const budget = options?.contextBudget ?? CONTEXT_BUDGET;

    if (results.length === 0) {
      return `No results found for: ${options?.query ?? "query"}`;
    }

    let output = "";

    // Show search mode info when searchMeta provided
    if (options?.searchMeta) {
      output += `Mode: ${options.searchMeta.mode}`;
      if (options.searchMeta.degraded) {
        output += ` (degraded: ${options.searchMeta.degradationReason ?? "unknown"})`;
      }
      output += "\n";
    }

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
      const line = this.formatResult(result, i + 1, !!options?.searchMeta);

      if (output.length + line.length > budget) {
        truncated = true;
        output += `\n(Output truncated - ${CONTEXT_BUDGET.toLocaleString()} char limit)\n`;
        break;
      }

      output += line;
    }

    return output;
  }

  private formatResult(result: SearchResult, index: number, showRankerBreakdown: boolean): string {
    const scorePercent = (result.score * 100).toFixed(0);
    const timestamp = formatTimestamp(result.timestamp);
    const rawSnippet = highlightSnippet(result.snippet, this.useColor);
    const role = result.role.charAt(0).toUpperCase() + result.role.slice(1);
    const snippet = truncateForTerminal(rawSnippet, "   ");

    let line = `${index}. [${scorePercent}%] [${role}] ${result.sessionId}\n   ${timestamp}\n   ${snippet}\n`;

    // Show per-ranker breakdown when searchMeta available and result has rawScores
    if (showRankerBreakdown && result.rawScores) {
      const parts: string[] = [];
      if (result.rawScores.bm25 !== undefined) {
        parts.push(`bm25: ${result.rawScores.bm25}`);
      }
      if (result.rawScores.cosine !== undefined) {
        parts.push(`cosine: ${result.rawScores.cosine}`);
      }
      if (result.rawScores.rrf !== undefined) {
        parts.push(`rrf: ${result.rawScores.rrf}`);
      }
      if (parts.length > 0) {
        line += `   Scores: ${parts.join(", ")}\n`;
      }
      if (result.source) {
        line += `   Source: ${result.source}\n`;
      }
    }

    line += "\n";
    return line;
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
