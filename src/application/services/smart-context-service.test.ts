/**
 * Smart Context Service Tests
 *
 * Tests for the application-layer service that composes active facts,
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
import { Fact } from "../../domain/entities/fact.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type {
    IFactRepository,
    IFrictionRepository,
    FrictionStats,
} from "../../domain/ports/repositories.js";

// -- Helpers --

function makeFact(overrides: {
    type: "decision" | "learning" | "preference" | "friction" | "observation" | "supersedence";
    project: string;
    content: string;
    uuid?: string;
    supersededAt?: Date | null;
    supersededBy?: string | null;
}): Fact {
    return Fact.create({
        uuid: overrides.uuid ?? Math.random().toString(36).substring(2),
        type: overrides.type,
        project: overrides.project,
        content: overrides.content,
        observedAt: new Date(),
        supersededAt: overrides.supersededAt ?? null,
        supersededBy: overrides.supersededBy ?? null,
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

function createMockFactRepo(facts: Fact[]): IFactRepository {
    return {
        async findById(): Promise<Fact | null> {
            return null;
        },
        async findByUuid(uuid: string): Promise<Fact | null> {
            return facts.find((f) => f.uuid === uuid) ?? null;
        },
        async findByProject(project: string): Promise<Fact[]> {
            return facts.filter((f) => f.project === project);
        },
        async findRecent(limit: number): Promise<Fact[]> {
            return facts.slice(0, limit);
        },
        async save(fact: Fact): Promise<Fact> {
            return fact;
        },
        async saveMany(factsToSave: Fact[]): Promise<Fact[]> {
            return factsToSave;
        },
        async search(): Promise<Fact[]> {
            return [];
        },
        async supersede(): Promise<void> {},
        async findAll(): Promise<Fact[]> {
            return facts;
        },
        async clearAll(): Promise<void> {},
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
        async deleteByPattern(): Promise<number> {
            return 0;
        }
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
    let mockFactRepo: IFactRepository;
    let mockFrictionRepo: IFrictionRepository;

    beforeEach(() => {
        mockResolver = createMockProjectResolver(PROJECT_MAPPING);
        mockFactRepo = createMockFactRepo([]);
        mockFrictionRepo = createMockFrictionRepo([]);

        service = new SmartContextService({
            projectResolver: mockResolver,
            factRepo: mockFactRepo,
            frictionRepo: mockFrictionRepo,
        });
    });

    describe("project resolution", () => {
        test("resolves project name to encoded path via IProjectResolver", async () => {
            const decisionFact = makeFact({
                type: "decision",
                project: PROJECT_NAME,
                content: "Use SQLite for storage",
            });

            mockFactRepo = createMockFactRepo([decisionFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
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
        test("section 1: Active Decisions from facts table (priority 1)", async () => {
            const decisionFact = makeFact({
                type: "decision",
                project: PROJECT_NAME,
                content: "Use hexagonal architecture",
            });

            mockFactRepo = createMockFactRepo([decisionFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const decisions = result!.sections.find((s) => s.key === "decisions");
            expect(decisions).toBeDefined();
            expect(decisions!.priority).toBe(1);
            expect(decisions!.content).toContain("hexagonal architecture");
        });

        test("section 2: Recent Learnings from facts table (priority 2)", async () => {
            const learningFact = makeFact({
                type: "learning",
                project: PROJECT_NAME,
                content: "Bun resolves type-only imports",
            });

            mockFactRepo = createMockFactRepo([learningFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const learnings = result!.sections.find((s) => s.key === "learnings");
            expect(learnings).toBeDefined();
            expect(learnings!.priority).toBe(2);
            expect(learnings!.content).toContain("type-only imports");
        });

        test("section 3: User Preferences from facts table (priority 3)", async () => {
            const preferenceFact = makeFact({
                type: "preference",
                project: PROJECT_NAME,
                content: "Prefer explicit type annotations",
            });

            mockFactRepo = createMockFactRepo([preferenceFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const preferences = result!.sections.find((s) => s.key === "preferences");
            expect(preferences).toBeDefined();
            expect(preferences!.priority).toBe(3);
            expect(preferences!.content).toContain("Prefer explicit type annotations");
        });

        test("section 4: Observations from facts table (priority 4)", async () => {
            const observationFact = makeFact({
                type: "observation",
                project: PROJECT_NAME,
                content: "Test suite execution time is 1.2s",
            });

            mockFactRepo = createMockFactRepo([observationFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const observations = result!.sections.find((s) => s.key === "observations");
            expect(observations).toBeDefined();
            expect(observations!.priority).toBe(4);
            expect(observations!.content).toContain("Test suite execution time is 1.2s");
        });

        test("section 5: Cross-Project Preferences only when crossProject true (priority 5)", async () => {
            const globalPreference = makeFact({
                type: "preference",
                project: "other-project",
                content: "Always use Bun as runtime package manager",
            });

            mockFactRepo = createMockFactRepo([globalPreference]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            // Without crossProject
            const noXP = await service.getContext({ projectFilter: "test-project" });
            expect(noXP!.sections.find((s) => s.key === "cross_project_preferences")).toBeUndefined();

            // With crossProject
            const withXP = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });
            const xpPrefs = withXP!.sections.find((s) => s.key === "cross_project_preferences");
            expect(xpPrefs).toBeDefined();
            expect(xpPrefs!.priority).toBe(5);
            expect(xpPrefs!.content).toContain("Always use Bun");
        });

        test("section 6: Cross-Project Decisions only when crossProject true (priority 6)", async () => {
            const globalDecision = makeFact({
                type: "decision",
                project: "other-project",
                content: "Use Vitest instead of Jest for all units",
            });

            mockFactRepo = createMockFactRepo([globalDecision]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const withXP = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });
            const xpDecisions = withXP!.sections.find((s) => s.key === "cross_project_decisions");
            expect(xpDecisions).toBeDefined();
            expect(xpDecisions!.priority).toBe(6);
            expect(xpDecisions!.content).toContain("Use Vitest instead of Jest");
        });

        test("section 7: Cross-Project Learnings only when crossProject true (priority 7)", async () => {
            const globalLearning = makeFact({
                type: "learning",
                project: "other-project",
                content: "Chrononode parser handles duration inputs like '7d'",
            });

            mockFactRepo = createMockFactRepo([globalLearning]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const withXP = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });
            const xpLearnings = withXP!.sections.find((s) => s.key === "cross_project_learnings");
            expect(xpLearnings).toBeDefined();
            expect(xpLearnings!.priority).toBe(7);
            expect(xpLearnings!.content).toContain("Chrononode parser");
        });

        test("section 8: Open Friction entries (priority 8)", async () => {
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
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction).toBeDefined();
            expect(friction!.priority).toBe(8);
            expect(friction!.content).toContain("#42");
            expect(friction!.content).toContain("high/search");
            expect(friction!.content).toContain("Search returns irrelevant results");
        });

        test("section 9: Session Summary as fallback (priority 9)", async () => {
            const mockSessionSummary = async () =>
                "5 sessions, 120 messages, last active 2026-03-09";

            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                getSessionSummary: mockSessionSummary,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const sessionSummary = result!.sections.find((s) => s.key === "session_summary");
            expect(sessionSummary).toBeDefined();
            expect(sessionSummary!.priority).toBe(9);
            expect(sessionSummary!.content).toContain("5 sessions");
        });
    });

    describe("budget integration", () => {
        test("when budget is set, sections are passed through allocateBudget", async () => {
            const decisionFact = makeFact({
                type: "decision",
                project: PROJECT_NAME,
                content: "D".repeat(400), // 100 tokens
            });
            const learningFact = makeFact({
                type: "learning",
                project: PROJECT_NAME,
                content: "L".repeat(400), // 100 tokens
            });

            mockFactRepo = createMockFactRepo([decisionFact, learningFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
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
            const decisionFact = makeFact({
                type: "decision",
                project: PROJECT_NAME,
                content: "D".repeat(4000),
            });

            mockFactRepo = createMockFactRepo([decisionFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result!.truncated).toBe(false);
            expect(result!.sections[0].truncated).toBe(false);
        });

        test("when budget is 0, all sections returned untruncated", async () => {
            const decisionFact = makeFact({
                type: "decision",
                project: PROJECT_NAME,
                content: "D".repeat(4000),
            });

            mockFactRepo = createMockFactRepo([decisionFact]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                budget: 0,
            });

            expect(result!.truncated).toBe(false);
        });
    });

    describe("graceful degradation", () => {
        test("no memory facts: section 9 (session summary) becomes primary", async () => {
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
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

        test("no friction entries: section 8 omitted", async () => {
            mockFrictionRepo = createMockFrictionRepo([]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction).toBeUndefined();
        });

        test("all empty: result has empty sections array, projectName still set", async () => {
            const result = await service.getContext({ projectFilter: "test-project" });

            expect(result).not.toBeNull();
            expect(result!.projectName).toBe(PROJECT_NAME);
            expect(result!.sections).toHaveLength(0);
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
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const friction = result!.sections.find((s) => s.key === "friction");
            expect(friction!.content).toBe("#7 (high/context): Context output too verbose");
        });
    });
});
