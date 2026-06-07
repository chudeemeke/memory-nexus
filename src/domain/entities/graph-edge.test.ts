import { describe, expect, test } from "bun:test";
import { GraphEdge } from "./graph-edge.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("GraphEdge", () => {
  test("creates a provenance-backed temporal graph edge with stable JSON", () => {
    const edge = GraphEdge.create({
      edgeId: "memory-authkey-capability",
      source: { type: "tool", id: "memory", label: "memory" },
      target: { type: "capability", id: "authkey", label: "authkey" },
      relationship: "optional-capability-provider",
      project: "memory-nexus",
      visibility: "project",
      sourceEventIds: ["fact-1"],
      sourceKinds: ["decision"],
      confidence: 0.91,
      validFrom: new Date("2026-05-27T00:00:00.000Z"),
      why: "Derived from optional capability integration decision.",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(edge.edgeId).toBe("memory-authkey-capability");
    expect(edge.isCurrent(new Date("2026-06-01T00:00:00.000Z"), 0.7)).toBe(true);
    expect(edge.controls).toEqual(["suppress", "invalidate", "expire", "review"]);
    expect(edge.toJSON()).toMatchObject({
      edge_id: "memory-authkey-capability",
      source: { type: "tool", id: "memory", label: "memory" },
      target: { type: "capability", id: "authkey", label: "authkey" },
      relationship: "optional-capability-provider",
      project: "memory-nexus",
      visibility: "project",
      confidence: 0.91,
      source_event_ids: ["fact-1"],
    });
  });

  test("derives deterministic edge ids when callers do not provide one", () => {
    const params = {
      source: { type: "project" as const, id: "memory", label: "memory" },
      target: { type: "tool" as const, id: "authkey", label: "authkey" },
      relationship: "uses",
      project: "memory-nexus",
      visibility: "project" as const,
      sourceEventIds: ["fact-1"],
      sourceKinds: ["decision"],
      confidence: 0.8,
      validFrom: NOW,
      why: "Stable id check.",
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(GraphEdge.create(params).edgeId).toBe(GraphEdge.create(params).edgeId);
  });

  test("serializes global edges, ids, metadata, validTo, and defensive copies", () => {
    const edge = makeEdge({
      edgeId: "global-edge",
      project: undefined,
      visibility: "global",
      metadata: { nested: { value: "original" } },
      validTo: new Date("2026-07-01T00:00:00.000Z"),
    }).withId(42);

    const source = edge.source;
    source.id = "mutated";
    const metadata = edge.metadata as { nested: { value: string } };
    metadata.nested.value = "mutated";

    expect(edge.id).toBe(42);
    expect(edge.source.id).toBe("memory");
    expect(edge.metadata).toEqual({ nested: { value: "original" } });
    expect(edge.isCurrent(NOW)).toBe(true);
    expect(edge.toJSON()).toMatchObject({
      id: 42,
      edge_id: "global-edge",
      visibility: "global",
      valid_to: "2026-07-01T00:00:00.000Z",
      metadata: { nested: { value: "original" } },
      scope: { visibility: "global" },
    });
    expect(edge.toJSON()).not.toHaveProperty("project");
  });

  test("currentness excludes future, stale, and low-confidence edges", () => {
    const edge = makeEdge({
      confidence: 0.75,
      validFrom: new Date("2026-05-01T00:00:00.000Z"),
      validTo: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(edge.isCurrent(new Date("2026-04-30T00:00:00.000Z"), 0.7)).toBe(false);
    expect(edge.isCurrent(new Date("2026-05-15T00:00:00.000Z"), 0.8)).toBe(false);
    expect(edge.isCurrent(new Date("2026-06-07T00:00:00.000Z"), 0.7)).toBe(false);
  });

  test("validates taxonomy, scope, provenance, confidence, and temporal invariants", () => {
    expect(() => makeEdge({ source: { type: "unknown" as any, id: "x", label: "x" } }))
      .toThrow("Invalid graph node type");
    expect(() => makeEdge({ target: { type: "unknown" as any, id: "x", label: "x" } }))
      .toThrow("Invalid graph node type");
    expect(() => makeEdge({ source: { type: "project", id: "", label: "x" } }))
      .toThrow("source.id is required");
    expect(() => makeEdge({ target: { type: "tool", id: "x", label: "" } }))
      .toThrow("target.label is required");
    expect(() => makeEdge({ relationship: "not a relation" })).toThrow("Invalid graph relationship");
    expect(() => makeEdge({ confidence: 1.2 })).toThrow("Graph edge confidence");
    expect(() => makeEdge({ confidence: -0.1 })).toThrow("Graph edge confidence");
    expect(() => makeEdge({ confidence: Number.NaN })).toThrow("Graph edge confidence");
    expect(() => makeEdge({ sourceEventIds: [] })).toThrow("sourceEventIds");
    expect(() => makeEdge({ sourceKinds: [] })).toThrow("sourceKinds");
    expect(() => makeEdge({ why: "" })).toThrow("Graph edge why");
    expect(() => makeEdge({ project: undefined, visibility: "project" })).toThrow("project is required");
    expect(() => makeEdge({ visibility: "team" as any })).toThrow("Invalid graph visibility");
    expect(() => makeEdge({ validFrom: new Date("not a date") })).toThrow("validFrom");
    expect(() => makeEdge({ validTo: new Date("not a date") })).toThrow("validTo must be a valid date");
    expect(() => makeEdge({ createdAt: new Date("not a date") })).toThrow("timestamps must be valid dates");
    expect(() => makeEdge({
      validFrom: new Date("2026-06-07T00:00:00.000Z"),
      validTo: new Date("2026-06-06T00:00:00.000Z"),
    })).toThrow("validTo must be after validFrom");
  });
});

function makeEdge(overrides: Partial<Parameters<typeof GraphEdge.create>[0]> = {}): GraphEdge {
  return GraphEdge.create({
    edgeId: "edge-test",
    source: { type: "project", id: "memory", label: "memory" },
    target: { type: "tool", id: "authkey", label: "authkey" },
    relationship: "uses",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: ["fact-1"],
    sourceKinds: ["decision"],
    confidence: 0.9,
    validFrom: new Date("2026-05-01T00:00:00.000Z"),
    why: "Test edge.",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}
