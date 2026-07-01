# Phase 42: Dreaming Consolidation

Status: Complete on 2026-07-01.

## Scope

Phase 42 implements explicit, manual dreaming consolidation without background mutation:

- `memory dream propose-supersedence` creates reviewed supersedence proposals.
- `memory dream list/show/approve/reject/apply/rollback` exposes the review lifecycle.
- Dream entries are schema-versioned and audited in `dream_entries`.
- Dream state is projected from canonical `MemoryEventEnvelope` events.
- Apply emits canonical replacement and supersedence events.
- Rollback emits canonical restore events.
- Proposal content and reasons are redacted before persistence.
- Governance provenance is registered for dream entries.
- Background dreaming remains disabled.

## Architecture Decision

The original plan mentioned `dreams.jsonl`. The implementation intentionally uses the canonical event log plus the `dream_entries` projection instead. This avoids a parallel audit log that could drift from canonical memory events. The event envelope is schema version 2, and the dream projection row is schema version 1.

## Verification

- `bun test src/domain/entities/dream-entry.test.ts src/application/services/dreaming-service.test.ts src/infrastructure/database/repositories/dream-repository.test.ts src/infrastructure/database/event-log.dream.test.ts src/presentation/cli/commands/dream.test.ts`: 39 pass.
- `bun test scripts/eval-v5.test.ts`: 4 pass.
- `bun test src/presentation/cli/commands/completion.test.ts`: 47 pass.
- `bun run eval:v5`: 9/9 fixtures pass; 8 behavior-backed, 1 contract.
- `bun run typecheck`: pass.
- `bun run build`: pass.
- `bun test --timeout 15000`: 4,366 pass, 0 fail.
- `bun run test:isolation`: pass.
- `bun run test:coverage`: 4,366 pass, 0 fail; statements 97.35%, branches 95.01%, functions 96.59%, lines 97.45%.
- `bun audit`: pass, no vulnerabilities.
- `gitleaks detect --no-banner --redact --source .`: no leaks found.
- Scoped inbox lint for archived Phase 42-related handoffs: pass.
- `git diff --check`: pass.

`bun run eval:v5:market` still intentionally fails because `remote_sync_conflict` remains contract-only for Phase 43 disposition.
