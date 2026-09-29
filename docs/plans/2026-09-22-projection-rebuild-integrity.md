# Projection rebuild integrity checkpoint (unreleased)

Owner: memory-nexus. Draft baseline repair PR #1. Synthetic native verification;
no canonical event log or installed database has been changed.

Direct fact/supersedence statements now dispose after use, including failures.
Governance reset delegates to the repository's transaction: its audit and
projection tables clear together or both survive a failed delete. Rebuild now
rejects an explicitly missing selected log or empty log discovery before resetting
projections. Read-only APIs retain their existing missing-file behavior. A
successfully read, existing empty file retains its current replay semantics.

The whole replay is still unsafe on late failure. A native probe seeded a retained
fact, admitted a valid log, then rejected an incoming fact insert. Replay rejected
but the prior fact was already deleted by reset. This is a demonstrated defect,
not merely missing test coverage. Q100 requires its repair before baseline
acceptance, alongside complete event-log quality and source admission review.

Minimum requirements for Q100:

1. Admit one validated source snapshot before replacing derived state; define
   malformed/incomplete/changed-source behavior explicitly.
2. Preserve prior facts, persona, graph, dreams, governance and their indexes on
   reset/application/commit failure; preserve acknowledged concurrent work.
3. Prove retry, duplicates, governance ordering and actual public caller behavior.
4. Do not pass an async callback to synchronous `db.transaction`. A manual
   transaction across awaits also needs an enforced connection ownership boundary
   so unrelated operations cannot accidentally participate in or be rolled back.
   Derive the smallest safe staging/commit or ownership design before changing it.
5. Meet complete Tier S, changed-line/package, native platform and independent
   review requirements. Scoped cleanup/reset success cannot establish this.

Evidence: `.planning/memory-resilience/evidence/B11.74.5-event.json`, including
the failing probe source/results, repaired missing-file result and positive
paired-runtime groups. Production event-log diagnostic branches remain 91.89%.

Source verification:

```powershell
bun test --timeout 15000 tests/infrastructure/database/event-log-lifecycle.test.ts
```

R04 owns consumer notification before integration/adoption: rebuild errors now
reject absent source logs; whole-replay recovery is not yet accepted. No consumer
action is required while this remains an unmerged, uninstalled draft.
