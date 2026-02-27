import { describe, expect, it } from "bun:test";
import { SearchResult } from "./search-result.js";
import type { SearchMode, HybridSearchOptions } from "../ports/services.js";

describe("SearchResult value object", () => {
  const validParams = {
    sessionId: "session-123",
    messageId: "msg-456",
    snippet: "This is a matching text snippet...",
    score: 0.95,
    timestamp: new Date("2024-01-15T10:30:00Z"),
    role: "user",
  };

  describe("construction", () => {
    it("creates from valid parameters", () => {
      const result = SearchResult.create(validParams);
      expect(result.sessionId).toBe("session-123");
      expect(result.messageId).toBe("msg-456");
      expect(result.snippet).toBe("This is a matching text snippet...");
      expect(result.score).toBe(0.95);
      expect(result.timestamp).toEqual(new Date("2024-01-15T10:30:00Z"));
      expect(result.role).toBe("user");
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

    it("throws on empty role", () => {
      expect(() =>
        SearchResult.create({ ...validParams, role: "" })
      ).toThrow("Role cannot be empty");
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
      expect(result.role).toBe("user");
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

  describe("hybrid search extensions", () => {
    it("source and rawScores are undefined when not provided", () => {
      const result = SearchResult.create(validParams);
      expect(result.source).toBeUndefined();
      expect(result.rawScores).toBeUndefined();
    });

    it("accepts source 'fts'", () => {
      const result = SearchResult.create({ ...validParams, source: "fts" });
      expect(result.source).toBe("fts");
    });

    it("accepts source 'vector'", () => {
      const result = SearchResult.create({ ...validParams, source: "vector" });
      expect(result.source).toBe("vector");
    });

    it("accepts source 'both'", () => {
      const result = SearchResult.create({ ...validParams, source: "both" });
      expect(result.source).toBe("both");
    });

    it("accepts rawScores object", () => {
      const rawScores = { bm25: -5.2, cosine: 0.85, rrf: 0.032 };
      const result = SearchResult.create({ ...validParams, rawScores });
      expect(result.rawScores).toEqual(rawScores);
    });

    it("rawScores and source are independent", () => {
      const rawScores = { cosine: 0.9 };
      const result = SearchResult.create({ ...validParams, source: "vector", rawScores });
      expect(result.source).toBe("vector");
      expect(result.rawScores).toEqual(rawScores);
    });

    it("equality is identity-based, ignores source differences", () => {
      const result1 = SearchResult.create({ ...validParams, source: "fts" });
      const result2 = SearchResult.create({ ...validParams, source: "vector" });
      expect(result1.equals(result2)).toBe(true);
    });
  });

  describe("domain type compilation", () => {
    it("SearchMode type accepts valid values", () => {
      const modes: SearchMode[] = ["auto", "fts", "vector", "hybrid"];
      expect(modes).toHaveLength(4);
    });

    it("HybridSearchOptions extends SearchOptions", () => {
      const opts: HybridSearchOptions = {
        limit: 10,
        mode: "hybrid",
        noDecay: true,
      };
      expect(opts.mode).toBe("hybrid");
      expect(opts.noDecay).toBe(true);
      expect(opts.limit).toBe(10);
    });
  });
});
