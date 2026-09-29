# Project Research Summary

Project: chude/memory
Milestone: v6.0 -- Server Surface and Benchmark Parity
Domain: Local-first, privacy-governed memory substrate -- adding a server access surface (MCP + HTTP + SSE) and a public agentic-memory benchmark suite to an existing hexagonal Bun/TypeScript CLI (v4.0.3 shipped)
Researched: 2026-07-21
Confidence: HIGH (versions verified against live npm registry; all architecture/pitfall claims grounded in direct reads of connection.ts, smart-context-service.ts, memory-governance-service.ts, and related source)

Supersedes the v1.0 SUMMARY (CLI/extraction milestone), preserved at .planning/research/SUMMARY-v1-baseline.md.

## Executive Summary

v6.0 adds two things to an already-shipped local-first memory CLI: a curated server access surface (MCP stdio primary, an opt-in local HTTP daemon, and Streamable-HTTP-based streaming) so agents like Claude Code, Claude Desktop, and Cursor can consume memory directly, and a reproducible public benchmark suite (LOCOMO plus LongMemEval) to make defensible parity claims against Mem0 and Zep. Both are additive: the recommended stack change is minimal (exactly two new production dependencies -- modelcontextprotocol/sdk 1.29.0 and its zod 4 peer), and everything else -- the HTTP daemon, SSE/streaming, and the benchmark harness -- is built on Bun-native primitives (Bun.serve, native fetch/ReadableStream) plus the existing scripts/eval-v5 harness and the anthropic-ai/sdk.

Architecturally, the correct shape is a new presentation adapter over a new governance-enforced application-layer facade, not a parallel implementation. The server must delegate to the same use-cases the CLI uses; a MemoryQueryFacade needs to be extracted from presentation-layer wiring (currently embedded in context.ts executeSmartContext) so both CLI and server share one governance seam. The single most dangerous failure mode is a server handler bypassing that seam -- calling repositories directly, or reaching a NOOP_REDACTOR default -- and leaking unredacted or cross-project content over a new egress surface; this is prevented structurally with an import-boundary lint (presentation/server may import application only) plus poisoned-corpus tests, not by discipline alone.

The single highest technical risk is SQLite/WAL behavior under a long-lived process: today every CLI command opens fresh and closes with a TRUNCATE checkpoint plus journal_mode DELETE; a daemon that never does that will grow its WAL unboundedly and interact badly with a Windows-specific FD-hold quirk. This is unproven in the current codebase (100 percent open-per-invocation) and warrants a dedicated Phase 0 spike before any adapter work. On the benchmark side, the risk is credibility, not code: LOCOMO numbers are a contested marketing artifact (Mem0 vs Zep publicly disputed the same benchmark by 20 plus points over methodology), and the LOCOMO dataset itself is CC BY-NC 4.0, non-commercial -- it must never be vendored into an MIT package. The differentiator is a reproducible, judge-pinned, per-category report rather than a single headline number, with LongMemEval (MIT-licensed) as the benchmark to lean on for any commercially-framed claim.

## Key Findings

### Recommended Stack

Exactly two new production dependencies: modelcontextprotocol/sdk 1.29.0 (official TS SDK; McpServer plus StdioServerTransport) and its required peer zod 4.0. There is no credible alternative to the official SDK -- hand-rolling JSON-RPC and the MCP handshake would reinvent a moving spec and fail conformance against real clients. Everything else needed for v6.0 is Bun-native or already present: Bun.serve for the HTTP daemon (bind 127.0.0.1 explicitly), native ReadableStream/Response for SSE-shaped streaming (delivered as Streamable HTTP, not the deprecated legacy SSE transport), native fetch and Bun.write for scripted dataset downloads into a gitignored cache, and the existing anthropic-ai/sdk reused (provider-configurable) as the LLM judge for benchmark scoring. Do NOT add express, fastify, hono, a websocket library, an HF client, or an NLP library for BLEU/F1 -- all are unneeded given Bun native surface and the small scope of the metrics (about 50 LOC inline). Note: installing the MCP SDK pulls a heavy transitive tree (express 5, hono 4.11, jose 6, ajv 8, eventsource 3) unavoidably -- expect bun audit to flag more surface and use existing overrides if needed.

Core technologies:
- modelcontextprotocol/sdk 1.29.0 -- official MCP server (stdio primary; Streamable HTTP for the daemon) -- the only spec-conformant option
- zod 4.0 -- required SDK peer for tool-input schema validation -- adopt current major since it is a new dep anyway
- Bun.serve (native, no package) -- local HTTP daemon on 127.0.0.1 plus SSE-shaped streaming responses -- avoids adding a web framework for a localhost-only daemon
- Existing scripts/eval-v5 harness plus anthropic-ai/sdk (reused, not new) -- extended with a sibling benchmark lane for LOCOMO/LongMemEval

### Expected Features

The server is an additional access path, not a replacement: every MCP tool and HTTP endpoint must map one to one to an existing application use-case already exposed by the CLI (query, search, context, related, stats, facts, governance, profile, friction). Comparable products (Mem0/OpenMemory, Zep/Graphiti, Letta/MemGPT) all converge on the same small verb set -- add/ingest, semantic search, get-by-id, list/browse, plus relation and temporal search for graph products -- which this product existing read verbs already cover more richly (provenance-backed facts, governance, friction -- none of which any competitor exposes over the wire).

Must have (table stakes):
- MCP stdio server exposing memory_search, memory_context, memory_related, memory_show, memory_list, memory_stats, memory_facts, memory_status -- each a thin wrapper over an existing use-case
- Long-lived-process concurrency model over SQLite/WAL, tested under concurrent reads and writes
- Governance and redaction verified on the MCP path via extended evals (not asserted, proven)
- A LOCOMO benchmark score with a reproducible harness (per-category breakdown, pinned judge)

Should have (competitive differentiators):
- Local-first, 127.0.0.1-bound, zero-new-egress server (competitors are cloud-first)
- memory_governance tool exposed over the wire -- no competitor exposes consent, redaction, or scope as a server operation
- Provenance-backed memory_facts (source events, confidence, supersedence) vs competitors opaque memory blobs
- Reproducible, category-broken-down, judge-pinned benchmark report as the answer to the Mem0-vs-Zep credibility dispute
- LongMemEval abstention plus knowledge-update parity, which map directly to this product supersedence and governance features

Defer (v2 plus / explicit anti-features):
- A local HTTP daemon and streaming -- trigger: only after a second concurrent client is genuinely needed and MCP stdio has proven stable
- Free-text add_memory write tool, Mem0-style -- explicitly rejected: bypasses the event kernel, provenance, and governance
- 0.0.0.0 or network-exposed daemon or a multi-user auth system -- out of scope; contradicts the local-first, single-user, no-new-egress invariants
- Chasing a single headline LOCOMO number -- the contested-marketing-artifact trap; compete on reproducibility instead
- DMR/BEAM benchmarks -- DMR is near-saturated/low-signal, BEAM is emerging; watch, do not commit

### Architecture Approach

The server is a new presentation adapter, nothing more -- it delegates to the same application-layer use-cases the CLI uses, shares the same governance-enforcement seam, and holds a single long-lived SQLite connection. The critical structural gap today: governance is enforced inside SmartContextService, not the repository layer, and the current programmatic API (execute Command family) is CLI-shaped (stdout side effects, exitCode-only returns) and not directly reusable. The fix is to extract a MemoryQueryFacade into the application layer -- the single governance-enforcing seam shared by CLI and server -- and refactor the CLI onto it first as a regression safety net before any adapter is built.

Major components:
1. src/presentation/server/mcp, http, sse -- thin adapters (parse request, call one facade method, serialize DTO); no business logic, no direct repository or infra imports
2. application/services/memory-query-facade.ts plus write-queue.ts -- the shared governance-enforced read/write seam (facade) and a serialized-write orchestrator (async mutex) for the daemon
3. infrastructure/database/server-db-provider.ts -- open-once connection manager with periodic passive checkpointing and a shutdown-only TRUNCATE checkpoint plus journal_mode DELETE, kept separate from the unmodified per-command connection.ts path
4. scripts/benchmarks -- LOCOMO plus LongMemEval harness, a sibling tool-tier consumer of scripts/eval-v5, not a shipped layer

### Critical Pitfalls

1. Server bypasses governance via repository-direct reads or a reachable NOOP_REDACTOR default (CRITICAL, single most dangerous) -- prevented structurally with an import-boundary lint (presentation/server may import application only, CI-enforced) plus poisoned-corpus tests that seed known secrets and multi-project rows and assert redaction and scope-filtering on every content-returning tool and route.
2. Reusing the CLI open-per-invocation initializeDatabase and closeDatabase lifecycle inside a long-lived daemon -- causes WAL thrash or connection leaks; the fix is one long-lived Database handle opened once, with closeDatabase called exactly once, at graceful shutdown only.
3. SQLITE_BUSY and WAL-checkpoint starvation from concurrent long-lived readers, for example SSE holding a transaction open -- prevented with single-writer discipline, snapshot-then-stream for SSE, never hold a read transaction across a subscription lifetime, periodic passive checkpointing, and a re-tuned busy_timeout.
4. Binding the HTTP daemon to 0.0.0.0 with no Origin/Host validation or local auth token -- exposes a personal memory substrate to the LAN or to DNS-rebinding attacks from any web page; default 127.0.0.1, validate Origin and Host, require a first-run local bearer token.
5. Benchmark methodology mismatch, dataset licensing violation, or cherry-picking -- reporting a LOCOMO number that does not survive scrutiny (wrong categories, unmatched judge, single run, vendored CC BY-NC 4.0 data) collapses the parity claim exactly as happened publicly between Mem0 and Zep; fetch the dataset to a gitignored cache only, match competitor methodology explicitly where claiming parity, and publish mean and stdev over at least 5 runs with full reproduction config.

## Implications for Roadmap

Based on combined research, the dependency-ordered build sequence below is the direct input to phase structuring. The concurrency model and the governance seam are load-bearing for every later surface, so they come first; the readiness and category-leader gate depends on both governance-verified surfaces and reproducible benchmark numbers (mirrors the existing Phase 43 exit-gate pattern).

### Phase 0: Concurrency Spike (recommended, not skippable)
Rationale: The long-lived multi-client SQLite/WAL lifecycle is the one area where the current codebase (100 percent open-per-invocation) gives zero signal. Compounded by a Windows-specific journal_mode DELETE-on-close quirk and Bun noted FD-hold behavior. Cheapest place to de-risk before any adapter is built.
Delivers: A decision doc proving or disproving single long-lived connection plus WAL plus tuned busy_timeout plus WriteQueue under concurrent HTTP clients and a concurrent external memory sync writer, on Windows, over a soak test.
Avoids: Pitfalls 2, 3, 8, connection lifecycle reuse, WAL starvation, no graceful shutdown -- all trace back to this single unverified assumption.

### Phase 1: Server Foundation and Concurrency Model
Rationale: Everything server-side needs a stable connection contract before any adapter delegates to it.
Delivers: ServerDatabaseProvider, open-once, periodic passive checkpoint, shutdown-only TRUNCATE plus close, guarded journal_mode DELETE, configurable busy_timeout, and signal-driven graceful shutdown, SIGINT and SIGTERM drains, checkpoints once, releases port.
Uses: Bun.serve-adjacent infra work; no new deps.
Avoids: Pitfall 2, lifecycle reuse, Pitfall 8, no graceful shutdown.

### Phase 2: Governance Parity Seam, MemoryQueryFacade plus WriteQueue
Rationale: Must exist and be proven before any adapter can delegate without duplicating or bypassing governance -- this is the single most dangerous pitfall in the whole milestone.
Delivers: MemoryQueryFacade, governance-enforced, DTO-returning, extracted from presentation-layer wiring; WriteQueue, async-mutex write serialization; CLI refactored onto the facade as a regression safety net, no behavior change, proves parity.
Avoids: Pitfall 1, governance and redaction bypass -- via import-boundary lint plus poisoned-corpus tests introduced here.

### Phase 3: MCP stdio Adapter
Rationale: Simplest transport, single client, no concurrency yet; validates adapter-over-facade before adding multi-client load. This is the milestone primary reason to exist per FEATURES.md, table stakes: every comparable product ships an MCP server.
Delivers: mcp-server.ts plus curated tools.ts, search, context, related, show, list, stats, facts, status, wired to the official SDK StdioServerTransport, with stdout reserved strictly for JSON-RPC frames, all diagnostics to stderr.
Addresses: FEATURES.md table-stakes MCP surface.
Avoids: Pitfall 7, MCP conformance and stdout pollution.

### Phase 4: HTTP Daemon and Local Auth
Rationale: First true multi-client surface -- this is where the Phase 0/1 concurrency model gets validated under real load.
Delivers: http-daemon.ts on 127.0.0.1 with Origin and Host validation and a first-run local bearer token; routes delegate to the same facade as MCP.
Avoids: Pitfall 4, 0.0.0.0, no auth, DNS-rebinding.

### Phase 5: SSE and Streamable-HTTP Streaming Surface
Rationale: Builds on the HTTP daemon; read-only push is the lowest-risk write surface, but has its own lifecycle discipline.
Delivers: Live context subscriptions delivered over Streamable HTTP, never the deprecated legacy SSE transport; disconnect-tied teardown, heartbeat, bounded backpressure, no transaction held open across a subscription.
Avoids: Pitfall 3, WAL starvation from held reads, Pitfall 6, SSE lifecycle leaks.

### Phase 6: memory serve CLI Command
Rationale: Operational surface once the server itself works; small, low-risk, follows the existing Commander command pattern.
Delivers: Start, stop, and status subcommand for the daemon.

### Phase 7: Public Benchmark Suite, LOCOMO plus LongMemEval
Rationale: Can start as soon as the facade, Phase 2, exists -- it can run against the CLI/facade independently of the server work, but final reports should also cover server-surface parity.
Delivers: scripts/benchmarks extending scripts/eval-v5 contract; LOCOMO fetched to a gitignored cache, never vendored, CC BY-NC 4.0, per-category mean and stdev over at least 5 runs, pinned judge model and prompt, excluded-categories rationale; LongMemEval as the MIT-licensed benchmark for commercially-framed claims; npm pack dry-run verification that no dataset ships.
Avoids: Pitfall 5, methodology mismatch, licensing, cherry-picking.

### Phase 8: Governance Verification on New Surfaces
Rationale: Turns the governance-parity invariant into gating evidence rather than assertion; depends on the MCP and HTTP surfaces existing.
Delivers: Extended scripts/eval-v5 blocking dimensions, privacy_redaction, cross_project_leakage, supersedence, required pass rate 1.0, run against the MCP and HTTP code paths, not only the CLI.

### Phase 9: Market and Readiness Gate
Rationale: Mirrors the existing Phase 43 exit-gate pattern: lift, or evidence-re-scope, the category-leader block only once server surfaces are governance-verified and benchmark numbers are reproducible.
Delivers: Explicit readiness disposition -- either the category-leader claim is lifted with evidence, or it is re-scoped with rationale documented, per the project docs-do-not-overstate North Star.

### Phase Ordering Rationale

- Concurrency and governance are structural prerequisites, not optional hardening -- every adapter phase depends on both being correct first, Pitfalls research explicitly recommends this exact sequence.
- MCP precedes HTTP because it is single-client and lower-risk, letting the adapter-over-facade pattern be validated before multi-client concurrency is added.
- SSE is sequenced after HTTP because it inherits the daemon connection model and adds its own lifecycle discipline on top.
- The benchmark suite is architecturally independent of the server, drives the facade/CLI directly, and can run in parallel with Phases 3 through 6 once Phase 2 lands, but the milestone final readiness gate needs both workstreams complete.

### Research Flags

Phases likely needing deeper research during planning:
- Phase 0/1, Concurrency: Bun-on-Windows SQLite/WAL FD-hold behavior is codebase-asserted but unverified empirically -- needs a live spike, not just a plan.
- Phase 4/5, HTTP plus Streaming: StreamableHTTPServerTransport mounted into Bun.serve is explicitly flagged in STACK.md as the least Bun-proven path in the SDK -- spike this before committing to the design.
- Phase 7, Benchmark Suite: Exact competitor judge prompts and configs need verification against Mem0/Zep live repos at implementation time, this research cites the dispute, not their current exact harness.

Phases with standard patterns, skip research-phase:
- Phase 3, MCP stdio: Well-documented via the official SDK; conformance testable against the reference inspector.
- Phase 6, memory serve command: Follows the existing Commander command pattern exactly.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified directly against the live npm registry, modelcontextprotocol/sdk 1.29.0, zod 4.4.3; Bun-native choices verified against local bun version and the repo existing dependency set |
| Features | HIGH | Server and MCP surface shape verified against primary competitor docs, Mem0, Zep, Letta; benchmark structure verified against primary papers; competitor accuracy numbers explicitly labelled as contested marketing artifacts, not fact |
| Architecture | HIGH | Grounded in direct verified reads of connection.ts, smart-context-service.ts, memory-governance-service.ts, context.ts, query.ts, db-startup.ts, src/index.ts, scripts/eval-v5/harness.ts -- not inferred |
| Pitfalls | HIGH | Concurrency and governance pitfalls grounded in actual source code, NOOP_REDACTOR defaults, closeDatabase behavior; benchmark pitfalls grounded in the documented, citable Mem0/Zep LOCOMO dispute |

Overall confidence: HIGH

### Gaps to Address

- Bun-on-Windows long-lived-connection behavior: codebase comments assert an FD-hold risk but it is unverified empirically -- Phase 0 spike is the resolution mechanism, not further desk research.
- StreamableHTTPServerTransport plus Bun.serve integration: the SDK least-proven path on this runtime; needs a build-time spike before the HTTP daemon design is finalized.
- Open product decision, not a research gap but must be resolved before requirements: ship the daemon read-only first, drops WriteQueue from the critical path, lowers risk, versus read plus write from day one. Both are technically viable per this research; the choice is a scope and risk tradeoff for the roadmapper and user to make explicitly.
- Exact competitor benchmark configs: Mem0/Zep precise current judge prompts and run configs should be re-verified against their live repos at Phase 7 implementation time rather than relied on from this research snapshot.

## Sources

Primary, HIGH confidence:
- npm registry, verified 2026-07-21: modelcontextprotocol/sdk 1.29.0, zod 4.4.3, local bun version 1.3.5
- Direct repo reads: src/infrastructure/database/connection.ts, src/application/services/smart-context-service.ts, src/application/services/memory-governance-service.ts, src/presentation/cli/commands context, query, search, src/presentation/cli/db-startup.ts, src/index.ts, scripts/eval-v5/harness.ts, src/infrastructure/providers/provider-egress-policy.ts, src/infrastructure/security/pattern-redactor.ts, .planning/PROJECT.md
- github.com/snap-research/locomo plus LICENSE.txt, CC BY-NC 4.0, dataset schema
- github.com/xiaowu0162/LongMemEval plus LICENSE, MIT, ICLR 2025

Secondary, MEDIUM-HIGH confidence:
- Mem0 paper, arxiv 2504.19413, Zep blog, Is Mem0 Really SOTA, getzep/zep-papers issue 5, LOCOMO judge methodology and the public scoring dispute
- Mem0/Zep/Letta MCP server docs, competitor server surface shapes
- MCP transport comparison sources, truefoundry.com, startdebugging.net, apigene.ai, stdio vs Streamable HTTP vs deprecated SSE

Tertiary, LOW-MEDIUM confidence, flagged for build-time re-verification:
- Bun-on-Windows FD-hold behavior for bun:sqlite, codebase-asserted, not yet empirically reproduced
- Current exact competitor judge prompts and run configs, cited from the dispute, should be re-checked live at Phase 7

---
Research completed: 2026-07-21
Ready for roadmap: yes
