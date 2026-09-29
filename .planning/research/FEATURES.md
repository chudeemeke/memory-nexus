# Feature Research

**Milestone:** v6.0 — Server Surface & Benchmark Parity
**Domain:** Local-first agentic-memory server surface (MCP + HTTP) + public memory-benchmark parity
**Researched:** 2026-07-21
**Confidence:** HIGH (server/MCP surfaces and benchmark structure verified against primary docs/papers; competitor accuracy numbers are contested marketing artifacts and are labelled as such)

> Supersedes the 2026-01-27 v1.0 FEATURES research (CLI extraction/search table stakes), preserved in git history. This document covers ONLY the NEW v6.0 features: the server surface and the benchmark suite. Existing CLI/intelligence features are already built and are not re-researched here.

## Scope Note

The server is an **additional access path**, not a replacement. Its operations MUST map to existing application use-cases already exposed by the CLI (`query`/`search`/`context`/`related`/`stats`/`facts`/`governance`/`profile`/`friction`/`dream`/`extract`/`remote`). No parallel vocabulary. No business logic in the adapter. Governance/redaction/consent must be reused, not re-implemented. (Per PROJECT.md v6.0 invariants: "new presentation adapter over existing application ports; no business logic in the adapter and no parallel governance path.")

---

## Part A — Server & MCP Surface

### How comparable products expose memory over a server/MCP surface

| Product | Server/MCP surface | Core tools/endpoints exposed | Shape |
|---------|--------------------|------------------------------|-------|
| **Mem0 / OpenMemory** | MCP server (SSE/HTTP) + REST | `add_memories`, `search_memory`, `list_memories`, `get_memory(memory_id)`, `update_memory`, `delete_memory`, `delete_all_memories` | Memory objects scoped by `user_id`/`agent_id`/`app_id`/`run_id`; add takes text or message list + metadata; search is NL semantic query with filters + limit; list is filtered/paginated. |
| **Zep / Graphiti** | MCP server (stdio + HTTP) | `add_episode`/`add_graph_data`, `search_memory_facts`/`search_facts` (edges), `search_nodes`/`search_memory_nodes` (entities), `get_episodes`, `search_graph` | Knowledge-graph shape: episodes in, facts (edges) + nodes (entities) out. Fact search supports `edge_types`, `center_node_uuid`, and `valid_at`/`invalid_at` temporal filters. |
| **Letta / MemGPT** | REST API + MCP server | `archival_memory_insert`, `archival_memory_search`, `conversation_search`, `core_memory_append`, `core_memory_replace`, `send_message`; REST `/v1/archives`, `/v1/archives/{id}/passages`, `/v1/blocks` | Layered memory: editable core "blocks" (human/persona) + vector-backed archival "passages". Agent self-manages memory via tool calls. |

**Convergent pattern across all three:** the memory server surface is a small, curated set of verbs — **add/ingest, search (semantic), get-by-id, list/browse, and (for graph products) relation/entity search + temporal filters**. This maps cleanly onto `@chude/memory`'s existing read verbs; the product already has richer governance semantics than any competitor exposes over the wire.

### MCP transport decision (verified against MCP spec 2026)

- **stdio** — correct for a local server that a single client (Claude Code, Claude Desktop, Cursor) launches per-process. ~0ms overhead, no auth layer needed, one client per process. This is the **primary** surface for local-first.
- **Streamable HTTP** — the recommended transport for multi-client / remote. Supports auth, resumable streams, stateless deployment. Use for the local HTTP daemon if multiple concurrent clients are needed.
- **HTTP+SSE (two-endpoint legacy)** — **deprecated** in MCP spec 2025-03-26; do NOT build a new one (enterprise clients dropping it through 2026). "SSE/streaming for live context" should be delivered as streamed responses over Streamable HTTP (or stdio notifications), not the deprecated SSE transport.

### MCP-tool / HTTP-endpoint inventory mapped to existing use-cases

| Proposed MCP tool | Proposed HTTP endpoint | Existing use-case it wraps | Notes |
|-------------------|------------------------|----------------------------|-------|
| `memory_search` | `POST /v1/search` | `runSearchInternal` (query kind=message/file; mode fts/vector/hybrid) | NL query + `mode`, `limit`, `project`, `days`. 1:1 with `query --kind message`. |
| `memory_context` | `POST /v1/context` | `runContextInternal` (SmartContextService) | Project-scoped smart context with `budget`, `crossProject`, `days`. Mirrors `query --kind context`. |
| `memory_related` | `POST /v1/related` | `runRelatedInternal` (WITH RECURSIVE graph traversal) | Session/topic relation walk with `hops`, `type`. Mirrors `query --kind related`. Our "search_nodes/search_facts" analogue. |
| `memory_show` / `memory_get` | `GET /v1/sessions/{id}` | `runShowInternal` | Get-by-id (session thread). Analogue to Mem0 `get_memory`, Zep `get_episodes`. |
| `memory_list` | `GET /v1/sessions` | `runListInternal` | Filtered/paginated browse. Analogue to `list_memories`. |
| `memory_stats` | `GET /v1/stats` | `executeStatsCommand` | DB/project stats. |
| `memory_facts` | `GET /v1/facts` | `facts` command (SqliteFactRepository) | Extracted/derived facts with provenance + supersedence. Our differentiated "search_facts" — provenance-backed, not raw blobs. |
| `memory_friction` | `GET /v1/friction` | `friction` query contract | Durable friction query (filters/counts/thresholds/exit codes). Unique to this product. |
| `memory_profile` | `GET /v1/profile` | `profile` command (PersonaProfileService) | Persona/procedural memory (scoped, provenance-backed). Analogue to Letta persona block, but governed. |
| `memory_sync` | `POST /v1/sync` | `sync` command | Ingest new sessions. **Add-path analogue** (add_memories/add_episode) — but ingest-from-source, not free-text write. |
| `memory_governance` | `GET/POST /v1/governance` | `governance` command (MemoryGovernanceService) | Consent/redaction/provenance controls. **No competitor exposes this** — differentiator. |
| `memory_dream` (read-only) | `GET /v1/dream` | `dream` command (DreamingService) | Audited consolidation proposals — read/inspect only over the server. |
| `memory_status` / health | `GET /v1/healthz` | `status` / `doctor` | Liveness + DB health for a long-lived daemon. |

**Deliberately NOT exposed as a free-form write tool:** a competitor-style `add_memory(free_text)`. `@chude/memory` is event-sourced from real sessions; the ingest path is `sync`/`extract`/`backfill`, and derived truth flows through audited events (dreaming propose/promote/supersede), not silent free-text mutation. A raw write tool would bypass the event kernel and governance — an anti-feature (below).

---

## Part B — Public Benchmark Landscape

### LOCOMO (Long Conversational Memory) — the de-facto agentic-memory benchmark

**Structure (from the LOCOMO paper and dataset):**
- **10 multi-session conversations**, each spanning ~**35 sessions** over "several months" of simulated time. Reported per-conversation size varies by source: 300+ turns/session, averaging **~600 turns and ~16k–26k tokens per full conversation**.
- Each conversation annotated with **~200 QA pairs**.
- **Five QA categories:** (1) **single-hop** — factual recall from one session; (2) **multi-hop** — synthesize across sessions; (3) **temporal** — date/time reasoning; (4) **open-domain** — inference from indirect evidence; (5) **adversarial** — questions about information that does not exist (must abstain).
- Also includes event-summarization and multimodal dialogue-generation tasks, though most memory-framework leaderboards report only the QA task.

**Evaluation metrics:**
- **Partial-match F1** for extractive QA (canonical paper metric).
- **BLEU / ROUGE / MMRelevance** for summarization and multimodal sub-tasks.
- In practice most vendor leaderboards report **LLM-as-a-judge accuracy** (binary CORRECT/WRONG per answer) rather than F1 — a key reproducibility gotcha.
- Original-paper baselines: LLMs score **F1 13.9 (Mistral-7B) → 32.1 (GPT-4)**; human ceiling **87.9**.

**How competitors report LOCOMO (all contested — cite, do not repeat as fact):**
- **Mem0**: **66.9%** LLM-judge accuracy vs an OpenAI-memory baseline at **52.9%** → headline "**26% relative improvement**." Also reports efficiency: **~1.8K tokens/query vs ~26K** full-context (~90% fewer), **p95 latency 1.44s vs 17.12s** (~91% lower).
- **Zep**: originally claimed **~84%**; Mem0 recomputed it at **58.44%** (alleging incorrect inclusion of the adversarial category); Zep counter-claimed **75.14%**. The disagreement is about **methodology** (which categories count, judge prompt, whether "abstain" is scored), not raw retrieval quality.

**Reproducibility takeaway for a local-first product:** the accuracy number is only meaningful when the **harness is published** — category set, judge model + judge prompt, answer-extraction rule, and per-category breakdown. Our differentiator is a **reproducible, category-broken-down, judge-pinned** report, not a single headline number.

### Other recognized public benchmarks

| Benchmark | What it tests | Structure | Metric | Recognized because |
|-----------|---------------|-----------|--------|--------------------|
| **LongMemEval** | 5 core abilities: info extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention | **500 manually-written questions**; 7 question types; `LongMemEval_S` ≈115k-token history / 30–40 sessions, `LongMemEval_M` ≈500 sessions / ~1.5M tokens | Accuracy (LLM-judge) | Harder than LOCOMO; long-context LLMs drop 30–60% on `_S`. Zep reports 63.8% vs Mem0 49.0% here. |
| **DMR (Deep Memory Retrieval)** | Retrieval of a specific fact from long history | MemGPT-origin benchmark | Accuracy | Zep 94.8% (GPT-4-Turbo) vs MemGPT 93.4% — near-saturated, increasingly considered "easy"/low-signal. |
| **BEAM** (emerging 2026) | Broader agent-memory abilities | Newer; referenced in Mem0's 2026 benchmark writeups | Mixed | Emerging; watch, don't commit yet. |

**Recommended benchmark scope for v6.0:** LOCOMO (table stakes — everyone reports it) + LongMemEval (differentiator — harder, includes abstention/knowledge-update, which align with our supersedence + governance features). DMR optional (near-saturated). BEAM future-consideration.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MCP stdio server exposing search/context/get/list | Every comparable tool (Mem0, Zep, Letta) ships an MCP server; it's how Claude Code/Desktop/Cursor consume memory | MEDIUM | Thin adapter over existing `run*Internal`. Use official MCP TS SDK. |
| Semantic `memory_search` tool | Baseline verb in all three competitors | LOW | Wraps existing hybrid FTS5+sqlite-vec+RRF `search`. |
| `memory_context` / smart-context tool | The read agents actually want (assembled, budgeted context, not raw hits) | LOW | Wraps `SmartContextService`. |
| Get-by-id + list/browse | Mem0 `get_memory`/`list_memories`, Zep `get_episodes` | LOW | Wraps `show`/`list`. |
| Health/liveness endpoint for a long-lived daemon | Any daemon needs `healthz`/status | LOW | Wraps `status`/`doctor`. |
| Publish a **LOCOMO** score with a reproducible harness | Category lingua franca; absence reads as "untested" | HIGH | Extend `scripts/eval-v5`. Pin judge model + prompt; publish per-category F1 AND judge-accuracy. |
| Long-lived process concurrency over SQLite/WAL | A daemon holds the DB open across many requests; must not corrupt or deadlock | HIGH | **Highest technical risk** (per PROJECT.md). WAL + single-writer discipline + connection strategy. |
| Governance/redaction enforced on server paths | Product's whole premise is privacy-governed; a new access path can't bypass it | MEDIUM | Reuse `MemoryGovernanceService`/`PatternRedactor`. Verify with evals on the new surface. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Local-first, 127.0.0.1-bound, zero-egress server** | Mem0/Zep are cloud-first; a private, offline MCP memory server is genuinely differentiated | MEDIUM | Bind loopback by default; stdio needs no auth; no new network egress. |
| **Provenance-backed `memory_facts`** | Competitors return opaque memory blobs; we return facts with source events, confidence, and supersedence | LOW | Wraps existing `facts`. Our "search_facts" done better. |
| **`memory_governance` tool over the wire** | No competitor exposes consent/redaction/scope as first-class server operations | MEDIUM | Lets an agent inspect/respect consent boundaries programmatically. |
| **Reproducible, category-broken-down benchmark report** | Turns the "84% vs 58% vs 75%" credibility vacuum into a strength: publish harness + judge prompt + per-category numbers | HIGH | Our anti-marketing stance IS the differentiator vs the vendor number wars. |
| **LongMemEval abstention + knowledge-update parity** | These map to our supersedence + governance features; strong story where competitors are weak | HIGH | Align eval dimensions (supersedence, cross-project leakage) with LongMemEval abilities. |
| **Cross-project scoped `memory_context`** | Knowledge from repo A available in repo B only when scoped/relevant/safe | MEDIUM | Already built; expose `crossProject` over server with governance intact. |
| **Streaming/live context over Streamable HTTP** | "Subscribe to context as sessions land" — few local tools do this | HIGH | Stream over Streamable HTTP, not the deprecated SSE transport. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Free-text `add_memory(text)` write tool (Mem0-style) | "Competitors have it; agents want to jot notes" | Bypasses the event kernel, provenance, and governance; creates unaudited mutable truth — violates North Star ("dreams must not mutate hidden state") | Ingest via `sync`/`extract`/`backfill`; derived truth flows through audited dreaming propose/promote/supersede. |
| Default 0.0.0.0 / network-exposed daemon | "So other machines can query it" | Turns a local-first private tool into an unauthenticated exfiltration surface; contradicts "no new egress" invariant | Bind 127.0.0.1 by default. Cross-machine via existing git/iCloud/remote sync, or explicit opt-in Streamable HTTP + auth. |
| Auth/multi-tenant user system on the server | "Enterprise memory needs it" | Multi-user is explicitly out of scope (personal tool); auth on a loopback stdio server is dead weight | Single-user local trust boundary; stdio needs no auth. Defer to an explicit remote-mode decision. |
| Chasing the single headline LOCOMO number | "We need a big % to compete" | The number is a contested marketing artifact (84 vs 58 vs 75); a naked number invites the same credibility attacks | Publish harness + per-category + judge-pinned report; compete on reproducibility. |
| Deprecated HTTP+SSE two-endpoint transport | "SSE = streaming, and streaming is requested" | Deprecated in MCP spec 2025-03-26; enterprise clients dropping it in 2026 | Stream over Streamable HTTP (or stdio notifications). |
| Embedding an LLM judge inside the shipped product for scoring | "One command to get the score" | Bakes provider egress + nondeterminism into a local-first product | Keep the judge in the eval harness (`scripts/eval-v5`), provider-configurable and opt-in; product stays local. |
| Rewriting memory semantics into a graph-episode model to match Zep | "Graph memory benchmarks well" | We already have a temporal semantic graph; a rewrite risks the shipped event kernel | Expose existing graph via `memory_related`; don't re-architect to Graphiti's shape. |

## Feature Dependencies

```
MCP stdio server (adapter)
    └──requires──> Existing application ports (search/context/related/facts/...)
                       └──requires──> Long-lived-process concurrency over SQLite/WAL
                                          └──requires──> Governance reuse on server paths

Local HTTP daemon (127.0.0.1)
    └──requires──> MCP stdio server (share the same adapter/use-case mapping)
    └──enhances──> Streaming/live context (Streamable HTTP)

Broad benchmark suite (LOCOMO + LongMemEval)
    └──requires──> scripts/eval-v5 harness extension
    └──requires──> Reproducible judge config (provider-configurable, opt-in)
    └──enhances──> Category-leader block lift

memory_governance server tool ──enhances──> all read tools (consent/redaction)

Free-text add_memory ──conflicts──> Event-sourced kernel + audited dreaming
0.0.0.0 daemon ──conflicts──> Local-first / no-new-egress invariant
```

### Dependency Notes

- **Server adapter requires existing ports:** the entire premise is "new presentation adapter, no business logic." The adapter cannot ship before it maps every tool to an existing `run*Internal`/`execute*Command`.
- **Both server modes require the concurrency model:** a daemon holds the DB open. WAL single-writer discipline is the gating risk; get it right once, both MCP and HTTP inherit it.
- **Benchmark parity requires a reproducible judge:** without a pinned judge model + prompt, the number is not defensible and cannot lift the category-leader block.
- **Governance reuse conflicts with a naive write tool:** any free-text write path would need its own governance, duplicating the path the invariants forbid.

## MVP Definition

### Launch With (v6.0 core)
- [ ] MCP stdio server exposing `memory_search`, `memory_context`, `memory_related`, `memory_show`, `memory_list`, `memory_stats`, `memory_facts`, `memory_status` — each mapped to an existing use-case — because this is the milestone's reason to exist.
- [ ] Long-lived-process concurrency model over SQLite/WAL, tested under concurrent reads — because everything else corrupts without it.
- [ ] Governance/redaction verified on the MCP path via evals — North Star non-negotiable.
- [ ] LOCOMO benchmark in `scripts/eval-v5` with per-category breakdown + pinned judge, reproducible report — the parity claim.

### Add After Validation (v6.x)
- [ ] Local HTTP daemon on 127.0.0.1 (Streamable HTTP) — trigger: a second concurrent client is genuinely needed.
- [ ] Streaming/live context subscription — trigger: after HTTP daemon proves stable.
- [ ] `memory_governance` and read-only `memory_dream` server tools — trigger: after core read tools land.
- [ ] LongMemEval benchmark — trigger: after LOCOMO is reproducible and green.

### Future Consideration (v7+)
- [ ] Streamable HTTP + auth for opt-in remote/multi-client — defer: multi-user is out of scope; only if a real cross-machine need appears.
- [ ] BEAM / newer 2026 benchmarks — defer: emerging, low current signal.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MCP stdio server (curated read tools) | HIGH | MEDIUM | P1 |
| SQLite/WAL long-lived concurrency model | HIGH | HIGH | P1 |
| Governance verified on server paths | HIGH | MEDIUM | P1 |
| LOCOMO reproducible harness + report | HIGH | HIGH | P1 |
| Local HTTP daemon (127.0.0.1, Streamable HTTP) | MEDIUM | MEDIUM | P2 |
| LongMemEval benchmark | MEDIUM | HIGH | P2 |
| Streaming/live context | MEDIUM | HIGH | P2 |
| `memory_governance` / `memory_dream` server tools | MEDIUM | MEDIUM | P2 |
| Remote/auth Streamable HTTP | LOW | HIGH | P3 |
| DMR / BEAM benchmarks | LOW | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | Mem0 / OpenMemory | Zep / Graphiti | Letta / MemGPT | Our Approach |
|---------|-------------------|----------------|----------------|--------------|
| Add/ingest | `add_memories(text/messages)` free-text | `add_episode` / `add_graph_data` | `archival_memory_insert` | Ingest via `sync`/`extract`; no free-text write tool (event-sourced) |
| Semantic search | `search_memory` | `search_memory_facts` / `search_nodes` | `archival_memory_search` | `memory_search` over hybrid FTS5+vec+RRF |
| Assembled context | (client assembles) | (client assembles) | core-memory blocks | `memory_context` (SmartContextService — assembled + budgeted) |
| Relations / graph | graph memory (add-on) | first-class facts+nodes+temporal edges | none | `memory_related` over existing temporal semantic graph |
| Provenance / facts | metadata only | edges with valid_at/invalid_at | none | `memory_facts` — provenance + confidence + supersedence |
| Governance/consent tool | none | none | none | `memory_governance` (differentiator) |
| Transport | MCP SSE/HTTP (cloud) | MCP stdio + HTTP | REST + MCP | MCP stdio (local) primary; Streamable HTTP opt-in; loopback default |
| Privacy posture | cloud-first | cloud-first | self-host option | local-first, 127.0.0.1, zero new egress |
| LOCOMO reporting | 66.9% (headline 26% rel.) | 84% / 75.14% (disputed) | (mostly DMR) | reproducible, per-category, judge-pinned |

## Sources

- Mem0 MCP: https://github.com/mem0ai/mem0-mcp · https://docs.mem0.ai/platform/mem0-mcp · https://mem0.ai/blog/how-to-make-your-clients-more-context-aware-with-openmemory-mcp
- Zep/Graphiti MCP: https://help.getzep.com/graphiti/getting-started/mcp-server · https://github.com/getzep/graphiti/blob/main/mcp_server/README.md · https://blog.getzep.com/unified-agent-memory-in-any-mcp-client/
- Letta/MemGPT API: https://docs.letta.com/api/ · https://docs.letta.com/guides/legacy/memgpt-agents-legacy/ · https://docs.letta.com/core-concepts/
- MCP transports: https://www.truefoundry.com/blog/mcp-stdio-vs-streamable-http-enterprise · https://startdebugging.net/2026/07/mcp-stdio-vs-http-vs-sse-transport-which-to-choose/ · https://apigene.ai/blog/mcp-sse-vs-stdio
- LOCOMO benchmark: https://www.emergentmind.com/topics/locomo-dataset · https://www.emergentmind.com/topics/locomo-benchmark-scores · https://arxiv.org/pdf/2504.19413 (Mem0 paper, LOCOMO results)
- LOCOMO number controversy: https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ · https://atlan.com/know/zep-vs-mem0/ · https://theaiengineer.substack.com/p/cognee-vs-zep-vs-mem0-vs-letta
- LongMemEval: https://arxiv.org/abs/2410.10813 · https://xiaowu0162.github.io/long-mem-eval/ · https://www.emergentmind.com/topics/longmemeval
- DMR / Zep temporal KG: https://arxiv.org/pdf/2501.13956 · https://blog.getzep.com/state-of-the-art-agent-memory/ · https://www.marktechpost.com/2025/02/04/zep-ai-introduces-a-smarter-memory-layer-for-ai-agents-outperforming-the-memgpt-in-the-deep-memory-retrieval-dmr-benchmark/
- Benchmarks overview: https://mem0.ai/blog/ai-memory-benchmarks-in-2026 · https://mem0.ai/blog/state-of-ai-agent-memory-2026
- Internal: `.planning/PROJECT.md` (North Star, v6.0 milestone + invariants), `src/presentation/cli/commands/query.ts` (unified query use-cases), `docs/evals/2026-06-05-v5-evaluation-baseline.md` + `scripts/eval-v5/harness.ts` (eval dimensions/harness to extend)

---
*Feature research for: local-first agentic-memory server surface + benchmark parity (v6.0)*
*Researched: 2026-07-21*
