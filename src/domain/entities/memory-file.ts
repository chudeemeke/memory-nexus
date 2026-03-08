/**
 * MemoryFile Entity
 *
 * Represents an indexed memory file from ~/.memory/.
 * Memory files are agent-written markdown files (daily logs, decisions,
 * learnings, user preferences) that persist knowledge across sessions.
 *
 * Entity properties:
 * - Has identity (id when persisted)
 * - Immutable after construction
 * - Validated on creation via static create()
 */

/**
 * The four types of memory files supported.
 */
export type MemoryFileType =
  | "daily_log"
  | "decisions"
  | "learnings"
  | "user_prefs";

const VALID_FILE_TYPES: readonly MemoryFileType[] = [
  "daily_log",
  "decisions",
  "learnings",
  "user_prefs",
];

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

interface MemoryFileParams {
  id?: number;
  filePath: string;
  fileType: MemoryFileType;
  projectEncoded?: string;
  content: string;
  contentHash: string;
  lastIndexedAt: Date;
  createdAt?: Date;
}

export class MemoryFile {
  private readonly _id?: number;
  private readonly _filePath: string;
  private readonly _fileType: MemoryFileType;
  private readonly _projectEncoded?: string;
  private readonly _content: string;
  private readonly _contentHash: string;
  private readonly _lastIndexedAt: Date;
  private readonly _createdAt: Date;

  private constructor(params: MemoryFileParams) {
    this._id = params.id;
    this._filePath = params.filePath;
    this._fileType = params.fileType;
    this._projectEncoded = params.projectEncoded;
    this._content = params.content;
    this._contentHash = params.contentHash;
    this._lastIndexedAt = new Date(params.lastIndexedAt.getTime());
    this._createdAt = params.createdAt
      ? new Date(params.createdAt.getTime())
      : new Date();
  }

  /**
   * Create a MemoryFile entity.
   * @throws Error if filePath is empty
   * @throws Error if content is empty
   * @throws Error if contentHash is not 64 lowercase hex characters
   * @throws Error if fileType is not a valid MemoryFileType
   */
  static create(params: MemoryFileParams): MemoryFile {
    if (!params.filePath || params.filePath.trim() === "") {
      throw new Error("File path cannot be empty");
    }

    if (!params.content || params.content.trim() === "") {
      throw new Error("Content cannot be empty");
    }

    if (!CONTENT_HASH_PATTERN.test(params.contentHash)) {
      throw new Error("Content hash must be 64 hexadecimal characters");
    }

    if (!VALID_FILE_TYPES.includes(params.fileType)) {
      throw new Error(
        `Invalid file type: "${params.fileType}". Must be one of: ${VALID_FILE_TYPES.join(", ")}`
      );
    }

    return new MemoryFile(params);
  }

  /**
   * The database identifier (undefined until persisted).
   */
  get id(): number | undefined {
    return this._id;
  }

  /**
   * Path relative to ~/.memory/ (uses forward slashes).
   */
  get filePath(): string {
    return this._filePath;
  }

  /**
   * The classified file type.
   */
  get fileType(): MemoryFileType {
    return this._fileType;
  }

  /**
   * Encoded project path, or undefined for global files.
   */
  get projectEncoded(): string | undefined {
    return this._projectEncoded;
  }

  /**
   * Full file content.
   */
  get content(): string {
    return this._content;
  }

  /**
   * SHA-256 hash of file content (lowercase hex).
   */
  get contentHash(): string {
    return this._contentHash;
  }

  /**
   * When this file was last indexed by sync (defensive copy).
   */
  get lastIndexedAt(): Date {
    return new Date(this._lastIndexedAt.getTime());
  }

  /**
   * When this entity was created (defensive copy).
   */
  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }
}
