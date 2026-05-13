# Adjacent System Summary — OpenClaw

**Audit:** memory-nexus first-principles architecture audit (kicked off 2026-05-11)
**Stage:** 2 — adjacent-system research
**Sources retrieved:** 2026-05-13
- Docs: https://docs.openclaw.ai/reference/templates/SOUL
- GitHub: https://github.com/win4r/openclaw-workspace
- Guides: https://velvetshark.com/openclaw-memory-masterclass, https://duncsand.medium.com/openclaw-and-the-programmable-soul-2546c9c1782c, https://trilogyai.substack.com/p/how-to-manage-your-openclaw-memory, https://amankhan1.substack.com/p/how-to-make-your-openclaw-agent-useful, https://github.com/affaan-m/everything-claude-code/blob/main/the-openclaw-guide.md, https://gaodalie.substack.com/p/i-studied-openclaw-memory-system, https://alirezarezvani.medium.com/10-soul-md-practical-cases-in-a-guide-for-moltbot-clawdbot-defining-who-your-ai-chooses-to-be-dadff9b08fe2
- Adjacent indexing layer: https://github.com/yoloshii/ClawMem

**Scope discipline (§5.3):** evaluated against Stage 0 T1-T8 + C1-C3. No memory-nexus comparison inside.

---

## What it is

OpenClaw is a Claude-Code-adjacent agent workspace convention. The agent is defined by a directory of markdown files injected into the system prompt on each turn. Memory is plain markdown plus an optional indexing layer.

## Storage model

**Two-tier:**
- **Tier 1 (canonical, plain markdown):** `MEMORY.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `USER.md`, `IDENTITY.md`, `HEARTBEAT.md`, `BOOTSTRAP.md` plus daily logs at `memory/YYYY-MM-DD.md`. The agent reads canonical markdown at session start; markdown is the source of truth.
- **Tier 2 (derived index):** ClawMem (adjacent project per https://github.com/yoloshii/ClawMem) stores indexes in a single local SQLite file using SQLite + sqlite-vec + FTS5. Hybrid keyword + semantic search via MCP server + hooks. The DB is derived from the markdown; markdown is upstream.

The minimal viable workspace is just 3 files (AGENTS.md + SOUL.md + TOOLS.md) — bootstrap thresholds (20k chars per file, 150k aggregate cap) are explicit.

## Memory taxonomy + lifecycle

Memory kinds via convention (markdown files by purpose), not enforced types:
- Identity (SOUL.md)
- Agent rules (AGENTS.md)
- Tools (TOOLS.md)
- Long-term facts (MEMORY.md)
- Daily logs (memory/YYYY-MM-DD.md)
- Heartbeat / session-start ambient (HEARTBEAT.md)

**Daily-to-canonical curation flow:** the agent writes notes to `memory/YYYY-MM-DD.md` each day. Over time, the important stuff curates upward into MEMORY.md. The agent's responsibility, not the framework's.

## Capture-to-retrieval flow

- **Capture:** the agent writes markdown files directly. No extraction pipeline; the agent is the extractor.
- **Boot retrieval:** 8 specific filenames auto-loaded into system prompt at session start (truncated at 20k/file, 150k aggregate).
- **On-demand retrieval:** `memory_search` function queries across daily logs and MEMORY.md using keyword + semantic via the ClawMem index. Search-first-then-inject; never dumps all memories into context.

## Supersedence / lifecycle handling

**No formal supersedence primitive.** Old daily logs accumulate; curation into MEMORY.md is human/agent discretion. Markdown is plain text; the agent can edit/overwrite without an explicit invalidation event.

## AI-readability / no-tool recovery

**Best-in-class.** Markdown is plain text. If OpenClaw conventions disappear, the user keeps their MEMORY.md, SOUL.md, etc. as-is. ClawMem index is throwaway; markdown is canonical. **Zero-cost recovery.**

## Truth-by-truth evaluation

| Truth | OpenClaw verdict | Evidence |
|---|---|---|
| T1 typed memory kinds | partial | File-purpose conventions (SOUL/MEMORY/USER/etc.) but not enforced types; queries are filename-aware, not type-aware. |
| T2 context-driven recall | partial | Bootstrap injects 8 files always; on-demand requires the agent to call `memory_search`. No ambient surfacing beyond the bootstrap files. |
| T3 project + cross-project | n/a | Each agent workspace is its own scope. Cross-workspace is out of design. |
| T4 lifecycle / supersedence | weak | Manual curation; no formal supersedence. Plain-text editing IS supersedence semantically but no event record. |
| T5 agent integration | strong | Workspace IS the integration. The agent's identity and memory are the same surface as the prompt. |
| T6 scale | bounded | Bootstrap cap (150k chars) limits always-on. Indexed daily logs + MEMORY.md scale higher via ClawMem search. |
| T7 self-evident recovery | yes | Markdown SoT. Zero-cost. |
| T8 reconciliation | weak | No formal dedup. Cross-session writes go to dated daily logs; merge is manual via curation. |
| C1 low-friction capture | yes | Agent writes markdown; no API call. |
| C2 local-first | yes | All filesystem. |
| C3 not another fragmented surface | n/a | OpenClaw IS the surface for its agent. Cross-agent unification is not a goal. |

## Distinctive design choices

- **Markdown-as-canonical.** Plain text is the source of truth; the index is throwaway.
- **Identity-first.** SOUL.md is read first because it defines who the agent is. Memory is downstream of identity.
- **Search-first-not-dump.** Default retrieval is on-demand keyword/semantic search, not bulk-load.
- **Daily curation cadence.** Daily logs accumulate; curation into MEMORY.md is the cadence-level decision.
- **No required indexing layer.** ClawMem is optional. Markdown + grep is the fallback.

## What OpenClaw does NOT solve

- Cross-workspace memory federation.
- Formal supersedence events with audit trail.
- Schema-enforced typed memory (decisions/learnings/preferences as queryable types).
- Multi-session reconciliation primitives beyond manual curation.
