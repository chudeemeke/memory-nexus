import { describe, expect, it } from "bun:test";
import { SearchResult } from "./search-result.js";

describe("SearchResult value object", () => {
  const validParams = {
    sessionId: "session-123",
    messageId: "msg-456",
    snippet: "This is a matching text snippet...",
    score: 0.95,
    timestamp: new Date("2024-01-15T10:30:00Z"),
  };

  describe("construction", () => {
    it("creates from valid parameters", () => {
      const result = SearchResult.create(validParams);
      expect(result.sessionId).toBe("session-123");
      expect(result.messageId).toBe("msg-456");
      expect(result.snippet).toBe("This is a matching text snippet...");
      expect(result.score).toBe(0.95);
      expect(result.timestamp).toEqual(new Date("2024-01-15T10:30:00Z"));
    });

    it("throws on empty sessionId", () => {
      expect(() =>
        SearchResult.create({ ...validParams, sessionId: "" })
      ).toThrow("Session ID cannot be empty");
    });

    it("throws on empty messageId", () => {
      expect(() =>
        SearchResult.create({ ...validParams, messageId: "" })
      ).toThrow("Message ID cannot be empty");
    });

    it("throws on empty snippet", () => {
      expect(() =>
        SearchResult.create({ ...validParams, snippet: "" })
      ).toThrow("Snippet cannot be empty");
    });

    it("throws on score below 0", () => {
      expect(() =>
        SearchResult.create({ ...validParams, score: -0.1 })
      ).toThrow("Score must be between 0 and 1");
    });

    it("throws on score above 1", () => {
      expect(() =>
        SearchResult.create({ ...validParams, score: 1.5 })
      ).toThrow("Score must be between 0 and 1");
    });

    it("accepts score of 0", () => {
      const result = SearchResult.create({ ...validParams, score: 0 });
      expect(result.score).toBe(0);
    });

    it("accepts score of 1", () => {
      const result = SearchResult.create({ ...validParams, score: 1 });
      expect(result.score).toBe(1);
    });
  });

  describe("immutability", () => {
    it("properties are readonly", () => {
      const result = SearchResult.create(validParams);
      expect(result.sessionId).toBe("session-123");
      expect(result.messageId).toBe("msg-456");
      expect(result.snippet).toBe("This is a matching text snippet...");
      expect(result.score).toBe(0.95);
    });

    it("timestamp is a copy, not reference", () => {
      const originalDate = new Date("2024-01-15T10:30:00Z");
      const result = SearchResult.create({ ...validParams, timestamp: originalDate });

      // Mutating original should not affect result
      originalDate.setFullYear(2020);
      expect(result.timestamp.getFullYear()).toBe(2024);
    });
  });

  describe("equality", () => {
    it("two results with same sessionId and messageId are equal", () => {
      const result1 = SearchResult.create(validParams);
      const result2 = SearchResult.create(validParams);
      expect(result1.equals(result2)).toBe(true);
    });

    it("results with different sessionId are not equal", () => {
      const result1 = SearchResult.create(validParams);
      const result2 = SearchResult.create({ ...validParams, sessionId: "different" });
      expect(result1.equals(result2)).toBe(false);
    });

    it("results with different messageId are not equal", () => {
      const result1 = SearchResult.create(validParams);
      const result2 = SearchResult.create({ ...validParams, messageId: "different" });
      expect(result1.equals(result2)).toBe(false);
    });

    it("results with same IDs but different scores are still equal", () => {
      const result1 = SearchResult.create(validParams);
      const result2 = SearchResult.create({ ...validParams, score: 0.5 });
      expect(result1.equals(result2)).toBe(true);
    });
  });

  describe("comparison", () => {
    it("compares by score in descending order", () => {
      const result1 = SearchResult.create({ ...validParams, score: 0.9 });
      const result2 = SearchResult.create({ ...validParams, messageId: "other", score: 0.5 });
      expect(result1.compareByScore(result2)).toBeLessThan(0);
    });

    it("higher score comes first", () => {
      const result1 = SearchResult.create({ ...validParams, score: 0.5 });
      const result2 = SearchResult.create({ ...validParams, messageId: "other", score: 0.9 });
      expect(result1.compareByScore(result2)).toBeGreaterThan(0);
    });

    it("equal scores return 0", () => {
      const result1 = SearchResult.create({ ...validParams, score: 0.8 });
      const result2 = SearchResult.create({ ...validParams, messageId: "other", score: 0.8 });
      expect(result1.compareByScore(result2)).toBe(0);
    });
  });
});
