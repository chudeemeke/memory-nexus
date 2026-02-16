/**
 * ProjectNameResolver
 *
 * Resolves correct project names from Claude Code's lossy encoded paths
 * by walking the actual filesystem. Claude Code encodes backslashes,
 * forward slashes, spaces, and hyphens all as single dashes, making
 * reverse decoding ambiguous. This resolver uses the filesystem as
 * source of truth to disambiguate.
 *
 * Algorithm:
 * 1. Starting from the root directory, list actual subdirectories
 * 2. For each subdirectory, encode its name (spaces/hyphens -> dashes)
 * 3. Check if any encoded name is a prefix of the remaining encoded string
 * 4. Consume the matched portion, descend into that directory
 * 5. The last matched directory name is the project name
 *
 * Caches resolved prefixes to avoid redundant readdir calls.
 */

import { readdirSync } from "node:fs";

/**
 * Encodes a single directory name the same way Claude Code does:
 * spaces and hyphens both become dashes.
 */
function encodeDirName(name: string): string {
  return name.replace(/ /g, "-").replace(/-/g, "-");
}

export class ProjectNameResolver {
  private readonly rootDir: string;
  private readonly cache = new Map<string, string>();
  private readonly dirCache = new Map<string, string[]>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * Resolve project name from a full encoded path including drive prefix.
   * Strips Windows drive prefix (e.g., "C--") or Unix leading dash before resolving.
   */
  resolveFromEncodedPath(encodedPath: string): string {
    // Strip Windows drive prefix: "C--" -> ""
    const windowsDrivePattern = /^[A-Za-z]--/;
    let segments = encodedPath;

    if (windowsDrivePattern.test(segments)) {
      segments = segments.slice(3); // Remove "X--"
    } else if (segments.startsWith("-")) {
      segments = segments.slice(1); // Remove leading "-" for Unix paths
    }

    return this.resolveProjectName(segments);
  }

  /**
   * Resolve the project name from an encoded path (without drive prefix).
   * Walks the filesystem matching encoded segments against real directory names.
   *
   * @param encodedSegments - The encoded path without drive prefix (e.g., "Users-Destiny-Projects-memory-nexus")
   * @returns The actual name of the last matched directory
   */
  resolveProjectName(encodedSegments: string): string {
    // Check cache first
    const cached = this.cache.get(encodedSegments);
    if (cached !== undefined) {
      return cached;
    }

    const result = this.walkAndResolve(this.rootDir, encodedSegments);
    this.cache.set(encodedSegments, result);
    return result;
  }

  /**
   * Walk the filesystem recursively, matching encoded segments against
   * actual directory names at each level.
   */
  private walkAndResolve(currentDir: string, remaining: string): string {
    if (remaining === "") {
      return "";
    }

    const subdirs = this.listSubdirectories(currentDir);
    if (subdirs.length === 0) {
      return this.fallbackLastSegment(remaining);
    }

    // Build candidates: encode each subdirectory name and check if it
    // matches as a prefix of the remaining encoded string.
    // Sort by encoded length descending (greedy: prefer longer matches).
    const candidates: Array<{ name: string; encoded: string }> = [];
    for (const name of subdirs) {
      const encoded = encodeDirName(name);
      candidates.push({ name, encoded });
    }
    candidates.sort((a, b) => b.encoded.length - a.encoded.length);

    for (const candidate of candidates) {
      if (remaining === candidate.encoded) {
        // Exact match: this directory IS the project
        return candidate.name;
      }

      if (remaining.startsWith(candidate.encoded + "-")) {
        // Prefix match: consume this segment and descend
        const nextRemaining = remaining.slice(candidate.encoded.length + 1);
        const nextDir = `${currentDir}/${candidate.name}`;
        const result = this.walkAndResolve(nextDir, nextRemaining);
        if (result !== this.fallbackLastSegment(nextRemaining)) {
          // Successful deeper resolution
          return result;
        }
        // If deeper resolution failed (fell back), try this candidate
        // as a successful intermediate match and return its deeper result
        return result;
      }
    }

    // No match found at this level
    return this.fallbackLastSegment(remaining);
  }

  /**
   * List subdirectories of a given path. Results are cached.
   */
  private listSubdirectories(dir: string): string[] {
    const cached = this.dirCache.get(dir);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      this.dirCache.set(dir, dirs);
      return dirs;
    } catch {
      this.dirCache.set(dir, []);
      return [];
    }
  }

  /**
   * Fallback: extract last dash-separated segment (lossy behavior).
   */
  private fallbackLastSegment(encoded: string): string {
    const segments = encoded.split("-");
    return segments[segments.length - 1] ?? "";
  }
}
