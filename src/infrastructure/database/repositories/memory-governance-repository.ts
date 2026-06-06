/**
 * SQLite implementation of IMemoryGovernanceRepository.
 */

import type { Database } from "bun:sqlite";
import {
  MemoryGovernanceEntry,
  assertMemoryGovernanceControl,
  assertMemoryGovernanceSurface,
  type MemoryGovernanceControl,
  type MemoryGovernanceEntryParams,
  type MemoryGovernanceStatus,
  type MemoryGovernanceSurface,
} from "../../../domain/entities/memory-governance.js";
import type {
  ConsentStatus,
  MemoryEventEnvelope,
  MemoryEventScope,
  MemoryEventVisibility,
  RedactionState,
} from "../../../domain/entities/memory-event.js";
import type {
  IMemoryGovernanceRepository,
  MemoryGovernanceListOptions,
} from "../../../domain/ports/repositories.js";

interface GovernanceRow {
  id: number;
  surface: MemoryGovernanceSurface;
  target_id: string;
  project: string | null;
  visibility: MemoryEventVisibility;
  source_event_ids: string;
  transformation_method: string;
  actor: string;
  confidence: number;
  redaction_state: RedactionState;
  consent_status: ConsentStatus;
  consent_scopes: string;
  scope: string;
  status: MemoryGovernanceStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
  last_event_id: string | null;
}

export class SqliteMemoryGovernanceRepository implements IMemoryGovernanceRepository {
  constructor(private readonly db: Database) {}

  async save(entry: MemoryGovernanceEntry): Promise<MemoryGovernanceEntry> {
    const result = this.db.prepare(`
      INSERT INTO memory_governance (
        surface, target_id, project, visibility, source_event_ids,
        transformation_method, actor, confidence, redaction_state,
        consent_status, consent_scopes, scope, status, status_reason,
        created_at, updated_at, reviewed_at, expires_at, last_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(surface, target_id) DO UPDATE SET
        project = excluded.project,
        visibility = excluded.visibility,
        source_event_ids = excluded.source_event_ids,
        transformation_method = excluded.transformation_method,
        actor = excluded.actor,
        confidence = excluded.confidence,
        redaction_state = excluded.redaction_state,
        consent_status = excluded.consent_status,
        consent_scopes = excluded.consent_scopes,
        scope = excluded.scope,
        status = excluded.status,
        status_reason = excluded.status_reason,
        updated_at = excluded.updated_at,
        reviewed_at = excluded.reviewed_at,
        expires_at = excluded.expires_at,
        last_event_id = excluded.last_event_id
    `).run(...this.toSqlParams(entry));

    const saved = await this.findByTarget(entry.surface, entry.targetId);
    if (saved) {
      return saved;
    }

    return entry.withId(Number(result.lastInsertRowid));
  }

  async findByTarget(
    surface: MemoryGovernanceSurface,
    targetId: string,
  ): Promise<MemoryGovernanceEntry | null> {
    const row = this.db.prepare<GovernanceRow, [string, string]>(
      "SELECT * FROM memory_governance WHERE surface = ? AND target_id = ?",
    ).get(surface, targetId);
    return row ? this.toEntity(row) : null;
  }

  async findByTargetIds(
    surface: MemoryGovernanceSurface,
    targetIds: string[],
  ): Promise<MemoryGovernanceEntry[]> {
    if (targetIds.length === 0) {
      return [];
    }
    const placeholders = targetIds.map(() => "?").join(", ");
    const rows = this.db.prepare<GovernanceRow, string[]>(
      `SELECT * FROM memory_governance WHERE surface = ? AND target_id IN (${placeholders})`,
    ).all(surface, ...targetIds);
    return rows.map((row) => this.toEntity(row));
  }

  async findAll(options: MemoryGovernanceListOptions = {}): Promise<MemoryGovernanceEntry[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.surface) {
      conditions.push("surface = ?");
      params.push(options.surface);
    }
    if (options.targetId) {
      conditions.push("target_id = ?");
      params.push(options.targetId);
    }
    if (options.project) {
      conditions.push("project = ?");
      params.push(options.project);
    }
    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options.limit ?? 100;
    params.push(limit);

    const rows = this.db.prepare<GovernanceRow, (string | number)[]>(
      `SELECT * FROM memory_governance ${where} ORDER BY updated_at DESC LIMIT ?`,
    ).all(...params);

    return rows.map((row) => this.toEntity(row));
  }

  async applyMemoryEvent(event: MemoryEventEnvelope): Promise<MemoryGovernanceEntry | null> {
    const governance = getObject(event.payload.governance);
    if (!governance) {
      return null;
    }

    const control = assertMemoryGovernanceControl(stringValue(governance.control, "register"));
    const surface = assertMemoryGovernanceSurface(stringValue(governance.surface, "fact"));
    const targetId = stringValue(governance.targetId ?? governance.target_id, "");
    if (!targetId.trim()) {
      throw new Error("Governance event targetId is required");
    }

    this.recordGovernanceEvent(event, control, surface, targetId, governance);

    if (control === "register") {
      return this.save(entryFromEvent(event, governance, surface, targetId));
    }

    const existing = await this.findByTarget(surface, targetId);
    const base = existing ?? entryFromEvent(event, governance, surface, targetId);
    const updated = base.withControl({
      control,
      actor: stringValue(governance.actor, event.provenance.actor),
      reason: optionalString(governance.reason),
      occurredAt: event.occurredAt,
      expiresAt: optionalDate(governance.expiresAt ?? governance.expires_at),
      consentStatus: optionalConsentStatus(governance.consentStatus ?? governance.consent_status),
      consentScopes: optionalStringArray(governance.consentScopes ?? governance.consent_scopes),
      lastEventId: event.eventId,
    });
    return this.save(updated);
  }

  async clearAll(): Promise<void> {
    this.db.exec("DELETE FROM memory_governance_events; DELETE FROM memory_governance;");
  }

  private toSqlParams(entry: MemoryGovernanceEntry): [
    string,
    string,
    string | null,
    string,
    string,
    string,
    string,
    number,
    string,
    string,
    string,
    string,
    string,
    string | null,
    string,
    string,
    string | null,
    string | null,
    string | null,
  ] {
    return [
      entry.surface,
      entry.targetId,
      entry.project ?? null,
      entry.visibility,
      JSON.stringify(entry.sourceEventIds),
      entry.transformationMethod,
      entry.actor,
      entry.confidence,
      entry.redactionState,
      entry.consentStatus,
      JSON.stringify(entry.consentScopes),
      JSON.stringify(entry.scope),
      entry.status,
      entry.statusReason ?? null,
      entry.createdAt.toISOString(),
      entry.updatedAt.toISOString(),
      entry.reviewedAt?.toISOString() ?? null,
      entry.expiresAt?.toISOString() ?? null,
      entry.lastEventId ?? null,
    ];
  }

  private toEntity(row: GovernanceRow): MemoryGovernanceEntry {
    return MemoryGovernanceEntry.create({
      id: row.id,
      surface: row.surface,
      targetId: row.target_id,
      project: row.project ?? undefined,
      visibility: row.visibility,
      sourceEventIds: JSON.parse(row.source_event_ids) as string[],
      transformationMethod: row.transformation_method,
      actor: row.actor,
      confidence: row.confidence,
      redactionState: row.redaction_state,
      consentStatus: row.consent_status,
      consentScopes: JSON.parse(row.consent_scopes) as string[],
      scope: JSON.parse(row.scope) as MemoryEventScope,
      status: row.status,
      statusReason: row.status_reason ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      lastEventId: row.last_event_id ?? undefined,
    });
  }

  private recordGovernanceEvent(
    event: MemoryEventEnvelope,
    control: MemoryGovernanceControl,
    surface: MemoryGovernanceSurface,
    targetId: string,
    payload: Record<string, unknown>,
  ): void {
    this.db.prepare(`
      INSERT INTO memory_governance_events (
        event_id, kind, control, surface, target_id, actor, reason, occurred_at, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `).run(
      event.eventId,
      event.kind,
      control,
      surface,
      targetId,
      stringValue(payload.actor, event.provenance.actor),
      optionalString(payload.reason) ?? null,
      event.occurredAt.toISOString(),
      JSON.stringify(event.payload),
    );
  }
}

export function governanceEntryFromFactEvent(
  event: MemoryEventEnvelope,
  factUuid: string,
  project: string,
): MemoryGovernanceEntry {
  return MemoryGovernanceEntry.create({
    surface: "fact",
    targetId: factUuid,
    project,
    visibility: event.scope.visibility,
    sourceEventIds: event.provenance.sourceIds && event.provenance.sourceIds.length > 0
      ? event.provenance.sourceIds
      : [event.eventId],
    transformationMethod: event.provenance.method,
    actor: event.provenance.actor,
    confidence: confidenceFromPayload(event.payload.fact),
    redactionState: event.privacy.redactionState,
    consentStatus: event.consent.status,
    consentScopes: event.consent.scopes,
    scope: event.scope,
    status: "active",
    createdAt: event.observedAt,
    updatedAt: event.observedAt,
    expiresAt: optionalDate(event.consent.expiresAt),
    lastEventId: event.eventId,
  });
}

function entryFromEvent(
  event: MemoryEventEnvelope,
  payload: Record<string, unknown>,
  surface: MemoryGovernanceSurface,
  targetId: string,
): MemoryGovernanceEntry {
  const project = optionalString(payload.project) ?? event.scope.project;
  const visibility = optionalVisibility(payload.visibility) ?? event.scope.visibility;
  const scope = getObject(payload.scope) as MemoryEventScope | undefined;
  const params: MemoryGovernanceEntryParams = {
    surface,
    targetId,
    project,
    visibility,
    sourceEventIds: optionalStringArray(payload.sourceEventIds ?? payload.source_event_ids)
      ?? event.provenance.sourceIds
      ?? [event.eventId],
    transformationMethod: stringValue(
      payload.transformationMethod ?? payload.transformation_method,
      event.provenance.method,
    ),
    actor: stringValue(payload.actor, event.provenance.actor),
    confidence: optionalNumber(payload.confidence) ?? 1,
    redactionState: optionalRedactionState(payload.redactionState ?? payload.redaction_state)
      ?? event.privacy.redactionState,
    consentStatus: optionalConsentStatus(payload.consentStatus ?? payload.consent_status)
      ?? event.consent.status,
    consentScopes: optionalStringArray(payload.consentScopes ?? payload.consent_scopes)
      ?? event.consent.scopes,
    scope: scope ?? event.scope,
    status: optionalStatus(payload.status) ?? "active",
    statusReason: optionalString(payload.reason ?? payload.statusReason ?? payload.status_reason),
    createdAt: optionalDate(payload.createdAt ?? payload.created_at) ?? event.observedAt,
    updatedAt: event.observedAt,
    reviewedAt: optionalDate(payload.reviewedAt ?? payload.reviewed_at) ?? null,
    expiresAt: optionalDate(payload.expiresAt ?? payload.expires_at ?? event.consent.expiresAt) ?? null,
    lastEventId: event.eventId,
  };
  return MemoryGovernanceEntry.create(params);
}

function confidenceFromPayload(value: unknown): number {
  const fact = getObject(value);
  const metadata = getObject(fact?.metadata);
  return optionalNumber(metadata?.confidence) ?? 1;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optionalVisibility(value: unknown): MemoryEventVisibility | undefined {
  return value === "project" || value === "workspace" || value === "global"
    ? value
    : undefined;
}

function optionalRedactionState(value: unknown): RedactionState | undefined {
  return value === "none" || value === "redacted" || value === "quarantined"
    ? value
    : undefined;
}

function optionalConsentStatus(value: unknown): ConsentStatus | undefined {
  return value === "not_required" || value === "granted" || value === "denied" || value === "revoked"
    ? value
    : undefined;
}

function optionalStatus(value: unknown): MemoryGovernanceStatus | undefined {
  return value === "active" || value === "pending_review" || value === "suppressed" ||
    value === "invalidated" || value === "expired"
    ? value
    : undefined;
}
