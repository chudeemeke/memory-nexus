# Source decision admission

Status: baseline repair design; counterexample confirmed on Windows Bun 1.4.1 and 1.3.14.
Owner: memory-nexus. Parent: Q100.4.2. No production replication or new service.

Backend checkpoint: synthetic reservation qualification and the separate
`SqliteOperationAdmission` adapter now pass contention, normal/error release and
owner-termination recovery on both tested Windows runtimes. The adapter accepts
only an already-provisioned absolute regular file with one link, application ID
1296122957 and exactly one `admission_format` version 1 row. It creates/migrates no
authority, grants no implicit nested permission, and preserves cleanup failures.
It is not connected to commands; the stale proposal counterexample remains open.
Source-root identity, provisioning, replacement protection and writer adoption are
still required before activating it. A constructor path is not an authority proof.

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
| SQLite reservation on a local coordination file | Can cover the scope independently of projection transactions | Synthetic adapter process-termination proof passes on both tested Windows runtimes | Existing dependency; root identity, file lifecycle, nested calls and complete adoption still need proof | Backend qualified in scope; command activation pending |

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
Conversely, placing it inside the event root would enter the current recursive
backup/restore path, which excludes only `.git`. Do not activate either shortcut.
Next, qualify one stable local namespace derived from the real source authority,
including alias and replacement behavior, and prove backup/restore/Git separation.
Tests must keep any adjacent coordination artifacts within owned fixture lifetimes.

No owner decision is needed for this authorized baseline investigation. R03/P03/A03
remain the integration, production implementation and adoption decision boundaries.
