/**
 * Memory governance domain model.
 *
 * Tracks whether derived memory may be used on a given surface and preserves
 * the provenance/consent/redaction state needed to explain that decision.
 */

import type {
  ConsentStatus,
  MemoryEventScope,
  MemoryEventVisibility,
  RedactionState,
} from "./memory-event.js";

export const MEMORY_GOVERNANCE_SURFACES = [
  "fact",
  "context",
  "provider_egress",
  "remote_sync",
  "friction",
  "evaluation",
  "persona",
  "graph",
  "ranking",
  "dream",
  "projection",
] as const;

export type MemoryGovernanceSurface = (typeof MEMORY_GOVERNANCE_SURFACES)[number];

export const MEMORY_GOVERNANCE_STATUSES = [
  "active",
  "pending_review",
  "suppressed",
  "invalidated",
  "expired",
] as const;

export type MemoryGovernanceStatus = (typeof MEMORY_GOVERNANCE_STATUSES)[number];

export const MEMORY_GOVERNANCE_CONTROLS = [
  "register",
  "suppress",
  "unsuppress",
  "invalidate",
  "expire",
  "review",
  "consent_grant",
  "consent_revoke",
] as const;

export type MemoryGovernanceControl = (typeof MEMORY_GOVERNANCE_CONTROLS)[number];

export interface MemoryGovernanceEntryParams {
  id?: number | undefined;
  surface: MemoryGovernanceSurface;
  targetId: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  sourceEventIds: string[];
  transformationMethod: string;
  actor: string;
  confidence: number;
  redactionState: RedactionState;
  consentStatus: ConsentStatus;
  consentScopes: string[];
  scope: MemoryEventScope;
  status?: MemoryGovernanceStatus | undefined;
  statusReason?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  reviewedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
  lastEventId?: string | undefined;
}

export interface GovernanceControlParams {
  control: MemoryGovernanceControl;
  actor: string;
  reason?: string | undefined;
  occurredAt: Date;
  expiresAt?: Date | null | undefined;
  consentStatus?: ConsentStatus | undefined;
  consentScopes?: string[] | undefined;
  lastEventId?: string | undefined;
}

export interface MemoryGovernanceEntryJson {
  id?: number | undefined;
  surface: MemoryGovernanceSurface;
  target_id: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  source_event_ids: string[];
  transformation_method: string;
  actor: string;
  confidence: number;
  redaction_state: RedactionState;
  consent_status: ConsentStatus;
  consent_scopes: string[];
  scope: MemoryEventScope;
  status: MemoryGovernanceStatus;
  status_reason?: string | undefined;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
  last_event_id?: string | undefined;
  blocked: boolean;
}

export class MemoryGovernanceEntry {
  private readonly params: {
    id?: number | undefined;
    surface: MemoryGovernanceSurface;
    targetId: string;
    project?: string | undefined;
    visibility: MemoryEventVisibility;
    sourceEventIds: string[];
    transformationMethod: string;
    actor: string;
    confidence: number;
    redactionState: RedactionState;
    consentStatus: ConsentStatus;
    consentScopes: string[];
    scope: MemoryEventScope;
    status: MemoryGovernanceStatus;
    statusReason?: string | undefined;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    expiresAt: Date | null;
    lastEventId?: string | undefined;
  };

  private constructor(params: MemoryGovernanceEntryParams) {
    this.params = {
      id: params.id,
      surface: params.surface,
      targetId: params.targetId,
      project: params.project,
      visibility: params.visibility,
      sourceEventIds: [...params.sourceEventIds],
      transformationMethod: params.transformationMethod,
      actor: params.actor,
      confidence: params.confidence,
      redactionState: params.redactionState,
      consentStatus: params.consentStatus,
      consentScopes: [...params.consentScopes],
      scope: clone(params.scope),
      status: params.status ?? "active",
      statusReason: params.statusReason,
      createdAt: copyDate(params.createdAt ?? new Date()),
      updatedAt: copyDate(params.updatedAt ?? params.createdAt ?? new Date()),
      reviewedAt: params.reviewedAt ? copyDate(params.reviewedAt) : null,
      expiresAt: params.expiresAt ? copyDate(params.expiresAt) : null,
      lastEventId: params.lastEventId,
    };
  }

  static create(params: MemoryGovernanceEntryParams): MemoryGovernanceEntry {
    validateEntryParams(params);
    return new MemoryGovernanceEntry(params);
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get surface(): MemoryGovernanceSurface {
    return this.params.surface;
  }

  get targetId(): string {
    return this.params.targetId;
  }

  get project(): string | undefined {
    return this.params.project;
  }

  get visibility(): MemoryEventVisibility {
    return this.params.visibility;
  }

  get sourceEventIds(): string[] {
    return [...this.params.sourceEventIds];
  }

  get transformationMethod(): string {
    return this.params.transformationMethod;
  }

  get actor(): string {
    return this.params.actor;
  }

  get confidence(): number {
    return this.params.confidence;
  }

  get redactionState(): RedactionState {
    return this.params.redactionState;
  }

  get consentStatus(): ConsentStatus {
    return this.params.consentStatus;
  }

  get consentScopes(): string[] {
    return [...this.params.consentScopes];
  }

  get scope(): MemoryEventScope {
    return clone(this.params.scope);
  }

  get status(): MemoryGovernanceStatus {
    return this.params.status;
  }

  get statusReason(): string | undefined {
    return this.params.statusReason;
  }

  get createdAt(): Date {
    return copyDate(this.params.createdAt);
  }

  get updatedAt(): Date {
    return copyDate(this.params.updatedAt);
  }

  get reviewedAt(): Date | null {
    return this.params.reviewedAt ? copyDate(this.params.reviewedAt) : null;
  }

  get expiresAt(): Date | null {
    return this.params.expiresAt ? copyDate(this.params.expiresAt) : null;
  }

  get lastEventId(): string | undefined {
    return this.params.lastEventId;
  }

  withId(id: number): MemoryGovernanceEntry {
    return MemoryGovernanceEntry.create({ ...this.toParams(), id });
  }

  withControl(params: GovernanceControlParams): MemoryGovernanceEntry {
    const next = this.toParams();
    const status = statusForControl(params.control, this.status);

    return MemoryGovernanceEntry.create({
      ...next,
      status,
      actor: params.actor,
      statusReason: params.reason ?? next.statusReason,
      updatedAt: params.occurredAt,
      reviewedAt:
        params.control === "review" ? params.occurredAt : next.reviewedAt,
      expiresAt:
        params.control === "expire" ? (params.expiresAt ?? params.occurredAt) :
        params.expiresAt !== undefined ? params.expiresAt :
        next.expiresAt,
      consentStatus: params.consentStatus ?? next.consentStatus,
      consentScopes: params.consentScopes ?? next.consentScopes,
      lastEventId: params.lastEventId ?? next.lastEventId,
    });
  }

  isBlocked(now: Date = new Date()): boolean {
    if (this.status === "suppressed" || this.status === "invalidated" || this.status === "expired") {
      return true;
    }
    if (this.status === "pending_review") {
      return true;
    }
    if (this.expiresAt && this.expiresAt.getTime() <= now.getTime()) {
      return true;
    }
    if (this.consentStatus === "denied" || this.consentStatus === "revoked") {
      return true;
    }
    if (this.redactionState === "quarantined") {
      return true;
    }
    return false;
  }

  toJSON(now: Date = new Date()): MemoryGovernanceEntryJson {
    return {
      ...(this.id !== undefined ? { id: this.id } : {}),
      surface: this.surface,
      target_id: this.targetId,
      ...(this.project !== undefined ? { project: this.project } : {}),
      visibility: this.visibility,
      source_event_ids: this.sourceEventIds,
      transformation_method: this.transformationMethod,
      actor: this.actor,
      confidence: this.confidence,
      redaction_state: this.redactionState,
      consent_status: this.consentStatus,
      consent_scopes: this.consentScopes,
      scope: this.scope,
      status: this.status,
      ...(this.statusReason !== undefined ? { status_reason: this.statusReason } : {}),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      reviewed_at: this.reviewedAt ? this.reviewedAt.toISOString() : null,
      expires_at: this.expiresAt ? this.expiresAt.toISOString() : null,
      ...(this.lastEventId !== undefined ? { last_event_id: this.lastEventId } : {}),
      blocked: this.isBlocked(now),
    };
  }

  toParams(): MemoryGovernanceEntryParams {
    return {
      id: this.id,
      surface: this.surface,
      targetId: this.targetId,
      project: this.project,
      visibility: this.visibility,
      sourceEventIds: this.sourceEventIds,
      transformationMethod: this.transformationMethod,
      actor: this.actor,
      confidence: this.confidence,
      redactionState: this.redactionState,
      consentStatus: this.consentStatus,
      consentScopes: this.consentScopes,
      scope: this.scope,
      status: this.status,
      statusReason: this.statusReason,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      reviewedAt: this.reviewedAt,
      expiresAt: this.expiresAt,
      lastEventId: this.lastEventId,
    };
  }
}

export function assertMemoryGovernanceSurface(value: string): MemoryGovernanceSurface {
  if (!MEMORY_GOVERNANCE_SURFACES.includes(value as MemoryGovernanceSurface)) {
    throw new Error(`Invalid memory governance surface: ${value}`);
  }
  return value as MemoryGovernanceSurface;
}

export function assertMemoryGovernanceControl(value: string): MemoryGovernanceControl {
  if (!MEMORY_GOVERNANCE_CONTROLS.includes(value as MemoryGovernanceControl)) {
    throw new Error(`Invalid memory governance control: ${value}`);
  }
  return value as MemoryGovernanceControl;
}

function validateEntryParams(params: MemoryGovernanceEntryParams): void {
  assertMemoryGovernanceSurface(params.surface);
  if (!params.targetId || params.targetId.trim() === "") {
    throw new Error("Memory governance targetId is required");
  }
  if (!["project", "workspace", "global"].includes(params.visibility)) {
    throw new Error("Memory governance visibility is invalid");
  }
  validateStringArray("sourceEventIds", params.sourceEventIds);
  if (!params.transformationMethod || params.transformationMethod.trim() === "") {
    throw new Error("Memory governance transformationMethod is required");
  }
  if (!params.actor || params.actor.trim() === "") {
    throw new Error("Memory governance actor is required");
  }
  if (!Number.isFinite(params.confidence) || params.confidence < 0 || params.confidence > 1) {
    throw new Error("Memory governance confidence must be between 0 and 1");
  }
  if (!["none", "redacted", "quarantined"].includes(params.redactionState)) {
    throw new Error("Memory governance redactionState is invalid");
  }
  if (!["not_required", "granted", "denied", "revoked"].includes(params.consentStatus)) {
    throw new Error("Memory governance consentStatus is invalid");
  }
  validateStringArray("consentScopes", params.consentScopes);
  if (!params.scope || !["project", "workspace", "global"].includes(params.scope.visibility)) {
    throw new Error("Memory governance scope.visibility is invalid");
  }
  if (params.status && !MEMORY_GOVERNANCE_STATUSES.includes(params.status)) {
    throw new Error("Memory governance status is invalid");
  }
  validateOptionalDate("createdAt", params.createdAt);
  validateOptionalDate("updatedAt", params.updatedAt);
  validateOptionalDate("reviewedAt", params.reviewedAt ?? undefined);
  validateOptionalDate("expiresAt", params.expiresAt ?? undefined);
}

function statusForControl(
  control: MemoryGovernanceControl,
  current: MemoryGovernanceStatus,
): MemoryGovernanceStatus {
  switch (control) {
    case "register":
    case "unsuppress":
    case "review":
    case "consent_grant":
      return "active";
    case "suppress":
      return "suppressed";
    case "invalidate":
      return "invalidated";
    case "expire":
      return "expired";
    case "consent_revoke":
      return current === "invalidated" ? "invalidated" : "suppressed";
  }
}

function validateStringArray(field: string, value: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Memory governance ${field} must be a string array`);
  }
}

function validateOptionalDate(field: string, value: Date | null | undefined): void {
  if (value !== undefined && value !== null && (!(value instanceof Date) || Number.isNaN(value.getTime()))) {
    throw new Error(`Memory governance ${field} must be a valid date`);
  }
}

function copyDate(date: Date): Date {
  return new Date(date.getTime());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
