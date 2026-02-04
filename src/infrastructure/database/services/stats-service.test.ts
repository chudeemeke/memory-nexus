/**
 * SQLite Stats Service Tests
 *
 * Tests for SqliteStatsService covering:
 * - Empty database handling
 * - Total counts (sessions, messages, tool uses)
 * - Database size
 * - Per-project breakdown
 * - Project limit parameter
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeDatabase, closeDatabase } from "../connection.js";
import { SqliteStatsService } from "./stats-service.js";

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
  toolName: string
): void {
  db.run(
    `
    INSERT INTO tool_uses (id, session_id, name, input, timestamp, status)
    VALUES (?, ?, ?, '{}', datetime('now'), 'success')
    `,
    [id, sessionId, toolName]
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("SqliteStatsService", () => {
  let db: Database;
  let statsService: SqliteStatsService;

  beforeEach(() => {
    const result = initializeDatabase({ path: ":memory:" });
    db = result.db;
    statsService = new SqliteStatsService(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Empty Database", () => {
    it("Test 1: returns zero totals for empty database", async () => {
      const stats = await statsService.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalToolUses).toBe(0);
    });

    it("Test 2: returns empty project breakdown for empty database", async () => {
      const stats = await statsService.getStats();

      expect(stats.projectBreakdown).toEqual([]);
    });

    it("Test 3: returns positive database size for empty database", async () => {
      // Even empty SQLite databases have some size from schema
      const stats = await statsService.getStats();

      expect(stats.databaseSizeBytes).toBeGreaterThan(0);
    });
  });

  describe("Total Counts", () => {
    it("Test 4: counts sessions correctly", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      insertTestSession(db, "s2", "proj1", "/proj1", "Project1");
      insertTestSession(db, "s3", "proj2", "/proj2", "Project2");

      const stats = await statsService.getStats();

      expect(stats.totalSessions).toBe(3);
    });

    it("Test 5: counts messages correctly", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      insertTestMessage(db, "m1", "s1", "user", "Hello");
      insertTestMessage(db, "m2", "s1", "assistant", "Hi");
      insertTestMessage(db, "m3", "s1", "user", "How are you?");

      const stats = await statsService.getStats();

      expect(stats.totalMessages).toBe(3);
    });

    it("Test 6: counts tool uses correctly", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      insertTestToolUse(db, "t1", "s1", "Read");
      insertTestToolUse(db, "t2", "s1", "Write");

      const stats = await statsService.getStats();

      expect(stats.totalToolUses).toBe(2);
    });

    it("Test 7: counts all entity types together", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      insertTestSession(db, "s2", "proj2", "/proj2", "Project2");
      insertTestMessage(db, "m1", "s1", "user", "Hello");
      insertTestMessage(db, "m2", "s1", "assistant", "Hi");
      insertTestMessage(db, "m3", "s2", "user", "Hello there");
      insertTestToolUse(db, "t1", "s1", "Read");

      const stats = await statsService.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalToolUses).toBe(1);
    });
  });

  describe("Database Size", () => {
    it("Test 8: database size increases with data", async () => {
      const emptyStats = await statsService.getStats();
      const emptySize = emptyStats.databaseSizeBytes;

      // Add data
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      for (let i = 0; i < 100; i++) {
        insertTestMessage(db, `m${i}`, "s1", "user", `Message content ${i} with some text`);
      }

      const filledStats = await statsService.getStats();

      expect(filledStats.databaseSizeBytes).toBeGreaterThan(emptySize);
    });
  });

  describe("Per-Project Breakdown", () => {
    it("Test 9: groups stats by project name", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "ProjectAlpha");
      insertTestSession(db, "s2", "proj1", "/proj1", "ProjectAlpha");
      insertTestSession(db, "s3", "proj2", "/proj2", "ProjectBeta");

      const stats = await statsService.getStats();

      expect(stats.projectBreakdown.length).toBe(2);

      const alpha = stats.projectBreakdown.find((p) => p.projectName === "ProjectAlpha");
      const beta = stats.projectBreakdown.find((p) => p.projectName === "ProjectBeta");

      expect(alpha?.sessionCount).toBe(2);
      expect(beta?.sessionCount).toBe(1);
    });

    it("Test 10: counts messages per project correctly", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "ProjectAlpha");
      insertTestSession(db, "s2", "proj2", "/proj2", "ProjectBeta");
      insertTestMessage(db, "m1", "s1", "user", "Msg 1");
      insertTestMessage(db, "m2", "s1", "assistant", "Msg 2");
      insertTestMessage(db, "m3", "s1", "user", "Msg 3");
      insertTestMessage(db, "m4", "s2", "user", "Msg 4");

      const stats = await statsService.getStats();

      const alpha = stats.projectBreakdown.find((p) => p.projectName === "ProjectAlpha");
      const beta = stats.projectBreakdown.find((p) => p.projectName === "ProjectBeta");

      expect(alpha?.messageCount).toBe(3);
      expect(beta?.messageCount).toBe(1);
    });

    it("Test 11: orders projects by session count descending", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "SmallProject");
      insertTestSession(db, "s2", "proj2", "/proj2", "BigProject");
      insertTestSession(db, "s3", "proj2", "/proj2", "BigProject");
      insertTestSession(db, "s4", "proj2", "/proj2", "BigProject");

      const stats = await statsService.getStats();

      expect(stats.projectBreakdown[0].projectName).toBe("BigProject");
      expect(stats.projectBreakdown[0].sessionCount).toBe(3);
      expect(stats.projectBreakdown[1].projectName).toBe("SmallProject");
      expect(stats.projectBreakdown[1].sessionCount).toBe(1);
    });

    it("Test 12: handles projects with no messages", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "EmptyProject");

      const stats = await statsService.getStats();

      expect(stats.projectBreakdown.length).toBe(1);
      expect(stats.projectBreakdown[0].projectName).toBe("EmptyProject");
      expect(stats.projectBreakdown[0].sessionCount).toBe(1);
      expect(stats.projectBreakdown[0].messageCount).toBe(0);
    });
  });

  describe("Project Limit", () => {
    it("Test 13: respects projectLimit parameter", async () => {
      // Create 5 projects
      for (let i = 0; i < 5; i++) {
        insertTestSession(db, `s${i}`, `proj${i}`, `/proj${i}`, `Project${i}`);
      }

      const stats = await statsService.getStats(3);

      expect(stats.projectBreakdown.length).toBe(3);
    });

    it("Test 14: default limit is 10", async () => {
      // Create 15 projects
      for (let i = 0; i < 15; i++) {
        insertTestSession(db, `s${i}`, `proj${i}`, `/proj${i}`, `Project${i}`);
      }

      const stats = await statsService.getStats();

      expect(stats.projectBreakdown.length).toBe(10);
    });

    it("Test 15: returns all projects when fewer than limit", async () => {
      insertTestSession(db, "s1", "proj1", "/proj1", "Project1");
      insertTestSession(db, "s2", "proj2", "/proj2", "Project2");

      const stats = await statsService.getStats(10);

      expect(stats.projectBreakdown.length).toBe(2);
    });

    it("Test 17: totals match sum of displayed projects when limit applied", async () => {
      // Create 5 projects with different session/message counts
      // Project0: 3 sessions, 6 messages (most active)
      // Project1: 2 sessions, 4 messages
      // Project2: 2 sessions, 3 messages
      // Project3: 1 session, 2 messages
      // Project4: 1 session, 1 message
      for (let i = 0; i < 3; i++) {
        insertTestSession(db, `s0-${i}`, "proj0", "/proj0", "Project0");
      }
      for (let i = 0; i < 2; i++) {
        insertTestSession(db, `s1-${i}`, "proj1", "/proj1", "Project1");
      }
      for (let i = 0; i < 2; i++) {
        insertTestSession(db, `s2-${i}`, "proj2", "/proj2", "Project2");
      }
      insertTestSession(db, "s3-0", "proj3", "/proj3", "Project3");
      insertTestSession(db, "s4-0", "proj4", "/proj4", "Project4");

      // Add messages to sessions
      for (let i = 0; i < 6; i++) {
        insertTestMessage(db, `m0-${i}`, `s0-${i % 3}`, "user", `Message ${i}`);
      }
      for (let i = 0; i < 4; i++) {
        insertTestMessage(db, `m1-${i}`, `s1-${i % 2}`, "user", `Message ${i}`);
      }
      for (let i = 0; i < 3; i++) {
        insertTestMessage(db, `m2-${i}`, `s2-${i % 2}`, "user", `Message ${i}`);
      }
      insertTestMessage(db, "m3-0", "s3-0", "user", "Message");
      insertTestMessage(db, "m3-1", "s3-0", "user", "Message");
      insertTestMessage(db, "m4-0", "s4-0", "user", "Message");

      // Get stats with limit of 3 projects
      const stats = await statsService.getStats(3);

      // Should show top 3 projects: Project0 (3), Project1 (2), Project2 (2)
      expect(stats.projectBreakdown.length).toBe(3);

      // Totals should be sum of displayed projects only
      const expectedSessions = 3 + 2 + 2; // 7, not 9 (total in DB)
      const expectedMessages = 6 + 4 + 3; // 13, not 16 (total in DB)

      expect(stats.totalSessions).toBe(expectedSessions);
      expect(stats.totalMessages).toBe(expectedMessages);

      // Verify breakdown matches
      const sessionSum = stats.projectBreakdown.reduce((s, p) => s + p.sessionCount, 0);
      const messageSum = stats.projectBreakdown.reduce((s, p) => s + p.messageCount, 0);

      expect(stats.totalSessions).toBe(sessionSum);
      expect(stats.totalMessages).toBe(messageSum);
    });

    it("Test 18: database size remains total even when limit applied", async () => {
      // Create 5 projects
      for (let i = 0; i < 5; i++) {
        insertTestSession(db, `s${i}`, `proj${i}`, `/proj${i}`, `Project${i}`);
      }

      // Get stats with all projects
      const fullStats = await statsService.getStats(10);
      const fullSize = fullStats.databaseSizeBytes;

      // Get stats with limit of 2 projects
      const limitedStats = await statsService.getStats(2);

      // Database size should be the same (total, not filtered)
      expect(limitedStats.databaseSizeBytes).toBe(fullSize);
    });
  });

  describe("Large Dataset", () => {
    it("Test 16: handles large number of records efficiently", async () => {
      // Insert many sessions and messages
      for (let i = 0; i < 10; i++) {
        insertTestSession(db, `s${i}`, `proj${i % 3}`, `/proj${i % 3}`, `Project${i % 3}`);
      }
      for (let i = 0; i < 100; i++) {
        insertTestMessage(db, `m${i}`, `s${i % 10}`, i % 2 === 0 ? "user" : "assistant", `Message ${i}`);
      }
      for (let i = 0; i < 50; i++) {
        insertTestToolUse(db, `t${i}`, `s${i % 10}`, "Read");
      }

      const startTime = performance.now();
      const stats = await statsService.getStats();
      const duration = performance.now() - startTime;

      expect(stats.totalSessions).toBe(10);
      expect(stats.totalMessages).toBe(100);
      expect(stats.totalToolUses).toBe(50);
      expect(stats.projectBreakdown.length).toBe(3);

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});
