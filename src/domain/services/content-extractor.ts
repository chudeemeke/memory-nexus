/**
 * ContentExtractor Domain Service
 *
 * Extracts structured content from Claude Code session JSONL lines.
 * Handles parsing of messages, tool uses, and tool results.
 *
 * Service properties:
 * - Stateless operations
 * - Pure functions (no side effects)
 * - Domain logic only (no infrastructure concerns)
 */

interface MessageContent {
  role: "user" | "assistant";
  content: string;
}

interface ToolUseContent {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultContent {
  toolUseId: string;
  content: string;
  isError: boolean;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface JsonLineData {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
}

export class ContentExtractor {
  /**
   * Extract message content from a JSONL line.
   * @param jsonLine A single line from a JSONL file
   * @returns Message content or null if not a message line
   */
  static extractMessageContent(jsonLine: string): MessageContent | null {
    const data = ContentExtractor.parseJson(jsonLine);
    if (!data) return null;

    if (!ContentExtractor.isMessageType(data.type)) return null;

    const role = ContentExtractor.mapRole(data.type);
    if (!role) return null;

    const content = ContentExtractor.extractTextContent(data.message?.content);
    if (!content) return null;

    return { role, content };
  }

  /**
   * Extract tool uses from a JSONL line.
   * @param jsonLine A single line from a JSONL file
   * @returns Array of tool use objects (empty if none found)
   */
  static extractToolUses(jsonLine: string): ToolUseContent[] {
    const data = ContentExtractor.parseJson(jsonLine);
    if (!data) return [];

    const content = data.message?.content;
    if (!Array.isArray(content)) return [];

    return content
      .filter((block): block is ContentBlock => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? "",
        name: block.name ?? "",
        input: block.input ?? {},
      }));
  }

  /**
   * Extract tool results from a JSONL line.
   * @param jsonLine A single line from a JSONL file
   * @returns Array of tool result objects (empty if none found)
   */
  static extractToolResults(jsonLine: string): ToolResultContent[] {
    const data = ContentExtractor.parseJson(jsonLine);
    if (!data) return [];

    const content = data.message?.content;
    if (!Array.isArray(content)) return [];

    return content
      .filter((block): block is ContentBlock => block.type === "tool_result")
      .map((block) => ({
        toolUseId: block.tool_use_id ?? "",
        content: block.content ?? "",
        isError: block.is_error ?? false,
      }));
  }

  /**
   * Check if a JSONL line represents a message (human or assistant).
   * @param jsonLine A single line from a JSONL file
   * @returns true if line is a message
   */
  static isMessageLine(jsonLine: string): boolean {
    const data = ContentExtractor.parseJson(jsonLine);
    if (!data) return false;

    return ContentExtractor.isMessageType(data.type);
  }

  /**
   * Extract timestamp from a JSONL line.
   * @param jsonLine A single line from a JSONL file
   * @returns Date object or null if no valid timestamp
   */
  static extractTimestamp(jsonLine: string): Date | null {
    const data = ContentExtractor.parseJson(jsonLine);
    if (!data || !data.timestamp) return null;

    const date = new Date(data.timestamp);
    if (isNaN(date.getTime())) return null;

    return date;
  }

  private static parseJson(jsonLine: string): JsonLineData | null {
    try {
      return JSON.parse(jsonLine) as JsonLineData;
    } catch {
      return null;
    }
  }

  private static isMessageType(type?: string): boolean {
    return type === "human" || type === "assistant";
  }

  private static mapRole(type?: string): "user" | "assistant" | null {
    if (type === "human") return "user";
    if (type === "assistant") return "assistant";
    return null;
  }

  private static extractTextContent(
    content?: string | ContentBlock[]
  ): string | null {
    if (!content) return null;

    if (typeof content === "string") {
      return content.length > 0 ? content : null;
    }

    if (Array.isArray(content)) {
      const textParts = content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text ?? "");

      const combined = textParts.join("\n");
      return combined.length > 0 ? combined : null;
    }

    return null;
  }
}
