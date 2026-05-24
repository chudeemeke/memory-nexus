/**
 * Fact Domain Entity
 *
 * Represents a structured fact or event in the system.
 * Part of the hybrid event-log Source of Truth (SSOT).
 * 
 * Immutable after construction.
 */

import { randomUUID } from "crypto";

export type FactType =
  | "decision"
  | "learning"
  | "preference"
  | "friction"
  | "observation"
  | "supersedence";

export interface FactParams {
  id?: number | undefined;
  uuid?: string | undefined;
  type: FactType;
  project: string;
  content: string;
  metadata?: Record<string, any> | undefined;
  observedAt: Date;
  supersededAt?: Date | null | undefined;
  supersededBy?: string | null | undefined;
}

export interface CandidateFact {
  type: "decision" | "learning" | "preference" | "friction" | "observation";
  content: string;
  metadata?: Record<string, any> | undefined;
  confidence: number;
}

export class Fact {
  private readonly _id?: number | undefined;
  private readonly _uuid: string;
  private readonly _type: FactType;
  private readonly _project: string;
  private readonly _content: string;
  private readonly _metadata?: Record<string, any> | undefined;
  private readonly _observedAt: Date;
  private readonly _supersededAt: Date | null;
  private readonly _supersededBy: string | null;


  private constructor(params: FactParams) {
    this._id = params.id;
    this._uuid = params.uuid ?? randomUUID();
    this._type = params.type;
    this._project = params.project;
    this._content = params.content;
    
    // Deep copy metadata to prevent mutations
    this._metadata = params.metadata
      ? JSON.parse(JSON.stringify(params.metadata))
      : undefined;

    this._observedAt = new Date(params.observedAt.getTime());
    this._supersededAt = params.supersededAt
      ? new Date(params.supersededAt.getTime())
      : null;
    this._supersededBy = params.supersededBy ?? null;
  }

  /**
   * Creates a Fact entity and validates invariants.
   */
  static create(params: FactParams): Fact {
    if (!params.project || params.project.trim() === "") {
      throw new Error("Fact project cannot be empty");
    }
    if (!params.content || params.content.trim() === "") {
      throw new Error("Fact content cannot be empty");
    }
    
    const validTypes: FactType[] = [
      "decision",
      "learning",
      "preference",
      "friction",
      "observation",
      "supersedence"
    ];
    if (!validTypes.includes(params.type)) {
      throw new Error("Invalid fact type");
    }

    return new Fact(params);
  }

  get id(): number | undefined {
    return this._id;
  }

  get uuid(): string {
    return this._uuid;
  }

  get type(): FactType {
    return this._type;
  }

  get project(): string {
    return this._project;
  }

  get content(): string {
    return this._content;
  }

  get metadata(): Record<string, any> | undefined {
    return this._metadata
      ? JSON.parse(JSON.stringify(this._metadata))
      : undefined;
  }

  get observedAt(): Date {
    return new Date(this._observedAt.getTime());
  }

  get supersededAt(): Date | null {
    return this._supersededAt
      ? new Date(this._supersededAt.getTime())
      : null;
  }

  get supersededBy(): string | null {
    return this._supersededBy;
  }

  /**
   * Returns a new Fact instance with the specified database primary key ID.
   */
  withId(id: number): Fact {
    return new Fact({
      id,
      uuid: this._uuid,
      type: this._type,
      project: this._project,
      content: this._content,
      metadata: this._metadata,
      observedAt: this._observedAt,
      supersededAt: this._supersededAt,
      supersededBy: this._supersededBy,
    });
  }

  /**
   * Returns a new Fact instance marked as superseded by a replacement Fact.
   */
  withSuperseded(supersededAt: Date, supersededByUuid: string): Fact {
    return new Fact({
      id: this._id,
      uuid: this._uuid,
      type: this._type,
      project: this._project,
      content: this._content,
      metadata: this._metadata,
      observedAt: this._observedAt,
      supersededAt,
      supersededBy: supersededByUuid,
    });
  }
}
