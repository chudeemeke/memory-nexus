# Source decision admission

Status: baseline repair in progress; dream/governance admission implemented, complete writer adoption pending.
Owner: memory-nexus. Parent: Q100.4.2. No production replication or new service.

Backend checkpoint: synthetic reservation qualification and the separate
`SqliteOperationAdmission` adapter now pass contention, normal/error release and
owner-termination recovery on both tested Windows runtimes. The adapter accepts
only an already-provisioned absolute regular file with one link, application ID
1296122957 and exactly one `admission_format` version 1 row. It creates/migrates no
authority, grants no implicit nested permission, and preserves cleanup failures.
The current slice binds that backend to the real event root and acquires it before
mutating dream/governance recovery and decision reads. The native command regression
now requires contention without append, followed by a fresh retry preserving approval.
Raw append, extraction, replay, remote and maintenance adoption remain incomplete;
global command concurrency is not accepted. A constructor path is not authority proof.

## Observed failure and irreducible requirements

A real child process reads a missing proposal and pauses. The parent process uses
the real dream command to create and approve that same proposal. When released,
the child resumes its stale read, appends a fifth event to the four-event source,
reports success, and changes the proposal from approved to pending_review.
The recipe is identical: this is a lost review decision, not a legitimate edit.
The event source remains parseable and replayable, so database integrity and source
receipt checks alone cannot detect the application-level mistake.

Existing native process tests separately prove that a stale replay is refused after
another process commits, changed source before promotion is refused, and an append
during promotion is retained as pending and recovered on retry. Preserve these
fences. A lock on replay alone would not cover the earlier decision read.

Requirements:

1. A source-backed command must acquire admission before recovery and its first
   state-dependent read, retain it through validation and event append, and release
   it on every outcome. A contender must acquire fresh state or fail without append.
2. The same authority must cover cooperating commands, raw append helpers,
   extraction and source-changing remote/maintenance operations. One covered CLI
   command does not establish complete writer coordination.
3. Scope by canonical source root, including sibling machine logs. Two aliases
   must not create independent locks. Local coordination must never travel with
   canonical events, backups intended for another machine, or Git synchronization.
4. Terminated ownership must become reclaimable without trusting PID reuse or
   deleting an age-expired lock that a live owner still holds. Contention must be
   bounded; an unavailable/invalid coordination authority fails before append.
5. Do not hold an unrecognized caller transaction or weaken replay's transaction
   guard. Preserve compound cleanup errors and already-recorded/pending reporting.
6. Admission orders cooperating processes; it does not make a JSONL append and
   SQLite projection one atomic transaction. Partial append, fsync/power loss,
   multi-event action recovery and unsupported external edits remain separate gates.

## Minimum mechanism and comparison

The missing structure is one local admission lease per source authority, with an
explicit async operation scope. It needs no daemon, scheduler, queue or network.
Use a port at the application command boundary and an infrastructure adapter.
Nested writes must reuse an explicit valid lease; unrelated concurrent async work
must not inherit permission merely because it uses the same process or database.

| Candidate | Decision scope | Process death | Complexity and remaining risk | Disposition |
|---|---|---|---|---|
| Re-read before append | Still has a read/append gap | No ownership | Small code, fails required invariant | Reject as the fix |
| PID/age lock file | Can cover the scope | Needs stale-owner recovery | PID reuse, replacement and age stealing need a second ownership protocol | Avoid adding another such protocol |
| SQLite reservation on a local coordination file | Covers mutating dream/governance before the first read independently of projection transactions | Synthetic adapter process-termination proof passes on both tested Windows runtimes | Existing dependency; provisioning races, nested calls and complete writer adoption still need proof | Backend and bounded command activation implemented; full acceptance pending |

SQLite documents one simultaneous write transaction and immediate acquisition
with `BEGIN IMMEDIATE`, which may return `SQLITE_BUSY`; closing a connection rolls
back its transaction. This supports the prototype choice, not acceptance of our
adapter or crash handling. See [transaction semantics](https://www.sqlite.org/lang_transaction.html)
and [OS-level locking](https://www.sqlite.org/lockingv3.html). The latter describes
rollback-journal locking; do not infer a WAL implementation from it. Retain the
coordination file locally and never unlink/replace it while an owner may exist.

## Atomic execution and acceptance

1. **Backend qualification, synthetic only:** two processes contend for one local
   SQLite reservation; the loser appends nothing. Kill the holder and prove a new
   process can acquire. Prove normal/error release and busy behavior on both tested
   Windows runtimes. Keep this as a private bounded probe before adopting a module.
2. **Authority contract:** specify source-root/alias identity, local-only placement,
   no-file/permission/corruption handling, nested ownership and lock ordering. Test
   aliases, different roots and attempted authority replacement. No stale stealing.
3. **Decision boundary regression:** convert the retained counterexample into the
   normal suite; wrap the real mutating dream/governance path before first recovery
   or read. A contender either reports busy with no append, or retries from fresh
   state and retains approval. Also test different recipes and approve/reject/apply.
4. **Complete writer adoption:** inventory append/replay/source-mutation entrypoints,
   wire extraction, raw append and explicit remote/maintenance through the same
   contract, and test nesting without deadlock. Preserve no-egress ordinary sync.
   Direct uncooperative external edits still require optimistic fences/reconciliation.
5. **Interruption and integrity:** kill at pre-append, post-append and mid-action
   boundaries; prove unacknowledged partial records cannot poison later acknowledged
   work, complete candidate validation precedes append, and recorded work resumes.
6. **Acceptance:** final source-bound per-file/package/changed-line quality, process
   negative controls, Windows/Linux compatibility and independent review. None of
   the preceding scoped checks alone closes Q100.4.2, Q100.4.3, E4, E5 or baseline.

Authority placement constraint discovered during implementation: using each
process's configurable data directory as the coordination namespace can split
admission for the same source when profiles or environment variables differ.
The old recursive backup/restore path excluded only `.git` and would copy an
in-events authority. The current slice explicitly excludes the reserved namespace
and records it in the backup manifest. Event traversal rejects symbolic/hard links
so aliases cannot bypass this exclusion. Concurrent filesystem replacement and
atomic backup/restore remain Q050 obligations, not guarantees of this traversal.
Tests must keep any adjacent coordination artifacts within owned fixture lifetimes.

Activation slice: use a reserved `.memory-local` directory inside the real event
root, with an explicit backup/restore exclusion added before command activation.
This resolves differing-profile namespaces and keeps temporary test artifacts
inside their existing owned roots. Default Git commits already select only the
machine event file; prove that real transport does not stage the reserved directory.
Do not add a tracked ignore file or claim arbitrary external Git/file operations
are coordinated. Complete remote-source admission remains a required later seam.

Provision an initialized SQLite file privately, publish by an exclusive hard link,
and remove only the exact temporary file/directory allocated by this attempt.
Never overwrite or repair an existing authority implicitly. Bind it to the real
root path/device/inode and the authority's own device/inode, and check root, reserved-directory and authority-file
identity before admission, under the acquired reservation, and after the operation.
Copied or replaced authorities require reconciliation; no timestamp-based stealing.
These optimistic filesystem checks do not make hostile external rename/unlink
atomic with a callback. Cooperating operations must preserve the authority.

Wrap mutating dream/governance commands before database initialization/recovery or
decision reads; list/show and unconfirmed destructive requests remain unadmitted.
Prepare command responses internally and print only after database and reservation
cleanup. All remaining writers still require adoption before global safety claims.

Next independently verifiable steps: inventory every source mutation and decision
entrypoint; define an explicit lease for intentional nesting; prove unrelated async
work cannot inherit it; then adopt one writer family at a time with real process
barriers and retained-source recovery. Provisioning races and interruption around
hard-link publication/temporary cleanup also require native tests. Track command
operation plus reservation-release compound failure reporting explicitly: a prepared
error response must not be discarded if release subsequently fails.

No owner decision is needed for this authorized baseline investigation. R03/P03/A03
remain the integration, production implementation and adoption decision boundaries.

## Writer inventory at 241acc5

This is source inspection, not a claim that every entry is coordinated. Scope
includes projection replacement because it can invalidate a command's prior read.

| Family / entrypoint | Current boundary | Required adoption and proof |
|---|---|---|
| `dream.ts`, `governance.ts` mutating command executors | Source admission before recovery/read; injected writer and recovery do not acquire independently | Pass explicit authority through nested recovery/append/replay; all action and cleanup paths |
| `event-log.ts` `appendEvent`, `appendMemoryEvent` | Unadmitted raw async append | Acquire for standalone invocation; require a valid source-bound lease when nested; retain partial-record and durability gates |
| `event-log.ts` `rebuildProjections[WithReport]` | Optimistic source/database fences, no shared admission | Standalone and nested replay ownership; preserve existing promotion checks |
| `projection-recovery.ts` recovery and projected writer | Recover/read/append/replay without admission | Explicit lease across the whole sequence, never only append |
| `extraction-pipeline.ts` `extractFromSession` | Idempotency, similarity and supersedence decisions precede raw append | Recover/read/validate/append under one authority; avoid holding it across provider calls by revalidating after candidate computation |
| `sync/index.ts` default local recovery | Calls recovery directly after durable session capture | Acquire only for event/projection work; preserve capture-first/no-egress semantics |
| `sync/index.ts` remote composition, `RemoteEventSyncService`, `GitRemoteEventTransport`, legacy `GitSyncer` | Explicit source/Git mutation plus optional recovery, no shared admission | Hold authority over audit/source decision and Git mutation/recovery; no accidental nested lock or implicit remote work |
| `backup.ts` create/restore | Local namespace excluded/preserved; content traversal still uncoordinated | Coherent snapshot, restore admission and atomicity; existing Q050 obligations |
| `remote.ts` backup/restore/rollback | Separate copy/clear helpers still copy/delete local authority at 241acc5 | Immediate local-only namespace repair, then source admission and atomic restore |
| `projections.ts` confirmed rebuild | Direct replay helper | Acquire before source admission/target fence, keep verification non-mutating |
| `SecretAuditService` event remediation | Renames original logs to quarantine and writes sanitized replacements | Source admission across read/remediation; explicit receipt/reconciliation policy |
| Legacy migration, schema migration, import/purge/direct repository edits | Different authorities/DB replacement or unlogged projection edits | Inventory database/source relationship, order locks deterministically, fail closed for unlogged divergence; no claim that event lease alone covers these |

Immediate vertical slice: prove remote backup omits `.memory-local`, confirmed
restore/rollback preserve the exact live authority even with foreign backup state,
and link aliases cannot copy it. Run actual SQLite reservation across restore and
show a contender remains denied until release. Record this as namespace protection,
not remote restore coordination. Keep sparse-backup clearing in the matrix.

This namespace slice is now implemented with real SQLite authority tests: both
restore and rollback, populated/sparse backups, foreign authority, exact identity
and reservation preservation, post-release reacquisition and link alias refusal.
All three deliberate copy/clear/alias faults are detected. Remote maintenance still
does not acquire admission; content ordering and atomic restore remain open.

Nested contract implemented in scope: an explicitly passed, opaque, source-bound
operation capability with a bounded lifetime; no process-global boolean or ambient
async-context inheritance. Each nested call gets a child scope, so a retained parent
cannot admit concurrent sibling work while its child is active. Root completion
revokes every descendant, including detached work; it must not release while an
already admitted child still runs. Wrong source, stale/copy/forged capability and
parallel sibling invocation must fail before callback. Ten focused tests exercise
these boundaries against the real backend on both tested Windows runtimes. Lower
writer adoption, platform/package/changed-line quality and independent review remain.

Lease implementation slice: keep the existing SQLite backend as root admission and
add an explicit scope wrapper, with opaque leases in a private WeakMap. A source
factory binds its canonical path/root/namespace/file identity tuple, validates it
before nested entry and after completion, and accepts only leases it has issued
under real source admission. A matching identity string in an unrelated injected
wrapper is insufficient provenance. No ambient async permission or new scheduler.

Every admitted child is observed internally. Returning from a callback with a live
child revokes further descendants, drains admitted work while holding the backend,
and reports misuse; it never steals or expires a live reservation. A child failure
remains an operation failure even if caught by its parent. Primary, child and final
identity-validation failures are retained together. This cannot preempt arbitrary
JavaScript or cancel raw I/O already started outside cooperating APIs; callbacks
must settle, and writer adoption still has to carry the explicit lease end to end.

Writer adoption slice: add an optional explicit parent lease to append/replay/
recovery APIs and projected-writer construction. Standalone calls acquire source
admission; nested calls delegate one child scope and pass it down, never a cached
root or implicit global flag. Directory replay must bind its explicit eventsDir,
not the caller's default profile. Dream/governance pass their root scope through
recovery and projected writes. Read-only inspection and unconfirmed actions keep
their existing non-mutating behavior.

Retain optimistic fences after coordination: native tests must distinguish
cooperating contenders (busy, no append) from uncoordinated external file/database
edits (stale promotion refused or newer source reported pending). Do not add a
production lock-bypass option merely to preserve an older race test. Extraction
decision scope, Git/source replacement and maintenance admission remain separate
required slices even when their low-level append/replay calls become admitted.

Writer adoption is now implemented and tested: 525 tests and 3,945 assertions
across two disjoint groups pass on each Windows runtime (Bun1.4.1 and pinned1.3.14).
Eight admission/reporting faults and three optimistic-fence faults are detected.
The retained evidence is
`.planning/memory-resilience/evidence/Q100.4.2-writer-admission.json`. This closes
the bounded wiring slice, not Q100.4.2, complete quality or baseline acceptance.
Next, qualify extraction candidate computation outside admission followed by
admitted recovery and decision revalidation, using real concurrent processes.

Extraction admission slice: preserve a cheap initial recovery/idempotency check,
compute candidates and comparison embeddings outside the reservation, then acquire
one explicit scope for recovery, a fresh idempotency check, active-fact validation,
append/replay and audit save. If the active facts changed during comparison
computation, refuse before writing and request a fresh bounded invocation; never
reuse stale vectors or silently change comparison semantics. A competing completed
session must be skipped without overwriting its audit. Empty extraction also
rechecks idempotency before its audit write. Thread the issued lease into all lower
writes/recovery. Preserve force semantics. Real child-process barriers must prove
provider computation leaves admission available and that stale work cannot commit.

This extraction decision slice passes four real-process schedules and the affected
six-file group (83 tests, 434 assertions) on both Windows runtimes. Six deliberately
omitted guards/delegations fail. Evidence and coverage limits are retained in
`evidence/Q100.4.2-extraction-admission.json` under the execution directory.

Q100.4.2 is now an incomplete barrier over thirteen explicit remaining children in
`work-items.json`, rather than one indefinitely expanding active item. Current
Q100.4.2.1 owns mutable session input and audit identity: messages may change while
the provider computes, even though fact decisions are now admitted. Q100.4.2.2
owns within-batch comparison against preceding accepted candidates. The remaining
children separately qualify remote/Git, backup/restore, source remediation, direct
DB topology, provisioning, compound cleanup, preappend candidates, durability,
multi-event recovery, reconciliation and scaling. Each retains mandatory proof;
split a child again before implementation if it contains independent outcomes.

Q100.4.2.1 first boundary: snapshot the ordered raw message fields before provider
work, then compare a fresh read under the existing final source lease before any
candidate decision, append or audit save. Include ID, role, content, timestamp and
tool references; redaction-equivalent changes must still invalidate stale work.
Changed, additional or deleted input refuses with retry guidance. Do not serialize
the snapshot into logs/errors. This check alone does not bind historical audits
to input revisions or exclude direct message writes after the check: persistent
audit identity and the direct-database mutation interval remain required proof.

This first input boundary is implemented: nine added native scenarios and eight
detected faults; affected compatibility92tests/533assertions per Windows runtime.
Evidence: `.planning/memory-resilience/evidence/Q100.4.2.1-input-validation.json`.
The same evidence retains a failing audit counterexample: successful extraction
followed by a new message still skips on the old audit. Next, promote that failure
to regression coverage and add a versioned durable input identity to audit records.
Do not fabricate identities for legacy audits. Qualify migration, restart, new
input, force and provider/redaction semantics using synthetic databases only.
The post-recheck direct message-write interval remains a separate required seam;
a stored digest alone does not exclude concurrent mutation or make event/audit
writes crash-atomic. Q100.4.2.1 remains active until all its outcomes are proved.

Durable audit slice: nullable `input_identity` on extraction audit rows, containing
only a versioned SHA-256 digest over session/project and ordered raw plus redacted
provider-message fields. Existing rows remain unbound; do not infer old input from
timestamps or current messages. Without `--force`, an unbound audit refuses with
explicit guidance. A matching bound audit skips; changed input recomputes. Preserve
the established requirement to use force for a provider/model-only re-extraction.
Read current input before both audit shortcuts. CLI must route every selected
session through that decision instead of filtering by audit existence. Validate
identity on repository write/read and migrate synthetic old schemas idempotently,
preserving audit bytes/values and propagating migration failure. No live database
migration is performed by this development checkpoint.

Audit identity is implemented and proved through fresh pipeline and CLI processes,
with nullable migration, storage validation and explicit legacy --force refusal.
223 tests/951 assertions pass on each Windows runtime;11 faults detected. Retained
evidence is `evidence/Q100.4.2.1-audit-identity.json` in the execution directory.
Full module/package/platform quality and independent review are still incomplete.

A new real-process RED confirms the post-check gap: insert a message while the
extractor holds source admission at its final audit read, after input validation;
old-input events/audit still commit. Next qualify an owned database write scope,
acquired after source admission and retained through mutation completion. Replay's
current rejection of caller transactions must remain for arbitrary callers; any
internal nested transaction path needs explicit authority and failure/recovery
proof. Do not weaken those guards or add repeated optimistic checks as a substitute
for excluding the competing writer. Coordinate this boundary with Q100.4.2.6/.11.
