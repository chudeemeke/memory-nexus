import { createHash } from "node:crypto";
import { Fact } from "../../domain/entities/fact.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import { MemoryGovernanceEntry } from "../../domain/entities/memory-governance.js";
import { PersonaEntry, type PersonaEntryKind } from "../../domain/entities/persona-entry.js";
import type {
  IFactRepository,
  IFrictionRepository,
  IMemoryGovernanceRepository,
  IPersonaRepository,
} from "../../domain/ports/repositories.js";
import type { MemoryEventScope, MemoryEventVisibility } from "../../domain/entities/memory-event.js";

export interface PersonaProfileServiceDeps {
  factRepo: IFactRepository;
  frictionRepo: IFrictionRepository;
  personaRepo: IPersonaRepository;
  governanceRepo: IMemoryGovernanceRepository;
  now?: () => Date;
}

export interface PersonaRebuildOptions {
  project?: string | undefined;
}

export interface PersonaRebuildResult {
  entries: PersonaEntry[];
  factCount: number;
  frictionPatternCount: number;
}

export class PersonaProfileService {
  private readonly now: () => Date;

  constructor(private readonly deps: PersonaProfileServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async rebuildProfile(options: PersonaRebuildOptions = {}): Promise<PersonaRebuildResult> {
    const facts = options.project
      ? await this.deps.factRepo.findByProject(options.project)
      : await this.deps.factRepo.findAll();
    const activeFacts = facts.filter((fact) => fact.supersededAt === null);
    const factEntries = activeFacts.flatMap((fact) => this.entryFromFact(fact));
    const frictionPatterns = await this.deps.frictionRepo.findPatterns(3);
    const frictionEntries = frictionPatterns
      .filter((pattern) => !options.project || pattern.entries.some((entry) => entry.sourceProject === options.project || !entry.sourceProject))
      .map((pattern) => this.entryFromFrictionPattern(pattern.tool, pattern.category, pattern.count, pattern.entries, options.project));

    const entries = dedupeByEntryId([...factEntries, ...frictionEntries]);

    if (options.project) {
      await this.deps.personaRepo.deleteByProject(options.project);
    } else {
      await this.deps.personaRepo.clearAll();
    }

    const saved = await this.deps.personaRepo.saveMany(entries);
    for (const entry of saved) {
      await this.deps.governanceRepo.save(this.governanceEntryFor(entry));
    }

    return {
      entries: saved,
      factCount: activeFacts.length,
      frictionPatternCount: frictionPatterns.length,
    };
  }

  private entryFromFact(fact: Fact): PersonaEntry[] {
    return personaEntriesFromFact(fact, this.now());
  }

  private entryFromFrictionPattern(
    tool: string,
    category: string,
    count: number,
    entries: FrictionEntry[],
    project?: string,
  ): PersonaEntry {
    const now = this.now();
    const sourceEventIds = entries.map((entry) => `friction:${entry.id ?? entry.loggedAt.toISOString()}`);
    const sample = entries.slice(0, 3).map((entry) => entry.description).join("; ");
    return PersonaEntry.create({
      entryId: stableEntryId("friction_pattern", `${tool}:${category}:${project ?? "global"}`),
      kind: "friction_pattern",
      content: `${tool}/${category} has ${count} recurring friction entries: ${sample}`,
      project,
      visibility: project ? "project" : "global",
      sourceEventIds,
      sourceKinds: ["friction"],
      confidence: Math.min(0.95, 0.65 + count * 0.05),
      scope: project ? { project, visibility: "project" } : { visibility: "global" },
      reviewStatus: "pending_review",
      reviewAfter: addDays(now, 30),
      why: "Derived from recurring friction patterns.",
      createdAt: now,
      updatedAt: now,
    });
  }

  private governanceEntryFor(entry: PersonaEntry): MemoryGovernanceEntry {
    return MemoryGovernanceEntry.create({
      surface: "persona",
      targetId: entry.entryId,
      project: entry.project,
      visibility: entry.visibility,
      sourceEventIds: entry.sourceEventIds,
      transformationMethod: "persona-profile-service",
      actor: "memory",
      confidence: entry.confidence,
      redactionState: "redacted",
      consentStatus: "not_required",
      consentScopes: [],
      scope: entry.scope,
      status: "active",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt,
      lastEventId: entry.sourceEventIds[0],
    });
  }
}

export function personaEntriesFromFact(fact: Fact, now: Date = new Date()): PersonaEntry[] {
  const kind = personaKindForFact(fact);
    if (!kind) {
      return [];
    }

    const metadata = fact.metadata ?? {};
    const visibility = visibilityFromMetadata(metadata);
    const scope = scopeFor(fact.project, visibility);
    const sourceKinds = sourceKindsFor(fact, metadata);
    const reviewAfter = addDays(now, numberFromMetadata(metadata.review_after_days, 30));

    return [
      PersonaEntry.create({
        entryId: stableEntryId(kind, fact.uuid),
        kind,
        content: fact.content,
        project: fact.project,
        visibility,
        sourceEventIds: [fact.uuid],
        sourceKinds,
        confidence: confidenceFor(kind, metadata),
        scope,
        reviewStatus: "pending_review",
        reviewAfter,
        expiresAt: optionalDate(metadata.expires_at),
        why: whyForFact(kind),
        createdAt: now,
        updatedAt: now,
      }),
    ];
}

export function personaEntryFromFactEvent(fact: Fact, now: Date = new Date()): PersonaEntry | null {
  return personaEntriesFromFact(fact, now)[0] ?? null;
}

function personaKindForFact(fact: Fact): PersonaEntryKind | null {
  const metadata = fact.metadata ?? {};
  const explicitKind = stringMetadata(metadata.persona_kind);
  if (explicitKind && isPersonaKind(explicitKind)) {
    return explicitKind;
  }

  const sourceKind = stringMetadata(metadata.source_kind);
  if (sourceKind === "correction") {
    return "correction";
  }
  if (sourceKind === "validated_behavior") {
    return "procedure";
  }
  if (fact.type === "preference") {
    return "preference";
  }
  return null;
}

function sourceKindsFor(fact: Fact, metadata: Record<string, unknown>): string[] {
  const sourceKind = stringMetadata(metadata.source_kind);
  return [sourceKind ?? fact.type];
}

function visibilityFromMetadata(metadata: Record<string, unknown>): MemoryEventVisibility {
  const visibility = stringMetadata(metadata.visibility);
  return visibility === "global" || visibility === "workspace" || visibility === "project" ? visibility : "project";
}

function scopeFor(project: string, visibility: MemoryEventVisibility): MemoryEventScope {
  if (visibility === "project") {
    return { project, visibility };
  }
  return { visibility };
}

function confidenceFor(kind: PersonaEntryKind, metadata: Record<string, unknown>): number {
  const explicit = numberFromMetadata(metadata.confidence, NaN);
  if (Number.isFinite(explicit)) {
    return Math.max(0, Math.min(1, explicit));
  }
  switch (kind) {
    case "correction":
      return 0.88;
    case "procedure":
      return 0.82;
    case "decision_pattern":
      return 0.8;
    case "friction_pattern":
      return 0.75;
    case "preference":
      return 0.85;
  }
}

function whyForFact(kind: PersonaEntryKind): string {
  switch (kind) {
    case "preference":
      return "Derived from an active preference fact.";
    case "correction":
      return "Derived from a repeated correction or explicit behavioral instruction.";
    case "procedure":
      return "Derived from a validated procedural behavior pattern.";
    case "decision_pattern":
      return "Derived from a durable decision pattern.";
    case "friction_pattern":
      return "Derived from recurring friction patterns.";
  }
}

function stableEntryId(kind: PersonaEntryKind, source: string): string {
  return `persona-${kind}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function dedupeByEntryId(entries: PersonaEntry[]): PersonaEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.entryId)) {
      return false;
    }
    seen.add(entry.entryId);
    return true;
  });
}

function stringMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberFromMetadata(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isPersonaKind(value: string): value is PersonaEntryKind {
  return ["preference", "procedure", "correction", "decision_pattern", "friction_pattern"].includes(value);
}
