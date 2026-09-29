# Hook mutation admission

Owner: memory-nexus. Active item D05; related Q061 and settings-manager quality.
Starting revision: 9f4488c. This is the next seam in full installer qualification.

Invariants: existing settings, backup and copied-hook bytes survive rejected input;
malformed settings are not equivalent to absent settings; validation does not
write. Status and mutation must not confuse an existing directory with a script.

1. Reproduce invalid JSON overwrite, malformed settings structure, and copied-hook
   replacement before backup-target refusal through public install/direct APIs.
2. Introduce a strict mutation reader: missing means empty, other read/type/parse
   errors refuse without including settings contents in diagnostics. Validate the
   structure used by hook mutation while preserving unrelated fields/events.
3. Preflight settings/backup/hook leaf types and distinct target paths before
   install copying. Reuse the existing maintenance leaf guard. Keep direct
   install/uninstall mutations behind the strict reader. Return stable command
   failure for admission errors; never print successful installation on refusal.
4. Test normal, malformed, unreadable and linked inputs; prove sentinel bytes
   survive actual command/direct calls. Run source-bound current/pinned runtime,
   strict types, isolation, scoped instrumentation and decision faults.
5. Persist failures, repairs and limits under D05. Next remains recoverable
   publication/rollback across hook/settings/backup, exact hook ownership, concurrent
   replacement and parent-link policy, actual detached capture and final review.

Leaf admission is not a filesystem lock or complete transaction. No production
installation, canonical data access or remote activity is authorized by these tests.

Checkpoint 2026-09-29: steps 1-4 implemented and scoped verification retained in
`.planning/memory-resilience/evidence/D05-input-progress.json`. Four REDs repaired;
154 tests pass on each Windows runtime; seven injected faults caught. Full D05
acceptance remains open. Before acceptance, also repair supported non-command
hook preservation and truthful CLI uninstall/status (D05/Q037), alongside step 5.
