import type { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";
import { MEMORY_GOVERNANCE_CONTROLS, MEMORY_GOVERNANCE_STATUSES, MEMORY_GOVERNANCE_SURFACES } from "../../domain/entities/memory-governance.js";

type RecordValue = Record<string, unknown>;
type Check = (value: unknown) => boolean;
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const text: Check = value => typeof value === "string" && value.trim().length > 0;
const strings: Check = value => Array.isArray(value) && value.every(text);
const date: Check = value => typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
const positiveInteger: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const confidence: Check = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const oneOf = (values: readonly string[]): Check => value => typeof value === "string" && values.includes(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const visibility = oneOf(["project", "workspace", "global"]);
const redaction = oneOf(["none", "redacted", "quarantined"]);
const consent = oneOf(["not_required", "granted", "denied", "revoked"]);
const factTypes = ["decision", "learning", "preference", "friction", "observation", "supersedence"];

function requireValue(value: unknown, check: Check): void {
  if (!check(value)) throw new Error("Invalid projection payload field");
}
function fields(value: RecordValue, checks: Record<string, Check>): void {
  for (const [key, check] of Object.entries(checks)) {
    if (Object.hasOwn(value, key)) requireValue(value[key], check);
  }
}
function object(value: unknown): RecordValue {
  if (!record(value)) throw new Error("Invalid projection payload object");
  return value;
}
function aliases(value: RecordValue, names: string[], check: Check): void {
  const present = names.filter(name => Object.hasOwn(value, name));
  for (const name of present) {
    requireValue(value[name], check);
    if (JSON.stringify(value[name]) !== JSON.stringify(value[present[0]!])) throw new Error("Conflicting projection payload aliases");
  }
}
function metadata(value: RecordValue): void {
  fields(value, { confidence, redactionState: redaction, redactedFields: strings, containsSensitiveContent: value => typeof value === "boolean" });
  if (Object.hasOwn(value, "redaction")) fields(object(value.redaction), { state: redaction, fields: strings, policy: text });
  if (Object.hasOwn(value, "privacy")) fields(object(value.privacy), { redactionState: redaction, redactedFields: strings, containsSensitiveContent: value => typeof value === "boolean" });
}
function fact(value: unknown): void {
  const payload = object(value);
  requireValue(payload.uuid, text); requireValue(payload.content, text);
  fields(payload, { id: positiveInteger, type: oneOf(factTypes), project: text, observedAt: date, supersededAt: nullable(date), supersededBy: nullable(text), metadata: record });
  if (Object.hasOwn(payload, "metadata")) metadata(object(payload.metadata));
}

/** Validate before the legacy adapter can erase malformed optional input. */
export function assertLegacyProjectionPayload(value: unknown): void {
  fact(value);
  fields(object(value), { sequence: positiveInteger });
}

function governance(value: unknown): void {
  const payload = object(value);
  fields(payload, { control: oneOf(MEMORY_GOVERNANCE_CONTROLS), surface: oneOf(MEMORY_GOVERNANCE_SURFACES), project: text, visibility, actor: text, confidence, status: oneOf(MEMORY_GOVERNANCE_STATUSES), reason: text, scope: record });
  aliases(payload, ["targetId", "target_id"], text);
  requireValue(payload.targetId ?? payload.target_id, text);
  aliases(payload, ["sourceEventIds", "source_event_ids"], strings);
  aliases(payload, ["transformationMethod", "transformation_method"], text);
  aliases(payload, ["redactionState", "redaction_state"], redaction);
  aliases(payload, ["consentStatus", "consent_status"], consent);
  aliases(payload, ["consentScopes", "consent_scopes"], strings);
  aliases(payload, ["statusReason", "status_reason"], text);
  aliases(payload, ["createdAt", "created_at"], date);
  aliases(payload, ["reviewedAt", "reviewed_at"], nullable(date));
  aliases(payload, ["expiresAt", "expires_at"], nullable(date));
  if (Object.hasOwn(payload, "scope")) {
    const scope = object(payload.scope);
    requireValue(scope.visibility, visibility);
    fields(scope, { project: text, workspace: text });
  }
}

/** Check authoritative serialized fields before defaulting projection adapters. */
export function assertProjectionPayload(event: MemoryEventEnvelope): void {
  if (factTypes.includes(event.kind)) {
    requireValue(event.operation, oneOf(["add", "update", "supersede"]));
    fact(event.payload.fact);
    return;
  }
  requireValue(event.operation, oneOf(["add", "update"]));
  if (event.kind === "governance" || event.kind === "consent") {
    governance(event.payload.governance);
    return;
  }
  if (event.kind === "dream") {
    const entry = object(object(event.payload.dream).entry);
    fields(entry, { id: positiveInteger, project: text, reviewed_at: nullable(date), applied_at: nullable(date), rolled_back_at: nullable(date) });
    // Required dream fields and transitions are validated by the actual domain/repository handler.
    return;
  }
  throw new Error("Unsupported projection event kind");
}
