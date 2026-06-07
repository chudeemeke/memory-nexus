# Phase 38.7 Evaluation Harness and Regression Fixtures

## Goal

Turn the v5 evaluation baseline into an executable regression harness with sanitized fixtures, schema-versioned output, and a clear path to the Phase 43 market-readiness gate.

## Scope

- Add `bun run eval:v5`.
- Add `bun run eval:v5:market` for the final market-readiness check.
- Load fixtures from `docs/evals/fixtures/v5/`.
- Reject unsafe fixtures before evaluation.
- Emit a `schema_version: "1"` JSON report with summary, coverage, thresholds, market-readiness blockers, and per-fixture results.
- Cover privacy, leakage, supersedence, sync recovery, friction filters, persona, graph, ranking, and dreaming.
- Use behavior-backed evaluators for currently implemented code where possible.
- Use contract fixtures for later phases, and make those fail the market-ready gate until converted.

## Implementation

- `scripts/eval-v5.ts` is the CLI entrypoint.
- `scripts/eval-v5/fixtures.ts` loads and validates sanitized fixture files.
- `scripts/eval-v5/evaluators.ts` contains deterministic offline evaluators.
- `scripts/eval-v5/harness.ts` builds the schema-versioned report.
- `scripts/eval-v5/cli.ts` parses CLI flags and writes JSON output.
- `scripts/eval-v5.test.ts` covers the harness, fixture safety, CLI output, and market-ready contract behavior.

## Fixture Modes

- `behavior`: exercises implemented code paths.
- `contract`: pins later-phase behavior and is accepted by `eval:v5`, but blocks `eval:v5:market`.

Current behavior-backed fixtures:

- `secret_in_tool_output`: exercises `PatternRedactor`.
- `friction_query_contract`: exercises `SqliteFrictionRepository` in an in-memory SQLite database.

Current contract fixtures:

- `project_scope_leakage`
- `superseded_provider_fact`
- `remote_sync_conflict`
- `repeated_correction_to_persona`
- `graph_stale_edge`
- `ranking_evergreen_preference`
- `dream_proposed_supersedence`

## Verification

To be recorded at completion:

- `bun test scripts/eval-v5.test.ts`
- `bun run eval:v5`
- `bun run typecheck`
- `bun run quality`
- `gitleaks detect --no-banner --redact --source .`
- `git diff --check`
