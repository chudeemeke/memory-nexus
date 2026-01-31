/**
 * SQLite Entity Repository Implementation
 *
 * Persists Entity domain objects to SQLite database.
 * Implements IEntityRepository with deduplication using INSERT OR REPLACE.
 */

import type { Database, Statement } from "bun:sqlite";
import type {
  IEntityRepository,
  EntityListOptions,
} from "../../../domain/ports/repositories.js";
import {
  Entity,
  type ExtractedEntityType,
  type EntityMetadata,
} from "../../../domain/entities/entity.js";

/**
 * Row type for entities table
 */
interface EntityRow {
  id: number;
  type: string;
  name: string;
  metadata: string | null;
  confidence: number;
  created_at: string;
}

/**
 * SQLite implementation of IEntityRepository
 *
 * Features:
 * - INSERT OR REPLACE for deduplication on (type, name)
 * - Max confidence preservation on upsert
 * - Case-insensitive name matching
 * - Batch insert with transaction support
 */
export class SqliteEntityRepository implements IEntityRepository {
  private readonly db: Database;
  private readonly findByIdStmt: Statement<EntityRow, [number]>;
  private readonly findByNameStmt: Statement<EntityRow, [string, string]>;
  private readonly findBySessionStmt: Statement<EntityRow, [string]>;
  private readonly insertStmt: Statement<
    unknown,
    {
      $type: string;
      $name: string;
      $metadata: string | null;
      $confidence: number;
    }
  >;
  private readonly existsStmt: Statement<
    { id: number; confidence: number } | null,
    [string, string]
  >;
  private readonly updateConfidenceStmt: Statement<unknown, [number, number]>;
  private readonly linkSessionStmt: Statement<
    unknown,
    { $entity_id: number; $session_id: string; $frequency: number }
  >;
  private readonly linkEntityStmt: Statement<
    unknown,
    {
      $source_id: number;
      $target_id: number;
      $relationship: string;
      $weight: number;
    }
  >;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements for reuse
    this.findByIdStmt = db.prepare<EntityRow, [number]>(
      `SELECT id, type, name, metadata, confidence, created_at
       FROM entities
       WHERE id = ?`
    );

    // Case-insensitive search using LOWER()
    this.findByNameStmt = db.prepare<EntityRow, [string, string]>(
      `SELECT id, type, name, metadata, confidence, created_at
       FROM entities
       WHERE type = ? AND LOWER(name) = LOWER(?)`
    );

    this.findBySessionStmt = db.prepare<EntityRow, [string]>(
      `SELECT e.id, e.type, e.name, e.metadata, e.confidence, e.created_at
       FROM entities e
       JOIN session_entities se ON e.id = se.entity_id
       WHERE se.session_id = ?`
    );

    // Simple insert (no upsert - we handle confidence logic in code)
    this.insertStmt = db.prepare(
      `INSERT INTO entities (type, name, metadata, confidence)
       VALUES ($type, $name, $metadata, $confidence)`
    );

    // Check if entity exists and get current confidence
    this.existsStmt = db.prepare<{ id: number; confidence: number } | null, [string, string]>(
      `SELECT id, confidence FROM entities WHERE type = ? AND LOWER(name) = LOWER(?)`
    );

    // Update confidence only
    this.updateConfidenceStmt = db.prepare(
      `UPDATE entities SET confidence = ? WHERE id = ?`
    );

    // Session linking with frequency increment
    this.linkSessionStmt = db.prepare(
      `INSERT INTO session_entities (entity_id, session_id, frequency)
       VALUES ($entity_id, $session_id, $frequency)
       ON CONFLICT(session_id, entity_id) DO UPDATE SET
         frequency = frequency + excluded.frequency`
    );

    // Entity linking (ignore duplicates)
    this.linkEntityStmt = db.prepare(
      `INSERT OR IGNORE INTO entity_links (source_id, target_id, relationship, weight)
       VALUES ($source_id, $target_id, $relationship, $weight)`
    );
  }

  /**
   * Find an entity by its unique database identifier.
   */
  async findById(id: number): Promise<Entity | null> {
    const row = this.findByIdStmt.get(id);
    if (!row) {
      return null;
    }
    return this.rowToEntity(row);
  }

  /**
   * Find an entity by type and name (unique constraint).
   * Uses case-insensitive matching and trims whitespace from search name.
   */
  async findByName(
    type: ExtractedEntityType,
    name: string
  ): Promise<Entity | null> {
    const normalizedName = name.trim();
    const row = this.findByNameStmt.get(type, normalizedName);
    if (!row) {
      return null;
    }
    return this.rowToEntity(row);
  }

  /**
   * Find all entities linked to a specific session.
   */
  async findBySession(sessionId: string): Promise<Entity[]> {
    const rows = this.findBySessionStmt.all(sessionId);
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find entities of a specific type with optional filtering.
   * Builds dynamic query based on options.
   */
  async findByType(
    type: ExtractedEntityType,
    options?: EntityListOptions
  ): Promise<Entity[]> {
    const conditions: string[] = ["type = $type"];
    const params: Record<string, unknown> = { $type: type };

    if (options?.minConfidence !== undefined) {
      conditions.push("confidence >= $minConfidence");
      params.$minConfidence = options.minConfidence;
    }

    const whereClause = conditions.join(" AND ");
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : "";

    const sql = `
      SELECT id, type, name, metadata, confidence, created_at
      FROM entities
      WHERE ${whereClause}
      ORDER BY confidence DESC
      ${limitClause}
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as EntityRow[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Save an entity to the repository.
   * Uses INSERT OR REPLACE pattern with max confidence preservation.
   * Returns entity with assigned id.
   */
  async save(entity: Entity): Promise<Entity> {
    // Check if entity already exists
    const existing = this.existsStmt.get(entity.type, entity.name);

    if (existing) {
      // Update confidence to max of existing and new
      const newConfidence = Math.max(existing.confidence, entity.confidence);
      if (newConfidence > existing.confidence) {
        this.updateConfidenceStmt.run(newConfidence, existing.id);
      }
      // Return entity with existing id and max confidence
      return Entity.create({
        id: existing.id,
        type: entity.type,
        name: entity.name,
        confidence: newConfidence,
        metadata: entity.metadata,
      });
    }

    // Insert new entity
    this.insertStmt.run({
      $type: entity.type,
      $name: entity.name,
      $metadata: entity.metadata ? JSON.stringify(entity.metadata) : null,
      $confidence: entity.confidence,
    });

    // Get the inserted id
    const row = this.db.query<{ id: number }, []>(
      "SELECT last_insert_rowid() as id"
    ).get()!;

    return entity.withId(row.id);
  }

  /**
   * Save multiple entities in a single transaction.
   * Returns entities with assigned ids.
   */
  async saveMany(entities: Entity[]): Promise<Entity[]> {
    if (entities.length === 0) {
      return [];
    }

    const results: Entity[] = [];

    const saveAll = this.db.transaction((items: Entity[]) => {
      for (const entity of items) {
        // Check if entity already exists
        const existing = this.existsStmt.get(entity.type, entity.name);

        if (existing) {
          // Update confidence to max
          const newConfidence = Math.max(existing.confidence, entity.confidence);
          if (newConfidence > existing.confidence) {
            this.updateConfidenceStmt.run(newConfidence, existing.id);
          }
          results.push(Entity.create({
            id: existing.id,
            type: entity.type,
            name: entity.name,
            confidence: newConfidence,
            metadata: entity.metadata,
          }));
        } else {
          // Insert new
          this.insertStmt.run({
            $type: entity.type,
            $name: entity.name,
            $metadata: entity.metadata ? JSON.stringify(entity.metadata) : null,
            $confidence: entity.confidence,
          });

          const row = this.db.query<{ id: number }, []>(
            "SELECT last_insert_rowid() as id"
          ).get()!;

          results.push(entity.withId(row.id));
        }
      }
    });

    saveAll.immediate(entities);
    return results;
  }

  /**
   * Create a link between an entity and a session.
   * Increments frequency if link already exists.
   */
  async linkToSession(
    entityId: number,
    sessionId: string,
    frequency: number = 1
  ): Promise<void> {
    this.linkSessionStmt.run({
      $entity_id: entityId,
      $session_id: sessionId,
      $frequency: frequency,
    });
  }

  /**
   * Create a relationship link between two entities.
   * Ignores duplicates (INSERT OR IGNORE).
   */
  async linkEntities(
    sourceId: number,
    targetId: number,
    relationship: "related" | "implies" | "contradicts",
    weight: number = 1.0
  ): Promise<void> {
    this.linkEntityStmt.run({
      $source_id: sourceId,
      $target_id: targetId,
      $relationship: relationship,
      $weight: weight,
    });
  }

  /**
   * Convert a database row to an Entity domain object.
   */
  private rowToEntity(row: EntityRow): Entity {
    return Entity.create({
      id: row.id,
      type: row.type as ExtractedEntityType,
      name: row.name,
      confidence: row.confidence,
      metadata: row.metadata ? (JSON.parse(row.metadata) as EntityMetadata) : undefined,
      createdAt: new Date(row.created_at),
    });
  }
}
