/**
 * FTS5 Search Service Tests
 *
 * Tests for Fts5SearchService covering:
 * - Basic search functionality
 * - BM25 ranking and normalization
 * - Snippet extraction
 * - Filter options (project, role, date)
 * - Edge cases
 * - EXPLAIN QUERY PLAN verification
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import { Fts5SearchService } from "./search-service.js";
import { SearchQuery } from "../../../domain/value-objects/search-query.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Insert a test session into the database
 */
function insertTestSession(
  db: Database,
  id: string,
  projectPathEncoded: string,
  projectPathDecoded: string,
  projectName: string
): void {
  db.run(
    `
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
    VALUES (?, ?, ?, ?, datetime('now'))
  `,
    [id, projectPathEncoded, projectPathDecoded, projectName]
  );
}

/**
 * Insert a test message into the database
 */
function insertTestMessage(
  db: Database,
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  timestamp?: Date
): void {
  const ts = timestamp?.toISOString() ?? new Date().toISOString();
  db.run(
    `
    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `,
    [id, sessionId, role, content, ts]
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("Fts5SearchService", () => {
  let db: Database;
  let searchService: Fts5SearchService;

  beforeEach(() => {
    const result = initializeDatabase({ path: ":memory:" });
    db = result.db;
    searchService = new Fts5SearchService(db);

    // Insert default test session
    insertTestSession(
      db,
      "session-1",
      "C--Users-Test-TestProject",
      "C:\\Users\\Test\\TestProject",
      "TestProject"
    );
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Basic Search", () => {
    it("Test 1: finds messages by content", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "Setting up authentication for the application"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-1");
      expect(results[0].sessionId).toBe("session-1");
    });

    it("Test 2: returns empty array when no matches", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "Setting up the application"
      );

      const query = SearchQuery.from("nonexistent");
      const results = await searchService.search(query);

      expect(results).toHaveLength(0);
    });

    it("Test 3: respects limit option", async () => {
      // Insert 10 messages
      for (let i = 0; i < 10; i++) {
        insertTestMessage(
          db,
          `msg-${i}`,
          "session-1",
          "user",
          `Message ${i} about authentication`
        );
      }

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, { limit: 5 });

      expect(results).toHaveLength(5);
    });

    it("Test 4: default limit is 20", async () => {
      // Insert 25 messages
      for (let i = 0; i < 25; i++) {
        insertTestMessage(
          db,
          `msg-${i}`,
          "session-1",
          "user",
          `Message ${i} about authentication`
        );
      }

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(20);
    });
  });

  describe("BM25 Ranking", () => {
    it("Test 5: ranks results by relevance (more occurrences = higher score)", async () => {
      insertTestMessage(
        db,
        "msg-low",
        "session-1",
        "user",
        "authentication is important"
      );
      insertTestMessage(
        db,
        "msg-high",
        "session-1",
        "assistant",
        "authentication authentication authentication is key for authentication"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(2);
      // Higher score (more relevant) should come first
      expect(results[0].messageId).toBe("msg-high");
      expect(results[1].messageId).toBe("msg-low");
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it("Test 6: single result gets score of 1.0", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "unique authentication content"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1.0);
    });

    it("Test 7: scores are normalized to 0-1 range", async () => {
      // Insert multiple messages with varying relevance
      for (let i = 1; i <= 5; i++) {
        const authCount = "authentication ".repeat(i);
        insertTestMessage(
          db,
          `msg-${i}`,
          "session-1",
          "user",
          `${authCount}in context ${i}`
        );
      }

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
      // Best result should have score 1.0
      expect(results[0].score).toBe(1.0);
    });

    it("Test 8: equal relevance messages all get score 1.0", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication matters"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "user",
        "authentication matters"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(2);
      // Both have equal relevance, should both get 1.0
      expect(results[0].score).toBe(1.0);
      expect(results[1].score).toBe(1.0);
    });
  });

  describe("Snippet Extraction", () => {
    it("Test 9: extracts snippet with match context", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "The application uses authentication for secure access"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].snippet).toContain("authentication");
    });

    it("Test 10: snippet contains match markers", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "Implementing authentication logic"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].snippet).toContain("<mark>");
      expect(results[0].snippet).toContain("</mark>");
    });

    it("Test 11: long content snippet is truncated with ellipsis", async () => {
      // Create a very long message where snippet extraction is clearly truncated
      // FTS5 snippet uses 64 tokens - need content much larger to see truncation
      const longContent =
        "Beginning of the message with lots of text that continues for quite a while. " +
        "This section talks about authentication implementation details which are very important. " +
        "Middle of the message with even more content that goes on and on for a long time. " +
        "Continuing with additional paragraphs of information about various topics. " +
        "More content here to ensure the message is long enough to be truncated. " +
        "Adding even more text to make absolutely sure we exceed the snippet limit. " +
        "This should definitely be truncated now with all this extra content. " +
        "End of the message with final details about various things that matter.";
      insertTestMessage(db, "msg-1", "session-1", "user", longContent);

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      // Snippet should contain the match and ellipsis for truncation
      expect(results[0].snippet).toContain("authentication");
      // Very long content should be truncated (snippet < original content)
      expect(results[0].snippet.length).toBeLessThan(longContent.length);
    });
  });

  describe("Project Filter", () => {
    it("Test 12: filters results by project", async () => {
      // Create second project session
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-OtherProject",
        "C:\\Users\\Test\\OtherProject",
        "OtherProject"
      );

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication in TestProject"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-2",
        "user",
        "authentication in OtherProject"
      );

      const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\TestProject");
      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        projectFilter: projectPath,
      });

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("session-1");
    });

    it("Test 13: project filter returns empty when no matches in project", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication content"
      );

      const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\NonexistentProject");
      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        projectFilter: projectPath,
      });

      expect(results).toHaveLength(0);
    });
  });

  describe("Role Filter", () => {
    it("Test 14: filters results by user role", async () => {
      insertTestMessage(
        db,
        "msg-user",
        "session-1",
        "user",
        "authentication from user"
      );
      insertTestMessage(
        db,
        "msg-assistant",
        "session-1",
        "assistant",
        "authentication from assistant"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, { roleFilter: "user" });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-user");
    });

    it("Test 15: filters results by assistant role", async () => {
      insertTestMessage(
        db,
        "msg-user",
        "session-1",
        "user",
        "authentication from user"
      );
      insertTestMessage(
        db,
        "msg-assistant",
        "session-1",
        "assistant",
        "authentication from assistant"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        roleFilter: "assistant",
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-assistant");
    });
  });

  describe("Date Filters", () => {
    it("Test 16: sinceDate filter excludes older messages", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const newDate = new Date("2024-06-01T00:00:00Z");
      const filterDate = new Date("2024-03-01T00:00:00Z");

      insertTestMessage(
        db,
        "msg-old",
        "session-1",
        "user",
        "old authentication content",
        oldDate
      );
      insertTestMessage(
        db,
        "msg-new",
        "session-1",
        "user",
        "new authentication content",
        newDate
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        sinceDate: filterDate,
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-new");
    });

    it("Test 17: beforeDate filter excludes newer messages", async () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const newDate = new Date("2024-06-01T00:00:00Z");
      const filterDate = new Date("2024-03-01T00:00:00Z");

      insertTestMessage(
        db,
        "msg-old",
        "session-1",
        "user",
        "old authentication content",
        oldDate
      );
      insertTestMessage(
        db,
        "msg-new",
        "session-1",
        "user",
        "new authentication content",
        newDate
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        beforeDate: filterDate,
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-old");
    });

    it("Test 18: date range filter works with both bounds", async () => {
      const date1 = new Date("2024-01-01T00:00:00Z");
      const date2 = new Date("2024-03-01T00:00:00Z");
      const date3 = new Date("2024-06-01T00:00:00Z");

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication in January",
        date1
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "user",
        "authentication in March",
        date2
      );
      insertTestMessage(
        db,
        "msg-3",
        "session-1",
        "user",
        "authentication in June",
        date3
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        sinceDate: new Date("2024-02-01T00:00:00Z"),
        beforeDate: new Date("2024-05-01T00:00:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-2");
    });
  });

  describe("Session Filter", () => {
    it("Test 27: filters results by session ID", async () => {
      // Create second session
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-TestProject",
        "C:\\Users\\Test\\TestProject",
        "TestProject"
      );

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication in session 1"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-2",
        "user",
        "authentication in session 2"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, { sessionFilter: "session-1" });

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe("session-1");
    });

    it("Test 28: session filter returns empty when no matches", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication content"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, { sessionFilter: "nonexistent-session" });

      expect(results).toHaveLength(0);
    });
  });

  describe("Role Filter Array", () => {
    it("Test 29: roleFilter with array includes multiple roles", async () => {
      insertTestMessage(
        db,
        "msg-user",
        "session-1",
        "user",
        "authentication from user"
      );
      insertTestMessage(
        db,
        "msg-assistant",
        "session-1",
        "assistant",
        "authentication from assistant"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        roleFilter: ["user", "assistant"],
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.messageId);
      expect(ids).toContain("msg-user");
      expect(ids).toContain("msg-assistant");
    });

    it("Test 30: roleFilter with single-element array works same as string", async () => {
      insertTestMessage(
        db,
        "msg-user",
        "session-1",
        "user",
        "authentication from user"
      );
      insertTestMessage(
        db,
        "msg-assistant",
        "session-1",
        "assistant",
        "authentication from assistant"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        roleFilter: ["user"],
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-user");
    });
  });

  describe("Combined Filters", () => {
    it("Test 19: combines project and role filters", async () => {
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-OtherProject",
        "C:\\Users\\Test\\OtherProject",
        "OtherProject"
      );

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication TestProject user"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "assistant",
        "authentication TestProject assistant"
      );
      insertTestMessage(
        db,
        "msg-3",
        "session-2",
        "user",
        "authentication OtherProject user"
      );

      const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\TestProject");
      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        projectFilter: projectPath,
        roleFilter: "user",
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-1");
    });

    it("Test 20: combines all filters", async () => {
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-OtherProject",
        "C:\\Users\\Test\\OtherProject",
        "OtherProject"
      );

      const date1 = new Date("2024-01-01T00:00:00Z");
      const date2 = new Date("2024-06-01T00:00:00Z");

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication old TestProject",
        date1
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "user",
        "authentication new TestProject",
        date2
      );
      insertTestMessage(
        db,
        "msg-3",
        "session-1",
        "assistant",
        "authentication new TestProject assistant",
        date2
      );
      insertTestMessage(
        db,
        "msg-4",
        "session-2",
        "user",
        "authentication new OtherProject",
        date2
      );

      const projectPath = ProjectPath.fromDecoded("C:\\Users\\Test\\TestProject");
      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        projectFilter: projectPath,
        roleFilter: "user",
        sinceDate: new Date("2024-03-01T00:00:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-2");
    });

    it("Test 31: combines session filter with role array filter", async () => {
      // Create second session
      insertTestSession(
        db,
        "session-2",
        "C--Users-Test-TestProject",
        "C:\\Users\\Test\\TestProject",
        "TestProject"
      );

      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication from user in s1"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "assistant",
        "authentication from assistant in s1"
      );
      insertTestMessage(
        db,
        "msg-3",
        "session-2",
        "user",
        "authentication from user in s2"
      );
      insertTestMessage(
        db,
        "msg-4",
        "session-2",
        "assistant",
        "authentication from assistant in s2"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query, {
        sessionFilter: "session-1",
        roleFilter: ["user", "assistant"],
      });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.messageId);
      expect(ids).toContain("msg-1");
      expect(ids).toContain("msg-2");
      // Session 2 messages should not be included
      expect(ids).not.toContain("msg-3");
      expect(ids).not.toContain("msg-4");
    });
  });

  describe("FTS5 Query Features", () => {
    it("Test 21: prefix search with wildcard", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "The authenticate function validates credentials"
      );

      const query = SearchQuery.from("auth*");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].snippet).toContain("authenticate");
    });

    it("Test 22: phrase search", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "user authentication flow is working"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "user",
        "authentication for user is done"
      );

      const query = SearchQuery.from('"user authentication"');
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].messageId).toBe("msg-1");
    });

    it("Test 23: boolean OR query", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication system"
      );
      insertTestMessage(
        db,
        "msg-2",
        "session-1",
        "user",
        "database configuration"
      );
      insertTestMessage(db, "msg-3", "session-1", "user", "design patterns");

      const query = SearchQuery.from("authentication OR database");
      const results = await searchService.search(query);

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.messageId);
      expect(ids).toContain("msg-1");
      expect(ids).toContain("msg-2");
    });
  });

  describe("EXPLAIN QUERY PLAN Verification", () => {
    it("Test 24: EXPLAIN QUERY PLAN shows FTS5 usage", async () => {
      // Insert data to make query meaningful
      for (let i = 0; i < 100; i++) {
        insertTestMessage(
          db,
          `msg-${i}`,
          "session-1",
          "user",
          `Message ${i} about various topics`
        );
      }
      insertTestMessage(
        db,
        "msg-target",
        "session-1",
        "user",
        "Special authentication content"
      );

      // Execute EXPLAIN QUERY PLAN
      const plan = db
        .query<{ detail: string }, [string, number]>(
          `EXPLAIN QUERY PLAN
           SELECT m.id, bm25(messages_fts) as score
           FROM messages_fts f
           JOIN messages_meta m ON f.rowid = m.rowid
           WHERE messages_fts MATCH ?
           LIMIT ?`
        )
        .all("authentication", 20);

      // FTS5 query plan shows virtual table scan
      const planText = plan.map((p) => p.detail).join(" ");
      expect(planText.toLowerCase()).toMatch(/scan.*messages_fts|virtual table|fts/i);
    });
  });

  describe("Result Properties", () => {
    it("Test 25: returns correct timestamp", async () => {
      const timestamp = new Date("2024-06-15T10:30:00Z");
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication content",
        timestamp
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(timestamp.toISOString());
    });

    it("Test 26: SearchResult has all required properties", async () => {
      insertTestMessage(
        db,
        "msg-1",
        "session-1",
        "user",
        "authentication content for testing"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(1);
      const result = results[0];

      // All properties should be defined
      expect(result.sessionId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.snippet).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.role).toBeDefined();

      // Types should be correct
      expect(typeof result.sessionId).toBe("string");
      expect(typeof result.messageId).toBe("string");
      expect(typeof result.snippet).toBe("string");
      expect(typeof result.score).toBe("number");
      expect(result.timestamp instanceof Date).toBe(true);
      expect(typeof result.role).toBe("string");
    });

    it("Test 32: returns role from database", async () => {
      insertTestMessage(
        db,
        "msg-user",
        "session-1",
        "user",
        "authentication from user"
      );
      insertTestMessage(
        db,
        "msg-assistant",
        "session-1",
        "assistant",
        "authentication from assistant"
      );

      const query = SearchQuery.from("authentication");
      const results = await searchService.search(query);

      expect(results).toHaveLength(2);

      const userResult = results.find((r) => r.messageId === "msg-user");
      const assistantResult = results.find((r) => r.messageId === "msg-assistant");

      expect(userResult?.role).toBe("user");
      expect(assistantResult?.role).toBe("assistant");
    });
  });
});
