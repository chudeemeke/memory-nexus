import { initializeDatabase } from "../../src/infrastructure/database/connection.js";
import { SqliteFrictionRepository } from "../../src/infrastructure/database/repositories/friction-repository.js";
import { SqliteFactRepository } from "../../src/infrastructure/database/repositories/fact-repository.js";
import { SqliteGraphRepository } from "../../src/infrastructure/database/repositories/graph-repository.js";
import { SqliteMemoryGovernanceRepository } from "../../src/infrastructure/database/repositories/memory-governance-repository.js";
import { PersonaProfileService } from "../../src/application/services/persona-profile-service.js";
import { TemporalGraphService } from "../../src/application/services/temporal-graph-service.js";
import { SmartContextService } from "../../src/application/services/smart-context-service.js";
import { MemoryRankingService, type MemoryRankCandidate } from "../../src/application/services/memory-ranking-service.js";
import { PatternRedactor } from "../../src/infrastructure/security/pattern-redactor.js";
import { Fact, type FactType } from "../../src/domain/entities/fact.js";
import { FrictionEntry } from "../../src/domain/entities/friction-entry.js";
import { MemoryUtilityMetric } from "../../src/domain/entities/memory-utility-metric.js";
import type { MemoryEventEnvelope } from "../../src/domain/entities/memory-event.js";
import type { MemoryGovernanceEntry, MemoryGovernanceSurface } from "../../src/domain/entities/memory-governance.js";
import type { PersonaEntry } from "../../src/domain/entities/persona-entry.js";
import type {
  FrictionPattern,
  FrictionQueryOptions,
  FrictionStats,
  IFactRepository,
  IFrictionRepository,
  IMemoryGovernanceRepository,
  IPersonaRepository,
  MemoryGovernanceListOptions,
} from "../../src/domain/ports/repositories.js";
import {
  type V5EvalCheckResult,
  type V5EvalFixture,
  type V5EvalResult,
  type V5EvalStatus,
} from "./types.js";
import { isNonEmptyString, isRecord } from "./fixtures.js";

const BLOCKING_DIMENSIONS = new Set(["privacy_redaction", "cross_project_leakage", "supersedence"]);

export async function evaluateFixture(fixture: V5EvalFixture): Promise<V5EvalResult> {
  switch (fixture.dimension) {
    case "privacy_redaction":
      return evaluatePrivacyRedaction(fixture);
    case "friction_query":
      return evaluateFrictionQuery(fixture);
    case "cross_project_leakage":
      return evaluateCrossProjectLeakage(fixture);
    case "supersedence":
      return evaluateSupersedence(fixture);
    case "sync_recovery":
      return evaluateSyncRecovery(fixture);
    case "persona":
      return evaluatePersona(fixture);
    case "graph":
      return evaluateGraph(fixture);
    case "ranking":
      return evaluateRanking(fixture);
    case "dreaming":
      return evaluateDreaming(fixture);
  }
}

async function evaluatePrivacyRedaction(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const redactor = new PatternRedactor();
  const inputText = materializeText(fixture.input.textParts ?? fixture.input.text);
  const expectedKinds = stringArray(fixture.expected.requiredFindingKinds, "requiredFindingKinds");
  const placeholderPrefixes = stringArray(fixture.expected.requiredPlaceholderPrefixes, "requiredPlaceholderPrefixes");
  const forbiddenFragments = materializedStringArray(fixture.expected.forbiddenFragments, "forbiddenFragments");
  const result = redactor.redactText(inputText);

  const checks: V5EvalCheckResult[] = [
    check("redactor reports expected finding kinds", expectedKinds.every((kind) => result.findings.some((finding) => finding.kind === kind))),
    check("redacted text contains expected placeholder prefixes", placeholderPrefixes.every((prefix) => result.text.includes(prefix))),
    check("redacted text does not contain assembled fixture secrets", forbiddenFragments.every((fragment) => !result.text.includes(fragment))),
    check("findings expose hashes but not raw values", result.findings.every((finding) => typeof finding.hash === "string" && /^[a-f0-9]{8}$/.test(finding.hash))),
  ];

  return finalize(fixture, checks, {
    finding_kinds: [...new Set(result.findings.map((finding) => finding.kind))],
    finding_hashes: result.findings.map((finding) => finding.hash),
    redacted_length: result.text.length,
  });
}

async function evaluateFrictionQuery(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const { db } = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
  try {
    const repository = new SqliteFrictionRepository(db);
    for (const entry of recordArray(fixture.input.entries, "entries")) {
      await repository.save(FrictionEntry.create({
        description: stringValue(entry.description, "description"),
        severity: stringValue(entry.severity, "severity") as FrictionEntry["severity"],
        category: stringValue(entry.category, "category"),
        tool: stringValue(entry.tool, "tool"),
        status: stringValue(entry.status, "status") as FrictionEntry["status"],
        context: optionalString(entry.context),
        sourceProject: optionalString(entry.sourceProject),
        tags: optionalStringArray(entry.tags),
        loggedAt: new Date(stringValue(entry.loggedAt, "loggedAt")),
        resolvedAt: entry.resolvedAt ? new Date(stringValue(entry.resolvedAt, "resolvedAt")) : undefined,
        resolution: optionalString(entry.resolution),
      }));
    }

    const checks: V5EvalCheckResult[] = [];
    const evidenceQueries: Array<Record<string, unknown>> = [];
    for (const query of recordArray(fixture.input.queries, "queries")) {
      const queryName = stringValue(query.name, "query.name");
      const expected = recordValue(query.expected, "query.expected");
      const result = await repository.query(toFrictionQueryOptions(recordValue(query.options, "query.options")));
      const returnedDescriptions = result.entries.map((entry) => entry.description);

      checks.push(check(`${queryName}: total count`, result.totalCount === numberValue(expected.totalCount, "expected.totalCount")));
      checks.push(check(`${queryName}: returned count`, result.entries.length === numberValue(expected.returnedCount, "expected.returnedCount")));
      for (const description of stringArray(expected.requiredDescriptions, "expected.requiredDescriptions")) {
        checks.push(check(`${queryName}: includes required entry`, returnedDescriptions.includes(description), description));
      }
      for (const description of stringArray(expected.forbiddenDescriptions, "expected.forbiddenDescriptions")) {
        checks.push(check(`${queryName}: excludes forbidden entry`, !returnedDescriptions.includes(description), description));
      }

      evidenceQueries.push({
        name: queryName,
        total_count: result.totalCount,
        returned_count: result.entries.length,
      });
    }

    return finalize(fixture, checks, { queries: evidenceQueries });
  } finally {
    db.close();
  }
}

async function evaluateCrossProjectLeakage(fixture: V5EvalFixture): Promise<V5EvalResult> {
  if (fixture.mode === "behavior") {
    return evaluateCrossProjectLeakageBehavior(fixture);
  }

  const request = recordValue(fixture.input.request, "request");
  const project = stringValue(request.project, "request.project");
  const records = recordArray(fixture.input.records, "records");
  const visibleIds = records
    .filter((record) => {
      const visibility = stringValue(record.visibility, "record.visibility");
      return visibility === "global" || stringValue(record.project, "record.project") === project;
    })
    .map((record) => stringValue(record.id, "record.id"));

  const checks = inclusionChecks(fixture, visibleIds);
  return finalize(fixture, checks, { visible_ids: visibleIds });
}

async function evaluateCrossProjectLeakageBehavior(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const request = recordValue(fixture.input.request, "request");
  const project = stringValue(request.project, "request.project");
  const records = recordArray(fixture.input.records, "records");
  const facts = records.map((record) => Fact.create({
    uuid: stringValue(record.id, "record.id"),
    type: "decision",
    project: stringValue(record.project, "record.project"),
    content: `${stringValue(record.id, "record.id")}:: ${stringValue(record.content, "record.content")}`,
    metadata: { visibility: stringValue(record.visibility, "record.visibility") },
    observedAt: new Date("2026-06-07T00:00:00.000Z"),
  }));

  const service = new SmartContextService({
    projectResolver: {
      resolveProjectEncoded(value) {
        return value === project ? `encoded-${project}` : null;
      },
      resolveProjectName(value) {
        return value === project ? project : null;
      },
    },
    factRepo: createFactRepo(facts),
    frictionRepo: createFrictionRepo([]),
    now: () => new Date("2026-06-07T00:00:00.000Z"),
  });
  const context = await service.getContext({ projectFilter: project, crossProject: true });
  const content = context?.sections.map((section) => section.content).join("\n") ?? "";
  const visibleIds = records
    .map((record) => stringValue(record.id, "record.id"))
    .filter((id) => content.includes(`${id}::`));

  const checks = inclusionChecks(fixture, visibleIds);
  return finalize(fixture, checks, {
    visible_ids: visibleIds,
    section_keys: context?.sections.map((section) => section.key) ?? [],
  });
}

async function evaluateSupersedence(fixture: V5EvalFixture): Promise<V5EvalResult> {
  if (fixture.mode === "behavior") {
    return evaluateSupersedenceBehavior(fixture);
  }

  const request = recordValue(fixture.input.request, "request");
  const includeHistorical = request.includeHistorical === true;
  const visibleIds = recordArray(fixture.input.facts, "facts")
    .filter((fact) => includeHistorical || !fact.supersededAt)
    .map((fact) => stringValue(fact.id, "fact.id"));

  const checks = inclusionChecks(fixture, visibleIds);
  return finalize(fixture, checks, { visible_ids: visibleIds, include_historical: includeHistorical });
}

async function evaluateSupersedenceBehavior(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const { db } = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
  try {
    const request = recordValue(fixture.input.request, "request");
    const includeHistorical = request.includeHistorical === true;
    const project = optionalString(request.project) ?? "memory-nexus";
    const repo = new SqliteFactRepository(db);
    const facts = recordArray(fixture.input.facts, "facts").map((fact) => {
      const factType = optionalString(fact.type) ?? "observation";
      return Fact.create({
        uuid: stringValue(fact.id, "fact.id"),
        type: factType as FactType,
        project,
        content: stringValue(fact.content, "fact.content"),
        observedAt: new Date(stringValue(fact.observedAt, "fact.observedAt")),
        supersededAt: fact.supersededAt ? new Date(stringValue(fact.supersededAt, "fact.supersededAt")) : null,
        supersededBy: optionalString(fact.supersededBy) ?? null,
      });
    });
    await repo.saveMany(facts);

    const stored = await repo.findByProject(project);
    const visibleIds = stored
      .filter((fact) => includeHistorical || fact.supersededAt === null)
      .map((fact) => fact.uuid);

    const checks = inclusionChecks(fixture, visibleIds);
    return finalize(fixture, checks, {
      visible_ids: visibleIds,
      include_historical: includeHistorical,
      persisted_fact_count: stored.length,
    });
  } finally {
    db.close();
  }
}

async function evaluateSyncRecovery(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const input = fixture.input;
  const failureStep = stringValue(input.failureStep, "failureStep");
  const stepsAfterFailure = stringArray(input.stepsAfterFailure, "stepsAfterFailure");
  const checks = [
    check("failure step is captured", failureStep.length > 0),
    check("backup reference is available", isNonEmptyString(input.backupRef)),
    check("rollback command is documented", isNonEmptyString(input.rollbackCommand)),
    check("failed preflight does not push", !stepsAfterFailure.includes("push")),
    check("local event log remains preserved", input.localEventLogPreserved === true),
    check("conflict/corruption is recorded for operator review", input.operatorReviewRequired === true),
  ];

  return finalize(fixture, checks, {
    failure_step: failureStep,
    backup_available: isNonEmptyString(input.backupRef),
    post_failure_steps: stepsAfterFailure,
  });
}

async function evaluatePersona(fixture: V5EvalFixture): Promise<V5EvalResult> {
  if (fixture.mode === "behavior") {
    return evaluatePersonaBehavior(fixture);
  }

  const expected = fixture.expected;
  const entries = recordArray(fixture.input.entries, "entries");
  const requiredControls = stringArray(expected.requiredControls, "requiredControls");
  const minConfidence = numberValue(expected.minConfidence, "minConfidence");
  const checks: V5EvalCheckResult[] = [];

  for (const entry of entries) {
    const id = stringValue(entry.id, "entry.id");
    const provenance = recordValue(entry.provenance, "entry.provenance");
    const scope = recordValue(entry.scope, "entry.scope");
    const review = recordValue(entry.review, "entry.review");
    const controls = stringArray(entry.controls, "entry.controls");

    checks.push(check(`${id}: provenance includes source event ids`, stringArray(provenance.sourceEventIds, "sourceEventIds").length > 0));
    checks.push(check(`${id}: confidence meets threshold`, numberValue(entry.confidence, "entry.confidence") >= minConfidence));
    checks.push(check(`${id}: scope is explicit`, isNonEmptyString(scope.visibility)));
    checks.push(check(`${id}: review metadata is explicit`, isNonEmptyString(review.status) && isNonEmptyString(review.reviewAfter)));
    checks.push(check(`${id}: user controls are available`, requiredControls.every((control) => controls.includes(control))));
  }

  return finalize(fixture, checks, { entry_count: entries.length });
}

async function evaluatePersonaBehavior(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const expected = fixture.expected;
  const project = optionalString(fixture.input.project);
  const facts = recordArray(fixture.input.facts, "facts").map(factFromFixture);
  const personaRepo = createPersonaRepo();
  const governanceRepo = createGovernanceRepo();
  const service = new PersonaProfileService({
    factRepo: createFactRepo(facts),
    frictionRepo: createFrictionRepo([]),
    personaRepo,
    governanceRepo,
    now: () => new Date("2026-06-07T00:00:00.000Z"),
  });

  const rebuild = await service.rebuildProfile(project ? { project } : {});
  const entries = rebuild.entries;
  const requiredControls = stringArray(expected.requiredControls, "requiredControls");
  const requiredContent = stringArray(expected.requiredContent, "requiredContent");
  const requiredKinds = stringArray(expected.requiredKinds, "requiredKinds");
  const minConfidence = numberValue(expected.minConfidence, "minConfidence");

  const checks: V5EvalCheckResult[] = [
    check("profile service produced persona entries", entries.length > 0),
    ...requiredContent.map((fragment) =>
      check("required persona content is generated", entries.some((entry) => entry.content.includes(fragment)), fragment),
    ),
    ...requiredKinds.map((kind) =>
      check("required persona kind is generated", entries.some((entry) => entry.kind === kind), kind),
    ),
    check("generated entries meet confidence threshold", entries.every((entry) => entry.confidence >= minConfidence)),
    check("generated entries include provenance", entries.every((entry) => entry.sourceEventIds.length > 0 && entry.sourceKinds.length > 0)),
    check("generated entries include explicit scope", entries.every((entry) => isNonEmptyString(entry.scope.visibility))),
    check("generated entries include review metadata", entries.every((entry) => entry.reviewAfter instanceof Date && entry.reviewStatus.length > 0)),
    check("generated entries expose required user controls", entries.every((entry) => requiredControls.every((control) => entry.controls.includes(control)))),
    check("persona governance entries are registered", governanceRepo.saved.length === entries.length),
  ];

  return finalize(fixture, checks, {
    entry_count: entries.length,
    generated_entry_ids: entries.map((entry) => entry.entryId),
    generated_kinds: entries.map((entry) => entry.kind),
    governance_count: governanceRepo.saved.length,
  });
}

async function evaluateGraph(fixture: V5EvalFixture): Promise<V5EvalResult> {
  if (fixture.mode === "behavior") {
    return evaluateGraphBehavior(fixture);
  }

  const query = recordValue(fixture.input.query, "query");
  const asOf = new Date(stringValue(query.asOf, "query.asOf"));
  const minConfidence = numberValue(query.minConfidence, "query.minConfidence");
  const visibleIds = recordArray(fixture.input.edges, "edges")
    .filter((edge) => {
      const validFrom = new Date(stringValue(edge.validFrom, "edge.validFrom"));
      const validTo = optionalString(edge.validTo);
      const confidence = numberValue(edge.confidence, "edge.confidence");
      return validFrom <= asOf && (!validTo || new Date(validTo) > asOf) && confidence >= minConfidence;
    })
    .map((edge) => stringValue(edge.id, "edge.id"));

  const checks = inclusionChecks(fixture, visibleIds);
  return finalize(fixture, checks, { visible_edge_ids: visibleIds });
}

async function evaluateGraphBehavior(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const { db } = initializeDatabase({ path: ":memory:", walMode: false, quickCheck: false });
  try {
    const query = recordValue(fixture.input.query, "query");
    const asOf = new Date(stringValue(query.asOf, "query.asOf"));
    const minConfidence = numberValue(query.minConfidence, "query.minConfidence");
    const project = optionalString(query.project) ?? "memory-nexus";
    const factRepo = new SqliteFactRepository(db);
    const graphRepo = new SqliteGraphRepository(db);
    const governanceRepo = new SqliteMemoryGovernanceRepository(db);

    const facts = recordArray(fixture.input.edges, "edges").map((edge) => {
      const edgeId = stringValue(edge.id, "edge.id");
      return Fact.create({
        uuid: `fact-${edgeId}`,
        type: "decision",
        project,
        content: `Graph edge fixture ${edgeId}`,
        metadata: {
          graph_edges: [{
            id: edgeId,
            source: stringValue(edge.source, "edge.source"),
            target: stringValue(edge.target, "edge.target"),
            sourceType: optionalString(edge.sourceType) ?? "tool",
            targetType: optionalString(edge.targetType) ?? "capability",
            relationship: stringValue(edge.relationship, "edge.relationship"),
            confidence: numberValue(edge.confidence, "edge.confidence"),
            validFrom: stringValue(edge.validFrom, "edge.validFrom"),
            ...(edge.validTo ? { validTo: stringValue(edge.validTo, "edge.validTo") } : {}),
            project: optionalString(edge.project) ?? project,
            why: optionalString(edge.why) ?? `Fixture edge ${edgeId}.`,
          }],
        },
        observedAt: new Date(stringValue(edge.validFrom, "edge.validFrom")),
      });
    });
    await factRepo.saveMany(facts);

    const service = new TemporalGraphService({
      factRepo,
      graphRepo,
      governanceRepo,
      now: () => asOf,
    });
    await service.rebuildGraph({ project });
    const visibleEdges = await service.findContextEdges({ project, asOf, minConfidence });
    const visibleIds = visibleEdges.map((edge) => edge.edgeId);
    const checks = inclusionChecks(fixture, visibleIds);

    return finalize(fixture, checks, {
      visible_edge_ids: visibleIds,
      persisted_edge_count: (await graphRepo.findCurrent({ project, asOf, minConfidence: 0 })).length,
      governance_count: (await governanceRepo.findAll({ surface: "graph" })).length,
    });
  } finally {
    db.close();
  }
}

async function evaluateRanking(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const asOf = new Date(optionalString(fixture.input.asOf) ?? "2026-06-07T00:00:00.000Z");
  const service = new MemoryRankingService({ now: () => asOf });
  const candidates = recordArray(fixture.input.candidates, "candidates").map((candidate): MemoryRankCandidate => {
    const id = stringValue(candidate.id, "candidate.id");
    const observedAt = optionalString(candidate.observedAt);
    const importance = numberValue(candidate.importance, "candidate.importance");
    const utility = numberValue(candidate.utility, "candidate.utility");
    const accessCount = optionalNumberValue(candidate.accessCount, "candidate.accessCount") ?? 0;
    return {
      id,
      kind: "fact",
      memoryType: optionalString(candidate.type) ?? "preference",
      content: optionalString(candidate.content) ?? id,
      observedAt: observedAt ? new Date(observedAt) : asOf,
      supersededAt: candidate.superseded === true ? asOf : null,
      confidence: optionalNumberValue(candidate.confidence, "candidate.confidence") ?? 0.8,
      importance,
      utility,
      evergreen: candidate.evergreen === true,
      pinned: candidate.pinned === true,
      recencyNoisePenalty: numberValue(candidate.recencyNoisePenalty, "candidate.recencyNoisePenalty"),
      governanceStatus: optionalString(candidate.governanceStatus) as MemoryRankCandidate["governanceStatus"],
      metric: MemoryUtilityMetric.create({
        surface: "fact",
        targetId: id,
        accessCount,
        lastAccessedAt: null,
        lastRankedAt: asOf,
        importanceScore: importance,
        utilityScore: utility,
        evergreen: candidate.evergreen === true,
        pinned: candidate.pinned === true,
        createdAt: asOf,
        updatedAt: asOf,
      }),
    };
  });
  const ranked = service.rank(candidates);

  const expectedTopId = stringValue(fixture.expected.topId, "topId");
  const checks = [
    check("expected memory ranks first", ranked[0]?.id === expectedTopId, `expected ${expectedTopId}`),
    ...stringArray(fixture.expected.forbiddenIds, "forbiddenIds").map((id) =>
      check("superseded or noisy memory is excluded from ranking", !ranked.some((candidate) => candidate.id === id), id),
    ),
  ];

  return finalize(fixture, checks, {
    ranked_ids: ranked.map((candidate) => candidate.id),
    top_score: ranked[0]?.score ?? null,
    top_why_included: ranked[0]?.whyIncluded ?? null,
    behavior_backed: fixture.mode === "behavior",
  });
}

async function evaluateDreaming(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const proposals = recordArray(fixture.input.proposals, "proposals");
  const checks: V5EvalCheckResult[] = [];

  for (const proposal of proposals) {
    const id = stringValue(proposal.id, "proposal.id");
    const audit = recordValue(proposal.audit, "proposal.audit");
    checks.push(check(`${id}: proposal remains review-gated`, proposal.status === "pending_review"));
    checks.push(check(`${id}: no hidden automatic promotion`, proposal.autoPromoted !== true));
    checks.push(check(`${id}: source events are recorded`, stringArray(proposal.sourceEventIds, "proposal.sourceEventIds").length > 0));
    checks.push(check(`${id}: rollback event is available`, isNonEmptyString(proposal.rollbackEventKind)));
    checks.push(check(`${id}: audit trail is redacted`, audit.redactionState === "redacted" || audit.redactionState === "none"));
  }

  return finalize(fixture, checks, { proposal_count: proposals.length });
}

function toFrictionQueryOptions(input: Record<string, unknown>): FrictionQueryOptions {
  return {
    status: optionalString(input.status) as FrictionQueryOptions["status"],
    severity: optionalString(input.severity) as FrictionQueryOptions["severity"],
    category: optionalString(input.category),
    tool: optionalString(input.tool),
    sourceProject: optionalString(input.sourceProject),
    since: input.since ? new Date(stringValue(input.since, "since")) : undefined,
    descriptionContains: optionalString(input.descriptionContains),
    contextContains: optionalString(input.contextContains),
    limit: input.limit === undefined ? undefined : numberValue(input.limit, "limit"),
  };
}

function inclusionChecks(fixture: V5EvalFixture, actualIds: string[]): V5EvalCheckResult[] {
  return [
    ...stringArray(fixture.expected.requiredIds, "requiredIds").map((id) =>
      check("required id is visible", actualIds.includes(id), id),
    ),
    ...stringArray(fixture.expected.forbiddenIds, "forbiddenIds").map((id) =>
      check("forbidden id is excluded", !actualIds.includes(id), id),
    ),
  ];
}

function finalize(fixture: V5EvalFixture, checks: V5EvalCheckResult[], evidence: Record<string, unknown>): V5EvalResult {
  const status: V5EvalStatus = checks.every((item) => item.status === "pass") ? "pass" : "fail";
  return {
    fixture_id: fixture.id,
    title: fixture.title,
    dimension: fixture.dimension,
    mode: fixture.mode,
    owner_phase: fixture.ownerPhase,
    status,
    blocking: BLOCKING_DIMENSIONS.has(fixture.dimension),
    checks,
    evidence,
  };
}

function check(name: string, condition: boolean, detail?: string): V5EvalCheckResult {
  return {
    name,
    status: condition ? "pass" : "fail",
    message: condition ? "passed" : detail ? `failed: ${detail}` : "failed",
  };
}

function materializedStringArray(value: unknown, name: string): string[] {
  return unknownArray(value, name).map((item) => materializeText(item));
}

function materializeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((part) => materializeText(part)).join("");
  }
  if (isRecord(value) && Array.isArray(value.parts)) {
    return value.parts.map((part) => materializeText(part)).join("");
  }
  throw new Error("Expected text, text parts, or { parts } object");
}

function recordArray(value: unknown, name: string): Array<Record<string, unknown>> {
  return unknownArray(value, name).map((item, index) => recordValue(item, `${name}[${index}]`));
}

function unknownArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value;
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function stringArray(value: unknown, name: string): string[] {
  return unknownArray(value, name).map((item, index) => stringValue(item, `${name}[${index}]`));
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return stringArray(value, "value");
}

function stringValue(value: unknown, name: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return stringValue(value, "value");
}

function numberValue(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function optionalNumberValue(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return numberValue(value, name);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return recordValue(value, "value");
}

function factFromFixture(input: Record<string, unknown>): Fact {
  return Fact.create({
    uuid: stringValue(input.uuid, "fact.uuid"),
    type: stringValue(input.type, "fact.type") as FactType,
    project: stringValue(input.project, "fact.project"),
    content: stringValue(input.content, "fact.content"),
    metadata: optionalRecord(input.metadata),
    observedAt: new Date(stringValue(input.observedAt, "fact.observedAt")),
    supersededAt: input.supersededAt ? new Date(stringValue(input.supersededAt, "fact.supersededAt")) : null,
    supersededBy: optionalString(input.supersededBy) ?? null,
  });
}

function createFactRepo(facts: Fact[]): IFactRepository {
  return {
    async findById(id: number) {
      return facts.find((fact) => fact.id === id) ?? null;
    },
    async findByUuid(uuid: string) {
      return facts.find((fact) => fact.uuid === uuid) ?? null;
    },
    async findByProject(project: string) {
      return facts.filter((fact) => fact.project === project);
    },
    async findRecent(limit: number) {
      return facts.slice(0, limit);
    },
    async save(fact: Fact) {
      facts.push(fact);
      return fact;
    },
    async saveMany(items: Fact[]) {
      facts.push(...items);
      return items;
    },
    async search(query: string, limit = 10) {
      return facts.filter((fact) => fact.content.includes(query)).slice(0, limit);
    },
    async supersede(uuid: string, supersededAt: Date, supersededByUuid: string) {
      const index = facts.findIndex((fact) => fact.uuid === uuid);
      const current = facts[index];
      if (current) {
        facts[index] = current.withSuperseded(supersededAt, supersededByUuid);
      }
    },
    async findAll() {
      return facts;
    },
    async clearAll() {
      facts.length = 0;
    },
  };
}

function createFrictionRepo(patterns: FrictionPattern[]): IFrictionRepository {
  return {
    async save(entry: FrictionEntry) {
      return entry;
    },
    async findById() {
      return null;
    },
    async findOpen() {
      return [];
    },
    async findAll() {
      return [];
    },
    async query() {
      return { entries: [], totalCount: 0 };
    },
    async resolve() {},
    async updateStatus() {},
    async getStats(): Promise<FrictionStats> {
      return {
        total: 0,
        open: 0,
        resolved: 0,
        wontFix: 0,
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        byCategory: {},
        byTool: {},
        meanTimeToResolve: null,
        oldestOpen: null,
      };
    },
    async getWeeklyTrends() {
      return [];
    },
    async markReviewed() {},
    async findPatterns() {
      return patterns;
    },
    async deleteByPattern() {
      return 0;
    },
  };
}

function createPersonaRepo(): IPersonaRepository & { saved: PersonaEntry[] } {
  const repo = {
    saved: [] as PersonaEntry[],
    async save(entry: PersonaEntry) {
      repo.saved.push(entry);
      return entry;
    },
    async saveMany(entries: PersonaEntry[]) {
      repo.saved.push(...entries);
      return entries;
    },
    async findByEntryId(entryId: string) {
      return repo.saved.find((entry) => entry.entryId === entryId) ?? null;
    },
    async findAll() {
      return repo.saved;
    },
    async findForContext() {
      return repo.saved;
    },
    async deleteByProject(project: string) {
      repo.saved = repo.saved.filter((entry) => entry.project !== project);
    },
    async clearAll() {
      repo.saved = [];
    },
  };
  return repo;
}

function createGovernanceRepo(): IMemoryGovernanceRepository & { saved: MemoryGovernanceEntry[] } {
  const repo = {
    saved: [] as MemoryGovernanceEntry[],
    async save(entry: MemoryGovernanceEntry) {
      repo.saved.push(entry);
      return entry;
    },
    async findByTarget(_surface: MemoryGovernanceSurface, targetId: string) {
      return repo.saved.find((entry) => entry.targetId === targetId) ?? null;
    },
    async findByTargetIds(_surface: MemoryGovernanceSurface, targetIds: string[]) {
      return repo.saved.filter((entry) => targetIds.includes(entry.targetId));
    },
    async findAll(_options?: MemoryGovernanceListOptions) {
      return repo.saved;
    },
    async applyMemoryEvent(_event: MemoryEventEnvelope) {
      return null;
    },
    async clearAll() {
      repo.saved = [];
    },
  };
  return repo;
}
