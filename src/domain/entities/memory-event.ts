/**
 * Canonical memory event envelope.
 *
 * v5 event logs store these envelopes as source-of-truth records. Database
 * tables and indexes are projections rebuilt from this canonical shape.
 */

import { createHash, randomUUID } from "node:crypto";
import type { FactType } from "./fact.js";

export const MEMORY_EVENT_SCHEMA_VERSION = 2;

export type MemoryEventKind = FactType | "governance" | "privacy" | "consent" | "projection" | "dream";
export type MemoryEventOperation = "add" | "update" | "delete" | "supersede" | "noop" | "migrate";
export type MemoryEventVisibility = "project" | "workspace" | "global";
export type RedactionState = "none" | "redacted" | "quarantined";
export type ConsentStatus = "not_required" | "granted" | "denied" | "revoked";

export interface MemoryEventScope {
  project?: string | undefined;
  workspace?: string | undefined;
  visibility: MemoryEventVisibility;
}

export interface MemoryEventProvenance {
  source: string;
  actor: string;
  method: string;
  sourceIds?: string[] | undefined;
}

export interface MemoryEventPrivacy {
  redactionState: RedactionState;
  containsSensitiveContent: boolean;
  policy?: string | undefined;
  redactedFields?: string[] | undefined;
}

export interface MemoryEventConsent {
  status: ConsentStatus;
  scopes: string[];
  grantedAt?: Date | string | undefined;
  expiresAt?: Date | string | undefined;
}

export interface MemoryEventCausality {
  parentEventIds: string[];
  supersedesEventIds: string[];
  relatedEventIds: string[];
}

export interface MemoryEventIntegrity {
  algorithm: "sha256";
  payloadHash: string;
  envelopeHash: string;
}

export interface MemoryEventCreateParams {
  schemaVersion?: 2 | undefined;
  eventId?: string | undefined;
  machineId: string;
  sequence: number;
  kind: MemoryEventKind;
  operation: MemoryEventOperation;
  occurredAt: Date;
  observedAt: Date;
  scope: MemoryEventScope;
  provenance: MemoryEventProvenance;
  privacy: MemoryEventPrivacy;
  consent: MemoryEventConsent;
  causality: MemoryEventCausality;
  payload: Record<string, unknown>;
}

export interface MemoryEventEnvelopeJson {
  schemaVersion: 2;
  eventId: string;
  machineId: string;
  sequence: number;
  kind: MemoryEventKind;
  operation: MemoryEventOperation;
  occurredAt: string;
  observedAt: string;
  scope: MemoryEventScope;
  provenance: MemoryEventProvenance;
  privacy: MemoryEventPrivacy;
  consent: MemoryEventConsent;
  causality: MemoryEventCausality;
  payload: Record<string, unknown>;
  integrity: MemoryEventIntegrity;
}

const OPERATIONS: readonly MemoryEventOperation[] = ["add", "update", "delete", "supersede", "noop", "migrate"];
const VISIBILITIES: readonly MemoryEventVisibility[] = ["project", "workspace", "global"];
const REDACTION_STATES: readonly RedactionState[] = ["none", "redacted", "quarantined"];
const CONSENT_STATUSES: readonly ConsentStatus[] = ["not_required", "granted", "denied", "revoked"];

export class MemoryEventEnvelope {
  private readonly record: MemoryEventEnvelopeJson;

  private constructor(record: MemoryEventEnvelopeJson) {
    this.record = deepClone(record);
  }

  static create(params: MemoryEventCreateParams): MemoryEventEnvelope {
    const recordWithoutIntegrity = normalizeCreateParams(params);
    validateRecordShape(recordWithoutIntegrity);
    const payloadHash = sha256(stableStringify(recordWithoutIntegrity.payload));
    const integrityBase = {
      ...recordWithoutIntegrity,
      integrity: {
        algorithm: "sha256" as const,
        payloadHash,
      },
    };
    const envelopeHash = sha256(stableStringify(integrityBase));
    return new MemoryEventEnvelope({
      ...recordWithoutIntegrity,
      integrity: {
        algorithm: "sha256",
        payloadHash,
        envelopeHash,
      },
    });
  }

  static fromJSON(value: unknown): MemoryEventEnvelope {
    const record = normalizePersistedRecord(value);
    validateRecordShape(record);
    validateIntegrity(record);
    return new MemoryEventEnvelope(record);
  }

  get schemaVersion(): 2 {
    return this.record.schemaVersion;
  }

  get eventId(): string {
    return this.record.eventId;
  }

  get machineId(): string {
    return this.record.machineId;
  }

  get sequence(): number {
    return this.record.sequence;
  }

  get kind(): MemoryEventKind {
    return this.record.kind;
  }

  get operation(): MemoryEventOperation {
    return this.record.operation;
  }

  get occurredAt(): Date {
    return new Date(this.record.occurredAt);
  }

  get observedAt(): Date {
    return new Date(this.record.observedAt);
  }

  get scope(): MemoryEventScope {
    return deepClone(this.record.scope);
  }

  get provenance(): MemoryEventProvenance {
    return deepClone(this.record.provenance);
  }

  get privacy(): MemoryEventPrivacy {
    return deepClone(this.record.privacy);
  }

  get consent(): MemoryEventConsent {
    return deepClone(this.record.consent);
  }

  get causality(): MemoryEventCausality {
    return deepClone(this.record.causality);
  }

  get payload(): Record<string, unknown> {
    return deepClone(this.record.payload);
  }

  get integrity(): MemoryEventIntegrity {
    return deepClone(this.record.integrity);
  }

  toJSON(): MemoryEventEnvelopeJson {
    return deepClone(this.record);
  }
}

function normalizeCreateParams(params: MemoryEventCreateParams): Omit<MemoryEventEnvelopeJson, "integrity"> {
  return {
    schemaVersion: MEMORY_EVENT_SCHEMA_VERSION,
    eventId: params.eventId ?? randomUUID(),
    machineId: params.machineId,
    sequence: params.sequence,
    kind: params.kind,
    operation: params.operation,
    occurredAt: dateToIsoField("occurredAt", params.occurredAt),
    observedAt: dateToIsoField("observedAt", params.observedAt),
    scope: deepClone(params.scope),
    provenance: normalizeProvenance(params.provenance),
    privacy: normalizePrivacy(params.privacy),
    consent: normalizeConsent(params.consent),
    causality: normalizeCausality(params.causality),
    payload: deepClone(params.payload),
  };
}

function normalizePersistedRecord(value: unknown): MemoryEventEnvelopeJson {
  if (!isObject(value)) {
    throw new Error("Memory event record must be an object");
  }

  const record = value as Partial<MemoryEventEnvelopeJson>;
  if (!record.integrity) {
    throw new Error("Memory event integrity is required");
  }

  return {
    schemaVersion: record.schemaVersion as 2,
    eventId: String(record.eventId ?? ""),
    machineId: String(record.machineId ?? ""),
    sequence: Number(record.sequence),
    kind: record.kind as MemoryEventKind,
    operation: record.operation as MemoryEventOperation,
    occurredAt: String(record.occurredAt ?? ""),
    observedAt: String(record.observedAt ?? ""),
    scope: isObject(record.scope) ? normalizeScope(record.scope) : record.scope as MemoryEventScope,
    provenance: normalizeProvenance(record.provenance),
    privacy: normalizePrivacy(record.privacy),
    consent: normalizeConsent(record.consent),
    causality: normalizeCausality(record.causality),
    payload: record.payload as Record<string, unknown>,
    integrity: {
      algorithm: record.integrity.algorithm,
      payloadHash: String(record.integrity.payloadHash ?? ""),
      envelopeHash: String(record.integrity.envelopeHash ?? ""),
    },
  };
}

function normalizeProvenance(value: unknown): MemoryEventProvenance {
  const provenance = isObject(value) ? value as Partial<MemoryEventProvenance> : {};
  return {
    source: String(provenance.source ?? ""),
    actor: String(provenance.actor ?? ""),
    method: String(provenance.method ?? ""),
    sourceIds: normalizeStringArray(provenance.sourceIds),
  };
}

function normalizeScope(value: unknown): MemoryEventScope {
  const scope = isObject(value) ? value as Partial<MemoryEventScope> : {};
  return {
    project: typeof scope.project === "string" ? scope.project : undefined,
    workspace: typeof scope.workspace === "string" ? scope.workspace : undefined,
    visibility: scope.visibility as MemoryEventVisibility,
  };
}

function normalizePrivacy(value: unknown): MemoryEventPrivacy {
  const privacy = isObject(value) ? value as Partial<MemoryEventPrivacy> : {};
  return {
    redactionState: privacy.redactionState as RedactionState,
    containsSensitiveContent: privacy.containsSensitiveContent as boolean,
    policy: typeof privacy.policy === "string" ? privacy.policy : undefined,
    redactedFields: normalizeOptionalStringArray(privacy.redactedFields),
  };
}

function normalizeConsent(value: unknown): MemoryEventConsent {
  const consent = isObject(value) ? value as Partial<MemoryEventConsent> : {};
  return {
    status: consent.status as ConsentStatus,
    scopes: normalizeStringArray(consent.scopes),
    grantedAt: normalizeOptionalDateString(consent.grantedAt),
    expiresAt: normalizeOptionalDateString(consent.expiresAt),
  };
}

function normalizeCausality(value: unknown): MemoryEventCausality {
  if (!isObject(value)) {
    return {
      parentEventIds: undefined as never,
      supersedesEventIds: undefined as never,
      relatedEventIds: undefined as never,
    };
  }
  const causality = value as Partial<MemoryEventCausality>;
  return {
    parentEventIds: normalizeStringArray(causality.parentEventIds),
    supersedesEventIds: normalizeStringArray(causality.supersedesEventIds),
    relatedEventIds: normalizeStringArray(causality.relatedEventIds),
  };
}

function validateRecordShape(record: Omit<MemoryEventEnvelopeJson, "integrity"> | MemoryEventEnvelopeJson): void {
  if (record.schemaVersion !== MEMORY_EVENT_SCHEMA_VERSION) {
    throw new Error("schemaVersion must be 2");
  }
  if (!record.eventId || record.eventId.trim() === "") {
    throw new Error("eventId is required");
  }
  if (!record.machineId || record.machineId.trim() === "") {
    throw new Error("machineId is required");
  }
  if (!Number.isSafeInteger(record.sequence) || record.sequence <= 0) {
    throw new Error("sequence must be a positive safe integer");
  }
  if (!record.kind || String(record.kind).trim() === "") {
    throw new Error("kind is required");
  }
  if (!OPERATIONS.includes(record.operation)) {
    throw new Error("operation is invalid");
  }
  assertValidDate("occurredAt", record.occurredAt);
  assertValidDate("observedAt", record.observedAt);
  validateScope(record.scope);
  validateProvenance(record.provenance);
  validatePrivacy(record.privacy);
  validateConsent(record.consent);
  validateStringArray("causality.parentEventIds", record.causality.parentEventIds);
  validateStringArray("causality.supersedesEventIds", record.causality.supersedesEventIds);
  validateStringArray("causality.relatedEventIds", record.causality.relatedEventIds);
  if (!isObject(record.payload)) {
    throw new Error("payload must be an object");
  }
}

function validateIntegrity(record: MemoryEventEnvelopeJson): void {
  if (record.integrity.algorithm !== "sha256") {
    throw new Error("integrity.algorithm must be sha256");
  }
  const payloadHash = sha256(stableStringify(record.payload));
  if (record.integrity.payloadHash !== payloadHash) {
    throw new Error("payload integrity mismatch");
  }
  const envelopeHash = sha256(stableStringify({
    ...withoutEnvelopeHash(record),
    integrity: {
      algorithm: "sha256" as const,
      payloadHash: record.integrity.payloadHash,
    },
  }));
  if (record.integrity.envelopeHash !== envelopeHash) {
    throw new Error("envelope integrity mismatch");
  }
}

function withoutEnvelopeHash(record: MemoryEventEnvelopeJson): Omit<MemoryEventEnvelopeJson, "integrity"> {
  return {
    schemaVersion: record.schemaVersion,
    eventId: record.eventId,
    machineId: record.machineId,
    sequence: record.sequence,
    kind: record.kind,
    operation: record.operation,
    occurredAt: record.occurredAt,
    observedAt: record.observedAt,
    scope: record.scope,
    provenance: record.provenance,
    privacy: record.privacy,
    consent: record.consent,
    causality: record.causality,
    payload: record.payload,
  };
}

function validateScope(scope: MemoryEventScope): void {
  if (!isObject(scope)) {
    throw new Error("scope is required");
  }
  if (!VISIBILITIES.includes(scope.visibility)) {
    throw new Error("scope.visibility is invalid");
  }
  if (scope.visibility === "project" && (!scope.project || scope.project.trim() === "")) {
    throw new Error("scope.project is required for project visibility");
  }
}

function validateProvenance(provenance: MemoryEventProvenance): void {
  if (!provenance.source || provenance.source.trim() === "") {
    throw new Error("provenance.source is required");
  }
  if (!provenance.actor || provenance.actor.trim() === "") {
    throw new Error("provenance.actor is required");
  }
  if (!provenance.method || provenance.method.trim() === "") {
    throw new Error("provenance.method is required");
  }
  validateStringArray("provenance.sourceIds", provenance.sourceIds ?? []);
}

function validatePrivacy(privacy: MemoryEventPrivacy): void {
  if (!REDACTION_STATES.includes(privacy.redactionState)) {
    throw new Error("privacy.redactionState is invalid");
  }
  if (typeof privacy.containsSensitiveContent !== "boolean") {
    throw new Error("privacy.containsSensitiveContent must be boolean");
  }
  validateStringArray("privacy.redactedFields", privacy.redactedFields ?? []);
}

function validateConsent(consent: MemoryEventConsent): void {
  if (!CONSENT_STATUSES.includes(consent.status)) {
    throw new Error("consent.status is invalid");
  }
  validateStringArray("consent.scopes", consent.scopes);
  if (consent.grantedAt !== undefined) {
    assertValidDate("consent.grantedAt", String(consent.grantedAt));
  }
  if (consent.expiresAt !== undefined) {
    assertValidDate("consent.expiresAt", String(consent.expiresAt));
  }
}

function assertValidDate(field: string, value: string): void {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeStringArray(value);
}

function normalizeOptionalDateString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function dateToIsoField(field: string, value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return value.toISOString();
}

function validateStringArray(field: string, value: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string array`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }
  if (!isObject(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortForStableJson((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepClone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
