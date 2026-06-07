# Phase 40: Temporal Semantic Graph

Status: Complete
Completed: 2026-06-07

## Intent

Add graph retrieval where it improves recall and explanation without replacing the existing fact, FTS, vector, persona, and friction baselines.

## Completed Scope

- Added `GraphEdge` as a domain entity with node taxonomy for projects, tools, people, decisions, errors, plans, files, commands, and capabilities.
- Added `IGraphRepository` and `SqliteGraphRepository` backed by a dedicated `graph_edges` projection table.
- Preserved legacy `links` and `entity_links` behavior by keeping Phase 40 graph state in its own temporal/provenance-aware table.
- Added `TemporalGraphService` to derive graph edges from active fact metadata (`graph_edges`, `graphEdges`, or `relationships`), register graph governance, query current edges, and format explainable context lines.
- Added graph projection replay from canonical event logs through `ProjectionRegistry`.
- Wired `memory context` to include governed temporal graph entries with why-included metadata.
- Tightened cross-project fact context: unrelated project facts are excluded unless explicitly marked global in fact metadata/scope.
- Promoted `graph_stale_edge`, `superseded_provider_fact`, and `project_scope_leakage` eval fixtures to behavior-backed checks.

## Guardrails

- No hosted graph database dependency.
- No provider-specific hardcoding.
- No graph enrichment bypassing memory governance.
- No project-private fact leakage through `--cross-project`.
- No stale edge retrieval: `valid_from`, `valid_to`, and confidence are enforced before context output.
- Graph entries cite source event ids, source kinds, confidence, scope, validity window, and why text.

## Verification

- Focused tests: `bun test src/domain/entities/graph-edge.test.ts src/application/services/temporal-graph-service.test.ts tests/infrastructure/database/repositories/graph-repository.test.ts src/application/services/smart-context-service.test.ts tests/integration/infrastructure/database/event-log.test.ts scripts/eval-v5.test.ts --timeout 15000`
- Typecheck: `bun run typecheck`
- Eval: `bun run eval:v5` passes 9/9 with 6 behavior-backed fixtures and 3 later-phase contract fixtures remaining.
- Full quality: `bun run quality` passes with 4,300 tests, 0 failures, 1 snapshot, and 10,162 assertions.
- Coverage: statements 97.28%, branches 95.17%, functions 96.36%, lines 97.38%.
- Security/diff gates: `bun audit`, `gitleaks detect --no-banner --redact --source .`, and `git diff --check` pass.

## Remaining Later-Phase Contracts

- Phase 41 owns ranking behavior promotion.
- Phase 42 owns dreaming behavior promotion.
- Phase 43/44 own final readiness and release-candidate consumption of all evidence.
