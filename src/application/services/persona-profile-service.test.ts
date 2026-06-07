import { describe, expect, test } from "bun:test";
import {
  PersonaProfileService,
  personaEntriesFromFact,
  personaEntryFromFactEvent,
} from "./persona-profile-service.js";
import { Fact } from "../../domain/entities/fact.js";
import { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type {
  IFactRepository,
  IFrictionRepository,
  FrictionStats,
  FrictionPattern,
  IPersonaRepository,
  IMemoryGovernanceRepository,
  MemoryGovernanceListOptions,
} from "../../domain/ports/repositories.js";
import type { PersonaEntry } from "../../domain/entities/persona-entry.js";
import type { MemoryGovernanceEntry, MemoryGovernanceSurface } from "../../domain/entities/memory-governance.js";
import type { MemoryEventEnvelope } from "../../domain/entities/memory-event.js";

const NOW = new Date("2026-06-07T00:00:00.000Z");

describe("PersonaProfileService", () => {
  test("compiles active preferences, corrections, procedural facts, decisions, and friction patterns", async () => {
    const preference = makeFact({
      uuid: "fact-preference",
      type: "preference",
      project: "memory-nexus",
      content: "Prefer durable disk artifacts for continuity work.",
      metadata: { source_kind: "preference", confidence: 0.91, review_after_days: 30 },
    });
    const correction = makeFact({
      uuid: "fact-correction",
      type: "learning",
      project: "memory-nexus",
      content: "Do not treat pre-existing failures as out of scope.",
      metadata: { persona_kind: "correction", source_kind: "correction", confidence: 0.88 },
    });
    const procedure = makeFact({
      uuid: "fact-procedure",
      type: "learning",
      project: "memory-nexus",
      content: "Use symlinked project paths when running commands.",
      metadata: { persona_kind: "procedure", source_kind: "validated_behavior", visibility: "global" },
    });
    const superseded = makeFact({
      uuid: "fact-superseded",
      type: "preference",
      project: "memory-nexus",
      content: "Old preference",
      supersededAt: new Date("2026-06-06T00:00:00.000Z"),
    });

    const personaRepo = createPersonaRepo();
    const governanceRepo = createGovernanceRepo();
    const service = new PersonaProfileService({
      factRepo: createFactRepo([preference, correction, procedure, superseded]),
      frictionRepo: createFrictionRepo([
        {
          tool: "memory",
          category: "context",
          count: 3,
          entries: [
            makeFrictionEntry(1, "memory context missed project state"),
            makeFrictionEntry(2, "memory context missed stale state"),
            makeFrictionEntry(3, "memory context missed current task"),
          ],
        },
      ]),
      personaRepo,
      governanceRepo,
      now: () => NOW,
    });

    const result = await service.rebuildProfile({ project: "memory-nexus" });

    expect(result.entries.map((entry) => entry.kind).sort()).toEqual([
      "correction",
      "friction_pattern",
      "preference",
      "procedure",
    ]);
    expect(result.entries.some((entry) => entry.content === "Old preference")).toBe(false);
    expect(personaRepo.saved).toHaveLength(4);
    expect(governanceRepo.saved.map((entry) => entry.surface)).toEqual(["persona", "persona", "persona", "persona"]);
    expect(governanceRepo.saved.every((entry) => entry.sourceEventIds.length > 0)).toBe(true);
    expect(result.entries.find((entry) => entry.kind === "procedure")?.visibility).toBe("global");
  });

  test("does not compile unrelated project-private facts for a project rebuild", async () => {
    const personaRepo = createPersonaRepo();
    const service = new PersonaProfileService({
      factRepo: createFactRepo([
        makeFact({
          uuid: "authkey-pref",
          type: "preference",
          project: "authkey",
          content: "authkey preference",
        }),
        makeFact({
          uuid: "memory-pref",
          type: "preference",
          project: "memory-nexus",
          content: "memory preference",
        }),
      ]),
      frictionRepo: createFrictionRepo([]),
      personaRepo,
      governanceRepo: createGovernanceRepo(),
      now: () => NOW,
    });

    const result = await service.rebuildProfile({ project: "memory-nexus" });

    expect(result.entries.map((entry) => entry.content)).toEqual(["memory preference"]);
    expect(personaRepo.deletedProjects).toEqual(["memory-nexus"]);
  });

  test("global rebuild clears all entries, dedupes facts, and derives global friction without an injected clock", async () => {
    const duplicateOne = makeFact({
      uuid: "duplicate-pref",
      type: "preference",
      project: "memory-nexus",
      content: "First duplicate preference.",
    });
    const duplicateTwo = makeFact({
      uuid: "duplicate-pref",
      type: "preference",
      project: "memory-nexus",
      content: "Second duplicate preference should be deduped.",
    });
    const personaRepo = createPersonaRepo();
    const service = new PersonaProfileService({
      factRepo: createFactRepo([duplicateOne, duplicateTwo]),
      frictionRepo: createFrictionRepo([
        {
          tool: "memory",
          category: "sync",
          count: 5,
          entries: [
            makeFrictionEntry(undefined, "sync failed without a source project"),
            makeFrictionEntry(4, "sync failed for an authkey-only project", "authkey"),
            makeFrictionEntry(5, "sync failed again for memory", "memory-nexus"),
          ],
        },
      ]),
      personaRepo,
      governanceRepo: createGovernanceRepo(),
    });

    const result = await service.rebuildProfile();

    expect(personaRepo.cleared).toBe(true);
    expect(personaRepo.deletedProjects).toEqual([]);
    expect(result.entries.map((entry) => entry.kind).sort()).toEqual(["friction_pattern", "preference"]);
    expect(result.entries.find((entry) => entry.kind === "friction_pattern")?.visibility).toBe("global");
    expect(result.entries.find((entry) => entry.kind === "friction_pattern")?.sourceEventIds[0])
      .toBe(`friction:${NOW.toISOString()}`);
  });

  test("persona fact derivation handles metadata fallbacks, bounds, expiry, and null events", () => {
    const decision = personaEntriesFromFact(makeFact({
      uuid: "decision-pattern",
      type: "learning",
      project: "memory-nexus",
      content: "Prefer first-principles decisions before option comparison.",
      metadata: {
        persona_kind: "decision_pattern",
        visibility: "workspace",
        confidence: 2,
        expires_at: "2026-08-07T00:00:00.000Z",
      },
    }), NOW)[0];
    const lowConfidence = personaEntriesFromFact(makeFact({
      uuid: "low-confidence",
      type: "learning",
      project: "memory-nexus",
      content: "Low confidence correction.",
      metadata: { persona_kind: "correction", confidence: -0.2 },
    }), NOW)[0];
    const sourceCorrection = personaEntriesFromFact(makeFact({
      uuid: "source-correction",
      type: "learning",
      project: "memory-nexus",
      content: "Do not silently change user decisions.",
      metadata: { source_kind: "correction", confidence: "not-a-number" },
    }), NOW)[0];
    const validatedProcedure = personaEntriesFromFact(makeFact({
      uuid: "validated-procedure",
      type: "learning",
      project: "memory-nexus",
      content: "Use capability injection for optional first-party tools.",
      metadata: { source_kind: "validated_behavior", visibility: 123 },
    }), NOW)[0];
    const frictionPersona = personaEntriesFromFact(makeFact({
      uuid: "fact-friction",
      type: "learning",
      project: "memory-nexus",
      content: "Repeated context misses should become visible friction memory.",
      metadata: { persona_kind: "friction_pattern" },
    }), NOW)[0];
    const invalidExpiry = personaEntriesFromFact(makeFact({
      uuid: "invalid-expiry",
      type: "preference",
      project: "memory-nexus",
      content: "Invalid expiry should not break derivation.",
      metadata: { expires_at: "not-a-date" },
    }), NOW)[0];
    const notPersonaFact = makeFact({
      uuid: "plain-observation",
      type: "observation",
      project: "memory-nexus",
      content: "Plain observations are not persona entries.",
    });

    expect(decision?.kind).toBe("decision_pattern");
    expect(decision?.visibility).toBe("workspace");
    expect(decision?.confidence).toBe(1);
    expect(decision?.expiresAt?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(lowConfidence?.confidence).toBe(0);
    expect(sourceCorrection?.kind).toBe("correction");
    expect(sourceCorrection?.confidence).toBe(0.88);
    expect(validatedProcedure?.kind).toBe("procedure");
    expect(validatedProcedure?.scope).toEqual({ project: "memory-nexus", visibility: "project" });
    expect(frictionPersona?.kind).toBe("friction_pattern");
    expect(frictionPersona?.why).toBe("Derived from recurring friction patterns.");
    expect(frictionPersona?.confidence).toBe(0.75);
    expect(invalidExpiry?.expiresAt).toBeNull();
    expect(personaEntriesFromFact(notPersonaFact, NOW)).toEqual([]);
    expect(personaEntryFromFactEvent(notPersonaFact, NOW)).toBeNull();
  });
});

function makeFact(overrides: {
  uuid: string;
  type: "decision" | "learning" | "preference" | "friction" | "observation" | "supersedence";
  project: string;
  content: string;
  metadata?: Record<string, unknown>;
  supersededAt?: Date | null;
}): Fact {
  return Fact.create({
    uuid: overrides.uuid,
    type: overrides.type,
    project: overrides.project,
    content: overrides.content,
    metadata: overrides.metadata,
    observedAt: NOW,
    supersededAt: overrides.supersededAt ?? null,
  });
}

function makeFrictionEntry(id: number | undefined, description: string, sourceProject?: string): FrictionEntry {
  return FrictionEntry.create({
    id,
    description,
    severity: "medium",
    category: "context",
    tool: "memory",
    status: "open",
    sourceProject,
    loggedAt: NOW,
  });
}

function createFactRepo(facts: Fact[]): IFactRepository {
  return {
    async findById() { return null; },
    async findByUuid(uuid: string) { return facts.find((fact) => fact.uuid === uuid) ?? null; },
    async findByProject(project: string) { return facts.filter((fact) => fact.project === project); },
    async findRecent(limit: number) { return facts.slice(0, limit); },
    async save(fact: Fact) { return fact; },
    async saveMany(items: Fact[]) { return items; },
    async search() { return []; },
    async supersede() {},
    async findAll() { return facts; },
    async clearAll() {},
  };
}

function createFrictionRepo(patterns: FrictionPattern[]): IFrictionRepository {
  return {
    async save(entry: FrictionEntry) { return entry; },
    async findById() { return null; },
    async findOpen() { return []; },
    async findAll() { return []; },
    async query() { return { entries: [], totalCount: 0 }; },
    async resolve() {},
    async updateStatus() {},
    async getStats(): Promise<FrictionStats> {
      return { total: 0, open: 0, resolved: 0, wontFix: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, byCategory: {}, byTool: {}, meanTimeToResolve: null, oldestOpen: null };
    },
    async getWeeklyTrends() { return []; },
    async markReviewed() {},
    async findPatterns() { return patterns; },
    async deleteByPattern() { return 0; },
  };
}

function createPersonaRepo(): IPersonaRepository & { saved: PersonaEntry[]; deletedProjects: string[]; cleared: boolean } {
  const repo = {
    saved: [] as PersonaEntry[],
    deletedProjects: [] as string[],
    cleared: false,
    async save(entry: PersonaEntry) { repo.saved.push(entry); return entry; },
    async saveMany(entries: PersonaEntry[]) { repo.saved.push(...entries); return entries; },
    async findByEntryId() { return null; },
    async findAll() { return repo.saved; },
    async findForContext() { return repo.saved; },
    async deleteByProject(project: string) { repo.deletedProjects.push(project); },
    async clearAll() { repo.cleared = true; repo.saved = []; },
  };
  return repo;
}

function createGovernanceRepo(): IMemoryGovernanceRepository & { saved: MemoryGovernanceEntry[] } {
  const repo = {
    saved: [] as MemoryGovernanceEntry[],
    async save(entry: MemoryGovernanceEntry) { repo.saved.push(entry); return entry; },
    async findByTarget(_surface: MemoryGovernanceSurface, targetId: string) {
      return repo.saved.find((entry) => entry.targetId === targetId) ?? null;
    },
    async findByTargetIds(_surface: MemoryGovernanceSurface, targetIds: string[]) {
      return repo.saved.filter((entry) => targetIds.includes(entry.targetId));
    },
    async findAll(_options?: MemoryGovernanceListOptions) { return repo.saved; },
    async applyMemoryEvent(_event: MemoryEventEnvelope) { return null; },
    async clearAll() { repo.saved = []; },
  };
  return repo;
}
