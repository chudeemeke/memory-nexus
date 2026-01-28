/**
 * JSONL Parser Adapter
 *
 * Implements streaming JSONL parsing for Claude Code session files.
 * Uses readline.createInterface for memory-efficient line-by-line processing.
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { IEventParser, ParsedEvent } from "../../domain/ports/index.js";
import { classifyEvent } from "./event-classifier.js";

/**
 * Streaming JSONL parser for Claude Code session files.
 *
 * Parses session files line-by-line without loading the entire file
 * into memory. Handles malformed JSON gracefully by yielding
 * "skipped" events with error details.
 *
 * @implements {IEventParser}
 */
export class JsonlEventParser implements IEventParser {
  /**
   * Parse events from a JSONL session file.
   *
   * @param filePath Full path to the JSONL file
   * @yields ParsedEvent for each line (or skipped event for errors)
   */
  async *parse(filePath: string): AsyncGenerator<ParsedEvent> {
    const fileStream = createReadStream(filePath, { encoding: "utf8" });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNum = 0;

    for await (const line of rl) {
      lineNum++;

      // Skip empty lines
      const trimmed = line.trim();
      if (trimmed === "") {
        yield {
          type: "skipped",
          reason: `Empty line at ${lineNum}`,
        };
        continue;
      }

      try {
        const event = JSON.parse(trimmed);
        const parsedEvent = classifyEvent(event);
        yield parsedEvent;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield {
          type: "skipped",
          reason: `Malformed JSON at line ${lineNum}: ${message}`,
        };
      }
    }
  }
}
