/**
 * Search Command Handler
 *
 * CLI command for full-text search across synced sessions.
 * Wires to Fts5SearchService with result formatting.
 */

import { Command } from "commander";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";
import type { SearchResult } from "../../../domain/value-objects/search-result.js";
import {
  initializeDatabase,
  closeDatabase,
  getDefaultDbPath,
  Fts5SearchService,
} from "../../../infrastructure/database/index.js";

/**
 * Options parsed from CLI arguments.
 */
interface SearchCommandOptions {
  limit?: string;
  project?: string;
  json?: boolean;
  ignoreCase?: boolean;
  caseSensitive?: boolean;
}

/**
 * Create the search command for Commander.js.
 *
 * @returns Configured Command instance
 */
export function createSearchCommand(): Command {
  return new Command("search")
    .argument("<query>", "Search query text")
    .description("Full-text search across all sessions")
    .option("-l, --limit <count>", "Maximum results to return", "10")
    .option("-p, --project <name>", "Filter by project name")
    .option("--json", "Output results as JSON")
    .option("-i, --ignore-case", "Case-insensitive search (default)")
    .option("-c, --case-sensitive", "Case-sensitive search")
    .action(async (query: string, options: SearchCommandOptions) => {
      await executeSearchCommand(query, options);
    });
}

/**
 * Execute the search command with given options.
 *
 * Creates dependencies, runs search, and outputs results.
 *
 * @param query Search query string
 * @param options Command options from CLI
 */
export async function executeSearchCommand(
  query: string,
  options: SearchCommandOptions
): Promise<void> {
  // Validate query
  let searchQuery: SearchQuery;
  try {
    searchQuery = SearchQuery.from(query);
  } catch (error) {
    console.error("Error: Query cannot be empty");
    process.exitCode = 1;
    return;
  }

  // Initialize database
  const dbPath = getDefaultDbPath();
  const { db } = initializeDatabase({ path: dbPath });

  try {
    // Create search service
    const searchService = new Fts5SearchService(db);

    // Parse limit option
    const limit = parseInt(options.limit ?? "10", 10);
    if (isNaN(limit) || limit < 1) {
      console.error("Error: Limit must be a positive number");
      process.exitCode = 1;
      return;
    }

    // Execute search with case-sensitive awareness
    // If case-sensitive, fetch 2x results to account for filtering
    const fetchLimit = options.caseSensitive ? limit * 2 : limit;
    let results = await searchService.search(searchQuery, { limit: fetchLimit });

    // Apply case-sensitive filter if requested
    let caseSensitiveFiltered = false;
    if (options.caseSensitive && results.length > 0) {
      const originalCount = results.length;
      results = filterCaseSensitive(results, query, limit);
      caseSensitiveFiltered = originalCount > results.length || results.length < limit;
    } else {
      // Ensure we respect the original limit for non-case-sensitive search
      results = results.slice(0, limit);
    }

    // Output results
    if (options.json) {
      outputJson(results);
    } else {
      outputFormatted(results, query, caseSensitiveFiltered);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 2;
  } finally {
    closeDatabase(db);
  }
}

/**
 * Output results as JSON.
 *
 * @param results Search results to output
 */
function outputJson(results: SearchResult[]): void {
  const output = results.map((r) => ({
    sessionId: r.sessionId,
    messageId: r.messageId,
    score: r.score,
    timestamp: r.timestamp.toISOString(),
    snippet: r.snippet,
  }));
  console.log(JSON.stringify(output, null, 2));
}

/**
 * Filter results to only include those with case-sensitive match in snippet.
 *
 * @param results Search results from FTS5
 * @param query Original query string
 * @param limit Maximum results to return after filtering
 * @returns Filtered results matching exact case
 */
export function filterCaseSensitive(
  results: SearchResult[],
  query: string,
  limit: number
): SearchResult[] {
  const filtered = results.filter((r) => {
    // Remove <mark> tags to get clean snippet for matching
    const cleanSnippet = r.snippet.replace(/<\/?mark>/g, "");
    return cleanSnippet.includes(query);
  });
  return filtered.slice(0, limit);
}

/**
 * Output results with formatted display.
 *
 * Converts <mark> tags to ANSI bold and displays scores as percentages.
 *
 * @param results Search results to output
 * @param query Original query for "no results" message
 * @param caseSensitiveFiltered Whether case-sensitive filter was applied
 */
function outputFormatted(
  results: SearchResult[],
  query: string,
  caseSensitiveFiltered = false
): void {
  if (results.length === 0) {
    console.log(`No results found for: ${query}`);
    return;
  }

  const filterNote = caseSensitiveFiltered ? " (case-sensitive filter applied)" : "";
  console.log(`Found ${results.length} result(s)${filterNote}:\n`);

  results.forEach((result, index) => {
    const scorePercent = (result.score * 100).toFixed(0);
    const formattedSnippet = formatSnippet(result.snippet);
    const timestamp = formatTimestamp(result.timestamp);

    console.log(`${index + 1}. [${scorePercent}%] ${result.sessionId.substring(0, 8)}...`);
    console.log(`   ${timestamp}`);
    console.log(`   ${formattedSnippet}`);
    console.log("");
  });
}

/**
 * Convert <mark> tags to ANSI bold for terminal highlighting.
 *
 * @param snippet Snippet with <mark> tags
 * @returns Snippet with ANSI bold codes
 */
function formatSnippet(snippet: string): string {
  return snippet
    .replace(/<mark>/g, "\x1b[1m")
    .replace(/<\/mark>/g, "\x1b[0m");
}

/**
 * Format timestamp for display.
 *
 * @param timestamp Date to format
 * @returns Formatted date string
 */
function formatTimestamp(timestamp: Date): string {
  return timestamp.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
