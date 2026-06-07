import { Fact } from "../../domain/entities/fact.js";
import {
  GraphEdge,
  GRAPH_NODE_TYPES,
  type GraphNodeRef,
  type GraphNodeType,
} from "../../domain/entities/graph-edge.js";
import { MemoryGovernanceEntry } from "../../domain/entities/memory-governance.js";
import type {
  GraphEdgeQueryOptions,
  IFactRepository,
  IGraphRepository,
  IMemoryGovernanceRepository,
} from "../../domain/ports/repositories.js";
import type { IContextGovernancePolicy } from "./smart-context-service.js";
import type { MemoryEventVisibility } from "../../domain/entities/memory-event.js";

export interface TemporalGraphServiceDeps {
  graphRepo: IGraphRepository;
  factRepo?: IFactRepository | undefined;
  governanceRepo?: IMemoryGovernanceRepository | undefined;
  governancePolicy?: IContextGovernancePolicy | undefined;
  now?: (() => Date) | undefined;
}

export interface GraphRebuildOptions {
  project?: string | undefined;
}

export interface GraphRebuildResult {
  edges: GraphEdge[];
  edgeCount: number;
  factCount: number;
}

export class TemporalGraphService {
  private readonly now: () => Date;

  constructor(private readonly deps: TemporalGraphServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async rebuildGraph(options: GraphRebuildOptions = {}): Promise<GraphRebuildResult> {
    if (!this.deps.factRepo) {
      throw new Error("TemporalGraphService requires factRepo to rebuild graph");
    }

    const facts = options.project
      ? await this.deps.factRepo.findByProject(options.project)
      : await this.deps.factRepo.findAll();
    const activeFacts = facts.filter((fact) => fact.supersededAt === null);
    const edges = activeFacts.flatMap((fact) => graphEdgesFromFact(fact, this.now()));

    if (options.project) {
      await this.deps.graphRepo.deleteByProject(options.project);
    } else {
      await this.deps.graphRepo.clearAll();
    }

    const saved = await this.deps.graphRepo.saveMany(dedupeByEdgeId(edges));
    if (this.deps.governanceRepo) {
      for (const edge of saved) {
        await this.deps.governanceRepo.save(governanceEntryForGraphEdge(edge, "graph-service-rebuild"));
      }
    }

    return {
      edges: saved,
      edgeCount: saved.length,
      factCount: activeFacts.length,
    };
  }

  async findContextEdges(options: GraphEdgeQueryOptions): Promise<GraphEdge[]> {
    const edges = await this.deps.graphRepo.findCurrent({
      includeGlobal: true,
      ...options,
    });
    if (!this.deps.governancePolicy || edges.length === 0) {
      return edges;
    }
    return this.deps.governancePolicy.filterAllowed("graph", edges, (edge) => edge.edgeId);
  }

  formatContextLines(edges: GraphEdge[]): string[] {
    return edges.map((edge) => {
      const scope = edge.visibility === "global" ? "global" : edge.project ?? edge.visibility;
      const valid = edge.validTo
        ? `${edge.validFrom.toISOString()} to ${edge.validTo.toISOString()}`
        : `from ${edge.validFrom.toISOString()}`;
      return [
        `- ${edge.source.label} --${edge.relationship}--> ${edge.target.label}`,
        `(id: ${edge.edgeId}; confidence: ${edge.confidence.toFixed(2)}; scope: ${scope}; valid: ${valid}; why: ${edge.why})`,
      ].join(" ");
    });
  }
}

export function graphEdgesFromFact(fact: Fact, now: Date = new Date()): GraphEdge[] {
  const metadata = fact.metadata ?? {};
  const candidates = graphCandidateArray(metadata.graph_edges ?? metadata.graphEdges ?? metadata.relationships);
  const edges: GraphEdge[] = [];

  for (const candidate of candidates) {
    try {
      const visibility = visibilityFromCandidate(candidate.visibility) ?? "project";
      const source = nodeFromCandidate(
        candidate.source,
        optionalGraphNodeType(candidate.sourceType ?? candidate.source_type),
        "project",
      );
      const target = nodeFromCandidate(
        candidate.target,
        optionalGraphNodeType(candidate.targetType ?? candidate.target_type),
        "tool",
      );
      const validFrom = dateFromCandidate(candidate.validFrom ?? candidate.valid_from, fact.observedAt);
      const validTo = optionalDate(candidate.validTo ?? candidate.valid_to);
      const confidence = numberFromCandidate(candidate.confidence, numberFromCandidate(metadata.confidence, 0.75));
      const relationship = stringCandidate(candidate.relationship, "");
      const project = stringCandidate(candidate.project, fact.project);
      const sourceKinds = stringArrayCandidate(candidate.sourceKinds ?? candidate.source_kinds, [sourceKindForFact(fact, metadata)]);
      const candidateSourceEventIds = stringArrayCandidate(candidate.sourceEventIds ?? candidate.source_event_ids, []);
      const sourceEventIds = uniqueStrings([fact.uuid, ...candidateSourceEventIds]);
      const why = stringCandidate(candidate.why, `Derived from an active ${fact.type} fact.`);

      edges.push(GraphEdge.create({
        edgeId: stringCandidate(candidate.id ?? candidate.edgeId ?? candidate.edge_id, undefined),
        source,
        target,
        relationship,
        project: visibility === "project" ? project : undefined,
        visibility,
        sourceEventIds,
        sourceKinds,
        confidence,
        validFrom,
        validTo,
        why,
        metadata: recordCandidate(candidate.metadata),
        createdAt: now,
        updatedAt: now,
      }));
    } catch {
      // Malformed graph candidates are ignored rather than turning the whole
      // projection replay into a failure. The raw fact remains inspectable.
    }
  }

  return edges;
}

export function governanceEntryForGraphEdge(
  edge: GraphEdge,
  transformationMethod: string,
): MemoryGovernanceEntry {
  return MemoryGovernanceEntry.create({
    surface: "graph",
    targetId: edge.edgeId,
    project: edge.project,
    visibility: edge.visibility,
    sourceEventIds: edge.sourceEventIds,
    transformationMethod,
    actor: "memory",
    confidence: edge.confidence,
    redactionState: "redacted",
    consentStatus: "not_required",
    consentScopes: [],
    scope: edge.scope,
    status: "active",
    createdAt: edge.createdAt,
    updatedAt: edge.updatedAt,
    lastEventId: edge.sourceEventIds[0],
  });
}

function graphCandidateArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function nodeFromCandidate(
  value: unknown,
  explicitType: GraphNodeType | undefined,
  fallbackType: GraphNodeType,
): GraphNodeRef {
  if (isRecord(value)) {
    const type = optionalGraphNodeType(value.type) ?? explicitType ?? fallbackType;
    const id = stringCandidate(value.id, stringCandidate(value.label, ""));
    const label = stringCandidate(value.label, id);
    return { type, id, label };
  }

  const id = stringCandidate(value, "");
  return { type: explicitType ?? fallbackType, id, label: id };
}

function optionalGraphNodeType(value: unknown): GraphNodeType | undefined {
  return typeof value === "string" && GRAPH_NODE_TYPES.includes(value as GraphNodeType)
    ? value as GraphNodeType
    : undefined;
}

function visibilityFromCandidate(value: unknown): MemoryEventVisibility | undefined {
  return value === "project" || value === "workspace" || value === "global"
    ? value
    : undefined;
}

function stringCandidate(value: unknown, fallback: string): string;
function stringCandidate(value: unknown, fallback: undefined): string | undefined;
function stringCandidate(value: unknown, fallback: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberFromCandidate(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateFromCandidate(value: unknown, fallback: Date): Date {
  const date = optionalDate(value);
  return date ?? fallback;
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringArrayCandidate(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const result = value.map((item) => String(item)).filter((item) => item.trim().length > 0);
  return result.length > 0 ? result : fallback;
}

function recordCandidate(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : undefined;
}

function sourceKindForFact(fact: Fact, metadata: Record<string, unknown>): string {
  return stringCandidate(metadata.source_kind, fact.type);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function dedupeByEdgeId(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.edgeId)) {
      return false;
    }
    seen.add(edge.edgeId);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
