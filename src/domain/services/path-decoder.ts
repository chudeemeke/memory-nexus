/**
 * PathDecoder Domain Service
 *
 * Handles decoding of encoded project directory names from Claude Code's
 * session storage format back to their original file system paths.
 *
 * Service properties:
 * - Stateless operations
 * - Pure functions (no side effects)
 * - Domain logic only (no infrastructure concerns)
 */

import { ProjectPath } from "../value-objects/index.js";

/**
 * Pattern for Windows drive encoding: single letter followed by --
 * Examples: C--, D--, E--
 */
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]--/;

/**
 * Pattern for Unix root encoding: starts with single dash
 * Examples: -home, -var, -usr
 */
const UNIX_ROOT_PATTERN = /^-[a-z]/i;

export class PathDecoder {
  /**
   * Decode an encoded project directory name to a ProjectPath value object.
   * @param encoded The encoded directory name (e.g., "C--Users-Destiny-Projects-foo")
   * @returns ProjectPath value object with decoded path
   */
  static decodeProjectDirectory(encoded: string): ProjectPath {
    return ProjectPath.fromEncoded(encoded);
  }

  /**
   * Check if a string appears to be an encoded path from Claude Code.
   * @param value The string to check
   * @returns true if it matches encoded path patterns
   */
  static isEncodedPath(value: string): boolean {
    if (!value || value.length === 0) {
      return false;
    }

    // Check for Windows drive pattern (C--, D--, etc.)
    if (WINDOWS_DRIVE_PATTERN.test(value)) {
      return true;
    }

    // Check for Unix root pattern (starts with single dash followed by letter)
    if (UNIX_ROOT_PATTERN.test(value)) {
      return true;
    }

    return false;
  }

  /**
   * Extract the project name from an encoded path.
   * Note: This is a convenience method that decodes and extracts.
   * @param encoded The encoded directory name
   * @returns The project name (last segment of the path)
   */
  static extractProjectName(encoded: string): string {
    const projectPath = ProjectPath.fromEncoded(encoded);
    return projectPath.projectName;
  }

  /**
   * Filter a list of strings to only include encoded paths.
   * Useful for processing directory listings from Claude Code's session storage.
   * @param items List of directory/file names
   * @returns Only the items that appear to be encoded paths
   */
  static filterEncodedPaths(items: string[]): string[] {
    return items.filter((item) => PathDecoder.isEncodedPath(item));
  }
}
