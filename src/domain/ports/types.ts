/**
 * Parsed Event Types
 *
 * Defines the discriminated union for events parsed from JSONL files.
 * These types represent the domain's view of Claude Code session events.
 *
 * Based on research in: .planning/research/JSONL-EVENT-SCHEMA.md
 */

/**
 * Content block within an assistant message.
 * Can be text or a tool use invocation.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

/**
 * Data extracted from a user message event.
 */
export interface UserEventData {
  /** Unique event identifier */
  uuid: string;
  /** User message content */
  message: {
    content: string;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Working directory at time of message */
  cwd?: string;
  /** Git branch if in a repository */
  gitBranch?: string;
}

/**
 * Data extracted from an assistant message event.
 */
export interface AssistantEventData {
  /** Unique event identifier */
  uuid: string;
  /** Assistant message with content blocks */
  message: {
    content: ContentBlock[];
    /** Model used for this response */
    model?: string;
  };
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Data extracted from a tool use event.
 * Represents when Claude invokes a tool.
 */
export interface ToolUseEventData {
  /** Unique tool use identifier */
  uuid: string;
  /** Name of the tool invoked */
  name: string;
  /** Input parameters passed to the tool */
  input: Record<string, unknown>;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Data extracted from a tool result event.
 * Represents the output from a tool invocation.
 */
export interface ToolResultEventData {
  /** Unique result identifier */
  uuid: string;
  /** ID of the tool use this result corresponds to */
  toolUseId: string;
  /** Result content (output or error message) */
  content: string;
  /** Whether the tool execution resulted in an error */
  isError: boolean;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Data extracted from a summary event.
 * Summaries are compressed session history for context management.
 */
export interface SummaryEventData {
  /** Condensed session content */
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** UUID of the last event this summary covers */
  leafUuid?: string;
}

/**
 * Data extracted from a system event.
 * System events track timing and configuration.
 */
export interface SystemEventData {
  /** System event subtype (e.g., "turn_duration") */
  subtype: string;
  /** Event-specific data */
  data: unknown;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * Discriminated union of all parsed event types.
 *
 * Use type narrowing with switch/case on the `type` field:
 * ```typescript
 * switch (event.type) {
 *   case "user":
 *     // event.data is UserEventData
 *     break;
 *   case "assistant":
 *     // event.data is AssistantEventData
 *     break;
 *   // ...
 * }
 * ```
 */
export type ParsedEvent =
  | { type: "user"; data: UserEventData }
  | { type: "assistant"; data: AssistantEventData }
  | { type: "tool_use"; data: ToolUseEventData }
  | { type: "tool_result"; data: ToolResultEventData }
  | { type: "summary"; data: SummaryEventData }
  | { type: "system"; data: SystemEventData }
  | { type: "skipped"; reason: string };
