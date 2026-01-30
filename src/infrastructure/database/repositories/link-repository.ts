/**
 * SQLite Link Repository
 *
 * Implements ILinkRepository using bun:sqlite prepared statements.
 * Supports graph-like traversal using WITH RECURSIVE CTE.
 */

import type { Database, Statement } from "bun:sqlite";
import type { ILinkRepository } from "../../../domain/ports/repositories.js";
import { Link, type EntityType } from "../../../domain/entities/link.js";

/**
 * Row shape from links table
 */
interface LinkRow {
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship: string;
  weight: number;
}

/**
 * Extended row shape for findRelated results
 */
interface RelatedLinkRow extends LinkRow {
  hop: number;
}

/**
 * Link with hop count for graph traversal results
 */
export interface RelatedLink {
  link: Link;
  hop: number;
}

/**
 * SQLite implementation of ILinkRepository
 *
 * Uses prepared statements for all operations. Supports multi-hop graph
 * traversal using WITH RECURSIVE CTE with cycle prevention.
 */
export class SqliteLinkRepository implements ILinkRepository {
  private readonly db: Database;
  private readonly findBySourceStmt: Statement;
  private readonly findByTargetStmt: Statement;
  private readonly insertStmt: Statement;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements once for reuse
    this.findBySourceStmt = db.prepare(`
      SELECT source_type, source_id, target_type, target_id, relationship, weight
      FROM links
      WHERE source_type = $sourceType AND source_id = $sourceId
    `);

    this.findByTargetStmt = db.prepare(`
      SELECT source_type, source_id, target_type, target_id, relationship, weight
      FROM links
      WHERE target_type = $targetType AND target_id = $targetId
    `);

    this.insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
        (source_type, source_id, target_type, target_id, relationship, weight)
      VALUES
        ($sourceType, $sourceId, $targetType, $targetId, $relationship, $weight)
    `);
  }

  /**
   * Map a database row to a Link entity
   */
  private rowToLink(row: LinkRow): Link {
    return Link.create({
      sourceType: row.source_type as EntityType,
      sourceId: row.source_id,
      targetType: row.target_type as EntityType,
      targetId: row.target_id,
      relationship: row.relationship as Link["relationship"],
      weight: row.weight,
    });
  }

  /**
   * Find all links originating from a specific entity.
   */
  async findBySource(
    sourceType: EntityType,
    sourceId: string
  ): Promise<Link[]> {
    const rows = this.findBySourceStmt.all({
      $sourceType: sourceType,
      $sourceId: sourceId,
    }) as LinkRow[];
    return rows.map((row) => this.rowToLink(row));
  }

  /**
   * Find all links pointing to a specific entity.
   */
  async findByTarget(
    targetType: EntityType,
    targetId: string
  ): Promise<Link[]> {
    const rows = this.findByTargetStmt.all({
      $targetType: targetType,
      $targetId: targetId,
    }) as LinkRow[];
    return rows.map((row) => this.rowToLink(row));
  }

  /**
   * Find all entities related to a given entity within N hops.
   * Uses WITH RECURSIVE CTE for graph traversal with cycle prevention.
   *
   * Note: The interface returns Link[], but we also track hop count.
   * Use findRelatedWithHops() if hop information is needed.
   */
  async findRelated(
    entityType: EntityType,
    entityId: string,
    maxHops: number = 2
  ): Promise<Link[]> {
    const results = await this.findRelatedWithHops(entityType, entityId, maxHops);
    return results.map((r) => r.link);
  }

  /**
   * Find related entities with hop information.
   * Enables weight decay analysis and distance-based filtering.
   */
  async findRelatedWithHops(
    entityType: EntityType,
    entityId: string,
    maxHops: number = 2
  ): Promise<RelatedLink[]> {
    // WITH RECURSIVE CTE for multi-hop graph traversal
    const sql = `
      WITH RECURSIVE related(
        source_type, source_id, target_type, target_id,
        relationship, weight, hop, path
      ) AS (
        -- Base case: direct connections (1-hop)
        SELECT
          source_type, source_id, target_type, target_id,
          relationship, weight, 1 as hop,
          source_type || ':' || source_id || '->' || target_type || ':' || target_id as path
        FROM links
        WHERE source_type = $entityType AND source_id = $entityId

        UNION ALL

        -- Recursive case: next level connections
        SELECT
          l.source_type, l.source_id, l.target_type, l.target_id,
          l.relationship, l.weight * r.weight, r.hop + 1,
          r.path || '->' || l.target_type || ':' || l.target_id
        FROM links l
        JOIN related r ON l.source_type = r.target_type AND l.source_id = r.target_id
        WHERE r.hop < $maxHops
          -- Prevent cycles: don't revisit nodes in current path
          AND r.path NOT LIKE '%' || l.target_type || ':' || l.target_id || '%'
      )
      SELECT DISTINCT source_type, source_id, target_type, target_id, relationship, weight, hop
      FROM related
      ORDER BY hop ASC, weight DESC
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all({
      $entityType: entityType,
      $entityId: entityId,
      $maxHops: maxHops,
    }) as RelatedLinkRow[];

    return rows.map((row) => ({
      link: this.rowToLink(row),
      hop: row.hop,
    }));
  }

  /**
   * Save a link to the repository.
   * Uses INSERT OR REPLACE for upsert behavior on unique constraint.
   */
  async save(link: Link): Promise<void> {
    this.insertStmt.run({
      $sourceType: link.sourceType,
      $sourceId: link.sourceId,
      $targetType: link.targetType,
      $targetId: link.targetId,
      $relationship: link.relationship,
      $weight: link.weight,
    });
  }

  /**
   * Save multiple links in a single transaction.
   * Uses BEGIN IMMEDIATE for write locking.
   */
  async saveMany(links: Link[]): Promise<void> {
    const saveAll = this.db.transaction(() => {
      for (const link of links) {
        this.insertStmt.run({
          $sourceType: link.sourceType,
          $sourceId: link.sourceId,
          $targetType: link.targetType,
          $targetId: link.targetId,
          $relationship: link.relationship,
          $weight: link.weight,
        });
      }
    });

    saveAll.immediate();
  }
}
