# Backup and migration checkpoint refusal

Owner: memory-nexus. Authorized baseline item B11.74.6.3.1; draft PR #1.

An acknowledged SQLite commit can remain in the WAL while a reader holds an
older snapshot. A successful PRAGMA invocation alone is not evidence that the
checkpoint completed. Backup must not copy only the main database in that state;
migration must not report a completed checkpoint or continue to lock/hook changes.

1. Reproduce this with real independent SQLite connections and synthetic data.
   Verify failure preserves committed records, the migration lock and hook state.
2. Read the checkpoint result and reject missing or busy results. Scope every
   backup/migration integrity/checkpoint statement; keep public exit conventions.
3. Release the reader, retry and verify the copied database contains the latest
   committed row and migration can complete. Exercise read-only integrity probes
   and native handle release. Retain RED/GREEN outputs and source hashes.
4. Reconcile startup/evaluation connection owners and existing command tests.
   Run type/isolation checks and bounded decision checks. Update the ledger with
   exact coverage/runtime limitations; use final-source paired runtime proof.

This does not make checkpoint-then-file-copy a concurrency-safe SQLite snapshot:
a writer can commit between those operations. Q050 still owns snapshot semantics,
complete backup surfaces and atomic restore. Q062 still owns active lock admission,
failure/cleanup reporting and complete migration quality. Neither is optional.
No canonical data, installed hooks, model or production replication is used.

Outcome:85tests/404assertions pass on Windows Bun1.4.1 and1.3.14; nine targeted
faults detected. All five direct statements dispose on the exercised paths.
Startup and all four SQLite evaluators already use the owning factory correctly;
native success/failure tests prove their lifecycle without production changes.
Production and strict changed-test types plus isolation pass. Both new drivers
diagnose100% in all metrics. Backup branches85.03%, migration branches93.84% and
existing migration-test branches50% remain below the required Tier S floor.
These are mandatory baseline tasks, not waived by the scoped native proof.
