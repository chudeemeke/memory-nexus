import type { Fact, FactType } from "../../domain/entities/fact.js";
import type { GraphEdge } from "../../domain/entities/graph-edge.js";
import type { MemoryGovernanceStatus } from "../../domain/entities/memory-governance.js";
import type {
  MemoryUtilityMetric,
  MemoryUtilitySurface,
} from "../../domain/entities/memory-utility-metric.js";
import type { PersonaEntry, PersonaEntryKind } from "../../domain/entities/persona-entry.js";

export type MemoryRankKind = MemoryUtilitySurface;

export interface MemoryRankCandidate {
  id: string;
  kind: MemoryRankKind;
  memoryType?: string | undefined;
  content: string;
  project?: string | undefined;
  observedAt?: Date | undefined;
  validFrom?: Date | undefined;
  validTo?: Date | null | undefined;
  supersededAt?: Date | null | undefined;
  confidence?: number | undefined;
  importance?: number | undefined;
  utility?: number | undefined;
  evergreen?: boolean | undefined;
  pinned?: boolean | undefined;
  recencyNoisePenalty?: number | undefined;
  governanceStatus?: MemoryGovernanceStatus | "reviewed" | undefined;
  metric?: MemoryUtilityMetric | undefined;
}

export interface RankedMemoryComponents {
  importance: number;
  utility: number;
  confidence: number;
  accessBoost: number;
  accessCount: number;
  halfLifeDays: number;
  ageDays: number;
  decayMultiplier: number;
  recencyNoisePenalty: number;
  baseScore: number;
  finalScore: number;
}

export interface RankedMemory extends MemoryRankCandidate {
  score: number;
  whyIncluded: string;
  components: RankedMemoryComponents;
}

export interface MemoryRankingPolicy {
  defaultHalfLifeDays?: number | undefined;
  halfLifeByKind?: Partial<Record<MemoryRankKind, number>> | undefined;
  halfLifeByFactType?: Partial<Record<FactType, number>> | undefined;
  halfLifeByPersonaKind?: Partial<Record<PersonaEntryKind, number>> | undefined;
}

interface ResolvedMemoryRankingPolicy {
  defaultHalfLifeDays: number;
  halfLifeByKind: Record<MemoryRankKind, number>;
  halfLifeByFactType: Record<FactType, number>;
  halfLifeByPersonaKind: Record<PersonaEntryKind, number>;
}

export interface MemoryRankingServiceDeps {
  now?: (() => Date) | undefined;
  policy?: MemoryRankingPolicy | undefined;
}

const BLOCKED_GOVERNANCE_STATUSES = new Set<MemoryGovernanceStatus>([
  "pending_review",
  "suppressed",
  "invalidated",
  "expired",
]);

const DEFAULT_HALF_LIFE_DAYS = 90;
const DEFAULT_KIND_HALF_LIFE: Record<MemoryRankKind, number> = {
  fact: 90,
  persona: 180,
  graph: 120,
  link: 60,
  dream: 30,
};
const DEFAULT_FACT_HALF_LIFE: Record<FactType, number> = {
  decision: 365,
  learning: 180,
  preference: 365,
  friction: 45,
  observation: 14,
  supersedence: 365,
};
const DEFAULT_PERSONA_HALF_LIFE: Record<PersonaEntryKind, number> = {
  preference: 365,
  procedure: 365,
  correction: 240,
  decision_pattern: 180,
  friction_pattern: 120,
};

export class MemoryRankingService {
  private readonly now: () => Date;
  private readonly policy: ResolvedMemoryRankingPolicy;

  constructor(deps: MemoryRankingServiceDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.policy = {
      defaultHalfLifeDays: deps.policy?.defaultHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
      halfLifeByKind: { ...DEFAULT_KIND_HALF_LIFE, ...(deps.policy?.halfLifeByKind ?? {}) },
      halfLifeByFactType: { ...DEFAULT_FACT_HALF_LIFE, ...(deps.policy?.halfLifeByFactType ?? {}) },
      halfLifeByPersonaKind: { ...DEFAULT_PERSONA_HALF_LIFE, ...(deps.policy?.halfLifeByPersonaKind ?? {}) },
    };
  }

  rank(candidates: MemoryRankCandidate[]): RankedMemory[] {
    const asOf = this.now();
    return candidates
      .filter((candidate) => this.isEligible(candidate, asOf))
      .map((candidate) => this.scoreCandidate(candidate, asOf))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.id.localeCompare(b.id);
      });
  }

  private isEligible(candidate: MemoryRankCandidate, asOf: Date): boolean {
    if (!candidate.id.trim() || !candidate.content.trim()) {
      return false;
    }
    if (candidate.supersededAt) {
      return false;
    }
    if (candidate.governanceStatus && BLOCKED_GOVERNANCE_STATUSES.has(candidate.governanceStatus as MemoryGovernanceStatus)) {
      return false;
    }
    if (candidate.validFrom && candidate.validFrom > asOf) {
      return false;
    }
    if (candidate.validTo && candidate.validTo <= asOf) {
      return false;
    }
    return true;
  }

  private scoreCandidate(candidate: MemoryRankCandidate, asOf: Date): RankedMemory {
    const metric = candidate.metric;
    const importance = clamp01(metric?.importanceScore ?? candidate.importance ?? defaultImportance(candidate));
    const utility = clamp01(metric?.utilityScore ?? candidate.utility ?? 0.5);
    const confidence = clamp01(candidate.confidence ?? confidenceFromMetric(metric));
    const accessCount = Math.max(0, metric?.accessCount ?? 0);
    const accessBoost = clamp01(Math.log1p(accessCount) / Math.log(16));
    const evergreen = metric?.evergreen === true || candidate.evergreen === true;
    const pinned = metric?.pinned === true || candidate.pinned === true;
    const halfLifeDays = metric?.halfLifeDays ?? this.resolveHalfLifeDays(candidate);
    const ageBasis = candidate.observedAt ?? candidate.validFrom ?? metric?.lastAccessedAt ?? asOf;
    const ageDays = Math.max(0, (asOf.getTime() - ageBasis.getTime()) / 86_400_000);
    const decayMultiplier = evergreen || pinned ? 1 : Math.pow(0.5, ageDays / halfLifeDays);
    const recencyNoisePenalty = clamp01(candidate.recencyNoisePenalty ?? 0);
    const baseScore = clamp01(
      (0.34 * importance) +
      (0.26 * utility) +
      (0.18 * confidence) +
      (0.12 * accessBoost) +
      (evergreen ? 0.06 : 0) +
      (pinned ? 0.08 : 0),
    );
    const finalScore = clamp01((baseScore * decayMultiplier) - recencyNoisePenalty);
    const components: RankedMemoryComponents = {
      importance,
      utility,
      confidence,
      accessBoost,
      accessCount,
      halfLifeDays,
      ageDays,
      decayMultiplier,
      recencyNoisePenalty,
      baseScore,
      finalScore,
    };

    return {
      ...candidate,
      evergreen,
      pinned,
      score: finalScore,
      whyIncluded: whyIncluded(candidate, components, evergreen, pinned),
      components,
    };
  }

  private resolveHalfLifeDays(candidate: MemoryRankCandidate): number {
    if (candidate.kind === "fact" && isFactType(candidate.memoryType)) {
      return this.policy.halfLifeByFactType[candidate.memoryType] ?? this.policy.defaultHalfLifeDays;
    }
    if (candidate.kind === "persona" && isPersonaKind(candidate.memoryType)) {
      return this.policy.halfLifeByPersonaKind[candidate.memoryType] ?? this.policy.defaultHalfLifeDays;
    }
    return this.policy.halfLifeByKind[candidate.kind] ?? this.policy.defaultHalfLifeDays;
  }
}

export function candidateFromFact(fact: Fact, metric?: MemoryUtilityMetric | undefined): MemoryRankCandidate {
  const metadata = fact.metadata ?? {};
  return {
    id: fact.uuid,
    kind: "fact",
    memoryType: fact.type,
    content: fact.content,
    project: fact.project,
    observedAt: fact.observedAt,
    supersededAt: fact.supersededAt,
    confidence: optionalNumber(metadata.confidence),
    importance: optionalNumber(metadata.importance),
    utility: optionalNumber(metadata.utility),
    evergreen: optionalBoolean(metadata.evergreen),
    pinned: optionalBoolean(metadata.pinned),
    recencyNoisePenalty: optionalNumber(metadata.recencyNoisePenalty),
    governanceStatus: optionalGovernanceStatus(metadata.governanceStatus),
    metric,
  };
}

export function candidateFromPersonaEntry(entry: PersonaEntry, metric?: MemoryUtilityMetric | undefined): MemoryRankCandidate {
  return {
    id: entry.entryId,
    kind: "persona",
    memoryType: entry.kind,
    content: entry.content,
    project: entry.project,
    observedAt: entry.updatedAt,
    validTo: entry.expiresAt,
    confidence: entry.confidence,
    metric,
  };
}

export function candidateFromGraphEdge(edge: GraphEdge, metric?: MemoryUtilityMetric | undefined): MemoryRankCandidate {
  const metadata = edge.metadata ?? {};
  return {
    id: edge.edgeId,
    kind: "graph",
    memoryType: edge.relationship,
    content: `${edge.source.label} --${edge.relationship}--> ${edge.target.label}`,
    project: edge.project,
    observedAt: edge.validFrom,
    validFrom: edge.validFrom,
    validTo: edge.validTo,
    confidence: edge.confidence,
    importance: optionalNumber(metadata.importance),
    utility: optionalNumber(metadata.utility),
    evergreen: optionalBoolean(metadata.evergreen),
    pinned: optionalBoolean(metadata.pinned),
    recencyNoisePenalty: optionalNumber(metadata.recencyNoisePenalty),
    governanceStatus: optionalGovernanceStatus(metadata.governanceStatus),
    metric,
  };
}

function whyIncluded(
  candidate: MemoryRankCandidate,
  components: RankedMemoryComponents,
  evergreen: boolean,
  pinned: boolean,
): string {
  const tags = [
    "active",
    `kind=${candidate.kind}`,
    candidate.memoryType ? `type=${candidate.memoryType}` : null,
    `importance=${formatScore(components.importance)}`,
    `utility=${formatScore(components.utility)}`,
    `confidence=${formatScore(components.confidence)}`,
    `access_count=${components.accessCount}`,
    `decay=${formatScore(components.decayMultiplier)}`,
    evergreen ? "evergreen" : null,
    pinned ? "pinned" : null,
    `score=${formatScore(components.finalScore)}`,
  ].filter((item): item is string => item !== null);
  return tags.join("; ");
}

function defaultImportance(candidate: MemoryRankCandidate): number {
  if (candidate.kind === "persona" || candidate.kind === "graph") {
    return 0.65;
  }
  if (candidate.kind === "fact") {
    switch (candidate.memoryType) {
      case "decision":
      case "preference":
      case "supersedence":
        return 0.7;
      case "learning":
        return 0.6;
      case "friction":
        return 0.55;
      case "observation":
        return 0.35;
      default:
        return 0.5;
    }
  }
  return 0.5;
}

function confidenceFromMetric(metric: MemoryUtilityMetric | undefined): number {
  return metric ? Math.max(metric.importanceScore, metric.utilityScore, 0.5) : 0.8;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function formatScore(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalGovernanceStatus(value: unknown): MemoryGovernanceStatus | undefined {
  if (value === "active" || value === "pending_review" || value === "suppressed" || value === "invalidated" || value === "expired") {
    return value;
  }
  return undefined;
}

function isFactType(value: string | undefined): value is FactType {
  return value === "decision" ||
    value === "learning" ||
    value === "preference" ||
    value === "friction" ||
    value === "observation" ||
    value === "supersedence";
}

function isPersonaKind(value: string | undefined): value is PersonaEntryKind {
  return value === "preference" ||
    value === "procedure" ||
    value === "correction" ||
    value === "decision_pattern" ||
    value === "friction_pattern";
}
