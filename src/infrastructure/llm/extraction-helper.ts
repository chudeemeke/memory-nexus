/**
 * Extraction Helper
 *
 * Common functions for preparing fact-extraction prompts and robustly parsing
 * structured JSON arrays from LLM response texts.
 */

import type { Message } from "../../domain/entities/message.js";
import type { CandidateFact } from "../../domain/entities/fact.js";

/**
 * Builds the standardized fact extraction instruction prompt.
 */
export function buildExtractionPrompt(messages: Message[]): string {
  const formattedMessages = messages
    .map(m => `[${m.timestamp.toISOString()}] ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return [
    `You are an expert developer assistant. Analyze the following conversation transcript between a user and an AI coding assistant.`,
    `Your task is to extract a structured JSON list of key facts that occurred during this conversation.`,
    ``,
    `Specifically, you should identify and classify facts into these categories:`,
    `1. "decision": Key architectural choices, technology selections, conventions, or design decisions made.`,
    `2. "learning": Lessons learned, discoveries about tools, APIs, bugs found, environment specific issues, or workarounds.`,
    `3. "preference": User guidelines, rules, stylistic/operational preferences, or explicit constraints.`,
    `4. "friction": Pain points, slow processes, build issues, sync locks, file system access issues, command timeouts, or system bottlenecks.`,
    `5. "observation": Key metrics, observed state, runtime configurations, or general context findings.`,
    ``,
    `For each fact, assign a confidence score between 0.0 and 1.0 based on how explicitly and clearly it was stated or agreed upon in the transcript.`,
    `Provide optional structured "metadata" for additional context (e.g. rationale, severity, file path, system version, etc.).`,
    ``,
    `CRITICAL: Your output MUST be a valid JSON array of objects. Do not include any explanation, markdown formatting outside of a JSON code block, or preambles. Output ONLY the JSON.`,
    ``,
    `Format:`,
    `[`,
    `  {`,
    `    "type": "decision" | "learning" | "preference" | "friction" | "observation",`,
    `    "content": "Description of the fact",`,
    `    "metadata": { "key": "value" },`,
    `    "confidence": 0.95`,
    `  }`,
    `]`,
    ``,
    `Transcript:`,
    formattedMessages
  ].join("\n");
}

/**
 * Robustly parses and cleans a JSON array of CandidateFacts from the raw LLM output.
 */
export function parseLlmResponse(text: string): CandidateFact[] {
  const trimmed = text.trim();
  
  // Look for JSON array block [...]
  const jsonMatch = trimmed.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const jsonString = jsonMatch ? jsonMatch[0] : trimmed;

  try {
    const rawList = JSON.parse(jsonString);
    if (!Array.isArray(rawList)) {
      return [];
    }

    const facts: CandidateFact[] = [];
    for (const item of rawList) {
      if (typeof item.content !== "string" || item.content.trim() === "") {
        continue;
      }
      
      const validTypes = ["decision", "learning", "preference", "friction", "observation"];
      const type = validTypes.includes(item.type) ? item.type : "observation";
      
      const confidence = typeof item.confidence === "number"
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.8;

      facts.push({
        type: type as any,
        content: item.content.trim(),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : undefined,
        confidence
      });
    }
    return facts;
  } catch (err) {
    console.error("Failed to parse LLM facts JSON response:", err);
    return [];
  }
}
