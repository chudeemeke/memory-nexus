import { describe, expect, test } from "bun:test";
import { MemoryGovernanceEntry } from "./memory-governance.js";

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
    const quarantined = MemoryGovernanceEntry.create({
      ...baseParams,
      redactionState: "quarantined",
    });

    expect(suppressed.isBlocked()).toBe(true);
    expect(invalidated.isBlocked()).toBe(true);
    expect(expired.isBlocked(new Date("2026-06-06T09:00:00Z"))).toBe(true);
    expect(revoked.isBlocked()).toBe(true);
    expect(quarantined.isBlocked()).toBe(true);
  });

  test("validates the minimum durable provenance contract", () => {
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, targetId: "" })).toThrow("targetId");
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, transformationMethod: "" })).toThrow("transformationMethod");
    expect(() => MemoryGovernanceEntry.create({ ...baseParams, confidence: 1.2 })).toThrow("confidence");
  });
});
