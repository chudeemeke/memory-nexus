import { describe, expect, test } from "bun:test";
import { DreamEntry } from "./dream-entry.js";

describe("DreamEntry", () => {
  test("creates audited review-gated supersedence proposals", () => {
    const entry = makeDreamEntry();

    expect(entry.schemaVersion).toBe(1);
    expect(entry.dreamId).toBe("dream-provider-registry");
    expect(entry.kind).toBe("supersedence_proposal");
    expect(entry.status).toBe("pending_review");
    expect(entry.autoPromoted).toBe(false);
    expect(entry.requiresReview).toBe(true);
    expect(entry.requiresRollback).toBe(true);
    expect(entry.rollbackEventKind).toBe("dream.rollback");
    expect(entry.sourceEventIds).toEqual(["evt-provider-old", "evt-provider-new"]);
    expect(entry.targetFactUuid).toBe("fact-provider-old");
    expect(entry.proposedFact.content).toContain("Provider registry is capability-driven.");
    expect(entry.audit.redactionState).toBe("redacted");
    expect(entry.controls).toEqual(["approve", "reject", "apply", "rollback", "suppress", "invalidate"]);
  });

  test("round-trips stable JSON without exposing mutable internals", () => {
    const entry = makeDreamEntry();
    const json = entry.toJSON();

    json.source_event_ids.push("mutated");
    json.proposed_fact.content = "mutated";
    json.audit.finding_hashes.push("bad");

    expect(entry.sourceEventIds).toEqual(["evt-provider-old", "evt-provider-new"]);
    expect(entry.proposedFact.content).toContain("Provider registry is capability-driven.");
    expect(entry.audit.findingHashes).toEqual(["abcd1234"]);

    const roundTripped = DreamEntry.fromJSON(entry.toJSON());
    expect(roundTripped.toJSON()).toEqual(entry.toJSON());
  });

  test("transitions through explicit review, apply, and rollback states", () => {
    const reviewedAt = new Date("2026-06-07T09:00:00Z");
    const appliedAt = new Date("2026-06-07T09:05:00Z");
    const rolledBackAt = new Date("2026-06-07T09:10:00Z");

    const approved = makeDreamEntry().approve("user", reviewedAt);
    const applied = approved.markApplied(["evt-replacement", "evt-supersedence"], appliedAt);
    const rolledBack = applied.markRolledBack(["evt-rollback"], rolledBackAt);

    expect(approved.status).toBe("approved");
    expect(approved.reviewedAt?.toISOString()).toBe("2026-06-07T09:00:00.000Z");
    expect(applied.status).toBe("applied");
    expect(applied.appliedEventIds).toEqual(["evt-replacement", "evt-supersedence"]);
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.rollbackEventIds).toEqual(["evt-rollback"]);
    expect(rolledBack.rolledBackAt?.toISOString()).toBe("2026-06-07T09:10:00.000Z");
  });

  test("rejects hidden promotion and incomplete provenance", () => {
    expect(() => makeDreamEntry({ autoPromoted: true })).toThrow("autoPromoted");
    expect(() => makeDreamEntry({ sourceEventIds: [] })).toThrow("sourceEventIds");
    expect(() => makeDreamEntry({ targetFactUuid: "" })).toThrow("targetFactUuid");
    expect(() => makeDreamEntry({
      proposedFact: {
        uuid: "fact-new",
        type: "decision",
        project: "memory-nexus",
        content: "",
      },
    })).toThrow("proposedFact.content");
    expect(() => makeDreamEntry({ createdAt: new Date("invalid") })).toThrow("createdAt");
  });

  test("prevents applying unapproved or already rolled-back dreams", () => {
    expect(() => makeDreamEntry().markApplied(["evt"], new Date("2026-06-07T09:00:00Z"))).toThrow("approved");

    const rolledBack = makeDreamEntry()
      .approve("user", new Date("2026-06-07T09:00:00Z"))
      .markApplied(["evt-replacement", "evt-supersedence"], new Date("2026-06-07T09:05:00Z"))
      .markRolledBack(["evt-rollback"], new Date("2026-06-07T09:10:00Z"));

    expect(() => rolledBack.markApplied(["evt-again"], new Date("2026-06-07T09:15:00Z"))).toThrow("approved");
    expect(() => rolledBack.markRolledBack(["evt-again"], new Date("2026-06-07T09:15:00Z"))).toThrow("applied");
  });

  test("validates identity, kind, status, visibility, and scope boundaries", () => {
    expect(() => makeDreamEntry({ schemaVersion: 2 as 1 })).toThrow("schemaVersion");
    expect(() => makeDreamEntry({ dreamId: " " })).toThrow("dreamId");
    expect(() => makeDreamEntry({ kind: "background_mutation" as "supersedence_proposal" })).toThrow("kind");
    expect(() => makeDreamEntry({ status: "auto_applied" as "pending_review" })).toThrow("status");
    expect(() => makeDreamEntry({ visibility: "private" as "project" })).toThrow("visibility");
    expect(() => makeDreamEntry({ project: " ", visibility: "project" })).toThrow("project");

    const workspace = makeDreamEntry({ project: undefined, visibility: "workspace" });
    const global = makeDreamEntry({ project: undefined, visibility: "global" });

    expect(workspace.project).toBeUndefined();
    expect(workspace.scope).toEqual({ visibility: "workspace" });
    expect(global.scope).toEqual({ visibility: "global" });
  });

  test("validates proposed fact and audit payloads before any promotion can exist", () => {
    expect(() => makeDreamEntry({ proposedFact: undefined as never })).toThrow("proposedFact");
    expect(() => makeDreamEntry({
      proposedFact: {
        uuid: "",
        type: "decision",
        project: "memory-nexus",
        content: "replacement",
      },
    })).toThrow("proposedFact.uuid");
    expect(() => makeDreamEntry({
      proposedFact: {
        uuid: "fact-new",
        type: "habit" as "decision",
        project: "memory-nexus",
        content: "replacement",
      },
    })).toThrow("proposedFact.type");
    expect(() => makeDreamEntry({
      proposedFact: {
        uuid: "fact-new",
        type: "decision",
        project: "",
        content: "replacement",
      },
    })).toThrow("proposedFact.project");
    expect(() => makeDreamEntry({ audit: undefined as never })).toThrow("audit");
    expect(() => makeDreamEntry({
      audit: {
        redactionState: "unknown" as "none",
        reviewer: "user",
        redactedFields: [],
        findingHashes: [],
      },
    })).toThrow("redactionState");
    expect(() => makeDreamEntry({
      audit: {
        redactionState: "none",
        reviewer: " ",
        redactedFields: [],
        findingHashes: [],
      },
    })).toThrow("reviewer");
    expect(() => makeDreamEntry({
      audit: {
        redactionState: "none",
        reviewer: "user",
        redactedFields: ["ok", ""],
        findingHashes: [],
      },
    })).toThrow("redactedFields");
    expect(() => makeDreamEntry({
      audit: {
        redactionState: "none",
        reviewer: "user",
        redactedFields: [],
        findingHashes: [42 as never],
      },
    })).toThrow("findingHashes");
  });

  test("validates review, apply, rollback, event id, and date transitions", () => {
    const pending = makeDreamEntry();
    const approved = pending.approve("reviewer", new Date("2026-06-07T09:00:00Z"));
    const rejected = pending.reject("reviewer", new Date("2026-06-07T09:01:00Z"));
    const applied = approved.markApplied([" evt-one ", "evt-one", "evt-two"], new Date("2026-06-07T09:02:00Z"));

    expect(applied.appliedEventIds).toEqual(["evt-one", "evt-two"]);
    expect(() => approved.approve("again", new Date("2026-06-07T09:03:00Z"))).toThrow("pending_review");
    expect(() => rejected.reject("again", new Date("2026-06-07T09:03:00Z"))).toThrow("pending_review");
    expect(() => pending.approve(" ", new Date("2026-06-07T09:03:00Z"))).toThrow("reviewer");
    expect(() => pending.reject(" ", new Date("2026-06-07T09:03:00Z"))).toThrow("reviewer");
    expect(() => pending.approve("reviewer", new Date("invalid"))).toThrow("reviewedAt");
    expect(() => pending.reject("reviewer", new Date("invalid"))).toThrow("reviewedAt");
    expect(() => approved.markApplied([], new Date("2026-06-07T09:04:00Z"))).toThrow("appliedEventIds");
    expect(() => approved.markApplied(["evt"], new Date("invalid"))).toThrow("appliedAt");
    expect(() => applied.markRolledBack([], new Date("2026-06-07T09:05:00Z"))).toThrow("rollbackEventIds");
    expect(() => applied.markRolledBack(["evt"], new Date("invalid"))).toThrow("rolledBackAt");
    expect(() => makeDreamEntry({ rollbackEventKind: " " })).toThrow("rollbackEventKind");
    expect(() => makeDreamEntry({ appliedEventIds: ["evt", ""] })).toThrow("appliedEventIds");
    expect(() => makeDreamEntry({ rollbackEventIds: [null as never] })).toThrow("rollbackEventIds");
    expect(() => makeDreamEntry({ updatedAt: new Date("invalid") })).toThrow("updatedAt");
    expect(() => makeDreamEntry({ reviewedAt: new Date("invalid") })).toThrow("reviewedAt");
    expect(() => makeDreamEntry({ appliedAt: new Date("invalid") })).toThrow("appliedAt");
    expect(() => makeDreamEntry({ rolledBackAt: new Date("invalid") })).toThrow("rolledBackAt");
  });

  test("uses safe defaults for timestamps and omits project from non-project JSON", () => {
    const withoutDates = DreamEntry.create({
      dreamId: "dream-default-dates",
      kind: "supersedence_proposal",
      project: "memory-nexus",
      visibility: "project",
      sourceEventIds: ["evt"],
      targetFactUuid: "fact-old",
      proposedFact: {
        uuid: "fact-new",
        type: "decision",
        project: "memory-nexus",
        content: "Replacement decision.",
      },
      reason: "Replace old decision.",
      confidence: 0.5,
      audit: {
        redactionState: "none",
        reviewer: "user",
        redactedFields: [],
        findingHashes: [],
      },
    });
    const workspaceJson = makeDreamEntry({ project: undefined, visibility: "workspace" }).toJSON();

    expect(withoutDates.createdAt).toBeInstanceOf(Date);
    expect(withoutDates.updatedAt).toBeInstanceOf(Date);
    expect(workspaceJson).not.toHaveProperty("project");
    expect(() => makeDreamEntry({ reason: "" })).toThrow("reason");
    expect(() => makeDreamEntry({ confidence: Number.POSITIVE_INFINITY })).toThrow("confidence");
  });
});

function makeDreamEntry(overrides: Partial<Parameters<typeof DreamEntry.create>[0]> = {}): DreamEntry {
  return DreamEntry.create({
    dreamId: "dream-provider-registry",
    kind: "supersedence_proposal",
    project: "memory-nexus",
    visibility: "project",
    sourceEventIds: ["evt-provider-old", "evt-provider-new"],
    targetFactUuid: "fact-provider-old",
    proposedFact: {
      uuid: "fact-provider-new",
      type: "decision",
      project: "memory-nexus",
      content: "Provider registry is capability-driven.",
      metadata: { confidence: 0.91 },
    },
    reason: "Newer provider registry decision supersedes the old provider switch note.",
    confidence: 0.91,
    audit: {
      redactionState: "redacted",
      reviewer: "user",
      redactedFields: ["proposedFact.content"],
      findingHashes: ["abcd1234"],
    },
    createdAt: new Date("2026-06-07T08:00:00Z"),
    updatedAt: new Date("2026-06-07T08:00:00Z"),
    ...overrides,
  });
}
