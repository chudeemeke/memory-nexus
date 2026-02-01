/**
 * LLM Extractor Tests
 *
 * Tests for Claude-powered entity extraction from session content.
 */

import { describe, test, expect } from "bun:test";
import {
  LlmExtractor,
  type ExtractionResult,
  type LlmExtractorOptions,
} from "./llm-extractor.js";
import { Message } from "../../domain/entities/message.js";

describe("LlmExtractor", () => {
  // Helper to create test messages
  function createMessage(
    content: string,
    role: "user" | "assistant" = "assistant",
    id?: string
  ): Message {
    return Message.create({
      id: id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
    });
  }

  describe("createExtractionPrompt", () => {
    test("formats messages with role labels", () => {
      const messages = [
        createMessage("How do I implement authentication?", "user"),
        createMessage("You can use JWT tokens for authentication.", "assistant"),
      ];

      const prompt = LlmExtractor.createExtractionPrompt(messages);

      expect(prompt).toContain("[USER]");
      expect(prompt).toContain("[ASSISTANT]");
      expect(prompt).toContain("How do I implement authentication?");
      expect(prompt).toContain("JWT tokens");
    });

    test("includes extraction instructions", () => {
      const messages = [createMessage("Test content", "user")];

      const prompt = LlmExtractor.createExtractionPrompt(messages);

      expect(prompt).toContain("TOPICS");
      expect(prompt).toContain("TERMS");
      expect(prompt).toContain("DECISIONS");
      expect(prompt).toContain("SUMMARY");
      expect(prompt).toContain("JSON");
    });

    test("handles empty messages array", () => {
      const prompt = LlmExtractor.createExtractionPrompt([]);

      expect(prompt).toContain("TOPICS");
      expect(prompt).toContain("--- SESSION CONTENT ---");
    });

    test("preserves message order", () => {
      const messages = [
        createMessage("First message", "user"),
        createMessage("Second message", "assistant"),
        createMessage("Third message", "user"),
      ];

      const prompt = LlmExtractor.createExtractionPrompt(messages);

      const firstIdx = prompt.indexOf("First message");
      const secondIdx = prompt.indexOf("Second message");
      const thirdIdx = prompt.indexOf("Third message");

      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    test("includes confidence score instructions", () => {
      const prompt = LlmExtractor.createExtractionPrompt([
        createMessage("test", "user"),
      ]);

      expect(prompt).toContain("confidence");
    });
  });

  describe("parseExtractionResponse", () => {
    test("parses valid JSON response with all fields", () => {
      const response = JSON.stringify({
        topics: [{ name: "Authentication", confidence: 0.9 }],
        terms: [{ name: "JWT", definition: "JSON Web Token", confidence: 0.8 }],
        decisions: [
          {
            subject: "Auth method",
            decision: "Use JWT",
            rejected: ["Sessions"],
            rationale: "Stateless",
            confidence: 0.85,
          },
        ],
        summary: "Discussed authentication approaches.",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].name).toBe("Authentication");
      expect(result.topics[0].confidence).toBe(0.9);

      expect(result.terms).toHaveLength(1);
      expect(result.terms[0].name).toBe("JWT");
      expect(result.terms[0].metadata).toHaveProperty("definition", "JSON Web Token");

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].name).toBe("Auth method");
      expect(result.decisions[0].metadata).toHaveProperty("subject", "Auth method");
      expect(result.decisions[0].metadata).toHaveProperty("decision", "Use JWT");

      expect(result.summary).toBe("Discussed authentication approaches.");
    });

    test("handles missing topics gracefully", () => {
      const response = JSON.stringify({
        terms: [],
        decisions: [],
        summary: "Summary only.",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics).toHaveLength(0);
      expect(result.summary).toBe("Summary only.");
    });

    test("handles missing terms gracefully", () => {
      const response = JSON.stringify({
        topics: [{ name: "Topic", confidence: 0.9 }],
        decisions: [],
        summary: "Summary.",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.terms).toHaveLength(0);
      expect(result.topics).toHaveLength(1);
    });

    test("handles missing decisions gracefully", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [],
        summary: "No decisions made.",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.decisions).toHaveLength(0);
    });

    test("handles missing summary gracefully", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [],
        decisions: [],
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.summary).toBe("");
    });

    test("handles malformed JSON (returns empty result)", () => {
      const response = "This is not valid JSON { broken";

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics).toHaveLength(0);
      expect(result.terms).toHaveLength(0);
      expect(result.decisions).toHaveLength(0);
      expect(result.summary).toBe("");
    });

    test("handles completely empty response", () => {
      const result = LlmExtractor.parseExtractionResponse("", "session-1");

      expect(result.topics).toHaveLength(0);
      expect(result.terms).toHaveLength(0);
      expect(result.decisions).toHaveLength(0);
      expect(result.summary).toBe("");
    });

    test("maps topic confidence scores correctly", () => {
      const response = JSON.stringify({
        topics: [
          { name: "High", confidence: 0.95 },
          { name: "Medium", confidence: 0.7 },
          { name: "Low", confidence: 0.4 },
        ],
        terms: [],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics[0].confidence).toBe(0.95);
      expect(result.topics[1].confidence).toBe(0.7);
      expect(result.topics[2].confidence).toBe(0.4);
    });

    test("decision entities have complete metadata", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [],
        decisions: [
          {
            subject: "Database choice",
            decision: "SQLite",
            rejected: ["PostgreSQL", "MySQL"],
            rationale: "Embedded, no server needed",
            confidence: 0.9,
          },
        ],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      const decision = result.decisions[0];
      expect(decision.type).toBe("decision");
      expect(decision.metadata).toHaveProperty("subject", "Database choice");
      expect(decision.metadata).toHaveProperty("decision", "SQLite");
      expect(decision.metadata).toHaveProperty("rejected");
      expect((decision.metadata as { rejected: string[] }).rejected).toEqual([
        "PostgreSQL",
        "MySQL",
      ]);
      expect(decision.metadata).toHaveProperty("rationale", "Embedded, no server needed");
    });

    test("term entities have definition in metadata", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [
          { name: "FTS5", definition: "Full-Text Search version 5", confidence: 0.85 },
        ],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      const term = result.terms[0];
      expect(term.type).toBe("term");
      expect(term.metadata).toHaveProperty("definition", "Full-Text Search version 5");
    });

    test("extracts JSON from markdown code block", () => {
      const response = `Here is the extraction:
\`\`\`json
{
  "topics": [{"name": "Testing", "confidence": 0.9}],
  "terms": [],
  "decisions": [],
  "summary": "Test summary"
}
\`\`\``;

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].name).toBe("Testing");
      expect(result.summary).toBe("Test summary");
    });

    test("handles null values in arrays", () => {
      const response = JSON.stringify({
        topics: [null, { name: "Valid", confidence: 0.9 }, null],
        terms: null,
        decisions: [],
        summary: "Summary",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      // Should filter out nulls and handle null array
      expect(result.topics.length).toBeLessThanOrEqual(1);
      expect(result.terms).toHaveLength(0);
    });

    test("clamps confidence to valid range", () => {
      const response = JSON.stringify({
        topics: [
          { name: "Over", confidence: 1.5 },
          { name: "Under", confidence: -0.5 },
        ],
        terms: [],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      // Confidence should be clamped to 0-1 range
      expect(result.topics[0].confidence).toBeLessThanOrEqual(1);
      expect(result.topics[1].confidence).toBeGreaterThanOrEqual(0);
    });

    test("defaults missing confidence to 0.5", () => {
      const response = JSON.stringify({
        topics: [{ name: "NoConfidence" }],
        terms: [],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics[0].confidence).toBe(0.5);
    });

    test("creates concept entities for topics", () => {
      const response = JSON.stringify({
        topics: [{ name: "Hexagonal Architecture", confidence: 0.9 }],
        terms: [],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics[0].type).toBe("concept");
      expect(result.topics[0].name).toBe("Hexagonal Architecture");
    });

    test("skips topics with empty names", () => {
      const response = JSON.stringify({
        topics: [
          { name: "", confidence: 0.9 },
          { name: "  ", confidence: 0.8 },
          { name: "Valid", confidence: 0.7 },
        ],
        terms: [],
        decisions: [],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].name).toBe("Valid");
    });

    test("skips decisions missing required subject field", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [],
        decisions: [
          { decision: "Use SQLite", rationale: "Simple", confidence: 0.9 },
          {
            subject: "Valid",
            decision: "Use FTS5",
            rationale: "Fast search",
            confidence: 0.8,
          },
        ],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      // Only the valid decision should be included
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].name).toBe("Valid");
    });

    test("skips decisions missing required decision field", () => {
      const response = JSON.stringify({
        topics: [],
        terms: [],
        decisions: [
          { subject: "Database", rationale: "Needed storage", confidence: 0.9 },
        ],
        summary: "",
      });

      const result = LlmExtractor.parseExtractionResponse(response, "session-1");

      expect(result.decisions).toHaveLength(0);
    });
  });

  describe("extract (integration)", () => {
    test("returns empty result for empty messages", async () => {
      const result = await LlmExtractor.extract({
        sessionId: "session-empty",
        messages: [],
      });

      expect(result.topics).toHaveLength(0);
      expect(result.terms).toHaveLength(0);
      expect(result.decisions).toHaveLength(0);
      expect(result.summary).toBe("");
    });

    // Note: Full LLM integration requires Claude context.
    // In unit tests, we verify the prompt/parse pipeline works.
    // The actual extraction is tested in integration tests with mocks.
  });
});
