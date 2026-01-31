/**
 * Entity Domain Type
 *
 * Represents extracted metadata from Claude Code sessions.
 * Four variants: concept, file, decision, term.
 *
 * Entity properties:
 * - Has identity (id when persisted)
 * - Immutable after construction
 * - Type-specific metadata for structured storage
 */

/**
 * Entity type variants for extracted metadata.
 * (Named ExtractedEntityType to distinguish from link.ts EntityType)
 */
export type ExtractedEntityType = "concept" | "file" | "decision" | "term";

const VALID_ENTITY_TYPES: ExtractedEntityType[] = ["concept", "file", "decision", "term"];

/**
 * Metadata for concept entities (technical concepts).
 */
export interface ConceptMetadata {
  /** Category of the concept (e.g., "architecture", "database", "testing") */
  category?: string;
}

/**
 * Metadata for file entities (file paths referenced in session).
 */
export interface FileMetadata {
  /** Operation performed on the file */
  operation?: "read" | "write" | "edit";
  /** Number of lines in the file */
  lineCount?: number;
}

/**
 * Metadata for decision entities (explicit choices made).
 * Required fields: subject, decision
 */
export interface DecisionMetadata {
  /** What was being decided */
  subject: string;
  /** The final decision */
  decision: string;
  /** Alternatives that were rejected */
  rejected: string[];
  /** Reasoning behind the decision */
  rationale: string;
}

/**
 * Metadata for term entities (domain-specific terminology).
 */
export interface TermMetadata {
  /** Definition of the term */
  definition?: string;
}

/**
 * Union type for all entity metadata variants.
 */
export type EntityMetadata =
  | ConceptMetadata
  | FileMetadata
  | DecisionMetadata
  | TermMetadata;

interface EntityParams {
  id?: number;
  type: ExtractedEntityType;
  name: string;
  confidence: number;
  metadata?: EntityMetadata;
  createdAt?: Date;
}

export class Entity {
  private readonly _id?: number;
  private readonly _type: ExtractedEntityType;
  private readonly _name: string;
  private readonly _confidence: number;
  private readonly _metadata?: EntityMetadata;
  private readonly _createdAt?: Date;

  private constructor(params: EntityParams) {
    this._id = params.id;
    this._type = params.type;
    this._name = params.name;
    this._confidence = params.confidence;
    this._metadata = params.metadata
      ? structuredClone(params.metadata)
      : undefined;
    this._createdAt = params.createdAt
      ? new Date(params.createdAt.getTime())
      : undefined;
  }

  /**
   * Create an Entity.
   * @throws Error if name is empty, confidence is out of range, or type is invalid
   * @throws Error if decision type lacks required metadata fields
   */
  static create(params: EntityParams): Entity {
    // Validate name
    if (!params.name || params.name.trim() === "") {
      throw new Error("Entity name cannot be empty");
    }

    // Validate confidence
    if (params.confidence < 0 || params.confidence > 1) {
      throw new Error("Confidence must be between 0 and 1");
    }

    // Validate type
    if (!VALID_ENTITY_TYPES.includes(params.type)) {
      throw new Error("Invalid entity type");
    }

    // Validate decision metadata
    if (params.type === "decision") {
      const metadata = params.metadata as DecisionMetadata | undefined;
      if (!metadata || !metadata.subject || !metadata.decision) {
        throw new Error(
          "Decision metadata requires subject and decision fields"
        );
      }
    }

    return new Entity(params);
  }

  /**
   * The database identifier (undefined until persisted).
   */
  get id(): number | undefined {
    return this._id;
  }

  /**
   * The entity type (concept, file, decision, term).
   */
  get type(): ExtractedEntityType {
    return this._type;
  }

  /**
   * The entity name/value.
   */
  get name(): string {
    return this._name;
  }

  /**
   * Confidence score (0-1) for quality filtering.
   */
  get confidence(): number {
    return this._confidence;
  }

  /**
   * Type-specific metadata (defensive copy).
   */
  get metadata(): EntityMetadata | undefined {
    return this._metadata ? structuredClone(this._metadata) : undefined;
  }

  /**
   * When the entity was created (defensive copy).
   */
  get createdAt(): Date | undefined {
    return this._createdAt ? new Date(this._createdAt.getTime()) : undefined;
  }

  /**
   * Type guard: is this a concept entity?
   */
  get isConcept(): boolean {
    return this._type === "concept";
  }

  /**
   * Type guard: is this a file entity?
   */
  get isFile(): boolean {
    return this._type === "file";
  }

  /**
   * Type guard: is this a decision entity?
   */
  get isDecision(): boolean {
    return this._type === "decision";
  }

  /**
   * Type guard: is this a term entity?
   */
  get isTerm(): boolean {
    return this._type === "term";
  }

  /**
   * Check equality with another Entity.
   * Compares by id when both have ids, otherwise by type+name.
   */
  equals(other: Entity): boolean {
    // If both have ids, compare by id
    if (this._id !== undefined && other._id !== undefined) {
      return this._id === other._id;
    }

    // Otherwise compare by type + name
    return this._type === other._type && this._name === other._name;
  }

  /**
   * Return a new Entity with the specified id.
   * Used after database insert to assign the generated id.
   */
  withId(id: number): Entity {
    return new Entity({
      id,
      type: this._type,
      name: this._name,
      confidence: this._confidence,
      metadata: this._metadata,
      createdAt: this._createdAt,
    });
  }
}
