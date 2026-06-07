import { describe, expect, test } from "bun:test";
import { Fact } from "../../domain/entities/fact.js";
import { GraphEdge } from "../../domain/entities/graph-edge.js";
import { PersonaEntry } from "../../domain/entities/persona-entry.js";
import { MemoryUtilityMetric } from "../../domain/entities/memory-utility-metric.js";
import {
  MemoryRankingService,
  candidateFromFact,
  candidateFromGraphEdge,
  candidateFromPersonaEntry,
  type MemoryRankCandidate,
} from "./memory-ranking-service.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("MemoryRankingService", () => {
  test("evergreen useful memory outranks recent noisy memory with explanation", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const oldEvergreen = candidateFromFact(makeFact("durable-path-symlink-rule", {
      type: "preference",
      content: "Always use symlinked project paths.",
      observedAt: new Date("2026-01-01T00:00:00.000Z"),
      metadata: { evergreen: true },
    }), makeMetric("fact", "durable-path-symlink-rule", {
      importanceScore: 0.8,
      utilityScore: 0.72,
      accessCount: 6,
      lastAccessedAt: new Date("2026-06-06T00:00:00.000Z"),
    }));
    const recentNoise = candidateFromFact(makeFact("recent-terminal-tab-label", {
      type: "observation",
      content: "Terminal tab label was npm whoami.",
      observedAt: new Date("2026-06-06T00:00:00.000Z"),
      metadata: { recencyNoisePenalty: 0.25 },
    }), makeMetric("fact", "recent-terminal-tab-label", {
      importanceScore: 0.15,
      utilityScore: 0.1,
    }));

    const ranked = service.rank([recentNoise, oldEvergreen]);

    expect(ranked.map((item) => item.id)).toEqual(["durable-path-symlink-rule", "recent-terminal-tab-label"]);
    expect(ranked[0]?.whyIncluded).toContain("evergreen");
    expect(ranked[0]?.whyIncluded).toContain("access_count=6");
    expect(ranked[0]?.components.decayMultiplier).toBe(1);
  });

  test("filters superseded, governed, future, and stale candidates before ranking", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const visible = makeCandidate("visible");
    const ranked = service.rank([
      makeCandidate("blank-id", { id: " " }),
      makeCandidate("blank-content", { content: " " }),
      makeCandidate("superseded", { supersededAt: new Date("2026-06-01T00:00:00.000Z") }),
      makeCandidate("suppressed", { governanceStatus: "suppressed" }),
      makeCandidate("future", { validFrom: new Date("2026-06-08T00:00:00.000Z") }),
      makeCandidate("expired", { validTo: new Date("2026-06-01T00:00:00.000Z") }),
      visible,
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.id).toBe("visible");
    expect(ranked[0]?.whyIncluded).toContain("active");
  });

  test("uses per-kind half-life policies and pinned exemptions", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const oldObservation = makeCandidate("old-observation", {
      kind: "fact",
      memoryType: "observation",
      observedAt: new Date("2026-01-01T00:00:00.000Z"),
      importance: 0.9,
      utility: 0.9,
    });
    const oldPinnedGraph = candidateFromGraphEdge(makeGraph("old-graph"), makeMetric("graph", "old-graph", {
      pinned: true,
      importanceScore: 0.5,
      utilityScore: 0.5,
    }));

    const ranked = service.rank([oldObservation, oldPinnedGraph]);

    expect(ranked[0]?.id).toBe("old-graph");
    expect(ranked[0]?.components.decayMultiplier).toBe(1);
    expect(ranked[0]?.whyIncluded).toContain("pinned");
    expect(ranked.find((item) => item.id === "old-observation")?.components.decayMultiplier).toBeLessThan(0.1);
  });

  test("uses default importance policies, no-metric confidence, and deterministic id tie-breaks", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const ranked = service.rank([
      makeCandidate("z-decision", { memoryType: "decision", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("a-decision", { memoryType: "decision", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("learning", { memoryType: "learning", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("friction", { memoryType: "friction", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("observation", { memoryType: "observation", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("unknown-fact", { memoryType: "custom", importance: undefined, utility: undefined, confidence: undefined }),
      makeCandidate("link-default", { kind: "link", memoryType: undefined, importance: undefined, utility: undefined, confidence: undefined }),
    ]);

    const byId = new Map(ranked.map((item) => [item.id, item]));
    expect(ranked.filter((item) => item.id.endsWith("decision")).map((item) => item.id)).toEqual(["a-decision", "z-decision"]);
    expect(byId.get("a-decision")?.components.importance).toBe(0.7);
    expect(byId.get("learning")?.components.importance).toBe(0.6);
    expect(byId.get("friction")?.components.importance).toBe(0.55);
    expect(byId.get("observation")?.components.importance).toBe(0.35);
    expect(byId.get("unknown-fact")?.components.importance).toBe(0.5);
    expect(byId.get("link-default")?.components.importance).toBe(0.5);
    expect(byId.get("link-default")?.components.confidence).toBe(0.8);
  });

  test("adapts persona entries and graph metadata into rankable candidates", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const persona = candidateFromPersonaEntry(makePersona("persona-procedure"), makeMetric("persona", "persona-procedure", {
      halfLifeDays: 30,
      utilityScore: 0.9,
      importanceScore: 0.7,
    }));
    const graph = candidateFromGraphEdge(makeGraph("metadata-graph", {
      metadata: {
        importance: 0.4,
        utility: 0.3,
        evergreen: true,
        pinned: true,
        recencyNoisePenalty: 0.1,
        governanceStatus: "active",
      },
    }));

    const ranked = service.rank([persona, graph]);

    expect(ranked.find((item) => item.id === "persona-procedure")?.components.halfLifeDays).toBe(30);
    expect(ranked.find((item) => item.id === "persona-procedure")?.whyIncluded).toContain("type=procedure");
    expect(ranked.find((item) => item.id === "metadata-graph")?.whyIncluded).toContain("evergreen");
    expect(ranked.find((item) => item.id === "metadata-graph")?.whyIncluded).toContain("pinned");
  });

  test("clamps invalid numeric score components and ignores invalid fact metadata", () => {
    const service = new MemoryRankingService({ now: () => NOW });
    const invalidMetadata = candidateFromFact(makeFact("invalid-metadata", {
      metadata: {
        confidence: Number.POSITIVE_INFINITY,
        importance: "high",
        utility: "useful",
        evergreen: "yes",
        pinned: "no",
        recencyNoisePenalty: "none",
        governanceStatus: "unknown",
      },
    }));
    const ranked = service.rank([
      invalidMetadata,
      makeCandidate("nonfinite", {
        importance: Number.POSITIVE_INFINITY,
        utility: 2,
        confidence: -1,
        recencyNoisePenalty: Number.POSITIVE_INFINITY,
      }),
    ]);

    const byId = new Map(ranked.map((item) => [item.id, item]));
    expect(byId.get("invalid-metadata")?.components.importance).toBe(0.7);
    expect(byId.get("invalid-metadata")?.evergreen).toBe(false);
    expect(byId.get("nonfinite")?.components.importance).toBe(0);
    expect(byId.get("nonfinite")?.components.utility).toBe(1);
    expect(byId.get("nonfinite")?.components.confidence).toBe(0);
    expect(byId.get("nonfinite")?.components.recencyNoisePenalty).toBe(0);
  });
});

function makeFact(
  uuid: string,
  overrides: Partial<Parameters<typeof Fact.create>[0]> = {},
): Fact {
  return Fact.create({
    uuid,
    type: "decision",
    project: "memory-nexus",
    content: `Fact ${uuid}`,
    observedAt: NOW,
    ...overrides,
  });
}

function makeGraph(edgeId: string, overrides: Partial<Parameters<typeof GraphEdge.create>[0]> = {}): GraphEdge {
  return GraphEdge.create({
    edgeId,
    source: { type: "tool", id: "memory", label: "memory" },
    target: { type: "capability", id: "authkey", label: "authkey" },
    relationship: "uses",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: [`fact-${edgeId}`],
    sourceKinds: ["decision"],
    confidence: 0.9,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    why: "Graph edge for ranking.",
    metadata: undefined,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function makePersona(entryId: string): PersonaEntry {
  return PersonaEntry.create({
    entryId,
    kind: "procedure",
    content: "Use the repo planning files before implementation.",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: [`evt-${entryId}`],
    sourceKinds: ["preference"],
    confidence: 0.85,
    scope: { visibility: "project", project: "memory-nexus" },
    reviewStatus: "reviewed",
    reviewAfter: new Date("2026-07-07T00:00:00.000Z"),
    why: "Repeated project behavior.",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makeMetric(
  surface: Parameters<typeof MemoryUtilityMetric.create>[0]["surface"],
  targetId: string,
  overrides: Partial<Parameters<typeof MemoryUtilityMetric.create>[0]> = {},
): MemoryUtilityMetric {
  return MemoryUtilityMetric.create({
    surface,
    targetId,
    project: "memory-nexus",
    accessCount: 0,
    lastAccessedAt: null,
    lastRankedAt: null,
    utilityScore: 0.5,
    importanceScore: 0.5,
    evergreen: false,
    pinned: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function makeCandidate(id: string, overrides: Partial<MemoryRankCandidate> = {}): MemoryRankCandidate {
  return {
    id,
    kind: "fact" as const,
    memoryType: "decision",
    content: `Candidate ${id}`,
    project: "memory-nexus",
    observedAt: NOW,
    confidence: 0.8,
    importance: 0.5,
    utility: 0.5,
    governanceStatus: "active" as const,
    ...overrides,
  };
}
