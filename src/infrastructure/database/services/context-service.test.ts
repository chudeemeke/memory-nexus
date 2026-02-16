/**
 * SQLite Context Service Tests
 *
 * Tests for SqliteContextService covering:
 * - Unknown project handling
 * - Session and message counts
 * - User/assistant message breakdown
 * - Tool usage aggregation
 * - Topics from links table
 * - Date filtering with --days
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import { SqliteContextService } from "./context-service.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Insert a test session into the database.
 */
function insertTestSession(
  db: Database,
  id: string,
  projectPathEncoded: string,
  projectPathDecoded: string,
  projectName: string,
  startTime?: Date
): void {
  const time = startTime ?? new Date();
  db.run(
    `
    INSERT INTO sessions (id, project_path_encoded, project_path_decoded, project_name, start_time)
    VALUES (?, ?, ?, ?, ?)
    `,
    [id, projectPathEncoded, projectPathDecoded, projectName, time.toISOString()]
  );
}

/**
 * Insert a test message into the database.
 */
function insertTestMessage(
  db: Database,
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string
): void {
  db.run(
    `
    INSERT INTO messages_meta (id, session_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, datetime('now'))
    `,
    [id, sessionId, role, content]
  );
}

/**
 * Insert a test tool use into the database.
 */
function insertTestToolUse(
  db: Database,
  id: string,
  sessionId: string,
  toolName: string,
  timestamp?: Date
): void {
  const time = timestamp ?? new Date();
  db.run(
    `
    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
    VALUES (?, ?, ?, '{}', ?, 'success')
    `,
    [id, sessionId, toolName, time.toISOString()]
  );
}

/**
 * Insert a test link (topic) into the database.
 */
function insertTestLink(
  db: Database,
  sessionId: string,
  topic: string,
  weight: number = 1.0
): void {
  db.run(
    `
    INSERT INTO links (source_type, source_id, target_type, target_id, relationship, weight)
    VALUES ('session', ?, 'topic', ?, 'mentions', ?)
    `,
    [sessionId, topic, weight]
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("SqliteContextService", () => {
  let db: Database;
  let contextService: SqliteContextService;

  beforeEach(() => {
    const result = initializeDatabase({ path: ":memory:" });
    db = result.db;
    contextService = new SqliteContextService(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Unknown Project", () => {
    it("Test 1: returns null for unknown project", async () => {
      const context = await contextService.getProjectContext("nonexistent");
      expect(context).toBeNull();
    });

    it("Test 2: returns null when project exists but no sessions match date filter", async () => {
      // Insert session from 30 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      insertTestSession(db, "s1", "proj1", "/proj1", "MyProject", oldDate);

      // Query with 7-day filter
      const context = await contextService.getProjectContext("MyProject", { days: 7 });
      expect(context).toBeNull();
    });
  });

  describe("Session and Message Counts", () => {
    it("Test 3: returns correct session count", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      insertTestSession(db, "s2", "proj1", "/proj1", "TestProject");
      insertTestSession(db, "s3", "proj1", "/proj1", "TestProject");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.sessionCount).toBe(3);
    });

    it("Test 4: returns correct total message count", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      insertTestMessage(db, "m1", "s1", "user", "Hello");
      insertTestMessage(db, "m2", "s1", "assistant", "Hi");
      insertTestMessage(db, "m3", "s1", "user", "How are you?");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.totalMessages).toBe(3);
    });

    it("Test 5: returns correct user/assistant breakdown", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      insertTestMessage(db, "m1", "s1", "user", "Hello");
      insertTestMessage(db, "m2", "s1", "assistant", "Hi");
      insertTestMessage(db, "m3", "s1", "user", "Question");
      insertTestMessage(db, "m4", "s1", "assistant", "Answer");
      insertTestMessage(db, "m5", "s1", "user", "Thanks");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.userMessages).toBe(3);
      expect(context!.assistantMessages).toBe(2);
    });

    it("Test 6: returns zero messages for session with no messages", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "EmptyProject");

      const context = await contextService.getProjectContext("EmptyProject");

      expect(context).not.toBeNull();
      expect(context!.sessionCount).toBe(1);
      expect(context!.totalMessages).toBe(0);
      expect(context!.userMessages).toBe(0);
      expect(context!.assistantMessages).toBe(0);
    });
  });

  describe("Tool Usage", () => {
    it("Test 7: returns tool usage sorted by count descending", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      // Read: 5 times
      for (let i = 0; i < 5; i++) {
        insertTestToolUse(db, `t-read-${i}`, "s1", "Read");
      }
      // Write: 3 times
      for (let i = 0; i < 3; i++) {
        insertTestToolUse(db, `t-write-${i}`, "s1", "Write");
      }
      // Bash: 1 time
      insertTestToolUse(db, "t-bash-0", "s1", "Bash");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentToolUses).toHaveLength(3);
      expect(context!.recentToolUses[0]).toEqual({ name: "Read", count: 5 });
      expect(context!.recentToolUses[1]).toEqual({ name: "Write", count: 3 });
      expect(context!.recentToolUses[2]).toEqual({ name: "Bash", count: 1 });
    });

    it("Test 8: respects toolsLimit option", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      // Insert 5 different tools
      for (let i = 0; i < 5; i++) {
        insertTestToolUse(db, `t${i}`, "s1", `Tool${i}`);
      }

      const context = await contextService.getProjectContext("TestProject", {
        toolsLimit: 2,
      });

      expect(context).not.toBeNull();
      expect(context!.recentToolUses).toHaveLength(2);
    });

    it("Test 9: returns empty array when no tools used", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentToolUses).toEqual([]);
    });
  });

  describe("Topics from Links", () => {
    it("Test 10: returns topics from links table", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      insertTestLink(db, "s1", "authentication", 1.0);
      insertTestLink(db, "s1", "testing", 0.8);
      insertTestLink(db, "s1", "refactoring", 0.6);

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentTopics).toHaveLength(3);
      // Sorted by weight descending
      expect(context!.recentTopics).toContain("authentication");
      expect(context!.recentTopics).toContain("testing");
      expect(context!.recentTopics).toContain("refactoring");
    });

    it("Test 11: respects topicsLimit option", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      for (let i = 0; i < 5; i++) {
        insertTestLink(db, "s1", `topic${i}`, 1.0 - i * 0.1);
      }

      const context = await contextService.getProjectContext("TestProject", {
        topicsLimit: 3,
      });

      expect(context).not.toBeNull();
      expect(context!.recentTopics).toHaveLength(3);
    });

    it("Test 12: returns empty array when no topics exist", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentTopics).toEqual([]);
    });

    it("Test 13: handles empty topics gracefully (not null)", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(Array.isArray(context!.recentTopics)).toBe(true);
    });
  });

  describe("Date Filtering with --days", () => {
    it("Test 14: filters sessions by days option", async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);

      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject", now);
      insertTestSession(db, "s2", "proj1", "/proj1", "TestProject", yesterday);
      insertTestSession(db, "s3", "proj1", "/proj1", "TestProject", lastWeek);

      // Query with 3-day filter (should include today and yesterday)
      const context = await contextService.getProjectContext("TestProject", { days: 3 });

      expect(context).not.toBeNull();
      expect(context!.sessionCount).toBe(2);
    });

    it("Test 15: days filter affects tool usage counts", async () => {
      const now = new Date();
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);

      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject", now);
      insertTestSession(db, "s2", "proj1", "/proj1", "TestProject", lastWeek);

      // Recent tool use
      insertTestToolUse(db, "t1", "s1", "Read", now);
      // Old tool use
      insertTestToolUse(db, "t2", "s2", "Read", lastWeek);
      insertTestToolUse(db, "t3", "s2", "Write", lastWeek);

      const context = await contextService.getProjectContext("TestProject", { days: 3 });

      expect(context).not.toBeNull();
      // Only recent tool use should be counted
      expect(context!.recentToolUses).toHaveLength(1);
      expect(context!.recentToolUses[0]).toEqual({ name: "Read", count: 1 });
    });

    it("Test 16: days filter affects message counts", async () => {
      const now = new Date();
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);

      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject", now);
      insertTestSession(db, "s2", "proj1", "/proj1", "TestProject", lastWeek);

      // Recent messages (in recent session)
      insertTestMessage(db, "m1", "s1", "user", "Recent message");
      // Old messages (in old session)
      insertTestMessage(db, "m2", "s2", "user", "Old message");
      insertTestMessage(db, "m3", "s2", "assistant", "Old reply");

      const context = await contextService.getProjectContext("TestProject", { days: 3 });

      expect(context).not.toBeNull();
      // Only messages from recent session should be counted
      expect(context!.totalMessages).toBe(1);
      expect(context!.userMessages).toBe(1);
      expect(context!.assistantMessages).toBe(0);
    });
  });

  describe("Project Matching", () => {
    it("Test 17: finds project by substring match", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "memory-nexus");

      const context = await contextService.getProjectContext("nexus");

      expect(context).not.toBeNull();
      expect(context!.projectName).toBe("memory-nexus");
    });

    it("Test 18: prefers project with most sessions when multiple match substring", async () => {
      // mcp-nexus: 2 sessions
      insertTestSession(db, "s1", "proj1", "/proj1", "mcp-nexus");
      insertTestSession(db, "s2", "proj1", "/proj1", "mcp-nexus");
      // memory-nexus: 5 sessions (should win)
      for (let i = 0; i < 5; i++) {
        insertTestSession(db, `s-mn-${i}`, "proj2", "/proj2", "memory-nexus");
      }

      const context = await contextService.getProjectContext("nexus");

      expect(context).not.toBeNull();
      expect(context!.projectName).toBe("memory-nexus");
    });

    it("Test 18b: exact match takes priority over substring with more sessions", async () => {
      // "nexus" project: 1 session (exact match)
      insertTestSession(db, "s1", "proj1", "/proj1", "nexus");
      // "memory-nexus": 10 sessions (more sessions but only substring match)
      for (let i = 0; i < 10; i++) {
        insertTestSession(db, `s-mn-${i}`, "proj2", "/proj2", "memory-nexus");
      }

      const context = await contextService.getProjectContext("nexus");

      expect(context).not.toBeNull();
      expect(context!.projectName).toBe("nexus");
    });

    it("Test 18c: exact match is case-insensitive", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "MyProject");

      const context = await contextService.getProjectContext("myproject");

      expect(context).not.toBeNull();
      expect(context!.projectName).toBe("MyProject");
    });

    it("Test 19: returns project path in context", async () => {
      insertTestSession(
        db,
        "s1",
        "C--Projects-myproject",
        "C:\\Projects\\myproject",
        "myproject"
      );

      const context = await contextService.getProjectContext("myproject");

      expect(context).not.toBeNull();
      expect(context!.projectPathDecoded).toBe("C:\\Projects\\myproject");
    });
  });

  describe("Last Activity", () => {
    it("Test 20: returns most recent session timestamp as lastActivity", async () => {
      const older = new Date("2026-01-01T10:00:00Z");
      const newer = new Date("2026-01-28T15:30:00Z");

      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject", older);
      insertTestSession(db, "s2", "proj1", "/proj1", "TestProject", newer);

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.lastActivity).not.toBeNull();
      expect(context!.lastActivity!.toISOString()).toBe("2026-01-28T15:30:00.000Z");
    });
  });

  describe("Default Options", () => {
    it("Test 21: defaults topicsLimit to 10", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      for (let i = 0; i < 15; i++) {
        insertTestLink(db, "s1", `topic${i}`, 1.0);
      }

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentTopics).toHaveLength(10);
    });

    it("Test 22: defaults toolsLimit to 10", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "TestProject");
      for (let i = 0; i < 15; i++) {
        insertTestToolUse(db, `t${i}`, "s1", `Tool${i}`);
      }

      const context = await contextService.getProjectContext("TestProject");

      expect(context).not.toBeNull();
      expect(context!.recentToolUses).toHaveLength(10);
    });
  });
});
