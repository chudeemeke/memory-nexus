import type { MemoryEventScope, MemoryEventVisibility } from "./memory-event.js";

export const PERSONA_ENTRY_KINDS = [
  "preference",
  "procedure",
  "correction",
  "decision_pattern",
  "friction_pattern",
] as const;

export type PersonaEntryKind = (typeof PERSONA_ENTRY_KINDS)[number];
export type PersonaReviewStatus = "pending_review" | "reviewed";

export const PERSONA_ENTRY_CONTROLS = ["suppress", "invalidate", "expire", "review"] as const;

export interface PersonaEntryParams {
  id?: number | undefined;
  entryId: string;
  kind: PersonaEntryKind;
  content: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  sourceEventIds: string[];
  sourceKinds: string[];
  confidence: number;
  scope: MemoryEventScope;
  reviewStatus: PersonaReviewStatus;
  reviewAfter: Date;
  expiresAt?: Date | null | undefined;
  why: string;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface PersonaEntryJson {
  id?: number | undefined;
  entry_id: string;
  kind: PersonaEntryKind;
  content: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  source_event_ids: string[];
  source_kinds: string[];
  confidence: number;
  scope: MemoryEventScope;
  review_status: PersonaReviewStatus;
  review_after: string;
  expires_at: string | null;
  why: string;
  controls: string[];
  created_at: string;
  updated_at: string;
}

export class PersonaEntry {
  private readonly params: {
    id?: number | undefined;
    entryId: string;
    kind: PersonaEntryKind;
    content: string;
    project?: string | undefined;
    visibility: MemoryEventVisibility;
    sourceEventIds: string[];
    sourceKinds: string[];
    confidence: number;
    scope: MemoryEventScope;
    reviewStatus: PersonaReviewStatus;
    reviewAfter: Date;
    expiresAt: Date | null;
    why: string;
    createdAt: Date;
    updatedAt: Date;
  };

  private constructor(params: PersonaEntryParams) {
    this.params = {
      id: params.id,
      entryId: params.entryId,
      kind: params.kind,
      content: params.content.trim(),
      project: params.project,
      visibility: params.visibility,
      sourceEventIds: [...params.sourceEventIds],
      sourceKinds: [...params.sourceKinds],
      confidence: params.confidence,
      scope: clone(params.scope),
      reviewStatus: params.reviewStatus,
      reviewAfter: copyDate(params.reviewAfter),
      expiresAt: params.expiresAt ? copyDate(params.expiresAt) : null,
      why: params.why.trim(),
      createdAt: copyDate(params.createdAt ?? new Date()),
      updatedAt: copyDate(params.updatedAt ?? params.createdAt ?? new Date()),
    };
  }

  static create(params: PersonaEntryParams): PersonaEntry {
    validatePersonaEntry(params);
    return new PersonaEntry(params);
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get entryId(): string {
    return this.params.entryId;
  }

  get kind(): PersonaEntryKind {
    return this.params.kind;
  }

  get content(): string {
    return this.params.content;
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

  get sourceKinds(): string[] {
    return [...this.params.sourceKinds];
  }

  get confidence(): number {
    return this.params.confidence;
  }

  get scope(): MemoryEventScope {
    return clone(this.params.scope);
  }

  get reviewStatus(): PersonaReviewStatus {
    return this.params.reviewStatus;
  }

  get reviewAfter(): Date {
    return copyDate(this.params.reviewAfter);
  }

  get expiresAt(): Date | null {
    return this.params.expiresAt ? copyDate(this.params.expiresAt) : null;
  }

  get why(): string {
    return this.params.why;
  }

  get controls(): string[] {
    return [...PERSONA_ENTRY_CONTROLS];
  }

  get createdAt(): Date {
    return copyDate(this.params.createdAt);
  }

  get updatedAt(): Date {
    return copyDate(this.params.updatedAt);
  }

  withId(id: number): PersonaEntry {
    return PersonaEntry.create({ ...this.toParams(), id });
  }

  toJSON(): PersonaEntryJson {
    return {
      ...(this.id !== undefined ? { id: this.id } : {}),
      entry_id: this.entryId,
      kind: this.kind,
      content: this.content,
      ...(this.project !== undefined ? { project: this.project } : {}),
      visibility: this.visibility,
      source_event_ids: this.sourceEventIds,
      source_kinds: this.sourceKinds,
      confidence: this.confidence,
      scope: this.scope,
      review_status: this.reviewStatus,
      review_after: this.reviewAfter.toISOString(),
      expires_at: this.expiresAt ? this.expiresAt.toISOString() : null,
      why: this.why,
      controls: this.controls,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }

  toParams(): PersonaEntryParams {
    return {
      id: this.id,
      entryId: this.entryId,
      kind: this.kind,
      content: this.content,
      project: this.project,
      visibility: this.visibility,
      sourceEventIds: this.sourceEventIds,
      sourceKinds: this.sourceKinds,
      confidence: this.confidence,
      scope: this.scope,
      reviewStatus: this.reviewStatus,
      reviewAfter: this.reviewAfter,
      expiresAt: this.expiresAt,
      why: this.why,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

function validatePersonaEntry(params: PersonaEntryParams): void {
  if (!params.entryId || params.entryId.trim() === "") {
    throw new Error("entryId cannot be empty");
  }
  if (!PERSONA_ENTRY_KINDS.includes(params.kind)) {
    throw new Error(`Invalid persona kind: ${params.kind}`);
  }
  if (!params.content || params.content.trim() === "") {
    throw new Error("content cannot be empty");
  }
  if (params.visibility === "project" && (!params.project || params.project.trim() === "")) {
    throw new Error("project is required for project-visible persona entries");
  }
  if (!params.sourceEventIds || params.sourceEventIds.length === 0) {
    throw new Error("sourceEventIds must include at least one source id");
  }
  if (!params.sourceKinds || params.sourceKinds.length === 0) {
    throw new Error("sourceKinds must include at least one source kind");
  }
  if (!Number.isFinite(params.confidence) || params.confidence < 0 || params.confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (!params.scope || !params.scope.visibility) {
    throw new Error("scope with visibility is required");
  }
  if (params.reviewStatus !== "pending_review" && params.reviewStatus !== "reviewed") {
    throw new Error("reviewStatus must be pending_review or reviewed");
  }
  if (!(params.reviewAfter instanceof Date) || Number.isNaN(params.reviewAfter.getTime())) {
    throw new Error("reviewAfter must be a valid Date");
  }
  if (!params.why || params.why.trim() === "") {
    throw new Error("why cannot be empty");
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
