# Projection replay safety execution

Owner: memory-nexus. Q100; authorized baseline repair. Starting revision b2e99bb.

Required truths: acknowledged existing projections survive failed replacement;
the source selection is explicit and complete; malformed or unavailable input
cannot silently produce a smaller replacement; concurrent work cannot be absorbed
into or erased by another operation's rollback; readiness uses the same admission
policy as mutation. No canonical data is needed for verification.

Current native evidence reproduces late-write data loss and missing-source
verification reporting ready. ProjectionRegistry awaits reset/apply handlers;
SQLite transaction callbacks are synchronous. The minimum chosen design is an
isolated staging database using the existing projection handlers, followed by
synchronous atomic promotion of the complete projection table set. Keep the
generic registry's async contract. Inventory tables, FTS triggers, governance audit
rows, IDs and other references before implementing promotion.

Before any await, reject caller-owned transactions and capture a live-database
conflict fence. Candidate native signals are connection-local total_changes,
data_version for other connections, and schema_version for DDL. Verify their
actual behavior before relying on them. Recheck within an immediate transaction
before changing live tables. Source admission needs a retained file-set/content
snapshot and a defined cutoff/retry policy; do not infer completeness from one
successful read or a zero invalid-line count.

Atomic tasks, all mandatory:

1. Q100.1: share required-source admission between verify and rebuild; reject
   malformed input before reset. Structured reports retain counts and safe file/
   line diagnostics; the void wrapper throws so extraction/sync cannot log false
   completion. Preserve tolerant read-only APIs. Native tests cover missing,
   malformed/mixed, existing-empty and valid sources and unchanged prior data.
2. Q100.2: inventory and implement isolated replay plus synchronous atomic
   promotion. Prove reset/apply/insert/commit failures preserve every projection
   and FTS state; reject unsafe caller transactions and concurrent modifications.
   Validate the conflict fence with real independent connections and same-connection
   edits. Failed staging and promotion must release resources and permit retry.
3. Q100.3: establish the complete source snapshot/cutoff contract: changed file
   sets, append/truncate/replace during reads, invalid payloads and conflicting
   duplicate IDs. Reconcile explicit single-log test overrides with production
   all-log authority; source drift must not falsely acknowledge completion.
4. Q100.4: wire actual sync/extraction/CLI retry and pending-source behavior; prove
   recovery after events persist but projection replacement fails, governance
   ordering, no resurrection, and same/other-project preservation. Complete
   per-file/package/changed-line Tier S, adversarial/decision, supported-platform
   and independent-review requirements before Q100 closes.

Q100.1 is only source-existence/parse admission, not a claim that a multi-file
read is a consistent snapshot or that a non-empty replay is atomic. Q100 remains
open until all tasks and its original acceptance contract are satisfied.

Q100.1 checkpoint: paired Windows Bun1.4.1/1.3.14 execution passes93tests and
663assertions across seven files; all five targeted admission faults fail. Full
outputs and exact source hashes are retained in
`.planning/memory-resilience/evidence/Q100.1.json`. Missing-source readiness is
repaired. The late-write data-loss probe remains a required Q100.2 failure.
Production coverage diagnostics and34 existing strict integration-test type
errors remain owned by Q100.4; no full quality acceptance is claimed.

Primary references consulted: SQLite's
[transaction documentation](https://www.sqlite.org/lang_transaction.html),
[data_version pragma](https://www.sqlite.org/pragma.html#pragma_data_version), and
[total_changes contract](https://www.sqlite.org/c3ref/total_changes.html).
