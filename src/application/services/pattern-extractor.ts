/**
 * Pattern Extractor Service
 *
 * Extracts file paths and tool usage statistics from tool uses
 * using pattern matching (not LLM-based extraction).
 */

import type { ToolUse } from "../../domain/entities/tool-use.js";
import { Entity, type FileMetadata } from "../../domain/entities/entity.js";

/**
 * Represents a file modification operation
 */
export interface FileModification {
  /** The file path that was modified */
  path: string;
  /** The type of modification operation */
  operation: "Write" | "Edit" | "NotebookEdit";
  /** When the modification occurred */
  timestamp: Date;
}

/**
 * Statistics for a specific tool
 */
export interface ToolStats {
  /** The tool name */
  name: string;
  /** Total number of invocations */
  count: number;
  /** Number of successful invocations */
  successCount: number;
  /** Number of failed invocations */
  errorCount: number;
}

/**
 * Tools that have file_path in their input
 */
const FILE_PATH_TOOLS = ["Read", "Write", "Edit", "NotebookEdit"];

/**
 * Tools that have path in their input (directory/search path)
 */
const PATH_TOOLS = ["Glob", "Grep"];

/**
 * Tools that modify files
 */
const MODIFICATION_TOOLS: ReadonlyArray<"Write" | "Edit" | "NotebookEdit"> = [
  "Write",
  "Edit",
  "NotebookEdit",
];

/**
 * Pattern-based extractor for file paths and tool statistics.
 *
 * Provides static methods for extracting structured data from tool uses
 * without requiring LLM inference.
 */
export class PatternExtractor {
  /**
   * Extract file paths from tool uses.
   *
   * Handles:
   * - Read, Write, Edit tools (input.file_path)
   * - Glob, Grep tools (input.path)
   * - Glob results (newline-separated file paths in result)
   *
   * @param toolUses Array of tool uses to extract from
   * @returns Deduplicated array of file paths
   */
  static extractFilePaths(toolUses: ToolUse[]): string[] {
    const paths = new Set<string>();

    for (const toolUse of toolUses) {
      const input = toolUse.input;

      // Extract from file_path (Read, Write, Edit, NotebookEdit)
      if (FILE_PATH_TOOLS.includes(toolUse.name)) {
        const filePath = input.file_path as string | undefined;
        if (filePath) {
          paths.add(filePath);
        }
      }

      // Extract from path (Glob, Grep)
      if (PATH_TOOLS.includes(toolUse.name)) {
        const path = input.path as string | undefined;
        if (path) {
          paths.add(path);
        }
      }

      // Parse Glob results for matched files
      if (toolUse.name === "Glob" && toolUse.result) {
        const lines = toolUse.result.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            paths.add(trimmed);
          }
        }
      }
    }

    return Array.from(paths);
  }

  /**
   * Extract file modifications (Write, Edit, NotebookEdit).
   *
   * Only includes successful operations.
   *
   * @param toolUses Array of tool uses to extract from
   * @returns Array of file modifications with operation type
   */
  static extractFileModifications(toolUses: ToolUse[]): FileModification[] {
    const modifications: FileModification[] = [];

    for (const toolUse of toolUses) {
      // Only include modification tools
      if (!MODIFICATION_TOOLS.includes(toolUse.name as typeof MODIFICATION_TOOLS[number])) {
        continue;
      }

      // Only include successful operations
      if (toolUse.status !== "success") {
        continue;
      }

      const filePath = toolUse.input.file_path as string | undefined;
      if (filePath) {
        modifications.push({
          path: filePath,
          operation: toolUse.name as "Write" | "Edit" | "NotebookEdit",
          timestamp: toolUse.timestamp,
        });
      }
    }

    return modifications;
  }

  /**
   * Extract tool usage statistics.
   *
   * Groups by tool name with success/error counts.
   *
   * @param toolUses Array of tool uses to extract from
   * @returns Array of tool statistics
   */
  static extractToolStats(toolUses: ToolUse[]): ToolStats[] {
    const statsMap = new Map<
      string,
      { count: number; successCount: number; errorCount: number }
    >();

    for (const toolUse of toolUses) {
      const existing = statsMap.get(toolUse.name);
      if (existing) {
        existing.count++;
        if (toolUse.status === "success") {
          existing.successCount++;
        } else if (toolUse.status === "error") {
          existing.errorCount++;
        }
      } else {
        statsMap.set(toolUse.name, {
          count: 1,
          successCount: toolUse.status === "success" ? 1 : 0,
          errorCount: toolUse.status === "error" ? 1 : 0,
        });
      }
    }

    return Array.from(statsMap.entries()).map(([name, stats]) => ({
      name,
      ...stats,
    }));
  }

  /**
   * Extract unique tool names used in session.
   *
   * @param toolUses Array of tool uses to extract from
   * @returns Array of unique tool names
   */
  static extractToolNames(toolUses: ToolUse[]): string[] {
    const names = new Set<string>();
    for (const toolUse of toolUses) {
      names.add(toolUse.name);
    }
    return Array.from(names);
  }

  /**
   * Convert extracted file paths to Entity objects.
   *
   * File paths become 'file' entities with path as name.
   *
   * @param paths Array of file paths
   * @returns Array of file Entity objects
   */
  static toFileEntities(paths: string[]): Entity[] {
    return paths.map((path) =>
      Entity.create({
        type: "file",
        name: path,
        confidence: 1.0,
      })
    );
  }

  /**
   * Convert file modifications to Entity objects with metadata.
   *
   * Includes operation type in metadata.
   *
   * @param modifications Array of file modifications
   * @returns Array of file Entity objects with metadata
   */
  static toFileModificationEntities(modifications: FileModification[]): Entity[] {
    return modifications.map((mod) => {
      const metadata: FileMetadata = {
        operation: mod.operation.toLowerCase() as "read" | "write" | "edit",
      };
      return Entity.create({
        type: "file",
        name: mod.path,
        confidence: 1.0,
        metadata,
      });
    });
  }
}
