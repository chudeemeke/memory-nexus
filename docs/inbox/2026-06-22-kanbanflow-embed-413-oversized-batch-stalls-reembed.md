---
schema_version: "1.3"
source_project: kanbanflow
created: 2026-06-22
type: bug
severity: high
fix_status: tested
affects_scope: all-consumers
workaround_applied: "None effective; metadata sync works, --embed stalls at the same offset on every resume. Untested stopgap: lower embedding.batchSize in config."
priority_rationale: "Embedding (semantic search) is blocked corpus-wide; resume re-hits the same oversized batch so the run can never complete unattended."
issue_id: kanbanflow:2026-06-22:embed-413-oversized-batch
thread_id: memory-nexus:2026-06-22:embed-413-batching
related_issue: C:\Projects\memory-nexus\docs\inbox\2026-06-17-tailscale-ollama-egress-endpoint-confirmed.md
next_owner: memory-nexus
status: in-progress
triaged_at: 2026-06-22
---

# `memory sync --embed` aborts on Ollama 413 (oversized batch) and stalls at the same offset on resume

## Symptom

During a routine `memory sync --embed` (memory v4.0.0) the metadata sync succeeded but the embedding pass aborted partway:

```
Embedding 197732 messages...
Done.
Embedding failed at 168300/366032 messages. Run memory sync --embed to resume from where it stopped.
Error: Ollama error 413: 413 Request Entity Too Large
nginx/1.27.5
```

The run stops with a non-zero embedding outcome. The advertised remedy ("resume from where it stopped") does not help: re-running `memory sync --embed` re-selects the same unembedded batch and hits the identical 413 at the same offset. Net effect: embeddings/semantic search are stuck corpus-wide (~366k messages) and cannot complete unattended.

This surfaced in a kanbanflow session while refreshing project memory; the failure is in the shared `memory` tool, not in kanbanflow.

## Context / environment

This is the same 768-dimension full re-embed kicked off under the related Tailscale endpoint item (model migrated `Xenova/all-MiniLM-L6-v2` → `nomic-embed-text`). Embedding config in `C:\Users\Destiny\.config\memory\config.json`:

- provider `ollama`, model `nomic-embed-text`, dimensions `768`
- baseUrl `https://ollama.tail859c3a.ts.net`
- `batchSize: 100`

The endpoint is a tailnet-only Ollama sidecar fronted by an internal `nginx/1.27.5` proxy (per the related item). `/api/tags` and single-input `/api/embed` smokes pass; the 413 is the proxy rejecting an oversized POST body, i.e. a batch-size-vs-`client_max_body_size` problem, not an endpoint outage.

## Repro

1. Configure the `ollama` provider against an Ollama endpoint behind an nginx proxy with a default `client_max_body_size` (1MB).
2. Have a corpus where a batch of `batchSize` (100) messages serializes to a JSON body larger than that limit (long messages make this easy at 100/batch).
3. Run `memory sync --embed` (or `--embed --force`).
4. Embedding aborts with `Ollama error 413` at the first oversized batch. Re-running resumes to the same offset and aborts again.

## Root cause

Read from the fork source (`C:\Projects\memory-nexus\src`), not the global install.

1. **Whole batch sent as one request, no payload cap.** `OllamaProvider.embedBatch()` serializes every text in the batch into a single `/api/embed` POST body:
   - `src/infrastructure/embedding/ollama-provider.ts:119-128` — `body: JSON.stringify({ model: this.model, input: texts })` for the full `texts` array.
   - Batch size is purely a count (`batchSize`, default 100), with no byte/size bound — `src/application/services/embedding-service.ts:108,121,186` (`this.batchSize = deps.config.batchSize`; `findUnembedded(this.batchSize)`).

2. **No 413-specific handling.** On a non-OK response, `embedBatch` calls `throwWithHint(status, errorBody)`, which only special-cases 404 (model-not-found) and otherwise rethrows a generic `Ollama error <status>` — `src/infrastructure/embedding/ollama-provider.ts:130-132,159-169`. A 413 therefore propagates as a hard throw.

3. **One batch failure aborts the whole run, and resume can't make progress.** `EmbeddingService.embedUnembedded()` has no try/catch around `provider.embedBatch(texts)`, so the throw rejects the entire pass — `src/application/services/embedding-service.ts:186-203`. Because the failed batch is never stored, the next `findUnembedded(batchSize)` returns the same rows, so resume deterministically re-hits the same 413. The checkpoint/resume mechanism is defeated by a fixed-size oversized batch.

So the bug is structural: count-based batching with no size awareness + no retriable-error handling + abort-whole-run-on-throw ⇒ a single oversized batch permanently wedges the embedding pipeline.

## Proposed fix

memory-nexus side (preferred — robust regardless of proxy limits):

1. **Adaptive split-and-retry on 413 in `embedBatch`.** Catch `413` specifically (alongside the existing 404 hint). If `texts.length > 1`, split the batch in half and embed each half recursively, concatenating results in order. If a single text still 413s, it exceeds the limit on its own — surface it as a skippable per-message failure (see #3), don't abort.
2. **Optional byte-bounded batching.** Add a `maxBatchBytes` (config, default ~80% of a conservative `client_max_body_size`, e.g. 800KB). In `EmbeddingService.embedUnembedded`/`embedBatch`, accumulate texts until the serialized body approaches the cap, then flush — so batches are bounded by size, not just count. This prevents the 413 proactively rather than only reacting to it.
3. **Don't let one batch kill the run.** Wrap the per-batch embed in try/catch; on a non-retriable failure (e.g. a single message that still 413s), quarantine/skip that message with a logged warning and a count in the result, then continue. Per no-hidden-debt: `log()` exactly what was skipped so silent truncation can't masquerade as "fully embedded."

Infra alternative (note, not the memory-nexus fix; tracked via `related_issue`): raise `client_max_body_size` on the Ollama sidecar's nginx. This unblocks the immediate run but doesn't fix the class of bug — a larger corpus or a single very long message will hit it again. Recommend doing the app-side fix regardless.

User-side stopgap (untested) to unblock the in-flight re-embed now: lower `embedding.batchSize` in `config.json` (e.g. 100 → 10–20) and re-run `memory sync --embed`. Smaller bodies may clear the proxy limit, though a single oversized message would still fail.

## Test plan

- Unit (`ollama-provider.test.ts`): mock `fetch` to return 413 for a multi-text body and 200 for the halved bodies; assert `embedBatch` splits, retries, and returns embeddings in original order.
- Unit: single-text batch returns 413; assert it raises a distinct skippable error (not a generic abort) — or returns a typed failure depending on the chosen contract.
- Unit (`embedding-service.test.ts`): a batch that fails non-retriably is skipped-with-warning and the run continues over remaining batches; the result reports `skipped > 0`.
- Unit: with `maxBatchBytes` set, assert batches never exceed the byte cap regardless of `batchSize`.
- Keep coverage at the project's 95%+ per-metric bar.

## Suggested commit message

```
fix(embedding): survive Ollama 413 with adaptive batch splitting

- Split-and-retry in OllamaProvider.embedBatch on 413 (Request Entity Too
  Large) instead of aborting the whole embedding pass
- Bound batches by serialized body size (maxBatchBytes), not just count
- Quarantine and log a single message that still exceeds the limit so the
  run continues and reports skipped count

Root cause: count-based batching (batchSize=100) sent as one /api/embed body
exceeded the Ollama sidecar nginx client_max_body_size; no 413 handling meant
resume re-hit the same oversized batch and stalled at a fixed offset.
```

## Risks / things to verify before merging

- Confirm Ollama `/api/embed` ordering guarantee holds when results are reassembled from split sub-batches (the provider already assumes order; preserve it).
- Recursive split depth on a pathological single huge message — cap recursion and fall through to skip rather than loop.
- `maxBatchBytes` default must be conservative vs the real proxy limit; the sidecar nginx limit is currently unknown (likely the 1MB default). Coordinate with the `related_issue` to confirm the actual `client_max_body_size`.
- Verify the global install vs fork: behavior above was read from the fork at `C:\Projects\memory-nexus\src`; confirm the published v4.0.0 the user runs matches before asserting line numbers in any PR.

## Related

- `related_issue`: `docs/inbox/2026-06-17-tailscale-ollama-egress-endpoint-confirmed.md` — the endpoint contract + the 768-dim re-embed this failure occurred during. The 413 is the next failure mode after that endpoint was confirmed reachable.
- Reported from a kanbanflow memory-refresh session (memory v4.0.0).

## Memory-nexus triage - 2026-06-22

Accepted as a real memory-nexus bug, not a Kanbanflow-local issue.

Validated evidence:

- Installed `memory` binary resolves to `C:\Users\Destiny\.bun\bin\memory.exe` and reports version `4.0.0`.
- Current memory config uses provider `ollama`, model `nomic-embed-text`, dimensions `768`, base URL `https://ollama.tail859c3a.ts.net`, and `batchSize: 100`.
- No `memory` or `bun` embedding process was running during triage, so the previous re-embed was not still making progress.
- `curl.exe --include --noproxy "*" --max-time 30 https://ollama.tail859c3a.ts.net/api/tags` returned `HTTP/1.1 200 OK`, `Server: nginx/1.27.5`, and `nomic-embed-text:latest`; the endpoint is reachable.
- Tailscale's checked-in `compose/ollama/nginx/nginx.conf` has no `client_max_body_size`, so the sidecar likely uses nginx's default request-body limit.
- `memory status --embedding --json` timed out during triage, so it is not used as evidence.
- Source validation confirms the structural root cause:
  - `src/infrastructure/embedding/ollama-provider.ts` sends the full `texts` array as one `/api/embed` JSON body.
  - The same provider only special-cases 404/model-not-found; 413 propagates as a generic hard error.
  - `src/application/services/embedding-service.ts` selects `findUnembedded(this.batchSize)`, awaits `provider.embedBatch(texts)` without a per-batch recovery path, and only stores the batch after every embedding result returns.
  - Failed rows remain unembedded, so the next resume selects the same oversized batch.

Impact:

- Kanbanflow is blocked because project memory refresh cannot complete semantic embeddings.
- This affects any consumer with a large corpus, long messages, or a remote/proxied embedding provider with request body limits.
- This is a market-readiness blocker for `@chude/memory`: resume must not deterministically re-hit an unrecoverable batch, and one pathological message must not wedge the corpus-wide embedding pipeline.

Triage decision:

- Implement the memory-side fix before continuing broad market-readiness work.
- Treat a Tailscale/nginx `client_max_body_size` increase as an optional operational mitigation only. It does not remove the class of bug.
- Add tests before implementation for adaptive 413 split/retry, single-item oversized failure handling, byte-bounded batching, skipped-message reporting, and resumability.

Open coordination:

- If Tailscale confirms the sidecar's actual `client_max_body_size`, use it to choose the default `embedding.maxBatchBytes`.
- If no limit is confirmed, choose a conservative default and keep adaptive split/retry as the correctness mechanism.

## Source Fix Verified - 2026-06-22

memory-nexus Phase 41.1 implemented and verified the source-side fix:

- typed `payload_too_large` provider errors;
- Ollama HTTP 413 multi-item split/retry with order preservation;
- `embedding.maxBatchBytes` service-side byte-bounded batching;
- durable model-scoped `embedding_skips` records for single-item payload failures;
- resume filtering that excludes current-model skipped rows and permits retry after model changes;
- safe text/JSON skipped-count reporting in `memory sync --embed`.

Verification passed: `bun run typecheck`, `bun run build`, `bun test --timeout 15000` (4,364 pass, 0 fail), `bun run test:isolation`, `bun run eval:v5`, `bun run test:coverage` (statements 97.35%, branches 95.00%, functions 96.59%, lines 97.45%), `bun audit`, `git diff --check`, and inbox lint.

This item remains open until the fixed code is published as a patch release or the remaining local-only install status is explicitly accepted as sufficient for the next goal. Do not treat npm `@chude/memory@4.0.0` as registry-fixed; the local global CLI is currently fixed by a Bun link to the verified hotfix worktree.

## Local Fixed Install - 2026-06-22

The fixed build was committed and installed locally for the actual global `memory` command:

- Hotfix commit: `03cbe28 fix: harden embedding pipeline provider limits`.
- Clean verification worktree: `C:\Projects\memory-nexus-hotfix-41-1`.
- Clean `bun run quality`: passed.
- Global `memory` executable: `C:\Users\Destiny\.bun\bin\memory.exe`.
- Bun global package target: `C:\Projects\memory-nexus-hotfix-41-1`.
- Installed CLI still reports version `4.0.0` because npm patch versioning has not yet been done.
- `memory --help` does not expose Phase 42/Dreaming commands, confirming the global CLI is not running the dirty main worktree.

Runtime checks after install:

- `memory status --json` reported provider `ollama`, model `nomic-embed-text`, base URL `https://ollama.tail859c3a.ts.net`, `maxBatchBytes: 800000`, and provider egress allowed for `ollama.tail859c3a.ts.net`.
- Live `https://ollama.tail859c3a.ts.net/api/tags` returned `nomic-embed-text:latest`.
- A production `memory sync --embed --json` run progressed from about `176100` embedded rows to `180100` embedded rows before being stopped to avoid leaving a long orphaned foreground process. It did not hit the old immediate 413 wedge during that observed window.
- Kanbanflow has `25577` messages; `23479` were embedded at the time of inspection, with the largest known Kanbanflow messages up to `427070` bytes already embedded and `2098` remaining unembedded. The remaining Kanbanflow maximum was `102589` bytes.
- Installed public API smoke proved byte-bounded batching under a `512` byte cap: provider calls were split into `509` bytes and `50` bytes, both below the configured cap.
- Focused clean-worktree tests passed for `EmbeddingService`, `EmbeddingRepository`, and sync embedding pass, including model-scoped `payload_too_large` skip and resume behavior.

Remaining release truth:

- The public npm registry is not fixed yet because `@chude/memory@4.0.0` has already been published and cannot be republished.
- Registry-level resolution requires a patch release, most likely `4.0.1`, and npm OTP at publish time.
- Full 768-dimension corpus completion was not forced as a pre-goal gate because the remaining corpus is large enough to run for hours; the blocker class is the deterministic 413 wedge, not the existence of remaining unembedded rows.

## Event Log
<!-- inbox-events:v1 -->
- 2026-06-22T00:00:00.000Z | kanbanflow | filed | `memory sync --embed` aborted at 168300/366032 with Ollama 413; root-caused to count-based batching + no 413 handling in OllamaProvider.embedBatch.
- 2026-06-22T00:25:00.000Z | memory-nexus | triaged | Accepted as an all-consumer embedding pipeline bug; endpoint is healthy, installed memory is v4.0.0, and source confirms fixed count-based batches can wedge resume on 413.
- 2026-06-22T02:07:50.000Z | memory-nexus | in_progress | Phase 41.1 source fix and quality/security gates passed; awaiting fixed install/publish and live re-embed verification before closure.
- 2026-06-22T05:25:00.000Z | memory-nexus | in_progress | Fixed global CLI now resolves through Bun to `C:\Projects\memory-nexus-hotfix-41-1` at commit `03cbe28`; clean quality passed, status shows `maxBatchBytes: 800000`, live embedding progressed, and focused skip/resume tests passed. npm patch publish remains outstanding.
