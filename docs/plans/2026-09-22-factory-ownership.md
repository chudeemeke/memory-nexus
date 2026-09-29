# Shared factory ownership checkpoint (unreleased)

Owner: memory-nexus. Draft baseline PR #1. Changes are source-only; no installed
CLI, canonical memory store, model experiment or production replication changed.

The shared database factory now owns prepared statements until explicit disposal
or connection close. Migrated callers dispose operation-local statements to keep
the ownership registry bounded. Close invalidates retained statements, including
cache-overflow handles; native tests verify immediate file release, unfinished
transaction rollback, partial iterator invalidation and independent connections.

Existing files now reopen explicitly readwrite with create:false. Failed opens
with create:false no longer create missing parent directories. Initialization
queries and bulk checkpoint statements are scoped. Every initialization error
attempts cleanup; if cleanup fails too, MemoryError retains the primary code and
context, adds cleanupFailed:true and retains both failures in an AggregateError
cause. Structured initialization errors retain their identity when cleanup works.

Scoped verification passed59tests /530assertions on Windows Bun1.4.1 and1.3.14.
The final strict check removed one unused type-only import from an existing test;
current-runtime verification passed again, while the final pinned rerun is
disk-guarded. The prior fixture is hash-reconstructed and transpiles identically,
but this does not constitute a fresh final-source pinned group run. Production,
owner and new driver still match the successful pinned run exactly.
Nine targeted faults were detected. One omitted version-statement disposal was
not detected because connection shutdown still finalized it. Candidate equivalence
needs independent disposition; it is not counted as a detected fault.

Production diagnostic lines90.78%, statements90.9%, branches82% fail the required
floors. Existing connection test branches50% also fails. Q018 and B11.9 remain
required before B11.74.7/B10/R02. Complete configuration/SQL/pragma/error/close and
runtime policy, fixture cleanup, changed-line/package and independent proof remain
open. The FTS capability collision test verifies cleanup only; the underlying
probe misclassification remains Q019. Health and CLI/evaluation caller work is
still B11.74.6.2/.3, followed by combined native caller verification.

The owner implementation changed only in its factory comment; a comment-free
TypeScript comparison and fresh native owner/factory tests verify that fact. Older
slice evidence retains its original hashes and is not relabeled as current proof
for the new connection wiring.

R04 owns consumer notification before integration/adoption. This draft requires
no immediate installed-consumer action. Supported runtime admission, cross-platform
proof, final review and adoption remain separate gates.
