import { createHash } from "node:crypto";
import type { MemoryEventScope, MemoryEventVisibility } from "./memory-event.js";

export const GRAPH_NODE_TYPES = [
  "project",
  "tool",
  "person",
  "decision",
  "error",
  "plan",
  "file",
  "command",
  "capability",
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export interface GraphNodeRef {
  type: GraphNodeType;
  id: string;
  label: string;
}

export interface GraphEdgeParams {
  id?: number | undefined;
  edgeId?: string | undefined;
  source: GraphNodeRef;
  target: GraphNodeRef;
  relationship: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  sourceEventIds: string[];
  sourceKinds: string[];
  confidence: number;
  validFrom: Date;
  validTo?: Date | null | undefined;
  why: string;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphEdgeJson {
  id?: number | undefined;
  edge_id: string;
  source: GraphNodeRef;
  target: GraphNodeRef;
  relationship: string;
  project?: string | undefined;
  visibility: MemoryEventVisibility;
  source_event_ids: string[];
  source_kinds: string[];
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  why: string;
  scope: MemoryEventScope;
  metadata?: Record<string, unknown> | undefined;
  controls: string[];
  created_at: string;
  updated_at: string;
}

const RELATIONSHIP_PATTERN = /^[a-z][a-z0-9_-]*(?:[.:][a-z0-9_-]+)*$/;
const GRAPH_EDGE_CONTROLS = ["suppress", "invalidate", "expire", "review"] as const;

export class GraphEdge {
  private readonly _id?: number | undefined;
  private readonly _edgeId: string;
  private readonly _source: GraphNodeRef;
  private readonly _target: GraphNodeRef;
  private readonly _relationship: string;
  private readonly _project?: string | undefined;
  private readonly _visibility: MemoryEventVisibility;
  private readonly _sourceEventIds: string[];
  private readonly _sourceKinds: string[];
  private readonly _confidence: number;
  private readonly _validFrom: Date;
  private readonly _validTo: Date | null;
  private readonly _why: string;
  private readonly _metadata?: Record<string, unknown> | undefined;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(params: GraphEdgeParams) {
    this._id = params.id;
    this._source = cloneNode(params.source);
    this._target = cloneNode(params.target);
    this._relationship = params.relationship.trim();
    this._project = params.project?.trim() || undefined;
    this._visibility = params.visibility;
    this._sourceEventIds = [...params.sourceEventIds];
    this._sourceKinds = [...params.sourceKinds];
    this._confidence = params.confidence;
    this._validFrom = new Date(params.validFrom.getTime());
    this._validTo = params.validTo ? new Date(params.validTo.getTime()) : null;
    this._why = params.why.trim();
    this._metadata = params.metadata ? cloneRecord(params.metadata) : undefined;
    this._createdAt = new Date(params.createdAt.getTime());
    this._updatedAt = new Date(params.updatedAt.getTime());
    this._edgeId = params.edgeId?.trim() || stableEdgeId(this);
  }

  static create(params: GraphEdgeParams): GraphEdge {
    validateNode(params.source, "source");
    validateNode(params.target, "target");
    validateRelationship(params.relationship);
    validateVisibility(params.visibility);

    if (params.visibility === "project" && (!params.project || !params.project.trim())) {
      throw new Error("project is required for project-visible graph edges");
    }
    if (!Array.isArray(params.sourceEventIds) || params.sourceEventIds.length === 0) {
      throw new Error("Graph edge sourceEventIds must include at least one source id");
    }
    if (!Array.isArray(params.sourceKinds) || params.sourceKinds.length === 0) {
      throw new Error("Graph edge sourceKinds must include at least one source kind");
    }
    if (!Number.isFinite(params.confidence) || params.confidence < 0 || params.confidence > 1) {
      throw new Error("Graph edge confidence must be between 0 and 1");
    }
    if (!isValidDate(params.validFrom)) {
      throw new Error("Graph edge validFrom must be a valid date");
    }
    if (params.validTo !== undefined && params.validTo !== null && !isValidDate(params.validTo)) {
      throw new Error("Graph edge validTo must be a valid date");
    }
    if (params.validTo && params.validTo <= params.validFrom) {
      throw new Error("Graph edge validTo must be after validFrom");
    }
    if (!params.why || !params.why.trim()) {
      throw new Error("Graph edge why is required");
    }
    if (!isValidDate(params.createdAt) || !isValidDate(params.updatedAt)) {
      throw new Error("Graph edge timestamps must be valid dates");
    }

    return new GraphEdge(params);
  }

  get id(): number | undefined {
    return this._id;
  }

  get edgeId(): string {
    return this._edgeId;
  }

  get source(): GraphNodeRef {
    return cloneNode(this._source);
  }

  get target(): GraphNodeRef {
    return cloneNode(this._target);
  }

  get relationship(): string {
    return this._relationship;
  }

  get project(): string | undefined {
    return this._project;
  }

  get visibility(): MemoryEventVisibility {
    return this._visibility;
  }

  get sourceEventIds(): string[] {
    return [...this._sourceEventIds];
  }

  get sourceKinds(): string[] {
    return [...this._sourceKinds];
  }

  get confidence(): number {
    return this._confidence;
  }

  get validFrom(): Date {
    return new Date(this._validFrom.getTime());
  }

  get validTo(): Date | null {
    return this._validTo ? new Date(this._validTo.getTime()) : null;
  }

  get why(): string {
    return this._why;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this._metadata ? cloneRecord(this._metadata) : undefined;
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  get scope(): MemoryEventScope {
    return this._visibility === "project"
      ? { project: this._project, visibility: "project" }
      : { visibility: this._visibility };
  }

  get controls(): string[] {
    return [...GRAPH_EDGE_CONTROLS];
  }

  isCurrent(asOf: Date, minConfidence = 0.7): boolean {
    return this._validFrom <= asOf &&
      (!this._validTo || this._validTo > asOf) &&
      this._confidence >= minConfidence;
  }

  withId(id: number): GraphEdge {
    return GraphEdge.create({
      id,
      edgeId: this._edgeId,
      source: this._source,
      target: this._target,
      relationship: this._relationship,
      project: this._project,
      visibility: this._visibility,
      sourceEventIds: this._sourceEventIds,
      sourceKinds: this._sourceKinds,
      confidence: this._confidence,
      validFrom: this._validFrom,
      validTo: this._validTo,
      why: this._why,
      metadata: this._metadata,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    });
  }

  toJSON(): GraphEdgeJson {
    return {
      ...(this._id !== undefined ? { id: this._id } : {}),
      edge_id: this._edgeId,
      source: this.source,
      target: this.target,
      relationship: this._relationship,
      ...(this._project !== undefined ? { project: this._project } : {}),
      visibility: this._visibility,
      source_event_ids: this.sourceEventIds,
      source_kinds: this.sourceKinds,
      confidence: this._confidence,
      valid_from: this._validFrom.toISOString(),
      valid_to: this._validTo ? this._validTo.toISOString() : null,
      why: this._why,
      scope: this.scope,
      ...(this._metadata !== undefined ? { metadata: this.metadata } : {}),
      controls: this.controls,
      created_at: this._createdAt.toISOString(),
      updated_at: this._updatedAt.toISOString(),
    };
  }
}

function stableEdgeId(edge: GraphEdge): string {
  const input = [
    edge.source.type,
    edge.source.id,
    edge.relationship,
    edge.target.type,
    edge.target.id,
    edge.project ?? "",
    edge.visibility,
  ].join("|");
  return `graph-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

function validateNode(node: GraphNodeRef, side: "source" | "target"): void {
  if (!GRAPH_NODE_TYPES.includes(node.type)) {
    throw new Error(`Invalid graph node type: ${node.type}`);
  }
  if (!node.id || !node.id.trim()) {
    throw new Error(`Graph edge ${side}.id is required`);
  }
  if (!node.label || !node.label.trim()) {
    throw new Error(`Graph edge ${side}.label is required`);
  }
}

function validateRelationship(relationship: string): void {
  if (!relationship || !RELATIONSHIP_PATTERN.test(relationship.trim())) {
    throw new Error(`Invalid graph relationship: ${relationship}`);
  }
}

function validateVisibility(value: MemoryEventVisibility): void {
  if (value !== "project" && value !== "workspace" && value !== "global") {
    throw new Error(`Invalid graph visibility: ${value}`);
  }
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function cloneNode(node: GraphNodeRef): GraphNodeRef {
  return {
    type: node.type,
    id: node.id,
    label: node.label,
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
