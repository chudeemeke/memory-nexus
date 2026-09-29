# Architecture Research

**Domain:** Local-first memory substrate (`@chude/memory`) — adding a multi-client local server surface (MCP + HTTP + SSE) and a public benchmark harness to an existing hexagonal CLI codebase
**Researched:** 2026-07-21
**Confidence:** HIGH (grounded in verified reads of `connection.ts`, `smart-context-service.ts`, `memory-governance-service.ts`, `context.ts`, `query.ts`, `db-startup.ts`, `src/index.ts`, `scripts/eval-v5/harness.ts`)

## Executive Framing

The v6.0 server is **a new presentation adapter, nothing more**. It must delegate to the same application-layer use-cases the CLI uses, share the same governance enforcement seam, and hold a single long-lived SQLite connection. The benchmark harness is **a script/tool consumer** in the same tier as `scripts/eval-v5` — it drives the application/CLI and produces reports; it is not a new layer.

Three integration truths drive every recommendation below (verified against real code, not assumed):

1. **Governance is enforced inside `SmartContextService`, not at the repository layer.** Any surface that calls repositories directly bypasses governance. The server must route through the application services.
2. **The current DB lifecycle is open-per-command-invocation** (`initializeDatabase` → work → `closeDatabase`). A long-lived server inverts this to open-once/close-at-shutdown, which changes checkpoint economics and interacts with a Windows-specific `journal_mode = DELETE`-on-close quirk.
3. **There is no shared composition root.** Each CLI command hand-wires its repos + services. The `execute*Command` "programmatic API" is CLI-shaped (emits to stdout, returns only `{exitCode}`). Neither is directly reusable by the server, so a governance-enforcing **query facade** must be extracted into the application layer and shared by CLI + server.

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                             │
│                                                                        │
│  ┌───────────────┐   ┌──────────────────── NEW ────────────────────┐   │
│  │  CLI (exists) │   │            src/presentation/server/          │   │
│  │  Commander    │   │  ┌────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  commands     │   │  │  MCP   │  │ HTTP daemon│  │    SSE     │  │   │
│  │               │   │  │ stdio  │  │ 127.0.0.1  │  │ streaming  │  │   │
│  └───────┬───────┘   │  └───┬────┘  └─────┬──────┘  └─────┬──────┘  │   │
│          │           │      └──────────────┼──────────────┘         │   │
│          │           │        server-composition.ts (root)          │   │
│          │           └──────────────────┬───────────────────────────┘   │
│          │                              │                                │
│          └──────────────┬───────────────┘                                │
├─────────────────────────┼────────────────────────────────────────────────┤
│                    APPLICATION LAYER                                     │
│  ┌──────────────── NEW: MemoryQueryFacade (governance-enforced) ─────┐   │
│  │  getContext() → SmartContextService (governance seam)             │   │
│  │  search()     → HybridSearchService                               │   │
│  │  facts()/related()/stats() → existing services                   │   │
│  │  write ops → WriteQueue (serialized) → sync/governance services   │   │
│  └───────────────────────────┬───────────────────────────────────────┘   │
│   SmartContextService · MemoryGovernanceService · MemoryRankingService  │
│   HybridSearchService(infra) · SyncService · DreamingService (exist)    │
├─────────────────────────┼────────────────────────────────────────────────┤
│                   INFRASTRUCTURE LAYER                                   │
│  ┌───── MODIFIED: connection.ts ──────┐  ┌──── NEW: ServerDbProvider ──┐ │
│  │ initializeDatabase (per-call open) │  │ open-once, hold connection, │ │
│  │ closeDatabase (DELETE-on-close)    │  │ periodic passive checkpoint,│ │
│  │ WAL · busy_timeout=5000 · NORMAL   │  │ clean shutdown checkpoint   │ │
│  └────────────────────────────────────┘  └─────────────────────────────┘ │
│  Sqlite repositories (Fact/Friction/Persona/Graph/Governance/…) UNCHANGED│
├─────────────────────────┼────────────────────────────────────────────────┤
│                        DOMAIN LAYER (UNCHANGED)                          │
│  entities · value objects · ports · pure services · MemoryEvent kernel  │
└─────────────────────────┴────────────────────────────────────────────────┘

         ┌──────────── scripts/benchmarks/ (NEW — tool consumer, NOT a layer) ─────────┐
         │  LOCOMO + retrieval benchmarks → drive MemoryQueryFacade / CLI              │
         │  Same tier as scripts/eval-v5; produces reproducible reports               │
         └────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | NEW / MODIFIED | Layer |
|-----------|----------------|----------------|-------|
| MCP stdio server | Expose curated memory tools (context/search/facts/related/stats) over the facade; one client per process | NEW | Presentation |
| HTTP daemon (127.0.0.1) | Multi-client local access; routes → facade; reuse envelope/DTO helpers | NEW | Presentation |
| SSE/streaming surface | Live context subscriptions; push facade results as events | NEW | Presentation |
| `server-composition.ts` | Server composition root: open long-lived DB once, build facade once, inject into MCP/HTTP/SSE | NEW | Presentation |
| `memory serve` CLI command | Start/stop/status the daemon; follows existing Commander command pattern | NEW | Presentation |
| `MemoryQueryFacade` | Single governance-enforced delegation target shared by CLI + server; returns DTOs (no stdout side-effects) | NEW | Application |
| `WriteQueue` | Serialize write operations inside the daemon so multi-statement transactions never interleave across concurrent async handlers | NEW | Application (orchestration) |
| `SmartContextService` | THE governance/scope-isolation seam for context reads (reused unchanged) | UNCHANGED | Application |
| `MemoryGovernanceService.filterAllowed` | Concrete allow/block policy for derived memory (reused unchanged) | UNCHANGED | Application |
| `ServerDatabaseProvider` | Open-once connection manager; periodic passive checkpoint; clean shutdown checkpoint | NEW | Infrastructure |
| `connection.ts` | Add a long-lived open mode; keep WAL for process lifetime; guard the `journal_mode=DELETE` switch to shutdown-only | MODIFIED | Infrastructure |
| Sqlite repositories | Data access behind domain ports | UNCHANGED | Infrastructure |
| Benchmark harness | Drive facade/CLI, score against LOCOMO et al., emit reproducible reports | NEW (script) | Tooling (`scripts/`) |

## Recommended Project Structure

```
src/
├── presentation/
│   ├── cli/                      # exists — commands refactored to call MemoryQueryFacade
│   │   └── commands/
│   │       └── serve.ts          # NEW: launch/stop/status the daemon
│   └── server/                   # NEW: the server adapter package
│       ├── server-composition.ts # NEW: server composition root (long-lived DB + facade)
│       ├── mcp/
│       │   ├── mcp-server.ts      # NEW: StdioServerTransport wiring
│       │   └── tools.ts           # NEW: curated tool registry → facade calls
│       ├── http/
│       │   ├── http-daemon.ts     # NEW: 127.0.0.1 bind, route table
│       │   └── routes.ts          # NEW: route → facade, reuse envelope/DTO
│       └── sse/
│           └── sse-stream.ts      # NEW: live context subscriptions
├── application/
│   └── services/
│       ├── memory-query-facade.ts # NEW: governance-enforced read/write facade
│       └── write-queue.ts         # NEW: serialized write orchestration
├── infrastructure/
│   └── database/
│       ├── connection.ts          # MODIFIED: long-lived open mode + checkpoint guard
│       └── server-db-provider.ts  # NEW: open-once, periodic checkpoint, shutdown
└── domain/                        # UNCHANGED

scripts/
├── eval-v5/                       # exists — governance/leakage fixtures reused
└── benchmarks/                    # NEW: LOCOMO + retrieval harness (tool consumer)
    ├── harness.ts
    ├── datasets/
    └── report.ts
```

### Structure Rationale

- **`src/presentation/server/`:** The server is a peer of `cli/` under presentation — both are adapters. Keeping it a sibling makes the "no business logic in the adapter" boundary visually obvious and lint-enforceable (server files may import application, never infrastructure repositories directly).
- **`application/services/memory-query-facade.ts`:** The governance wiring currently lives *inside* a presentation function (`context.ts::executeSmartContext`). Extracting it into the application layer is the single change that lets CLI and server share one governance-enforced path. Without it, the server would re-implement the wiring and risk a parallel (drifting) governance path — the exact invariant PROJECT.md forbids.
- **`infrastructure/database/server-db-provider.ts`:** Long-lived connection management is an infrastructure concern (it owns the SQLite handle). Separating it from `connection.ts` keeps the per-command path untouched and the server path additive.
- **`scripts/benchmarks/`:** Benchmarks are eval tooling, same tier as `scripts/eval-v5`. They are consumers of the product, not part of it — placing them under `src/` would wrongly imply a shipped layer.

## Architectural Patterns

### Pattern 1: Adapter-over-Facade (server delegates, never decides)

**What:** Every MCP tool handler / HTTP route / SSE emitter is a thin translator: parse request → call one `MemoryQueryFacade` method → serialize the returned DTO. No querying, ranking, filtering, or governance logic in the adapter.
**When to use:** All server surfaces.
**Trade-offs:** Requires the facade to exist and return structured data (the MODIFIED work). Pays back by guaranteeing governance parity and by making the CLI and server behaviorally identical for the same inputs.

**Example:**
```typescript
// presentation/server/mcp/tools.ts — adapter only, zero business logic
server.tool("memory.context", contextSchema, async (args) => {
  const result = await facade.getContext({
    projectFilter: args.project,
    budget: args.budget,
    crossProject: args.crossProject ?? false, // scope isolation stays in the facade/service
  });
  return { content: [{ type: "text", text: toContextDto(result) }] };
});
```

### Pattern 2: Shared governance-enforcing facade (single seam)

**What:** `MemoryQueryFacade.getContext()` composes exactly what `context.ts::executeSmartContext` composes today — `SqliteProjectResolver`, fact/friction/persona/graph/utility repos, `MemoryGovernanceService` as the `IContextGovernancePolicy`, `MemoryRankingService` — and returns `SmartContextResult`. The CLI command and the server both call it.
**When to use:** Any read that touches derived memory (context, facts, persona, graph). Raw message search goes through `HybridSearchService` with the same project-scope filter.
**Trade-offs:** One more indirection for the CLI. In exchange, governance and cross-project scope isolation are provably enforced once, verifiable by a single test suite that runs against the facade regardless of caller.

**Example:**
```typescript
// application/services/memory-query-facade.ts
async getContext(opts: SmartContextOptions): Promise<SmartContextResult | null> {
  // governancePolicy = new MemoryGovernanceService({ repository: governanceRepo })
  // injected into SmartContextService — the SAME wiring the CLI uses
  return this.smartContext.getContext(opts); // filterAllowed + crossProject enforced inside
}
```

### Pattern 3: Single-connection + serialized-write for the long-lived process

**What:** The daemon holds ONE `bun:sqlite` connection for its lifetime. Reads run directly (bun:sqlite is synchronous → they cannot truly interleave). Writes go through a `WriteQueue` (an async mutex) so a multi-statement transaction started by one HTTP request is never split by another request's write between `await` points.
**When to use:** The daemon (HTTP + SSE). MCP stdio is single-client, but should use the same provider for consistency.
**Trade-offs:** No connection pool. A pool buys nothing here because bun:sqlite has no async concurrency to exploit within a process; a pool would add lifecycle complexity and multiply the Windows FD-hold problem. Cross-process concurrency (an external `memory sync` CLI running while the daemon runs) is handled by WAL + `busy_timeout`, not by a pool.

**Example:**
```typescript
// application/services/write-queue.ts — serialize writes to avoid interleaved txns
class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(op: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(() => op());
    this.tail = next.catch(() => {});
    return next;
  }
}
```

## Data Flow

### CLI read (unchanged)

```
memory context <proj>
  → initializeDatabase({path})            (open per invocation)
  → MemoryQueryFacade.getContext()        (NEW indirection)
      → SmartContextService.getContext()  (governance + scope isolation)
          → repos → bun:sqlite
  → format + stdout
  → closeDatabase(db)                     (checkpoint TRUNCATE + journal_mode=DELETE + close)
```

### Server read (new)

```
process start
  → ServerDatabaseProvider.open()         (open ONCE, WAL stays for lifetime)
  → build MemoryQueryFacade ONCE
MCP tool / HTTP route / SSE subscribe
  → facade.getContext()/search()          (SAME governance seam as CLI)
      → SmartContextService / HybridSearchService
          → repos → shared connection (reads direct)
  → DTO → transport (stdio frame / JSON body / SSE event)
process shutdown (SIGINT/SIGTERM)
  → passive checkpoint → closeDatabase()  (DELETE switch fires ONCE, at shutdown)
```

### Server write (new)

```
HTTP/MCP write (e.g. friction log, governance suppress)
  → facade.<writeOp>()
      → WriteQueue.run(() => service.write())   (serialized)
          → repo → shared connection
```

### Key data-flow changes vs today

1. **Checkpoint economics invert.** Today, every command close runs `wal_checkpoint(TRUNCATE)`, so the WAL never grows unbounded. A long-lived server never closes mid-life, so the WAL would grow without bound unless the `ServerDatabaseProvider` runs a **periodic passive checkpoint** (and relies on `wal_autocheckpoint`). This is a NEW responsibility with no CLI equivalent.
2. **`journal_mode = DELETE` on close must not fire mid-life.** It is a Windows lock-release strategy in `closeDatabase`. For the daemon it must run only at shutdown (it does, since the server closes once) — but the provider must NOT call `closeDatabase` between requests.
3. **Governance moves up one call level** (into the facade) but its enforcement point (`SmartContextService`) is unchanged, so behavior is identical.

## Concurrency Recommendation (grounded in actual `connection.ts`)

**Verified current behavior:**
- `initializeDatabase()` creates a fresh `new Database(path, { create })` **per call** — there is no pool and no shared singleton.
- `PRAGMA journal_mode = WAL` is set for file DBs (default on). `PRAGMA busy_timeout = 5000`. `PRAGMA synchronous = NORMAL`. `cache_size = -64000`. `temp_store = MEMORY`. `foreign_keys = ON`. `sqlite-vec` loaded per connection.
- `closeDatabase()` runs `PRAGMA wal_checkpoint(TRUNCATE)`, then `PRAGMA journal_mode = DELETE` (to drop WAL/SHM files and release OS-level locks on Windows), then `db.close()`.
- bun:sqlite APIs are **synchronous** — within one process, queries execute to completion on the JS thread and cannot interleave mid-statement.

**Recommendation for v6.0:**

| Question | Recommendation | Why (grounded) |
|----------|----------------|----------------|
| Single connection or pool? | **Single long-lived connection per daemon process.** | bun:sqlite is synchronous; no in-process async concurrency for a pool to exploit. WAL already permits concurrent readers + one writer *across processes*. |
| Keep WAL? | **Yes, for the whole process lifetime.** | Enables an external `memory sync` CLI (separate process) to read/write while the daemon runs. Already the default in `connection.ts`. |
| `busy_timeout`? | **Keep ≥ 5000ms; make it configurable and consider 10000–15000ms for the daemon.** | The daemon competes with external CLI writers (e.g. background sync). A longer timeout absorbs sync-time write bursts instead of surfacing `SQLITE_BUSY`. |
| Write serialization? | **Yes — an application-layer `WriteQueue` (async mutex).** | Async request handlers can interleave *between* `await` points even though individual statements are synchronous. Serializing writes prevents one request's multi-statement transaction from being split by another's. |
| Checkpoint strategy? | **Periodic passive checkpoint in `ServerDatabaseProvider` + shutdown `wal_checkpoint(TRUNCATE)`.** | The per-command TRUNCATE checkpoint no longer fires in a long-lived process; the WAL would otherwise grow unbounded. |
| `journal_mode = DELETE` on close? | **Only at shutdown — never between requests.** | It is a Windows lock-release step in `closeDatabase`; safe once, harmful if called mid-life (would thrash WAL↔rollback). |
| External-writer safety? | **Rely on WAL + busy_timeout; document that `memory sync` may run concurrently.** | No new mechanism needed; SQLite's single-writer lock + busy_timeout is the contract. |

**Highest-risk area:** the long-lived multi-client SQLite/WAL lifecycle on Windows, specifically the interaction of (a) never-closing connection + WAL growth, (b) the `journal_mode=DELETE`-on-close quirk, (c) an external CLI writer holding the write lock during sync, and (d) Bun's noted "may hold the `.db` file descriptor until GC" behavior on Windows. This is **unproven in the current codebase** (which is 100% open-per-invocation). It warrants a dedicated spike (see build sequence, Phase 0).

## Governance-Reuse Seam and Bypass Risks

**The seam:** `SmartContextService.getContext()` is the single application-layer point where (1) derived-memory governance filtering (`IContextGovernancePolicy.filterAllowed` → `MemoryGovernanceService`) and (2) cross-project scope isolation (`crossProject` flag + `isCrossProjectVisible`) are applied. Raw message reads go through `HybridSearchService` with an explicit project filter. Redaction is enforced earlier, on the **write/ingestion path** (data is redacted at rest), so read surfaces inherit it.

**Bypass risks the server must avoid (call out explicitly):**

| Bypass risk | How it happens | Guard |
|-------------|----------------|-------|
| **Direct repository access** | A server handler calls `SqliteFactRepository.findByProject()` / `graphRepo.findCurrent()` directly instead of the facade → governance `filterAllowed` never runs. | Architecture rule + lint: `presentation/server/**` may import `application/**` only, never `infrastructure/database/repositories/**`. All reads go through `MemoryQueryFacade`. |
| **Cross-project scope leak** | A server endpoint defaults `crossProject` to true or exposes `factRepo.findAll()`. | `crossProject` defaults to `false` in the facade; global facts filtered by `isCrossProjectVisible`. No endpoint exposes `findAll()` un-scoped. |
| **New ingestion path skipping redaction** | The server accepts write payloads and stores them without the redaction the sync path applies. | Route writes through the existing sync/governance services (which redact) via the `WriteQueue`; the server never writes to repos directly. |
| **Parallel governance implementation** | Server re-implements the SmartContext wiring and drifts. | Single shared facade — the CLI is refactored to use it too, so drift breaks CLI tests. |
| **Envelope leakage of raw secrets** | Error/verbose paths echo unredacted content. | Reuse existing `emitJsonEnvelope`/error formatters; honor `audit-secrets` guarantees. |

**Verification requirement (mirrors Phase 43 exit gate):** the existing `scripts/eval-v5` blocking dimensions — `privacy_redaction`, `cross_project_leakage`, `supersedence` (required pass rate 1.0) — must be extended to run **against the MCP and HTTP surfaces**, not only the CLI. This is how "governance verified on the new surfaces" becomes evidence rather than assertion.

## Dependency-Ordered Build Sequence

| Phase | Work | Depends on | Rationale |
|-------|------|-----------|-----------|
| **0. SPIKE (recommended)** | Prove long-lived single-connection + WAL + `busy_timeout` + `WriteQueue` under concurrent HTTP clients **and** a concurrent external `memory sync` writer, on Windows. Exercise WAL growth over hours, the DELETE-on-close quirk, and Bun's FD-hold. Produce a decision doc. | connection.ts (read-only) | Highest technical risk; unproven in a codebase that is 100% open-per-invocation. De-risks every later phase. |
| **1. Infra: long-lived connection** | Add `ServerDatabaseProvider` (open-once, periodic passive checkpoint, shutdown TRUNCATE+close); guard `journal_mode=DELETE` to shutdown-only; make `busy_timeout` configurable. | Phase 0 findings | Everything server-side needs a stable connection contract first. |
| **2. App: query facade + write queue** | Extract `MemoryQueryFacade` (governance-enforced reads returning DTOs) and `WriteQueue`. | — (pure app-layer) | The shared seam. Must exist before any adapter can delegate without duplicating governance. |
| **3. Refactor CLI onto the facade** | Point `runContextInternal` (and search/related/stats) at the facade; no behavior change. | Phase 2 | Regression safety net: proves the facade preserves CLI behavior and governance; locks the single path. |
| **4. Presentation: MCP stdio server** | `mcp-server.ts` + curated `tools.ts` over the facade. Single-client → no HTTP concurrency yet. | Phases 1–3 | Simplest transport; validates adapter-over-facade before adding multi-client concurrency. |
| **5. Presentation: HTTP daemon (127.0.0.1)** | `http-daemon.ts` + routes over the facade; exercises single-connection + WriteQueue under real multi-client load. | Phase 4 | First true multi-client surface; where the Phase 0 model gets validated in production shape. |
| **6. Presentation: SSE/streaming** | Live context subscriptions as events. | Phase 5 | Builds on the HTTP server; read-only push, lowest write risk. |
| **7. `memory serve` CLI command** | Start/stop/status, follows existing command pattern. | Phases 4–6 | Operational surface once the server works. |
| **8. Benchmark harness** | `scripts/benchmarks/` LOCOMO + retrieval, driving facade/CLI; reproducible reports comparable to Mem0/Zep. | Phase 2 (facade) | Consumer of the product; can run against CLI/facade even before the server, but reports should cover server parity too. |
| **9. Governance verification on new surfaces** | Extend `eval-v5` blocking dimensions (`privacy_redaction`, `cross_project_leakage`, `supersedence`) to run against MCP + HTTP. | Phases 4–5 | Turns the governance-parity invariant into gating evidence. |
| **10. Market/readiness gate** | Lift, or evidence-re-scope, the category-leader block. | Phases 8–9 | Mirrors Phase 43 exit: server shipped + governance verified + reproducible benchmark numbers. |

**Spike verdict: YES, warranted (Phase 0).** The long-lived multi-client SQLite/WAL lifecycle is the one area where current code gives zero signal (the codebase never holds a connection open across requests). The Windows-specific `journal_mode=DELETE`-on-close and Bun FD-hold behaviors compound the risk. A time-boxed spike that reproduces concurrent daemon+CLI writes and monitors WAL size, `SQLITE_BUSY` incidence, and clean shutdown is cheap relative to discovering a corruption/lock class of bug after the HTTP surface ships.

## Anti-Patterns

### Anti-Pattern 1: Server calls repositories directly

**What people do:** MCP/HTTP handler imports `SqliteFactRepository` and queries it for speed/convenience.
**Why it's wrong:** Governance filtering and cross-project scope isolation live in `SmartContextService`, not in the repos. Direct repo access silently bypasses both — a data-leak class bug that passes ordinary tests.
**Do this instead:** All reads go through `MemoryQueryFacade`; enforce via an import-boundary lint (`presentation/server/**` → `application/**` only).

### Anti-Pattern 2: Connection pool for bun:sqlite in one process

**What people do:** Add a pool "for concurrency."
**Why it's wrong:** bun:sqlite is synchronous; there is no in-process async concurrency to parallelize. A pool multiplies the Windows FD-hold and checkpoint complexity for zero throughput gain.
**Do this instead:** One long-lived connection + a `WriteQueue`. Let WAL + `busy_timeout` handle cross-process concurrency.

### Anti-Pattern 3: Reusing `execute*Command` as the server's application API

**What people do:** Have the server call the exported `executeContextCommand` etc.
**Why it's wrong:** Those functions are CLI-shaped — they emit to stdout via `emitJsonEnvelope`/`console.log` and return only `{exitCode}`. A server needs structured return values and no stdout side-effects.
**Do this instead:** Delegate to the `MemoryQueryFacade`, which returns DTOs.

### Anti-Pattern 4: Treating the benchmark harness as a new layer

**What people do:** Add benchmarks under `src/` with their own DB access.
**Why it's wrong:** Benchmarks are eval tooling (a consumer), not shipped architecture; embedding them in `src/` blurs the product boundary and risks a second, unscoped data path.
**Do this instead:** Place under `scripts/benchmarks/`, same tier as `scripts/eval-v5`; drive the facade/CLI.

### Anti-Pattern 5: Calling `closeDatabase` between requests in the daemon

**What people do:** Open/close per request "to be safe," reusing the CLI lifecycle.
**Why it's wrong:** `closeDatabase` switches `journal_mode=DELETE` and TRUNCATE-checkpoints — thrashing WAL setup on every request and defeating cross-process WAL concurrency.
**Do this instead:** Open once via `ServerDatabaseProvider`; checkpoint passively on a timer; close once at shutdown.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| server adapter ↔ application | Direct method calls on `MemoryQueryFacade` | Adapter passes primitives/DTOs; no infra imports allowed |
| facade ↔ SmartContextService | Constructor-injected deps (same as `context.ts`) | Governance policy + resolver + repos injected here; the seam |
| facade ↔ HybridSearchService | Project-scoped search calls | Raw messages redacted at rest; scope via explicit filter |
| server composition ↔ infrastructure | `ServerDatabaseProvider` owns the connection | Only place the server touches infra directly (connection lifecycle) |
| write ops ↔ SQLite | `WriteQueue` → existing services → repos | Serialized; reuses redacting sync/governance services |
| benchmark harness ↔ product | Drives facade or CLI | Consumer tier; produces reports, no privileged access |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MCP clients (Claude Code etc.) | stdio transport, curated tool schema | Local, one client per server process; no network egress |
| Local HTTP/SSE clients | `127.0.0.1`-bound daemon | Local-first invariant: bind loopback by default; no new egress introduced |
| LOCOMO / benchmark datasets | Read-only fixture files under `scripts/benchmarks/datasets/` | Reproducibility: pin dataset versions; reports comparable to Mem0/Zep-cited numbers |

## Sources

- Verified reads: `src/infrastructure/database/connection.ts`, `src/presentation/cli/db-startup.ts`, `src/presentation/cli/commands/context.ts`, `src/presentation/cli/commands/query.ts`, `src/presentation/cli/commands/search.ts`, `src/application/services/smart-context-service.ts`, `src/application/services/memory-governance-service.ts`, `src/index.ts`, `scripts/eval-v5/harness.ts` (HIGH confidence — direct source)
- `.planning/PROJECT.md` v6.0 milestone definition + invariants (HIGH — normative project doc)
- SQLite WAL concurrency semantics (single-writer + concurrent readers, `busy_timeout`) — standard SQLite behavior (HIGH)
- bun:sqlite synchronous API + Windows FD-hold note (documented in `connection.ts` comments) (MEDIUM — codebase-asserted, to be confirmed by Phase 0 spike)

---
*Architecture research for: local-first memory server surface (MCP/HTTP/SSE) over an existing hexagonal CLI*
*Researched: 2026-07-21*
