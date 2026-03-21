/**
 * Smart Context Service Tests
 *
 * Tests for the application-layer service that composes memory files,
 * friction entries, and session data into structured briefings.
 * All dependencies injected via constructor; tests use mock implementations.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
    SmartContextService,
    type SmartContextOptions,
    type SmartContextResult,
    type ContextSection,
    type IProjectResolver,
    type SmartContextDeps,
} from "./smart-context-service.js";
import { MemoryFile, type MemoryFileType } from "../../domain/entities/memory-file.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type {
    IMemoryFileRepository,
    IFrictionRepository,
    FrictionStats,
} from "../../domain/ports/repositories.js";

// -- Helpers --

function makeMemoryFile(overrides: {
    filePath: string;
    fileType: MemoryFileType;
    content: string;
    projectEncoded?: string;
    lastIndexedAt?: Date;
}): MemoryFile {
    return MemoryFile.create({
        id: Math.floor(Math.random() * 10000),
        filePath: overrides.filePath,
        fileType: overrides.fileType,
        content: overrides.content,
        contentHash: "a".repeat(64),
        projectEncoded: overrides.projectEncoded,
        lastIndexedAt: overrides.lastIndexedAt ?? new Date(),
    });
}

function makeFrictionEntry(overrides: {
    id?: number;
    description: string;
    severity?: "low" | "medium" | "high" | "critical";
    category?: string;
    tool?: string;
    context?: string;
    sourceProject?: string;
}): FrictionEntry {
    return FrictionEntry.create({
        id: overrides.id ?? Math.floor(Math.random() * 10000),
        description: overrides.description,
        severity: overrides.severity ?? "medium",
        category: overrides.category ?? "cli",
        tool: overrides.tool ?? "memory",
        status: "open",
        context: overrides.context,
        sourceProject: overrides.sourceProject,
        loggedAt: new Date(),
    });
}

// -- Mock implementations --

function createMockProjectResolver(
    mapping: Record<string, { encoded: string; name: string }>
): IProjectResolver {
    return {
        resolveProjectEncoded(projectFilter: string): string | null {
            return mapping[projectFilter]?.encoded ?? null;
        },
        resolveProjectName(projectFilter: string): string | null {
            return mapping[projectFilter]?.name ?? null;
        },
    };
}

function createMockMemoryFileRepo(files: MemoryFile[]): IMemoryFileRepository {
    return {
        async findByPath(filePath: string): Promise<MemoryFile | null> {
            return files.find((f) => f.filePath === filePath) ?? null;
        },
        async findByType(fileType: MemoryFileType): Promise<MemoryFile[]> {
            return files.filter((f) => f.fileType === fileType);
        },
        async findByProject(projectEncoded: string): Promise<MemoryFile[]> {
            return files.filter((f) => f.projectEncoded === projectEncoded);
        },
        async save(): Promise<void> {},
        async saveMany(): Promise<void> {},
        async searchContent(): Promise<MemoryFile[]> {
            return [];
        },
        async findCrossProjectLearnings(
            excludeProject?: string,
        ): Promise<MemoryFile[]> {
            return files.filter(
                (f) =>
                    f.fileType === "learnings" &&
                    f.content.includes("Applies to: cross-project") &&
                    f.projectEncoded !== excludeProject
            );
        },
    };
}

function createMockFrictionRepo(entries: FrictionEntry[]): IFrictionRepository {
    return {
        async save(entry: FrictionEntry): Promise<FrictionEntry> {
            return entry;
        },
        async findById(id: number): Promise<FrictionEntry | null> {
            return entries.find((e) => e.id === id) ?? null;
        },
        async findOpen(): Promise<FrictionEntry[]> {
            return entries.filter((e) => e.status === "open");
        },
        async findAll(): Promise<FrictionEntry[]> {
            return entries;
        },
        async resolve(): Promise<void> {},
        async updateStatus(): Promise<void> {},
        async getStats(): Promise<FrictionStats> {
            return {
                total: entries.length,
                open: entries.filter((e) => e.status === "open").length,
                resolved: 0,
                wontFix: 0,
                bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
                byCategory: { search: 0, sync: 0, cli: 0, context: 0, integration: 0, ux: 0 },
                byTool: {},
                meanTimeToResolve: null,
                oldestOpen: null,
            };
        },
        async getWeeklyTrends(): Promise<Array<{ week: string; newCount: number; resolvedCount: number }>> {
            return [];
        },
        async markReviewed(): Promise<void> {},
        async findPatterns(): Promise<Array<{ tool: string; category: string; count: number; entries: FrictionEntry[] }>> {
            return [];
        },
    };
}

// -- Test Data --

const PROJECT_ENCODED = "c-users-test-project";
const PROJECT_NAME = "test-project";
const PROJECT_MAPPING = {
    "test-project": { encoded: PROJECT_ENCODED, name: PROJECT_NAME },
};

describe("SmartContextService", () => {
    let service: SmartContextService;
    let mockResolver: IProjectResolver;
    let mockMemoryRepo: IMemoryFileRepository;
    let mockFrictionRepo: IFrictionRepository;

    beforeEach(() => {
        mockResolver = createMockProjectResolver(PROJECT_MAPPING);
        mockMemoryRepo = createMockMemoryFileRepo([]);
        mockFrictionRepo = createMockFrictionRepo([]);

        service = new SmartContextService({
            projectResolver: mockResolver,
            memoryFileRepo: mockMemoryRepo,
            frictionRepo: mockFrictionRepo,
        });
    });

    describe("project resolution", () => {
        test("resolves project name to encoded path via IProjectResolver", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "# Decisions\n\nUse SQLite for storage",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result).not.toBeNull();
            expect(result!.projectName).toBe(PROJECT_NAME);
            expect(result!.projectEncoded).toBe(PROJECT_ENCODED);
        });

        test("returns null when project not found", async () => {
            const result = await service.getContext({ projectFilter: "nonexistent" });

            expect(result).toBeNull();
        });
    });

    describe("data source assembly (priority order)", () => {
        test("section 1: Active Decisions from project DECISIONS.md (priority 1)", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "# Decisions\n\nUse hexagonal architecture",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const decisions = result!.sections.find((s) => s.key === "decisions");
            expect(decisions).toBeDefined();
            expect(decisions!.priority).toBe(1);
            expect(decisions!.content).toContain("hexagonal architecture");
        });

        test("section 2: Recent Learnings from project LEARNINGS.md (priority 2)", async () => {
            const learningsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/LEARNINGS.md`,
                fileType: "learnings",
                content: "# Learnings\n\nBun resolves type-only imports",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([learningsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const learnings = result!.sections.find((s) => s.key === "learnings");
            expect(learnings).toBeDefined();
            expect(learnings!.priority).toBe(2);
            expect(learnings!.content).toContain("type-only imports");
        });

        test("section 3: Recent Activity from daily log files (priority 3)", async () => {
            const dailyLog = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-03-09.md`,
                fileType: "daily_log",
                content: "# 2026-03-09\n\nWorked on smart context service",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([dailyLog]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const activity = result!.sections.find((s) => s.key === "daily_logs");
            expect(activity).toBeDefined();
            expect(activity!.priority).toBe(3);
            expect(activity!.content).toContain("smart context service");
        });

        test("section 4: Cross-Project Decisions only when crossProject true (priority 4)", async () => {
            // Global DECISIONS.md (no project encoded)
            const globalDecisions = makeMemoryFile({
                filePath: "global/DECISIONS.md",
                fileType: "decisions",
                content: "# Global Decisions\n\nAlways use bun",
                projectEncoded: undefined,
            });

            mockMemoryRepo = createMockMemoryFileRepo([globalDecisions]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            // Without crossProject
            const noXP = await service.getContext({ projectFilter: "test-project" });
            expect(noXP!.sections.find((s) => s.key === "cross_project_decisions")).toBeUndefined();

            // With crossProject
            const withXP = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });
            const xpDecisions = withXP!.sections.find((s) => s.key === "cross_project_decisions");
            expect(xpDecisions).toBeDefined();
            expect(xpDecisions!.priority).toBe(4);
            expect(xpDecisions!.content).toContain("Always use bun");
        });

        test("section 5: Cross-Project Learnings via findCrossProjectLearnings only when crossProject true (priority 5)", async () => {
            const crossLearning = makeMemoryFile({
                filePath: "other-project/LEARNINGS.md",
                fileType: "learnings",
                content: "# Learnings\n\nApplies to: cross-project\n\nUseful pattern discovered",
                projectEncoded: "other-project",
            });

            mockMemoryRepo = createMockMemoryFileRepo([crossLearning]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            // Without crossProject
            const noXP = await service.getContext({ projectFilter: "test-project" });
            expect(noXP!.sections.find((s) => s.key === "cross_project_learnings")).toBeUndefined();

            // With crossProject
            const withXP = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });
            const xpLearnings = withXP!.sections.find((s) => s.key === "cross_project_learnings");
            expect(xpLearnings).toBeDefined();
            expect(xpLearnings!.priority).toBe(5);
            expect(xpLearnings!.content).toContain("Useful pattern discovered");
        });

        test("section 6: Open Friction entries (priority 6)", async () => {
            const entry = makeFrictionEntry({
                id: 42,
                description: "Search returns irrelevant results",
                severity: "high",
                category: "search",
                context: "project:test-project",
            });

            mockFrictionRepo = createMockFrictionRepo([entry]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction).toBeDefined();
            expect(friction!.priority).toBe(6);
            expect(friction!.content).toContain("#42");
            expect(friction!.content).toContain("high/search");
            expect(friction!.content).toContain("Search returns irrelevant results");
        });

        test("section 7: Session Summary as fallback (priority 7)", async () => {
            const mockSessionSummary = async () =>
                "5 sessions, 120 messages, last active 2026-03-09";

            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
                getSessionSummary: mockSessionSummary,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const sessionSummary = result!.sections.find((s) => s.key === "session_summary");
            expect(sessionSummary).toBeDefined();
            expect(sessionSummary!.priority).toBe(7);
            expect(sessionSummary!.content).toContain("5 sessions");
        });

        test("full priority order is correct across all sections", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "# Decisions\n\nDecision content",
                projectEncoded: PROJECT_ENCODED,
            });
            const learningsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/LEARNINGS.md`,
                fileType: "learnings",
                content: "# Learnings\n\nLearning content",
                projectEncoded: PROJECT_ENCODED,
            });
            const dailyLog = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-03-09.md`,
                fileType: "daily_log",
                content: "# Daily\n\nDaily content",
                projectEncoded: PROJECT_ENCODED,
            });
            const crossLearning = makeMemoryFile({
                filePath: "other/LEARNINGS.md",
                fileType: "learnings",
                content: "Applies to: cross-project\n\nCross learning",
                projectEncoded: "other",
            });
            const globalDecisions = makeMemoryFile({
                filePath: "global/DECISIONS.md",
                fileType: "decisions",
                content: "# Global decisions",
                projectEncoded: undefined,
            });
            const frictionEntry = makeFrictionEntry({
                id: 1,
                description: "Some friction",
                context: "project:test-project",
            });

            mockMemoryRepo = createMockMemoryFileRepo([
                decisionsFile,
                learningsFile,
                dailyLog,
                crossLearning,
                globalDecisions,
            ]);
            mockFrictionRepo = createMockFrictionRepo([frictionEntry]);

            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
                getSessionSummary: async () => "session data",
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });

            const priorities = result!.sections.map((s) => ({
                key: s.key,
                priority: s.priority,
            }));

            // Verify priority ordering
            for (let i = 0; i < priorities.length - 1; i++) {
                expect(priorities[i].priority).toBeLessThanOrEqual(
                    priorities[i + 1].priority
                );
            }

            // Verify specific priority values
            expect(priorities.find((p) => p.key === "decisions")!.priority).toBe(1);
            expect(priorities.find((p) => p.key === "learnings")!.priority).toBe(2);
            expect(priorities.find((p) => p.key === "daily_logs")!.priority).toBe(3);
            expect(priorities.find((p) => p.key === "cross_project_decisions")!.priority).toBe(4);
            expect(priorities.find((p) => p.key === "cross_project_learnings")!.priority).toBe(5);
            expect(priorities.find((p) => p.key === "friction")!.priority).toBe(6);
            expect(priorities.find((p) => p.key === "session_summary")!.priority).toBe(7);
        });
    });

    describe("budget integration", () => {
        test("when budget is set, sections are passed through allocateBudget", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "D".repeat(400), // 100 tokens
                projectEncoded: PROJECT_ENCODED,
            });
            const learningsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/LEARNINGS.md`,
                fileType: "learnings",
                content: "L".repeat(400), // 100 tokens
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile, learningsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                budget: 120, // 120 tokens, fits decisions but truncates learnings
            });

            expect(result!.truncated).toBe(true);
            const decisions = result!.sections.find((s) => s.key === "decisions");
            const learnings = result!.sections.find((s) => s.key === "learnings");
            expect(decisions!.truncated).toBe(false);
            expect(learnings!.truncated).toBe(true);
        });

        test("when budget is undefined, all sections returned untruncated", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "D".repeat(4000),
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result!.truncated).toBe(false);
            expect(result!.sections[0].truncated).toBe(false);
        });

        test("when budget is 0, all sections returned untruncated", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "D".repeat(4000),
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                budget: 0,
            });

            expect(result!.truncated).toBe(false);
        });

        test("truncated flag is true when any section was truncated", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "D".repeat(1000),
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                budget: 10, // very small
            });

            expect(result!.truncated).toBe(true);
        });
    });

    describe("days filtering", () => {
        test("daily logs filtered to last N days when days option set", async () => {
            const recent = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-03-09.md`,
                fileType: "daily_log",
                content: "Recent daily log",
                projectEncoded: PROJECT_ENCODED,
            });
            const old = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-01-01.md`,
                fileType: "daily_log",
                content: "Old daily log",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([recent, old]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                days: 7,
            });

            const dailyLogs = result!.sections.find((s) => s.key === "daily_logs");
            expect(dailyLogs).toBeDefined();
            expect(dailyLogs!.content).toContain("Recent daily log");
            expect(dailyLogs!.content).not.toContain("Old daily log");
        });

        test("default: no day limit, all daily logs included", async () => {
            const recent = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-03-09.md`,
                fileType: "daily_log",
                content: "Recent daily log",
                projectEncoded: PROJECT_ENCODED,
            });
            const old = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/daily/2026-01-01.md`,
                fileType: "daily_log",
                content: "Old daily log",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([recent, old]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const dailyLogs = result!.sections.find((s) => s.key === "daily_logs");
            expect(dailyLogs).toBeDefined();
            expect(dailyLogs!.content).toContain("Recent daily log");
            expect(dailyLogs!.content).toContain("Old daily log");
        });
    });

    describe("cross-project flag", () => {
        test("crossProject false (default) omits sections 4 and 5", async () => {
            const crossLearning = makeMemoryFile({
                filePath: "other/LEARNINGS.md",
                fileType: "learnings",
                content: "Applies to: cross-project\n\nShared",
                projectEncoded: "other",
            });
            const globalDecisions = makeMemoryFile({
                filePath: "global/DECISIONS.md",
                fileType: "decisions",
                content: "Global decision",
                projectEncoded: undefined,
            });

            mockMemoryRepo = createMockMemoryFileRepo([crossLearning, globalDecisions]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const keys = result!.sections.map((s) => s.key);
            expect(keys).not.toContain("cross_project_decisions");
            expect(keys).not.toContain("cross_project_learnings");
        });

        test("crossProject true includes sections 4 and 5", async () => {
            const crossLearning = makeMemoryFile({
                filePath: "other/LEARNINGS.md",
                fileType: "learnings",
                content: "Applies to: cross-project\n\nShared insight",
                projectEncoded: "other",
            });
            const globalDecisions = makeMemoryFile({
                filePath: "global/DECISIONS.md",
                fileType: "decisions",
                content: "# Global Decisions\n\nShared decision",
                projectEncoded: undefined,
            });

            mockMemoryRepo = createMockMemoryFileRepo([crossLearning, globalDecisions]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });

            const keys = result!.sections.map((s) => s.key);
            expect(keys).toContain("cross_project_decisions");
            expect(keys).toContain("cross_project_learnings");
        });
    });

    describe("graceful degradation", () => {
        test("no memory files: section 7 (session summary) becomes primary", async () => {
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
                getSessionSummary: async () =>
                    "10 sessions, 250 messages, last active 2026-03-08",
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result).not.toBeNull();
            const session = result!.sections.find((s) => s.key === "session_summary");
            expect(session).toBeDefined();
            expect(session!.content).toContain("10 sessions");
        });

        test("no friction entries: section 6 omitted", async () => {
            mockFrictionRepo = createMockFrictionRepo([]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction).toBeUndefined();
        });

        test("no daily logs: section 3 omitted", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "# Decisions",
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const daily = result!.sections.find((s) => s.key === "daily_logs");
            expect(daily).toBeUndefined();
        });

        test("all empty: result has empty sections array, projectName still set", async () => {
            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result).not.toBeNull();
            expect(result!.projectName).toBe(PROJECT_NAME);
            expect(result!.sections).toHaveLength(0);
        });

        test("no session summary function: section 7 omitted", async () => {
            // service constructed without getSessionSummary
            const result = await service.getContext({ projectFilter: "test-project" });

            const session = result!.sections.find((s) => s.key === "session_summary");
            expect(session).toBeUndefined();
        });

        test("session summary returns null: section 7 omitted", async () => {
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
                getSessionSummary: async () => null,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const session = result!.sections.find((s) => s.key === "session_summary");
            expect(session).toBeUndefined();
        });
    });

    describe("friction formatting", () => {
        test("open friction entries formatted as #id (severity/category): description", async () => {
            const entry = makeFrictionEntry({
                id: 7,
                description: "Context output too verbose",
                severity: "high",
                category: "context",
            });

            mockFrictionRepo = createMockFrictionRepo([entry]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction!.content).toBe("#7 (high/context): Context output too verbose");
        });

        test("multiple friction entries joined with newlines", async () => {
            const entries = [
                makeFrictionEntry({
                    id: 1,
                    description: "Issue A",
                    severity: "low",
                    category: "cli",
                }),
                makeFrictionEntry({
                    id: 2,
                    description: "Issue B",
                    severity: "critical",
                    category: "search",
                }),
            ];

            mockFrictionRepo = createMockFrictionRepo(entries);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            const lines = friction!.content.split("\n");
            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain("#1");
            expect(lines[1]).toContain("#2");
        });

        test("project-specific friction: includes entries mentioning the project", async () => {
            const projectEntry = makeFrictionEntry({
                id: 10,
                description: "test-project search broken",
                severity: "high",
                category: "search",
            });
            const otherEntry = makeFrictionEntry({
                id: 11,
                description: "other-project sync slow",
                severity: "low",
                category: "sync",
            });

            mockFrictionRepo = createMockFrictionRepo([projectEntry, otherEntry]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            // Both should appear since all open friction is tool-level relevant
            expect(friction).toBeDefined();
        });

        test("if no project-specific friction, includes all open friction", async () => {
            const generalEntry = makeFrictionEntry({
                id: 99,
                description: "General tool issue",
                severity: "medium",
                category: "ux",
            });

            mockFrictionRepo = createMockFrictionRepo([generalEntry]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction).toBeDefined();
            expect(friction!.content).toContain("General tool issue");
        });
    });

    describe("token estimation", () => {
        test("totalTokensEstimate reflects sum of section estimates", async () => {
            const decisionsFile = makeMemoryFile({
                filePath: `${PROJECT_ENCODED}/DECISIONS.md`,
                fileType: "decisions",
                content: "D".repeat(100), // 25 tokens
                projectEncoded: PROJECT_ENCODED,
            });

            mockMemoryRepo = createMockMemoryFileRepo([decisionsFile]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                memoryFileRepo: mockMemoryRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result!.totalTokensEstimate).toBeGreaterThan(0);
            const sumTokens = result!.sections.reduce(
                (sum, s) => sum + s.tokenEstimate,
                0
            );
            expect(result!.totalTokensEstimate).toBe(sumTokens);
        });
    });
});
