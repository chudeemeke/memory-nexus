/**
 * SqliteFrictionRepository Tests
 *
 * Integration tests against in-memory SQLite database.
 * Tests CRUD operations, filtering, stats aggregation, and weekly trends.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../schema.js";
import { SqliteFrictionRepository } from "./friction-repository.js";
import { FrictionEntry } from "../../../domain/entities/friction-entry.js";

describe("SqliteFrictionRepository", () => {
    let db: Database;
    let repo: SqliteFrictionRepository;

    beforeEach(() => {
        db = new Database(":memory:");
        db.exec("PRAGMA foreign_keys = ON;");
        createSchema(db);
        repo = new SqliteFrictionRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    function createEntry(overrides?: Partial<{
        description: string;
        severity: "low" | "medium" | "high" | "critical";
        category: "search" | "sync" | "cli" | "context" | "integration" | "ux";
        status: "open" | "resolved" | "wont-fix";
        context: string;
        sourceProject: string;
        loggedAt: Date;
        resolvedAt: Date;
        resolution: string;
    }>): FrictionEntry {
        return FrictionEntry.create({
            description: "Default friction",
            severity: "medium",
            category: "cli",
            status: "open",
            loggedAt: new Date("2026-03-08T10:00:00Z"),
            ...overrides,
        });
    }

    describe("save", () => {
        it("creates entry and returns with id", async () => {
            const entry = createEntry({ description: "Search fails on hyphens" });
            const saved = await repo.save(entry);

            expect(saved.id).toBe(1);
            expect(saved.description).toBe("Search fails on hyphens");
            expect(saved.severity).toBe("medium");
            expect(saved.category).toBe("cli");
            expect(saved.status).toBe("open");
        });

        it("auto-increments ids", async () => {
            const saved1 = await repo.save(createEntry({ description: "First" }));
            const saved2 = await repo.save(createEntry({ description: "Second" }));

            expect(saved1.id).toBe(1);
            expect(saved2.id).toBe(2);
        });

        it("saves all optional fields", async () => {
            const entry = createEntry({
                description: "Context stale data",
                severity: "high",
                category: "context",
                status: "resolved",
                context: "Running memory context kanbanflow",
                sourceProject: "kanbanflow",
                loggedAt: new Date("2026-03-01T08:00:00Z"),
                resolvedAt: new Date("2026-03-05T14:00:00Z"),
                resolution: "Fixed cache invalidation",
            });
            const saved = await repo.save(entry);

            expect(saved.context).toBe("Running memory context kanbanflow");
            expect(saved.sourceProject).toBe("kanbanflow");
            expect(saved.resolvedAt).toBeInstanceOf(Date);
            expect(saved.resolution).toBe("Fixed cache invalidation");
        });
    });

    describe("findById", () => {
        it("returns saved entry", async () => {
            await repo.save(createEntry({ description: "Test entry" }));
            const found = await repo.findById(1);

            expect(found).not.toBeNull();
            expect(found!.id).toBe(1);
            expect(found!.description).toBe("Test entry");
        });

        it("returns null for missing id", async () => {
            const found = await repo.findById(999);
            expect(found).toBeNull();
        });
    });

    describe("findOpen", () => {
        it("returns only open entries", async () => {
            await repo.save(createEntry({ description: "Open 1", status: "open" }));
            await repo.save(createEntry({
                description: "Resolved",
                status: "resolved",
                resolvedAt: new Date(),
                resolution: "Fixed",
            }));
            await repo.save(createEntry({ description: "Open 2", status: "open" }));

            const open = await repo.findOpen();
            expect(open).toHaveLength(2);
            expect(open.every((e) => e.status === "open")).toBe(true);
        });

        it("returns entries ordered by logged_at descending", async () => {
            await repo.save(createEntry({
                description: "Older",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
            }));
            await repo.save(createEntry({
                description: "Newer",
                loggedAt: new Date("2026-03-08T00:00:00Z"),
            }));

            const open = await repo.findOpen();
            expect(open[0].description).toBe("Newer");
            expect(open[1].description).toBe("Older");
        });
    });

    describe("findAll", () => {
        beforeEach(async () => {
            await repo.save(createEntry({ description: "Search issue", category: "search", status: "open" }));
            await repo.save(createEntry({
                description: "CLI issue",
                category: "cli",
                status: "resolved",
                resolvedAt: new Date(),
                resolution: "Fixed",
            }));
            await repo.save(createEntry({ description: "Sync issue", category: "sync", status: "open" }));
        });

        it("returns all entries", async () => {
            const all = await repo.findAll();
            expect(all).toHaveLength(3);
        });

        it("filters by status", async () => {
            const open = await repo.findAll({ status: "open" });
            expect(open).toHaveLength(2);
            expect(open.every((e) => e.status === "open")).toBe(true);
        });

        it("filters by category", async () => {
            const search = await repo.findAll({ category: "search" });
            expect(search).toHaveLength(1);
            expect(search[0].category).toBe("search");
        });

        it("respects limit", async () => {
            const limited = await repo.findAll({ limit: 2 });
            expect(limited).toHaveLength(2);
        });

        it("combines status and category filters", async () => {
            const openSearch = await repo.findAll({ status: "open", category: "search" });
            expect(openSearch).toHaveLength(1);
            expect(openSearch[0].description).toBe("Search issue");
        });
    });

    describe("resolve", () => {
        it("updates status and sets resolution + resolvedAt", async () => {
            await repo.save(createEntry({ description: "To resolve" }));
            await repo.resolve(1, "Fixed in v2.1");

            const found = await repo.findById(1);
            expect(found!.status).toBe("resolved");
            expect(found!.resolution).toBe("Fixed in v2.1");
            expect(found!.resolvedAt).toBeInstanceOf(Date);
        });

        it("throws for missing id", async () => {
            await expect(repo.resolve(999, "Fix")).rejects.toThrow(
                "Friction entry with id 999 not found"
            );
        });
    });

    describe("updateStatus", () => {
        it("changes status", async () => {
            await repo.save(createEntry({ description: "To update" }));
            await repo.updateStatus(1, "wont-fix");

            const found = await repo.findById(1);
            expect(found!.status).toBe("wont-fix");
        });

        it("throws for missing id", async () => {
            await expect(repo.updateStatus(999, "resolved")).rejects.toThrow(
                "Friction entry with id 999 not found"
            );
        });
    });

    describe("getStats", () => {
        it("returns correct aggregations", async () => {
            await repo.save(createEntry({ severity: "high", category: "search", status: "open" }));
            await repo.save(createEntry({
                severity: "low",
                category: "cli",
                status: "resolved",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
                resolvedAt: new Date("2026-03-04T00:00:00Z"),
                resolution: "Fixed",
            }));
            await repo.save(createEntry({
                severity: "medium",
                category: "search",
                status: "wont-fix",
                resolvedAt: new Date(),
                resolution: "By design",
            }));

            const stats = await repo.getStats();
            expect(stats.total).toBe(3);
            expect(stats.open).toBe(1);
            expect(stats.resolved).toBe(1);
            expect(stats.wontFix).toBe(1);
            expect(stats.bySeverity.high).toBe(1);
            expect(stats.bySeverity.low).toBe(1);
            expect(stats.bySeverity.medium).toBe(1);
            expect(stats.byCategory.search).toBe(2);
            expect(stats.byCategory.cli).toBe(1);
        });

        it("handles empty table", async () => {
            const stats = await repo.getStats();
            expect(stats.total).toBe(0);
            expect(stats.open).toBe(0);
            expect(stats.resolved).toBe(0);
            expect(stats.wontFix).toBe(0);
            expect(stats.meanTimeToResolve).toBeNull();
            expect(stats.oldestOpen).toBeNull();
        });

        it("computes meanTimeToResolve with julianday", async () => {
            // Entry 1: resolved in 3 days
            await repo.save(createEntry({
                description: "Fast fix",
                status: "resolved",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
                resolvedAt: new Date("2026-03-04T00:00:00Z"),
                resolution: "Fixed",
            }));
            // Entry 2: resolved in 7 days
            await repo.save(createEntry({
                description: "Slow fix",
                status: "resolved",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
                resolvedAt: new Date("2026-03-08T00:00:00Z"),
                resolution: "Fixed",
            }));

            const stats = await repo.getStats();
            // Mean of 3 and 7 = 5
            expect(stats.meanTimeToResolve).toBeCloseTo(5, 1);
        });

        it("identifies oldest open entry", async () => {
            await repo.save(createEntry({
                description: "Newest open",
                loggedAt: new Date("2026-03-08T00:00:00Z"),
            }));
            await repo.save(createEntry({
                description: "Oldest open",
                loggedAt: new Date("2026-02-01T00:00:00Z"),
            }));

            const stats = await repo.getStats();
            expect(stats.oldestOpen).not.toBeNull();
            expect(stats.oldestOpen!.description).toBe("Oldest open");
            expect(stats.oldestOpen!.daysOpen).toBeGreaterThan(0);
        });
    });

    describe("getWeeklyTrends", () => {
        it("returns weekly counts", async () => {
            // Create entries in different weeks
            await repo.save(createEntry({
                description: "Week 9 entry",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
            }));
            await repo.save(createEntry({
                description: "Week 10 entry",
                loggedAt: new Date("2026-03-08T00:00:00Z"),
            }));

            const trends = await repo.getWeeklyTrends(4);
            expect(trends.length).toBeGreaterThan(0);
            // Each entry should have week string, newCount, resolvedCount
            for (const t of trends) {
                expect(t.week).toBeDefined();
                expect(typeof t.newCount).toBe("number");
                expect(typeof t.resolvedCount).toBe("number");
            }
        });

        it("includes zero-filled weeks with no activity", async () => {
            await repo.save(createEntry({
                description: "Single entry",
                loggedAt: new Date("2026-03-08T00:00:00Z"),
            }));

            const trends = await repo.getWeeklyTrends(4);
            expect(trends).toHaveLength(4);
            // At least one week should have newCount > 0
            const hasActivity = trends.some((t) => t.newCount > 0);
            expect(hasActivity).toBe(true);
        });
    });
});
