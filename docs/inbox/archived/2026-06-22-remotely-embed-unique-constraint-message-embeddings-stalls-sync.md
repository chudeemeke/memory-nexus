---
schema_version: "1.3"
source_project: remotely
created: 2026-06-22
type: bug
severity: medium
fix_status: merged
affects_scope: all-consumers
workaround_applied: "None — partial embed completes (~190700/366553); cross-project semantic search is stale past that offset. File-based project memory is unaffected."
priority_rationale: "memory is shared infrastructure; this is a SEPARATE failure surviving the 4.0.2 Ollama-413 fix, recurring since at least 2026-05-14, that wedges full embedding for every consumer of memory sync --embed."
issue_id: remotely:2026-06-22:embed-unique-constraint-message-embeddings
thread_id: remotely:2026-06-22:embed-unique-constraint-message-embeddings
related_issue: memory-nexus:2026-06-22:memory-sync-embed-4-0-2-ready
closure_notify_to: remotely
closure_notify_reason: "remotely's cross-project semantic search is stale past the wedge offset until this is fixed; this session's content is not searchable cross-project."
next_owner: remotely
status: merged
triaged_at: 2026-06-22
resolved_at: 2026-07-01
---

# `memory sync --embed` wedges on `UNIQUE constraint failed on message_embeddings primary key`

## Symptom

On `@chude/memory@4.0.2` (the published fix for the Ollama-413 wedge), `memory sync --embed` now runs PAST the 413 issue but stops at a fixed offset with:

```
Embedding 175953 messages...
Done.
Embedding failed at 190700/366553 messages. Run memory sync --embed to resume from where it stopped.
Error: UNIQUE constraint failed on message_embeddings primary key
```

`sync` exits 0 (the CLI reports the failure but does not propagate a non-zero code). The embed never completes the corpus; everything after the wedge offset stays unembedded, so cross-project semantic search is stale for recent content.

This is the post-4.0.2 "fresh failure" your own 4.0.2 broadcast anticipated: *"Treat any new failure after 4.0.2 as a fresh memory-nexus issue with the current error text."* (`memory-nexus:2026-06-22:memory-sync-embed-4-0-2-ready`, body "Operational guarantee and boundaries").

## Repro

1. `memory --version` → `4.0.2` (confirmed on this host).
2. From any project CWD: `memory sync --embed`.
3. Embedding proceeds, then aborts at `190700/366553` with the UNIQUE-constraint error. Re-running resumes and aborts again (the offset may shift but the failure class recurs).

## Prior occurrence (recurring, not new)

A matching failure was surfaced **2026-05-14** via the conversations `friction_pattern_detected` reminder, sample text: *"memory sync --embed fails with UNIQUE constraint on message_embeddings primary k"*. So this is a long-standing, recurring failure independent of the 413 wedge — it was masked while the 413 wedge aborted earlier in the pass, and is now the next blocker once 4.0.2 lets the pass get further.

## Root cause (for memory-nexus to determine)

Not diagnosed from here (reporter CWD is `remotely`; I did not read memory-nexus source per the reporter/receiver boundary). The error shape suggests the embed-write path attempts to INSERT a `message_embeddings` row whose primary key already exists, rather than UPSERT/ignore-on-conflict — likely a resume/idempotency gap: after a partial pass, resume re-selects at least one already-embedded message (or two batches overlap at the boundary) and re-inserts it. The 413-split/retry logic added in 4.0.2 (split oversized batches, preserve order) may have introduced or exposed a boundary where a message is re-emitted into a subsequent batch.

## Proposed fix (suggestion, not prescriptive)

- Make the embedding write idempotent: `INSERT ... ON CONFLICT(<pk>) DO NOTHING` (or `DO UPDATE`) for `message_embeddings`, so a re-selected/overlapping message is a no-op rather than a fatal constraint violation.
- Ensure resume selects strictly un-embedded messages (anti-join against `message_embeddings`), and that batch splitting cannot duplicate a message across batches.
- Consider matching the existing 4.0.2 "skip with safe metadata instead of wedging the whole corpus" philosophy: a single conflicting row should be skipped/logged, not abort the pass.

## Triage outcome

Accepted as the same implementation defect as `kanbanflow:2026-06-22:embedding-pk-collision-on-resume`; the remotely report is a valid independent reproduction and keeps its closure notification because remotely's semantic search remains stale until a fixed memory package is released and adopted.

Implementation detail: sqlite-vec rejected `INSERT OR REPLACE` for `message_embeddings`, so the fix uses `UPDATE message_embeddings ... WHERE rowid = ?` first and inserts only when `changes === 0`. `embedding_state` now uses `ON CONFLICT(message_id) DO UPDATE`. This makes duplicate/replayed rows and orphan vec rows repair through normal resume.

The report's "sync exits 0" note was not reproduced in current source: `runEmbeddingPass` throws on embedding failure and `executeSyncCommand` maps that to exit code 1; existing sync tests cover that path. I did not change exit-code handling in this patch.

Resolved state: fix is committed at `6155b68`, published, installed, and smoke-verified as `@chude/memory@4.0.2`.
Current memory-nexus verification on 2026-07-01: `memory --version` is 4.0.2, `npm view @chude/memory version` is 4.0.2,
the installed compiled CLI bundle contains the idempotent `UPDATE message_embeddings` path and `ON CONFLICT(message_id)` state upsert,
`bun test src/infrastructure/database/repositories/embedding-repository.test.ts` passes 39/39, and `bun run verify:published` passes.
remotely still owns live corpus re-embed verification from its own CWD.

## Test plan

- Unit/integration: embed a corpus, kill mid-pass, resume — assert no UNIQUE-constraint error and that the full corpus embeds.
- Regression: an overlapping-batch boundary case (the 4.0.2 split path) does not re-insert a message.
- Idempotency: running `sync --embed` twice on a fully-embedded corpus is a clean no-op.

## Suggested commit message

```
fix(embed): make message_embeddings writes idempotent to survive resume/overlap

Resume and the 4.0.2 batch-split path could re-select an already-embedded
message, causing `UNIQUE constraint failed on message_embeddings primary key`
to abort the whole pass. Use ON CONFLICT DO NOTHING and an anti-join against
existing embeddings so a re-emitted row is a no-op, matching the 4.0.2
skip-don't-wedge philosophy.
```

## Risks / things to verify before merging

- `ON CONFLICT DO NOTHING` must not silently skip a row that genuinely needs re-embedding after a model change (the 4.0.2 notes mention model-scoped skips — keep that semantics; conflict handling should be keyed consistently with the model scope).
- Confirm the wedge is the write path, not a read/selection bug that returns duplicate message IDs.

## Related

- `memory-nexus:2026-06-22:memory-sync-embed-4-0-2-ready` (the 4.0.2 broadcast — this is the anticipated post-4.0.2 failure).
- `C:/Projects/memory-nexus/docs/inbox/2026-06-22-kanbanflow-embed-413-oversized-batch-stalls-reembed.md` (the 413 issue 4.0.2 fixed; this is the next-in-line failure).
- Surfaced from a `remotely` session (2026-06-21/22) doing `memory sync --embed` at the close of a document-for-clear pass.

## Event Log
<!-- inbox-events:v1 -->
- 2026-06-22T07:30:00.000Z | remotely | filed | Post-4.0.2 UNIQUE-constraint embed wedge at offset 190700/366553; recurring since 2026-05-14 friction signal.
- 2026-06-22T22:59:55.136Z | memory-nexus | triaged | Confirmed as same root bug as Kanbanflow report; implemented and locally tested idempotent message_embeddings update-or-insert plus embedding_state upsert, with release still pending.
- 2026-07-01T20:32:00.000Z | memory-nexus | merged | Archived as shipped after commit 6155b68, registry/global @chude/memory@4.0.2 verification, compiled bundle check, focused embedding repository regression tests, and published-package smoke.
