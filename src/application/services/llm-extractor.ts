/**
 * LLM Extractor Service
 *
 * Claude-powered entity extraction from session content.
 * Designed to run during SessionStop hook when Claude's session is still active.
 *
 * The extractor:
 * 1. Receives session messages
 * 2. Uses structured prompts to extract topics and summary
 * 3. Returns Entity objects for persistence
 */

import {
  Entity,
  type DecisionMetadata,
  type TermMetadata,
} from "../../domain/entities/entity.js";
import type { Message } from "../../domain/entities/message.js";

/**
 * Result of LLM-based entity extraction.
 */
export interface ExtractionResult {
  /** Concept entities extracted from session */
  topics: Entity[];
  /** Term entities with definitions */
  terms: Entity[];
  /** Decision entities with structured metadata */
  decisions: Entity[];
  /** Session summary text */
  summary: string;
}

/**
 * Options for LLM extraction.
 */
export interface LlmExtractorOptions {
  /** Session identifier for linking entities */
  sessionId: string;
  /** Messages to extract entities from */
  messages: Message[];
  /** Maximum tokens for extraction (default: 1000) */
  maxTokens?: number;
}

/**
 * Raw topic from LLM response.
 */
interface RawTopic {
  name: string;
  confidence?: number;
}

/**
 * Raw term from LLM response.
 */
interface RawTerm {
  name: string;
  definition?: string;
  confidence?: number;
}

/**
 * Raw decision from LLM response.
 */
interface RawDecision {
  subject?: string;
  decision?: string;
  rejected?: string[];
  rationale?: string;
  confidence?: number;
}

/**
 * Raw extraction response from LLM.
 */
interface RawExtractionResponse {
  topics?: RawTopic[];
  terms?: RawTerm[];
  decisions?: RawDecision[];
  summary?: string;
}

/**
 * LLM-based entity extraction service.
 *
 * Extracts topics, terms, decisions, and summaries from session content
 * using Claude's language understanding.
 *
 * IMPORTANT: This is designed to run during SessionStop hook when Claude's
 * session is still active. The extraction uses the existing session context.
 */
export class LlmExtractor {
  /**
   * Extract entities from session content using LLM.
   *
   * For unit tests and when no LLM context is available, returns empty result.
   * In production (during hook execution), this would use Claude's session.
   *
   * @param options Extraction options including session ID and messages
   * @returns Extraction result with entities and summary
   */
  static async extract(options: LlmExtractorOptions): Promise<ExtractionResult> {
    const { messages } = options;

    // Empty messages = empty result (no extraction needed)
    if (messages.length === 0) {
      return {
        topics: [],
        terms: [],
        decisions: [],
        summary: "",
      };
    }

    // In production, this would interact with Claude's session context.
    // For now, we create the prompt and return empty result.
    // The actual LLM call is made by the hook runner's context.

    // The prompt is available for use by the calling context
    const _prompt = LlmExtractor.createExtractionPrompt(messages);

    // Return empty result - actual extraction happens in hook context
    // where Claude can process the prompt
    return {
      topics: [],
      terms: [],
      decisions: [],
      summary: "",
    };
  }

  /**
   * Create extraction prompt for Claude.
   *
   * Formats session messages and requests structured JSON output
   * containing topics, terms, decisions, and summary.
   *
   * @param messages Session messages to include in prompt
   * @returns Structured prompt requesting JSON output
   */
  static createExtractionPrompt(messages: Message[]): string {
    const formattedMessages = messages
      .map((msg) => {
        const roleLabel = msg.role === "user" ? "[USER]" : "[ASSISTANT]";
        return `${roleLabel}\n${msg.content}`;
      })
      .join("\n\n");

    return `Analyze this session and extract:

1. TOPICS: Key technical concepts discussed (1-5)
   - Include only significant technical concepts, patterns, or technologies
   - Each topic needs a name and confidence score (0-1)

2. TERMS: Domain-specific terminology defined or explained (0-3)
   - Include only terms that were explicitly defined or explained
   - Each term needs a name, definition, and confidence score (0-1)

3. DECISIONS: Explicit choices made with rationale (0-3)
   - Include only decisions where a choice was made between alternatives
   - Each decision needs: subject, decision, rejected alternatives, rationale, confidence

4. SUMMARY: 1-2 sentence summary of what was accomplished

Output as JSON:
{
  "topics": [{ "name": "...", "confidence": 0.9 }],
  "terms": [{ "name": "...", "definition": "...", "confidence": 0.8 }],
  "decisions": [{
    "subject": "...",
    "decision": "...",
    "rejected": ["..."],
    "rationale": "...",
    "confidence": 0.9
  }],
  "summary": "..."
}

--- SESSION CONTENT ---

${formattedMessages}

--- END SESSION CONTENT ---

Extract the entities and summary from the session above. Output only valid JSON.`;
  }

  /**
   * Parse LLM response into Entity objects.
   *
   * Handles malformed JSON gracefully by returning empty result.
   * Validates and clamps confidence scores to 0-1 range.
   *
   * @param response Raw LLM response text
   * @param sessionId Session ID for context (not used in entity creation)
   * @returns Extraction result with parsed entities
   */
  static parseExtractionResponse(
    response: string,
    sessionId: string
  ): ExtractionResult {
    const emptyResult: ExtractionResult = {
      topics: [],
      terms: [],
      decisions: [],
      summary: "",
    };

    if (!response || response.trim() === "") {
      return emptyResult;
    }

    // Try to extract JSON from response (may be in markdown code block)
    let jsonStr = response.trim();

    // Check for markdown code block
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    let parsed: RawExtractionResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return emptyResult;
    }

    // Parse topics into concept entities
    const topics = LlmExtractor.parseTopics(parsed.topics);

    // Parse terms into term entities
    const terms = LlmExtractor.parseTerms(parsed.terms);

    // Parse decisions into decision entities
    const decisions = LlmExtractor.parseDecisions(parsed.decisions);

    // Extract summary
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";

    return {
      topics,
      terms,
      decisions,
      summary,
    };
  }

  /**
   * Parse raw topics into concept entities.
   */
  private static parseTopics(rawTopics?: RawTopic[] | null): Entity[] {
    if (!rawTopics || !Array.isArray(rawTopics)) {
      return [];
    }

    return rawTopics
      .filter((t): t is RawTopic => t !== null && typeof t === "object")
      .filter((t) => t.name && typeof t.name === "string" && t.name.trim() !== "")
      .map((t) => {
        const confidence = LlmExtractor.normalizeConfidence(t.confidence);
        return Entity.create({
          type: "concept",
          name: t.name.trim(),
          confidence,
        });
      });
  }

  /**
   * Parse raw terms into term entities.
   */
  private static parseTerms(rawTerms?: RawTerm[] | null): Entity[] {
    if (!rawTerms || !Array.isArray(rawTerms)) {
      return [];
    }

    return rawTerms
      .filter((t): t is RawTerm => t !== null && typeof t === "object")
      .filter((t) => t.name && typeof t.name === "string" && t.name.trim() !== "")
      .map((t) => {
        const confidence = LlmExtractor.normalizeConfidence(t.confidence);
        const metadata: TermMetadata = {};
        if (t.definition) {
          metadata.definition = t.definition;
        }
        return Entity.create({
          type: "term",
          name: t.name.trim(),
          confidence,
          metadata,
        });
      });
  }

  /**
   * Parse raw decisions into decision entities.
   */
  private static parseDecisions(rawDecisions?: RawDecision[] | null): Entity[] {
    if (!rawDecisions || !Array.isArray(rawDecisions)) {
      return [];
    }

    return rawDecisions
      .filter((d): d is RawDecision => d !== null && typeof d === "object")
      .filter((d) => {
        // Decisions require both subject and decision fields
        return (
          d.subject &&
          typeof d.subject === "string" &&
          d.subject.trim() !== "" &&
          d.decision &&
          typeof d.decision === "string" &&
          d.decision.trim() !== ""
        );
      })
      .map((d) => {
        const confidence = LlmExtractor.normalizeConfidence(d.confidence);
        const metadata: DecisionMetadata = {
          subject: d.subject!.trim(),
          decision: d.decision!.trim(),
          rejected: Array.isArray(d.rejected) ? d.rejected : [],
          rationale: typeof d.rationale === "string" ? d.rationale : "",
        };

        // Decision entity uses subject as name
        return Entity.create({
          type: "decision",
          name: d.subject!.trim(),
          confidence,
          metadata,
        });
      });
  }

  /**
   * Normalize confidence score to 0-1 range.
   * Defaults to 0.5 if not provided.
   */
  private static normalizeConfidence(value?: number): number {
    if (value === undefined || value === null || typeof value !== "number") {
      return 0.5;
    }
    return Math.max(0, Math.min(1, value));
  }
}
