import { describe, expect, test } from "bun:test";
import { PersonaEntry } from "./persona-entry.js";
import type { PersonaEntryParams } from "./persona-entry.js";

describe("PersonaEntry", () => {
  test("creates provenance-backed persona entries with review controls", () => {
    const entry = PersonaEntry.create({
      entryId: "persona-preference-1",
      kind: "preference",
      content: "Prefer durable disk artifacts for continuity work.",
      project: "memory-nexus",
      visibility: "project",
      sourceEventIds: ["evt-1"],
      sourceKinds: ["preference"],
      confidence: 0.91,
      scope: { project: "memory-nexus", visibility: "project" },
      reviewStatus: "pending_review",
      reviewAfter: new Date("2026-07-07T00:00:00.000Z"),
      why: "Derived from an active preference fact.",
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(entry.entryId).toBe("persona-preference-1");
    expect(entry.controls).toEqual(["suppress", "invalidate", "expire", "review"]);
    expect(entry.toJSON()).toEqual({
      entry_id: "persona-preference-1",
      kind: "preference",
      content: "Prefer durable disk artifacts for continuity work.",
      project: "memory-nexus",
      visibility: "project",
      source_event_ids: ["evt-1"],
      source_kinds: ["preference"],
      confidence: 0.91,
      scope: { project: "memory-nexus", visibility: "project" },
      review_status: "pending_review",
      review_after: "2026-07-07T00:00:00.000Z",
      expires_at: null,
      why: "Derived from an active preference fact.",
      controls: ["suppress", "invalidate", "expire", "review"],
      created_at: "2026-06-07T00:00:00.000Z",
      updated_at: "2026-06-07T00:00:00.000Z",
    });
  });

  test("rejects entries without provenance, scope, review metadata, or valid confidence", () => {
    const invalidCases: Array<[Partial<PersonaEntryParams>, string]> = [
      [{ entryId: " " }, "entryId"],
      [{ kind: "bad-kind" as PersonaEntryParams["kind"] }, "Invalid persona kind"],
      [{ content: " " }, "content"],
      [{ project: undefined }, "project is required"],
      [{ sourceEventIds: [] }, "sourceEventIds"],
      [{ sourceKinds: [] }, "sourceKinds"],
      [{ confidence: Number.NaN }, "confidence"],
      [{ confidence: -0.1 }, "confidence"],
      [{ confidence: 1.2 }, "confidence"],
      [{ scope: undefined as unknown as PersonaEntryParams["scope"] }, "scope"],
      [{ reviewStatus: "stale" as PersonaEntryParams["reviewStatus"] }, "reviewStatus"],
      [{ reviewAfter: new Date("invalid") }, "reviewAfter"],
      [{ why: " " }, "why"],
    ];

    for (const [overrides, message] of invalidCases) {
      expect(() => PersonaEntry.create(validParams(overrides))).toThrow(message);
    }
  });

  test("defaults timestamps, preserves optional expiry, and serializes id/global variants", () => {
    const entry = PersonaEntry.create(validParams({
      entryId: "persona-global-expiring",
      project: undefined,
      visibility: "global",
      scope: { visibility: "global" },
      expiresAt: new Date("2026-08-07T00:00:00.000Z"),
      createdAt: undefined,
      updatedAt: undefined,
    }));
    const withId = entry.withId(42);
    const json = withId.toJSON();

    expect(json.id).toBe(42);
    expect(json.project).toBeUndefined();
    expect(json.expires_at).toBe("2026-08-07T00:00:00.000Z");
    expect(withId.expiresAt?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(withId.createdAt).toBeInstanceOf(Date);
    expect(withId.updatedAt).toBeInstanceOf(Date);
  });

  test("uses createdAt as updatedAt fallback when updatedAt is omitted", () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const entry = PersonaEntry.create(validParams({
      entryId: "persona-created-fallback",
      createdAt,
      updatedAt: undefined,
    }));

    expect(entry.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(entry.updatedAt.toISOString()).toBe(createdAt.toISOString());
  });
});

function validParams(overrides: Partial<PersonaEntryParams> = {}): PersonaEntryParams {
  return {
    entryId: "persona-valid",
    kind: "preference",
    content: "Valid persona content.",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: ["evt-valid"],
    sourceKinds: ["preference"],
    confidence: 0.8,
    scope: { project: "memory-nexus", visibility: "project" },
    reviewStatus: "pending_review",
    reviewAfter: new Date("2026-07-07T00:00:00.000Z"),
    why: "Derived from a test fixture.",
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    ...overrides,
  };
}
