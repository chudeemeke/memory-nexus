/**
 * Link Entity
 *
 * Represents a relationship between entities for graph-like traversal.
 * Enables cross-session and cross-topic navigation in the memory database.
 *
 * Entity properties:
 * - Has composite identity (source + target + relationship)
 * - Immutable after construction
 * - Supports weighted relationships for relevance scoring
 */

export type EntityType = "session" | "message" | "topic";
export type LinkType = "mentions" | "related_to" | "continues";

const VALID_ENTITY_TYPES: EntityType[] = ["session", "message", "topic"];
const VALID_LINK_TYPES: LinkType[] = ["mentions", "related_to", "continues"];

interface LinkParams {
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relationship: LinkType;
  weight?: number;
}

export class Link {
  private readonly _sourceType: EntityType;
  private readonly _sourceId: string;
  private readonly _targetType: EntityType;
  private readonly _targetId: string;
  private readonly _relationship: LinkType;
  private readonly _weight: number;

  private constructor(params: LinkParams) {
    this._sourceType = params.sourceType;
    this._sourceId = params.sourceId;
    this._targetType = params.targetType;
    this._targetId = params.targetId;
    this._relationship = params.relationship;
    this._weight = params.weight ?? 1.0;
  }

  /**
   * Create a Link entity.
   * @throws Error if IDs are empty, types are invalid, or weight is out of range
   */
  static create(params: LinkParams): Link {
    if (!params.sourceId || params.sourceId.trim() === "") {
      throw new Error("Source ID cannot be empty");
    }
    if (!params.targetId || params.targetId.trim() === "") {
      throw new Error("Target ID cannot be empty");
    }
    if (!VALID_ENTITY_TYPES.includes(params.sourceType)) {
      throw new Error("Invalid source type");
    }
    if (!VALID_ENTITY_TYPES.includes(params.targetType)) {
      throw new Error("Invalid target type");
    }
    if (!VALID_LINK_TYPES.includes(params.relationship)) {
      throw new Error("Invalid relationship type");
    }
    if (params.weight !== undefined && (params.weight < 0 || params.weight > 1)) {
      throw new Error("Weight must be between 0 and 1");
    }
    return new Link(params);
  }

  /**
   * Composite identifier for this link.
   */
  get id(): string {
    return `${this._sourceType}:${this._sourceId}->${this._targetType}:${this._targetId}:${this._relationship}`;
  }

  /**
   * The type of the source entity.
   */
  get sourceType(): EntityType {
    return this._sourceType;
  }

  /**
   * The ID of the source entity.
   */
  get sourceId(): string {
    return this._sourceId;
  }

  /**
   * The type of the target entity.
   */
  get targetType(): EntityType {
    return this._targetType;
  }

  /**
   * The ID of the target entity.
   */
  get targetId(): string {
    return this._targetId;
  }

  /**
   * The type of relationship between entities.
   */
  get relationship(): LinkType {
    return this._relationship;
  }

  /**
   * The weight/strength of this relationship (0-1).
   */
  get weight(): number {
    return this._weight;
  }

  /**
   * Check equality with another Link (based on composite id).
   */
  equals(other: Link): boolean {
    return this.id === other.id;
  }

  /**
   * Create a new Link with an updated weight.
   * Returns a new Link instance (immutability).
   * @throws Error if weight is out of range
   */
  withWeight(weight: number): Link {
    if (weight < 0 || weight > 1) {
      throw new Error("Weight must be between 0 and 1");
    }
    return new Link({
      sourceType: this._sourceType,
      sourceId: this._sourceId,
      targetType: this._targetType,
      targetId: this._targetId,
      relationship: this._relationship,
      weight,
    });
  }
}
