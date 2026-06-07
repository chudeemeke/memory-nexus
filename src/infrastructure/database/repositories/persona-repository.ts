import type { Database } from "bun:sqlite";
import {
  PersonaEntry,
  type PersonaEntryKind,
} from "../../../domain/entities/persona-entry.js";
import type {
  IPersonaRepository,
  PersonaContextOptions,
  PersonaListOptions,
} from "../../../domain/ports/repositories.js";
import type { MemoryEventScope, MemoryEventVisibility } from "../../../domain/entities/memory-event.js";

interface PersonaRow {
  id: number;
  entry_id: string;
  kind: PersonaEntryKind;
  content: string;
  project: string | null;
  visibility: MemoryEventVisibility;
  source_event_ids: string;
  source_kinds: string;
  confidence: number;
  scope: string;
  review_status: "pending_review" | "reviewed";
  review_after: string;
  expires_at: string | null;
  why: string;
  created_at: string;
  updated_at: string;
}

export class SqlitePersonaRepository implements IPersonaRepository {
  constructor(private readonly db: Database) {}

  async save(entry: PersonaEntry): Promise<PersonaEntry> {
    const result = this.db.prepare(`
      INSERT INTO persona_entries (
        entry_id, kind, content, project, visibility, source_event_ids,
        source_kinds, confidence, scope, review_status, review_after,
        expires_at, why, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_id) DO UPDATE SET
        kind = excluded.kind,
        content = excluded.content,
        project = excluded.project,
        visibility = excluded.visibility,
        source_event_ids = excluded.source_event_ids,
        source_kinds = excluded.source_kinds,
        confidence = excluded.confidence,
        scope = excluded.scope,
        review_status = excluded.review_status,
        review_after = excluded.review_after,
        expires_at = excluded.expires_at,
        why = excluded.why,
        updated_at = excluded.updated_at
    `).run(...this.toSqlParams(entry));

    const saved = await this.findByEntryId(entry.entryId);
    return saved ?? entry.withId(Number(result.lastInsertRowid));
  }

  async saveMany(entries: PersonaEntry[]): Promise<PersonaEntry[]> {
    const saved: PersonaEntry[] = [];
    const transaction = this.db.transaction((items: PersonaEntry[]) => {
      for (const entry of items) {
        this.db.prepare(`
          INSERT INTO persona_entries (
            entry_id, kind, content, project, visibility, source_event_ids,
            source_kinds, confidence, scope, review_status, review_after,
            expires_at, why, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(entry_id) DO UPDATE SET
            kind = excluded.kind,
            content = excluded.content,
            project = excluded.project,
            visibility = excluded.visibility,
            source_event_ids = excluded.source_event_ids,
            source_kinds = excluded.source_kinds,
            confidence = excluded.confidence,
            scope = excluded.scope,
            review_status = excluded.review_status,
            review_after = excluded.review_after,
            expires_at = excluded.expires_at,
            why = excluded.why,
            updated_at = excluded.updated_at
        `).run(...this.toSqlParams(entry));
      }
    });
    transaction(entries);

    for (const entry of entries) {
      const current = await this.findByEntryId(entry.entryId);
      if (current) {
        saved.push(current);
      }
    }
    return saved;
  }

  async findByEntryId(entryId: string): Promise<PersonaEntry | null> {
    const row = this.db.prepare<PersonaRow, [string]>(
      "SELECT * FROM persona_entries WHERE entry_id = ?",
    ).get(entryId);
    return row ? this.toEntity(row) : null;
  }

  async findAll(options: PersonaListOptions = {}): Promise<PersonaEntry[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.project) {
      conditions.push("project = ?");
      params.push(options.project);
    }
    if (options.visibility) {
      conditions.push("visibility = ?");
      params.push(options.visibility);
    }
    if (options.kind) {
      conditions.push("kind = ?");
      params.push(options.kind);
    }

    const limit = options.limit ?? 100;
    params.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare<PersonaRow, (string | number)[]>(
      `SELECT * FROM persona_entries ${where} ORDER BY confidence DESC, updated_at DESC LIMIT ?`,
    ).all(...params);
    return rows.map((row) => this.toEntity(row));
  }

  async findForContext(project: string, options: PersonaContextOptions = {}): Promise<PersonaEntry[]> {
    const includeGlobal = options.includeGlobal ?? true;
    const conditions = includeGlobal
      ? "(project = ? OR visibility = 'global')"
      : "project = ?";
    const limit = options.limit ?? 20;
    const rows = this.db.prepare<PersonaRow, (string | number)[]>(
      `SELECT * FROM persona_entries WHERE ${conditions} ORDER BY confidence DESC, updated_at DESC LIMIT ?`,
    ).all(project, limit);
    return rows.map((row) => this.toEntity(row));
  }

  async deleteByProject(project: string): Promise<void> {
    this.db.prepare("DELETE FROM persona_entries WHERE project = ?").run(project);
  }

  async clearAll(): Promise<void> {
    this.db.prepare("DELETE FROM persona_entries").run();
  }

  private toSqlParams(entry: PersonaEntry): [
    string,
    string,
    string,
    string | null,
    string,
    string,
    string,
    number,
    string,
    string,
    string,
    string | null,
    string,
    string,
    string,
  ] {
    return [
      entry.entryId,
      entry.kind,
      entry.content,
      entry.project ?? null,
      entry.visibility,
      JSON.stringify(entry.sourceEventIds),
      JSON.stringify(entry.sourceKinds),
      entry.confidence,
      JSON.stringify(entry.scope),
      entry.reviewStatus,
      entry.reviewAfter.toISOString(),
      entry.expiresAt?.toISOString() ?? null,
      entry.why,
      entry.createdAt.toISOString(),
      entry.updatedAt.toISOString(),
    ];
  }

  private toEntity(row: PersonaRow): PersonaEntry {
    return PersonaEntry.create({
      id: row.id,
      entryId: row.entry_id,
      kind: row.kind,
      content: row.content,
      project: row.project ?? undefined,
      visibility: row.visibility,
      sourceEventIds: JSON.parse(row.source_event_ids) as string[],
      sourceKinds: JSON.parse(row.source_kinds) as string[],
      confidence: row.confidence,
      scope: JSON.parse(row.scope) as MemoryEventScope,
      reviewStatus: row.review_status,
      reviewAfter: new Date(row.review_after),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      why: row.why,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
