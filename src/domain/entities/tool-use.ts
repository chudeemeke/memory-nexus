/**
 * ToolUse Entity
 *
 * Represents a single tool invocation within a Claude Code session.
 * Tracks the tool name, input parameters, result, and execution status.
 *
 * Entity properties:
 * - Has unique identity (id)
 * - Immutable after construction (status updates return new instances)
 * - Tracks execution lifecycle (pending -> success/error)
 */

export type ToolUseStatus = "pending" | "success" | "error";

const VALID_STATUSES: ToolUseStatus[] = ["pending", "success", "error"];

interface ToolUseParams {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: Date;
  status?: ToolUseStatus | undefined;
  result?: string | undefined;
}

export class ToolUse {
  private readonly _id: string;
  private readonly _name: string;
  private readonly _input: Record<string, unknown>;
  private readonly _timestamp: Date;
  private readonly _status: ToolUseStatus;
  private readonly _result?: string | undefined;

  private constructor(params: ToolUseParams) {
    this._id = params.id;
    this._name = params.name;
    this._input = structuredClone(params.input);
    this._timestamp = new Date(params.timestamp.getTime());
    this._status = params.status ?? "pending";
    this._result = params.result;
  }

  /**
   * Create a ToolUse entity.
   * @throws Error if id or name is empty, or status is invalid
   */
  static create(params: ToolUseParams): ToolUse {
    if (!params.id || params.id.trim() === "") {
      throw new Error("Tool use ID cannot be empty");
    }
    if (!params.name || params.name.trim() === "") {
      throw new Error("Tool name cannot be empty");
    }
    if (params.status && !VALID_STATUSES.includes(params.status)) {
      throw new Error("Invalid tool use status");
    }
    return new ToolUse(params);
  }

  /**
   * The unique tool use identifier.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The name of the tool that was invoked.
   */
  get name(): string {
    return this._name;
  }

  /**
   * The input parameters passed to the tool.
   */
  get input(): Record<string, unknown> {
    return structuredClone(this._input);
  }

  /**
   * When the tool was invoked.
   */
  get timestamp(): Date {
    return new Date(this._timestamp.getTime());
  }

  /**
   * The execution status (pending, success, or error).
   */
  get status(): ToolUseStatus {
    return this._status;
  }

  /**
   * The result of the tool execution (output or error message).
   */
  get result(): string | undefined {
    return this._result;
  }

  /**
   * Whether the tool execution is still pending.
   */
  get isPending(): boolean {
    return this._status === "pending";
  }

  /**
   * Whether the tool execution completed successfully.
   */
  get isSuccess(): boolean {
    return this._status === "success";
  }

  /**
   * Whether the tool execution failed.
   */
  get isError(): boolean {
    return this._status === "error";
  }

  /**
   * Check equality with another ToolUse (based on id).
   */
  equals(other: ToolUse): boolean {
    return this._id === other._id;
  }

  /**
   * Mark this tool use as successfully completed.
   * Returns a new ToolUse instance (immutability).
   */
  completeSuccess(result: string): ToolUse {
    return new ToolUse({
      id: this._id,
      name: this._name,
      input: this._input,
      timestamp: this._timestamp,
      status: "success",
      result,
    });
  }

  /**
   * Mark this tool use as failed.
   * Returns a new ToolUse instance (immutability).
   */
  completeError(errorMessage: string): ToolUse {
    return new ToolUse({
      id: this._id,
      name: this._name,
      input: this._input,
      timestamp: this._timestamp,
      status: "error",
      result: errorMessage,
    });
  }
}
