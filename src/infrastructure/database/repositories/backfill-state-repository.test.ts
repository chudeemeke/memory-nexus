/**
 * SqliteBackfillStateRepository Tests
 *
 * Integration tests against in-memory SQLite database.
 * Tests CRUD operations, upsert semantics, and status aggregation.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteBackfillStateRepository } from "./backfill-state-repository.js";
import { BackfillState } from "../../../domain/entities/backfill-state.js";

describe("SqliteBackfillStateRepository", () => {
    let db: Database;
    let repo: SqliteBackfillStateRepository;

    beforeEach(() => {
        db = new Database(":memory:");
        db.exec("PRAGMA foreign_keys = ON;");
        createSchema(db);
        repo = new SqliteBackfillStateRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    function createState(overrides?: Partial<{
        sessionId: string;
        backfilledAt: Date;
        dailyLogPath: string;
        success: boolean;
        errorMessage: string;
    }>): BackfillState {
        return BackfillState.create({
            sessionId: "session-001",
            backfilledAt: new Date("2026-03-08T10:00:00Z"),
            dailyLogPath: "daily-logs/2026-03-08.md",
            success: true,
            ...overrides,
        });
    }

    describe("save", () => {
        it("inserts a new backfill state record", async () => {
            const state = createState();
            await repo.save(state);

            const row = db
                .prepare("SELECT * FROM backfill_state WHERE session_id = ?")
                .get("session-001") as {
                    session_id: string;
                    backfilled_at: string;
                    daily_log_path: string;
                    success: number;
                    error_message: string | null;
                };

            expect(row).not.toBeNull();
            expect(row.session_id).toBe("session-001");
            expect(row.backfilled_at).toBe("2026-03-08T10:00:00.000Z");
            expect(row.daily_log_path).toBe("daily-logs/2026-03-08.md");
            expect(row.success).toBe(1);
            expect(row.error_message).toBeNull();
        });

        it("saves error state with success=0 and error_message", async () => {
            const state = createState({
                success: false,
                errorMessage: "Parse error on line 42",
            });
            await repo.save(state);

            const row = db
                .prepare("SELECT * FROM backfill_state WHERE session_id = ?")
                .get("session-001") as {
                    success: number;
                    error_message: string | null;
                };

            expect(row.success).toBe(0);
            expect(row.error_message).toBe("Parse error on line 42");
        });

        it("upserts on duplicate session_id", async () => {
            const state1 = createState({
                dailyLogPath: "daily-logs/2026-03-08-v1.md",
            });
            await repo.save(state1);

            const state2 = createState({
                dailyLogPath: "daily-logs/2026-03-08-v2.md",
                backfilledAt: new Date("2026-03-08T12:00:00Z"),
            });
            await repo.save(state2);

            // Should have only one row
            const count = db
                .prepare("SELECT COUNT(*) as cnt FROM backfill_state")
                .get() as { cnt: number };
            expect(count.cnt).toBe(1);

            // Should have the updated values
            const row = db
                .prepare("SELECT * FROM backfill_state WHERE session_id = ?")
                .get("session-001") as {
                    daily_log_path: string;
                    backfilled_at: string;
                };
            expect(row.daily_log_path).toBe("daily-logs/2026-03-08-v2.md");
            expect(row.backfilled_at).toBe("2026-03-08T12:00:00.000Z");
        });
    });

    describe("findBySessionId", () => {
        it("returns entity for existing session", async () => {
            await repo.save(createState({
                sessionId: "session-abc",
                dailyLogPath: "daily-logs/abc.md",
                backfilledAt: new Date("2026-03-01T08:00:00Z"),
            }));

            const found = await repo.findBySessionId("session-abc");

            expect(found).not.toBeNull();
            expect(found!.sessionId).toBe("session-abc");
            expect(found!.dailyLogPath).toBe("daily-logs/abc.md");
            expect(found!.success).toBe(true);
            expect(found!.backfilledAt).toBeInstanceOf(Date);
            expect(found!.errorMessage).toBeUndefined();
        });

        it("returns null for non-existent session", async () => {
            const found = await repo.findBySessionId("no-such-session");
            expect(found).toBeNull();
        });
    });

    describe("findAll", () => {
        it("returns all saved states", async () => {
            await repo.save(createState({ sessionId: "s1" }));
            await repo.save(createState({ sessionId: "s2" }));
            await repo.save(createState({ sessionId: "s3" }));

            const all = await repo.findAll();
            expect(all).toHaveLength(3);
        });

        it("returns empty array when no states saved", async () => {
            const all = await repo.findAll();
            expect(all).toHaveLength(0);
            expect(all).toEqual([]);
        });
    });

    describe("countByStatus", () => {
        it("returns correct counts for mixed states", async () => {
            // 3 successes
            await repo.save(createState({ sessionId: "s1", success: true }));
            await repo.save(createState({ sessionId: "s2", success: true }));
            await repo.save(createState({ sessionId: "s3", success: true }));
            // 2 failures
            await repo.save(createState({
                sessionId: "s4",
                success: false,
                errorMessage: "Error 1",
            }));
            await repo.save(createState({
                sessionId: "s5",
                success: false,
                errorMessage: "Error 2",
            }));

            const counts = await repo.countByStatus();
            expect(counts.total).toBe(5);
            expect(counts.succeeded).toBe(3);
            expect(counts.failed).toBe(2);
        });

        it("returns zeros when empty", async () => {
            const counts = await repo.countByStatus();
            expect(counts.total).toBe(0);
            expect(counts.succeeded).toBe(0);
            expect(counts.failed).toBe(0);
        });
    });
});
