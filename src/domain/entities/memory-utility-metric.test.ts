import { describe, expect, test } from "bun:test";
import { MemoryUtilityMetric } from "./memory-utility-metric.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("MemoryUtilityMetric", () => {
  test("tracks utility and access metadata for any governed memory surface", () => {
    const metric = MemoryUtilityMetric.create({
      surface: "fact",
      targetId: "fact-1",
      project: "memory-nexus",
      accessCount: 3,
      lastAccessedAt: new Date("2026-06-06T00:00:00.000Z"),
      lastRankedAt: NOW,
      utilityScore: 0.72,
      importanceScore: 0.8,
      evergreen: true,
      pinned: false,
      halfLifeDays: 365,
      metadata: { source: "context" },
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(metric.surface).toBe("fact");
    expect(metric.targetId).toBe("fact-1");
    expect(metric.controls).toEqual(["record_access", "rank", "pin", "mark_evergreen"]);
    expect(metric.toJSON()).toMatchObject({
      surface: "fact",
      target_id: "fact-1",
      project: "memory-nexus",
      access_count: 3,
      utility_score: 0.72,
      importance_score: 0.8,
      evergreen: true,
      pinned: false,
      half_life_days: 365,
      metadata: { source: "context" },
    });
  });

  test("recordAccess returns a new metric with incremented count and updated timestamps", () => {
    const metric = makeMetric({ accessCount: 1, lastAccessedAt: null });
    const accessed = metric.recordAccess(NOW);

    expect(accessed).not.toBe(metric);
    expect(accessed.accessCount).toBe(2);
    expect(accessed.lastAccessedAt?.toISOString()).toBe(NOW.toISOString());
    expect(accessed.updatedAt.toISOString()).toBe(NOW.toISOString());
  });

  test("defaults optional fields and omits absent JSON fields", () => {
    const metric = MemoryUtilityMetric.create({
      surface: "dream",
      targetId: "dream-1",
      project: "   ",
    });

    expect(metric.id).toBeUndefined();
    expect(metric.project).toBeUndefined();
    expect(metric.metadata).toBeUndefined();
    expect(metric.accessCount).toBe(0);
    expect(metric.lastAccessedAt).toBeNull();
    expect(metric.lastRankedAt).toBeNull();
    expect(metric.utilityScore).toBe(0.5);
    expect(metric.importanceScore).toBe(0.5);
    expect(metric.evergreen).toBe(false);
    expect(metric.pinned).toBe(false);
    expect(metric.halfLifeDays).toBeNull();
    expect(metric.createdAt).toBeInstanceOf(Date);
    expect(metric.updatedAt).toBeInstanceOf(Date);
    expect(metric.toJSON()).not.toHaveProperty("id");
    expect(metric.toJSON()).not.toHaveProperty("project");
    expect(metric.toJSON()).not.toHaveProperty("metadata");
  });

  test("withId and markRanked preserve immutable state while exposing ranked timestamp JSON", () => {
    const metric = makeMetric({ metadata: undefined, project: undefined });
    const ranked = metric.withId(7).markRanked(NOW);

    expect(ranked.id).toBe(7);
    expect(ranked.lastRankedAt?.toISOString()).toBe(NOW.toISOString());
    expect(ranked.updatedAt.toISOString()).toBe(NOW.toISOString());
    expect(ranked.toJSON()).toMatchObject({
      id: 7,
      last_ranked_at: NOW.toISOString(),
    });
  });

  test("validates surface, target, scores, counts, and half-life", () => {
    expect(() => makeMetric({ surface: "unknown" as any })).toThrow("Invalid utility surface");
    expect(() => makeMetric({ targetId: "" })).toThrow("targetId cannot be empty");
    expect(() => makeMetric({ accessCount: -1 })).toThrow("accessCount");
    expect(() => makeMetric({ accessCount: 1.5 })).toThrow("accessCount");
    expect(() => makeMetric({ utilityScore: -0.1 })).toThrow("utilityScore");
    expect(() => makeMetric({ utilityScore: 1.2 })).toThrow("utilityScore");
    expect(() => makeMetric({ importanceScore: Number.NaN })).toThrow("importanceScore");
    expect(() => makeMetric({ halfLifeDays: Number.NaN })).toThrow("halfLifeDays");
    expect(() => makeMetric({ halfLifeDays: 0 })).toThrow("halfLifeDays");
    expect(() => makeMetric({ lastAccessedAt: new Date("invalid") })).toThrow("lastAccessedAt");
    expect(() => makeMetric({ lastRankedAt: new Date("invalid") })).toThrow("lastRankedAt");
    expect(() => makeMetric({ createdAt: new Date("invalid") })).toThrow("createdAt");
    expect(() => makeMetric({ updatedAt: new Date("invalid") })).toThrow("updatedAt");
  });
});

function makeMetric(overrides: Partial<Parameters<typeof MemoryUtilityMetric.create>[0]> = {}): MemoryUtilityMetric {
  return MemoryUtilityMetric.create({
    surface: "fact",
    targetId: "fact-1",
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
