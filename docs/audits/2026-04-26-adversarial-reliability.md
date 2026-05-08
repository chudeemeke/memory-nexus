# Adversarial Reliability Review — 2026-04-26

**Reviewer angle:** Failure modes, partial-failure recovery, concurrency, data integrity
**Target:** `~/Projects/memory-nexus/` (commit at HEAD on 2026-04-26)
**Wedge:** Today's `memory sync --embed` died at 281,813/287,013 with `UNIQUE constraint failed on message_embeddings primary key`. Friction #207, severity low.

---

## Today's wedge: the observed UNIQUE constraint failure

### What the user saw

```
... 281,813 / 287,013 ...
Error: UNIQUE constraint failed on message_embeddings primary key
Run memory sync --embed to resume from where it stopped.
```

### What the code does

`EmbeddingRepository.storeBatch` (`src/infrastructure/database/repositories/embedding-repository.ts:70-87`) wraps two inserts in one transaction:

```ts
INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))   // 1
INSERT INTO embedding_state(message_id, embedded_at, model_hash, model_name) VALUES (?, ?, ?, ?)  // 2
```

`EmbeddingService.embedUnembedded` (`src/application/services/embedding-service.ts:164-201`) loops while `findUnembedded` returns rows. `findUnembedded` (`embedding-repository.ts:48-57`) is the canonical "what needs embedding?" query:

```sql
SELECT m.rowid AS rowid, m.content AS content
FROM messages_meta m
LEFT JOIN embedding_state es ON m.rowid = es.message_id
WHERE es.message_id IS NULL
ORDER BY m.rowid ASC
LIMIT ?
```

Note: this filter is keyed on `embedding_state` ONLY. It never asks "does `message_embeddings` already have a row for this rowid?" That asymmetry is the bug-shaped surface.

### How a row ends up in message_embeddings without a matching embedding_state row

Three concrete code paths leave the two tables desynchronized in exactly this direction:

**Path A — `clearAllEmbeddings()` is not atomic** (`embedding-repository.ts:122-125`):
```ts
this.db.exec("DELETE FROM message_embeddings");   // (a)
this.db.exec("DELETE FROM embedding_state");      // (b)
```
Two separate `db.exec` calls, no transaction. If the process is killed (Ctrl+C, OOM, power loss) between (a) and (b), state is consistent. **But if killed between (b) and (a):** `embedding_state` is empty, `message_embeddings` retains rows. On the next run, `findUnembedded` returns every message. The first batch INSERT on `message_embeddings` collides on the rowid that was never deleted.

The order written above means the inverse direction normally — so this path alone does NOT explain the observed wedge. But it's still a bug.

**Path B — `recreateVecTable()` is not atomic** (`embedding-repository.ts:206-214`):
```ts
this.db.exec("DROP TABLE IF EXISTS message_embeddings");   // (a)
this.db.exec(`CREATE VIRTUAL TABLE message_embeddings ...`);  // (b)
this.db.exec("DELETE FROM embedding_state");               // (c)
```
Three separate execs. Process kill between (b) and (c) leaves an empty `message_embeddings` and a populated `embedding_state` — so all messages now look "embedded" even though they aren't. This is silent corruption: future searches will return zero results, and the user has no way to know.

**Path C — concurrent foreground `memory sync --embed` runs (the most likely root cause).** This is the smoking gun.

- `background-embedder.ts` defines a PID lock file (`embedding.lock`).
- The lock is acquired ONLY when `--background` is passed (`background.ts:53`, `embedding-pass.ts` does NOT acquire it for foreground runs).
- Foreground `memory sync --embed` therefore has **no mutual exclusion**.
- Hooks (`hook-runner.ts:91-123`) spawn `aidev memory sync --session <id>` for every SessionEnd / PreCompact event. They do NOT include `--embed`, but if the user runs a manual `memory sync --embed` while a background hook-spawned sync is also running, the two share the same DB.
- More directly: if the user runs `memory sync --embed` in two terminals (or cron + manual), both call `findUnembedded(batchSize)` against the same DB. The query is read-only and not locked; two readers see overlapping rowids. Process A inserts rowid 281,812 successfully. Process B's `findUnembedded` ran a few hundred milliseconds earlier, also got rowid 281,812. Process B's `INSERT INTO message_embeddings(rowid, embedding)` fails with UNIQUE.

The transaction in `storeBatch` rolls back the failing batch, but vec0's behavior under SQLite transaction abort is not 100% guaranteed across all sqlite-vec versions — at minimum, the entire batch (~16-100 messages) is lost progress.

**Why the message count progressed before failing:** process A inserted serially, process B fell behind and only collided once both reached the high-rowid tail of the unembedded set. This matches "281,813 / 287,013" perfectly — the collision happens late because both processes spent time embedding the bulk (low-rowid messages) where they don't overlap.

### What state is left after this failure

After the UNIQUE error:
- `message_embeddings` and `embedding_state` are still pairwise-consistent for everything actually embedded (the failed batch rolls back).
- BUT: a partial batch may have been inserted by process B that process A doesn't know about. Process A's view of "what's left" is wrong.
- The recovery hint says "Run memory sync --embed to resume." This is correct ONLY IF the second process has finished or been killed. Otherwise the same race repeats.

### Was the recovery message correct?

**Borderline.** "Run memory sync --embed to resume from where it stopped" is technically correct but masks the actual problem. The user has no idea that:
- A second process was the cause
- Re-running while the second process is still alive will just race again
- The rate (5,200 messages from the failure point to 287,013) is small enough that they'll likely finish quickly and conceal the bug

The error message gives no rowid, no session ID, no PID context, no indication that this is a concurrency failure rather than a data corruption.

### Could it have been prevented?

Yes, with any one of:
1. A foreground lock (single-instance enforcement on `memory sync --embed`).
2. `INSERT OR IGNORE` on the vec0 insert, combined with a same-batch existence check on `message_embeddings`. (Note: vec0 may not support `OR IGNORE` cleanly — verification needed.)
3. `findUnembedded` querying both tables: `WHERE es.message_id IS NULL AND NOT EXISTS (SELECT 1 FROM message_embeddings WHERE rowid = m.rowid)`.
4. SQLite write transaction held over `findUnembedded` + insert — but this would serialize the whole pass and is not the right fix.

The cheapest correct fix is **#1** (foreground lock) plus **#3** (defensive query) as a belt-and-suspenders for the inevitable interrupted-clear-and-reembed case.

---

## Findings (severity-ranked)

### CRITICAL — 4

#### CRIT-1: No mutual exclusion on foreground `memory sync --embed`

- **Files:** `src/presentation/cli/commands/sync/embedding-pass.ts:24-133`, `src/infrastructure/embedding/background-embedder.ts:151-179`
- **Failure mode:** Two simultaneous `memory sync --embed` invocations race on `findUnembedded` -> `storeBatch`, producing UNIQUE constraint failures, lost batch progress, and possible partial-state leftovers.
- **Trigger:** User runs `memory sync --embed` in two terminals; OR cron runs `memory sync --embed` while user runs it manually; OR a hook-spawned sync collides with a manual sync.
- **Symptom:** Today's observed error. Progress thrown away from the latest in-flight batch. Recovery hint that masks the concurrency cause.
- **Damage:** No silent data loss (transaction rolls back), but lost time and broken UX. Worse: if the user blindly retries while the other process is still running, they re-race.
- **Fix:** Acquire the embedding PID lock in foreground mode too. Lift the lock acquisition out of the `--background` path in `background.ts` into `embedding-pass.ts:runEmbeddingPass` BEFORE the loop. Release in `finally`. Update error message: "Embedding already in progress (PID X). Wait or kill that process first." Make the lock platform-aware (see CRIT-3).

#### CRIT-2: `clearAllEmbeddings()` and `recreateVecTable()` are not atomic — process kill mid-call corrupts the state-pair

- **Files:** `src/infrastructure/database/repositories/embedding-repository.ts:122-125`, `:206-214`
- **Failure mode:** Two-step (or three-step) cleanup uses separate `db.exec` calls instead of a single transaction. Process kill between calls leaves `message_embeddings` and `embedding_state` desynchronized.
- **Trigger:** User runs `memory sync --embed` after switching embedding model; the call path is `service.clearAndReembed -> repository.clearAllEmbeddings`. Kill (Ctrl+C, OOM, power loss) between `DELETE FROM message_embeddings` and `DELETE FROM embedding_state`. Same risk for `recreateVecTable` (DROP/CREATE/DELETE — three windows).
- **Symptom:** On next sync: silent — `findUnembedded` reports zero remaining (because `embedding_state` looks intact even though vec0 was wiped). All vector searches return zero results. User cannot tell from `memory doctor` because the doctor command does not cross-check the two tables.
- **Damage:** Silent loss of all vector search capability. User could spend days troubleshooting without knowing the embeddings table is empty.
- **Fix:** Wrap each of the two methods in `db.transaction(() => { ... })()`. For `recreateVecTable`, this means DROP+CREATE+DELETE in a single transaction. Verify that vec0 virtual-table DDL is transactional in sqlite-vec; if not, document the constraint and add a post-condition check that closes the consistency gap (see CRIT-4).

#### CRIT-3: PID-lock staleness check is unreliable — orphaned locks silently take over running processes

- **Files:** `src/infrastructure/embedding/background-embedder.ts:130-137`, `:151-179`, `:201-213`
- **Failure mode:** `isProcessAlive(pid)` calls `process.kill(pid, 0)` which throws on EPERM (permission denied). The `try/catch` returns `false` on EPERM — **even when the process is alive**. On Windows, signal-zero behavior is also non-standard. PID reuse on Linux means a long-lived stale lock can collide with an unrelated new process that happened to be assigned that PID.
- **Trigger:** Long-running embedding process; another process inherits its PID after termination; OR Windows behavior diverges from POSIX expectations; OR running under reduced-permission user that lacks signal-send capability.
- **Symptom:** "Stale" lock removed; new process starts; original is actually still alive — TWO concurrent embedders. Or: legitimate alive process gets falsely flagged as stale and lock is overwritten.
- **Damage:** Same as CRIT-1 (data race) but worse, because the lock that was supposed to prevent it actively enables it.
- **Fix:** (a) Write a heartbeat timestamp into the lock file; treat lock as stale only if heartbeat is older than 2× expected interval. (b) On Windows, use a file-locking primitive (e.g., open with exclusive write share mode) instead of PID checks. (c) When acquiring after stale removal, log the takeover and require a `--force-takeover` flag in interactive mode. (d) Prefer an OS-level advisory lock (`fcntl`/`LockFileEx`) over a PID file.

#### CRIT-4: Vec0 transaction-rollback semantics are not verified — silent corruption pathway in `storeBatch`

- **Files:** `src/infrastructure/database/repositories/embedding-repository.ts:70-87`, `src/infrastructure/database/schema.ts:217-219`
- **Failure mode:** sqlite-vec's vec0 virtual table stores data in shadow tables. SQLite transactions SHOULD include vec0 writes, but this is not universally guaranteed across vec0 versions. If a vec0 insert succeeds, then the `embedding_state` insert in the same transaction throws (e.g., disk full, FK violation, IO error), and vec0 fails to fully roll back the vec data, the result is `message_embeddings.rowid` populated WITHOUT a matching `embedding_state.message_id`.
- **Trigger:** Disk full mid-batch; SIGKILL during commit; sqlite-vec version mismatch; vec0 corruption from prior interrupted DDL (CRIT-2).
- **Symptom:** Subsequent runs: same UNIQUE error as today's wedge, but with no concurrent process to blame. The user retries forever.
- **Damage:** Recovery requires manual SQL surgery to delete orphaned `message_embeddings` rows that have no matching `embedding_state` entry. There is no `--repair` command.
- **Fix:** (a) Add a doctor check that runs `SELECT COUNT(*) FROM message_embeddings me LEFT JOIN embedding_state es ON me.rowid = es.message_id WHERE es.message_id IS NULL` and reports orphans. (b) Add a `memory repair --orphan-embeddings` command that deletes the orphans inside a transaction. (c) Pin the sqlite-vec version explicitly and document the transactional contract assumed.

### HIGH — 5

#### HIGH-1: Concurrent hook-spawned syncs share the same DB with only `busy_timeout` for protection

- **Files:** `src/infrastructure/hooks/hook-runner.ts:91-123`, `src/infrastructure/database/connection.ts:184`
- **Failure mode:** Every SessionEnd / PreCompact hook spawns a detached `aidev memory sync --session <id>` process. Multiple Claude Code instances ending sessions in parallel = N concurrent processes opening the same SQLite file. busy_timeout=5000ms is the only mechanism. After 5 seconds of contention, the second process throws SQLITE_BUSY mid-transaction.
- **Trigger:** User has 3 Claude Code sessions across different projects; all end within a 5-second window.
- **Symptom:** sync-service.ts:324 catches "locked" / "SQLITE_BUSY" and wraps as `DB_LOCKED`. Session record may end up half-saved depending on where in the per-session transaction the timeout fires. Sync succeeds for some sessions, fails for others, with the user-visible message being a lock error.
- **Damage:** Partial sync; user has to re-run. If the failed session was the most recent (highest priority for memory recall), recovery loops can keep losing the same session.
- **Fix:** Serialize at the spawner level: queue concurrent hook invocations into a single sequential worker, OR use a global `memory.sync.lock` PID file at the process level (similar to embedding lock) that hooks check before spawning. The 5-second busy_timeout was chosen for short transactions; per-session sync transactions are large and easily exceed it.

#### HIGH-2: JSONL parser has no size limits, no truncated-tail handling, no fileStream error handler

- **Files:** `src/infrastructure/parsers/jsonl-parser.ts:29-63`
- **Failure mode:** (a) A malformed line longer than 1 GB will be loaded into a single `line` string before `JSON.parse` fails — OOM risk. (b) If a session JSONL is being written (active Claude Code session), the trailing partial line will fail to parse and yield "Malformed JSON at line N: Unexpected end of JSON input". This is treated as a normal skipped event with no signal that the file is in-flight. (c) `fileStream.on('error', ...)` is not handled; an EACCES or EISDIR would throw an uncaught async error.
- **Trigger:** Active session sync; corrupted file; permission flap.
- **Symptom:** Confusing parse errors; possible process termination from unhandled stream error.
- **Damage:** Active session content silently dropped (the trailing in-flight line). User believes sync succeeded.
- **Fix:** Detect "trailing-partial-line" specifically (last line, not followed by newline) and yield a distinct event type so callers can decide whether to retry. Add `fileStream.on('error', err => yield { type: 'error', reason })` handling. Cap line size at e.g. 16MB and yield a "line-too-large" skip event with byte offset for forensics.

#### HIGH-3: `extractSession` writes error state in a separate transaction — failure of the error-write itself loses the diagnosis

- **Files:** `src/application/services/sync-service.ts:484-491`
- **Failure mode:** When `extractSession` throws, it tries to write an error state via `await this.extractionStateRepo.save(errorState)`. This save is OUTSIDE the original transaction, so it's a separate write. If the database is locked or full at this point, the error state save itself throws — and the `catch` re-throws the original error, but the diagnostic state was never persisted.
- **Trigger:** Disk full during sync; lock contention from concurrent hook (HIGH-1); permission change.
- **Symptom:** Session forever appears as "needs extraction" because no extraction_state row was written. Each future sync re-tries it and fails the same way. No record of the original error.
- **Damage:** Permanent retry loops. User sees the same session fail every sync, can't see the underlying error.
- **Fix:** Wrap the error-state save in its own try/catch; if it fails, write to a fallback log file. At minimum, propagate "could not record error state" via the SyncResult.errors entry.

#### HIGH-4: `findUnembedded` does not bound by `model_hash` — model changes mid-run leak inconsistent embeddings

- **Files:** `src/infrastructure/database/repositories/embedding-repository.ts:48-57`, `src/application/services/embedding-service.ts:127-152`
- **Failure mode:** `findUnembedded` looks for messages with no `embedding_state` row at all. If `clearAndReembed` is interrupted partway (say it cleared 100k of 287k embeddings and crashed), the next `memory sync --embed` will resume — but `findUnembedded` is filtering by "any embedding_state row", and the un-cleared 187k still have rows from the OLD model. They look already-embedded.
- **Trigger:** Model change; clearAndReembed interrupted mid-clear (the DELETE itself is one statement so this is rarer, but the model change scenario plus a retry that doesn't re-trigger clearAndReembed is realistic).
- **Symptom:** Vector search returns mixed-model results. Quality silently degrades. Users notice "search isn't finding obvious things" but can't diagnose.
- **Damage:** Silent quality degradation. Worst kind of failure because there's no error message.
- **Fix:** `findUnembedded` should filter by `(es.message_id IS NULL OR es.model_hash != ?)`. Add `model_hash` parameter to the query, pass `this.modelHash` from EmbeddingService.

#### HIGH-5: Migration's rollback does not restore database WAL/SHM sidecars correctly

- **Files:** `src/infrastructure/migration.ts:165-172`, `:319-321`, `:339-341`, `:343-360`
- **Failure mode:** During migration, `cleanupDatabaseSidecars` deletes WAL and SHM files. If a later move fails and rollback reverses prior moves, the rolled-back DB no longer has its WAL/SHM (they were already deleted). On next open, SQLite recovers — but if the WAL had uncommitted-to-main-file changes, those are lost.
- **Trigger:** Migration partial failure (e.g., rename succeeded for memory.db but failed for config.json because of permission issues).
- **Symptom:** Recent transactions in the legacy DB's WAL silently disappear after rollback.
- **Damage:** Data loss bounded by the WAL contents at migration time. For a fresh installation, this is small; for a long-running unmigrated user, this could be hours of recent sessions.
- **Fix:** Don't delete sidecars before all moves succeed. Rollback should restore sidecars too. Better: don't delete at all — let SQLite re-derive.

### MEDIUM — 6

#### MED-1: Heavy use of empty `catch {}` swallows errors silently — 84 occurrences across 41 files

- **Files:** session-source.ts (9), health-checker.ts (8), qmd-runner.ts (5), log-writer.ts (4), connection.ts (3), background-embedder.ts (3), status.ts (3), and many more.
- **Failure mode:** `catch {}` blocks discard error context. Permission errors, IO errors, malformed input all silently turn into no-ops or default values.
- **Trigger:** Any unexpected condition (file permission flap, antivirus quarantine, disk pressure).
- **Symptom:** Sync silently skips a project directory. Doctor reports "config: valid" when it actually failed to load. status.ts hides hook errors from the user.
- **Damage:** Failures invisible until the user notices missing data.
- **Fix:** Audit each `catch {}` and at minimum log to debug. Differentiate "expected non-existence" (e.g., `if (!existsSync) skip`) from "unexpected error" (which should bubble or warn).

#### MED-2: Foreground sync command never honors abort signal during embedding pass

- **Files:** `src/presentation/cli/commands/sync/embedding-pass.ts:100-118`, `src/application/services/embedding-service.ts:177-194`
- **Failure mode:** The sync extraction loop checks `this.abortSignal.shouldAbort()`; the embedding loop in `EmbeddingService.embedUnembedded` does NOT. Pressing Ctrl+C during embedding either terminates with no checkpoint (process ends) or completes the current batch silently.
- **Trigger:** User Ctrl+C during long embedding run.
- **Symptom:** Either abrupt exit (no graceful drain) or apparent unresponsiveness for one batch.
- **Damage:** Lost progress beyond the last committed batch. Already small (batch boundary) but inconsistent UX with the extraction phase.
- **Fix:** Pass abort signal into `EmbeddingService.embedUnembedded`. Check between batches. Same checkpoint pattern as sync-service (commit current batch, log progress, exit).

#### MED-3: UNIQUE constraint error message lacks rowid, session ID, batch position, or recovery hint specificity

- **Files:** `src/presentation/cli/commands/sync/embedding-pass.ts:119-129`
- **Failure mode:** The catch block prints "Embedding failed at X/Y messages. Run memory sync --embed to resume from where it stopped." This is the user's observed message. It does not say WHICH rowid failed, WHICH session that message belonged to, or WHICH model hash was active.
- **Trigger:** Any embedding failure.
- **Symptom:** Today's experience: user can't tell whether to investigate concurrency, corruption, or the embedding provider.
- **Damage:** Makes diagnosis impossible without re-running with verbose logging.
- **Fix:** Include the originating SQLite error message (`error.message`), the current batch's first/last rowid, and the elapsed time. For UNIQUE specifically, add: "This usually indicates a concurrent embedding process. Check `memory status` for active embedders."

#### MED-4: Skip-counting arithmetic in `SyncService.sync` is fragile

- **Files:** `src/application/services/sync-service.ts:196-200`
- **Failure mode:** `result.sessionsSkipped = result.sessionsDiscovered - sessionsToProcess.length - completedSessionIds.size; if (result.sessionsSkipped < 0) result.sessionsSkipped = result.sessionsDiscovered - sessionsToProcess.length;`. The "if negative" branch is a band-aid for an arithmetic case the author couldn't reason through. The `Skipped: 337 / Processed: 2` numbers the user has seen historically may be miscounted by exactly this branch.
- **Trigger:** Checkpoint with completed sessions overlapping with filter-rejected sessions.
- **Symptom:** Counts that don't add up.
- **Damage:** User confusion only — no data damage.
- **Fix:** Track skip reasons explicitly: `skippedByCheckpoint`, `skippedByFilter`, `skippedByExtractionState`. Sum once at the end. Add invariant: `discovered == processed + skipped + errors.length + completed_recovered`.

#### MED-5: `recreateVecTable` deletes embedding_state but doesn't validate dimensions match before recreating

- **Files:** `src/infrastructure/database/repositories/embedding-repository.ts:206-214`, `src/presentation/cli/commands/sync/embedding-pass.ts:67-74`
- **Failure mode:** The dimension change check in `embedding-pass.ts` is `storedDimensions !== null && storedDimensions !== newDimensions`. If `storedDimensions` is null (no rows in vec0 even though embedding_state has rows — a CRIT-2 outcome), the dimension mismatch is silently NOT detected. Re-embedding proceeds, inserts produce confusing errors.
- **Trigger:** Prior interrupted clear-and-reembed.
- **Symptom:** Apparent successful run that produces nothing.
- **Fix:** When `storedDimensions === null` but `embedding_state` has rows, treat it as corruption and require explicit `--force` to proceed. Or run a repair.

#### MED-6: `embedBatch` is sequential despite the name and parameter

- **Files:** `src/infrastructure/embedding/transformers-js-provider.ts:113-119`
- **Failure mode:** `embedBatch(texts)` loops `for text of texts: await this.embed(text)`. No actual batching. For a remote provider (OpenAI), this multiplies latency by N; for the local transformer, it multiplies model overhead.
- **Trigger:** Every embedding pass.
- **Symptom:** Slow embedding (the user has 287k messages — at sequential per-call speed this is the dominant cost).
- **Damage:** Performance only — but exacerbates CRIT-1 by making the embedding pass long-lived, increasing the chance of concurrent invocations.
- **Fix:** True batching for transformers-js (the pipeline accepts arrays). For OpenAI, batch up to provider limit (2048 inputs per call).

### LOW — 4

#### LOW-1: `crypto.randomUUID()` for `extraction_state.id` makes the column meaningless

- **File:** `src/application/services/sync-service.ts:426`
- **Failure mode:** Each extract creates a new UUID, but the row is replaced by `INSERT OR REPLACE` on the `session_path` UNIQUE constraint. So the `id` column never refers to the same row twice.
- **Damage:** Wasted column; minor confusion in debugging.
- **Fix:** Use `session_path` as the primary key (or remove the `id` column entirely).

#### LOW-2: `synchronous = NORMAL` reduces durability — could lose recent transactions on power loss

- **File:** `src/infrastructure/database/connection.ts:187`
- **Failure mode:** With `journal_mode = WAL` and `synchronous = NORMAL`, SQLite skips the fsync between WAL writes and the WAL checkpoint. On power loss, the most recent committed transaction may be lost (consistency is preserved, durability is not).
- **Damage:** Bounded — a few seconds of session sync could be lost on power failure.
- **Fix:** Document the trade-off; consider `synchronous = FULL` for the embedding-state writes specifically (the rest of the schema can tolerate it).

#### LOW-3: Migration `console.warn`s during regular operation pollute output

- **Files:** `src/infrastructure/signals/checkpoint-manager.ts:84,114,121,140`, `src/infrastructure/database/connection.ts:179`
- **Failure mode:** Warnings printed to stderr during normal recovery / first-open scenarios.
- **Damage:** UX cosmetic; clutters CI logs.
- **Fix:** Use a structured logger respecting the log level.

#### LOW-4: `JsonlEventParser.parse` does not propagate file-not-found cleanly

- **File:** `src/infrastructure/parsers/jsonl-parser.ts:30`
- **Failure mode:** `createReadStream(filePath)` throws asynchronously when the file vanishes between discovery and parse. The async generator does not catch this.
- **Damage:** Sync of one session fails with an unwrapped Node error message.
- **Fix:** Wrap the iteration; map ENOENT to a structured "skipped: file removed during scan" event.

---

## What's Done Well

1. **Per-session transaction in `extractSession`** (`sync-service.ts:455-481`). The session save, message saves, tool-use saves, and extraction-state-save all commit atomically. This is correct hexagonal-architecture-shaped code, and the immediate-mode commit is the right choice for SQLite contention.

2. **Checkpoint-based session recovery** (`checkpoint-manager.ts`, `sync-service.ts:153-244`). Sessions are durably checkpointed after each completion, so the extraction phase can resume from any interruption. The validation in `loadCheckpoint` (line 108-117) sanely degrades on corrupt JSON.

3. **Quick integrity check on open** (`connection.ts:204-215`). Catching corrupt DBs at open time and refusing to operate on them is the right default. Preferable to silently doing partial reads.

---

## Open Questions

1. **Does sqlite-vec's vec0 actually honor SQLite transaction rollback?** This is load-bearing for CRIT-4. Pin a known-good version and write a test that intentionally aborts mid-`storeBatch` and verifies vec0 row count returns to pre-tx state.

2. **What happens on Windows when the busy_timeout fires during a per-session transaction with nested FTS5 + vec0 inserts?** The behavior is documented for plain inserts; FTS triggers and vec0 may interact unexpectedly. Stress-test with 4 concurrent processes.

3. **Is the `find ... LEFT JOIN embedding_state` query correct under WAL with multiple readers?** WAL allows readers to see snapshot-isolation views. Two concurrent embedding processes both see "all messages unembedded at time T" and race. The fix is the foreground lock, but a query-level guard (CRIT-1 fix #3) would be defense-in-depth.

4. **Does the extraction-state row for an in-flight session ever block resume?** If a sync is killed mid-transaction, the row is `pending` or `in_progress` — `needsExtraction` re-runs it, which is correct. But if the row's `id` (UUID) collides on a re-run via `INSERT OR REPLACE` — fine for `id` PK — but `session_path` UNIQUE means duplicate-by-path raises. The repo uses INSERT OR REPLACE so it's idempotent. Worth a test that kills the parent during the sessionRepo.save() inside the transaction and checks state after.

5. **Is there any backup or `--repair` story for orphaned `message_embeddings` rows?** Currently no. A `memory repair` command is the missing piece for CRIT-2 and CRIT-4 outcomes.

6. **What's the actual sqlite-vec version pinned, and what does its release notes say about transaction isolation?** Need to confirm before fixing CRIT-4 to avoid a fix that doesn't actually fix.
