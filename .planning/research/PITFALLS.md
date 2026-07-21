# Pitfalls Research

**Domain:** Turning a local-first CLI + SQLite/WAL app into a long-lived MCP/HTTP/SSE server, plus a public agentic-memory benchmark suite (`@chude/memory` v6.0)
**Researched:** 2026-07-21
**Confidence:** HIGH (concurrency + governance pitfalls grounded in actual `connection.ts` / service code; benchmark pitfalls grounded in the documented Mem0/Zep LOCOMO dispute)

> The v1.0 pitfalls for the CLI/extraction system are preserved at `.planning/research/PITFALLS-v1-baseline.md`. This file is the v6.0 server-surface + benchmark milestone.

> Grounding note: this system today runs a **CLI-per-invocation model** — every command calls `initializeDatabase()` → does work → `closeDatabase()`. `closeDatabase()` (connection.ts:253) runs `PRAGMA wal_checkpoint(TRUNCATE)` **and then `PRAGMA journal_mode = DELETE`** to drop WAL/SHM files and release Windows file locks. That teardown is correct for short-lived processes and actively wrong for a long-lived server: **a daemon never fires that checkpoint, so the WAL grows unbounded.** Almost every concurrency pitfall below traces back to that single behavioral assumption changing.

---

## Critical Pitfalls

### Pitfall 1: A server handler bypasses the SmartContextService/governance path by calling repositories directly (SINGLE MOST DANGEROUS)

**What goes wrong:**
An MCP tool or HTTP route reaches a `*-repository` directly (or `new`'s an application service without the real `PatternRedactor`) and returns raw, unredacted, cross-scope content — secrets, API keys, PII, another project's memories — over the wire. The CLI has been hardened for this; a fresh presentation adapter silently is not. The North Star pushback line is explicit: "it is not done if consent is bolted on"; redaction must happen "before storage, FTS, embedding, extraction, export, logs, provider egress, and remote sync." A server response is a new egress surface that list did not name. PROJECT.md's v6.0 invariant already forbids it: "no business logic in the adapter and **no parallel governance path**."

**Why it happens:**
Three concrete, code-level traps in this repo:
1. **The `NOOP_REDACTOR` default.** `dreaming-service.ts`, `embedding-service.ts`, and `export-service.ts` each define a `NOOP_REDACTOR` used when `redactor` is not injected (`redactText: (input) => ({ text: input, findings: [] })`). If the server wires these through DI and forgets the redactor, redaction becomes a silent no-op — no error, clean-looking demo.
2. **Repository-direct reads.** Governance state (redactionState/consentStatus/consentScopes) lives in `MemoryGovernanceService` and the governance repository, not in the raw content rows. An endpoint that queries `search`/`context`/`show` repositories directly returns content without ever consulting governance or scope isolation.
3. **Egress policy off the server path.** `provider-egress-policy.ts` (`requireProviderEgressAllowed`, deny-by-default, consent must be `granted`, host+provider allowlists) guards provider calls. An SSE "live context" or MCP "enrich" tool that triggers embedding/extraction can reach a provider from a path that never calls `requireProviderEgressAllowed`.

**How to avoid:**
- **Import-boundary lint (primary prevention).** Add an enforced layer rule: `src/presentation/server/**` (and the MCP/HTTP/SSE adapters) may import from `src/application/**` **only** — never `src/infrastructure/**/repositories/**`, never `bun:sqlite`, never a `*-repository`. Wire it as an ESLint `no-restricted-imports`/boundaries rule (or dependency-cruiser) in CI so a repo-direct read fails the build, not code review. This is the same hexagonal discipline the CLI already follows, made mechanical for the new surface.
- **One enforcement seam, reused.** The server calls the *same* use-cases the CLI calls (`SmartContextService`, search/context use-cases) with the *same* real `PatternRedactor` and governance services injected. No reimplementation.
- **Fail-closed redaction.** For server-context construction, remove/forbid the `NOOP_REDACTOR` fallback: throw at construction if no redactor is injected. No-op default is acceptable only in pure unit tests.
- **Single response chokepoint.** Every server response body (MCP tool result, HTTP JSON, SSE `data:` frame) passes through one function that applies `redactJson`/`redactText`, enforces scope isolation, and checks egress policy before serialization. Nothing serializes except through it.

**Warning signs:**
- A route/tool handler imports a `*-repository` or `bun:sqlite` (should be caught by the lint).
- A service is `new`'d in server code without a `redactor:` argument.
- `NOOP_REDACTOR` is reachable from a server module.
- No test feeds a known-secret / cross-scope fixture through an endpoint and asserts `[REDACTED]` / scope-filtered output.

**Phase to address:** Governance Parity Seam (must land before MCP/HTTP adapters expose any content). Acceptance gate: (a) import-boundary lint fails CI on any `presentation/server/** → repository/bun:sqlite` import; (b) a "poisoned corpus" test seeds the DB with known secret patterns and multi-project rows, hits every content-returning MCP tool and HTTP/SSE route, and asserts zero raw secrets + correct scope isolation; (c) server-triggered provider egress is refused without granted consent.

---

### Pitfall 2: Reusing the CLI-per-invocation connection lifecycle inside a long-lived process

**What goes wrong:**
The server either (a) calls `initializeDatabase()`/`closeDatabase()` per request — thrashing WAL on/off (`journal_mode=DELETE` then WAL on next open), running a TRUNCATE checkpoint every request, and re-running `quick_check` / FTS5 verification / `sqlite-vec` load on every request — or (b) opens a fresh `new Database()` per request and never closes them, leaking file descriptors and SHM mappings until the process dies. The correct middle path (one long-lived handle, checkpoint on a timer) requires *not* copying the only pattern that exists in the codebase.

**Why it happens:**
`closeDatabase()` was designed to release Windows locks so the CLI can exit and tests can delete the file. Every existing command pairs `initializeDatabase` with `closeDatabase`. A developer copies that into a request handler because it's the established pattern. The journal-mode switch is invisible in a demo, corrosive under load.

**How to avoid:**
- **One long-lived `Database` handle per process**, opened once at server start via `initializeDatabase({ walMode: true })`, kept open for the server lifetime. Do **not** `closeDatabase()` between requests — call it exactly once during graceful shutdown (Pitfall 8).
- **Server-specific lifecycle module** (e.g. `infrastructure/database/server-connection.ts`) owning the singleton and a periodic `checkpointDatabase()` (PASSIVE) timer, since the daemon never hits the CLI's TRUNCATE-on-close.
- **Explicit write model: single writer, many readers.** bun:sqlite calls are synchronous; a shared handle serializes queries on Bun's event loop — acceptable for a single-writer local server, but a slow query blocks *all* clients, so measure it.

**Warning signs:**
- `closeDatabase(` appears inside any request/tool handler.
- Open-count metric grows with request count.
- `memory.db-wal` grows without bound during a soak test.
- First-query-after-idle latency far exceeds steady state (re-init happening).

**Phase to address:** Server Foundation & Concurrency Model (first server phase). Acceptance gate: soak test with concurrent read+write for M minutes shows exactly one `Database` open, bounded WAL size, zero fd growth.

---

### Pitfall 3: SQLITE_BUSY and WAL-checkpoint starvation under concurrent long-lived readers

**What goes wrong:**
A writer hits `SQLITE_BUSY` while a reader holds a lock, or — subtler — a long-lived SSE read transaction prevents WAL checkpoints from completing, so the WAL grows without bound and reads degrade (every read scans an ever-larger WAL). `wal_checkpoint(TRUNCATE)` reports non-zero `busy` frames forever because a reader never releases.

**Why it happens:**
- `busy_timeout = 5000` (connection.ts:185) blocks the synchronous bun:sqlite call up to 5s; on a single shared handle that stalls the whole event loop — every client waits.
- WAL checkpointing only reclaims frames older than the oldest open read transaction. An SSE subscription that holds a read transaction open pins the WAL. This never appeared in the CLI because processes are short and `closeDatabase` force-truncates on exit.

**How to avoid:**
- **Single-writer discipline; short transactions.** Never wrap an SSE stream's lifetime in a DB transaction.
- **Snapshot-then-stream for SSE.** Read into memory (or paginate with fresh short read transactions), then stream; never hold a read transaction for a subscription's duration.
- **Periodic PASSIVE checkpoint** (`checkpointDatabase()`) on a timer + a WAL-size guard that logs/alerts above a threshold (a stuck reader is the cause).
- **Re-tune `busy_timeout` for a server** — a 5s block on a shared synchronous handle is a latency cliff. Prefer a smaller timeout + app-layer retry so one contended write can't freeze all clients.

**Warning signs:**
- `memory.db-wal` grows monotonically in a soak test.
- p99 latency pins near 5s under concurrency.
- `wal_checkpoint` results show persistent non-zero `busy`.
- SSE clients correlate with degraded read latency for everyone.

**Phase to address:** Server Foundation & Concurrency Model (writer/checkpoint model) + SSE Streaming Surface (no-transaction-held-open rule). Acceptance gate: concurrent-writer + long-lived-reader soak keeps WAL bounded and p99 write latency within budget; a test asserts SSE handlers hold no open transaction.

---

### Pitfall 4: Binding to 0.0.0.0 / no local auth / no origin (DNS-rebinding) check

**What goes wrong:**
The HTTP daemon binds `0.0.0.0`, exposing a personal memory substrate (transcripts, decisions, secrets) to the LAN. Even on loopback, with no `Origin`/`Host` validation any web page the user visits can `fetch()` the daemon via DNS-rebinding and exfiltrate memory. With no auth token, any local process/user on a shared machine can read everything.

**Why it happens:**
- Framework/example defaults bind all interfaces; `Bun.serve` needs an explicit `hostname` and omitting it (or setting `0.0.0.0` "so it works from my phone") opens it.
- "It's local, so it's safe" — loopback is necessary, not sufficient; browsers are a confused deputy.
- MCP-over-HTTP examples frequently ship without origin validation; the documented local-server rebinding class applies directly.

**How to avoid:**
- **Bind `127.0.0.1` by default, hard to change.** PROJECT.md invariant: "binds 127.0.0.1 by default, no new egress introduced." Any non-loopback bind requires an explicit, loudly-logged opt-in flag.
- **Validate `Origin` and `Host`** on every HTTP/SSE request; reject unexpected origins (defeats DNS-rebinding), strict allowlist.
- **Require a local auth token** generated at first run, stored `0600`, required as a bearer header. Loopback alone does not isolate from other local processes/users.
- **Prefer MCP stdio as the default transport** (no socket, none of this attack surface); treat the HTTP daemon as the opt-in surface.

**Warning signs:**
- `hostname: "0.0.0.0"` or a bind with no hostname.
- No header check in the request pipeline.
- Server serves content with no token configured.
- `ss`/`netstat` shows a non-loopback listen address.

**Phase to address:** HTTP Daemon & Local Auth. Acceptance gate: test asserts listener is 127.0.0.1-only; foreign-`Origin` request rejected; tokenless request 401; non-loopback bind requires the explicit flag.

---

### Pitfall 5: Benchmark methodology mismatch, leakage, licensing, and cherry-picking (parity claims that don't survive scrutiny)

**What goes wrong:**
The v6.0 suite reports a LOCOMO number that isn't apples-to-apples with Mem0/Zep-cited numbers, so the "category-leader" claim collapses when someone reproduces it — exactly what happened publicly between Mem0 and Zep. Concrete failure shapes: including LOCOMO Category 5 (missing/broken ground truth) to inflate scores; a different LLM-judge prompt/model than the competitor; a single lucky run instead of an average; train/test leakage where memory content or judge exemplars contaminate retrieval; reporting only the metric where `@chude/memory` wins; and **vendoring the LOCOMO dataset into the repo in violation of its CC BY-NC 4.0 license.**

**Why it happens:**
- LOCOMO has documented defects (Category 5 unusable ground truth, multimodal questions missing info, incorrect speaker attribution, under-specified questions). Naive "run the benchmark" reproduces the defects.
- The Mem0↔Zep dispute shows scores swing on *configuration*: Mem0 reported Zep at 65.99%, Zep claimed 75.14% corrected; Mem0 replicated Zep's method at 58.44% vs a cited 84%. Variance is methodology, not model quality.
- LLM-as-judge is non-deterministic; a single run is noise; a different `system_prompt` shifts results double digits.
- CC BY-NC 4.0 permits non-commercial use with attribution but redistribution obligations + the NC clause make committing the data into a package that ships to npm risky.
- This project's own discipline ("not done if docs overstate implementation") makes a shaky benchmark an integrity failure, not just a marketing risk.

**How to avoid:**
- **License hygiene: fetch to a gitignored cache, never vendor.** Download LOCOMO at runtime into a gitignored cache dir; record the dataset version + a content hash; keep attribution; do not commit the data or bundle it in `npm pack`. Verify against `npm pack --dry-run` that no dataset files are included.
- **Restrict to validated LOCOMO categories** (first four) and state explicitly which are included/excluded with rationale. Never silently include Category 5.
- **Match the competitor harness exactly** where a parity claim is made: same categories, same judge model + judge prompt, same number of independent runs (Mem0 averages 10), same retrieval budget. Cite the specific competitor methodology matched.
- **Reproducibility as a deliverable.** Publish scripts, config, dataset version/hash, model/provider versions, exact run instructions; pin judge and dataset versions so a third party reproduces on their own hardware + keys.
- **Full metric set incl. losses.** Per-category accuracy, mean ± stdev over N runs, latency, cost — metrics predefined before running (no post-hoc selection).
- **Guard leakage.** No ground-truth or judge exemplars in the memory store or retrieval prompt; separate ingestion corpus from evaluation queries; hold out a portion never used during tuning.
- **Extend, don't replace, `scripts/eval-v5`.** Keep deterministic internal evals; add LOCOMO + additional public benchmarks as a separate reproducible lane.

**Warning signs:**
- Reported number is a single run / stdev not reported.
- Judge prompt differs from the cited competitor's, or isn't recorded.
- Category 5 (or "all categories") included without comment.
- No committed config/seed/dataset-hash; re-running yields different numbers.
- LOCOMO data files appear in git or in `npm pack --dry-run`.
- Only one metric shown; latency/cost omitted.
- Score moves >5 points when someone else runs it.

**Phase to address:** Public Benchmark Suite. Acceptance gate: a second machine reproduces headline numbers within a stated tolerance from committed scripts+config; report includes per-category mean±stdev over N≥5 runs, the exact judge prompt, excluded categories with rationale, dataset version/hash + CC BY-NC 4.0 attribution; `npm pack --dry-run` proves no dataset is bundled.

---

### Pitfall 6: SSE connection lifecycle — leaks, no backpressure, no heartbeat

**What goes wrong:**
SSE subscriptions accumulate: clients disconnect but the handler, timer, DB cursor, and listeners stay alive (memory + fd leak). No heartbeat means dead connections aren't detected and proxies/idle-timeouts silently drop streams. No backpressure means a slow consumer causes an unbounded in-memory event queue. Combined with Pitfall 3, a held-open read transaction per subscriber pins the WAL.

**Why it happens:**
- SSE has no disconnect signal beyond transport close; you must wire `request.signal`/close events to teardown.
- "Live context subscriptions" (a PROJECT.md target) invites long-lived streams developers forget to bound.
- Bun/Node streams need explicit backpressure; naive `write()` loops buffer without limit.

**How to avoid:**
- **Tie every subscription to an `AbortSignal`/close event**; tear down listeners, timers, cursors on disconnect. Track subscriptions in a bounded registry.
- **Cap concurrent subscriptions** and per-subscription queue depth; on a slow consumer, drop/coalesce with an explicit policy — never buffer unbounded.
- **Heartbeat/keepalive** (`: ping`) on an interval to detect dead peers and keep intermediaries alive.
- **No DB transaction spans a subscription** (Pitfall 3): snapshot or poll with short reads.

**Warning signs:**
- Server RSS grows with connect/disconnect churn.
- Active-subscription count never returns to zero after clients leave.
- Open fd count climbs.
- Slow clients balloon server memory.

**Phase to address:** SSE Streaming Surface. Acceptance gate: churn test returns subscription count + RSS to baseline; slow-consumer test shows bounded memory (backpressure engaged); disconnect test confirms teardown of timers/cursors.

---

### Pitfall 7: MCP protocol conformance and error handling (stdout pollution, wrong error channel)

**What goes wrong:**
On the stdio transport, MCP frames JSON-RPC over stdout. Any stray `console.log`, progress bar, warning (e.g. connection.ts:180 `console.warn` about WAL, or cli-progress output) **corrupts the JSON-RPC stream** and breaks the client. Separately, tool-level failures get thrown as protocol errors (or vice versa), so clients can't tell "the tool ran and returned an error result" from "the protocol broke."

**Why it happens:**
- This codebase writes human-facing output to stdout throughout (it's a CLI). Reusing any of it in the MCP server leaks non-protocol bytes onto stdout.
- MCP distinguishes protocol errors (JSON-RPC error responses) from tool execution errors (successful response with error content). Mapping domain `MemoryError`/`ErrorCode` onto the right channel is easy to get wrong.
- The existing rule "Do not call `process.exit()` from programmatic execute functions" exists because presentation habits leak; the same discipline must extend to stdout writes.

**How to avoid:**
- **Stdout reserved for protocol frames.** Route all logging/diagnostics to stderr (or a file) in server mode. Audit every `console.log`/`console.warn`/progress writer reachable from the MCP path; a lint that fails if server modules import CLI stdout formatters.
- **Deliberate error mapping.** Define which `MemoryError` codes are tool-result errors (returned to the model as reasoning content) vs. protocol errors (malformed request, auth). Never leak stack traces or secret-bearing error context (composes with Pitfall 1).
- **Conform to the targeted MCP spec version** using the official SDK rather than hand-rolled framing; validate with the inspector/reference client. Fetch current MCP SDK/spec docs at implementation time.
- **No `process.exit()` in tool handlers** — a server stays up.

**Warning signs:**
- A real MCP client / SDK inspector reports intermittent parse errors.
- Any stdout write exists in a path reachable from the server entrypoint.
- Tool errors surface as transport failures (client disconnects) instead of structured error results.

**Phase to address:** MCP stdio Adapter. Acceptance gate: conformance test drives the server via the MCP SDK/inspector across all tools incl. error cases; assert zero non-JSON-RPC stdout bytes; assert tool errors return structured error results, not transport breaks.

---

### Pitfall 8: No graceful shutdown — in-flight writes lost, WAL not checkpointed, port not released

**What goes wrong:**
The server is killed (SIGTERM/SIGINT) mid-write; the long-lived handle is never `closeDatabase()`'d, so the final checkpoint doesn't run and (on Windows) WAL/SHM files + the port linger. Or an in-flight write transaction is abandoned, leaving a partial event. On restart, a large un-checkpointed WAL slows startup and an abandoned lock may cause `SQLITE_BUSY`.

**Why it happens:**
- CLI processes exit naturally after `closeDatabase`; a daemon must trap signals and drain explicitly. No signal-driven shutdown exists today (grep shows `process.exit`/`closeDatabase` only inside per-command flows).
- Graceful drain (stop accepting, finish in-flight, checkpoint, close) is easy to omit.

**How to avoid:**
- **Signal handlers** (SIGINT/SIGTERM): stop accepting new connections, close SSE subscriptions cleanly, wait (bounded) for in-flight writes, run one `closeDatabase()` (TRUNCATE checkpoint + close), then exit. This is the *one* place `closeDatabase` belongs in server code.
- **Idempotent, bounded drain** with a hard timeout so a stuck write can't hang shutdown forever.
- **Wrap writes in transactions** so an abandoned write rolls back rather than leaving partial state (composes with event-kernel atomicity).
- Risky-flow invariant: "on shutdown the DB is checkpointed exactly once and no partial event is committed."

**Warning signs:**
- Restart after kill shows a large WAL + slow first query.
- Port remains bound after process death.
- Leftover `-wal`/`-shm` files after shutdown on Windows.
- No SIGTERM handler registered.

**Phase to address:** Server Foundation & Concurrency Model. Acceptance gate: shutdown test sends SIGTERM during active writes; asserts the process drains, checkpoints once, releases the port, leaves a clean DB (no partial events, small/zero WAL).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `initializeDatabase`/`closeDatabase` per request | Fastest; matches existing code | WAL thrash, per-request re-init cost, latency cliffs; masks the real concurrency model | Never in the daemon; fine only for one-shot maintenance subcommands |
| Keep `NOOP_REDACTOR` reachable from server-wired services | Less DI plumbing | Silent unredacted egress — the critical failure | Never in server context; tests only |
| Return repository rows directly from an endpoint | Skips a service layer | Bypasses governance/consent/scope; the forbidden "parallel governance path" | Never (blocked by import-boundary lint) |
| Bind non-loopback "just to test from my phone" | Convenient | LAN exposure of private memory; ships by accident | Only behind an explicit, logged opt-in flag |
| Vendor LOCOMO into the repo | Simpler test setup | CC BY-NC 4.0 redistribution/NC risk; bloats package | Never; fetch to gitignored cache |
| Single LOCOMO headline number without config/seed | Ships a figure fast | Non-reproducible; parity claim collapses; integrity violation | Never for a published parity claim |
| Hold a DB read transaction open for an SSE stream | Simple streaming code | Pins WAL, starves checkpoints, unbounded WAL | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP stdio transport | Logs/progress/warnings to stdout | Stdout = JSON-RPC only; diagnostics to stderr/file |
| MCP SDK | Hand-rolling framing / guessing spec version | Official SDK; fetch current MCP spec at build time; test with inspector |
| bun:sqlite in a daemon | Multiple/ per-request `Database` handles, or worker-thread writes | One long-lived handle, single-writer, synchronous calls serialized |
| `Bun.serve`/HTTP | Missing/`0.0.0.0` hostname; no Origin/Host check | Explicit `127.0.0.1`; validate Origin+Host; require local auth token |
| Provider egress from server actions | Reaching a provider without `requireProviderEgressAllowed` | Route all server-triggered provider calls through deny-by-default egress policy |
| LOCOMO dataset | Committing/redistributing data (CC BY-NC 4.0) | Fetch to gitignored cache; record version+hash+attribution; assert not in `npm pack` |
| LLM-as-judge | Different judge prompt/model than competitor; single run | Match competitor judge; average N runs; pin judge version |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `busy_timeout=5000` on shared synchronous handle | p99 pins near 5s; all clients stall together | Single-writer; short txns; smaller timeout + app-layer retry | As soon as 2+ clients write concurrently |
| WAL grows unbounded (daemon never TRUNCATE-closes) | `-wal` balloons; reads slow over time | PASSIVE checkpoint timer; no long-held read txns; WAL-size guard | Under any long-lived SSE reader |
| Per-request re-init | High first-query latency; repeated FTS5/vec load logs | One long-lived handle | Immediately under sustained traffic |
| Unbounded SSE fan-out/queue | RSS grows with subscribers / slow consumers | Cap subscriptions; bounded queue; backpressure | Dozens of subscribers or one slow client |
| Synchronous heavy query blocks event loop | One costly `search`/graph query freezes all clients | Budget/paginate queries; measure | Large corpus + a costly query |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unredacted / cross-scope content in a response | Secret/PII/other-project exfiltration | Single redaction+scope chokepoint on every response; poisoned-corpus test |
| Bind 0.0.0.0 | Private memory exposed to LAN | Default 127.0.0.1; non-loopback needs explicit logged flag |
| No Origin/Host validation | DNS-rebinding: any web page reads local memory | Validate Origin+Host; strict allowlist |
| No local auth token | Any local process/user reads everything | First-run token, `0600`, required bearer header |
| Secret-bearing error context to client | Leak via error messages/stack traces | Sanitize errors; safe structured results; never echo `MemoryError` context raw |
| Server-triggered provider egress without consent | Sensitive content leaves machine unconsented | `requireProviderEgressAllowed` on all server provider calls |
| `apiKeyRef` resolved to plaintext for a server feature | Raw secret exposure | Keep `apiKeyRef` opaque; runtime injection only; never `authkey get` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| MCP surface mirrors 20+ CLI commands 1:1 | Model overwhelmed; poor tool selection | Curated, minimal tool set over use-cases (PROJECT.md says "curated") |
| Opaque server errors to the agent | Model can't recover/explain | Structured, actionable tool-result errors (safe, no secrets) |
| Silent auth/bind requirements | User confused why HTTP client is refused | Clear first-run message: token location, loopback default, non-loopback opt-in |
| Benchmark report as a single number | Readers over-trust a noisy figure | Per-category mean±stdev, cost, latency, reproduction instructions |

## "Looks Done But Isn't" Checklist

- [ ] **Governance reused:** Often missing — import-boundary lint (presentation/server/** → application/** only) + a poisoned-corpus/scope-isolation test on server output.
- [ ] **MCP server responds:** Often missing — proof redaction fires on tool output; a known secret returns `[REDACTED]`.
- [ ] **HTTP daemon serves:** Often missing — Origin/Host validation + required auth token; foreign-Origin and tokenless requests rejected.
- [ ] **Loopback bind:** Often missing — assertion the listener is 127.0.0.1 only (`ss`/`netstat` in a test).
- [ ] **SSE streams:** Often missing — disconnect teardown + heartbeat + backpressure; RSS/subscription-count return to baseline after churn.
- [ ] **Concurrency "works":** Often missing — soak test proving bounded WAL, single handle, no fd leak under concurrent read+write.
- [ ] **Graceful shutdown:** Often missing — SIGTERM handler that checkpoints once and drains; clean DB after kill.
- [ ] **Benchmark parity:** Often missing — second-machine reproduction within tolerance; committed config/seed/dataset-hash; excluded-categories rationale; no dataset in `npm pack`.
- [ ] **Stdout hygiene (MCP):** Often missing — assertion no non-JSON-RPC bytes hit stdout in server mode.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unredacted/cross-scope content shipped | HIGH | Treat as a leak: identify exposed content, rotate real secrets exposed, add redaction+scope chokepoint + regression test, disclose per `secrets-in-tool-output` |
| Per-request connection lifecycle in prod | MEDIUM | Refactor to singleton handle + shutdown-only close; add soak test; remove `closeDatabase` from handlers |
| WAL starvation from held read txns | MEDIUM | Convert SSE to snapshot/poll; add PASSIVE checkpoint timer + WAL guard; manual TRUNCATE checkpoint to reclaim |
| 0.0.0.0 / no auth shipped | MEDIUM | Rebind loopback, add token + Origin check, release patch, note exposure window |
| LOCOMO data committed (CC BY-NC 4.0) | MEDIUM | Remove from history, add to `.gitignore`, switch to fetch-to-cache, re-verify `npm pack` |
| Non-reproducible benchmark published | HIGH (credibility) | Retract/annotate the number, publish scripts+config+seed, re-run with matched methodology, republish with mean±stdev |
| MCP stdout corruption | LOW | Redirect all logs to stderr; add stdout-hygiene test |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Governance/scope/redaction bypass (CRITICAL) | Governance Parity Seam (before adapters expose content) | Import-boundary lint fails CI on server→repository/bun:sqlite imports; poisoned-corpus + scope-isolation test across all MCP tools + HTTP/SSE routes; server egress refused without granted consent |
| 2 — CLI connection lifecycle reused | Server Foundation & Concurrency Model | Soak test: one `Database` open, bounded WAL, zero fd growth |
| 3 — SQLITE_BUSY / WAL checkpoint starvation | Server Foundation & Concurrency + SSE Streaming | Concurrent writer + long-lived reader soak keeps WAL bounded, p99 within budget; SSE holds no open txn |
| 4 — 0.0.0.0 / no auth / no origin check | HTTP Daemon & Local Auth | 127.0.0.1-only assertion; foreign-Origin rejected; tokenless 401; non-loopback needs explicit flag |
| 5 — Benchmark methodology/leakage/licensing/cherry-pick | Public Benchmark Suite | Second-machine reproduction within tolerance; per-category mean±stdev over N≥5; recorded judge prompt; excluded categories + dataset version/hash + CC BY-NC 4.0 attribution; no dataset in `npm pack` |
| 6 — SSE lifecycle/backpressure/leak | SSE Streaming Surface | Churn test returns RSS+subscription count to baseline; slow-consumer bounded memory; disconnect teardown |
| 7 — MCP conformance / stdout pollution | MCP stdio Adapter | SDK/inspector conformance across tools incl. errors; zero non-JSON-RPC stdout; structured tool errors |
| 8 — No graceful shutdown | Server Foundation & Concurrency Model | SIGTERM-during-write test drains, checkpoints once, releases port, clean DB |

> Suggested phase ordering for the roadmapper: **Server Foundation & Concurrency Model** → **Governance Parity Seam** → **MCP stdio Adapter** → **HTTP Daemon & Local Auth** → **SSE Streaming Surface** → **Public Benchmark Suite** → **Readiness/Category-Leader Gate**. Rationale: the concurrency model and governance seam are load-bearing for every surface, so they precede the adapters; the readiness gate that lifts the category-leader block depends on both governance-verified surfaces and reproducible benchmark numbers (mirrors the Phase 43 exit-gate pattern).

## Sources

- Actual codebase: `src/infrastructure/database/connection.ts` (`closeDatabase` TRUNCATE + `journal_mode=DELETE`, `busy_timeout=5000`, `synchronous=NORMAL`, WAL, single handle, `checkpointDatabase` PASSIVE); `NOOP_REDACTOR` defaults in `src/application/services/{dreaming,embedding,export}-service.ts`; `src/infrastructure/providers/provider-egress-policy.ts` (deny-by-default `requireProviderEgressAllowed`); `src/infrastructure/security/pattern-redactor.ts`; `src/application/services/memory-governance-service.ts`; `scripts/eval-v5/` harness — confidence HIGH.
- `.planning/PROJECT.md` North Star + v6.0 milestone invariants (127.0.0.1 default, "no parallel governance path", exit gate) — confidence HIGH.
- Mem0/Zep LOCOMO dispute (methodology, category defects, run-averaging, score variance): [Revisiting Zep's 84% LoCoMo claim](https://github.com/getzep/zep-papers/issues/5), [Is Mem0 Really SOTA in Agent Memory? — Zep](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/), [State of AI Agent Memory 2026 — Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — confidence HIGH for the documented dispute; verify exact judge prompts/config against each project's repo at implementation time.
- LOCOMO dataset license (CC BY-NC 4.0) and known ground-truth defects: verify the exact license file + Category 5 status against the current LOCOMO source at implementation time — confidence MEDIUM (license class widely reported; pin at build time).
- MCP stdio stdout-framing and local-server DNS-rebinding classes are established MCP guidance; fetch the current MCP spec/SDK docs at implementation time rather than relying on this summary — confidence MEDIUM (general class HIGH, version-specifics unverified here).

---
*Pitfalls research for: long-lived MCP/HTTP/SSE server + public benchmark suite over a local-first SQLite/WAL CLI (`@chude/memory` v6.0)*
*Researched: 2026-07-21*
