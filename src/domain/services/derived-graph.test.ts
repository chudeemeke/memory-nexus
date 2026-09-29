import { expect, it } from "bun:test";
import { GraphEdge, type GraphEdgeParams } from "../entities/graph-edge.js";
import { mergeDerivedGraph } from "./derived-graph.js";

function edge(overrides: Partial<GraphEdgeParams> = {}) {
  return GraphEdge.create({ edgeId: "edge", source: { type: "project", id: "source", label: "Source" }, target: { type: "tool", id: "target", label: "Target" },
    relationship: "uses", project: "synthetic", visibility: "project", sourceEventIds: ["first"], sourceKinds: ["learning"], confidence: 0.8,
    validFrom: new Date("2026-09-28"), why: "synthetic", createdAt: new Date("2026-09-28"), updatedAt: new Date("2026-09-28"), ...overrides });
}

it("new derived graph binds source without changing the input", () => {
  const original = edge(), result = mergeDerivedGraph(null, original, ["batch", "first"]);
  expect(result.sourceEventIds).toEqual(["first", "batch"]); expect(original.sourceEventIds).toEqual(["first"]);
  expect(result.validTo).toBeNull(); expect(result.createdAt).toEqual(original.createdAt);
});

it("shared edge preserves identity while annotations evolve and provenance accumulates", () => {
  const first = edge(), incoming = edge({ source: { ...first.source, label: "Updated label" }, sourceEventIds: ["second"], sourceKinds: ["preference"], confidence: 0.9, metadata: { annotation: "new" }, updatedAt: new Date("2026-09-29") });
  const result = mergeDerivedGraph(first, incoming, ["batch"]);
  expect(result.sourceEventIds).toEqual(["first", "second", "batch"]); expect(result.sourceKinds).toEqual(["learning", "preference"]);
  expect(result.source.label).toBe("Updated label"); expect(result.confidence).toBe(0.9); expect(result.metadata).toEqual({ annotation: "new" });
  expect(result.updatedAt).toEqual(incoming.updatedAt); expect(result.createdAt).toEqual(first.createdAt);
});

const conflicts: Partial<GraphEdgeParams>[] = [{ edgeId: "other" }, { source: { type: "tool", id: "source", label: "Source" } },
  { source: { type: "project", id: "other", label: "Source" } }, { target: { type: "project", id: "target", label: "Target" } },
  { target: { type: "tool", id: "other", label: "Target" } }, { relationship: "avoids" }, { project: "other" }, { visibility: "global" }];
for (const [i, conflict] of conflicts.entries()) it(`shared graph refuses identity conflict ${i}`, () => {
  expect(() => mergeDerivedGraph(edge(), edge(conflict), [])).toThrow("identity conflict");
});

for (const [a, b, expected] of [[null, null, null], ["2026-10-01", null, "2026-10-01"], [null, "2026-10-01", "2026-10-01"], ["2026-10-02", "2026-10-01", "2026-10-01"], ["2026-10-01", "2026-10-02", "2026-10-01"]] as const) it(`shared edge keeps overlap when endpoints are ${a} and ${b}`, () => {
  const first = edge({ validTo: a ? new Date(a) : null }), second = edge({ validTo: b ? new Date(b) : null });
  const result = mergeDerivedGraph(first, second, []); expect(result.validTo).toEqual(expected ? new Date(expected) : null);
});

for (const reverse of [false, true]) it(`shared edge validity starts at the later bound reverse=${reverse}`, () => {
  const a = edge(), b = edge({ validFrom: new Date("2026-09-29") });
  expect(mergeDerivedGraph(reverse ? b : a, reverse ? a : b, []).validFrom).toEqual(b.validFrom);
});

it("disjoint shared edge validity refuses rather than resurrecting an expired edge", () => {
  expect(() => mergeDerivedGraph(edge({ validTo: new Date("2026-09-29") }), edge({ validFrom: new Date("2026-09-30") }), [])).toThrow("validTo must be after validFrom");
});
