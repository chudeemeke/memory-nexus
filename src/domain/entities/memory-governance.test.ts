import { describe, expect, test } from "bun:test";
import {
  MemoryGovernanceEntry,
  assertMemoryGovernanceControl,
  assertMemoryGovernanceSurface,
} from "./memory-governance.js";

describe("MemoryGovernanceEntry", () => {
  const baseParams = {
    surface: "fact" as const,
    targetId: "fact-123",
    project: "memory-nexus",
    visibility: "project" as const,
    sourceEventIds: ["event-1"],
    transformationMethod: "llm-extraction",
    actor: "memory",
    confidence: 0.91,
    redactionState: "redacted" as const,
    consentStatus: "granted" as const,
    consentScopes: ["local-memory"],
    scope: { project: "memory-nexus", visibility: "project" as const },
    createdAt: new Date("2026-06-06T08:00:00Z"),
    updatedAt: new Date("2026-06-06T08:00:00Z"),
  };

  test("preserves provenance, consent, redaction, and control metadata immutably", () => {
    const entry = MemoryGovernanceEntry.create(baseParams);
    const sourceEventIds = entry.sourceEventIds;
    sourceEventIds.push("mutated");

    expect(entry.sourceEventIds).toEqual(["event-1"]);
    expect(entry.toJSON(new Date("2026-06-06T09:00:00Z"))).toMatchObject({
      surface: "fact",
      target_id: "fact-123",
      source_event_ids: ["event-1"],
      transformation_method: "llm-extraction",
      consent_status: "granted",
      redaction_state: "redacted",
      blocked: false,
    });
  });

  test("blocks suppressed, invalidated, expired, revoked, denied, and quarantined entries", () => {
    const active = MemoryGovernanceEntry.create(baseParams);
    const suppressed = active.withControl({
      control: "suppress",
      actor: "user",
      reason: "do not use",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
    });
    const invalidated = active.withControl({
      control: "invalidate",
      actor: "user",
      reason: "wrong",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
    });
    const expired = MemoryGovernanceEntry.create({
      ...baseParams,
      expiresAt: new Date("2026-06-06T08:30:00Z"),
    });
    const revoked = MemoryGovernanceEntry.create({
      ...baseParams,
      consentStatus: "revoked",
    });
    const denied = MemoryGovernanceEntry.create({
      ...baseParams,
      consentStatus: "denied",
    });
    const quarantined = MemoryGovernanceEntry.create({
      ...baseParams,
      redactionState: "quarantined",
    });
    const pendingReview = MemoryGovernanceEntry.create({
      ...baseParams,
      status: "pending_review",
    });
    const futureExpiry = MemoryGovernanceEntry.create({
      ...baseParams,
      expiresAt: new Date("2026-06-06T10:00:00Z"),
    });

    expect(suppressed.isBlocked()).toBe(true);
    expect(invalidated.isBlocked()).toBe(true);
    expect(expired.isBlocked(new Date("2026-06-06T09:00:00Z"))).toBe(true);
    expect(revoked.isBlocked()).toBe(true);
    expect(denied.isBlocked()).toBe(true);
    expect(quarantined.isBlocked()).toBe(true);
    expect(pendingReview.isBlocked()).toBe(true);
    expect(futureExpiry.isBlocked(new Date("2026-06-06T09:00:00Z"))).toBe(false);
  });

  test("applies every governance control with explainable state transitions", () => {
    const active = MemoryGovernanceEntry.create(baseParams);
    const suppressed = active.withControl({
      control: "suppress",
      actor: "user",
      reason: "incorrect",
      occurredAt: new Date("2026-06-06T09:00:00Z"),
      lastEventId: "event-suppress",
    });
    const unsuppressed = suppressed.withControl({
      control: "unsuppress",
      actor: "user",
      occurredAt: new Date("2026-06-06T09:15:00Z"),
    });
    const reviewed = active.withControl({
      control: "review",
      actor: "reviewer",
      occurredAt: new Date("2026-06-06T09:30:00Z"),
    });
    const expired = active.withControl({
      control: "expire",
      actor: "memory",
      occurredAt: new Date("2026-06-06T09:45:00Z"),
    });
    const grant = suppressed.withControl({
      control: "consent_grant",
      actor: "user",
      occurredAt: new Date("2026-06-06T10:00:00Z"),
      consentStatus: "granted",
      consentScopes: ["remote-sync"],
    });
    const revoke = active.withControl({
      control: "consent_revoke",
      actor: "user",
      occurredAt: new Date("2026-06-06T10:15:00Z"),
      consentStatus: "revoked",
    });
    const invalidatedThenRevoked = active
      .withControl({
        control: "invalidate",
        actor: "user",
        occurredAt: new Date("2026-06-06T10:20:00Z"),
      })
      .withControl({
        control: "consent_revoke",
        actor: "user",
        occurredAt: new Date("2026-06-06T10:30:00Z"),
      });

    expect(suppressed.status).toBe("suppressed");
    expect(suppressed.statusReason).toBe("incorrect");
    expect(suppressed.lastEventId).toBe("event-suppress");
    expect(unsuppressed.status).toBe("active");
    expect(reviewed.status).toBe("active");
    expect(reviewed.reviewedAt?.toISOString()).toBe("2026-06-06T09:30:00.000Z");
    expect(expired.status).toBe("expired");
    expect(expired.expiresAt?.toISOString()).toBe("2026-06-06T09:45:00.000Z");
    expect(grant.status).toBe("active");
    expect(grant.consentStatus).toBe("granted");
    expect(grant.consentScopes).toEqual(["remote-sync"]);
    expect(revoke.status).toBe("suppressed");
    expect(revoke.consentStatus).toBe("revoked");
    expect(invalidatedThenRevoked.status).toBe("invalidated");
  });

  test("serializes optional metadata only when present and round-trips params defensively", () => {
    const entry = MemoryGovernanceEntry.create({
      ...baseParams,
      id: 42,
      status: "pending_review",
      statusReason: "needs human confirmation",
      reviewedAt: new Date("2026-06-06T09:00:00Z"),
      expiresAt: new Date("2026-06-07T09:00:00Z"),
      lastEventId: "event-42",
    });

    const json = entry.toJSON(new Date("2026-06-06T09:30:00Z"));
    expect(json).toMatchObject({
      id: 42,
      project: "memory-nexus",
      status_reason: "needs human confirmation",
      reviewed_at: "2026-06-06T09:00:00.000Z",
      expires_at: "2026-06-07T09:00:00.000Z",
      last_event_id: "event-42",
      blocked: true,
    });

    const params = entry.toParams();
    params.sourceEventIds.push("mutated");
    params.scope.project = "mutated";
    params.createdAt?.setUTCFullYear(2030);

    expect(entry.sourceEventIds).toEqual(["event-1"]);
    expect(entry.scope).toEqual({ project: "memory-nexus", visibility: "project" });
    expect(entry.createdAt.toISOString()).toBe("2026-06-06T08:00:00.000Z");
  });

  test("omits optional fields from JSON when they are absent", () => {
    const entry = MemoryGovernanceEntry.create({
      ...baseParams,
      project: undefined,
      statusReason: undefined,
      lastEventId: undefined,
    });

    const json = entry.toJSON();

    expect("id" in json).toBe(false);
    expect("project" in json).toBe(false);
    expect("status_reason" in json).toBe(false);
    expect("last_event_id" in json).toBe(false);
    expect(json.reviewed_at).toBeNull();
    expect(json.expires_at).toBeNull();
  });

  test("validates the minimum durable provenance contract", () => {
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, targetId: "" })).toThrow("targetId");
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, transformationMethod: "" })).toThrow("transformationMethod");
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, confidence: 1.2 })).toThrow("confidence");
  });

  test("rejects invalid governance contracts at each trust boundary", () => {
    expect(() => assertMemoryGovernanceSurface("unknown")).toThrow("Invalid memory governance surface");
    expect(() => assertMemoryGovernanceControl("unknown")).toThrow("Invalid memory governance control");
    expect(assertMemoryGovernanceSurface("remote_sync")).toBe("remote_sync");
    expect(assertMemoryGovernanceControl("consent_revoke")).toBe("consent_revoke");

    const invalidCases: Array<[string, Partial<typeof baseParams>]> = [
      ["surface", { surface: "unknown" as any }],
      ["visibility", { visibility: "private" as any }],
      ["sourceEventIds", { sourceEventIds: [1] as any }],
      ["actor", { actor: "" }],
      ["redactionState", { redactionState: "raw" as any }],
      ["consentStatus", { consentStatus: "unknown" as any }],
      ["consentScopes", { consentScopes: [false] as any }],
      ["scope.visibility", { scope: { project: "memory-nexus", visibility: "private" as any } }],
      ["status", { status: "unknown" as any }],
      ["createdAt", { createdAt: new Date("not-a-date") }],
      ["updatedAt", { updatedAt: new Date("not-a-date") }],
      ["reviewedAt", { reviewedAt: new Date("not-a-date") as any }],
      ["expiresAt", { expiresAt: new Date("not-a-date") as any }],
    ];

    for (const [field, override] of invalidCases) {
      expect(() => MemoryGovernanceEntry.create({ ...baseParams, ...override })).toThrow(field);
    }
  });
});
