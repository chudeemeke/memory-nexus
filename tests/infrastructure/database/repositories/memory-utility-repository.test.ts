import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { MemoryUtilityMetric } from "../../../../src/domain/entities/memory-utility-metric.js";
import { initializeDatabase } from "../../../../src/infrastructure/database/connection.js";
import { SqliteMemoryUtilityRepository } from "../../../../src/infrastructure/database/repositories/memory-utility-repository.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("SqliteMemoryUtilityRepository", () => {
  let db: Database;
  let repo: SqliteMemoryUtilityRepository;

  beforeEach(() => {
    const initialized = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
    db = initialized.db;
    repo = new SqliteMemoryUtilityRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  test("saves, upserts, and reads utility metrics by governed memory target", async () => {
    await repo.save(makeMetric("fact", "fact-1", { utilityScore: 0.4 }));
    await repo.save(makeMetric("fact", "fact-1", {
      utilityScore: 0.9,
      importanceScore: 0.8,
      evergreen: true,
      metadata: { source: "manual" },
    }));

    const found = await repo.findByTarget("fact", "fact-1");
    const count = db.prepare("SELECT COUNT(*) AS count FROM memory_utility_metrics").get() as { count: number };

    expect(count.count).toBe(1);
    expect(found?.utilityScore).toBe(0.9);
    expect(found?.importanceScore).toBe(0.8);
    expect(found?.evergreen).toBe(true);
    expect(found?.metadata).toEqual({ source: "manual" });
  });

  test("recordAccess increments access count and supports batch lookup", async () => {
    await repo.save(makeMetric("persona", "profile-1", { accessCount: 1 }));
    await repo.save(makeMetric("graph", "edge-1", { accessCount: 0 }));

    const updated = await repo.recordAccess("persona", "profile-1", NOW);
    const created = await repo.recordAccess("dream", "dream-1", NOW);
    const found = await repo.findByTargetIds("persona", ["profile-1", "missing"]);

    expect(updated.accessCount).toBe(2);
    expect(updated.lastAccessedAt?.toISOString()).toBe(NOW.toISOString());
    expect(created.surface).toBe("dream");
    expect(created.accessCount).toBe(1);
    expect(found.map((metric) => metric.targetId)).toEqual(["profile-1"]);
  });

  test("deleteByProject and clearAll remove only intended utility metrics", async () => {
    await repo.save(makeMetric("fact", "memory-fact", { project: "memory-nexus" }));
    await repo.save(makeMetric("fact", "authkey-fact", { project: "authkey" }));
    await repo.save(makeMetric("graph", "global-edge", { project: undefined }));

    await repo.deleteByProject("memory-nexus");
    expect(await repo.findByTarget("fact", "memory-fact")).toBeNull();
    expect(await repo.findByTarget("fact", "authkey-fact")).not.toBeNull();
    expect(await repo.findByTarget("graph", "global-edge")).not.toBeNull();

    await repo.clearAll();
    expect(await repo.findByTarget("fact", "authkey-fact")).toBeNull();
    expect(await repo.findByTarget("graph", "global-edge")).toBeNull();
  });
});

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
