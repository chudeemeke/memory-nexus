/**
 * Event Classifier
 *
 * Routes raw JSON events from JSONL files to the appropriate ParsedEvent type.
 * Implements extraction logic for each event type.
 *
 * Based on research in: .planning/research/JSONL-EVENT-SCHEMA.md
 */

import type {
  ParsedEvent,
  ContentBlock,
  UserEventData,
  AssistantEventData,
  ToolUseEventData,
  ToolResultEventData,
  SummaryEventData,
  SystemEventData,
} from "../../domain/ports/types.js";
import { normalizeTimestamp } from "./timestamp.js";

/**
 * Event types that should be skipped (no semantic value for search).
 */
const SKIP_TYPES = new Set([
  "progress",
  "agent_progress",
  "bash_progress",
  "mcp_progress",
  "hook_progress",
  "base64",
  "image",
  "file-history-snapshot",
  "waiting_for_task",
  "create",
  "update",
  "queue-operation",
]);

/**
 * Raw event structure from JSONL files.
 */
interface RawEvent {
  type: string;
  uuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Raw user event structure.
 */
interface RawUserEvent extends RawEvent {
  type: "user";
  uuid: string;
  timestamp: string;
  message: {
    role: "user";
    content: string | RawToolResultBlock[];
  };
  cwd?: string;
  gitBranch?: string;
}

/**
 * Raw tool result block in user message content.
 */
interface RawToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | unknown;
  is_error?: boolean;
}

/**
 * Raw assistant event structure.
 */
interface RawAssistantEvent extends RawEvent {
  type: "assistant";
  uuid: string;
  timestamp: string;
  message: {
    model?: string;
    content: RawContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Raw content block types in assistant message.
 */
type RawContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string; signature?: string };

/**
 * Raw summary event structure.
 */
interface RawSummaryEvent extends RawEvent {
  type: "summary";
  summary: string;
  leafUuid?: string;
}

/**
 * Raw system event structure.
 */
interface RawSystemEvent extends RawEvent {
  type: "system";
  subtype: string;
  durationMs?: number;
  data?: unknown;
}

/**
 * Check if a value is a valid event object.
 *
 * @param value The value to check
 * @returns true if the value is a valid event object
 */
export function isValidEvent(value: unknown): value is RawEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.type === "string";
}

/**
 * Classify a raw JSON event into a ParsedEvent.
 *
 * Routes the event to the appropriate extractor based on type,
 * or returns a skipped event for non-extracted types.
 *
 * @param raw The raw JSON event object
 * @returns Classified ParsedEvent
 */
export function classifyEvent(raw: unknown): ParsedEvent {
  if (!isValidEvent(raw)) {
    return { type: "skipped", reason: "Invalid event structure" };
  }

  const eventType = raw.type;

  // Skip non-semantic event types
  if (SKIP_TYPES.has(eventType)) {
    return { type: "skipped", reason: `Event type "${eventType}" not extracted` };
  }

  // Route to appropriate extractor
  switch (eventType) {
    case "user":
      return extractUserEvent(raw as RawUserEvent);

    case "assistant":
      return extractAssistantEvent(raw as RawAssistantEvent);

    case "summary":
      return extractSummaryEvent(raw as RawSummaryEvent);

    case "system":
      return extractSystemEvent(raw as RawSystemEvent);

    default:
      return { type: "skipped", reason: `Event type "${eventType}" not classified` };
  }
}

/**
 * Extract user event data from a raw user event.
 *
 * @param raw The raw user event
 * @returns ParsedEvent with user data
 */
function extractUserEvent(raw: RawUserEvent): ParsedEvent {
  // Validate required fields
  if (!raw.uuid || !raw.timestamp || !raw.message) {
    return { type: "skipped", reason: "User event missing required fields" };
  }

  const data: UserEventData = {
    uuid: raw.uuid,
    message: {
      content: extractUserContent(raw.message.content),
    },
    timestamp: normalizeTimestamp(raw.timestamp),
  };

  // Include optional fields if present
  if (raw.cwd) {
    data.cwd = raw.cwd;
  }
  if (raw.gitBranch) {
    data.gitBranch = raw.gitBranch;
  }

  return { type: "user", data };
}

/**
 * Extract text content from user message content.
 *
 * User content can be either:
 * - A string (direct user message)
 * - An array of tool result blocks
 *
 * @param content The raw user message content
 * @returns Normalized string content
 */
function extractUserContent(content: string | RawToolResultBlock[]): string {
  // Direct string content
  if (typeof content === "string") {
    return content;
  }

  // Array of tool results - extract text content
  if (Array.isArray(content)) {
    const textParts = content
      .filter((block): block is RawToolResultBlock => block.type === "tool_result")
      .map((block) => {
        if (typeof block.content === "string") {
          return block.content;
        }
        // Non-string content (objects) - stringify
        return JSON.stringify(block.content);
      });

    return textParts.join("\n");
  }

  return "";
}

/**
 * Extract assistant event data from a raw assistant event.
 *
 * @param raw The raw assistant event
 * @returns ParsedEvent with assistant data
 */
function extractAssistantEvent(raw: RawAssistantEvent): ParsedEvent {
  // Validate required fields
  if (!raw.uuid || !raw.timestamp || !raw.message) {
    return { type: "skipped", reason: "Assistant event missing required fields" };
  }

  const content = extractContentBlocks(raw.message.content || []);

  const data: AssistantEventData = {
    uuid: raw.uuid,
    message: {
      content,
    },
    timestamp: normalizeTimestamp(raw.timestamp),
  };

  // Include model if present
  if (raw.message.model) {
    data.message.model = raw.message.model;
  }

  // Include usage statistics if present
  if (raw.message.usage) {
    data.usage = {
      inputTokens: raw.message.usage.input_tokens,
      outputTokens: raw.message.usage.output_tokens,
    };
  }

  return { type: "assistant", data };
}

/**
 * Extract content blocks from assistant message, filtering out thinking blocks.
 *
 * Thinking blocks are signature-protected and should not be extracted.
 *
 * @param rawBlocks The raw content blocks
 * @returns Filtered and normalized content blocks
 */
function extractContentBlocks(rawBlocks: RawContentBlock[]): ContentBlock[] {
  if (!Array.isArray(rawBlocks)) {
    return [];
  }

  return rawBlocks
    .filter((block): block is Exclude<RawContentBlock, { type: "thinking" }> => {
      // Filter out thinking blocks
      return block.type !== "thinking";
    })
    .map((block): ContentBlock => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        };
      }
      // This shouldn't happen after filtering, but handle it
      return { type: "text", text: "" };
    });
}

/**
 * Extract tool use events from an assistant event.
 *
 * Creates separate ToolUseEventData for each tool_use block,
 * enabling easier querying of tool usage.
 *
 * @param raw The raw assistant event
 * @returns Array of tool use event data
 */
export function extractToolUseEvents(raw: RawAssistantEvent): ToolUseEventData[] {
  if (!raw.message?.content || !Array.isArray(raw.message.content)) {
    return [];
  }

  return raw.message.content
    .filter((block): block is Extract<RawContentBlock, { type: "tool_use" }> => {
      return block.type === "tool_use";
    })
    .map((block): ToolUseEventData => ({
      uuid: block.id,
      name: block.name,
      input: block.input,
      timestamp: normalizeTimestamp(raw.timestamp),
    }));
}

/**
 * Extract tool result events from a user event.
 *
 * Creates separate ToolResultEventData for each tool_result block,
 * enabling easier querying of tool outputs.
 *
 * @param raw The raw user event
 * @returns Array of tool result event data
 */
export function extractToolResultEvents(raw: RawUserEvent): ToolResultEventData[] {
  if (!raw.message?.content || !Array.isArray(raw.message.content)) {
    return [];
  }

  return raw.message.content
    .filter((block): block is RawToolResultBlock => {
      return typeof block === "object" && block !== null && block.type === "tool_result";
    })
    .map((block): ToolResultEventData => ({
      uuid: `result-${block.tool_use_id}`,
      toolUseId: block.tool_use_id,
      content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
      isError: block.is_error ?? false,
      timestamp: normalizeTimestamp(raw.timestamp),
    }));
}

/**
 * Extract summary event data from a raw summary event.
 *
 * @param raw The raw summary event
 * @returns ParsedEvent with summary data
 */
function extractSummaryEvent(raw: RawSummaryEvent): ParsedEvent {
  // Validate required field
  if (!raw.summary) {
    return { type: "skipped", reason: "Summary event missing summary field" };
  }

  const data: SummaryEventData = {
    content: raw.summary,
    timestamp: normalizeTimestamp(raw.timestamp),
  };

  // Include leafUuid if present
  if (raw.leafUuid) {
    data.leafUuid = raw.leafUuid;
  }

  return { type: "summary", data };
}

/**
 * Extract system event data from a raw system event.
 *
 * @param raw The raw system event
 * @returns ParsedEvent with system data
 */
function extractSystemEvent(raw: RawSystemEvent): ParsedEvent {
  // Validate required field
  if (!raw.subtype) {
    return { type: "skipped", reason: "System event missing subtype field" };
  }

  const data: SystemEventData = {
    subtype: raw.subtype,
    data: raw.durationMs ?? raw.data ?? null,
    timestamp: normalizeTimestamp(raw.timestamp),
  };

  return { type: "system", data };
}
