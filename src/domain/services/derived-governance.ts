import { MemoryGovernanceEntry } from "../entities/memory-governance.js";
import type { ConsentStatus, RedactionState } from "../entities/memory-event.js";

const consentOrder: ConsentStatus[] = ["not_required", "granted", "denied", "revoked"];
const privacyOrder: RedactionState[] = ["none", "redacted", "quarantined"];

/** Combining evidence cannot grant permission or undo an existing control. */
export function mergeDerivedGovernance(previous: MemoryGovernanceEntry, incoming: MemoryGovernanceEntry): MemoryGovernanceEntry {
  if (previous.surface !== incoming.surface || previous.targetId !== incoming.targetId ||
      previous.project !== incoming.project || previous.visibility !== incoming.visibility ||
      previous.scope.project !== incoming.scope.project || previous.scope.visibility !== incoming.scope.visibility ||
      previous.scope.workspace !== incoming.scope.workspace) {
    throw new Error("Derived governance identity or scope conflict");
  }
  let consentStatus = consentOrder.indexOf(previous.consentStatus) > consentOrder.indexOf(incoming.consentStatus)
    ? previous.consentStatus : incoming.consentStatus;
  const consentScopes = previous.consentStatus === "not_required" ? incoming.consentScopes
    : incoming.consentStatus === "not_required" ? previous.consentScopes
    : previous.consentScopes.filter(scope => incoming.consentScopes.includes(scope));
  if (consentStatus === "granted" && previous.consentStatus === "granted" && incoming.consentStatus === "granted" && consentScopes.length === 0) consentStatus = "denied";
  const expiresAt = previous.expiresAt && (!incoming.expiresAt || previous.expiresAt < incoming.expiresAt) ? previous.expiresAt : incoming.expiresAt;
  return MemoryGovernanceEntry.create({
    ...previous.toParams(), sourceEventIds: [...new Set([...previous.sourceEventIds, ...incoming.sourceEventIds])],
    consentStatus, consentScopes, expiresAt,
    redactionState: privacyOrder.indexOf(previous.redactionState) > privacyOrder.indexOf(incoming.redactionState) ? previous.redactionState : incoming.redactionState,
    updatedAt: incoming.updatedAt > previous.updatedAt ? incoming.updatedAt : previous.updatedAt,
  });
}
