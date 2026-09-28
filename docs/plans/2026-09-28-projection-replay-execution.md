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

## Q100.3 source cutoff contract

SQLite cannot atomically commit the independently written event files. The receipt
must therefore identify the exact selected file set, byte lengths and SHA-256
digests used for this replay, never promise that no later source data exists.
Capture every selected regular file's identity/size/timestamps before reading;
read only its captured byte length, decode UTF-8 strictly, and refuse missing,
replaced, truncated, appended or newly discovered sources before promotion.
Immediately inside the synchronous promotion transaction, recheck identities,
content hashes and selected file set. Commit the receipt in that same transaction
as the projections. A later append differs from the receipt and remains pending.
No filesystem lock, background service or second corpus queue is introduced.

Q100.3.1 implements that bounded capture, observed-stability check and durable
receipt, with a current-source comparison for Q100.4 callers. Receipt write failure
must roll back projection replacement; prior receipts survive failed replay.
Q100.3.2 must additionally reconcile semantic payload admission/verification,
conflicting duplicate IDs and explicit-file versus all-log authority. Identical
event duplicates remain idempotent. Legacy synthetic sequence/machine metadata
needs deliberate normalization before using full envelope hashes as identity.
Q100.4 wires actual pending-source retry after failed replacement, including cases
where remote transport has no new changes. These are mandatory dependencies,
not optional enhancements or a relaxation of the original Q100.3 acceptance.

Q100.3.1 checkpoint: paired Windows native272tests/2297assertions pass at matching
source hashes; seven injected faults fail. evidence/Q100.3.1.json under the active
execution directory retains complete outputs. The source module's narrow
statements88.88/branches80 still fails quality; Q100.4 retains this obligation.
Before a caller uses the source receipt to skip replay, verify or implement receipt
invalidation for direct projection changes/import/restore. Source match alone is
not projection health. Q100.3.2 semantic/identity/scope admission remains active.

## Q100.3.2 semantic and authority contract

Verification and mutation must run the same actual staging registry. Parsing and
hash integrity alone do not establish a usable projection. Missing payloads,
unimplemented event kinds and unsupported operations must refuse replacement;
staging diagnostics must not print event payloads or IDs. Existing add/update/
supersede handlers remain; delete/noop/migrate and privacy/projection kinds require
implemented semantics before they can be accepted, rather than silent omission.

Within a source, the same event ID with identical canonical identity is idempotent.
Different canonical records sharing an ID are a conflict, not first-writer-wins.
For v2 compare validated envelope hashes. For legacy records normalize generated
machine/line-sequence metadata while retaining explicit sequence and all projected
semantics; never normalize away real v2 provenance or privacy differences.

A file selection is not authority to omit sibling canonical logs or previously
applied source files. Established directory authority cannot narrow to a file or
switch directory; an established file may widen to its containing directory while
retaining all prior source paths. Receipt corruption refuses scope inference.
Recheck authority inside promotion; verification may read an existing target DB
read-only but must not create or initialize it. Full authority cutover requires
the separate adoption decision; these checks do not authorize one.

Split the semantic work into mandatory acceptance slices:

- Q100.3.2.1: shared real staging, safe failure reporting, duplicate identity and
  source authority. A scoped checkpoint does not certify every payload field.
- Q100.3.2.2: strict recognized-field admission before tolerant projection adapters.
  Reproduce malformed optional fact fields falling back to envelope values;
  inspect governance string/array/date/number coercions and dream optional dates.
  Distinguish absent optional values from malformed explicit values, and restrict
  operations by the state transitions actually implemented for each event kind.
  Verify legitimate legacy and v2 producer records remain compatible. Unknown
  extension metadata alone is not a reason to discard a valid event.

Q100.3.2 remains a parent barrier requiring both slices. Q100.4 still owns actual
caller retry, receipt invalidation and complete quality/platform/review evidence.

Q100.3.2.2 admission contract: validate raw legacy fact fields before adaptation
can discard them; validate v2 payload fields in the shared stage. Required fact
identity/content must be nonblank. Present optional type/project/date/metadata/id
fields must have their declared type and range; nullable supersedence fields keep
their existing null meaning. Governance recognized aliases must each be valid and
agree when both spellings are supplied. Governance scope, arrays, dates, enum
values and confidence reject coercion. Dream optional dates accept absent/null or
valid date strings, never false/zero; project and numeric identity are validated.
Fact events support add/update/supersede; governance/consent/dream support add/update.

Unknown metadata stays extensible. Confidence and legacy privacy metadata are
validated because they directly govern projected trust/privacy. Existing optional
graph/persona enrichment remains governed by its own documented candidate rules;
this change does not convert deliberately skipped graph candidates into a rejected
source fact, nor claim complete graph/persona quality. Actual handler/domain
validation remains in staging; the boundary validator supplements it rather than
reimplementing every domain invariant. Read-only tolerant log-reader APIs retain
their compatibility behavior. Full release acceptance remains Q100.4/B11.74.7.

## Q100.4 recovery safety and actual callers

Source freshness is insufficient authority for automatic replacement: direct
repository writes, imports and deletions may change projections after replay.
Split remaining work without weakening the parent acceptance barrier:

- Q100.4.1: bind successful source receipts to a versioned projection-content
  fingerprint in the same transaction. Cover all six replaced tables, columns,
  storage types and exact values. Automatic replay requires matching content or
  an empty bootstrap store without a receipt. Old/malformed receipts and divergent
  data require explicit reconciliation. Recheck inside promotion; a receipt trigger
  changing projected rows must abort. Explicit confirmed rebuild may establish a
  new baseline. Source-current remains source-only, never index health.
- Q100.4.2: wire safe pending-source recovery through actual extraction and remote
  sync, including early/no-op returns and unchanged transport after failed replay.
  Prove no resurrection after direct deletion and no loss of unlogged/imported
  data, truthful partial progress and process restart.
- Q100.4.3: full original quality, compound cleanup failure semantics, strict test
  types, per-file/package/changed-line coverage, supported-platform, installed
  invocation and independent review obligations.

The fingerprint is derived safety metadata, never new source authority. It does
not attest to FTS/vector health, recover missing event history, or authorize a
production data cutover. Existing source scope/cutoff admission remains required.

The v1 fingerprint streams a native SQLite read transaction over six tables. It
encodes storage type plus exact integer text, 26-significant-digit real values,
and hex text/blob bytes including NULs. The receipt gains `projectionState` without
DDL migration. Old source-only receipts remain readable for source freshness;
automatic replacement requires explicit reconciliation first. Recheck content and
external-content FTS integrity after receipt writes to detect trigger side effects.

Q100.4.2 must account for event-backed direct writers: governance and dreaming
append events and also update repositories. These legitimate writes invalidate
the conservative fingerprint. Establish a transactional checkpoint protocol or
verified event-backed reconciliation before caller adoption, without blessing
unrelated divergence. Fingerprinting is linear in projected rows; measure its
operational cost during caller proof and retain bounded-memory iteration.

Q100.4.2 writer decision: route canonical governance/dream writes through append
plus guarded replay. The existing writer port may report that projection committed;
services then read the real projected result instead of applying the event twice.
Append-only injected writers keep their existing behavior. Canonical command paths
recover pending sources before reading state for a mutation; unconfirmed dream
apply/rollback must not trigger recovery. A shared recovery helper treats absent
sources without a receipt as idle, missing acknowledged sources as an error, and
uses both content admission and source receipts before replay. It must preserve
truthful pending status if more source arrives after the committed cutoff.

This avoids a second per-repository checkpoint protocol. Multi-event dream apply
and rollback still require failure/retry validation: do not infer atomic file
append or whole-workflow completion from individual event replay. Final actual
sync/extraction wiring and that failure matrix remain mandatory before Q100.4.2
acceptance, not a reason to declare the full recovery goal complete early.

Writer recovery refinement: automatic replay must preserve every previously
acknowledged source prefix, in addition to preserving source scope and projected
content. Truncation or replacement requires explicit reconciliation. Zero-byte
sources without a receipt remain idle and must not erase unlogged projections.
Commands stop before generating a new event when a bounded recovery attempt
reports additional pending input. Completed apply/rollback retries return their
recorded event IDs without appending duplicate events; confirmation is still
required. Failed individual replays retain the appended source for the next
enabled mutating command. This is not atomicity of the complete multi-event action.

Native writer proof must cover failure at replacement, supersedence, applied
snapshot, restore and rolled-back snapshot boundaries. Remaining Q100.4.2 work
includes process restart, proposal/governance multi-event interruption, concurrent
writer ordering and stale target decisions, append failure, post-write cutoff
status, actual extraction/remote recovery and measured replay cost. Q100.4.3 owns
full module/package/changed-line/platform and independent review proof. Schema
initialization currently creates/drops an FTS probe and can change database bytes
even on list/show; Q019 owns that existing behavior. Writer tests assert unchanged
projected content and receipt, not byte-identical command initialization.
