import { relative, resolve } from "node:path";
import { assertValidFixtures, DEFAULT_V5_FIXTURE_DIR, loadFixtures } from "./fixtures.js";
import { evaluateFixture } from "./evaluators.js";
import {
  V5_EVAL_DIMENSIONS,
  type V5EvalDimension,
  type V5EvalHarnessOptions,
  type V5EvalReport,
  type V5EvalResult,
  type V5EvalRun,
  type V5EvalThreshold,
} from "./types.js";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
const BLOCKING_DIMENSIONS = new Set<V5EvalDimension>([
  "privacy_redaction",
  "cross_project_leakage",
  "supersedence",
]);

export async function runV5EvalHarness(options: V5EvalHarnessOptions = {}): Promise<V5EvalRun> {
  const fixtureDir = resolve(options.fixtureDir ?? DEFAULT_V5_FIXTURE_DIR);
  const fixtures = assertValidFixtures(loadFixtures(fixtureDir));
  const results = await Promise.all(fixtures.map((fixture) => evaluateFixture(fixture)));
  const report = buildReport({
    fixtureDir,
    results,
    now: options.now ?? new Date(),
  });
  const marketReady = options.marketReady === true;

  return {
    exitCode: report.summary.failed === 0 && (!marketReady || report.market_readiness.eligible) ? 0 : 1,
    report,
  };
}

function buildReport(input: {
  fixtureDir: string;
  results: V5EvalResult[];
  now: Date;
}): V5EvalReport {
  const failed = input.results.filter((result) => result.status === "fail").length;
  const blockingFailed = input.results.filter((result) => result.status === "fail" && result.blocking).length;
  const contractCount = input.results.filter((result) => result.mode === "contract").length;
  const blockers: string[] = [];

  if (failed > 0) {
    blockers.push(`${failed} eval fixtures failed`);
  }
  if (blockingFailed > 0) {
    blockers.push(`${blockingFailed} blocking eval fixtures failed`);
  }
  if (contractCount > 0) {
    blockers.push(`${contractCount} contract fixtures still require behavior-backed implementation`);
  }

  return {
    schema_version: "1",
    command: "eval:v5",
    generated_at: input.now.toISOString(),
    fixture_dir: formatFixtureDir(input.fixtureDir),
    summary: {
      total: input.results.length,
      passed: input.results.length - failed,
      failed,
      blocking_failed: blockingFailed,
      behavior: input.results.filter((result) => result.mode === "behavior").length,
      contract: contractCount,
    },
    coverage: {
      dimensions: coveredDimensions(input.results),
      fixture_count_by_dimension: fixtureCountByDimension(input.results),
    },
    thresholds: buildThresholds(),
    market_readiness: {
      eligible: blockers.length === 0,
      contract_fixture_count: contractCount,
      blockers,
    },
    results: input.results,
  };
}

function formatFixtureDir(fixtureDir: string): string {
  const relativePath = relative(PROJECT_ROOT, fixtureDir).replace(/\\/g, "/");
  return relativePath === "" ? "." : relativePath;
}

function coveredDimensions(results: V5EvalResult[]): V5EvalDimension[] {
  return V5_EVAL_DIMENSIONS.filter((dimension) => results.some((result) => result.dimension === dimension));
}

function fixtureCountByDimension(results: V5EvalResult[]): Record<V5EvalDimension, number> {
  const counts = Object.fromEntries(V5_EVAL_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<V5EvalDimension, number>;
  for (const result of results) {
    counts[result.dimension]++;
  }
  return counts;
}

function buildThresholds(): V5EvalThreshold[] {
  return V5_EVAL_DIMENSIONS.map((dimension) => ({
    dimension,
    required_pass_rate: BLOCKING_DIMENSIONS.has(dimension) ? 1 : 1,
    blocking: BLOCKING_DIMENSIONS.has(dimension),
  }));
}
