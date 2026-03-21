/**
 * FrictionEntry Entity Tests
 *
 * Tests for the friction logging domain entity.
 * Validates creation, validation rules, immutability, and getters.
 */

import { describe, it, expect } from "bun:test";
import {
    FrictionEntry,
    type FrictionSeverity,
    type FrictionCategory,
    type FrictionStatus,
} from "./friction-entry.js";

describe("FrictionEntry Entity", () => {
    const validParams = {
        description: "Search fails on hyphens",
        severity: "high" as FrictionSeverity,
        category: "search" as FrictionCategory,
        status: "open" as FrictionStatus,
        tool: "memory",
        loggedAt: new Date("2026-03-08T10:00:00Z"),
    };

    describe("Creation", () => {
        it("creates with valid params", () => {
            const entry = FrictionEntry.create(validParams);
            expect(entry).toBeInstanceOf(FrictionEntry);
            expect(entry.description).toBe("Search fails on hyphens");
            expect(entry.severity).toBe("high");
            expect(entry.category).toBe("search");
            expect(entry.status).toBe("open");
            expect(entry.tool).toBe("memory");
        });

        it("creates with minimal params (only required fields)", () => {
            const entry = FrictionEntry.create({
                description: "Minimal entry",
                severity: "low",
                category: "cli",
                status: "open",
                tool: "aidev",
                loggedAt: new Date(),
            });
            expect(entry.description).toBe("Minimal entry");
            expect(entry.tool).toBe("aidev");
            expect(entry.context).toBeUndefined();
            expect(entry.sourceProject).toBeUndefined();
            expect(entry.resolvedAt).toBeUndefined();
            expect(entry.resolution).toBeUndefined();
            expect(entry.tags).toBeUndefined();
            expect(entry.lastReviewedAt).toBeUndefined();
        });

        it("creates with all optional fields", () => {
            const reviewDate = new Date("2026-03-10T12:00:00Z");
            const entry = FrictionEntry.create({
                id: 42,
                description: "Context returns stale data",
                severity: "medium",
                category: "context",
                status: "resolved",
                tool: "memory",
                tags: ["stale-cache", "performance"],
                lastReviewedAt: reviewDate,
                context: "Running memory context kanbanflow",
                sourceProject: "kanbanflow",
                loggedAt: new Date("2026-03-01T08:00:00Z"),
                resolvedAt: new Date("2026-03-05T14:00:00Z"),
                resolution: "Fixed stale cache invalidation",
            });
            expect(entry.id).toBe(42);
            expect(entry.tool).toBe("memory");
            expect(entry.tags).toEqual(["stale-cache", "performance"]);
            expect(entry.lastReviewedAt!.getTime()).toBe(reviewDate.getTime());
            expect(entry.context).toBe("Running memory context kanbanflow");
            expect(entry.sourceProject).toBe("kanbanflow");
            expect(entry.resolvedAt).toBeInstanceOf(Date);
            expect(entry.resolution).toBe("Fixed stale cache invalidation");
        });

        it("allows resolved status with resolvedAt", () => {
            const entry = FrictionEntry.create({
                description: "Resolved issue",
                severity: "low",
                category: "sync",
                status: "resolved",
                tool: "memory",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
                resolvedAt: new Date("2026-03-02T00:00:00Z"),
                resolution: "Fixed in v2.1",
            });
            expect(entry.status).toBe("resolved");
            expect(entry.resolvedAt).toBeInstanceOf(Date);
        });

        it("allows wont-fix status with resolvedAt", () => {
            const entry = FrictionEntry.create({
                description: "Won't fix issue",
                severity: "low",
                category: "ux",
                status: "wont-fix",
                tool: "memory",
                loggedAt: new Date("2026-03-01T00:00:00Z"),
                resolvedAt: new Date("2026-03-03T00:00:00Z"),
                resolution: "By design",
            });
            expect(entry.status).toBe("wont-fix");
            expect(entry.resolution).toBe("By design");
        });

        it("accepts any non-empty string as category", () => {
            const entry = FrictionEntry.create({
                ...validParams,
                category: "deployment",
            });
            expect(entry.category).toBe("deployment");
        });

        it("accepts custom categories like 'build' or 'testing'", () => {
            const entry1 = FrictionEntry.create({ ...validParams, category: "build" });
            expect(entry1.category).toBe("build");

            const entry2 = FrictionEntry.create({ ...validParams, category: "testing" });
            expect(entry2.category).toBe("testing");
        });
    });

    describe("Tool field", () => {
        it("requires tool as a non-empty string", () => {
            const entry = FrictionEntry.create(validParams);
            expect(entry.tool).toBe("memory");
        });

        it("rejects empty tool", () => {
            expect(() =>
                FrictionEntry.create({ ...validParams, tool: "" })
            ).toThrow("Tool cannot be empty");
        });

        it("rejects whitespace-only tool", () => {
            expect(() =>
                FrictionEntry.create({ ...validParams, tool: "   " })
            ).toThrow("Tool cannot be empty");
        });

        it("tool getter returns the value passed in params", () => {
            const entry = FrictionEntry.create({ ...validParams, tool: "aidev" });
            expect(entry.tool).toBe("aidev");
        });
    });

    describe("Tags field", () => {
        it("accepts optional tags array", () => {
            const entry = FrictionEntry.create({
                ...validParams,
                tags: ["bug", "search"],
            });
            expect(entry.tags).toEqual(["bug", "search"]);
        });

        it("tags getter returns undefined when not provided", () => {
            const entry = FrictionEntry.create(validParams);
            expect(entry.tags).toBeUndefined();
        });

        it("tags getter returns a copy (mutation does not affect entity)", () => {
            const entry = FrictionEntry.create({
                ...validParams,
                tags: ["original"],
            });
            const tags = entry.tags!;
            tags.push("mutated");
            expect(entry.tags).toEqual(["original"]);
        });
    });

    describe("LastReviewedAt field", () => {
        it("accepts optional lastReviewedAt date", () => {
            const reviewDate = new Date("2026-03-15T10:00:00Z");
            const entry = FrictionEntry.create({
                ...validParams,
                lastReviewedAt: reviewDate,
            });
            expect(entry.lastReviewedAt!.getTime()).toBe(reviewDate.getTime());
        });

        it("lastReviewedAt getter returns undefined when not provided", () => {
            const entry = FrictionEntry.create(validParams);
            expect(entry.lastReviewedAt).toBeUndefined();
        });

        it("lastReviewedAt getter returns defensive copy", () => {
            const reviewDate = new Date("2026-03-15T10:00:00Z");
            const entry = FrictionEntry.create({
                ...validParams,
                lastReviewedAt: reviewDate,
            });
            const date1 = entry.lastReviewedAt!;
            const date2 = entry.lastReviewedAt!;
            expect(date1).not.toBe(date2);
            expect(date1.getTime()).toBe(date2.getTime());

            date1.setFullYear(2000);
            expect(entry.lastReviewedAt!.getFullYear()).not.toBe(2000);
        });
    });

    describe("Validation", () => {
        it("rejects empty description", () => {
            expect(() =>
                FrictionEntry.create({ ...validParams, description: "" })
            ).toThrow("Description cannot be empty");
        });

        it("rejects whitespace-only description", () => {
            expect(() =>
                FrictionEntry.create({ ...validParams, description: "   " })
            ).toThrow("Description cannot be empty");
        });

        it("rejects invalid severity", () => {
            expect(() =>
                FrictionEntry.create({
                    ...validParams,
                    severity: "extreme" as FrictionSeverity,
                })
            ).toThrow('Invalid severity: "extreme"');
        });

        it("rejects empty category", () => {
            expect(() =>
                FrictionEntry.create({
                    ...validParams,
                    category: "",
                })
            ).toThrow("Category cannot be empty");
        });

        it("rejects whitespace-only category", () => {
            expect(() =>
                FrictionEntry.create({
                    ...validParams,
                    category: "   ",
                })
            ).toThrow("Category cannot be empty");
        });

        it("rejects invalid status", () => {
            expect(() =>
                FrictionEntry.create({
                    ...validParams,
                    status: "closed" as FrictionStatus,
                })
            ).toThrow('Invalid status: "closed"');
        });

        it("rejects open status with resolvedAt", () => {
            expect(() =>
                FrictionEntry.create({
                    ...validParams,
                    status: "open",
                    resolvedAt: new Date(),
                })
            ).toThrow("Open entries cannot have a resolvedAt date");
        });
    });

    describe("Getters", () => {
        it("returns correct values", () => {
            const loggedAt = new Date("2026-03-08T10:00:00Z");
            const entry = FrictionEntry.create({
                id: 7,
                description: "Test entry",
                severity: "critical",
                category: "integration",
                status: "open",
                tool: "memory",
                context: "Testing context",
                sourceProject: "memory-nexus",
                loggedAt,
            });

            expect(entry.id).toBe(7);
            expect(entry.description).toBe("Test entry");
            expect(entry.severity).toBe("critical");
            expect(entry.category).toBe("integration");
            expect(entry.status).toBe("open");
            expect(entry.tool).toBe("memory");
            expect(entry.context).toBe("Testing context");
            expect(entry.sourceProject).toBe("memory-nexus");
            expect(entry.loggedAt.getTime()).toBe(loggedAt.getTime());
        });

        it("id is undefined when not provided", () => {
            const entry = FrictionEntry.create(validParams);
            expect(entry.id).toBeUndefined();
        });

        it("id is set when provided", () => {
            const entry = FrictionEntry.create({ ...validParams, id: 99 });
            expect(entry.id).toBe(99);
        });

        it("Date getters return defensive copies (loggedAt)", () => {
            const entry = FrictionEntry.create(validParams);
            const date1 = entry.loggedAt;
            const date2 = entry.loggedAt;

            // Different references
            expect(date1).not.toBe(date2);

            // Same value
            expect(date1.getTime()).toBe(date2.getTime());

            // Mutating returned date does not affect entity
            date1.setFullYear(2000);
            expect(entry.loggedAt.getFullYear()).not.toBe(2000);
        });

        it("Date getters return defensive copies (resolvedAt)", () => {
            const entry = FrictionEntry.create({
                ...validParams,
                status: "resolved",
                resolvedAt: new Date("2026-03-09T00:00:00Z"),
                resolution: "Fixed",
            });
            const date1 = entry.resolvedAt!;
            const date2 = entry.resolvedAt!;

            // Different references
            expect(date1).not.toBe(date2);

            // Same value
            expect(date1.getTime()).toBe(date2.getTime());

            // Mutating returned date does not affect entity
            date1.setFullYear(2000);
            expect(entry.resolvedAt!.getFullYear()).not.toBe(2000);
        });
    });
});
