/**
 * Message Entity
 *
 * Represents a single message in a Claude Code session.
 * Can be from the user or assistant, and may contain tool use references.
 *
 * Entity properties:
 * - Has unique identity (id)
 * - Immutable after construction
 * - Can reference ToolUse entities by ID
 */

export type MessageRole = "user" | "assistant";

const VALID_ROLES: MessageRole[] = ["user", "assistant"];

interface MessageParams {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolUseIds?: string[];
}

export class Message {
  private readonly _id: string;
  private readonly _role: MessageRole;
  private readonly _content: string;
  private readonly _timestamp: Date;
  private readonly _toolUseIds: readonly string[];

  private constructor(params: MessageParams) {
    this._id = params.id;
    this._role = params.role;
    this._content = params.content;
    this._timestamp = new Date(params.timestamp.getTime());
    this._toolUseIds = Object.freeze([...(params.toolUseIds ?? [])]);
  }

  /**
   * Create a Message entity.
   * @throws Error if id is empty or role is invalid
   */
  static create(params: MessageParams): Message {
    if (!params.id || params.id.trim() === "") {
      throw new Error("Message ID cannot be empty");
    }
    if (!VALID_ROLES.includes(params.role)) {
      throw new Error("Invalid message role");
    }
    return new Message(params);
  }

  /**
   * The unique message identifier.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The message role (user or assistant).
   */
  get role(): MessageRole {
    return this._role;
  }

  /**
   * The message text content.
   */
  get content(): string {
    return this._content;
  }

  /**
   * When the message was created.
   */
  get timestamp(): Date {
    return new Date(this._timestamp.getTime());
  }

  /**
   * IDs of tool uses associated with this message.
   */
  get toolUses(): string[] {
    return [...this._toolUseIds];
  }

  /**
   * Whether this message has text content.
   */
  get hasContent(): boolean {
    return this._content.length > 0;
  }

  /**
   * Whether this message has any tool uses.
   */
  get hasToolUses(): boolean {
    return this._toolUseIds.length > 0;
  }

  /**
   * Check equality with another Message (based on id).
   */
  equals(other: Message): boolean {
    return this._id === other._id;
  }

  /**
   * Add a tool use reference to this message.
   * Returns a new Message instance (immutability).
   */
  addToolUse(toolUseId: string): Message {
    return new Message({
      id: this._id,
      role: this._role,
      content: this._content,
      timestamp: this._timestamp,
      toolUseIds: [...this._toolUseIds, toolUseId],
    });
  }
}
