---
schema_version: "1.3"
source_project: kanbanflow
created: 2026-06-22
type: bug
severity: high
fix_status: merged
affects_scope: all-consumers
workaround_applied: "None; plain resume re-hits the same orphan rowid. `--embed --force` clears both tables and avoids it for an uninterrupted run but redoes all prior embeddings."
priority_rationale: "Regression exposed by the v4.0.2 413 fix: corpus-wide embedding is again deterministically wedged, now via a message_embeddings/embedding_state drift + non-idempotent insert. This is the failure the v4.0.2 closure condition (rerun the blocked re-embed against the fixed binary) would have caught."
issue_id: kanbanflow:2026-06-22:embedding-pk-collision-on-resume
thread_id: memory-nexus:2026-06-22:embed-413-batching
related_issue: C:\Projects\memory-nexus\docs\inbox\archived\2026-06-22-kanbanflow-embed-413-oversized-batch-stalls-reembed.md
next_owner: kanbanflow
status: merged
triaged_at: 2026-06-22
resolved_at: 2026-07-01
---

# `memory sync --embed` aborts on `UNIQUE constraint failed on message_embeddings primary key` and resume re-hits it

## Symptom

After installing the v4.0.2 413 fix, `memory sync --embed` advanced past the previous 413 stall (168300 → 181700) and then aborted with a new, different error:

```
Embedding 184863 messages...
Done.
Embedding failed at 181700/366463 messages. Run memory sync --embed to resume from where it stopped.
Error: UNIQUE constraint failed on message_embeddings primary key
```

Like the 413 before it, this is deterministic: plain `memory sync --embed` re-selects the same row and re-hits the collision, so the corpus-wide embedding stays blocked. Confirmed against installed `memory@4.0.2`.

This is the immediate follow-on to the now-resolved 413 item (`related_issue`). The 413 fix is correct — it removed the first wedge — but doing so let resume reach rows that trigger a latent data-integrity bug underneath.

## Repro

1. Have a corpus where a prior `memory sync --embed` run was interrupted (e.g., the v4.0.0 413 abort) so `message_embeddings` (vec0) and `embedding_state` can drift.
2. Run `memory sync --embed` on v4.0.2.
3. Embedding proceeds, then aborts at the first row that exists in `message_embeddings` but not in `embedding_state` with `UNIQUE constraint failed on message_embeddings primary key`.
4. Re-running resumes to the same offset and aborts again.

## Root cause

Read from the fork source at the v4.0.2 tag (`C:\Projects\memory-nexus\src`), not the global install.

`src/infrastructure/database/repositories/embedding-repository.ts`:

1. **Non-idempotent insert.** `storeBatch` does a plain `INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))` — `:159-160` — with no `INSERT OR REPLACE` / `ON CONFLICT`. Re-inserting an existing `rowid` (the vec0 PK) is fatal. (The sibling `embedding_state` insert is `:162-163`; both run in a transaction `:166-174`.)

2. **Resume selector keys only on `embedding_state`.** `findUnembedded` selects `WHERE es.message_id IS NULL` (`:65`, and `:76` in the non-model path) — it never joins or checks `message_embeddings`. So a `rowid` that exists in `message_embeddings` but lacks an `embedding_state` row is re-selected for embedding, and the plain INSERT at `:159-160` collides.

3. **The two tables can drift.** `storeBatch` wraps both inserts in `this.db.transaction(...)` (`:166-174`), but vec0 virtual tables have weak transactional/rollback guarantees in sqlite-vec. An interrupted or killed run can leave orphan `message_embeddings` rows whose `embedding_state` insert rolled back (or never ran). With ≥2 interrupted runs here (the 413 abort at 168300, then this), orphan vec rows accumulate, and resume deterministically dies on the first one. The v4.0.2 resume fix is what lets execution reach these orphans.

Secondary smell (not the active trigger, but worth fixing for consistency): in the model-scoped branch of `findUnembedded`, the `embedding_skips` join is model-scoped (`AND esk.model_hash = ?`, `:64`) but the `embedding_state` join is **not** (`:61`). So "unembedded for model X" actually means "no embedding for any model." It's moot here because the 384→768 model change cleared both tables, but it would misbehave on a future model change without a clear.

## Proposed fix

1. **Make the writes idempotent.** Use an upsert so a re-selected rowid can't abort resume:
   - `message_embeddings`: `INSERT OR REPLACE INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))` — but verify sqlite-vec supports `REPLACE` on a vec0 virtual table; if not, do `DELETE FROM message_embeddings WHERE rowid = ?` then `INSERT`, inside the existing transaction.
   - `embedding_state`: `INSERT INTO embedding_state(...) ON CONFLICT(message_id) DO UPDATE SET embedded_at=excluded.embedded_at, model_hash=excluded.model_hash, model_name=excluded.model_name` (matches the pattern already used for `embedding_skips` at `:108-115`).
2. **Make resume drift-proof.** Have `findUnembedded` also `LEFT JOIN message_embeddings me ON m.rowid = me.rowid` and add `AND me.rowid IS NULL`, so it never returns a rowid that already has a vector. Belt-and-suspenders with #1.
3. **Reconcile the existing corrupted corpus.** Provide a one-time repair (e.g. `DELETE FROM message_embeddings WHERE rowid NOT IN (SELECT message_id FROM embedding_state)`) so the already-affected DB unblocks on resume without a full `--force` rebuild. Surface a count of orphans removed (no silent repair).
4. **Secondary:** model-scope the `embedding_state` join in the model-scoped `findUnembedded` (`:61`) for correctness on future model changes — verify it doesn't regress the clear-on-model-change path.

## Triage outcome

Accepted the primary root cause and implemented the source fix in `src/infrastructure/database/repositories/embedding-repository.ts`.

Important implementation correction: I did **not** add an anti-join against `message_embeddings` in `findUnembedded`. That would hide orphan vectors forever and keep `embedding_state` undercounting. The better repair path is state-driven resume plus idempotent writes: rows missing `embedding_state` remain selectable, `storeBatch` updates an existing vec row when present, and then upserts `embedding_state`. That repairs orphan vec rows through an ordinary resume.

Verified sqlite-vec behavior before implementation: `INSERT OR REPLACE` still raises `UNIQUE constraint failed` for `vec0`, while `UPDATE message_embeddings SET embedding = vec_f32(?) WHERE rowid = ?` succeeds and reports `changes`.

Implemented tests:

- `storeBatch` is idempotent when a rowid already exists in `message_embeddings`.
- orphan `message_embeddings` rows missing `embedding_state` are selected and repaired on resume.

Resolved state: fix is committed at `6155b68`, published, installed, and smoke-verified as `@chude/memory@4.0.2`.
Current memory-nexus verification on 2026-07-01: `memory --version` is 4.0.2, `npm view @chude/memory version` is 4.0.2,
the installed compiled CLI bundle contains the idempotent `UPDATE message_embeddings` path and `ON CONFLICT(message_id)` state upsert,
`bun test src/infrastructure/database/repositories/embedding-repository.test.ts` passes 39/39, and `bun run verify:published` passes.
Kanbanflow still owns live corpus re-embed verification from its own CWD.

## Test plan

- Unit (`embedding-repository.test.ts`): insert a `message_embeddings` row with no matching `embedding_state` row; assert `findUnembedded` does NOT return that rowid (fix #2).
- Unit: `storeBatch` called twice with the same items is idempotent — no `UNIQUE constraint` failure, `embedding_state` updated not duplicated (fix #1).
- Unit: reconcile removes orphan vec rows and reports the count; afterward those messages are returned by `findUnembedded` for clean re-embedding (fix #3).
- Integration: simulate an interrupted embed leaving partial vec rows, then resume `embedUnembedded` to completion with no PK collision.
- Keep coverage at the 95%+ per-metric bar.

## Suggested commit message

```
fix(embedding): make embedding writes idempotent and resume drift-safe

- Upsert into message_embeddings and embedding_state so a re-selected rowid
  does not abort resume with a UNIQUE constraint failure
- findUnembedded excludes rowids already present in message_embeddings, not
  just rows present in embedding_state
- add a reconcile step that drops orphan vec rows lacking an embedding_state
  row and reports the count

Root cause: vec0 message_embeddings can retain rows after an interrupted run
while embedding_state rolls back; findUnembedded keyed only on embedding_state
re-selected the orphan rowid and the non-idempotent INSERT raised UNIQUE
constraint failed on message_embeddings primary key. Exposed by the v4.0.2
413 resume fix, which lets resume reach the orphan rows.
```

## Risks / things to verify before merging

- **vec0 + `INSERT OR REPLACE`:** confirm sqlite-vec honors `REPLACE` on the virtual table; if not, use DELETE-then-INSERT inside the transaction.
- Confirm `embedding_state`'s primary key is `message_id` (required for the `ON CONFLICT(message_id)` upsert).
- The reconcile `DELETE` must be guarded and idempotent; verify it can't remove valid rows (rows WITH a state row).
- The model-scoped-join change (#4) could alter re-embed-on-model-change semantics — verify against `clear()`/`recreateTable` (`embedding-repository.ts:208-211,285-297`).
- Behavior read from fork source at the v4.0.2 tag; installed binary is v4.0.2 (pkg version matches), so line numbers should hold — confirm before cutting the PR.

## Related

- `related_issue`: `docs/inbox/archived/2026-06-22-kanbanflow-embed-413-oversized-batch-stalls-reembed.md` (merged in v4.0.2). Same `thread_id`. This PK-collision is the next failure mode after that fix landed.
- Process note (no blame, just accuracy): the 413 item was archived as `merged` with a stated closure condition of "rerun the blocked re-embed against the fixed binary." That re-embed has now been run and it surfaced this bug — i.e. the condition was marked satisfied slightly ahead of the live verification actually completing. This item is what that verification caught.
- Reported from a kanbanflow memory-refresh session against `memory@4.0.2`.

## Event Log
<!-- inbox-events:v1 -->
- 2026-06-22T22:30:00.000Z | kanbanflow | filed | memory sync --embed on v4.0.2 cleared the 413 (168300->181700) then aborted with UNIQUE constraint failed on message_embeddings PK; root-caused to non-idempotent storeBatch insert + findUnembedded keyed only on embedding_state + vec0/state drift.
- 2026-06-22T22:59:55.136Z | memory-nexus | triaged | Root cause confirmed in source; implemented and locally tested idempotent vec update-or-insert plus embedding_state upsert, leaving state-driven resume to repair orphan vectors.
- 2026-07-01T20:32:00.000Z | memory-nexus | merged | Archived as shipped after commit 6155b68, registry/global @chude/memory@4.0.2 verification, compiled bundle check, focused embedding repository regression tests, and published-package smoke.
