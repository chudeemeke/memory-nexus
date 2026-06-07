import type { Database } from "bun:sqlite";
import {
  GraphEdge,
  type GraphNodeRef,
  type GraphNodeType,
} from "../../../domain/entities/graph-edge.js";
import type {
  GraphEdgeQueryOptions,
  IGraphRepository,
} from "../../../domain/ports/repositories.js";
import type { MemoryEventVisibility } from "../../../domain/entities/memory-event.js";

interface GraphEdgeRow {
  id: number;
  edge_id: string;
  source_type: GraphNodeType;
  source_id: string;
  source_label: string;
  target_type: GraphNodeType;
  target_id: string;
  target_label: string;
  relationship: string;
  project: string | null;
  visibility: MemoryEventVisibility;
  source_event_ids: string;
  source_kinds: string;
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  why: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteGraphRepository implements IGraphRepository {
  constructor(private readonly db: Database) {}

  async save(edge: GraphEdge): Promise<GraphEdge> {
    const result = this.db.prepare(`
      INSERT INTO graph_edges (
        edge_id, source_type, source_id, source_label, target_type, target_id,
        target_label, relationship, project, visibility, source_event_ids,
        source_kinds, confidence, valid_from, valid_to, why, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(edge_id) DO UPDATE SET
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_label = excluded.source_label,
        target_type = excluded.target_type,
        target_id = excluded.target_id,
        target_label = excluded.target_label,
        relationship = excluded.relationship,
        project = excluded.project,
        visibility = excluded.visibility,
        source_event_ids = excluded.source_event_ids,
        source_kinds = excluded.source_kinds,
        confidence = excluded.confidence,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        why = excluded.why,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(...this.toSqlParams(edge));

    const saved = await this.findByEdgeId(edge.edgeId);
    return saved ?? edge.withId(Number(result.lastInsertRowid));
  }

  async saveMany(edges: GraphEdge[]): Promise<GraphEdge[]> {
    const transaction = this.db.transaction((items: GraphEdge[]) => {
      for (const edge of items) {
        this.db.prepare(`
          INSERT INTO graph_edges (
            edge_id, source_type, source_id, source_label, target_type, target_id,
            target_label, relationship, project, visibility, source_event_ids,
            source_kinds, confidence, valid_from, valid_to, why, metadata,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(edge_id) DO UPDATE SET
            source_type = excluded.source_type,
            source_id = excluded.source_id,
            source_label = excluded.source_label,
            target_type = excluded.target_type,
            target_id = excluded.target_id,
            target_label = excluded.target_label,
            relationship = excluded.relationship,
            project = excluded.project,
            visibility = excluded.visibility,
            source_event_ids = excluded.source_event_ids,
            source_kinds = excluded.source_kinds,
            confidence = excluded.confidence,
            valid_from = excluded.valid_from,
            valid_to = excluded.valid_to,
            why = excluded.why,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
        `).run(...this.toSqlParams(edge));
      }
    });
    transaction(edges);

    const saved: GraphEdge[] = [];
    for (const edge of edges) {
      const current = await this.findByEdgeId(edge.edgeId);
      if (current) {
        saved.push(current);
      }
    }
    return saved;
  }

  async findByEdgeId(edgeId: string): Promise<GraphEdge | null> {
    const row = this.db.prepare<GraphEdgeRow, [string]>(
      "SELECT * FROM graph_edges WHERE edge_id = ?",
    ).get(edgeId);
    return row ? this.toEntity(row) : null;
  }

  async findCurrent(options: GraphEdgeQueryOptions = {}): Promise<GraphEdge[]> {
    const asOf = options.asOf ?? new Date();
    const minConfidence = options.minConfidence ?? 0.7;
    const includeGlobal = options.includeGlobal ?? true;
    const limit = options.limit ?? 50;
    const conditions = [
      "valid_from <= ?",
      "(valid_to IS NULL OR valid_to > ?)",
      "confidence >= ?",
    ];
    const params: (string | number)[] = [asOf.toISOString(), asOf.toISOString(), minConfidence];

    if (options.project) {
      if (includeGlobal) {
        conditions.push("(project = ? OR visibility IN ('global', 'workspace'))");
        params.push(options.project);
      } else {
        conditions.push("project = ?");
        params.push(options.project);
      }
    }

    if (options.nodeId) {
      conditions.push("(source_id = ? OR target_id = ?)");
      params.push(options.nodeId, options.nodeId);
    }

    if (options.relationship) {
      conditions.push("relationship = ?");
      params.push(options.relationship);
    }

    params.push(limit);
    const rows = this.db.prepare<GraphEdgeRow, (string | number)[]>(`
      SELECT * FROM graph_edges
      WHERE ${conditions.join(" AND ")}
      ORDER BY confidence DESC, updated_at DESC, edge_id ASC
      LIMIT ?
    `).all(...params);
    return rows.map((row) => this.toEntity(row));
  }

  async pruneStale(cutoff: Date): Promise<number> {
    const result = this.db.prepare(
      "DELETE FROM graph_edges WHERE valid_to IS NOT NULL AND valid_to < ?",
    ).run(cutoff.toISOString());
    return result.changes;
  }

  async deleteByProject(project: string): Promise<void> {
    this.db.prepare("DELETE FROM graph_edges WHERE project = ?").run(project);
  }

  async clearAll(): Promise<void> {
    this.db.prepare("DELETE FROM graph_edges").run();
  }

  private toSqlParams(edge: GraphEdge): [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string | null,
    string,
    string,
    string,
    number,
    string,
    string | null,
    string,
    string | null,
    string,
    string,
  ] {
    const source = edge.source;
    const target = edge.target;
    return [
      edge.edgeId,
      source.type,
      source.id,
      source.label,
      target.type,
      target.id,
      target.label,
      edge.relationship,
      edge.project ?? null,
      edge.visibility,
      JSON.stringify(edge.sourceEventIds),
      JSON.stringify(edge.sourceKinds),
      edge.confidence,
      edge.validFrom.toISOString(),
      edge.validTo?.toISOString() ?? null,
      edge.why,
      edge.metadata ? JSON.stringify(edge.metadata) : null,
      edge.createdAt.toISOString(),
      edge.updatedAt.toISOString(),
    ];
  }

  private toEntity(row: GraphEdgeRow): GraphEdge {
    return GraphEdge.create({
      id: row.id,
      edgeId: row.edge_id,
      source: this.nodeFromRow(row.source_type, row.source_id, row.source_label),
      target: this.nodeFromRow(row.target_type, row.target_id, row.target_label),
      relationship: row.relationship,
      project: row.project ?? undefined,
      visibility: row.visibility,
      sourceEventIds: JSON.parse(row.source_event_ids) as string[],
      sourceKinds: JSON.parse(row.source_kinds) as string[],
      confidence: row.confidence,
      validFrom: new Date(row.valid_from),
      validTo: row.valid_to ? new Date(row.valid_to) : null,
      why: row.why,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  private nodeFromRow(type: GraphNodeType, id: string, label: string): GraphNodeRef {
    return { type, id, label };
  }
}
