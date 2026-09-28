import { expect, test } from "bun:test";
import { ExtractionBatch, type ExtractionBatchRecord } from "./extraction-batch.js";

function valid(): ExtractionBatchRecord {
  return {
    version: 1, sessionId: "synthetic-session", inputIdentity: "v1:" + "a".repeat(64),
    project: "synthetic", provider: "synthetic", model: "synthetic-model", extractedAt: "2026-09-28T10:00:00.000Z",
    result: { added: 3, updated: 2, superseded: 2, skipped: 1 },
    facts: [
      { uuid: "a", type: "learning", content: "alpha", metadata: { confidence: 0.9, labels: [null, true, 1, "synthetic"] } },
      { uuid: "b", type: "decision", content: "beta" },
      { uuid: "ab", type: "supersedence", content: "replace alpha", metadata: { superseded_uuid: "a", superseded_by_uuid: "b" } },
      { uuid: "c", type: "preference", content: "gamma" },
      { uuid: "bc", type: "supersedence", content: "replace beta", metadata: { superseded_uuid: "b", superseded_by_uuid: "c" } },
    ],
  };
}

test("batch descriptor round-trips ordered effects and outcome without aliasing", () => {
  const input = valid(), batch = ExtractionBatch.fromJSON(input);
  expect(batch.toJSON()).toEqual(input);
  input.facts[0]!.content = "changed input";
  const output = batch.toJSON(); output.facts[0]!.content = "changed output";
  expect(batch.toJSON().facts[0]!.content).toBe("alpha");
  expect(ExtractionBatch.fromJSON(JSON.parse(JSON.stringify(batch.toJSON()))).toJSON()).toEqual(batch.toJSON());
});

test("batch descriptor permits no effects for empty or duplicate-only extraction", () => {
  for (const skipped of [0, 3]) {
    const input = { ...valid(), facts: [], result: { added: 0, updated: 0, superseded: 0, skipped } };
    expect(ExtractionBatch.fromJSON(input).toJSON()).toEqual(input);
  }
});

test("batch descriptor permits an external target but preserves its identity for admitted validation", () => {
  const input = valid(); input.facts = input.facts.slice(0, 3); input.facts[2]!.metadata = { superseded_uuid: "external", superseded_by_uuid: "b" };
  input.result = { added: 2, updated: 1, superseded: 1, skipped: 0 };
  expect(ExtractionBatch.fromJSON(input).toJSON()).toEqual(input);
});

type Mutation = (value: any) => void;
const invalid: Array<[string, Mutation]> = [
  ["version", x => { x.version = 2; }],
  ["missing version", x => { delete x.version; }],
  ["unknown top field", x => { x.batchId = "competing identity"; }],
  ["session", x => { x.sessionId = " "; }],
  ["project", x => { x.project = 2; }],
  ["provider", x => { delete x.provider; }],
  ["model", x => { x.model = null; }],
  ["identity version", x => { x.inputIdentity = "v2:" + "a".repeat(64); }],
  ["identity case", x => { x.inputIdentity = "v1:" + "A".repeat(64); }],
  ["identity type", x => { x.inputIdentity = true; }],
  ["timestamp type", x => { x.extractedAt = 1; }],
  ["timestamp invalid", x => { x.extractedAt = "not a date"; }],
  ["timestamp noncanonical", x => { x.extractedAt = "2026-09-28T10:00:00Z"; }],
  ["facts shape", x => { x.facts = {}; }],
  ["fact shape", x => { x.facts[0] = []; }],
  ["fact null", x => { x.facts[0] = null; }],
  ["fact primitive", x => { x.facts[0] = "SYNTHETIC_PRIVATE"; }],
  ["fact unknown field", x => { x.facts[0].project = "other-project"; }],
  ["fact identity", x => { x.facts[0].uuid = ""; }],
  ["fact content", x => { x.facts[0].content = false; }],
  ["control effect", x => { x.facts[0].type = "governance"; }],
  ["type shape", x => { x.facts[0].type = 1; }],
  ["duplicate ID", x => { x.facts = [x.facts[0], { ...x.facts[0] }]; x.result = { added: 2, updated: 0, superseded: 0, skipped: 0 }; }],
  ["metadata array", x => { x.facts[0].metadata = []; }],
  ["metadata null", x => { x.facts[0].metadata = null; }],
  ["result shape", x => { x.result = []; }],
  ["result missing", x => { delete x.result; }],
  ["result unknown", x => { x.result.skippedSession = false; }],
  ["missing count", x => { delete x.result.skipped; }],
  ["negative count", x => { x.result.skipped = -1; }],
  ["fractional count", x => { x.result.skipped = 0.5; }],
  ["string count", x => { x.result.skipped = "1"; }],
  ["unsafe count", x => { x.result.skipped = Number.MAX_SAFE_INTEGER + 1; }],
  ["unsafe total", x => { x.result.skipped = Number.MAX_SAFE_INTEGER; }],
  ["added mismatch", x => { x.result.added = 4; }],
  ["updated mismatch", x => { x.result.updated = 1; }],
  ["superseded mismatch", x => { x.result.superseded = 3; }],
  ["missing supersedence metadata", x => { delete x.facts[2].metadata; }],
  ["missing target", x => { delete x.facts[2].metadata.superseded_uuid; }],
  ["missing replacement", x => { delete x.facts[2].metadata.superseded_by_uuid; }],
  ["self supersedence", x => { x.facts[2].metadata.superseded_uuid = "b"; }],
  ["absent replacement", x => { x.facts[2].metadata.superseded_by_uuid = "external"; }],
  ["forward replacement", x => { x.facts[2].metadata.superseded_by_uuid = "c"; }],
  ["forward target", x => { x.facts[2].metadata.superseded_uuid = "c"; }],
  ["duplicate supersedence", x => { x.facts[4].metadata.superseded_uuid = "a"; }],
  ["control target", x => { x.facts[4].metadata.superseded_uuid = "ab"; }],
  ["control replacement", x => { x.facts[4].metadata.superseded_by_uuid = "ab"; }],
  ["retired replacement", x => { x.facts[4].metadata.superseded_by_uuid = "a"; }],
  ["reused replacement", x => { x.facts[4].metadata = { superseded_uuid: "external", superseded_by_uuid: "b" }; }],
  ["undefined metadata value", x => { x.facts[0].metadata.bad = undefined; }],
  ["nonfinite metadata", x => { x.facts[0].metadata.bad = Infinity; }],
  ["nan metadata", x => { x.facts[0].metadata.bad = NaN; }],
  ["negative zero metadata", x => { x.facts[0].metadata.bad = -0; }],
  ["bigint metadata", x => { x.facts[0].metadata.bad = 1n; }],
  ["symbol metadata", x => { x.facts[0].metadata.bad = Symbol("synthetic"); }],
  ["function metadata", x => { x.facts[0].metadata.bad = () => "SYNTHETIC_PRIVATE"; }],
  ["date metadata", x => { x.facts[0].metadata.bad = new Date(0); }],
  ["cycle metadata", x => { x.facts[0].metadata.bad = x; }],
  ["sparse array", x => { x.facts[0].metadata.bad = new Array(2); }],
  ["array extra field", x => { const a: any = []; a.bad = "hidden"; x.facts[0].metadata.bad = a; }],
  ["array hidden field instead of index", x => { const a: any = new Array(1); a.bad = "hidden"; x.facts[0].metadata.bad = a; }],
  ["array out of range numeric field", x => { const a: any = new Array(1); a["999999999999"] = "hidden"; x.facts[0].metadata.bad = a; }],
  ["symbol key", x => { x.facts[0].metadata[Symbol("hidden")] = "hidden"; }],
  ["nonenumerable key", x => { Object.defineProperty(x.facts[0].metadata, "hidden", { value: "hidden" }); }],
  ["getter", x => { Object.defineProperty(x.facts[0].metadata, "hidden", { enumerable: true, get() { throw Error("SYNTHETIC_PRIVATE getter ran"); } }); }],
  ["array subclass", x => { x.facts[0].metadata.bad = new (class extends Array {})(); }],
  ["metadata depth", x => { let v: any = {}; x.facts[0].metadata.bad = v; for (let i = 0; i < 61; i++) { v.next = {}; v = v.next; } }],
];

for (const [name, mutate] of invalid) test(`batch descriptor refuses ${name} without exposing content`, () => {
  const input = valid(); mutate(input);
  let error: unknown; try { ExtractionBatch.fromJSON(input); } catch (cause) { error = cause; }
  expect(error).toBeInstanceOf(Error); expect(String(error)).toContain("Invalid extraction batch"); expect(String(error)).not.toContain("SYNTHETIC_PRIVATE");
});

for (const input of [null, false, 1, "synthetic", []]) test(`batch descriptor refuses top-level ${JSON.stringify(input)}`, () => {
  expect(() => ExtractionBatch.fromJSON(input)).toThrow("Invalid extraction batch");
});

test("batch descriptor preserves repeated references as independent JSON data", () => {
  const input = valid(), shared = Object.assign(Object.create(null), { value: "synthetic" });
  input.facts[0]!.metadata = { labels: [shared, shared] } as any;
  expect(ExtractionBatch.fromJSON(input).toJSON().facts[0]!.metadata).toEqual({ labels: [{ value: "synthetic" }, { value: "synthetic" }] });
});

test("batch descriptor accepts the exact maximum object depth", () => {
  const input = valid(); let value: Record<string, unknown> = {};
  input.facts[0]!.metadata!.nested = value;
  // Root0 -> facts1 -> fact2 -> metadata3 -> nested4 -> sixty more objects64.
  for (let i = 0; i < 60; i++) { const next = {}; value.next = next; value = next; }
  expect(ExtractionBatch.fromJSON(input).toJSON()).toEqual(input);
});
