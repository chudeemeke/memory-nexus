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

    // Execute search
    const results = await searchService.search(searchQuery, { limit });

    // Output results
    if (options.json) {
      outputJson(results);
    } else {
      outputFormatted(results, query);
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
 * Output results with formatted display.
 *
 * Converts <mark> tags to ANSI bold and displays scores as percentages.
 *
 * @param results Search results to output
 * @param query Original query for "no results" message
 */
function outputFormatted(results: SearchResult[], query: string): void {
  if (results.length === 0) {
    console.log(`No results found for: ${query}`);
    return;
  }

  console.log(`Found ${results.length} result(s):\n`);

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
