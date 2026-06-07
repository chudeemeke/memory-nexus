import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { initializeDatabase } from "../../../../src/infrastructure/database/connection.js";
import { SqliteGraphRepository } from "../../../../src/infrastructure/database/repositories/graph-repository.js";
import { GraphEdge } from "../../../../src/domain/entities/graph-edge.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("SqliteGraphRepository", () => {
  let db: Database;
  let repo: SqliteGraphRepository;

  beforeEach(() => {
    const initialized = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
    db = initialized.db;
    repo = new SqliteGraphRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  test("saves, upserts, and reads graph edges with temporal metadata", async () => {
    await repo.save(makeEdge("memory-authkey", { confidence: 0.82 }));
    await repo.save(makeEdge("memory-authkey", {
      relationship: "requires_capability",
      confidence: 0.91,
      metadata: { replacement: true },
    }));

    const found = await repo.findByEdgeId("memory-authkey");
    const count = db.prepare("SELECT COUNT(*) AS count FROM graph_edges").get() as { count: number };

    expect(count.count).toBe(1);
    expect(found?.relationship).toBe("requires_capability");
    expect(found?.confidence).toBe(0.91);
    expect(found?.metadata).toEqual({ replacement: true });
  });

  test("findCurrent enforces valid range, confidence, scope, node, relationship, ordering, and limit", async () => {
    await repo.saveMany([
      makeEdge("current-high", { confidence: 0.95, target: node("capability", "authkey") }),
      makeEdge("current-low", { confidence: 0.71, target: node("capability", "authkey") }),
      makeEdge("low-confidence", { confidence: 0.2, target: node("capability", "authkey") }),
      makeEdge("stale", { target: node("capability", "authkey"), validTo: new Date("2026-05-30T00:00:00.000Z") }),
      makeEdge("future", { target: node("capability", "authkey"), validFrom: new Date("2026-06-08T00:00:00.000Z") }),
      makeEdge("other-project", { project: "authkey", target: node("capability", "authkey") }),
      makeEdge("global-current", { project: undefined, visibility: "global", target: node("capability", "authkey") }),
      makeEdge("other-node", { target: node("file", "README.md") }),
    ]);

    const current = await repo.findCurrent({
      project: "memory-nexus",
      includeGlobal: true,
      nodeId: "authkey",
      relationship: "uses",
      asOf: NOW,
      minConfidence: 0.7,
      limit: 3,
    });

    expect(current.map((edge) => edge.edgeId)).toEqual(["current-high", "global-current", "current-low"]);
  });

  test("findCurrent supports default options and project-only scope filtering", async () => {
    await repo.saveMany([
      makeEdge("local-high", { confidence: 0.96 }),
      makeEdge("local-low", { confidence: 0.72 }),
      makeEdge("global-edge", { project: undefined, visibility: "global", confidence: 0.94 }),
      makeEdge("workspace-edge", { project: undefined, visibility: "workspace", confidence: 0.93 }),
      makeEdge("other-project", { project: "authkey", confidence: 0.95 }),
      makeEdge("other-relationship", { relationship: "optional", confidence: 0.97 }),
    ]);

    const defaults = await repo.findCurrent();
    expect(defaults.map((edge) => edge.edgeId)).toContain("local-high");
    expect(defaults.map((edge) => edge.edgeId)).toContain("global-edge");
    expect(defaults.map((edge) => edge.edgeId)).toContain("workspace-edge");

    const projectOnly = await repo.findCurrent({
      project: "memory-nexus",
      includeGlobal: false,
      relationship: "uses",
      asOf: NOW,
    });

    expect(projectOnly.map((edge) => edge.edgeId)).toEqual(["local-high", "local-low"]);
    expect(projectOnly.map((edge) => edge.edgeId)).not.toContain("global-edge");
    expect(projectOnly.map((edge) => edge.edgeId)).not.toContain("workspace-edge");
    expect(projectOnly.map((edge) => edge.edgeId)).not.toContain("other-relationship");
  });

  test("pruneStale removes only edges closed before cutoff", async () => {
    await repo.saveMany([
      makeEdge("old", {
        validFrom: new Date("2026-03-01T00:00:00.000Z"),
        validTo: new Date("2026-04-01T00:00:00.000Z"),
      }),
      makeEdge("recent", { validTo: new Date("2026-06-01T00:00:00.000Z") }),
      makeEdge("current"),
    ]);

    const pruned = await repo.pruneStale(new Date("2026-05-01T00:00:00.000Z"));

    expect(pruned).toBe(1);
    expect((await repo.findCurrent({ asOf: NOW, minConfidence: 0 })).map((edge) => edge.edgeId)).toEqual(["current"]);
    expect(await repo.findByEdgeId("recent")).not.toBeNull();
  });

  test("deleteByProject and clearAll remove derived graph projections without touching other scopes", async () => {
    await repo.save(makeEdge("memory-edge", { project: "memory-nexus" }));
    await repo.save(makeEdge("authkey-edge", { project: "authkey" }));
    await repo.save(makeEdge("global-edge", { project: undefined, visibility: "global" }));

    await repo.deleteByProject("memory-nexus");
    expect((await repo.findCurrent({ project: "memory-nexus", asOf: NOW })).map((edge) => edge.edgeId))
      .toEqual(["global-edge"]);

    await repo.clearAll();
    expect(await repo.findCurrent({ asOf: NOW })).toEqual([]);
  });
});

function makeEdge(
  edgeId: string,
  overrides: Partial<Parameters<typeof GraphEdge.create>[0]> = {},
): GraphEdge {
  return GraphEdge.create({
    edgeId,
    source: node("tool", "memory"),
    target: node("capability", edgeId),
    relationship: "uses",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: [`fact-${edgeId}`],
    sourceKinds: ["decision"],
    confidence: 0.9,
    validFrom: new Date("2026-05-01T00:00:00.000Z"),
    why: `Derived test edge ${edgeId}.`,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function node(type: Parameters<typeof GraphEdge.create>[0]["source"]["type"], id: string) {
  return { type, id, label: id };
}
