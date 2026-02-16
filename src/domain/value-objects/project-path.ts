/**
 * ProjectPath Value Object
 *
 * Represents a project directory path that can be encoded for filesystem-safe
 * storage (e.g., as directory names) and decoded back to the original path.
 *
 * IMPORTANT: Claude Code's encoding is LOSSY. Three different characters all
 * become single dashes in the encoded form:
 * - Backslash (path separator): \ -> -
 * - Forward slash (path separator): / -> -
 * - Space (in folder names): " " -> -
 * - Hyphen (in folder names): - -> - (unchanged, but indistinguishable)
 *
 * Since information is lost during encoding, the decoded path is "best effort"
 * and may not match the original path exactly. Use the encoded form as the
 * canonical identifier for matching and comparison.
 *
 * Encoding rules (matching Claude Code behavior):
 * - Windows drive letter + colon + backslash -> double-dash (C:\ -> C--)
 * - All other backslashes -> single-dash
 * - Forward slashes -> single-dash
 * - Spaces -> single-dash
 * - Hyphens -> single-dash (preserved but indistinguishable)
 *
 * Value object properties:
 * - Immutable after construction
 * - Equality based on encoded path value (canonical identifier)
 * - Validates on construction (rejects empty paths)
 */
export class ProjectPath {
  private readonly _decoded: string;
  private readonly _encoded: string;
  private readonly _projectName: string;

  private constructor(decoded: string, encoded: string, projectName?: string) {
    this._decoded = decoded;
    this._encoded = encoded;
    this._projectName = projectName ?? this.extractProjectName(decoded);
  }

  /**
   * Create ProjectPath from a decoded (original) path.
   * @param path The original filesystem path (e.g., "C:\Users\Destiny\Projects\foo")
   * @throws Error if path is empty or whitespace-only
   */
  static fromDecoded(path: string): ProjectPath {
    if (!path || path.trim() === "") {
      throw new Error("Path cannot be empty");
    }

    const encoded = ProjectPath.encode(path);
    return new ProjectPath(path, encoded);
  }

  /**
   * Create ProjectPath from an encoded path.
   * @param encoded The encoded path (e.g., "C--Users-Destiny-Projects-foo")
   * @throws Error if path is empty or whitespace-only
   */
  static fromEncoded(encoded: string): ProjectPath {
    if (!encoded || encoded.trim() === "") {
      throw new Error("Path cannot be empty");
    }

    const decoded = ProjectPath.decode(encoded);
    return new ProjectPath(decoded, encoded);
  }

  /**
   * The original filesystem path.
   */
  get decoded(): string {
    return this._decoded;
  }

  /**
   * The filesystem-safe encoded path.
   */
  get encoded(): string {
    return this._encoded;
  }

  /**
   * The project name (last segment of the path).
   */
  get projectName(): string {
    return this._projectName;
  }

  /**
   * Return a new ProjectPath with an overridden project name.
   * Preserves encoded and decoded paths. Useful when the correct
   * project name is resolved via filesystem lookup.
   */
  withProjectName(name: string): ProjectPath {
    return new ProjectPath(this._decoded, this._encoded, name);
  }

  /**
   * Check equality with another ProjectPath.
   * Two paths are equal if their decoded values match.
   */
  equals(other: ProjectPath): boolean {
    return this._decoded === other._decoded;
  }

  /**
   * Encode a path for filesystem-safe storage.
   * Matches Claude Code's encoding behavior:
   * - Windows drive (C:\) becomes C--
   * - All backslashes become single-dash
   * - All forward slashes become single-dash
   * - All spaces become single-dash
   * - Hyphens remain as single-dash (lossy - indistinguishable from separators)
   */
  private static encode(path: string): string {
    // Windows paths: "C:\" -> "C--", other "\" -> "-"
    // Unix paths: "/" -> "-"
    // Spaces: " " -> "-"
    // This matches Claude Code's actual encoding behavior
    return path
      .replace(/:\\/g, "--") // Drive letter colon-backslash -> double-dash
      .replace(/\\/g, "-") // Other backslashes -> single-dash
      .replace(/\//g, "-") // Forward slashes -> single-dash
      .replace(/ /g, "-"); // Spaces -> single-dash
  }

  /**
   * Decode an encoded path back to the original format.
   * Detects Windows vs Unix based on pattern:
   * - Windows paths have drive letter followed by double-dash (e.g., "C--")
   * - Unix paths start with a dash (from leading /)
   */
  private static decode(encoded: string): string {
    // Check if this is a Windows path by looking for drive letter pattern
    // Windows encoded: "C--Users-..." (letter followed by double-dash)
    const windowsDrivePattern = /^([A-Za-z])--/;

    if (windowsDrivePattern.test(encoded)) {
      // Windows path: first "--" after drive letter becomes ":\",
      // all other "-" become "\"
      return encoded.replace(/^([A-Za-z])--/, "$1:\\").replace(/-/g, "\\");
    } else {
      // Unix path: all dashes become forward slashes
      return encoded.replace(/-/g, "/");
    }
  }

  /**
   * Extract the project name from the decoded path.
   * Handles both Windows and Unix paths, and trailing separators.
   */
  private extractProjectName(decoded: string): string {
    // Remove trailing separators
    let normalized = decoded.replace(/[\\/]+$/, "");

    // Handle root paths
    if (normalized === "" && decoded.startsWith("/")) {
      return "";
    }

    // Handle Windows root (just drive letter)
    if (/^[A-Za-z]:$/.test(normalized)) {
      return normalized;
    }

    // Get the last segment
    const segments = normalized.split(/[\\/]/);
    return segments[segments.length - 1] || "";
  }
}
