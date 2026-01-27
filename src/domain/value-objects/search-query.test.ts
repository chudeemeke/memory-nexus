import { describe, expect, it } from "bun:test";
import { SearchQuery } from "./search-query.js";

describe("SearchQuery value object", () => {
  describe("construction", () => {
    it("creates from valid query string", () => {
      const query = SearchQuery.from("authentication patterns");
      expect(query.value).toBe("authentication patterns");
    });

    it("trims whitespace from query", () => {
      const query = SearchQuery.from("  spaced query  ");
      expect(query.value).toBe("spaced query");
    });

    it("throws on empty query", () => {
      expect(() => SearchQuery.from("")).toThrow("Query cannot be empty");
    });

    it("throws on whitespace-only query", () => {
      expect(() => SearchQuery.from("   ")).toThrow("Query cannot be empty");
    });
  });

  describe("immutability", () => {
    it("value property is readonly", () => {
      const query = SearchQuery.from("test query");
      expect(query.value).toBe("test query");
    });
  });

  describe("equality", () => {
    it("two queries with same value are equal", () => {
      const query1 = SearchQuery.from("test query");
      const query2 = SearchQuery.from("test query");
      expect(query1.equals(query2)).toBe(true);
    });

    it("two queries with different values are not equal", () => {
      const query1 = SearchQuery.from("query one");
      const query2 = SearchQuery.from("query two");
      expect(query1.equals(query2)).toBe(false);
    });

    it("equality is case-sensitive", () => {
      const query1 = SearchQuery.from("Test Query");
      const query2 = SearchQuery.from("test query");
      expect(query1.equals(query2)).toBe(false);
    });
  });

  describe("normalization", () => {
    it("preserves case for search", () => {
      const query = SearchQuery.from("AuthenticationPattern");
      expect(query.value).toBe("AuthenticationPattern");
    });

    it("preserves special characters", () => {
      const query = SearchQuery.from("error: connection failed");
      expect(query.value).toBe("error: connection failed");
    });

    it("preserves quotes in query", () => {
      const query = SearchQuery.from('"exact phrase"');
      expect(query.value).toBe('"exact phrase"');
    });
  });
});
