import type {
  MemoryEventScope,
  MemoryEventVisibility,
  RedactionState,
} from "./memory-event.js";
import type { FactType } from "./fact.js";

export const DREAM_ENTRY_SCHEMA_VERSION = 1;

export const DREAM_ENTRY_KINDS = ["supersedence_proposal"] as const;
export type DreamEntryKind = (typeof DREAM_ENTRY_KINDS)[number];

export const DREAM_ENTRY_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "applied",
  "rolled_back",
] as const;
export type DreamEntryStatus = (typeof DREAM_ENTRY_STATUSES)[number];

export const DREAM_ENTRY_CONTROLS = [
  "approve",
  "reject",
  "apply",
  "rollback",
  "suppress",
  "invalidate",
] as const;
export type DreamEntryControl = (typeof DREAM_ENTRY_CONTROLS)[number];

export interface DreamFactProposal {
  uuid: string;
  type: FactType;
  project: string;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface DreamAudit {
  redactionState: RedactionState;
  reviewer: string;
  redactedFields: string[];
  findingHashes: string[];
}

export interface DreamEntryParams {
  id?: number | undefined;
  schemaVersion?: 1 | undefined;
  dreamId: string;
  kind: DreamEntryKind;
  status?: DreamEntryStatus | undefined;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  sourceEventIds: string[];
  targetFactUuid: string;
  proposedFact: DreamFactProposal;
  reason: string;
  confidence: number;
  audit: DreamAudit;
  autoPromoted?: boolean | undefined;
  rollbackEventKind?: string | undefined;
  appliedEventIds?: string[] | undefined;
  rollbackEventIds?: string[] | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  reviewedAt?: Date | null | undefined;
  appliedAt?: Date | null | undefined;
  rolledBackAt?: Date | null | undefined;
}

export interface DreamEntryJson {
  id?: number | undefined;
  schema_version: 1;
  dream_id: string;
  kind: DreamEntryKind;
  status: DreamEntryStatus;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  scope: MemoryEventScope;
  source_event_ids: string[];
  target_fact_uuid: string;
  proposed_fact: DreamFactProposal;
  reason: string;
  confidence: number;
  audit: {
    redaction_state: RedactionState;
    reviewer: string;
    redacted_fields: string[];
    finding_hashes: string[];
  };
  auto_promoted: boolean;
  requires_review: boolean;
  requires_rollback: boolean;
  rollback_event_kind: string;
  applied_event_ids: string[];
  rollback_event_ids: string[];
  controls: DreamEntryControl[];
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;
}

export class DreamEntry {
  private readonly params: {
    id?: number | undefined;
    schemaVersion: 1;
    dreamId: string;
    kind: DreamEntryKind;
    status: DreamEntryStatus;
    project?: string | undefined;
    visibility: MemoryEventVisibility;
    sourceEventIds: string[];
    targetFactUuid: string;
    proposedFact: DreamFactProposal;
    reason: string;
    confidence: number;
    audit: DreamAudit;
    autoPromoted: false;
    rollbackEventKind: string;
    appliedEventIds: string[];
    rollbackEventIds: string[];
    createdAt: Date;
    updatedAt: Date;
    reviewedAt: Date | null;
    appliedAt: Date | null;
    rolledBackAt: Date | null;
  };

  private constructor(params: DreamEntryParams) {
    const now = new Date();
    this.params = {
      id: params.id,
      schemaVersion: DREAM_ENTRY_SCHEMA_VERSION,
      dreamId: params.dreamId.trim(),
      kind: params.kind,
      status: params.status ?? "pending_review",
      project: params.project?.trim() || undefined,
      visibility: params.visibility,
      sourceEventIds: uniqueStrings(params.sourceEventIds),
      targetFactUuid: params.targetFactUuid.trim(),
      proposedFact: cloneFactProposal(params.proposedFact),
      reason: params.reason.trim(),
      confidence: params.confidence,
      audit: cloneAudit(params.audit),
      autoPromoted: false,
      rollbackEventKind: params.rollbackEventKind ?? "dream.rollback",
      appliedEventIds: uniqueStrings(params.appliedEventIds ?? []),
      rollbackEventIds: uniqueStrings(params.rollbackEventIds ?? []),
      createdAt: copyDate(params.createdAt ?? now),
      updatedAt: copyDate(params.updatedAt ?? params.createdAt ?? now),
      reviewedAt: params.reviewedAt ? copyDate(params.reviewedAt) : null,
      appliedAt: params.appliedAt ? copyDate(params.appliedAt) : null,
      rolledBackAt: params.rolledBackAt ? copyDate(params.rolledBackAt) : null,
    };
  }

  static create(params: DreamEntryParams): DreamEntry {
    validateDreamEntry(params);
    return new DreamEntry(params);
  }

  static fromJSON(json: DreamEntryJson): DreamEntry {
    return DreamEntry.create({
      id: json.id,
      schemaVersion: json.schema_version,
      dreamId: json.dream_id,
      kind: json.kind,
      status: json.status,
      project: json.project,
      visibility: json.visibility,
      sourceEventIds: json.source_event_ids,
      targetFactUuid: json.target_fact_uuid,
      proposedFact: json.proposed_fact,
      reason: json.reason,
      confidence: json.confidence,
      audit: {
        redactionState: json.audit.redaction_state,
        reviewer: json.audit.reviewer,
        redactedFields: json.audit.redacted_fields,
        findingHashes: json.audit.finding_hashes,
      },
      autoPromoted: json.auto_promoted,
      rollbackEventKind: json.rollback_event_kind,
      appliedEventIds: json.applied_event_ids,
      rollbackEventIds: json.rollback_event_ids,
      createdAt: new Date(json.created_at),
      updatedAt: new Date(json.updated_at),
      reviewedAt: json.reviewed_at ? new Date(json.reviewed_at) : null,
      appliedAt: json.applied_at ? new Date(json.applied_at) : null,
      rolledBackAt: json.rolled_back_at ? new Date(json.rolled_back_at) : null,
    });
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get schemaVersion(): 1 {
    return this.params.schemaVersion;
  }

  get dreamId(): string {
    return this.params.dreamId;
  }

  get kind(): DreamEntryKind {
    return this.params.kind;
  }

  get status(): DreamEntryStatus {
    return this.params.status;
  }

  get project(): string | undefined {
    return this.params.project;
  }

  get visibility(): MemoryEventVisibility {
    return this.params.visibility;
  }

  get scope(): MemoryEventScope {
    return this.visibility === "project"
      ? { project: this.project, visibility: "project" }
      : { visibility: this.visibility };
  }

  get sourceEventIds(): string[] {
    return [...this.params.sourceEventIds];
  }

  get targetFactUuid(): string {
    return this.params.targetFactUuid;
  }

  get proposedFact(): DreamFactProposal {
    return cloneFactProposal(this.params.proposedFact);
  }

  get reason(): string {
    return this.params.reason;
  }

  get confidence(): number {
    return this.params.confidence;
  }

  get audit(): DreamAudit {
    return cloneAudit(this.params.audit);
  }

  get autoPromoted(): false {
    return false;
  }

  get requiresReview(): boolean {
    return this.status === "pending_review";
  }

  get requiresRollback(): boolean {
    return true;
  }

  get rollbackEventKind(): string {
    return this.params.rollbackEventKind;
  }

  get appliedEventIds(): string[] {
    return [...this.params.appliedEventIds];
  }

  get rollbackEventIds(): string[] {
    return [...this.params.rollbackEventIds];
  }

  get controls(): DreamEntryControl[] {
    return [...DREAM_ENTRY_CONTROLS];
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

  get appliedAt(): Date | null {
    return this.params.appliedAt ? copyDate(this.params.appliedAt) : null;
  }

  get rolledBackAt(): Date | null {
    return this.params.rolledBackAt ? copyDate(this.params.rolledBackAt) : null;
  }

  withId(id: number): DreamEntry {
    return DreamEntry.create({ ...this.toParams(), id });
  }

  approve(reviewer: string, reviewedAt: Date): DreamEntry {
    if (this.status !== "pending_review") {
      throw new Error("Dream entry must be pending_review before approval");
    }
    if (!reviewer.trim()) {
      throw new Error("Dream approval reviewer is required");
    }
    validateDate("reviewedAt", reviewedAt);
    return DreamEntry.create({
      ...this.toParams(),
      status: "approved",
      audit: {
        ...this.audit,
        reviewer,
      },
      reviewedAt,
      updatedAt: reviewedAt,
    });
  }

  reject(reviewer: string, reviewedAt: Date): DreamEntry {
    if (this.status !== "pending_review") {
      throw new Error("Dream entry must be pending_review before rejection");
    }
    if (!reviewer.trim()) {
      throw new Error("Dream rejection reviewer is required");
    }
    validateDate("reviewedAt", reviewedAt);
    return DreamEntry.create({
      ...this.toParams(),
      status: "rejected",
      audit: {
        ...this.audit,
        reviewer,
      },
      reviewedAt,
      updatedAt: reviewedAt,
    });
  }

  markApplied(eventIds: string[], appliedAt: Date): DreamEntry {
    if (this.status !== "approved") {
      throw new Error("Dream entry must be approved before it can be applied");
    }
    if (eventIds.length === 0) {
      throw new Error("Dream appliedEventIds must include at least one event id");
    }
    validateDate("appliedAt", appliedAt);
    return DreamEntry.create({
      ...this.toParams(),
      status: "applied",
      appliedEventIds: eventIds,
      appliedAt,
      updatedAt: appliedAt,
    });
  }

  markRolledBack(eventIds: string[], rolledBackAt: Date): DreamEntry {
    if (this.status !== "applied") {
      throw new Error("Dream entry must be applied before rollback");
    }
    if (eventIds.length === 0) {
      throw new Error("Dream rollbackEventIds must include at least one event id");
    }
    validateDate("rolledBackAt", rolledBackAt);
    return DreamEntry.create({
      ...this.toParams(),
      status: "rolled_back",
      rollbackEventIds: eventIds,
      rolledBackAt,
      updatedAt: rolledBackAt,
    });
  }

  toParams(): DreamEntryParams {
    return {
      id: this.id,
      schemaVersion: this.schemaVersion,
      dreamId: this.dreamId,
      kind: this.kind,
      status: this.status,
      project: this.project,
      visibility: this.visibility,
      sourceEventIds: this.sourceEventIds,
      targetFactUuid: this.targetFactUuid,
      proposedFact: this.proposedFact,
      reason: this.reason,
      confidence: this.confidence,
      audit: this.audit,
      autoPromoted: this.autoPromoted,
      rollbackEventKind: this.rollbackEventKind,
      appliedEventIds: this.appliedEventIds,
      rollbackEventIds: this.rollbackEventIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      reviewedAt: this.reviewedAt,
      appliedAt: this.appliedAt,
      rolledBackAt: this.rolledBackAt,
    };
  }

  toJSON(): DreamEntryJson {
    return {
      ...(this.id !== undefined ? { id: this.id } : {}),
      schema_version: this.schemaVersion,
      dream_id: this.dreamId,
      kind: this.kind,
      status: this.status,
      ...(this.project !== undefined ? { project: this.project } : {}),
      visibility: this.visibility,
      scope: this.scope,
      source_event_ids: this.sourceEventIds,
      target_fact_uuid: this.targetFactUuid,
      proposed_fact: this.proposedFact,
      reason: this.reason,
      confidence: this.confidence,
      audit: {
        redaction_state: this.audit.redactionState,
        reviewer: this.audit.reviewer,
        redacted_fields: this.audit.redactedFields,
        finding_hashes: this.audit.findingHashes,
      },
      auto_promoted: this.autoPromoted,
      requires_review: this.requiresReview,
      requires_rollback: this.requiresRollback,
      rollback_event_kind: this.rollbackEventKind,
      applied_event_ids: this.appliedEventIds,
      rollback_event_ids: this.rollbackEventIds,
      controls: this.controls,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      reviewed_at: this.reviewedAt ? this.reviewedAt.toISOString() : null,
      applied_at: this.appliedAt ? this.appliedAt.toISOString() : null,
      rolled_back_at: this.rolledBackAt ? this.rolledBackAt.toISOString() : null,
    };
  }
}

function validateDreamEntry(params: DreamEntryParams): void {
  if (params.schemaVersion !== undefined && params.schemaVersion !== DREAM_ENTRY_SCHEMA_VERSION) {
    throw new Error("DreamEntry schemaVersion must be 1");
  }
  if (!params.dreamId || !params.dreamId.trim()) {
    throw new Error("DreamEntry dreamId is required");
  }
  if (!DREAM_ENTRY_KINDS.includes(params.kind)) {
    throw new Error(`Invalid DreamEntry kind: ${params.kind}`);
  }
  if (params.status !== undefined && !DREAM_ENTRY_STATUSES.includes(params.status)) {
    throw new Error(`Invalid DreamEntry status: ${params.status}`);
  }
  if (params.autoPromoted === true) {
    throw new Error("DreamEntry autoPromoted must be false; hidden promotion is not allowed");
  }
  validateVisibility(params);
  validateStringArray("sourceEventIds", params.sourceEventIds, true);
  if (!params.targetFactUuid || !params.targetFactUuid.trim()) {
    throw new Error("DreamEntry targetFactUuid is required");
  }
  validateFactProposal(params.proposedFact);
  if (!params.reason || !params.reason.trim()) {
    throw new Error("DreamEntry reason is required");
  }
  if (!Number.isFinite(params.confidence) || params.confidence < 0 || params.confidence > 1) {
    throw new Error("DreamEntry confidence must be between 0 and 1");
  }
  validateAudit(params.audit);
  if (params.rollbackEventKind !== undefined && !params.rollbackEventKind.trim()) {
    throw new Error("DreamEntry rollbackEventKind is required");
  }
  validateStringArray("appliedEventIds", params.appliedEventIds ?? [], false);
  validateStringArray("rollbackEventIds", params.rollbackEventIds ?? [], false);
  validateOptionalDate("createdAt", params.createdAt);
  validateOptionalDate("updatedAt", params.updatedAt);
  validateOptionalDate("reviewedAt", params.reviewedAt ?? undefined);
  validateOptionalDate("appliedAt", params.appliedAt ?? undefined);
  validateOptionalDate("rolledBackAt", params.rolledBackAt ?? undefined);
}

function validateVisibility(params: DreamEntryParams): void {
  if (params.visibility !== "project" && params.visibility !== "workspace" && params.visibility !== "global") {
    throw new Error("DreamEntry visibility is invalid");
  }
  if (params.visibility === "project" && (!params.project || !params.project.trim())) {
    throw new Error("DreamEntry project is required for project-visible dreams");
  }
}

function validateFactProposal(proposal: DreamFactProposal): void {
  if (!proposal || typeof proposal !== "object") {
    throw new Error("DreamEntry proposedFact is required");
  }
  if (!proposal.uuid || !proposal.uuid.trim()) {
    throw new Error("DreamEntry proposedFact.uuid is required");
  }
  if (!["decision", "learning", "preference", "friction", "observation", "supersedence"].includes(proposal.type)) {
    throw new Error("DreamEntry proposedFact.type is invalid");
  }
  if (!proposal.project || !proposal.project.trim()) {
    throw new Error("DreamEntry proposedFact.project is required");
  }
  if (!proposal.content || !proposal.content.trim()) {
    throw new Error("DreamEntry proposedFact.content is required");
  }
}

function validateAudit(audit: DreamAudit): void {
  if (!audit || typeof audit !== "object") {
    throw new Error("DreamEntry audit is required");
  }
  if (!["none", "redacted", "quarantined"].includes(audit.redactionState)) {
    throw new Error("DreamEntry audit.redactionState is invalid");
  }
  if (!audit.reviewer || !audit.reviewer.trim()) {
    throw new Error("DreamEntry audit.reviewer is required");
  }
  validateStringArray("audit.redactedFields", audit.redactedFields, false);
  validateStringArray("audit.findingHashes", audit.findingHashes, false);
}

function validateStringArray(field: string, value: string[], requireNonEmpty: boolean): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`DreamEntry ${field} must be a string array`);
  }
  if (requireNonEmpty && value.length === 0) {
    throw new Error(`DreamEntry ${field} must include at least one value`);
  }
}

function validateOptionalDate(field: string, value: Date | null | undefined): void {
  if (value !== undefined && value !== null) {
    validateDate(field, value);
  }
}

function validateDate(field: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`DreamEntry ${field} must be a valid Date`);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function cloneFactProposal(value: DreamFactProposal): DreamFactProposal {
  return {
    uuid: value.uuid,
    type: value.type,
    project: value.project,
    content: value.content,
    ...(value.metadata !== undefined ? { metadata: cloneRecord(value.metadata) } : {}),
  };
}

function cloneAudit(value: DreamAudit): DreamAudit {
  return {
    redactionState: value.redactionState,
    reviewer: value.reviewer,
    redactedFields: [...value.redactedFields],
    findingHashes: [...value.findingHashes],
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}
