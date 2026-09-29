import { ExtractionBatch, type ExtractionBatchRecord } from "../../domain/entities/extraction-batch.js";
import { MemoryEventEnvelope, type MemoryEventPrivacy } from "../../domain/entities/memory-event.js";

/** A descriptor is meaningful only within its explicitly bound source envelope. */
export function readExtractionBatch(event: MemoryEventEnvelope): ExtractionBatchRecord | null {
  const payload = event.payload;
  if (!Object.hasOwn(payload, "extractionBatch")) return null;
  const batch = ExtractionBatch.fromJSON(payload.extractionBatch).toJSON();
  const scope = event.scope, provenance = event.provenance;
  if (event.kind !== "projection" || event.operation !== "add" || Object.keys(payload).length !== 1 ||
      scope.project !== batch.project || scope.visibility !== "project" || scope.workspace !== undefined ||
      event.observedAt.toISOString() !== batch.extractedAt || event.occurredAt.toISOString() !== batch.extractedAt ||
      provenance.source !== "memory-extraction" || provenance.method !== "extraction-batch-v1" ||
      JSON.stringify(provenance.sourceIds) !== JSON.stringify([batch.sessionId]) ||
      batch.facts.some(fact => fact.uuid === event.eventId)) {
    throw new Error("Invalid extraction batch envelope");
  }
  return batch;
}

/** Preserve array order. Callers validate effect payloads and whole-source identities. */
export function expandExtractionBatch(event: MemoryEventEnvelope): MemoryEventEnvelope[] | null {
  const batch = readExtractionBatch(event);
  if (!batch) return null;
  return batch.facts.map((fact, index) => {
    const supersedence = fact.type === "supersedence";
    return MemoryEventEnvelope.create({
      eventId: fact.uuid, machineId: event.machineId, sequence: index + 1,
      kind: fact.type, operation: supersedence ? "supersede" : "add",
      occurredAt: event.occurredAt, observedAt: event.observedAt, scope: event.scope,
      provenance: { ...event.provenance, sourceIds: [event.eventId] },
      privacy: effectPrivacy(event.privacy, fact.metadata), consent: event.consent,
      causality: { parentEventIds: [event.eventId],
        supersedesEventIds: supersedence ? [fact.metadata!.superseded_uuid as string] : [],
        relatedEventIds: supersedence ? [fact.metadata!.superseded_by_uuid as string] : [] },
      payload: { fact: { ...fact, project: batch.project, observedAt: batch.extractedAt, supersededAt: null, supersededBy: null } },
    });
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Neither the wrapper nor metadata may weaken a stricter privacy marker. */
function effectPrivacy(parent: MemoryEventPrivacy, metadata: Record<string, unknown> = {}): MemoryEventPrivacy {
  const redaction = record(metadata.redaction), privacy = record(metadata.privacy);
  const states = [parent.redactionState, metadata.redactionState, redaction.state, privacy.redactionState];
  const fields = [parent.redactedFields, metadata.redactedFields, redaction.fields, privacy.redactedFields]
    .flatMap(value => Array.isArray(value) ? value.filter((field): field is string => typeof field === "string") : []);
  return {
    redactionState: states.includes("quarantined") ? "quarantined" : states.includes("redacted") ? "redacted" : "none",
    containsSensitiveContent: parent.containsSensitiveContent || metadata.containsSensitiveContent === true || privacy.containsSensitiveContent === true,
    policy: parent.policy ?? (typeof redaction.policy === "string" ? redaction.policy : undefined),
    redactedFields: [...new Set(fields)],
  };
}
