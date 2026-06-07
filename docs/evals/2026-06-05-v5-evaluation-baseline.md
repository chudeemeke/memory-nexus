---
title: v5 Evaluation Baseline
created: 2026-06-05
status: phase-38.0-foundation
scope: "@chude/memory v5.0"
---

# v5 Evaluation Baseline

## Purpose

The v5 evaluation baseline proves that new memory features improve recall, safety, and usefulness without introducing privacy leaks or unreviewed mutation. Unit and integration tests prove mechanics. Evals prove product behavior.

## Evaluation Dimensions

| Dimension | Applies To | Minimum Standard |
| --- | --- | --- |
| Recall precision | context, search, ranking | Relevant top results; irrelevant cross-project facts excluded |
| Recall relevance | context, graph, persona | Context answers why each item was included |
| Cross-project leakage | context, persona, graph | Project-private facts do not appear in unrelated project/global context |
| Supersedence correctness | event kernel, graph, ranking, dreaming | Superseded facts are historical unless explicitly requested |
| Graph usefulness | graph search/context | Graph enrichment improves explanation without replacing vector baseline |
| Persona usefulness | profile/context | Profile entries are concise, scoped, provenance-backed, and user-controllable |
| Friction query correctness | friction contract | Filters, counts, min thresholds, and exit codes match schema |
| Privacy/redaction | all storage/egress | Secret fixtures are redacted before storage, indexing, providers, export, and sync |
| Sync recovery | remote sync | Failed fetch/push/conflict/corruption paths recover deterministically |
| Dreaming safety | dreams | Proposals are audited, reversible, and event-sourced |

## Fixture Strategy

Use two fixture classes:

- Sanitized real cases from local project workflows, with secrets and personal data removed before fixture storage.
- Synthetic edge cases that intentionally cover secrets, conflicting facts, project leakage, stale relationships, noisy recent events, and suppressed memories.

Fixture names should make the behavior obvious:

- `project_scope_leakage`
- `superseded_provider_fact`
- `durable_user_preference`
- `repeated_correction_to_persona`
- `graph_stale_edge`
- `dream_proposed_supersedence`
- `secret_in_tool_output`
- `remote_sync_conflict`

## Thresholds

- Security/privacy evals: 100% pass required.
- Supersedence evals: 100% pass required for active-truth paths.
- Cross-project leakage evals: 100% pass required.
- Ranking usefulness evals: each change must improve or preserve the baseline score; regressions need explicit acceptance.
- Persona usefulness evals: entries must include provenance, confidence, scope, and review metadata.

## Harness Plan

Phase 38.0 creates this baseline. Phase 38.7 must implement the executable harness:

- Fixture loader.
- Deterministic in-memory or temporary database runner.
- JSON result schema.
- CLI command such as `bun run eval:v5`.
- CI/release integration by Phase 43/44.

Phase 38.7 implementation note: `bun run eval:v5` is implemented and included in `bun run quality`.
`bun run eval:v5:market` is the stricter release-readiness gate; it fails while contract-only
fixtures remain so Phase 43 cannot accidentally treat planned graph, ranking, dreaming, or adjacent
future contracts as shipped behavior. See `docs/evals/v5-evaluation-harness.md`.

Phase 39 implementation note: `repeated_correction_to_persona` is now behavior-backed through
`PersonaProfileService`; remaining contract fixtures still block `eval:v5:market`.

Phase 40 implementation note: `graph_stale_edge` is now behavior-backed through
`TemporalGraphService` plus `SqliteGraphRepository`; `superseded_provider_fact` is behavior-backed
through persisted `SqliteFactRepository` facts; `project_scope_leakage` is behavior-backed through
`SmartContextService` and now proves unrelated project-private facts are excluded from cross-project
context unless explicitly global.

## Relationship to Tests

- Unit tests validate value objects and pure policy logic.
- Application tests validate ports/use cases.
- Adapter tests validate filesystem, SQLite, Git, provider, and CLI behavior.
- Evals validate end-to-end product behavior against scenarios that unit tests cannot fully express.

## Feature Mapping

| Feature | Required Eval |
| --- | --- |
| Event kernel | replay order, migration, corruption, supersedence |
| Redaction/privacy | secret fixtures before storage/egress |
| Consent/provenance | suppression, revocation, scoped consent |
| Remote sync | conflict and recovery fixtures |
| Durable friction | filter and exit-code fixtures |
| Persona | repeated correction, stale preference, suppression |
| Graph | stale edge, useful relation, noisy relation |
| Ranking | evergreen older decision vs recent noise |
| Dreaming | proposal audit, rollback, no hidden mutation |

## Phase 43 Evidence

The final readiness report must cite:

- Eval command output.
- Fixture list and coverage matrix.
- Any accepted eval gaps with owner and trigger.
- Comparison against the market baseline from Mem0, Zep, Letta, LangGraph, OpenAI memory controls, OWASP LLM02, and NIST AI RMF.
