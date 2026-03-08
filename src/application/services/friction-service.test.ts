/**
 * FrictionService Tests
 *
 * Tests the application service for friction logging operations.
 * Uses mock IFrictionRepository to isolate business logic.
 */

import { describe, expect, it, beforeEach, spyOn } from "bun:test";
import { FrictionService } from "./friction-service.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type {
    IFrictionRepository,
    FrictionStats,
} from "../../domain/ports/repositories.js";
import type {
    FrictionSeverity,
    FrictionCategory,
    FrictionStatus,
} from "../../domain/entities/friction-entry.js";
import { MemoryError } from "../../domain/errors/index.js";

/**
 * Create a mock IFrictionRepository.
 */
function createMockRepository(): IFrictionRepository & {
    _entries: Map<number, FrictionEntry>;
    _nextId: number;
} {
    const entries = new Map<number, FrictionEntry>();
    let nextId = 1;

    return {
        _entries: entries,
        _nextId: nextId,

        async save(entry: FrictionEntry): Promise<FrictionEntry> {
            const id = nextId++;
            const saved = FrictionEntry.create({
                ...{
                    id,
                    description: entry.description,
                    severity: entry.severity,
                    category: entry.category,
                    status: entry.status,
                    context: entry.context,
                    sourceProject: entry.sourceProject,
                    loggedAt: entry.loggedAt,
                    resolvedAt: entry.resolvedAt,
                    resolution: entry.resolution,
                },
            });
            entries.set(id, saved);
            return saved;
        },

        async findById(id: number): Promise<FrictionEntry | null> {
            return entries.get(id) ?? null;
        },

        async findOpen(): Promise<FrictionEntry[]> {
            return Array.from(entries.values()).filter(
                (e) => e.status === "open"
            );
        },

        async findAll(options?: {
            status?: FrictionStatus;
            category?: FrictionCategory;
            limit?: number;
        }): Promise<FrictionEntry[]> {
            let result = Array.from(entries.values());
            if (options?.status) {
                result = result.filter((e) => e.status === options.status);
            }
            if (options?.category) {
                result = result.filter((e) => e.category === options.category);
            }
            if (options?.limit) {
                result = result.slice(0, options.limit);
            }
            return result;
        },

        async resolve(id: number, resolution: string): Promise<void> {
            const entry = entries.get(id);
            if (!entry) {
                throw new Error(`Friction entry with id ${id} not found`);
            }
            const updated = FrictionEntry.create({
                id: entry.id,
                description: entry.description,
                severity: entry.severity,
                category: entry.category,
                status: "resolved",
                context: entry.context,
                sourceProject: entry.sourceProject,
                loggedAt: entry.loggedAt,
                resolvedAt: new Date(),
                resolution,
            });
            entries.set(id, updated);
        },

        async updateStatus(id: number, status: FrictionStatus): Promise<void> {
            const entry = entries.get(id);
            if (!entry) {
                throw new Error(`Friction entry with id ${id} not found`);
            }
            const updated = FrictionEntry.create({
                id: entry.id,
                description: entry.description,
                severity: entry.severity,
                category: entry.category,
                status,
                context: entry.context,
                sourceProject: entry.sourceProject,
                loggedAt: entry.loggedAt,
                resolvedAt: entry.resolvedAt,
                resolution: entry.resolution,
            });
            entries.set(id, updated);
        },

        async getStats(): Promise<FrictionStats> {
            return {
                total: entries.size,
                open: Array.from(entries.values()).filter((e) => e.status === "open").length,
                resolved: Array.from(entries.values()).filter((e) => e.status === "resolved").length,
                wontFix: Array.from(entries.values()).filter((e) => e.status === "wont-fix").length,
                bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
                byCategory: { search: 0, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
                meanTimeToResolve: null,
                oldestOpen: null,
            };
        },

        async getWeeklyTrends(weeks: number) {
            return Array.from({ length: weeks }, (_, i) => ({
                week: `2026-W${String(i + 1).padStart(2, "0")}`,
                newCount: 0,
                resolvedCount: 0,
            }));
        },
    };
}

describe("FrictionService", () => {
    let service: FrictionService;
    let repo: ReturnType<typeof createMockRepository>;

    beforeEach(() => {
        repo = createMockRepository();
        service = new FrictionService(repo);
    });

    describe("log()", () => {
        it("creates entry with correct defaults", async () => {
            const entry = await service.log({
                description: "Search returned no results",
            });

            expect(entry.description).toBe("Search returned no results");
            expect(entry.severity).toBe("medium");
            expect(entry.category).toBe("cli");
            expect(entry.status).toBe("open");
            expect(entry.id).toBeDefined();
            expect(entry.loggedAt).toBeInstanceOf(Date);
        });

        it("passes custom severity", async () => {
            const entry = await service.log({
                description: "Critical search failure",
                severity: "critical",
            });

            expect(entry.severity).toBe("critical");
        });

        it("passes custom category", async () => {
            const entry = await service.log({
                description: "Sync took too long",
                category: "sync",
            });

            expect(entry.category).toBe("sync");
        });

        it("passes context and sourceProject", async () => {
            const entry = await service.log({
                description: "Context too short",
                context: "During project onboarding",
                sourceProject: "my-project",
            });

            expect(entry.context).toBe("During project onboarding");
            expect(entry.sourceProject).toBe("my-project");
        });

        it("calls repository save()", async () => {
            const saveSpy = spyOn(repo, "save");
            await service.log({ description: "Test friction" });

            expect(saveSpy).toHaveBeenCalledTimes(1);
        });

        it("returns the saved entry with id", async () => {
            const entry = await service.log({ description: "Test friction" });

            expect(entry.id).toBe(1);
        });
    });

    describe("list()", () => {
        it("calls findOpen() by default", async () => {
            const findOpenSpy = spyOn(repo, "findOpen");
            await service.list();

            expect(findOpenSpy).toHaveBeenCalledTimes(1);
        });

        it("calls findAll() when all is true", async () => {
            const findAllSpy = spyOn(repo, "findAll");
            await service.list({ all: true });

            expect(findAllSpy).toHaveBeenCalledTimes(1);
        });

        it("passes status filter to findAll()", async () => {
            const findAllSpy = spyOn(repo, "findAll");
            await service.list({ all: true, status: "resolved" });

            expect(findAllSpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: "resolved" })
            );
        });

        it("passes category filter to findAll()", async () => {
            const findAllSpy = spyOn(repo, "findAll");
            await service.list({ all: true, category: "search" });

            expect(findAllSpy).toHaveBeenCalledWith(
                expect.objectContaining({ category: "search" })
            );
        });

        it("passes limit to findAll()", async () => {
            const findAllSpy = spyOn(repo, "findAll");
            await service.list({ all: true, limit: 10 });

            expect(findAllSpy).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 10 })
            );
        });

        it("returns array of entries", async () => {
            await service.log({ description: "Entry 1" });
            await service.log({ description: "Entry 2" });

            const entries = await service.list();
            expect(entries.length).toBe(2);
        });
    });

    describe("resolve()", () => {
        it("validates entry exists", async () => {
            const entry = await service.log({ description: "To resolve" });
            // Should not throw
            await service.resolve(entry.id!, "Fixed the issue");
        });

        it("throws NOT_FOUND for missing id", async () => {
            await expect(
                service.resolve(999, "Fixed")
            ).rejects.toThrow(MemoryError);

            try {
                await service.resolve(999, "Fixed");
            } catch (err) {
                expect((err as MemoryError).code).toBe("NOT_FOUND");
            }
        });

        it("throws if already resolved", async () => {
            const entry = await service.log({ description: "To resolve" });
            await service.resolve(entry.id!, "Fixed");

            await expect(
                service.resolve(entry.id!, "Fixed again")
            ).rejects.toThrow();
        });

        it("throws if already wont-fix", async () => {
            const entry = await service.log({ description: "To wont-fix" });
            await service.wontFix(entry.id!, "By design");

            await expect(
                service.resolve(entry.id!, "Actually fixed")
            ).rejects.toThrow();
        });

        it("calls repository resolve()", async () => {
            const entry = await service.log({ description: "To resolve" });
            const resolveSpy = spyOn(repo, "resolve");

            await service.resolve(entry.id!, "Fixed it");

            expect(resolveSpy).toHaveBeenCalledWith(entry.id!, "Fixed it");
        });
    });

    describe("wontFix()", () => {
        it("validates entry exists", async () => {
            const entry = await service.log({ description: "Won't fix this" });
            await service.wontFix(entry.id!, "By design");
        });

        it("throws NOT_FOUND for missing id", async () => {
            await expect(
                service.wontFix(999, "By design")
            ).rejects.toThrow(MemoryError);

            try {
                await service.wontFix(999, "By design");
            } catch (err) {
                expect((err as MemoryError).code).toBe("NOT_FOUND");
            }
        });

        it("throws if already resolved", async () => {
            const entry = await service.log({ description: "Resolved" });
            await service.resolve(entry.id!, "Fixed");

            await expect(
                service.wontFix(entry.id!, "Actually not fixing")
            ).rejects.toThrow();
        });

        it("calls resolve() then updateStatus()", async () => {
            const entry = await service.log({ description: "Won't fix" });
            const resolveSpy = spyOn(repo, "resolve");
            const updateStatusSpy = spyOn(repo, "updateStatus");

            await service.wontFix(entry.id!, "By design");

            // Per plan: resolve() first sets resolved/resolution/resolved_at
            // then updateStatus() overwrites status to wont-fix
            expect(resolveSpy).toHaveBeenCalledWith(entry.id!, "By design");
            expect(updateStatusSpy).toHaveBeenCalledWith(entry.id!, "wont-fix");
        });
    });

    describe("getStats()", () => {
        it("delegates to repository.getStats()", async () => {
            const getStatsSpy = spyOn(repo, "getStats");
            const stats = await service.getStats();

            expect(getStatsSpy).toHaveBeenCalledTimes(1);
            expect(stats).toBeDefined();
            expect(typeof stats.total).toBe("number");
        });
    });

    describe("getWeeklyTrends()", () => {
        it("delegates to repository.getWeeklyTrends()", async () => {
            const getTrendsSpy = spyOn(repo, "getWeeklyTrends");
            const trends = await service.getWeeklyTrends(4);

            expect(getTrendsSpy).toHaveBeenCalledWith(4);
            expect(trends.length).toBe(4);
        });

        it("defaults to 4 weeks", async () => {
            const getTrendsSpy = spyOn(repo, "getWeeklyTrends");
            await service.getWeeklyTrends();

            expect(getTrendsSpy).toHaveBeenCalledWith(4);
        });
    });
});
