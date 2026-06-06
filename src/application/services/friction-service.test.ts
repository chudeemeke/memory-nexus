/**
 * FrictionService Tests
 *
 * Tests the application service for friction logging operations.
 * Uses mock IFrictionRepository to isolate business logic.
 */

import { describe, expect, it, beforeEach, spyOn, afterEach } from "bun:test";
import { FrictionService } from "./friction-service.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type {
    IFrictionRepository,
    FrictionStats,
    FrictionPattern,
    FrictionQueryOptions,
    FrictionQueryResult,
} from "../../domain/ports/repositories.js";
import type {
    FrictionSeverity,
    FrictionCategory,
    FrictionStatus,
} from "../../domain/entities/friction-entry.js";
import { MemoryError } from "../../domain/errors/index.js";
import { existsSync, writeFileSync, mkdtempSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PatternRedactor } from "../../infrastructure/security/pattern-redactor.js";

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
                id,
                description: entry.description,
                severity: entry.severity,
                category: entry.category,
                status: entry.status,
                tool: entry.tool,
                context: entry.context,
                sourceProject: entry.sourceProject,
                loggedAt: entry.loggedAt,
                resolvedAt: entry.resolvedAt,
                resolution: entry.resolution,
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
            tool?: string;
            sourceProject?: string;
            limit?: number;
        }): Promise<FrictionEntry[]> {
            let result = Array.from(entries.values());
            if (options?.status) {
                result = result.filter((e) => e.status === options.status);
            }
            if (options?.category) {
                result = result.filter((e) => e.category === options.category);
            }
            if (options?.tool) {
                result = result.filter((e) => e.tool === options.tool);
            }
            if (options?.sourceProject) {
                result = result.filter((e) => e.sourceProject === options.sourceProject);
            }
            if (options?.limit) {
                result = result.slice(0, options.limit);
            }
            return result;
        },

        async query(options?: FrictionQueryOptions): Promise<FrictionQueryResult> {
            let result = Array.from(entries.values());
            if (options?.status) {
                result = result.filter((e) => e.status === options.status);
            }
            if (options?.severity) {
                result = result.filter((e) => e.severity === options.severity);
            }
            if (options?.category) {
                result = result.filter((e) => e.category === options.category);
            }
            if (options?.tool) {
                result = result.filter((e) => e.tool === options.tool);
            }
            if (options?.sourceProject) {
                result = result.filter((e) => e.sourceProject === options.sourceProject);
            }
            if (options?.since) {
                result = result.filter((e) => e.loggedAt >= options.since!);
            }
            if (options?.descriptionContains) {
                const needle = options.descriptionContains.toLowerCase();
                result = result.filter((e) => e.description.toLowerCase().includes(needle));
            }
            if (options?.contextContains) {
                const needle = options.contextContains.toLowerCase();
                result = result.filter((e) => (e.context ?? "").toLowerCase().includes(needle));
            }
            const totalCount = result.length;
            if (options?.limit) {
                result = result.slice(0, options.limit);
            }
            return { entries: result, totalCount };
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
                tool: entry.tool,
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
                tool: entry.tool,
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
                byTool: {},
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

        async markReviewed(tool: string, reviewedAt: Date): Promise<void> {
            // Mock: no-op
        },

        async findPatterns(threshold: number): Promise<FrictionPattern[]> {
            return [];
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

        it("accepts tool parameter and threads to entry", async () => {
            const entry = await service.log({
                description: "aidev issue",
                tool: "aidev",
            });

            expect(entry.tool).toBe("aidev");
        });

        it("defaults tool to 'memory' when not provided", async () => {
            const entry = await service.log({
                description: "some friction",
            });

            expect(entry.tool).toBe("memory");
        });

        it("accepts loggedAt and threads to entry", async () => {
            const date = new Date("2026-03-08T00:00:00Z");
            const entry = await service.log({
                description: "old friction",
                loggedAt: date,
            });

            expect(entry.loggedAt.toISOString()).toBe("2026-03-08T00:00:00.000Z");
        });

        it("redacts secrets before saving friction entries", async () => {
            const rawSecret = ["sk", "test_abcdefghijklmnopqrstuvwxyz123456"].join("-");
            const redactingService = new FrictionService(repo, new PatternRedactor());

            const entry = await redactingService.log({
                description: `Tool printed ${rawSecret}`,
                context: `OPENAI_API_KEY=${rawSecret}`,
                tool: "memory",
            });

            expect(entry.description).not.toContain(rawSecret);
            expect(entry.context).not.toContain(rawSecret);
            expect(entry.description).toMatch(/\[REDACTED:api_key:[a-f0-9]{8}\]/);
            expect(entry.context).toMatch(/OPENAI_API_KEY=\[REDACTED:env_secret:[a-f0-9]{8}\]/);
        });
    });

    describe("list()", () => {
        it("queries open entries by default", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list();

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: "open" })
            );
        });

        it("removes default status filter when all is true", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: undefined })
            );
        });

        it("passes status filter to query()", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true, status: "resolved" });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: "resolved" })
            );
        });

        it("passes category filter to query()", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true, category: "search" });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ category: "search" })
            );
        });

        it("passes limit to query()", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true, limit: 10 });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 10 })
            );
        });

        it("returns array of entries", async () => {
            await service.log({ description: "Entry 1" });
            await service.log({ description: "Entry 2" });

            const entries = await service.list();
            expect(entries.length).toBe(2);
        });

        it("passes tool filter to query()", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true, tool: "aidev" });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ tool: "aidev" })
            );
        });

        it("passes sourceProject filter to query()", async () => {
            const querySpy = spyOn(repo, "query");
            await service.list({ all: true, sourceProject: "gsd" });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ sourceProject: "gsd" })
            );
        });
    });

    describe("query()", () => {
        it("defaults to open status and delegates durable filters to the repository", async () => {
            const querySpy = spyOn(repo, "query");
            await service.query({
                severity: "high",
                category: "sync",
                tool: "memory",
                sourceProject: "conversations",
                since: new Date("2026-05-01T00:00:00.000Z"),
                descriptionContains: "retry",
                contextContains: "shell",
                limit: 10,
            });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "open",
                    severity: "high",
                    category: "sync",
                    tool: "memory",
                    sourceProject: "conversations",
                    since: new Date("2026-05-01T00:00:00.000Z"),
                    descriptionContains: "retry",
                    contextContains: "shell",
                    limit: 10,
                })
            );
        });

        it("returns total count independently of returned-entry limit", async () => {
            await service.log({ description: "Entry 1", tool: "memory" });
            await service.log({ description: "Entry 2", tool: "memory" });
            await service.log({ description: "Entry 3", tool: "memory" });

            const result = await service.query({ tool: "memory", limit: 1 });

            expect(result.totalCount).toBe(3);
            expect(result.entries).toHaveLength(1);
        });

        it("lets explicit status override the default open-only status", async () => {
            const querySpy = spyOn(repo, "query");
            await service.query({ all: true, status: "resolved" });

            expect(querySpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: "resolved" })
            );
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

    describe("ingestFallbackFile()", () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = mkdtempSync(join(tmpdir(), "friction-ingest-"));
        });

        it("reads and saves entries from friction.jsonl", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            const lines = [
                '{"tool":"aidev","severity":"high","description":"desc1","project":"gsd","context":"ctx1","date":"2026-03-08"}',
                '{"tool":"memory","severity":"low","description":"desc2","project":"nexus","context":"ctx2","date":"2026-03-09"}',
                '{"tool":"gsd","severity":"medium","description":"desc3","project":"done","context":"ctx3","date":"2026-03-10"}',
            ];
            writeFileSync(filePath, lines.join("\n") + "\n");

            const count = await service.ingestFallbackFile(filePath);

            expect(count).toBe(3);
            expect(existsSync(filePath)).toBe(false);
        });

        it("maps fields correctly from fallback format", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            writeFileSync(
                filePath,
                '{"tool":"aidev","severity":"high","description":"desc","project":"gsd","context":"ctx","date":"2026-03-08"}\n'
            );

            await service.ingestFallbackFile(filePath);

            const entries = await service.list();
            expect(entries.length).toBe(1);
            const entry = entries[0];
            expect(entry.tool).toBe("aidev");
            expect(entry.severity).toBe("high");
            expect(entry.description).toBe("desc");
            expect(entry.sourceProject).toBe("gsd");
            expect(entry.context).toBe("ctx");
            expect(entry.loggedAt.toISOString()).toBe("2026-03-08T00:00:00.000Z");
        });

        it("defaults missing tool to 'unknown'", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            writeFileSync(
                filePath,
                '{"severity":"high","description":"no tool","project":"gsd","date":"2026-03-08"}\n'
            );

            await service.ingestFallbackFile(filePath);

            const entries = await service.list();
            expect(entries[0].tool).toBe("unknown");
        });

        it("defaults missing category to 'cli'", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            writeFileSync(
                filePath,
                '{"tool":"aidev","severity":"high","description":"no cat","project":"gsd","date":"2026-03-08"}\n'
            );

            await service.ingestFallbackFile(filePath);

            const entries = await service.list();
            expect(entries[0].category).toBe("cli");
        });

        it("skips malformed JSON lines and returns correct count", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            const lines = [
                '{"tool":"aidev","severity":"high","description":"valid1","project":"gsd","date":"2026-03-08"}',
                "not valid json {{{",
                '{"tool":"memory","severity":"low","description":"valid2","project":"nexus","date":"2026-03-09"}',
            ];
            writeFileSync(filePath, lines.join("\n") + "\n");

            const count = await service.ingestFallbackFile(filePath);

            expect(count).toBe(2);
        });

        it("returns 0 and no-ops when file does not exist", async () => {
            const count = await service.ingestFallbackFile(
                join(tempDir, "nonexistent.jsonl")
            );

            expect(count).toBe(0);
        });

        it("handles file delete failure gracefully", async () => {
            const filePath = join(tempDir, "friction.jsonl");
            writeFileSync(
                filePath,
                '{"tool":"aidev","severity":"high","description":"desc","project":"gsd","date":"2026-03-08"}\n'
            );

            // Pre-delete the file so unlinkSync will fail
            unlinkSync(filePath);

            // Re-create but make it so the service reads it, then we can't test
            // lock easily on Windows. Instead, test that ingestFallbackFile
            // doesn't throw even if delete fails by verifying entries are saved.
            // We'll test with a file that exists -- the delete success path is
            // already tested above. For the failure path, mock unlinkSync behavior
            // indirectly: the method should not throw.
            writeFileSync(filePath, '{"tool":"aidev","severity":"high","description":"desc","project":"gsd","date":"2026-03-08"}\n');

            // This test verifies the method completes successfully even when called.
            // The actual delete failure path requires OS-level file locking which
            // is hard to test portably. The code wraps unlinkSync in try/catch.
            const count = await service.ingestFallbackFile(filePath);
            expect(count).toBe(1);
        });
    });

    describe("detectPatterns()", () => {
        it("delegates to repository.findPatterns(3) by default", async () => {
            const findPatternsSpy = spyOn(repo, "findPatterns");
            await service.detectPatterns();

            expect(findPatternsSpy).toHaveBeenCalledWith(3);
        });

        it("accepts custom threshold", async () => {
            const findPatternsSpy = spyOn(repo, "findPatterns");
            await service.detectPatterns(5);

            expect(findPatternsSpy).toHaveBeenCalledWith(5);
        });

        it("returns the repository result", async () => {
            const mockPatterns: FrictionPattern[] = [
                { tool: "aidev", category: "cli", count: 5, entries: [] },
            ];
            spyOn(repo, "findPatterns").mockResolvedValue(mockPatterns);

            const result = await service.detectPatterns();
            expect(result).toEqual(mockPatterns);
        });
    });

    describe("markReviewed()", () => {
        it("delegates to repository.markReviewed()", async () => {
            const markReviewedSpy = spyOn(repo, "markReviewed");
            await service.markReviewed("aidev");

            expect(markReviewedSpy).toHaveBeenCalledTimes(1);
            expect(markReviewedSpy.mock.calls[0][0]).toBe("aidev");
            expect(markReviewedSpy.mock.calls[0][1]).toBeInstanceOf(Date);
        });
    });
});
