import { describe, expect, test } from "bun:test";
import { Fact } from "../../domain/entities/fact.js";
import { GraphEdge } from "../../domain/entities/graph-edge.js";
import { MemoryGovernanceEntry } from "../../domain/entities/memory-governance.js";
import type {
  GraphEdgeQueryOptions,
  IGraphRepository,
  IFactRepository,
  IMemoryGovernanceRepository,
  MemoryGovernanceListOptions,
} from "../../domain/ports/repositories.js";
import { TemporalGraphService, graphEdgesFromFact } from "./temporal-graph-service.js";
import type { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("TemporalGraphService", () => {
  test("rebuilds graph edges from active fact metadata and registers governance", async () => {
    const active = factWithGraph("graph-current", {
      id: "authkey-memory-interop-current",
      source: { type: "tool", id: "memory", label: "memory" },
      target: { type: "capability", id: "authkey", label: "authkey" },
      relationship: "optional-capability-provider",
      confidence: 0.91,
      validFrom: "2026-05-27T00:00:00.000Z",
      why: "authkey is optional capability injection for memory.",
    });
    const superseded = factWithGraph("graph-old", {
      id: "stale-storage",
      source: "memory",
      target: "legacy-memory-files",
      relationship: "default-storage",
      confidence: 0.88,
      validFrom: "2026-04-01T00:00:00.000Z",
      validTo: "2026-05-30T00:00:00.000Z",
      why: "Old default storage behavior.",
    }, { supersededAt: new Date("2026-05-30T00:00:00.000Z") });
    const repo = createGraphRepo();
    const governanceRepo = createGovernanceRepo();
    const service = new TemporalGraphService({
      factRepo: createFactRepo([active, superseded]),
      graphRepo: repo,
      governanceRepo,
      now: () => NOW,
    });

    const result = await service.rebuildGraph({ project: "memory-nexus" });

    expect(result.factCount).toBe(1);
    expect(result.edgeCount).toBe(1);
    expect(repo.saved.map((edge) => edge.edgeId)).toEqual(["authkey-memory-interop-current"]);
    expect(governanceRepo.saved).toHaveLength(1);
    expect(governanceRepo.saved[0]?.surface).toBe("graph");
    expect(governanceRepo.saved[0]?.targetId).toBe("authkey-memory-interop-current");
  });

  test("rebuilds all projects without governance, clears stale projections, and dedupes by edge id", async () => {
    await expect(new TemporalGraphService({ graphRepo: createGraphRepo() }).rebuildGraph())
      .rejects.toThrow("requires factRepo");

    const duplicateA = factWithGraph("graph-duplicate-a", {
      id: "shared-edge",
      source: "memory",
      target: "authkey",
      relationship: "uses",
      why: "First duplicate wins.",
    });
    const duplicateB = factWithGraph("graph-duplicate-b", {
      id: "shared-edge",
      source: "memory",
      target: "authkey",
      relationship: "uses",
      why: "Second duplicate is omitted.",
    }, { project: "authkey" });
    const repo = createGraphRepo([makeEdge("stale-existing")]);
    const service = new TemporalGraphService({
      factRepo: createFactRepo([duplicateA, duplicateB]),
      graphRepo: repo,
    });

    const result = await service.rebuildGraph();

    expect(result.factCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(repo.saved.map((edge) => edge.edgeId)).toEqual(["shared-edge"]);
    expect(repo.saved[0]?.why).toBe("First duplicate wins.");
  });

  test("queries current edges with governance filtering and context explanations", async () => {
    const allowed = makeEdge("allowed-edge", { project: "memory-nexus" });
    const blocked = makeEdge("blocked-edge", { project: "memory-nexus" });
    const otherProject = makeEdge("other-private-edge", { project: "authkey" });
    const global = makeEdge("global-edge", { project: undefined, visibility: "global" });
    const repo = createGraphRepo([allowed, blocked, otherProject, global]);
    const service = new TemporalGraphService({
      graphRepo: repo,
      governancePolicy: {
        async filterAllowed(surface, items, getTargetId) {
          expect(surface).toBe("graph");
          return items.filter((item) => getTargetId(item) !== "blocked-edge");
        },
      },
      now: () => NOW,
    });

    const result = await service.findContextEdges({
      project: "memory-nexus",
      asOf: NOW,
      minConfidence: 0.7,
    });

    expect(result.map((edge) => edge.edgeId).sort()).toEqual(["allowed-edge", "global-edge"]);
    expect(service.formatContextLines(result).join("\n")).toContain("why:");
    expect(service.formatContextLines(result).join("\n")).not.toContain("blocked-edge");
    expect(service.formatContextLines(result).join("\n")).not.toContain("other-private-edge");
  });

  test("findContextEdges returns repository results when governance is absent or no edges exist", async () => {
    const edge = makeEdge("ungoverned-edge", {
      visibility: "workspace",
      project: undefined,
      validTo: new Date("2026-07-01T00:00:00.000Z"),
    });
    const serviceWithoutGovernance = new TemporalGraphService({
      graphRepo: createGraphRepo([edge]),
      now: () => NOW,
    });

    expect((await serviceWithoutGovernance.findContextEdges({ project: "memory-nexus", asOf: NOW })).map((item) => item.edgeId))
      .toEqual(["ungoverned-edge"]);
    expect(serviceWithoutGovernance.formatContextLines([edge]).join("\n"))
      .toContain("scope: workspace; valid: 2026-05-01T00:00:00.000Z to 2026-07-01T00:00:00.000Z");

    const serviceWithEmptyGovernance = new TemporalGraphService({
      graphRepo: createGraphRepo([]),
      governancePolicy: {
        async filterAllowed() {
          throw new Error("empty graph results should not invoke governance filtering");
        },
      },
      now: () => NOW,
    });

    expect(await serviceWithEmptyGovernance.findContextEdges({ project: "memory-nexus", asOf: NOW }))
      .toEqual([]);
  });

  test("graphEdgesFromFact handles metadata aliases and rejects malformed candidates by omission", () => {
    const fact = Fact.create({
      uuid: "fact-graph-alias",
      type: "decision",
      project: "memory-nexus",
      content: "Graph candidate aliases",
      metadata: {
        graphEdges: [
          {
            id: "alias-edge",
            source: "memory",
            target: "authkey",
            sourceType: "tool",
            targetType: "capability",
            relationship: "requires_capability",
            confidence: 0.86,
            validFrom: "2026-06-01T00:00:00.000Z",
            why: "Alias metadata extraction.",
          },
          {
            source: "",
            target: "broken",
            relationship: "bad relation",
          },
        ],
      },
      observedAt: NOW,
    });

    const edges = graphEdgesFromFact(fact, NOW);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.edgeId).toBe("alias-edge");
    expect(edges[0]?.source.type).toBe("tool");
    expect(edges[0]?.target.type).toBe("capability");
  });

  test("graphEdgesFromFact applies fallbacks for relationships metadata, scope, confidence, dates, and provenance", () => {
    const fact = Fact.create({
      uuid: "fact-graph-relationships",
      type: "learning",
      project: "memory-nexus",
      content: "Relationship metadata can be derived from extractor aliases.",
      metadata: {
        confidence: 0.83,
        source_kind: "extractor",
        relationships: [
          {
            id: "workspace-command-edge",
            source: { id: "sync", label: "memory sync" },
            source_type: "command",
            target: { id: "authkey" },
            target_type: "capability",
            relationship: "uses",
            visibility: "workspace",
            valid_from: "not-a-date",
            valid_to: new Date("2026-07-01T00:00:00.000Z"),
            source_kinds: [],
            source_event_ids: ["fact-graph-relationships", "event-extra", ""],
            metadata: { parser: "alias" },
          },
        ],
      },
      observedAt: NOW,
    });

    const edges = graphEdgesFromFact(fact, NOW);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.edgeId).toBe("workspace-command-edge");
    expect(edges[0]?.source).toEqual({ type: "command", id: "sync", label: "memory sync" });
    expect(edges[0]?.target).toEqual({ type: "capability", id: "authkey", label: "authkey" });
    expect(edges[0]?.visibility).toBe("workspace");
    expect(edges[0]?.project).toBeUndefined();
    expect(edges[0]?.confidence).toBe(0.83);
    expect(edges[0]?.validFrom.toISOString()).toBe(NOW.toISOString());
    expect(edges[0]?.validTo?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(edges[0]?.sourceKinds).toEqual(["extractor"]);
    expect(edges[0]?.sourceEventIds).toEqual(["fact-graph-relationships", "event-extra"]);
    expect(edges[0]?.metadata).toEqual({ parser: "alias" });

    const noCandidates = Fact.create({
      uuid: "fact-no-graph-array",
      type: "observation",
      project: "memory-nexus",
      content: "No usable graph metadata.",
      metadata: { graph_edges: "not an array" },
      observedAt: NOW,
    });
    expect(graphEdgesFromFact(noCandidates, NOW)).toEqual([]);
  });
});

function factWithGraph(
  uuid: string,
  edge: Record<string, unknown>,
  overrides: Partial<Parameters<typeof Fact.create>[0]> = {},
): Fact {
  return Fact.create({
    uuid,
    type: "decision",
    project: "memory-nexus",
    content: `Fact ${uuid}`,
    metadata: { graph_edges: [edge] },
    observedAt: NOW,
    ...overrides,
  });
}

function makeEdge(
  edgeId: string,
  overrides: Partial<Parameters<typeof GraphEdge.create>[0]> = {},
): GraphEdge {
  return GraphEdge.create({
    edgeId,
    source: { type: "tool", id: "memory", label: "memory" },
    target: { type: "capability", id: edgeId, label: edgeId },
    relationship: "uses",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: [`fact-${edgeId}`],
    sourceKinds: ["decision"],
    confidence: 0.9,
    validFrom: new Date("2026-05-01T00:00:00.000Z"),
    why: `Why ${edgeId}.`,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function createFactRepo(facts: Fact[]): IFactRepository {
  return {
    async findById() { return null; },
    async findByUuid(uuid) { return facts.find((fact) => fact.uuid === uuid) ?? null; },
    async findByProject(project) { return facts.filter((fact) => fact.project === project); },
    async findRecent(limit) { return facts.slice(0, limit); },
    async save(fact) { return fact; },
    async saveMany(items) { return items; },
    async search() { return []; },
    async supersede() {},
    async findAll() { return facts; },
    async clearAll() {},
  };
}

function createGraphRepo(initial: GraphEdge[] = []): IGraphRepository & { saved: GraphEdge[] } {
  const repo = {
    saved: [...initial],
    async save(edge: GraphEdge) {
      repo.saved = repo.saved.filter((item) => item.edgeId !== edge.edgeId);
      repo.saved.push(edge);
      return edge;
    },
    async saveMany(edges: GraphEdge[]) {
      for (const edge of edges) {
        await repo.save(edge);
      }
      return edges;
    },
    async findByEdgeId(edgeId: string) {
      return repo.saved.find((edge) => edge.edgeId === edgeId) ?? null;
    },
    async findCurrent(options: GraphEdgeQueryOptions = {}) {
      const asOf = options.asOf ?? NOW;
      const minConfidence = options.minConfidence ?? 0.7;
      return repo.saved.filter((edge) => {
        const scopeAllowed = !options.project ||
          edge.project === options.project ||
          (options.includeGlobal ?? true) && (edge.visibility === "global" || edge.visibility === "workspace");
        return scopeAllowed && edge.isCurrent(asOf, minConfidence);
      });
    },
    async pruneStale(cutoff: Date) {
      const before = repo.saved.length;
      repo.saved = repo.saved.filter((edge) => !edge.validTo || edge.validTo >= cutoff);
      return before - repo.saved.length;
    },
    async deleteByProject(project: string) {
      repo.saved = repo.saved.filter((edge) => edge.project !== project);
    },
    async clearAll() {
      repo.saved = [];
    },
  };
  return repo;
}

function createGovernanceRepo(): IMemoryGovernanceRepository & { saved: MemoryGovernanceEntry[] } {
  const repo = {
    saved: [] as MemoryGovernanceEntry[],
    async save(entry: MemoryGovernanceEntry) {
      repo.saved = repo.saved.filter((item) => item.surface !== entry.surface || item.targetId !== entry.targetId);
      repo.saved.push(entry);
      return entry;
    },
    async findByTarget(_surface: string, targetId: string) {
      return repo.saved.find((entry) => entry.targetId === targetId) ?? null;
    },
    async findByTargetIds(_surface: string, targetIds: string[]) {
      return repo.saved.filter((entry) => targetIds.includes(entry.targetId));
    },
    async findAll(_options?: MemoryGovernanceListOptions) {
      return repo.saved;
    },
    async applyMemoryEvent(_event: MemoryEventEnvelope) {
      return null;
    },
    async clearAll() {
      repo.saved = [];
    },
  };
  return repo;
}
