/**
 * SqliteFrictionRepository Tests
 *
 * Tests for universal tool tracking: tool/sourceProject filtering,
 * markReviewed, findPatterns, byTool stats, tags serialization.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SqliteFrictionRepository } from "../../../../src/infrastructure/database/repositories/friction-repository.js";
import { FrictionEntry } from "../../../../src/domain/entities/friction-entry.js";
import {
    createTestDatabase,
    type TestDatabase,
} from "../../../helpers/test-database.js";

function makeEntry(overrides: Partial<{
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    category: string;
    status: "open" | "resolved" | "wont-fix";
    tool: string;
    tags: string[];
    lastReviewedAt: Date;
    context: string;
    sourceProject: string;
}> = {}): FrictionEntry {
    return FrictionEntry.create({
        description: overrides.description ?? "test friction",
        severity: overrides.severity ?? "medium",
        category: overrides.category ?? "cli",
        status: overrides.status ?? "open",
        tool: overrides.tool ?? "memory",
        tags: overrides.tags,
        lastReviewedAt: overrides.lastReviewedAt,
        context: overrides.context,
        sourceProject: overrides.sourceProject,
        loggedAt: new Date(),
    });
}

describe("SqliteFrictionRepository", () => {
    let testDb: TestDatabase;
    let repo: SqliteFrictionRepository;

    beforeEach(() => {
        testDb = createTestDatabase();
        repo = new SqliteFrictionRepository(testDb.db);
    });

    afterEach(() => {
        testDb.cleanup();
    });

    describe("save() with new columns", () => {
        test("persists tool, tags, and lastReviewedAt", async () => {
            const reviewDate = new Date("2026-03-20T10:00:00Z");
            const entry = FrictionEntry.create({
                description: "timeout on windows",
                severity: "high",
                category: "cli",
                status: "open",
                tool: "aidev",
                tags: ["timeout", "windows"],
                lastReviewedAt: reviewDate,
                loggedAt: new Date(),
            });

            const saved = await repo.save(entry);
            const found = await repo.findById(saved.id!);

            expect(found).not.toBeNull();
            expect(found!.tool).toBe("aidev");
            expect(found!.tags).toEqual(["timeout", "windows"]);
            expect(found!.lastReviewedAt).toEqual(reviewDate);
        });
    });

    describe("findAll with tool filter", () => {
        test("returns only entries matching tool", async () => {
            await repo.save(makeEntry({ tool: "aidev", description: "a1" }));
            await repo.save(makeEntry({ tool: "aidev", description: "a2" }));
            await repo.save(makeEntry({ tool: "memory", description: "m1" }));

            const results = await repo.findAll({ tool: "aidev" });

            expect(results).toHaveLength(2);
            expect(results.every(r => r.tool === "aidev")).toBe(true);
        });
    });

    describe("findAll with sourceProject filter", () => {
        test("returns only entries matching sourceProject", async () => {
            await repo.save(makeEntry({ sourceProject: "gsd", description: "g1" }));
            await repo.save(makeEntry({ sourceProject: "gsd", description: "g2" }));
            await repo.save(makeEntry({ sourceProject: "nexus", description: "n1" }));

            const results = await repo.findAll({ sourceProject: "gsd" });

            expect(results).toHaveLength(2);
            expect(results.every(r => r.sourceProject === "gsd")).toBe(true);
        });
    });

    describe("findAll with combined filters", () => {
        test("tool + status filters together", async () => {
            await repo.save(makeEntry({ tool: "aidev", status: "open", description: "ao1" }));
            await repo.save(makeEntry({ tool: "aidev", status: "open", description: "ao2" }));
            // Create an aidev entry and resolve it
            const toResolve = await repo.save(makeEntry({ tool: "aidev", description: "ar1" }));
            await repo.resolve(toResolve.id!, "fixed");
            await repo.save(makeEntry({ tool: "memory", status: "open", description: "mo1" }));

            const results = await repo.findAll({ tool: "aidev", status: "open" });

            expect(results).toHaveLength(2);
            expect(results.every(r => r.tool === "aidev")).toBe(true);
        });
    });

    describe("markReviewed", () => {
        test("updates last_reviewed_at for open entries of specific tool", async () => {
            const a1 = await repo.save(makeEntry({ tool: "aidev", description: "a1" }));
            const a2 = await repo.save(makeEntry({ tool: "aidev", description: "a2" }));
            const m1 = await repo.save(makeEntry({ tool: "memory", description: "m1" }));

            const now = new Date("2026-03-21T12:00:00Z");
            await repo.markReviewed("aidev", now);

            const foundA1 = await repo.findById(a1.id!);
            const foundA2 = await repo.findById(a2.id!);
            const foundM1 = await repo.findById(m1.id!);

            expect(foundA1!.lastReviewedAt).toEqual(now);
            expect(foundA2!.lastReviewedAt).toEqual(now);
            expect(foundM1!.lastReviewedAt).toBeUndefined();
        });
    });

    describe("findPatterns", () => {
        test("returns groups meeting threshold", async () => {
            // 3 aidev+cli entries
            await repo.save(makeEntry({ tool: "aidev", category: "cli", description: "ac1" }));
            await repo.save(makeEntry({ tool: "aidev", category: "cli", description: "ac2" }));
            await repo.save(makeEntry({ tool: "aidev", category: "cli", description: "ac3" }));
            // 2 aidev+ux entries
            await repo.save(makeEntry({ tool: "aidev", category: "ux", description: "au1" }));
            await repo.save(makeEntry({ tool: "aidev", category: "ux", description: "au2" }));
            // 1 memory+sync entry
            await repo.save(makeEntry({ tool: "memory", category: "sync", description: "ms1" }));

            const patterns3 = await repo.findPatterns(3);
            expect(patterns3).toHaveLength(1);
            expect(patterns3[0].tool).toBe("aidev");
            expect(patterns3[0].category).toBe("cli");
            expect(patterns3[0].count).toBe(3);
            expect(patterns3[0].entries).toHaveLength(3);

            const patterns2 = await repo.findPatterns(2);
            expect(patterns2).toHaveLength(2);
        });
    });

    describe("getStats with byTool", () => {
        test("includes byTool breakdown", async () => {
            await repo.save(makeEntry({ tool: "aidev", description: "a1" }));
            await repo.save(makeEntry({ tool: "aidev", description: "a2" }));
            await repo.save(makeEntry({ tool: "memory", description: "m1" }));
            await repo.save(makeEntry({ tool: "gsd", description: "g1" }));

            const stats = await repo.getStats();

            expect(stats.byTool).toEqual({
                aidev: 2,
                memory: 1,
                gsd: 1,
            });
        });

        test("byCategory uses dynamic keys", async () => {
            await repo.save(makeEntry({ category: "cli", description: "c1" }));
            await repo.save(makeEntry({ category: "custom-cat", description: "cc1" }));

            const stats = await repo.getStats();

            expect(stats.byCategory["cli"]).toBe(1);
            expect(stats.byCategory["custom-cat"]).toBe(1);
            // Should NOT have hardcoded keys with 0 values
            expect(stats.byCategory["search"]).toBeUndefined();
        });
    });

    describe("tags serialization", () => {
        test("tags stored as JSON and deserialized back", async () => {
            const saved = await repo.save(makeEntry({ tags: ["windows", "timeout", "flaky"] }));
            const found = await repo.findById(saved.id!);

            expect(found!.tags).toEqual(["windows", "timeout", "flaky"]);
        });
    });

    describe("backward compatibility", () => {
        test("entries with no tags and no lastReviewedAt work", async () => {
            const saved = await repo.save(makeEntry());
            const found = await repo.findById(saved.id!);

            expect(found).not.toBeNull();
            expect(found!.tags).toBeUndefined();
            expect(found!.lastReviewedAt).toBeUndefined();
            expect(found!.tool).toBe("memory");
        });
    });
});
