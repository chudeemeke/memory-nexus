import { expect, it } from "bun:test";
import { MemoryGovernanceEntry, type MemoryGovernanceEntryParams } from "../entities/memory-governance.js";
import type { ConsentStatus } from "../entities/memory-event.js";
import { mergeDerivedGovernance } from "./derived-governance.js";

const now = new Date("2026-09-28T10:00:00.000Z");
function entry(overrides: Partial<MemoryGovernanceEntryParams> = {}) {
  return MemoryGovernanceEntry.create({ surface: "graph", targetId: "edge", project: "synthetic", visibility: "project",
    scope: { project: "synthetic", visibility: "project" }, sourceEventIds: ["first"], transformationMethod: "projection",
    actor: "owner", confidence: 0.8, redactionState: "redacted", consentStatus: "not_required", consentScopes: [],
    createdAt: now, updatedAt: now, ...overrides });
}

const statuses: ConsentStatus[] = ["not_required", "granted", "denied", "revoked"];
const outcomes: ConsentStatus[][] = [
  ["not_required", "granted", "denied", "revoked"], ["granted", "granted", "denied", "revoked"],
  ["denied", "denied", "denied", "revoked"], ["revoked", "revoked", "revoked", "revoked"],
];
for (const [i, previous] of statuses.entries()) for (const [j, incoming] of statuses.entries()) it(`derived consent combines ${previous} and ${incoming} without granting authority`, () => {
  const result = mergeDerivedGovernance(entry({ consentStatus: previous, consentScopes: ["local", "export"] }), entry({ consentStatus: incoming, consentScopes: ["local", "sync"] }));
  expect(result.consentStatus).toBe(outcomes[i]![j]!);
  expect(result.consentScopes).toEqual(previous === "not_required" ? ["local", "sync"] : incoming === "not_required" ? ["local", "export"] : ["local"]);
});

it("disjoint grants deny rather than treating an empty intersection as unrestricted", () => {
  const result = mergeDerivedGovernance(entry({ consentStatus: "granted", consentScopes: ["local"] }), entry({ consentStatus: "granted", consentScopes: ["export"] }));
  expect(result.consentStatus).toBe("denied"); expect(result.consentScopes).toEqual([]); expect(result.isBlocked(now)).toBe(true);
});

for (const status of ["pending_review", "suppressed", "invalidated", "expired"] as const) it(`new evidence preserves ${status} control and provenance without aliasing`, () => {
  const first = entry({ status, statusReason: "prior control", reviewedAt: now, lastEventId: "control", redactionState: "quarantined", expiresAt: new Date("2026-09-29") });
  const second = entry({ sourceEventIds: ["second"], redactionState: "none", expiresAt: new Date("2026-10-01"), updatedAt: new Date("2026-09-29") });
  const result = mergeDerivedGovernance(first, second);
  expect(result.status).toBe(status); expect(result.statusReason).toBe("prior control"); expect(result.lastEventId).toBe("control");
  expect(result.redactionState).toBe("quarantined"); expect(result.expiresAt).toEqual(first.expiresAt); expect(result.reviewedAt).toEqual(now);
  expect(result.sourceEventIds).toEqual(["first", "second"]); result.sourceEventIds.push("foreign"); expect(first.sourceEventIds).toEqual(["first"]);
  expect(result.createdAt).toEqual(now); expect(result.updatedAt).toEqual(second.updatedAt); expect(result.isBlocked(now)).toBe(true);
});

for (const [a, b, expected] of [[null, null, null], ["2026-09-29", null, "2026-09-29"], [null, "2026-09-29", "2026-09-29"], ["2026-10-01", "2026-09-29", "2026-09-29"], ["2026-09-29", "2026-09-29", "2026-09-29"]] as const) it(`derived expiry cannot extend ${a} with ${b}`, () => {
  const result = mergeDerivedGovernance(entry({ expiresAt: a ? new Date(a) : null }), entry({ expiresAt: b ? new Date(b) : null, updatedAt: new Date("2026-09-27"), redactionState: "quarantined" }));
  expect(result.expiresAt).toEqual(expected ? new Date(expected) : null); expect(result.updatedAt).toEqual(now); expect(result.redactionState).toBe("quarantined");
});

const conflicts: Partial<MemoryGovernanceEntryParams>[] = [
  { surface: "persona" }, { targetId: "other" }, { project: "other" }, { visibility: "global" },
  { scope: { project: "other", visibility: "project" } }, { scope: { visibility: "global", project: "synthetic" } },
  { scope: { project: "synthetic", visibility: "project", workspace: "foreign" } },
];
for (const [i, conflict] of conflicts.entries()) it(`derived governance refuses identity or scope mismatch ${i}`, () => {
  expect(() => mergeDerivedGovernance(entry(), entry(conflict))).toThrow("identity or scope conflict");
});
