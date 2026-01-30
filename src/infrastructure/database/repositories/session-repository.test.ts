/**
 * SQLite Session Repository Tests
 *
 * Tests for SqliteSessionRepository implementation.
 * Verifies save/find/delete operations and INSERT OR IGNORE idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteSessionRepository } from "./session-repository.js";
import { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";
import { createSchema } from "../schema.js";

describe("SqliteSessionRepository", () => {
  let db: Database;
  let repository: SqliteSessionRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repository = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper to create a test session
   */
  function createTestSession(overrides: Partial<{
    id: string;
    projectPath: ProjectPath;
    startTime: Date;
    endTime: Date | undefined;
  }> = {}): Session {
    return Session.create({
      id: overrides.id ?? "test-session-id",
      projectPath: overrides.projectPath ?? ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\test-project"),
      startTime: overrides.startTime ?? new Date("2026-01-28T10:00:00Z"),
      endTime: overrides.endTime,
    });
  }

  describe("save and findById round-trip", () => {
    it("should save and retrieve a session by ID", async () => {
      const session = createTestSession({
        id: "session-123",
        startTime: new Date("2026-01-28T10:00:00Z"),
      });

      await repository.save(session);
      const found = await repository.findById("session-123");

      expect(found).not.toBeNull();
      expect(found!.id).toBe("session-123");
      expect(found!.projectPath.encoded).toBe(session.projectPath.encoded);
      expect(found!.startTime.toISOString()).toBe("2026-01-28T10:00:00.000Z");
    });

    it("should save and retrieve a session with end time", async () => {
      const session = createTestSession({
        id: "session-with-end",
        startTime: new Date("2026-01-28T10:00:00Z"),
        endTime: new Date("2026-01-28T11:30:00Z"),
      });

      await repository.save(session);
      const found = await repository.findById("session-with-end");

      expect(found).not.toBeNull();
      expect(found!.endTime).not.toBeUndefined();
      expect(found!.endTime!.toISOString()).toBe("2026-01-28T11:30:00.000Z");
    });

    it("should return null for non-existent session", async () => {
      const found = await repository.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findByProject", () => {
    it("should find sessions by project path", async () => {
      const projectA = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\project-a");
      const projectB = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\project-b");

      const session1 = createTestSession({
        id: "session-1",
        projectPath: projectA,
        startTime: new Date("2026-01-28T10:00:00Z"),
      });
      const session2 = createTestSession({
        id: "session-2",
        projectPath: projectA,
        startTime: new Date("2026-01-28T11:00:00Z"),
      });
      const session3 = createTestSession({
        id: "session-3",
        projectPath: projectB,
        startTime: new Date("2026-01-28T12:00:00Z"),
      });

      await repository.save(session1);
      await repository.save(session2);
      await repository.save(session3);

      const projectASessions = await repository.findByProject(projectA);
      const projectBSessions = await repository.findByProject(projectB);

      expect(projectASessions).toHaveLength(2);
      expect(projectASessions.every(s => s.projectPath.equals(projectA))).toBe(true);
      expect(projectBSessions).toHaveLength(1);
      expect(projectBSessions[0].id).toBe("session-3");
    });

    it("should return sessions ordered by start time descending", async () => {
      const project = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\test");

      const session1 = createTestSession({
        id: "old-session",
        projectPath: project,
        startTime: new Date("2026-01-27T10:00:00Z"),
      });
      const session2 = createTestSession({
        id: "new-session",
        projectPath: project,
        startTime: new Date("2026-01-28T10:00:00Z"),
      });
      const session3 = createTestSession({
        id: "middle-session",
        projectPath: project,
        startTime: new Date("2026-01-27T18:00:00Z"),
      });

      await repository.save(session1);
      await repository.save(session2);
      await repository.save(session3);

      const sessions = await repository.findByProject(project);

      expect(sessions).toHaveLength(3);
      expect(sessions[0].id).toBe("new-session");
      expect(sessions[1].id).toBe("middle-session");
      expect(sessions[2].id).toBe("old-session");
    });

    it("should return empty array for project with no sessions", async () => {
      const project = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\empty");
      const sessions = await repository.findByProject(project);
      expect(sessions).toHaveLength(0);
    });
  });

  describe("findRecent", () => {
    it("should return most recent sessions ordered by start time", async () => {
      const sessions = [
        createTestSession({
          id: "session-1",
          startTime: new Date("2026-01-25T10:00:00Z"),
        }),
        createTestSession({
          id: "session-2",
          startTime: new Date("2026-01-28T10:00:00Z"),
        }),
        createTestSession({
          id: "session-3",
          startTime: new Date("2026-01-26T10:00:00Z"),
        }),
      ];

      for (const session of sessions) {
        await repository.save(session);
      }

      const recent = await repository.findRecent(10);

      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe("session-2"); // Most recent
      expect(recent[1].id).toBe("session-3");
      expect(recent[2].id).toBe("session-1"); // Oldest
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        const session = createTestSession({
          id: `session-${i}`,
          startTime: new Date(`2026-01-2${i}T10:00:00Z`),
        });
        await repository.save(session);
      }

      const limited = await repository.findRecent(3);

      expect(limited).toHaveLength(3);
    });

    it("should return empty array when no sessions exist", async () => {
      const recent = await repository.findRecent(10);
      expect(recent).toHaveLength(0);
    });
  });

  describe("saveMany", () => {
    it("should save multiple sessions in a single transaction", async () => {
      const sessions: Session[] = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(
          createTestSession({
            id: `bulk-session-${i}`,
            startTime: new Date(`2026-01-${String(i + 10).padStart(2, "0")}T10:00:00Z`),
          })
        );
      }

      await repository.saveMany(sessions);

      const recent = await repository.findRecent(20);
      expect(recent).toHaveLength(10);

      // Verify all sessions are persisted
      for (const session of sessions) {
        const found = await repository.findById(session.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(session.id);
      }
    });

    it("should handle empty array", async () => {
      await repository.saveMany([]);
      const recent = await repository.findRecent(10);
      expect(recent).toHaveLength(0);
    });

    it("should perform bulk insert with 100+ sessions", async () => {
      const sessions: Session[] = [];
      for (let i = 0; i < 150; i++) {
        sessions.push(
          createTestSession({
            id: `large-bulk-${i}`,
            startTime: new Date(Date.now() - i * 1000),
          })
        );
      }

      await repository.saveMany(sessions);

      const recent = await repository.findRecent(200);
      expect(recent).toHaveLength(150);
    });
  });

  describe("delete", () => {
    it("should delete a session by ID", async () => {
      const session = createTestSession({ id: "to-delete" });
      await repository.save(session);

      // Verify it exists
      const beforeDelete = await repository.findById("to-delete");
      expect(beforeDelete).not.toBeNull();

      // Delete it
      await repository.delete("to-delete");

      // Verify it's gone
      const afterDelete = await repository.findById("to-delete");
      expect(afterDelete).toBeNull();
    });

    it("should not throw when deleting non-existent session", async () => {
      // Should not throw
      await repository.delete("non-existent-id");
    });
  });

  describe("INSERT OR IGNORE idempotency", () => {
    it("should not error on duplicate ID insert", async () => {
      const session = createTestSession({
        id: "duplicate-id",
        startTime: new Date("2026-01-28T10:00:00Z"),
      });

      // First save
      await repository.save(session);

      // Second save with same ID - should not throw
      await repository.save(session);

      // Should still have only one
      const recent = await repository.findRecent(10);
      expect(recent).toHaveLength(1);
    });

    it("should not update existing session on duplicate insert", async () => {
      const project1 = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\original");
      const project2 = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\updated");

      const originalSession = createTestSession({
        id: "same-id",
        projectPath: project1,
        startTime: new Date("2026-01-28T10:00:00Z"),
      });

      const updatedSession = createTestSession({
        id: "same-id",
        projectPath: project2,
        startTime: new Date("2026-01-29T10:00:00Z"),
      });

      await repository.save(originalSession);
      await repository.save(updatedSession);

      const found = await repository.findById("same-id");
      expect(found).not.toBeNull();
      // Should retain original values (INSERT OR IGNORE doesn't update)
      expect(found!.projectPath.encoded).toBe(project1.encoded);
      expect(found!.startTime.toISOString()).toBe("2026-01-28T10:00:00.000Z");
    });

    it("should handle duplicates in saveMany", async () => {
      const session = createTestSession({ id: "duplicate-in-batch" });

      // Save once
      await repository.save(session);

      // Try to save again in a batch with new sessions
      const sessions = [
        session, // Duplicate
        createTestSession({ id: "new-session-1" }),
        createTestSession({ id: "new-session-2" }),
      ];

      // Should not throw
      await repository.saveMany(sessions);

      const recent = await repository.findRecent(10);
      expect(recent).toHaveLength(3);
    });
  });

  describe("ProjectPath round-trip", () => {
    it("should preserve Windows path encoding", async () => {
      const windowsPath = ProjectPath.fromDecoded("C:\\Users\\Destiny\\Projects\\memory-nexus");
      const session = createTestSession({
        id: "windows-path-session",
        projectPath: windowsPath,
      });

      await repository.save(session);
      const found = await repository.findById("windows-path-session");

      expect(found).not.toBeNull();
      expect(found!.projectPath.decoded).toBe("C:\\Users\\Destiny\\Projects\\memory-nexus");
      expect(found!.projectPath.projectName).toBe("memory-nexus");
    });

    it("should preserve Unix path encoding", async () => {
      const unixPath = ProjectPath.fromDecoded("/home/user/projects/test-project");
      const session = createTestSession({
        id: "unix-path-session",
        projectPath: unixPath,
      });

      await repository.save(session);
      const found = await repository.findById("unix-path-session");

      expect(found).not.toBeNull();
      expect(found!.projectPath.decoded).toBe("/home/user/projects/test-project");
      expect(found!.projectPath.projectName).toBe("test-project");
    });
  });

  describe("findFiltered", () => {
    it("should return recent sessions with no options", async () => {
      const sessions = [
        createTestSession({
          id: "session-1",
          startTime: new Date("2026-01-25T10:00:00Z"),
        }),
        createTestSession({
          id: "session-2",
          startTime: new Date("2026-01-28T10:00:00Z"),
        }),
      ];

      for (const session of sessions) {
        await repository.save(session);
      }

      const results = await repository.findFiltered({});

      expect(results).toHaveLength(2);
      // Should be ordered by start_time DESC
      expect(results[0].id).toBe("session-2");
      expect(results[1].id).toBe("session-1");
    });

    it("should respect limit option", async () => {
      for (let i = 0; i < 10; i++) {
        const session = createTestSession({
          id: `session-${i}`,
          startTime: new Date(Date.now() - i * 1000),
        });
        await repository.save(session);
      }

      const results = await repository.findFiltered({ limit: 5 });

      expect(results).toHaveLength(5);
    });

    it("should filter by project name (substring match)", async () => {
      const projectA = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\memory-nexus");
      const projectB = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\wow-system");
      const projectC = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\memory-tools");

      await repository.save(createTestSession({ id: "s1", projectPath: projectA }));
      await repository.save(createTestSession({ id: "s2", projectPath: projectB }));
      await repository.save(createTestSession({ id: "s3", projectPath: projectC }));

      const results = await repository.findFiltered({ projectFilter: "memory" });

      expect(results).toHaveLength(2);
      const ids = results.map(s => s.id).sort();
      expect(ids).toEqual(["s1", "s3"]);
    });

    it("should filter by sinceDate", async () => {
      const session1 = createTestSession({
        id: "old-session",
        startTime: new Date("2026-01-20T10:00:00Z"),
      });
      const session2 = createTestSession({
        id: "new-session",
        startTime: new Date("2026-01-28T10:00:00Z"),
      });

      await repository.save(session1);
      await repository.save(session2);

      const results = await repository.findFiltered({
        sinceDate: new Date("2026-01-25T00:00:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("new-session");
    });

    it("should filter by beforeDate", async () => {
      const session1 = createTestSession({
        id: "old-session",
        startTime: new Date("2026-01-20T10:00:00Z"),
      });
      const session2 = createTestSession({
        id: "new-session",
        startTime: new Date("2026-01-28T10:00:00Z"),
      });

      await repository.save(session1);
      await repository.save(session2);

      const results = await repository.findFiltered({
        beforeDate: new Date("2026-01-25T00:00:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("old-session");
    });

    it("should filter by date range (sinceDate and beforeDate)", async () => {
      const sessions = [
        createTestSession({ id: "s1", startTime: new Date("2026-01-15T10:00:00Z") }),
        createTestSession({ id: "s2", startTime: new Date("2026-01-20T10:00:00Z") }),
        createTestSession({ id: "s3", startTime: new Date("2026-01-25T10:00:00Z") }),
        createTestSession({ id: "s4", startTime: new Date("2026-01-30T10:00:00Z") }),
      ];

      for (const session of sessions) {
        await repository.save(session);
      }

      const results = await repository.findFiltered({
        sinceDate: new Date("2026-01-18T00:00:00Z"),
        beforeDate: new Date("2026-01-27T00:00:00Z"),
      });

      expect(results).toHaveLength(2);
      const ids = results.map(s => s.id).sort();
      expect(ids).toEqual(["s2", "s3"]);
    });

    it("should combine project filter with date filters", async () => {
      const projectA = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\memory-nexus");
      const projectB = ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\wow-system");

      await repository.save(createTestSession({
        id: "s1",
        projectPath: projectA,
        startTime: new Date("2026-01-20T10:00:00Z"),
      }));
      await repository.save(createTestSession({
        id: "s2",
        projectPath: projectB,
        startTime: new Date("2026-01-25T10:00:00Z"),
      }));
      await repository.save(createTestSession({
        id: "s3",
        projectPath: projectA,
        startTime: new Date("2026-01-28T10:00:00Z"),
      }));

      const results = await repository.findFiltered({
        projectFilter: "memory",
        sinceDate: new Date("2026-01-22T00:00:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("s3");
    });

    it("should return empty array when no matches", async () => {
      await repository.save(createTestSession({
        id: "session-1",
        startTime: new Date("2026-01-20T10:00:00Z"),
      }));

      const results = await repository.findFiltered({
        projectFilter: "nonexistent",
      });

      expect(results).toHaveLength(0);
    });

    it("should default to limit of 20", async () => {
      // Create 25 sessions
      for (let i = 0; i < 25; i++) {
        const session = createTestSession({
          id: `session-${i}`,
          startTime: new Date(Date.now() - i * 1000),
        });
        await repository.save(session);
      }

      const results = await repository.findFiltered({});

      expect(results).toHaveLength(20);
    });
  });
});
