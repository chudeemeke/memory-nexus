import type { Database } from "bun:sqlite";
import {
  MemoryUtilityMetric,
  type MemoryUtilitySurface,
} from "../../../domain/entities/memory-utility-metric.js";
import type { IMemoryUtilityRepository } from "../../../domain/ports/repositories.js";

interface MemoryUtilityMetricRow {
  id: number;
  surface: MemoryUtilitySurface;
  target_id: string;
  project: string | null;
  access_count: number;
  last_accessed_at: string | null;
  last_ranked_at: string | null;
  utility_score: number;
  importance_score: number;
  evergreen: number;
  pinned: number;
  half_life_days: number | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteMemoryUtilityRepository implements IMemoryUtilityRepository {
  constructor(private readonly db: Database) {}

  async save(metric: MemoryUtilityMetric): Promise<MemoryUtilityMetric> {
    const result = this.db.prepare(`
      INSERT INTO memory_utility_metrics (
        surface, target_id, project, access_count, last_accessed_at,
        last_ranked_at, utility_score, importance_score, evergreen, pinned,
        half_life_days, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(surface, target_id) DO UPDATE SET
        project = excluded.project,
        access_count = excluded.access_count,
        last_accessed_at = excluded.last_accessed_at,
        last_ranked_at = excluded.last_ranked_at,
        utility_score = excluded.utility_score,
        importance_score = excluded.importance_score,
        evergreen = excluded.evergreen,
        pinned = excluded.pinned,
        half_life_days = excluded.half_life_days,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(...this.toSqlParams(metric));

    const saved = await this.findByTarget(metric.surface, metric.targetId);
    return saved ?? metric.withId(Number(result.lastInsertRowid));
  }

  async findByTarget(surface: MemoryUtilitySurface, targetId: string): Promise<MemoryUtilityMetric | null> {
    const row = this.db.prepare<MemoryUtilityMetricRow, [MemoryUtilitySurface, string]>(
      "SELECT * FROM memory_utility_metrics WHERE surface = ? AND target_id = ?",
    ).get(surface, targetId);
    return row ? this.toEntity(row) : null;
  }

  async findByTargetIds(surface: MemoryUtilitySurface, targetIds: string[]): Promise<MemoryUtilityMetric[]> {
    if (targetIds.length === 0) {
      return [];
    }
    const placeholders = targetIds.map(() => "?").join(", ");
    const rows = this.db.prepare<MemoryUtilityMetricRow, (MemoryUtilitySurface | string)[]>(
      `SELECT * FROM memory_utility_metrics WHERE surface = ? AND target_id IN (${placeholders}) ORDER BY target_id ASC`,
    ).all(surface, ...targetIds);
    return rows.map((row) => this.toEntity(row));
  }

  async recordAccess(surface: MemoryUtilitySurface, targetId: string, accessedAt: Date): Promise<MemoryUtilityMetric> {
    const existing = await this.findByTarget(surface, targetId);
    if (existing) {
      return this.save(existing.recordAccess(accessedAt));
    }
    return this.save(MemoryUtilityMetric.create({
      surface,
      targetId,
      accessCount: 1,
      lastAccessedAt: accessedAt,
      lastRankedAt: null,
      utilityScore: 0.5,
      importanceScore: 0.5,
      evergreen: false,
      pinned: false,
      createdAt: accessedAt,
      updatedAt: accessedAt,
    }));
  }

  async deleteByProject(project: string): Promise<void> {
    this.db.prepare("DELETE FROM memory_utility_metrics WHERE project = ?").run(project);
  }

  async clearAll(): Promise<void> {
    this.db.prepare("DELETE FROM memory_utility_metrics").run();
  }

  private toSqlParams(metric: MemoryUtilityMetric): [
    MemoryUtilitySurface,
    string,
    string | null,
    number,
    string | null,
    string | null,
    number,
    number,
    number,
    number,
    number | null,
    string | null,
    string,
    string,
  ] {
    return [
      metric.surface,
      metric.targetId,
      metric.project ?? null,
      metric.accessCount,
      metric.lastAccessedAt?.toISOString() ?? null,
      metric.lastRankedAt?.toISOString() ?? null,
      metric.utilityScore,
      metric.importanceScore,
      metric.evergreen ? 1 : 0,
      metric.pinned ? 1 : 0,
      metric.halfLifeDays,
      metric.metadata ? JSON.stringify(metric.metadata) : null,
      metric.createdAt.toISOString(),
      metric.updatedAt.toISOString(),
    ];
  }

  private toEntity(row: MemoryUtilityMetricRow): MemoryUtilityMetric {
    return MemoryUtilityMetric.create({
      id: row.id,
      surface: row.surface,
      targetId: row.target_id,
      project: row.project ?? undefined,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : null,
      lastRankedAt: row.last_ranked_at ? new Date(row.last_ranked_at) : null,
      utilityScore: row.utility_score,
      importanceScore: row.importance_score,
      evergreen: row.evergreen === 1,
      pinned: row.pinned === 1,
      halfLifeDays: row.half_life_days,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
