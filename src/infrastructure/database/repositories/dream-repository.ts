import type { Database } from "bun:sqlite";
import {
  DreamEntry,
  type DreamAudit,
  type DreamEntryKind,
  type DreamEntryJson,
  type DreamEntryStatus,
  type DreamFactProposal,
} from "../../../domain/entities/dream-entry.js";
import type { MemoryEventVisibility } from "../../../domain/entities/memory-event.js";
import type { DreamListOptions, IDreamRepository } from "../../../domain/ports/repositories.js";
import type { MemoryEventEnvelope } from "../../../domain/entities/memory-event.js";

interface DreamRow {
  id: number;
  dream_id: string;
  schema_version: 1;
  kind: DreamEntryKind;
  status: DreamEntryStatus;
  project: string | null;
  visibility: MemoryEventVisibility;
  source_event_ids: string;
  target_fact_uuid: string;
  proposed_fact: string;
  reason: string;
  confidence: number;
  audit: string;
  auto_promoted: number;
  rollback_event_kind: string;
  applied_event_ids: string;
  rollback_event_ids: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;
}

export class SqliteDreamRepository implements IDreamRepository {
  constructor(private readonly db: Database) {}

  async save(entry: DreamEntry): Promise<DreamEntry> {
    const result = this.db.prepare(`
      INSERT INTO dream_entries (
        dream_id, schema_version, kind, status, project, visibility,
        source_event_ids, target_fact_uuid, proposed_fact, reason, confidence,
        audit, auto_promoted, rollback_event_kind, applied_event_ids,
        rollback_event_ids, created_at, updated_at, reviewed_at, applied_at,
        rolled_back_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dream_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        kind = excluded.kind,
        status = excluded.status,
        project = excluded.project,
        visibility = excluded.visibility,
        source_event_ids = excluded.source_event_ids,
        target_fact_uuid = excluded.target_fact_uuid,
        proposed_fact = excluded.proposed_fact,
        reason = excluded.reason,
        confidence = excluded.confidence,
        audit = excluded.audit,
        auto_promoted = excluded.auto_promoted,
        rollback_event_kind = excluded.rollback_event_kind,
        applied_event_ids = excluded.applied_event_ids,
        rollback_event_ids = excluded.rollback_event_ids,
        updated_at = excluded.updated_at,
        reviewed_at = excluded.reviewed_at,
        applied_at = excluded.applied_at,
        rolled_back_at = excluded.rolled_back_at
    `).run(...this.toSqlParams(entry));

    const saved = await this.findByDreamId(entry.dreamId);
    return saved ?? entry.withId(Number(result.lastInsertRowid));
  }

  async findByDreamId(dreamId: string): Promise<DreamEntry | null> {
    const row = this.db.prepare<DreamRow, [string]>(
      "SELECT * FROM dream_entries WHERE dream_id = ?",
    ).get(dreamId);
    return row ? this.toEntity(row) : null;
  }

  async findAll(options: DreamListOptions = {}): Promise<DreamEntry[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.project) {
      conditions.push("project = ?");
      params.push(options.project);
    }
    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }
    if (options.kind) {
      conditions.push("kind = ?");
      params.push(options.kind);
    }

    const limit = options.limit ?? 100;
    params.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare<DreamRow, (string | number)[]>(
      `SELECT * FROM dream_entries ${where} ORDER BY updated_at DESC, dream_id ASC LIMIT ?`,
    ).all(...params);
    return rows.map((row) => this.toEntity(row));
  }

  async applyMemoryEvent(event: MemoryEventEnvelope): Promise<DreamEntry | null> {
    if (event.kind !== "dream") {
      return null;
    }
    const payload = event.payload.dream;
    if (!isRecord(payload)) {
      throw new Error(`Dream event ${event.eventId} does not contain a dream payload`);
    }
    const entryJson = payload.entry;
    if (!isDreamEntryJson(entryJson)) {
      throw new Error(`Dream event ${event.eventId} does not contain a dream entry`);
    }
    return this.save(DreamEntry.fromJSON(entryJson));
  }

  async deleteByProject(project: string): Promise<void> {
    this.db.prepare("DELETE FROM dream_entries WHERE project = ?").run(project);
  }

  async clearAll(): Promise<void> {
    this.db.prepare("DELETE FROM dream_entries").run();
  }

  private toSqlParams(entry: DreamEntry): [
    string,
    1,
    DreamEntryKind,
    DreamEntryStatus,
    string | null,
    MemoryEventVisibility,
    string,
    string,
    string,
    string,
    number,
    string,
    number,
    string,
    string,
    string,
    string,
    string,
    string | null,
    string | null,
    string | null,
  ] {
    return [
      entry.dreamId,
      entry.schemaVersion,
      entry.kind,
      entry.status,
      entry.project ?? null,
      entry.visibility,
      JSON.stringify(entry.sourceEventIds),
      entry.targetFactUuid,
      JSON.stringify(entry.proposedFact),
      entry.reason,
      entry.confidence,
      JSON.stringify(entry.audit),
      entry.autoPromoted ? 1 : 0,
      entry.rollbackEventKind,
      JSON.stringify(entry.appliedEventIds),
      JSON.stringify(entry.rollbackEventIds),
      entry.createdAt.toISOString(),
      entry.updatedAt.toISOString(),
      entry.reviewedAt?.toISOString() ?? null,
      entry.appliedAt?.toISOString() ?? null,
      entry.rolledBackAt?.toISOString() ?? null,
    ];
  }

  private toEntity(row: DreamRow): DreamEntry {
    return DreamEntry.create({
      id: row.id,
      schemaVersion: row.schema_version,
      dreamId: row.dream_id,
      kind: row.kind,
      status: row.status,
      project: row.project ?? undefined,
      visibility: row.visibility,
      sourceEventIds: JSON.parse(row.source_event_ids) as string[],
      targetFactUuid: row.target_fact_uuid,
      proposedFact: JSON.parse(row.proposed_fact) as DreamFactProposal,
      reason: row.reason,
      confidence: row.confidence,
      audit: normalizeAudit(JSON.parse(row.audit)),
      autoPromoted: row.auto_promoted === 1,
      rollbackEventKind: row.rollback_event_kind,
      appliedEventIds: JSON.parse(row.applied_event_ids) as string[],
      rollbackEventIds: JSON.parse(row.rollback_event_ids) as string[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
      appliedAt: row.applied_at ? new Date(row.applied_at) : null,
      rolledBackAt: row.rolled_back_at ? new Date(row.rolled_back_at) : null,
    });
  }
}

function normalizeAudit(value: unknown): DreamAudit {
  if (!isRecord(value)) {
    throw new Error("Dream audit must be an object");
  }
  return {
    redactionState: String(value.redactionState ?? value.redaction_state) as DreamAudit["redactionState"],
    reviewer: String(value.reviewer ?? ""),
    redactedFields: Array.isArray(value.redactedFields)
      ? value.redactedFields.map(String)
      : Array.isArray(value.redacted_fields)
        ? value.redacted_fields.map(String)
        : [],
    findingHashes: Array.isArray(value.findingHashes)
      ? value.findingHashes.map(String)
      : Array.isArray(value.finding_hashes)
        ? value.finding_hashes.map(String)
        : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDreamEntryJson(value: unknown): value is DreamEntryJson {
  if (!isRecord(value) || value.schema_version !== 1) {
    return false;
  }
  if (
    typeof value.dream_id !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.status !== "string" ||
    typeof value.visibility !== "string" ||
    !Array.isArray(value.source_event_ids) ||
    typeof value.target_fact_uuid !== "string" ||
    !isRecord(value.proposed_fact) ||
    typeof value.reason !== "string" ||
    typeof value.confidence !== "number" ||
    !isRecord(value.audit) ||
    typeof value.auto_promoted !== "boolean" ||
    typeof value.rollback_event_kind !== "string" ||
    !Array.isArray(value.applied_event_ids) ||
    !Array.isArray(value.rollback_event_ids) ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    return false;
  }

  return (
    typeof value.audit.redaction_state === "string" &&
    typeof value.audit.reviewer === "string" &&
    Array.isArray(value.audit.redacted_fields) &&
    Array.isArray(value.audit.finding_hashes)
  );
}
