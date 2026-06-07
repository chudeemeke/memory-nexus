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
    type IContextGovernancePolicy,
} from "./smart-context-service.js";
import { MemoryRankingService } from "./memory-ranking-service.js";
import { Fact } from "../../domain/entities/fact.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import { PersonaEntry } from "../../domain/entities/persona-entry.js";
import { GraphEdge } from "../../domain/entities/graph-edge.js";
import { MemoryUtilityMetric, type MemoryUtilitySurface } from "../../domain/entities/memory-utility-metric.js";
import type {
    IFactRepository,
    IFrictionRepository,
    FrictionStats,
    IPersonaRepository,
    IGraphRepository,
    IMemoryUtilityRepository,
} from "../../domain/ports/repositories.js";

// -- Helpers --

function makeFact(overrides: {
    type: "decision" | "learning" | "preference" | "friction" | "observation" | "supersedence";
    project: string;
    content: string;
    uuid?: string;
    metadata?: Record<string, unknown>;
    observedAt?: Date;
    supersededAt?: Date | null;
    supersededBy?: string | null;
}): Fact {
    return Fact.create({
        uuid: overrides.uuid ?? Math.random().toString(36).substring(2),
        type: overrides.type,
        project: overrides.project,
        content: overrides.content,
        metadata: overrides.metadata,
        observedAt: overrides.observedAt ?? new Date(),
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
        async query(): Promise<{ entries: FrictionEntry[]; totalCount: number }> {
            return { entries, totalCount: entries.length };
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

function createBlockingGovernancePolicy(blockedIds: string[]): IContextGovernancePolicy {
    const blocked = new Set(blockedIds);
    return {
        async filterAllowed(surface, items, getTargetId) {
            expect(["fact", "persona", "graph"]).toContain(surface);
            return items.filter((item) => !blocked.has(getTargetId(item)));
        },
    };
}

function makePersonaEntry(overrides: {
    entryId: string;
    content: string;
    project?: string;
    visibility?: "project" | "global";
    why?: string;
}): PersonaEntry {
    const visibility = overrides.visibility ?? "project";
    return PersonaEntry.create({
        entryId: overrides.entryId,
        kind: "preference",
        content: overrides.content,
        project: overrides.project,
        visibility,
        sourceEventIds: [`evt-${overrides.entryId}`],
        sourceKinds: ["preference"],
        confidence: 0.9,
        scope: visibility === "project"
            ? { project: overrides.project, visibility }
            : { visibility },
        reviewStatus: "pending_review",
        reviewAfter: new Date("2026-07-07T00:00:00.000Z"),
        why: overrides.why ?? "Derived from an active preference fact.",
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });
}

function createMockPersonaRepo(entries: PersonaEntry[]): IPersonaRepository {
    return {
        async save(entry) { return entry; },
        async saveMany(items) { return items; },
        async findByEntryId(entryId) { return entries.find((entry) => entry.entryId === entryId) ?? null; },
        async findAll() { return entries; },
        async findForContext(project) {
            return entries.filter((entry) => entry.visibility === "global" || entry.project === project);
        },
        async deleteByProject() {},
        async clearAll() {},
    };
}

function makeGraphEdge(overrides: {
    edgeId: string;
    project?: string;
    visibility?: "project" | "global";
    source?: string;
    target?: string;
    why?: string;
}): GraphEdge {
    const visibility = overrides.visibility ?? "project";
    return GraphEdge.create({
        edgeId: overrides.edgeId,
        source: { type: "tool", id: overrides.source ?? "memory", label: overrides.source ?? "memory" },
        target: { type: "capability", id: overrides.target ?? "authkey", label: overrides.target ?? "authkey" },
        relationship: "uses",
        project: overrides.project,
        visibility,
        sourceEventIds: [`evt-${overrides.edgeId}`],
        sourceKinds: ["decision"],
        confidence: 0.9,
        validFrom: new Date("2026-05-01T00:00:00.000Z"),
        why: overrides.why ?? "Derived from graph metadata.",
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });
}

function createMockGraphRepo(entries: GraphEdge[]): IGraphRepository {
    return {
        async save(edge) { return edge; },
        async saveMany(items) { return items; },
        async findByEdgeId(edgeId) { return entries.find((entry) => entry.edgeId === edgeId) ?? null; },
        async findCurrent(options = {}) {
            const asOf = options.asOf ?? new Date("2026-06-07T00:00:00.000Z");
            const minConfidence = options.minConfidence ?? 0.7;
            return entries.filter((entry) => {
                const scopeAllowed = !options.project ||
                    entry.project === options.project ||
                    ((options.includeGlobal ?? true) && entry.visibility === "global");
                return scopeAllowed && entry.isCurrent(asOf, minConfidence);
            });
        },
        async pruneStale() { return 0; },
        async deleteByProject() {},
        async clearAll() {},
    };
}

function createMockUtilityRepo(metrics: MemoryUtilityMetric[]): IMemoryUtilityRepository {
    return {
        async save(metric) { return metric; },
        async findByTarget(surface, targetId) {
            return metrics.find((metric) => metric.surface === surface && metric.targetId === targetId) ?? null;
        },
        async findByTargetIds(surface, targetIds) {
            return metrics.filter((metric) => metric.surface === surface && targetIds.includes(metric.targetId));
        },
        async recordAccess(surface, targetId, accessedAt) {
            return MemoryUtilityMetric.create({
                surface,
                targetId,
                accessCount: 1,
                lastAccessedAt: accessedAt,
                lastRankedAt: null,
                createdAt: accessedAt,
                updatedAt: accessedAt,
            });
        },
        async deleteByProject() {},
        async clearAll() {},
    };
}

function makeUtilityMetric(
    surface: MemoryUtilitySurface,
    targetId: string,
    overrides: Partial<Parameters<typeof MemoryUtilityMetric.create>[0]> = {},
): MemoryUtilityMetric {
    return MemoryUtilityMetric.create({
        surface,
        targetId,
        project: PROJECT_NAME,
        accessCount: 0,
        lastAccessedAt: null,
        lastRankedAt: null,
        utilityScore: 0.5,
        importanceScore: 0.5,
        evergreen: false,
        pinned: false,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...overrides,
    });
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
        test("governance controls suppress blocked facts before context assembly", async () => {
            const allowedDecision = makeFact({
                uuid: "allowed-decision",
                type: "decision",
                project: PROJECT_NAME,
                content: "Allowed decision",
            });
            const suppressedDecision = makeFact({
                uuid: "suppressed-decision",
                type: "decision",
                project: PROJECT_NAME,
                content: "Suppressed decision",
            });

            mockFactRepo = createMockFactRepo([allowedDecision, suppressedDecision]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                governancePolicy: createBlockingGovernancePolicy(["suppressed-decision"]),
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const decisions = result!.sections.find((s) => s.key === "decisions");
            expect(decisions?.content).toContain("Allowed decision");
            expect(decisions?.content).not.toContain("Suppressed decision");
        });

        test("ranking orders allowed facts by durable utility and explains why-ranked metadata", async () => {
            const durableDecision = makeFact({
                uuid: "durable-path-rule",
                type: "decision",
                project: PROJECT_NAME,
                content: "Always use symlinked project paths.",
                metadata: { evergreen: true },
                observedAt: new Date("2026-01-01T00:00:00.000Z"),
            });
            const recentNoise = makeFact({
                uuid: "recent-noise",
                type: "decision",
                project: PROJECT_NAME,
                content: "Terminal tab was labelled npm whoami.",
                metadata: { recencyNoisePenalty: 0.25 },
                observedAt: new Date("2026-06-06T00:00:00.000Z"),
            });

            mockFactRepo = createMockFactRepo([recentNoise, durableDecision]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                rankingService: new MemoryRankingService({ now: () => new Date("2026-06-07T00:00:00.000Z") }),
                utilityRepo: createMockUtilityRepo([
                    makeUtilityMetric("fact", "durable-path-rule", {
                        importanceScore: 0.8,
                        utilityScore: 0.72,
                        accessCount: 6,
                        evergreen: true,
                    }),
                    makeUtilityMetric("fact", "recent-noise", {
                        importanceScore: 0.15,
                        utilityScore: 0.1,
                    }),
                ]),
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const decisions = result!.sections.find((s) => s.key === "decisions");
            expect(decisions?.content.indexOf("Always use symlinked project paths."))
                .toBeLessThan(decisions?.content.indexOf("Terminal tab was labelled npm whoami.") ?? Number.MAX_SAFE_INTEGER);
            expect(decisions?.content).toContain("why-ranked: active; kind=fact; type=decision");
            expect(decisions?.content).toContain("evergreen");
            expect(decisions?.content).toContain("access_count=6");
        });

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

        test("injects governed persona entries with why-included metadata and no unrelated project leakage", async () => {
            const personaRepo = createMockPersonaRepo([
                makePersonaEntry({
                    entryId: "memory-persona",
                    project: PROJECT_NAME,
                    content: "Prefer durable disk artifacts.",
                    why: "Derived from repeated corrections.",
                }),
                makePersonaEntry({
                    entryId: "global-persona",
                    visibility: "global",
                    content: "Use symlinked project paths.",
                    why: "Derived from global rule facts.",
                }),
                makePersonaEntry({
                    entryId: "authkey-persona",
                    project: "authkey",
                    content: "Authkey-only private preference.",
                }),
            ]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                personaRepo,
                rankingService: new MemoryRankingService({ now: () => new Date("2026-06-07T00:00:00.000Z") }),
                utilityRepo: createMockUtilityRepo([
                    makeUtilityMetric("persona", "memory-persona", {
                        importanceScore: 0.75,
                        utilityScore: 0.8,
                        accessCount: 4,
                    }),
                    makeUtilityMetric("persona", "global-persona", {
                        importanceScore: 0.7,
                        utilityScore: 0.7,
                    }),
                ]),
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const persona = result!.sections.find((section) => section.key === "persona");
            expect(persona?.content).toContain("Prefer durable disk artifacts.");
            expect(persona?.content).toContain("why: Derived from repeated corrections.");
            expect(persona?.content).toContain("why-ranked: active; kind=persona; type=preference");
            expect(persona?.content).toContain("access_count=4");
            expect(persona?.content).toContain("Use symlinked project paths.");
            expect(persona?.content).not.toContain("Authkey-only private preference.");
        });

        test("governance controls suppress persona entries before context assembly", async () => {
            const personaRepo = createMockPersonaRepo([
                makePersonaEntry({
                    entryId: "allowed-persona",
                    project: PROJECT_NAME,
                    content: "Allowed persona entry.",
                }),
                makePersonaEntry({
                    entryId: "blocked-persona",
                    project: PROJECT_NAME,
                    content: "Blocked persona entry.",
                }),
            ]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                personaRepo,
                governancePolicy: createBlockingGovernancePolicy(["blocked-persona"]),
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const persona = result!.sections.find((section) => section.key === "persona");
            expect(persona?.content).toContain("Allowed persona entry.");
            expect(persona?.content).not.toContain("Blocked persona entry.");
        });

        test("injects current governed graph edges with explanations and no unrelated project leakage", async () => {
            const graphRepo = createMockGraphRepo([
                makeGraphEdge({
                    edgeId: "memory-authkey",
                    project: PROJECT_NAME,
                    why: "Derived from optional authkey interop decision.",
                }),
                makeGraphEdge({
                    edgeId: "global-capability",
                    visibility: "global",
                    why: "Derived from global capability rule.",
                }),
                makeGraphEdge({
                    edgeId: "authkey-private",
                    project: "authkey",
                    target: "authkey-private",
                    why: "Private to authkey.",
                }),
                makeGraphEdge({
                    edgeId: "blocked-graph",
                    project: PROJECT_NAME,
                    target: "blocked",
                }),
            ]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
                graphRepo,
                governancePolicy: createBlockingGovernancePolicy(["blocked-graph"]),
                rankingService: new MemoryRankingService({ now: () => new Date("2026-06-07T00:00:00.000Z") }),
                utilityRepo: createMockUtilityRepo([
                    makeUtilityMetric("graph", "memory-authkey", {
                        importanceScore: 0.8,
                        utilityScore: 0.8,
                        pinned: true,
                    }),
                    makeUtilityMetric("graph", "global-capability", {
                        importanceScore: 0.6,
                        utilityScore: 0.6,
                    }),
                ]),
            });

            const result = await service.getContext({ projectFilter: "test-project" });

            const graph = result!.sections.find((section) => section.key === "semantic_graph");
            expect(graph?.title).toBe("Temporal Semantic Graph");
            expect(graph?.content).toContain("memory --uses--> authkey");
            expect(graph?.content).toContain("why: Derived from optional authkey interop decision.");
            expect(graph?.content).toContain("why-ranked: active; kind=graph; type=uses");
            expect(graph?.content).toContain("pinned");
            expect(graph?.content).toContain("global-capability");
            expect(graph?.content).not.toContain("authkey-private");
            expect(graph?.content).not.toContain("blocked");
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
                metadata: { visibility: "global" },
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
                metadata: { visibility: "global" },
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
                metadata: { visibility: "global" },
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

        test("cross-project sections exclude project-private facts from unrelated projects", async () => {
            const privateOtherProject = makeFact({
                type: "decision",
                project: "authkey",
                content: "authkey private implementation note",
                metadata: { visibility: "project" },
            });
            const globalOtherProject = makeFact({
                type: "decision",
                project: "authkey",
                content: "authkey global integration rule",
                metadata: { visibility: "global" },
            });

            mockFactRepo = createMockFactRepo([privateOtherProject, globalOtherProject]);
            service = new SmartContextService({
                projectResolver: mockResolver,
                factRepo: mockFactRepo,
                frictionRepo: mockFrictionRepo,
            });

            const result = await service.getContext({
                projectFilter: "test-project",
                crossProject: true,
            });

            const crossProjectDecisions = result!.sections.find((s) => s.key === "cross_project_decisions");
            expect(crossProjectDecisions?.content).toContain("authkey global integration rule");
            expect(crossProjectDecisions?.content).not.toContain("authkey private implementation note");
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
