# Phase 38.2.5: Consent Provenance and Memory Governance

Status: Complete
Completed: 2026-06-06

## Goal

Make consent, provenance, suppression, invalidation, review, and user-control state load-bearing before derived memory surfaces are built.

## Implemented

- Added governance domain model covering facts, context, provider egress, remote sync, friction, evaluation, persona, graph, ranking, dreaming, and projection surfaces.
- Added durable `memory_governance` and `memory_governance_events` tables with unique surface/target controls and governance audit history.
- Added `MemoryGovernanceService` plus `SqliteMemoryGovernanceRepository` for register, suppress, unsuppress, invalidate, expire, review, consent grant, and consent revoke controls.
- Extended canonical event replay so fact events register governance provenance and governance/consent events project deterministic control state.
- Added `memory governance list/show/suppress/unsuppress/invalidate/expire/review/consent-grant/consent-revoke`.
- Enforced governance filtering in `SmartContextService` so blocked fact memories do not enter context assembly.

## Boundaries

- Phase 38.2.5 establishes the shared governance substrate. Later remote sync, persona, graph, ranking, and dreaming phases must integrate through this substrate rather than creating parallel control stores.
- Ungoverned legacy facts remain allowed for backward compatibility, but newly replayed canonical fact events receive governance provenance entries.
- Remote sync remains non-production until Phase 38.3 and Phase 38.4 complete.

## Verification

- Focused governance/event-log/context tests: 55 pass, 0 fail.
- Typecheck: pass.
- Schema, completion, and help snapshot tests: pass.
- Full suite: 4140 pass, 0 fail.
