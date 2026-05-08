# memory-nexus Adversarial Review — Consolidated Findings

**Date:** 2026-04-26
**Method:** 5 independent adversarial agents (architecture, security, reliability, UX/DX, performance + tests). Each agent ran in isolation with no knowledge of the others' findings. Severity rubric standardised across reviews.
**Source files:**
- `2026-04-26-adversarial-architecture.md` — Hexagonal & SOLID
- `2026-04-26-adversarial-security.md` — Threat model, secrets, access control
- `2026-04-26-adversarial-reliability.md` — Failure modes, concurrency, data integrity
- `2026-04-26-adversarial-ux-dx.md` — CLI ergonomics, AI-agent integration
- `2026-04-26-adversarial-perf-tests.md` — Performance, scalability, test coverage

## Top-line counts

| Reviewer | CRIT | HIGH | MED | LOW |
|---|---|---|---|---|
| Reliability | 4 | 5 | 6 | 4 |
| Security | 4 | 5 | 4 | 3 |
| Architecture | 6 | 8 | 7 | 6 |
| UX/DX | 2 | 6 | 7 | 6 |
| Perf/Tests | 2 | 4 | 6 | 3 |
| **Totals** | **18** | **28** | **30** | **22** |

98 findings total. Independent reviewers — convergence on themes is signal, not bias.

## Cross-cutting themes (where reviewers agreed independently)

### Theme 1: "Right skeleton, gap between policy and execution"

The architecture has correct intentions everywhere. The boundaries that exist are correct. The boundaries that should exist are missing.

- Architecture: domain core is "pristine"; application layer reaches past its own ports into raw SQL; presentation instantiates 22 SQLite repositories directly.
- Reliability: `--background` sync has a PID lock; foreground sync has none.
- Security: SQL is parameterized, `spawn` is array-form; but ingest stores raw transcripts with no redaction step before they hit the durable store or the embedding API.
- UX/DX: README markets "AI-First Design"; JSON output has no `schema_version` field; `--format ai` is a placebo flag for non-TTY callers.

This is the dominant pattern. Most fixes ladder up to "complete the boundary that was started."

### Theme 2: The friction-log channel is high-bandwidth leakage AND noise-polluted

Independently surfaced by both Security and UX/DX.

- Security: friction-log is the highest-bandwidth Claude-self-leakage channel. Convention asks Claude to describe failures in free-form text — including raw error messages, tokens, paths — written straight to the durable store with no redaction. This session's friction #207 went into that pipeline.
- UX/DX: 26 open friction entries against memory-nexus, but ~18 are stale test fixtures from 2026-04-03 polluting the genuine-complaints view. The real signal: unicode search (#14), output truncation (#15), missing auto-surface in tool projects (#146), spurious empty download bar (#163), and #207 (today's crash).

The user's self-improvement-via-friction loop is corrupted on both ends — leaks in, noise blocking signal out.

### Theme 3: Concurrent process safety is broken; today's failure is the symptom

Reliability identified the root cause of today's UNIQUE-constraint friction (#207).

- Foreground `memory sync --embed` has no mutex (only `--background` does).
- Two embedders (cron + manual; or two terminals) both call `findUnembedded` against the same DB and race on `INSERT INTO message_embeddings`.
- The 281,813/287,013 failure point is consistent with two parallel runs: each made progress through disjoint ranges, then collided on the unembedded tail.
- Even if only one embedder runs: `clearAllEmbeddings()` and `recreateVecTable()` are not atomic — process kill mid-call leaves vec table empty while embedding-state shows "all done."
- Stale-lock detection (`isProcessAlive(pid)`) returns false on EPERM, enabling stale-lock takeover of live processes (Windows, PID reuse, reduced permissions).

#207 should be re-classified from `low/sync` to `critical/concurrency`.

### Theme 4: AI-agent integration is fragile by contract

UX/DX called this fragile in one line: *"works today, one internal refactor away from silent breakage."* Reinforced by other reviewers:

- UX/DX: unversioned JSON across every command; `--format ai` is a placebo; "not found" prints to stdout poisoning pipes.
- Architecture: presentation layer's ad-hoc SQL means a schema rename ripples into CLI output formats — likely undetected by tests until an agent breaks.
- Security: cross-project search has no default scoping. An AI agent searching from project A can hit project B's secrets without warning.

Combined: the contract Claude relies on to call this tool is implicit, undocumented, untested, and not boundary-enforced.

### Theme 5: Coverage discipline is structurally broken

Perf/Tests:
- bun's `--coverage` reports only Funcs and Lines.
- bunfig.toml declares 95% thresholds for all four WoW-required metrics; **statements and branches are unenforceable** on the current test runner.
- This is the exact failure mode the user's `quality-standards.md` warned about: *"100% statements with 85% branches is a FAILURE."* Currently you cannot measure either.
- Test pyramid: 0 E2E, 0 benchmarks.

This isn't "low test coverage." It's "the discipline you require can't be measured by your tooling."

### Theme 6: Performance cliff is already here, not theoretical

Perf/Tests:
- `PRAGMA quick_check(1)` runs on every CLI invocation: **5,251 ms** of the 5.5-6.6s search latency is the pre-flight integrity check. The actual FTS query is 50ms cold; vector KNN is 534ms.
- Linear with DB size: 1M messages → ~19s startup, 10M → ~3min. At ~10k msgs/week growth, unusable for AI-agent workflows within 12 months.
- `embedBatch()` is a sequential loop, not a real batch (3-8× slower than possible).
- sqlite-vec 0.1.6 is brute-force KNN with no ANN index.
- SyncService buffers full session into memory, defeating its own streaming parser.

Cold start cost on routine `memory --help` invocations needs profiling separately.

## CRITICAL findings — full list across reviewers

### Reliability
1. Foreground `memory sync --embed` has no mutex — root cause of today's #207 failure
2. `clearAllEmbeddings()` / `recreateVecTable()` are not atomic — silent vec-state desync on process kill
3. `isProcessAlive(pid)` returns false on EPERM — stale-lock takeover of live processes
4. (Reliability CRIT-4 — see file)

### Security
1. Zero secret redaction on ingest. Tool inputs/results stored verbatim including `printenv`, `cat .env`, error messages with tokens
2. Unredacted secrets shipped to OpenAI / arbitrary HTTP via embedding pipeline. `baseUrl` user-configurable with no allowlist
3. Cross-project search has no default scope — OWASP A01 broken access control
4. (Security CRIT-4 — see file: file permission hardening on config.json)

### Architecture
1. Inverted dependency cycles: application imports `bun:sqlite`, infrastructure imports application code
2. `ExportService` / `ImportService` bypass repositories, hand-write SQL against schema column names
3. Presentation layer instantiates 22 SQLite repositories directly with raw SQL
4. (Architecture CRIT-4 — see file)
5. (Architecture CRIT-5 — see file)
6. (Architecture CRIT-6 — see file)

### UX/DX
1. JSON output unversioned across every command — agent parsers silently break on internal refactors
2. "Not found" prints to stdout instead of stderr — poisons pipes; violates user's own cli-standards

### Perf/Tests
1. `PRAGMA quick_check(1)` 5.2s pre-flight on every CLI invocation — already too slow, scales linearly
2. Coverage discipline unenforceable: bun reports only Funcs+Lines; statements+branches uncovered

## Recommended remediation phases

If the goal is "no-brainer with no shortcomings," the work clusters into 6 phases. Sequencing matters — security before architecture, because architectural rework risks rebuilding around an unsafe data model.

### Phase A — STOP THE BLEEDING (today/this week)

Goal: prevent further data loss, prevent further leakage in the wild.

- A1. Add mutex to foreground `memory sync --embed`. Reuse the `--background` PID lock pattern. (Reliability CRIT-1)
- A2. Wrap `clearAllEmbeddings` + `recreateVecTable` in a single SQLite transaction. (Reliability CRIT-2)
- A3. Re-classify friction #207 to `critical/concurrency`. Audit DB for desync between `embedding_state` and `message_embeddings`.
- A4. Default `memory search` to current-project scope; require `--all-projects` opt-in to widen. (Security CRIT-3)
- A5. Disable third-party-embedding code paths until redaction is in place. Make `provider: "openai"` print a startup warning about the data flow. (Security CRIT-2)

Cost: ~1-2 days. No structural changes. Pure damage control.

### Phase B — INGEST REDACTION (next week)

Goal: stop importing secrets into the durable store and the embedding pipeline.

- B1. Build a redaction pipeline at the `event-classifier.ts` boundary. Detect known-pattern secrets (high-entropy strings, common API key prefixes, env-style assignments). Store redacted form in `messages_meta.content`; log audit trail of what was redacted.
- B2. Apply same redaction to `tool_uses.input` / `tool_uses.result`.
- B3. Apply redaction to friction-log ingest — that channel is the highest-bandwidth leak.
- B4. Add CLI `memory audit-secrets` to scan existing corpus for likely-leaked patterns and offer to redact in-place (with WAL backup first).

Cost: ~1 week. Fixes the largest security exposure surface.

### Phase C — COMPLETE THE BOUNDARIES (next 2 weeks)

Goal: enforce the architecture that's already half-built. Every reviewer flagged this in different language.

- C1. Build a composition root. CLI commands receive repositories via DI, not direct instantiation.
- C2. Move all SQL out of presentation. CLI commands call application use cases; application calls repository ports.
- C3. Move all SQL out of application services that bypass repositories (ExportService, ImportService).
- C4. Remove the 13 module-level test-seam globals (`setTestDbPath` etc) — replace with constructor injection.
- C5. Reverse the 4 inverted dependency cycles. Application no longer imports `bun:sqlite`; infrastructure no longer imports application.

Cost: ~2 weeks. Higher risk of regression — needs Phase B done first so the redaction policy isn't accidentally bypassed during refactor.

### Phase D — AI-AGENT CONTRACT (parallel with C)

Goal: make agent integration durable.

- D1. Add `schema_version` field to all `--json` outputs.
- D2. Move all "not found" / "no results" messages to stderr; stdout reserved for data per cli-standards.
- D3. Either implement `--format ai` to do something distinct, or remove the flag.
- D4. Document the JSON contracts in `docs/agent-contract.md` with examples.
- D5. Add contract tests that fail on schema drift.

Cost: ~3-5 days. High user-visible payoff.

### Phase E — PERFORMANCE (after C is stable)

Goal: bring search latency to <500ms cold, scale headroom to 10M messages.

- E1. Move `PRAGMA quick_check(1)` to `memory doctor` only; remove from CLI startup. Single biggest win — drops latency from 5.5s to ~0.5s.
- E2. Replace sequential `embedBatch` loop with real batched embedding (provider-API-batch or local-model parallelism).
- E3. Investigate ANN index for sqlite-vec (or migrate to a proper vector DB). Brute-force is acceptable today; not at 5M messages.
- E4. Stream sessions during sync instead of buffering — fix SyncService memory footprint.
- E5. Add benchmarks for the 5 hottest paths. CI fails on regression beyond N%.

Cost: ~1-2 weeks.

### Phase F — TEST DISCIPLINE (parallel with E)

Goal: make WoW coverage standard measurable and enforced.

- F1. Migrate from bun's `--coverage` to a runner that reports all four metrics (statements/branches/functions/lines). c8 + bun-test, or v8-coverage, or full Node + Vitest. Decide and migrate.
- F2. Set CI to fail on <95% at any single metric.
- F3. Add E2E test layer — at least 3 happy-path flows (init/sync/search/show, friction log/list/resolve, context query against mock projects).
- F4. Add benchmarks; fail CI on regression.
- F5. Friction-log cleanup: separate test fixtures from real entries; consider a `friction.fixtures.jsonl` to prevent future cross-pollution.

Cost: ~1 week. Required for any of B/C/E to be safely sustained.

## Open questions and gaps the reviewers couldn't resolve

- Schema migration story — does memory-nexus have one? If a user upgrades the CLI on an existing DB, what happens?
- Backup/archival policy — DB grows unbounded today. Strategy?
- Embedding-model version migration — if the embedding model changes, do existing embeddings become stale? Detection?
- Cold-start cost on `memory --help` (separate from search) — needs profiling.
- The friction-log test-fixture pollution: when did fixtures start landing in the production friction store? Is the friction CLI distinguishing test-mode from real-mode at all?

## Re-classification of session friction

This session logged friction #207 as `low/sync` for the embedding UNIQUE-constraint failure. That was based on the surface symptom ("recoverable, just re-run"). The reliability review traced it to a race condition with no mutex on the foreground sync path — concurrent embedders silently colliding. **Re-classify to `critical/concurrency` once the cleanup of test-fixture friction is also handled** (per UX/DX theme 2). Don't update in isolation; the friction store needs broader hygiene first.

## What's done well (from each reviewer)

- **Architecture:** domain layer is pristine — zero external dependencies, clean port definitions, well-named.
- **Security:** parameterized SQL throughout; array-form `spawn` (no command injection in spawn sites); reasonable FTS5 query sanitizer.
- **Reliability:** the `--background` sync DOES have proper locking; the pattern is already in the codebase, just not applied everywhere.
- **UX/DX:** subcommand structure is sensible; `memory --help` is reasonably discoverable.
- **Perf/Tests:** 447 unit tests with 0 failures; domain coverage is excellent on the metrics that ARE measurable.

## Bottom line

The skeleton is genuinely sound. The execution gap is the entire surface. Phases A–F as ordered: ~6-8 weeks of focused work to close the gap between the architectural intent and the codebase reality. The user's stated goal of "no-brainer with no shortcomings" is reachable from here — but Phase A (this week) cannot wait.
