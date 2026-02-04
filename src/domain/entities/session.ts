/**
 * Session Entity
 *
 * Represents a Claude Code session - a collection of messages
 * exchanged within a project directory over a period of time.
 *
 * Entity properties:
 * - Has unique identity (id)
 * - Immutable after construction (mutations return new instances)
 * - Aggregates Message entities
 */

import type { ProjectPath } from "../value-objects/project-path.js";
import type { Message } from "./message.js";

interface SessionParams {
  id: string;
  projectPath: ProjectPath;
  startTime: Date;
  endTime?: Date | undefined;
  messages?: readonly Message[] | undefined;
  summary?: string | undefined;
  messageCount?: number | undefined;
}

export class Session {
  private readonly _id: string;
  private readonly _projectPath: ProjectPath;
  private readonly _startTime: Date;
  private readonly _endTime?: Date | undefined;
  private readonly _messages: readonly Message[];
  private readonly _summary?: string | undefined;
  private readonly _messageCount?: number | undefined;

  private constructor(params: SessionParams) {
    this._id = params.id;
    this._projectPath = params.projectPath;
    this._startTime = new Date(params.startTime.getTime());
    this._endTime = params.endTime
      ? new Date(params.endTime.getTime())
      : undefined;
    this._messages = Object.freeze([...(params.messages ?? [])]);
    this._summary = params.summary;
    this._messageCount = params.messageCount;
  }

  /**
   * Create a Session entity.
   * @throws Error if id is empty or endTime is before startTime
   */
  static create(params: SessionParams): Session {
    if (!params.id || params.id.trim() === "") {
      throw new Error("Session ID cannot be empty");
    }
    if (params.endTime && params.endTime < params.startTime) {
      throw new Error("End time cannot be before start time");
    }
    return new Session(params);
  }

  /**
   * The unique session identifier.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The project directory this session belongs to.
   */
  get projectPath(): ProjectPath {
    return this._projectPath;
  }

  /**
   * When the session started.
   */
  get startTime(): Date {
    return new Date(this._startTime.getTime());
  }

  /**
   * When the session ended (undefined if still active).
   */
  get endTime(): Date | undefined {
    return this._endTime ? new Date(this._endTime.getTime()) : undefined;
  }

  /**
   * All messages in this session.
   */
  get messages(): Message[] {
    return [...this._messages];
  }

  /**
   * LLM-generated summary of this session (undefined if not extracted).
   */
  get summary(): string | undefined {
    return this._summary;
  }

  /**
   * Number of messages in this session.
   * Returns explicit messageCount if set, otherwise falls back to messages.length.
   * This allows displaying accurate counts from the database without loading all messages.
   */
  get messageCount(): number {
    return this._messageCount ?? this._messages.length;
  }

  /**
   * Session duration in milliseconds (undefined if not complete).
   */
  get durationMs(): number | undefined {
    if (!this._endTime) {
      return undefined;
    }
    return this._endTime.getTime() - this._startTime.getTime();
  }

  /**
   * Check equality with another Session (based on id).
   */
  equals(other: Session): boolean {
    return this._id === other._id;
  }

  /**
   * Add a message to this session.
   * Returns a new Session instance (immutability).
   * Note: When adding messages, messageCount is no longer used (falls back to messages.length).
   */
  addMessage(message: Message): Session {
    return new Session({
      id: this._id,
      projectPath: this._projectPath,
      startTime: this._startTime,
      endTime: this._endTime,
      messages: [...this._messages, message],
      summary: this._summary,
      // Don't preserve messageCount - it's now outdated since we're adding a message
    });
  }

  /**
   * Mark this session as complete.
   * Returns a new Session instance (immutability).
   * @throws Error if endTime is before startTime
   */
  complete(endTime: Date): Session {
    if (endTime < this._startTime) {
      throw new Error("End time cannot be before start time");
    }
    return new Session({
      id: this._id,
      projectPath: this._projectPath,
      startTime: this._startTime,
      endTime,
      messages: [...this._messages],
      summary: this._summary,
      messageCount: this._messageCount,
    });
  }

  /**
   * Set the summary for this session.
   * Returns a new Session instance (immutability).
   */
  withSummary(summary: string): Session {
    return new Session({
      id: this._id,
      projectPath: this._projectPath,
      startTime: this._startTime,
      endTime: this._endTime,
      messages: [...this._messages],
      summary,
      messageCount: this._messageCount,
    });
  }
}
