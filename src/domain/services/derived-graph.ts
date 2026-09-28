import { GraphEdge } from "../entities/graph-edge.js";

/** Evidence may reinforce an edge, but may not change what its identity means. */
export function mergeDerivedGraph(previous: GraphEdge | null, incoming: GraphEdge, sourceIds: string[]): GraphEdge {
  if (previous && (previous.edgeId !== incoming.edgeId ||
      previous.source.type !== incoming.source.type || previous.source.id !== incoming.source.id ||
      previous.target.type !== incoming.target.type || previous.target.id !== incoming.target.id ||
      previous.relationship !== incoming.relationship || previous.project !== incoming.project || previous.visibility !== incoming.visibility)) {
    throw new Error("Derived graph identity conflict");
  }
  const validFrom = previous && previous.validFrom > incoming.validFrom ? previous.validFrom : incoming.validFrom;
  const validTo = previous?.validTo && (!incoming.validTo || previous.validTo < incoming.validTo) ? previous.validTo : incoming.validTo;
  return GraphEdge.create({
    edgeId: incoming.edgeId, source: incoming.source, target: incoming.target,
    relationship: incoming.relationship, project: incoming.project, visibility: incoming.visibility,
    sourceEventIds: [...new Set([...(previous?.sourceEventIds ?? []), ...incoming.sourceEventIds, ...sourceIds])],
    sourceKinds: [...new Set([...(previous?.sourceKinds ?? []), ...incoming.sourceKinds])],
    confidence: incoming.confidence, validFrom, validTo,
    why: incoming.why, metadata: incoming.metadata,
    createdAt: previous?.createdAt ?? incoming.createdAt, updatedAt: incoming.updatedAt,
  });
}
