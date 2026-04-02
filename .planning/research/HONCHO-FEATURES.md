# Honcho Feature Landscape

**Domain:** AI agent memory / reasoning-driven context
**Researched:** 2026-04-02

## Honcho's Feature Set

### Core Features

| Feature | How It Works | Complexity | @chude/memory Equivalent |
|---------|-------------|------------|--------------------------|
| Peer modeling | Unified entity model for users/agents | High | Not applicable (single-user) |
| Multi-peer sessions | Sessions with multiple participants | High | Not applicable |
| Observation extraction (Deriver) | LLM extracts facts from messages | High | No equivalent |
| Reasoned querying (Dialectic) | LLM-driven agentic search over memory | High | No equivalent |
| Memory consolidation (Dreamer) | Background random-walk consolidation | High | No equivalent |
| Workspace isolation | Multi-tenant data separation | Medium | Project-path filtering (simpler) |
| Session context API | `context()` returns messages + representation | Low | `memory context <project>` |
| Vector search | pgvector semantic similarity | Medium | Planned (Phases 14-16) |
| Peer cards | Biographical fact summaries | Medium | No equivalent |
| Reasoning levels | Configurable compute per query | Medium | No equivalent |
| Peer chat API | `peer.chat(query)` natural language Q&A | High | `memory search` (keyword only) |
| File upload to sessions | Ingest documents as messages | Low | No equivalent |
| Session cloning | Duplicate conversations | Low | No equivalent |
| Webhook events | External event delivery | Medium | Claude Code hooks (different) |
| SDK (Python + TypeScript) | Client libraries | Medium | CLI only |
| Token tracking | Per-message and per-context token counts | Low | Token fields exist but unused |

### Honcho's Reasoning Pipeline (Unique Feature)

This is Honcho's core differentiator. Three specialized agents:

1. **Deriver Agent** (ingestion-time)
   - Processes new messages asynchronously
   - Extracts explicit observations (stated facts)
   - Generates deductive observations (inferences)
   - Updates peer cards (biographical summaries)
   - Stores observations as vector-embedded documents

2. **Dialectic Agent** (query-time)
   - Triggered by `peer.chat()` API calls
   - Uses tools: search_memory, get_recent_observations, etc.
   - Multi-step agentic reasoning loop
   - Grounds responses in retrieved facts
   - Can create new deductive observations during reasoning
   - Supports streaming responses and reasoning levels

3. **Dreamer Agent** (background)
   - Random-walk exploration starting from recent/high-value observations
   - Searches for related content across all memory
   - Consolidates redundant observations
   - Deletes obsolete data
   - Produces deductive, inductive, and abductive conclusions
   - Runs on schedule or explicit trigger

### Benchmark Performance

| Benchmark | Score | Token Efficiency | Notes |
|-----------|-------|------------------|-------|
| LongMem S (115K tokens) | 90.4% | 11% mean | vs 62.6% Haiku baseline |
| LongMem M | 88.8% | - | |
| LoCoMo | 89.9% | - | vs 83.9% Haiku alone |
| BEAM 100K | 0.630 | - | |
| BEAM 10M | 0.406 | 0.5% | No recall degradation at scale |

Cost: ~$0.15/query with Honcho vs ~$3.75 direct for 250K token context.

## Features Adoptable by @chude/memory

### High Value, Feasible to Adopt

| Concept | Honcho Approach | @chude/memory Adaptation | Complexity |
|---------|----------------|--------------------------|------------|
| Memory consolidation | Dreamer agent with random walk | Post-sync summarization job | Medium |
| Synthesized context | Reasoned representations | LLM-generated project summaries | Medium |
| Hybrid search | pgvector + trigram | sqlite-vec + FTS5 (already planned) | Medium |
| Token efficiency | Returns 10K tokens not 100K | Intelligent result truncation | Low |

### Medium Value, Higher Effort

| Concept | Honcho Approach | @chude/memory Adaptation | Complexity |
|---------|----------------|--------------------------|------------|
| Observation extraction | Deriver agent at ingestion | Extract decisions/patterns from sessions | High |
| Peer cards / summaries | Biographical fact lists | Project fact sheets | Medium |
| Reasoning levels | Configurable compute per query | --depth flag on search | Low |

### Low Value for Single-Developer Context

| Concept | Why Low Value |
|---------|---------------|
| Multi-peer sessions | Single user, single agent |
| Workspace multi-tenancy | One developer's sessions |
| Theory of Mind modeling | Not modeling other people |
| Webhook events | CLI tool, no external consumers |
| SDK libraries | CLI is the interface |

## Anti-Features (Do NOT Adopt)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| PostgreSQL dependency | Destroys local-first value proposition | Keep SQLite |
| Multi-LLM pipeline | Cost and complexity explosion | Single optional LLM (Claude API or local) |
| Cloud-first architecture | Wrong audience (developer tool vs SaaS) | Stay local-first |
| Background worker processes | Operational overhead | Single-process consolidation command |
| Per-message LLM processing | Expensive for session ingestion scale | Batch processing on-demand |

## Feature Dependencies for v4.0

```
Embedding infrastructure (sqlite-vec) → Hybrid search
                                      → Consolidation/Dreaming
                                      → Synthesized context

Consolidation/Dreaming → Project summaries
                       → Decision extraction
                       → Pattern catalogs

Claude API integration (optional) → Reasoning over memory
                                  → Observation extraction
```

## Recommendation

**Adopt concepts, not architecture.** Honcho's three-agent pipeline makes sense for a cloud platform serving millions of users. @chude/memory should adopt:

1. The *consolidation* concept (background summarization) as a CLI command: `memory dream` or `memory consolidate`
2. The *synthesized context* concept (reasoned summaries) enhancing `memory context`
3. The *hybrid search* approach (BM25 + vector) already planned

Do NOT adopt the multi-service, multi-LLM, PostgreSQL architecture. The local-first, zero-infrastructure identity is @chude/memory's competitive advantage.

## Sources

- [Honcho GitHub](https://github.com/plastic-labs/honcho)
- [Honcho Documentation](https://docs.honcho.dev/)
- [Honcho Benchmarks](https://blog.plasticlabs.ai/research/Benchmarking-Honcho)
- [Honcho 3 Announcement](https://blog.plasticlabs.ai/blog/Honcho-3)
- [Honcho SDK Reference](https://docs.honcho.dev/v3/documentation/reference/sdk)
