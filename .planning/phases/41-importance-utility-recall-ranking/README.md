# Phase 41: Importance, Utility, and Recall Ranking

Status: Complete
Started: 2026-06-07
Completed: 2026-06-07

## Intent

Prioritize useful current truth without losing durable evergreen memory. Ranking must improve context/retrieval behavior without bypassing governance, supersedence, temporal validity, or existing search/vector baselines.

## Plan

1. Add durable utility metrics for memory surfaces.
   - Track `fact`, `persona`, `graph`, `link`, and future `dream` targets without depending on Phase 42.
   - Store access count, last accessed/ranked timestamps, utility score, importance score, pinned/evergreen flags, half-life override, and metadata.
2. Add an application-layer ranking service.
   - Accept generic candidates plus optional utility metrics.
   - Exclude superseded, invalidated/suppressed/expired, future, and stale candidates.
   - Apply per-kind half-life policies with evergreen/pinned exemptions.
   - Return score components and why-included explanations.
3. Integrate ranking into context assembly.
   - Order facts, persona entries, and graph edges through the ranker after governance filtering.
   - Add why-ranked metadata without removing existing why/provenance output.
4. Promote the v5 ranking eval fixture to behavior-backed execution.
   - Use the real ranking service, not synthetic arithmetic.
   - Keep remaining dream and remote-recovery contract fixtures explicit until their owner phases.
5. Verify with focused tests, `eval:v5`, full quality, gitleaks, and diff whitespace.

## Guardrails

- No ranking of suppressed, invalidated, expired, or superseded memory.
- No hard-coded provider or project paths.
- No network or hosted ranking dependency.
- No removal of existing search/context sections or CLI behavior.
- Ranking explanations must be deterministic and safe for JSON/text output.

## Implementation

- Added `MemoryUtilityMetric` and the surface-agnostic `memory_utility_metrics` table for `fact`, `persona`, `graph`, `link`, and future `dream` targets.
- Added `IMemoryUtilityRepository` and `SqliteMemoryUtilityRepository` with upsert, batch lookup, access recording, project deletion, and clear-all operations.
- Added `MemoryRankingService` with generic candidates, adapters for facts/persona/graph, per-kind/type half-life policies, evergreen/pinned exemptions, access utility scoring, supersedence/governance/temporal filtering, and deterministic why-ranked metadata.
- Integrated ranking into `SmartContextService` after governance filtering, and wired `memory context` plus ambient context to use the ranker and utility repository.
- Promoted `ranking_evergreen_preference` from contract to behavior-backed eval execution through the real ranking service and utility metric entity.

## Verification

- `bun test src/domain/entities/memory-utility-metric.test.ts src/application/services/memory-ranking-service.test.ts tests/infrastructure/database/repositories/memory-utility-repository.test.ts --timeout 15000`
- `bun test src/domain/entities/memory-utility-metric.test.ts src/application/services/memory-ranking-service.test.ts tests/infrastructure/database/repositories/memory-utility-repository.test.ts src/application/services/smart-context-service.test.ts src/infrastructure/database/schema.test.ts scripts/eval-v5.test.ts --timeout 15000`
- `bun run typecheck`
- `bun run eval:v5` (9/9 passed; 7 behavior-backed fixtures, 2 contract fixtures)
- `bun run quality` (4,316 pass, 0 fail; coverage statements 97.29%, branches 95.11%, functions 96.47%, lines 97.40%; test isolation passed; `eval:v5` passed; `bun audit` found no vulnerabilities)
- `gitleaks detect --no-banner --redact --source .` (no leaks found)
- `git diff --check` (no whitespace errors)
- `bun run eval:v5:market` intentionally fails while the two remaining contract fixtures, `dream_proposed_supersedence` and `remote_sync_conflict`, remain owned by Phase 42 and Phase 43 readiness work.
