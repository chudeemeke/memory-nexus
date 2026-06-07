---
title: v5 Evaluation Harness
created: 2026-06-07
status: phase-38.7
scope: "@chude/memory v5.0"
---

# v5 Evaluation Harness

Phase 38.7 turns the v5 evaluation baseline into an executable, offline regression suite.

## Commands

```bash
bun run eval:v5
bun run eval:v5 -- --pretty
bun run eval:v5:market
```

- `eval:v5` loads `docs/evals/fixtures/v5/*.json` and emits a schema-versioned JSON report.
- `eval:v5` is part of `bun run quality`.
- `eval:v5:market` adds the market-readiness rule: contract-only fixtures fail until the relevant product phases replace them with behavior-backed checks.

## Report Contract

The report has `schema_version: "1"` and includes:

- `summary`: total, passed, failed, blocking failures, behavior fixture count, and contract fixture count.
- `coverage`: covered v5 dimensions and fixture counts by dimension.
- `thresholds`: blocking dimensions and required pass rates.
- `market_readiness`: whether the current output is eligible for market-readiness evidence and why not.
- `results`: per-fixture checks and sanitized evidence.

Security, cross-project leakage, and supersedence are blocking dimensions.

## Fixture Contract

Fixtures are stored in `docs/evals/fixtures/v5/` and must be sanitized before storage:

- `sanitized.containsRawSecrets` must be `false`.
- `sanitized.containsPrivateTranscript` must be `false`.
- Raw secret-like strings and private unsymlinked local paths are rejected before evaluation.
- Synthetic secret tests must split fixture parts so the file does not contain a raw credential.

Fixture modes:

- `behavior`: exercises implemented code paths or concrete adapters.
- `contract`: pins the required behavior for a later phase. These are allowed in `eval:v5` but fail `eval:v5:market`.

## Current Coverage

Behavior-backed fixtures:

- `secret_in_tool_output`: uses `PatternRedactor`.
- `friction_query_contract`: uses `SqliteFrictionRepository` against an in-memory SQLite database.
- `repeated_correction_to_persona`: uses `PersonaProfileService` through in-memory repository ports.
- `project_scope_leakage`: uses `SmartContextService` to prove unrelated project-private facts stay out of cross-project context.
- `graph_stale_edge`: uses `TemporalGraphService` with `SqliteGraphRepository` and graph governance.
- `superseded_provider_fact`: uses `SqliteFactRepository` persisted fact state.
- `ranking_evergreen_preference`: uses `MemoryRankingService` and `MemoryUtilityMetric` to prove evergreen useful memory outranks noisy recency.

Contract fixtures, to be promoted by later phases:

- `remote_sync_conflict`
- `dream_proposed_supersedence`

Phase 42 must convert the remaining dreaming contract fixture into a behavior-backed eval when audited dreaming is implemented. The remote-sync conflict fixture remains a recovery contract until Phase 43 determines whether existing Phase 38.4 tests are sufficient evidence or whether a higher-level behavior fixture is required.
