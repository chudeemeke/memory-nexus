/**
 * ExtractionState Entity
 *
 * Tracks the state of extracting a session from JSONL files.
 * Enables incremental sync and progress tracking.
 *
 * Entity properties:
 * - Has unique identity (id)
 * - Immutable after construction (state changes return new instances)
 * - Tracks extraction lifecycle (pending -> in_progress -> complete/error)
 */

export type ExtractionStatus = "pending" | "in_progress" | "complete" | "error";

const VALID_STATUSES: ExtractionStatus[] = [
  "pending",
  "in_progress",
  "complete",
  "error",
];

interface ExtractionStateParams {
  id: string;
  sessionPath: string;
  startedAt: Date;
  status?: ExtractionStatus | undefined;
  completedAt?: Date | undefined;
  messagesExtracted?: number | undefined;
  errorMessage?: string | undefined;
}

export class ExtractionState {
  private readonly _id: string;
  private readonly _sessionPath: string;
  private readonly _startedAt: Date;
  private readonly _status: ExtractionStatus;
  private readonly _completedAt?: Date | undefined;
  private readonly _messagesExtracted: number;
  private readonly _errorMessage?: string | undefined;

  private constructor(params: ExtractionStateParams) {
    this._id = params.id;
    this._sessionPath = params.sessionPath;
    this._startedAt = new Date(params.startedAt.getTime());
    this._status = params.status ?? "pending";
    this._completedAt = params.completedAt
      ? new Date(params.completedAt.getTime())
      : undefined;
    this._messagesExtracted = params.messagesExtracted ?? 0;
    this._errorMessage = params.errorMessage;
  }

  /**
   * Create an ExtractionState entity.
   * @throws Error if id or sessionPath is empty, status is invalid, or messagesExtracted is negative
   */
  static create(params: ExtractionStateParams): ExtractionState {
    if (!params.id || params.id.trim() === "") {
      throw new Error("Extraction state ID cannot be empty");
    }
    if (!params.sessionPath || params.sessionPath.trim() === "") {
      throw new Error("Session path cannot be empty");
    }
    if (params.status && !VALID_STATUSES.includes(params.status)) {
      throw new Error("Invalid extraction status");
    }
    if (
      params.messagesExtracted !== undefined &&
      params.messagesExtracted < 0
    ) {
      throw new Error("Messages extracted cannot be negative");
    }
    return new ExtractionState(params);
  }

  /**
   * The unique extraction state identifier.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The path to the session JSONL file being extracted.
   */
  get sessionPath(): string {
    return this._sessionPath;
  }

  /**
   * When the extraction started.
   */
  get startedAt(): Date {
    return new Date(this._startedAt.getTime());
  }

  /**
   * The current extraction status.
   */
  get status(): ExtractionStatus {
    return this._status;
  }

  /**
   * When the extraction completed (if complete or error).
   */
  get completedAt(): Date | undefined {
    return this._completedAt ? new Date(this._completedAt.getTime()) : undefined;
  }

  /**
   * Number of messages extracted so far.
   */
  get messagesExtracted(): number {
    return this._messagesExtracted;
  }

  /**
   * Error message if extraction failed.
   */
  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  /**
   * Whether extraction is pending.
   */
  get isPending(): boolean {
    return this._status === "pending";
  }

  /**
   * Whether extraction is in progress.
   */
  get isInProgress(): boolean {
    return this._status === "in_progress";
  }

  /**
   * Whether extraction is complete.
   */
  get isComplete(): boolean {
    return this._status === "complete";
  }

  /**
   * Whether extraction failed.
   */
  get isError(): boolean {
    return this._status === "error";
  }

  /**
   * Duration of extraction in milliseconds (only available when complete).
   */
  get durationMs(): number | undefined {
    if (!this._completedAt) {
      return undefined;
    }
    return this._completedAt.getTime() - this._startedAt.getTime();
  }

  /**
   * Check equality with another ExtractionState (based on id).
   */
  equals(other: ExtractionState): boolean {
    return this._id === other._id;
  }

  /**
   * Start processing this extraction.
   * Returns a new ExtractionState instance (immutability).
   */
  startProcessing(): ExtractionState {
    return new ExtractionState({
      id: this._id,
      sessionPath: this._sessionPath,
      startedAt: this._startedAt,
      status: "in_progress",
      messagesExtracted: this._messagesExtracted,
    });
  }

  /**
   * Mark extraction as complete.
   * Returns a new ExtractionState instance (immutability).
   */
  complete(completedAt: Date): ExtractionState {
    return new ExtractionState({
      id: this._id,
      sessionPath: this._sessionPath,
      startedAt: this._startedAt,
      status: "complete",
      completedAt,
      messagesExtracted: this._messagesExtracted,
    });
  }

  /**
   * Mark extraction as failed.
   * Returns a new ExtractionState instance (immutability).
   */
  fail(errorMessage: string): ExtractionState {
    return new ExtractionState({
      id: this._id,
      sessionPath: this._sessionPath,
      startedAt: this._startedAt,
      status: "error",
      errorMessage,
      messagesExtracted: this._messagesExtracted,
    });
  }

  /**
   * Increment the count of extracted messages.
   * Returns a new ExtractionState instance (immutability).
   */
  incrementMessages(count: number = 1): ExtractionState {
    return new ExtractionState({
      id: this._id,
      sessionPath: this._sessionPath,
      startedAt: this._startedAt,
      status: this._status,
      completedAt: this._completedAt,
      messagesExtracted: this._messagesExtracted + count,
      errorMessage: this._errorMessage,
    });
  }
}
