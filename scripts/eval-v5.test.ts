import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runEvalCli } from "./eval-v5/cli.js";
import { V5_EVAL_DIMENSIONS, type V5EvalFixture } from "./eval-v5/types.js";
import { runV5EvalHarness } from "./eval-v5/harness.js";
import { validateFixture } from "./eval-v5/fixtures.js";

describe("v5 evaluation harness", () => {
  test("default fixture suite passes and covers every v5 dimension", async () => {
    const run = await runV5EvalHarness({
      now: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(run.exitCode).toBe(0);
    expect(run.report.schema_version).toBe("1");
    expect(run.report.command).toBe("eval:v5");
    expect(run.report.summary.failed).toBe(0);
    expect(run.report.summary.blocking_failed).toBe(0);
    expect(run.report.coverage.dimensions.sort()).toEqual([...V5_EVAL_DIMENSIONS].sort());

    const reportJson = JSON.stringify(run.report);
    expect(reportJson).not.toContain("eval_secret_do_not_use");
    expect(reportJson).not.toContain("OPENAI_API_KEY=eval");

    const redaction = run.report.results.find((result) => result.dimension === "privacy_redaction");
    expect(redaction?.mode).toBe("behavior");
    expect(redaction?.status).toBe("pass");

    const friction = run.report.results.find((result) => result.dimension === "friction_query");
    expect(friction?.mode).toBe("behavior");
    expect(friction?.status).toBe("pass");

    const persona = run.report.results.find((result) => result.fixture_id === "repeated_correction_to_persona");
    expect(persona?.mode).toBe("behavior");
    expect(persona?.status).toBe("pass");

    const graph = run.report.results.find((result) => result.fixture_id === "graph_stale_edge");
    expect(graph?.mode).toBe("behavior");
    expect(graph?.status).toBe("pass");

    const leakage = run.report.results.find((result) => result.fixture_id === "project_scope_leakage");
    expect(leakage?.mode).toBe("behavior");
    expect(leakage?.status).toBe("pass");

    const supersedence = run.report.results.find((result) => result.fixture_id === "superseded_provider_fact");
    expect(supersedence?.mode).toBe("behavior");
    expect(supersedence?.status).toBe("pass");
  });

  test("fixture validation rejects raw secrets and private transcript markers", () => {
    const unsafe = {
      ...createFixture(),
      id: "unsafe_raw_secret",
      input: { text: "OPENAI_API_KEY=literal-secret-value" },
      sanitized: {
        containsRawSecrets: true,
        containsPrivateTranscript: true,
        notes: ["unsafe test fixture"],
      },
    };

    const errors = validateFixture(unsafe, "unsafe.json");

    expect(errors).toContain("sanitized.containsRawSecrets must be false");
    expect(errors).toContain("sanitized.containsPrivateTranscript must be false");
    expect(errors.some((error) => error.includes("raw secret-like material"))).toBe(true);
  });

  test("market-ready mode fails while contract-only fixtures remain", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "memory-v5-eval-"));
    try {
      writeFileSync(
        join(fixtureDir, "persona_contract.json"),
        JSON.stringify(createFixture({ dimension: "persona", mode: "contract" }), null, 2),
      );

      const run = await runV5EvalHarness({
        fixtureDir,
        marketReady: true,
        now: new Date("2026-06-07T00:00:00.000Z"),
      });

      expect(run.exitCode).toBe(1);
      expect(run.report.market_readiness.eligible).toBe(false);
      expect(run.report.market_readiness.blockers).toContain("1 contract fixtures still require behavior-backed implementation");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("CLI emits a schema-versioned JSON report", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const run = await runEvalCli({
      argv: ["--pretty"],
      stdout: { write: (chunk: string) => stdout.push(chunk) },
      stderr: { write: (chunk: string) => stderr.push(chunk) },
      now: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(run.exitCode).toBe(0);
    expect(stderr).toEqual([]);

    const parsed = JSON.parse(stdout.join(""));
    expect(parsed.schema_version).toBe("1");
    expect(parsed.command).toBe("eval:v5");
    expect(parsed.summary.failed).toBe(0);
  });
});

function createFixture(overrides: Partial<V5EvalFixture> = {}): V5EvalFixture {
  return {
    schemaVersion: 1,
    id: "persona_contract_fixture",
    title: "Persona contract fixture",
    dimension: "persona",
    mode: "contract",
    ownerPhase: "39",
    tags: ["persona", "contract"],
    sanitized: {
      containsRawSecrets: false,
      containsPrivateTranscript: false,
      notes: ["Synthetic fixture."],
    },
    input: {
      entries: [
        {
          id: "entry-1",
          content: "Prefer durable disk artifacts for continuity work.",
          provenance: { sourceEventIds: ["evt-1"], sourceKinds: ["correction"] },
          confidence: 0.91,
          scope: { visibility: "global" },
          review: { status: "pending_review", reviewAfter: "2026-07-07T00:00:00.000Z" },
          controls: ["suppress", "invalidate"],
        },
      ],
    },
    expected: {
      requiredControls: ["suppress", "invalidate"],
      requireProvenance: true,
      requireReviewMetadata: true,
      requireScope: true,
      minConfidence: 0.75,
    },
    ...overrides,
  };
}
