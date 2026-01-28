/**
 * SQLite Extraction State Repository Tests
 *
 * Tests for SqliteExtractionStateRepository implementation.
 * Verifies state tracking, upsert semantics, and status filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteExtractionStateRepository } from "./extraction-state-repository.js";
import { ExtractionState } from "../../../domain/entities/extraction-state.js";
import { createSchema } from "../schema.js";

describe("SqliteExtractionStateRepository", () => {
  let db: Database;
  let repository: SqliteExtractionStateRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    createSchema(db);
    repository = new SqliteExtractionStateRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper to create a test extraction state
   */
  function createTestState(
    overrides: Partial<{
      id: string;
      sessionPath: string;
      startedAt: Date;
      status: "pending" | "in_progress" | "complete" | "error";
      completedAt: Date | undefined;
      messagesExtracted: number;
      errorMessage: string | undefined;
    }> = {}
  ): ExtractionState {
    return ExtractionState.create({
      id: overrides.id ?? "test-state-id",
      sessionPath:
        overrides.sessionPath ??
        "/home/user/.claude/projects/test-project/session.jsonl",
      startedAt: overrides.startedAt ?? new Date("2026-01-28T10:00:00Z"),
      status: overrides.status ?? "pending",
      completedAt: overrides.completedAt,
      messagesExtracted: overrides.messagesExtracted ?? 0,
      errorMessage: overrides.errorMessage,
    });
  }

  describe("save and findById round-trip", () => {
    it("should save and retrieve a state by ID", async () => {
      const state = createTestState({
        id: "state-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: new Date("2026-01-28T10:00:00Z"),
      });

      await repository.save(state);
      const found = await repository.findById("state-123");

      expect(found).not.toBeNull();
      expect(found!.id).toBe("state-123");
      expect(found!.sessionPath).toBe("/path/to/session.jsonl");
      expect(found!.startedAt.toISOString()).toBe("2026-01-28T10:00:00.000Z");
      expect(found!.status).toBe("pending");
    });

    it("should save and retrieve a completed state", async () => {
      const state = createTestState({
        id: "state-complete",
        status: "complete",
        completedAt: new Date("2026-01-28T11:30:00Z"),
        messagesExtracted: 42,
      });

      await repository.save(state);
      const found = await repository.findById("state-complete");

      expect(found).not.toBeNull();
      expect(found!.status).toBe("complete");
      expect(found!.completedAt).not.toBeUndefined();
      expect(found!.completedAt!.toISOString()).toBe("2026-01-28T11:30:00.000Z");
      expect(found!.messagesExtracted).toBe(42);
    });

    it("should save and retrieve an error state", async () => {
      const state = createTestState({
        id: "state-error",
        status: "error",
        errorMessage: "Failed to parse JSONL: invalid JSON at line 42",
      });

      await repository.save(state);
      const found = await repository.findById("state-error");

      expect(found).not.toBeNull();
      expect(found!.status).toBe("error");
      expect(found!.errorMessage).toBe(
        "Failed to parse JSONL: invalid JSON at line 42"
      );
    });

    it("should return null for non-existent state", async () => {
      const found = await repository.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findBySessionPath", () => {
    it("should find state by session path", async () => {
      const state = createTestState({
        id: "state-for-path",
        sessionPath: "/unique/path/to/session.jsonl",
      });

      await repository.save(state);
      const found = await repository.findBySessionPath(
        "/unique/path/to/session.jsonl"
      );

      expect(found).not.toBeNull();
      expect(found!.id).toBe("state-for-path");
    });

    it("should return null for non-existent session path", async () => {
      const found = await repository.findBySessionPath(
        "/non/existent/path.jsonl"
      );
      expect(found).toBeNull();
    });

    it("should distinguish between similar paths", async () => {
      const state1 = createTestState({
        id: "state-1",
        sessionPath: "/path/session1.jsonl",
      });
      const state2 = createTestState({
        id: "state-2",
        sessionPath: "/path/session2.jsonl",
      });

      await repository.save(state1);
      await repository.save(state2);

      const found1 = await repository.findBySessionPath(
        "/path/session1.jsonl"
      );
      const found2 = await repository.findBySessionPath(
        "/path/session2.jsonl"
      );

      expect(found1!.id).toBe("state-1");
      expect(found2!.id).toBe("state-2");
    });
  });

  describe("findPending", () => {
    it("should return pending states", async () => {
      const pendingState = createTestState({
        id: "pending-state",
        status: "pending",
      });

      await repository.save(pendingState);
      const pending = await repository.findPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("pending-state");
      expect(pending[0].status).toBe("pending");
    });

    it("should return in_progress states", async () => {
      const inProgressState = createTestState({
        id: "in-progress-state",
        status: "in_progress",
      });

      await repository.save(inProgressState);
      const pending = await repository.findPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe("in_progress");
    });

    it("should return both pending and in_progress states", async () => {
      const pendingState = createTestState({
        id: "pending",
        sessionPath: "/path/1.jsonl",
        status: "pending",
      });
      const inProgressState = createTestState({
        id: "in-progress",
        sessionPath: "/path/2.jsonl",
        status: "in_progress",
      });

      await repository.save(pendingState);
      await repository.save(inProgressState);
      const pending = await repository.findPending();

      expect(pending).toHaveLength(2);
      expect(pending.map((s) => s.status)).toContain("pending");
      expect(pending.map((s) => s.status)).toContain("in_progress");
    });

    it("should NOT return complete states", async () => {
      const completeState = createTestState({
        id: "complete-state",
        status: "complete",
        completedAt: new Date(),
      });

      await repository.save(completeState);
      const pending = await repository.findPending();

      expect(pending).toHaveLength(0);
    });

    it("should NOT return error states", async () => {
      const errorState = createTestState({
        id: "error-state",
        status: "error",
        errorMessage: "Some error",
      });

      await repository.save(errorState);
      const pending = await repository.findPending();

      expect(pending).toHaveLength(0);
    });

    it("should order by started_at ascending", async () => {
      const state1 = createTestState({
        id: "newer",
        sessionPath: "/path/1.jsonl",
        status: "pending",
        startedAt: new Date("2026-01-28T12:00:00Z"),
      });
      const state2 = createTestState({
        id: "older",
        sessionPath: "/path/2.jsonl",
        status: "pending",
        startedAt: new Date("2026-01-28T10:00:00Z"),
      });
      const state3 = createTestState({
        id: "middle",
        sessionPath: "/path/3.jsonl",
        status: "pending",
        startedAt: new Date("2026-01-28T11:00:00Z"),
      });

      await repository.save(state1);
      await repository.save(state2);
      await repository.save(state3);

      const pending = await repository.findPending();

      expect(pending).toHaveLength(3);
      expect(pending[0].id).toBe("older");
      expect(pending[1].id).toBe("middle");
      expect(pending[2].id).toBe("newer");
    });

    it("should return empty array when no pending states exist", async () => {
      const pending = await repository.findPending();
      expect(pending).toHaveLength(0);
    });
  });

  describe("state progression", () => {
    it("should support pending -> in_progress -> complete progression", async () => {
      // Start with pending
      let state = createTestState({
        id: "progressing-state",
        sessionPath: "/path/session.jsonl",
        status: "pending",
      });
      await repository.save(state);

      // Transition to in_progress
      state = state.startProcessing();
      await repository.save(state);

      let found = await repository.findById("progressing-state");
      expect(found!.status).toBe("in_progress");

      // Transition to complete
      state = state
        .incrementMessages(50)
        .complete(new Date("2026-01-28T11:00:00Z"));
      await repository.save(state);

      found = await repository.findById("progressing-state");
      expect(found!.status).toBe("complete");
      expect(found!.messagesExtracted).toBe(50);
      expect(found!.completedAt).not.toBeUndefined();
    });

    it("should support pending -> in_progress -> error progression", async () => {
      // Start with pending
      let state = createTestState({
        id: "failing-state",
        sessionPath: "/path/session.jsonl",
        status: "pending",
      });
      await repository.save(state);

      // Transition to in_progress
      state = state.startProcessing();
      await repository.save(state);

      // Transition to error
      state = state.fail("JSONL parse error at line 100");
      await repository.save(state);

      const found = await repository.findById("failing-state");
      expect(found!.status).toBe("error");
      expect(found!.errorMessage).toBe("JSONL parse error at line 100");
    });
  });

  describe("INSERT OR REPLACE upsert semantics", () => {
    it("should update existing state with same ID", async () => {
      const initialState = createTestState({
        id: "upsert-test",
        sessionPath: "/path/session.jsonl",
        status: "pending",
        messagesExtracted: 0,
      });

      await repository.save(initialState);

      // Update with new values
      const updatedState = ExtractionState.create({
        id: "upsert-test",
        sessionPath: "/path/session.jsonl",
        startedAt: new Date("2026-01-28T10:00:00Z"),
        status: "in_progress",
        messagesExtracted: 25,
      });

      await repository.save(updatedState);

      const found = await repository.findById("upsert-test");
      expect(found!.status).toBe("in_progress");
      expect(found!.messagesExtracted).toBe(25);
    });

    it("should replace all fields on upsert", async () => {
      const initialState = createTestState({
        id: "replace-test",
        sessionPath: "/path/original.jsonl",
        status: "pending",
      });

      await repository.save(initialState);

      // Update with completely different session path
      // (Note: this is an edge case - normally sessionPath shouldn't change)
      const updatedState = ExtractionState.create({
        id: "replace-test",
        sessionPath: "/path/new.jsonl",
        startedAt: new Date("2026-01-28T12:00:00Z"),
        status: "complete",
        completedAt: new Date("2026-01-28T12:30:00Z"),
        messagesExtracted: 100,
      });

      await repository.save(updatedState);

      const found = await repository.findById("replace-test");
      expect(found!.sessionPath).toBe("/path/new.jsonl");
      expect(found!.status).toBe("complete");
      expect(found!.messagesExtracted).toBe(100);
    });

    it("should handle updating from error to pending (retry)", async () => {
      // Initial failed state
      const errorState = createTestState({
        id: "retry-test",
        sessionPath: "/path/session.jsonl",
        status: "error",
        errorMessage: "Temporary failure",
      });

      await repository.save(errorState);

      // Create fresh pending state for retry
      const retryState = ExtractionState.create({
        id: "retry-test",
        sessionPath: "/path/session.jsonl",
        startedAt: new Date("2026-01-29T10:00:00Z"),
        status: "pending",
      });

      await repository.save(retryState);

      const found = await repository.findById("retry-test");
      expect(found!.status).toBe("pending");
      expect(found!.errorMessage).toBeUndefined();
    });
  });

  describe("session_path uniqueness", () => {
    it("should enforce unique session_path", async () => {
      const state1 = createTestState({
        id: "state-1",
        sessionPath: "/same/path.jsonl",
      });

      await repository.save(state1);

      // Try to save different ID with same session_path
      // Due to UNIQUE constraint on session_path, this should replace
      const state2 = createTestState({
        id: "state-2",
        sessionPath: "/same/path.jsonl",
      });

      await repository.save(state2);

      // The old state should be gone (replaced by new unique path)
      const found1 = await repository.findById("state-1");
      const found2 = await repository.findById("state-2");
      const foundByPath = await repository.findBySessionPath(
        "/same/path.jsonl"
      );

      // INSERT OR REPLACE on id means state-2 was inserted
      // But session_path unique constraint was violated
      // SQLite behavior: REPLACE on primary key, but session_path conflict
      // causes the old row to be replaced
      expect(found2).not.toBeNull();
      expect(foundByPath).not.toBeNull();
      expect(foundByPath!.id).toBe("state-2");
    });
  });
});
