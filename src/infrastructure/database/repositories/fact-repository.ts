/**
 * SQLite implementation of IFactRepository.
 *
 * Persists and queries derived Fact projections stored in SQLite.
 * Follows hexagonal rules and maps row results to Fact domain entities.
 */

import type { Database } from "bun:sqlite";
import { Fact, type FactType } from "../../../domain/entities/fact.js";
import type { IFactRepository } from "../../../domain/ports/repositories.js";

interface FactRow {
  id: number;
  uuid: string;
  type: FactType;
  project: string;
  content: string;
  metadata: string | null;
  observed_at: string;
  superseded_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteFactRepository implements IFactRepository {
  constructor(private readonly db: Database) {}

  async findById(id: number): Promise<Fact | null> {
    const row = this.db
      .prepare("SELECT * FROM facts WHERE id = ?")
      .get(id) as FactRow | null;

    if (!row) return null;
    return this.toEntity(row);
  }

  async findByUuid(uuid: string): Promise<Fact | null> {
    const row = this.db
      .prepare("SELECT * FROM facts WHERE uuid = ?")
      .get(uuid) as FactRow | null;

    if (!row) return null;
    return this.toEntity(row);
  }

  async findByProject(project: string): Promise<Fact[]> {
    const rows = this.db
      .prepare("SELECT * FROM facts WHERE project = ? ORDER BY observed_at DESC")
      .all(project) as FactRow[];

    return rows.map(row => this.toEntity(row));
  }

  async findRecent(limit: number): Promise<Fact[]> {
    const rows = this.db
      .prepare("SELECT * FROM facts ORDER BY observed_at DESC LIMIT ?")
      .all(limit) as FactRow[];

    return rows.map(row => this.toEntity(row));
  }

  async save(fact: Fact): Promise<Fact> {
    const metadataStr = fact.metadata ? JSON.stringify(fact.metadata) : null;
    
    // Check if it already exists by UUID
    const existing = await this.findByUuid(fact.uuid);

    if (existing) {
      this.db
        .prepare(`
          UPDATE facts
          SET type = ?, project = ?, content = ?, metadata = ?, observed_at = ?, superseded_at = ?, superseded_by = ?, updated_at = datetime('now')
          WHERE uuid = ?
        `)
        .run(
          fact.type,
          fact.project,
          fact.content,
          metadataStr,
          fact.observedAt.toISOString(),
          fact.supersededAt ? fact.supersededAt.toISOString() : null,
          fact.supersededBy,
          fact.uuid
        );
      return fact.withId(existing.id!);
    } else {
      const result = this.db
        .prepare(`
          INSERT INTO facts (
            uuid, type, project, content, metadata, observed_at, superseded_at, superseded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          fact.uuid,
          fact.type,
          fact.project,
          fact.content,
          metadataStr,
          fact.observedAt.toISOString(),
          fact.supersededAt ? fact.supersededAt.toISOString() : null,
          fact.supersededBy
        );
      return fact.withId(Number(result.lastInsertRowid));
    }
  }

  async saveMany(facts: Fact[]): Promise<Fact[]> {
    const saved: Fact[] = [];
    const transaction = this.db.transaction(() => {
      for (const fact of facts) {
        // Run synchronously within the transaction block.
        const metadataStr = fact.metadata ? JSON.stringify(fact.metadata) : null;
        const existing = this.db
          .prepare("SELECT id FROM facts WHERE uuid = ?")
          .get(fact.uuid) as { id: number } | null;

        if (existing) {
          this.db
            .prepare(`
              UPDATE facts
              SET type = ?, project = ?, content = ?, metadata = ?, observed_at = ?, superseded_at = ?, superseded_by = ?, updated_at = datetime('now')
              WHERE uuid = ?
            `)
            .run(
              fact.type,
              fact.project,
              fact.content,
              metadataStr,
              fact.observedAt.toISOString(),
              fact.supersededAt ? fact.supersededAt.toISOString() : null,
              fact.supersededBy,
              fact.uuid
            );
          saved.push(fact.withId(existing.id));
        } else {
          const result = this.db
            .prepare(`
              INSERT INTO facts (
                uuid, type, project, content, metadata, observed_at, superseded_at, superseded_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              fact.uuid,
              fact.type,
              fact.project,
              fact.content,
              metadataStr,
              fact.observedAt.toISOString(),
              fact.supersededAt ? fact.supersededAt.toISOString() : null,
              fact.supersededBy
            );
          saved.push(fact.withId(Number(result.lastInsertRowid)));
        }
      }
    });

    transaction();
    return saved;
  }

  async search(query: string, limit: number = 20): Promise<Fact[]> {
    const rows = this.db
      .prepare(`
        SELECT f.* FROM facts f
        JOIN facts_fts fts ON f.id = fts.rowid
        WHERE facts_fts MATCH ?
        ORDER BY f.observed_at DESC
        LIMIT ?
      `)
      .all(query, limit) as FactRow[];

    return rows.map(row => this.toEntity(row));
  }

  async superseded(uuid: string, supersededAt: Date, supersededByUuid: string): Promise<void> {
    this.db
      .prepare("UPDATE facts SET superseded_at = ?, superseded_by = ?, updated_at = datetime('now') WHERE uuid = ?")
      .run(supersededAt.toISOString(), supersededByUuid, uuid);
  }

  // Alias to support either interface name variation
  async supersede(uuid: string, supersededAt: Date, supersededByUuid: string): Promise<void> {
    await this.superseded(uuid, supersededAt, supersededByUuid);
  }

  async findAll(): Promise<Fact[]> {
    const rows = this.db
      .prepare("SELECT * FROM facts ORDER BY observed_at DESC")
      .all() as FactRow[];

    return rows.map(row => this.toEntity(row));
  }

  async clearAll(): Promise<void> {
    this.db.exec("DELETE FROM facts;");
  }

  private toEntity(row: FactRow): Fact {
    return Fact.create({
      id: row.id,
      uuid: row.uuid,
      type: row.type,
      project: row.project,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      observedAt: new Date(row.observed_at),
      supersededAt: row.superseded_at ? new Date(row.superseded_at) : null,
      supersededBy: row.superseded_by ?? null,
    });
  }
}
