import { initializeDatabase } from "../../src/infrastructure/database/connection.js";
import { SqliteFrictionRepository } from "../../src/infrastructure/database/repositories/friction-repository.js";
import { PatternRedactor } from "../../src/infrastructure/security/pattern-redactor.js";
import { FrictionEntry } from "../../src/domain/entities/friction-entry.js";
import type { FrictionQueryOptions } from "../../src/domain/ports/repositories.js";
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

async function evaluateSupersedence(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const request = recordValue(fixture.input.request, "request");
  const includeHistorical = request.includeHistorical === true;
  const visibleIds = recordArray(fixture.input.facts, "facts")
    .filter((fact) => includeHistorical || !fact.supersededAt)
    .map((fact) => stringValue(fact.id, "fact.id"));

  const checks = inclusionChecks(fixture, visibleIds);
  return finalize(fixture, checks, { visible_ids: visibleIds, include_historical: includeHistorical });
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

async function evaluateGraph(fixture: V5EvalFixture): Promise<V5EvalResult> {
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

async function evaluateRanking(fixture: V5EvalFixture): Promise<V5EvalResult> {
  const candidates = recordArray(fixture.input.candidates, "candidates");
  const ranked = candidates
    .filter((candidate) => candidate.superseded !== true)
    .map((candidate) => ({
      id: stringValue(candidate.id, "candidate.id"),
      score:
        numberValue(candidate.importance, "candidate.importance") +
        numberValue(candidate.utility, "candidate.utility") +
        (candidate.evergreen === true ? 0.5 : 0) -
        numberValue(candidate.recencyNoisePenalty, "candidate.recencyNoisePenalty"),
    }))
    .sort((a, b) => b.score - a.score);

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
