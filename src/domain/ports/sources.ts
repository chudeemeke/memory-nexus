/**
 * Source Port Interfaces
 *
 * Defines contracts for accessing external data sources.
 * These interfaces abstract filesystem and parsing operations.
 */

import type { ProjectPath } from "../value-objects/project-path.js";
import type { ParsedEvent } from "./types.js";

/**
 * Information about a discovered session file.
 *
 * Used during session discovery to identify available sessions
 * without loading their full content.
 */
export interface SessionFileInfo {
  /** Session UUID (derived from filename) */
  id: string;

  /** Full path to the JSONL file */
  path: string;

  /** Project this session belongs to */
  projectPath: ProjectPath;

  /** Last modification time of the file */
  modifiedTime: Date;

  /** File size in bytes */
  size: number;
}

/**
 * Source for discovering Claude Code session files.
 *
 * Implementations scan the Claude Code projects directory
 * to find available session JSONL files.
 */
export interface ISessionSource {
  /**
   * Discover all available session files.
   *
   * Scans the Claude Code projects directory structure:
   * ~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
   *
   * @returns Array of session file information
   */
  discoverSessions(): Promise<SessionFileInfo[]>;

  /**
   * Get the full path to a session file by ID.
   *
   * @param sessionId The session UUID
   * @returns Full path to the JSONL file, or null if not found
   */
  getSessionFile(sessionId: string): Promise<string | null>;
}

/**
 * Parser for extracting events from JSONL session files.
 *
 * Uses streaming to handle large files efficiently without
 * loading the entire file into memory.
 */
export interface IEventParser {
  /**
   * Parse events from a session file.
   *
   * Returns an async iterable that yields events one at a time.
   * Events that cannot be parsed or are not relevant are yielded
   * as "skipped" events with a reason.
   *
   * @param filePath Full path to the JSONL file
   * @returns Async iterable of parsed events
   */
  parse(filePath: string): AsyncIterable<ParsedEvent>;
}
