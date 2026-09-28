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

## Q100.2 replacement inventory and contract

The six replayed tables are facts, persona_entries, graph_edges, dream_entries,
memory_governance and memory_governance_events. Their stable keys are respectively
uuid, entry_id, edge_id, dream_id, (surface,target_id) and event_id. The first five
also have local autoincrement IDs. Preserve IDs of surviving keys; allocate new
IDs through the live database sequence. Do not import staging-local numeric IDs.
Facts FTS uses facts.id through the three existing insert/delete/update triggers;
promote facts through those triggers inside the same transaction. All six tables,
FTS state and sequence updates must roll back together on failure.

Source inspection: schema.ts defines these tables without foreign keys to one
another. Dream targets and supersedence use fact UUIDs, governance/utility use
surface logical IDs, and graph endpoints use semantic IDs. FactRepository exposes
numeric findById, so retaining existing numeric identities avoids incidental churn.
Session/message/entity/extraction/utility/vector data is outside this replacement.
The stage needs only the six projection schemas; do not clone sensitive unrelated
tables or load vector extensions. Enumerate stage columns from its trusted schema,
require matching live columns, and qualify live table access with main.

Capture the fence before source-reading awaits. Compare same-connection
total_changes, main data_version, main/temp schema_version within BEGIN IMMEDIATE;
reject a caller-owned transaction both before reading and before promotion. Same
connection rollback may conservatively invalidate work. Never compare data_version
between connections. Native concurrent write/DDL/temp-trigger tests must prove
these assumptions. A conflict returns a retryable failure without erasing the
concurrent work. Full source-file cutoff validation remains Q100.3.

The native test matrix covers every table's delete/insert failure, deferred foreign
key commit failure, invalid staging payload, ignored insert, stable identities,
all-table and FTS preservation, same/other-connection conflicts and caller-owned
transactions. Broader fixture compatibility, cleanup/decision tests and final
quality remain mandatory before this item is accepted.

Q100.2 scoped verification: both Windows Bun1.4.1/1.3.14 runtimes pass132tests/
1855assertions across eight files, nine injected faults fail, and the retained
late-write/missing-source probes all pass. Stage initialization/reset/success
release actual native resources. Final source and full outputs are retained in
`.planning/memory-resilience/evidence/Q100.2.json`. Additional current-runtime sync
compatibility passes64tests/162assertions; mocked orchestration/help tests do not
establish pending-event recovery. The new replacement module diagnoses100% branches
and98.82% statements; the atomicity driver97.14% branches and larger event-log
quality gaps remain mandatory Q100.4 work, including combined cleanup failures.
Q100.3 is active for coherent source admission. No full baseline acceptance.
