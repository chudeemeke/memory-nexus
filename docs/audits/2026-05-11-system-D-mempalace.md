# Adjacent System Summary — MemPalace

**Audit:** memory-nexus first-principles architecture audit (kicked off 2026-05-11)
**Stage:** 2 — adjacent-system research
**Sources retrieved:** 2026-05-13
- GitHub: https://github.com/mempalace/mempalace (22k stars in 48 hours per third-party reports)
- Vendor: https://www.mempalace.net/
- Third-party: https://recca0120.github.io/en/2026/04/08/mempalace-ai-memory-system/, https://medium.com/@creativeaininja/mempalace-the-viral-ai-memory-system-that-got-22k-stars-in-48-hours-an-honest-look-and-setup-26c234b0a27b, https://www.analyticsvidhya.com/blog/2026/05/mempalace-explained/, https://emasterlabs.com/mempalace-explained, https://vectorize.io/articles/what-is-mempalace, https://www.aitoolnet.com/mempalace
- Academic: https://arxiv.org/html/2604.21284v1 (Spatial Metaphors for LLM Memory)
- Deployment: https://openclawapi.org/en/blog/2026-04-08-mempalace-deployment

**§5.1 stable-reference status:** MULTIPLE stable references found (GitHub repo, vendor site, arXiv paper, multiple third-party guides). MemPalace fallback NOT applied — this is a real, well-documented system. Stage 2 proceeds with normal evidence-cited summary.

**Scope discipline (§5.3):** evaluated against Stage 0 T1-T8 + C1-C3. No memory-nexus comparison inside.

---

## What it is

MemPalace is an open-source long-term memory system for AI agents. Uses the **method of loci** ("memory palace" ancient Greek technique) as its organizational metaphor. Stores conversation history **verbatim** — no summarization, no extraction, no paraphrasing. Retrieval is semantic search + structured navigation.

## Storage model

**Spatial metaphor:**
- **Wings** for projects/people/topics
- **Rooms** for sub-topics within a wing
- **Halls** for memory-type corridors shared across wings
- **Closets** for summaries
- **Drawers** for verbatim originals

**Layered loading (token-budgeted boot):**
- **L0 (~50 tokens):** identity
- **L1 (~120 tokens):** critical facts
- **L2:** room recall on demand
- **L3:** deep semantic search on demand

Startup loads only L0 + L1 (~170 tokens total).

**Backend:** local SQLite with temporal entity-relationship graph + validity windows.

## Memory taxonomy + lifecycle

- **Verbatim originals (Drawers):** raw conversation turns, chunked at 512 tokens with 64-token overlap. Each chunk has role / turn-number / session-id / timestamp metadata.
- **Summaries (Closets):** distilled views of Drawer contents.
- **Halls:** memory-type corridors. Cross-Wing typing.
- **Temporal validity windows:** entity-relationship graph supports temporal validity — entities can be "valid from T1 to T2," enabling time-windowed retrieval.

## Capture-to-retrieval flow

**Capture (zero-LLM):** chunking pipeline splits messages, indexes verbatim, populates entity-relationship graph. **No LLM inference at write time** — deterministic, zero API cost, fully offline, no rate limits, no vendor lock-in.

**Retrieval:**
- L0/L1 boot from indexed identity + critical facts.
- L2 room recall on demand.
- L3 deep semantic search via vector index.
- 29 MCP tools cover palace reads/writes, KG operations, cross-wing navigation, drawer management, agent diaries.

## Supersedence / lifecycle handling

**Temporal entity-relationship graph with validity windows.** Supersedence is encoded as a "valid_to" boundary on the prior entity-relation, not a separate event. New facts establish new validity intervals. Old facts remain queryable with explicit time-filter.

## AI-readability / no-tool recovery

**Mixed.** Verbatim Drawers are searchable as plain SQLite rows but the spatial metaphor (Wings/Rooms/Halls) is MemPalace-specific schema. Recovery: a future model can read raw chunks; the wing/room/hall typing requires the MemPalace schema understanding. SQLite as backend means standard `sqlite3` can read; the semantic interpretation requires the framework.

**Strength:** zero-LLM ingestion + fully offline. SQLite plain-data accessibility is moderate.

## Truth-by-truth evaluation

| Truth | MemPalace verdict | Evidence |
|---|---|---|
| T1 typed memory kinds | partial | Halls type memories by category (cross-Wing). Not enforced taxonomy at chunk level. |
| T2 context-driven recall | yes | L1/L2/L3 layered semantic + structured. Spatial navigation is the differentiator. |
| T3 project + cross-project | yes | Wings ARE the project scope. Halls share across Wings for type-corridor queries. |
| T4 lifecycle / supersedence | yes | Temporal validity windows. Time-typed entity-relations. |
| T5 agent integration | yes via MCP | 29 MCP tools. Agent invokes them on demand. |
| T6 scale | yes (claimed) | 96.6% search accuracy + 170-token boot enables scale at retrieval. SQLite scales to millions per row. |
| T7 self-evident recovery | partial | SQLite plain-readable; semantic layer is framework-specific. |
| T8 reconciliation | partial | Verbatim storage means no dedup at write time (everything is kept). Reconciliation is at retrieval — filter by validity windows. |
| C1 low-friction capture | yes | Zero-LLM ingestion. Deterministic, offline, no API cost. |
| C2 local-first | yes | SQLite + offline. |
| C3 not another fragmented surface | yes (internally) | One framework, one schema, one MCP server. Internally coherent. |

## Distinctive design choices

- **Verbatim storage.** No summarization at write time. Bet: search beats compression for recall.
- **Spatial metaphor.** Wings/Rooms/Halls/Closets/Drawers. The metaphor IS the organizational logic.
- **Token-budgeted boot.** 170 tokens at startup. Layered loading on demand.
- **Zero-LLM ingestion.** Deterministic write path. No vendor lock-in via embedding model choice (chunks are pre-embedded).
- **Temporal validity windows.** Supersedence as time-interval, not event.
- **29 MCP tools.** MCP-first interface; framework-agnostic agent integration.

## What MemPalace does NOT solve (apparent gaps within its own design)

- Schema-enforced typed events (decisions / learnings / preferences as enum-typed records).
- Cross-machine sync (single-machine SQLite + MCP).
- C3 risk: 29 MCP tools is itself a surface area question for agents — overhead of choosing among them.
- Compression bet: verbatim storage scales well but does not summarize for cognitive ergonomics at retrieval.
