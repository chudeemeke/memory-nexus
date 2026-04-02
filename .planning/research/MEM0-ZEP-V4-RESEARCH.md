# Mem0 and Zep: Research for @chude/memory v4.0

**Domain:** AI agent memory / knowledge extraction / context persistence
**Researched:** 2026-04-02
**Overall confidence:** HIGH (primary sources: arxiv papers, official docs, GitHub repos, DeepWiki analysis)
**Companion research:** HONCHO-SUMMARY.md (same date)

---

## Executive Summary

Mem0 and Zep represent the two dominant approaches to AI agent memory as of April 2026. Mem0 (51.8k GitHub stars) is a **fact-extraction-and-deduplication** system: it processes conversations through an LLM to extract atomic facts, then decides whether each fact should be added, updated, deleted, or ignored relative to existing memories. Zep (via its open-source engine Graphiti, 24.4k stars) is a **temporal knowledge graph** system: it decomposes conversations into entities, relationships, and episodes with explicit validity windows, tracking how facts change over time.

Both require external LLM calls for their extraction pipelines. Neither offers a purely heuristic approach to knowledge extraction -- the industry consensus is that LLM-powered extraction is necessary for quality results. This validates a key decision for @chude/memory v4.0: the intelligence layer will need LLM calls, not just string matching or regex.

For @chude/memory's local-first, single-developer, SQLite-based architecture, **Mem0's patterns are more directly applicable** than Zep's. Mem0's extraction-update pipeline (extract facts from messages, compare against existing memories, decide ADD/UPDATE/DELETE/NOOP) maps cleanly to our use case. Zep's temporal knowledge graph is architecturally elegant but requires Neo4j or equivalent graph database infrastructure -- overkill for a developer tool.

However, Zep introduces **temporal validity** as a concept worth stealing. Facts in a developer's knowledge base do change ("we used Redis for caching" becomes "we migrated to Valkey"). Tracking when facts were valid, without the full graph infrastructure, is a lightweight addition to SQLite.

### Key Takeaways for v4.0

1. **LLM-powered extraction is non-negotiable** -- both platforms confirm heuristic-only approaches produce unusable results
2. **Mem0's four-operation model (ADD/UPDATE/DELETE/NOOP)** is the right abstraction for memory consolidation
3. **Dual-mode processing** (Mem0's "infer" vs "direct") solves the cost/quality tradeoff -- extract knowledge from important sessions, store raw data from routine ones
4. **Background consolidation** with higher thresholds than write-time dedup prevents memory bloat without losing nuance
5. **Temporal validity windows** (from Zep) are worth adopting in simplified form -- track when knowledge was observed and when it was superseded
6. **Neither platform solves our actual problem** -- both assume real-time conversation memory for chatbots, not retrospective extraction from JSONL session files

---

## 1. Knowledge Extraction: How They Turn Conversations into Knowledge

### Mem0: LLM-Powered Fact Extraction

**Confidence: HIGH** (arxiv paper + DeepWiki source code analysis + official docs)

Mem0 uses a two-phase pipeline: **Extraction** then **Update**.

**Extraction Phase:**
- Processes message pairs (previous message + current message) through an LLM
- Provides contextual inputs: a periodic conversation summary (S), a recent message window (m=10 messages), and the current exchange
- The extraction prompt P = (S, {recent messages}, current pair) produces candidate facts
- Typically extracts 5-10 candidate facts per conversation turn
- Each fact is a natural language statement (e.g., "User prefers TypeScript over JavaScript")

**Two operating modes:**
- **Infer Mode** (default, `infer=True`): Full LLM extraction pipeline. Extracts structured facts, compares against existing memories, deduplicates. This is where the quality comes from.
- **Direct Mode** (`infer=False`): Skips LLM processing entirely. Embeds and stores messages verbatim. Faster and cheaper but produces duplicates and no consolidation.

**Applicable pattern for @chude/memory:** The dual-mode concept maps directly to our use case. Important sessions (architecture decisions, debugging breakthroughs) deserve infer-mode extraction. Routine sessions (quick fixes, formatting) can be stored as-is. The user or a heuristic (session length, topic diversity) could select the mode.

### Zep/Graphiti: Entity-Relationship Extraction with Temporal Tracking

**Confidence: HIGH** (arxiv paper 2501.13956 + GitHub README + official docs)

Zep's engine Graphiti uses a more structured extraction pipeline:

**Entity Extraction:**
- Processes current message plus 4 preceding messages (2 conversation turns)
- Speaker is automatically extracted; other entities identified via LLM with reflection prompts to minimize hallucination
- Entities typed as: people, locations, objects, concepts, events, attributes

**Entity Resolution (Deduplication):**
- Extracted entities embedded in 1024-dimensional vectors
- Compared against existing nodes via cosine similarity + full-text search
- Duplicates trigger LLM-generated "updated name and summary" with Cypher queries updating the graph

**Fact Extraction:**
- Relationships between entities extracted as directed edges
- Each fact has: source entity, target entity, relationship type, detailed description
- Deduplication constrains searches to edges between the same entity pairs (reduces computational cost)

**Temporal Metadata (the key differentiator):**
Every edge carries four timestamps:
- `t'_created`: when the fact was ingested into the system
- `t'_expired`: when the fact was superseded (transaction time)
- `t_valid`: when the fact became true in the real world
- `t_invalid`: when the fact ceased being true in the real world

**Applicable pattern for @chude/memory:** The four-timestamp model is over-engineered for our use case, but the core idea -- tracking when knowledge was observed and when it was superseded -- is valuable. A simplified two-field approach (`observed_at`, `superseded_at`) on extracted facts would give us temporal awareness without graph complexity.

### Comparison: Extraction Approaches

| Dimension | Mem0 | Zep/Graphiti |
|-----------|------|--------------|
| Extraction unit | Atomic facts (natural language) | Entity-relationship triplets |
| LLM calls per message | 1 (extraction) + 1 (update decision) | 3+ (entity extract, resolve, fact extract, dedup) |
| Context window | 10 recent messages + summary | 4 preceding messages |
| Output format | Flat text facts | Graph nodes + edges |
| Temporal awareness | None (base) / limited (graph variant) | First-class, bi-temporal |
| Local feasibility | Higher (simpler pipeline) | Lower (requires graph DB) |

**Recommendation:** Adopt Mem0's flat-fact extraction model. It requires fewer LLM calls, produces simpler output, and stores naturally in SQLite rows. Borrow Zep's temporal validity concept but implement it as columns on fact records, not as a graph.

---

## 2. Memory Consolidation: Preventing Bloat While Preserving Nuance

### Mem0: Four-Operation Update Model

**Confidence: HIGH** (arxiv paper with specific thresholds + DeepWiki source analysis)

Mem0's consolidation operates at two levels:

**Write-Time Consolidation (every `add()` call):**
1. Extract candidate facts from new messages
2. For each fact, embed it and retrieve top-s semantically similar existing memories (s=10)
3. Present the candidate fact + similar memories to an LLM
4. LLM decides one of four operations via function calling:
   - **ADD**: New fact, no semantic match exists
   - **UPDATE**: Modify existing memory with complementary info
   - **DELETE**: Existing memory contradicted by new information
   - **NOOP**: Fact already captured, no action needed

Write-time similarity threshold: **0.92** cosine similarity for deduplication.

**Background Consolidation (periodic):**
- Scans existing memory store for near-duplicates
- Merge threshold: **0.95** cosine similarity (deliberately higher than write-time)
- Rationale: false merges are worse than near-duplicate retention
- Relevance score decay: exponential exp(-lambda * delta_t)
- Results: claimed 60% storage reduction, 22% retrieval precision improvement
- Summary refresh cycle: every 50-100 conversation turns

**Applicable pattern for @chude/memory:** The two-tier consolidation (aggressive at write time, conservative in background) is directly adoptable. After `memory sync` extracts knowledge, a `memory consolidate` command could run the background pass. The threshold asymmetry (0.92 write / 0.95 background) is a smart design choice worth preserving.

### Zep/Graphiti: Temporal Invalidation Instead of Deletion

**Confidence: HIGH** (arxiv paper with formal model)

Zep/Graphiti takes a fundamentally different approach: **nothing is deleted**. Instead:

- When new information contradicts an existing fact, the system uses an LLM to compare them
- If a temporal conflict is detected, the existing edge gets `t_invalid` set to the new fact's `t_valid`
- Both the old and new facts remain in the graph
- Queries default to "currently valid" facts but can query any point in time

**Community-level consolidation:**
- Label propagation groups related entities into communities
- Communities get map-reduce-style summaries
- New entities join communities by plurality vote of neighboring nodes
- Periodic full refreshes correct drift from incremental updates

**Applicable pattern for @chude/memory:** The "invalidate don't delete" principle is excellent for a developer tool. When a project migrates from Jest to Vitest, the old fact ("project uses Jest") should be marked superseded, not erased -- the migration context is valuable. This can be implemented with a `superseded_at` timestamp and `superseded_by` foreign key on fact records in SQLite.

### Consolidation Comparison

| Dimension | Mem0 | Zep/Graphiti |
|-----------|------|--------------|
| Deletion model | Physical delete (DELETE op) | Logical invalidation (t_invalid timestamp) |
| Dedup threshold (write) | 0.92 cosine | Entity resolution via embedding + full-text |
| Dedup threshold (background) | 0.95 cosine | Community re-clustering |
| Historical queries | No (deleted = gone) | Yes (query any point in time) |
| Storage growth | Controlled (merges + deletes) | Monotonic (nothing deleted) |

**Recommendation:** Hybrid approach. Use Mem0's ADD/UPDATE/NOOP operations for write-time consolidation, but replace DELETE with Zep-style invalidation. This gives us history preservation (valuable for developer context) without graph infrastructure.

---

## 3. Storage Architecture

### Mem0: Multi-Store with Factory Pattern

**Confidence: HIGH** (DeepWiki source analysis + official docs)

Mem0 employs three storage layers:

1. **Vector Store** (required): Embeddings for semantic search
   - 24+ backends: Qdrant (default, local at `/tmp/qdrant`), Chroma, pgvector, FAISS, Pinecone, Weaviate, Milvus, Redis, etc.
   - Factory pattern: `VectorStoreFactory` instantiates from config string
   - TypeScript SDK uses better-sqlite3 for local vector storage

2. **Graph Store** (optional): Entity relationships
   - Backends: Neo4j, Memgraph, Kuzu, Amazon Neptune, Apache AGE
   - Factory pattern: `GraphStoreFactory`
   - Gated behind Pro tier ($249/mo) on managed platform
   - Available in OSS for self-hosted

3. **History Database**: Audit trail
   - SQLite at `~/.mem0/history.db`
   - `SQLiteManager` class tracks all memory operations
   - Enables rollback and accountability

**Configuration-driven architecture:**
- `MemoryConfig` (Pydantic-validated) accepts provider strings
- Optional dependency groups: `pip install mem0ai[graph]`, `mem0ai[vector_stores]`
- Self-hosted can run fully offline with Ollama (LLM) + local Qdrant (vectors)

**Relevant to @chude/memory:** The SQLite history database pattern validates our approach. Mem0 already uses SQLite for audit/history -- we use it as the primary store. The factory pattern for swappable backends is over-engineered for our use case (we only target SQLite), but the principle of separating storage interface from implementation is sound hexagonal architecture.

### Zep/Graphiti: Graph Database Required

**Confidence: HIGH** (GitHub README + official docs)

Zep/Graphiti requires a graph database as its primary store:

- **Graph backends**: Neo4j 5.26, FalkorDB 1.1.2, Kuzu 0.11.2, Amazon Neptune
- **LLM backends**: OpenAI (default, required for structured output), Anthropic, Gemini, Groq
- **Vector search**: Handled within the graph DB (Neo4j vector indexes, FalkorDB vector search)
- **Episode storage**: Raw data stored as episodic nodes in the graph

The three-tier architecture:
1. **Episode subgraph**: Raw input data (non-lossy)
2. **Semantic entity subgraph**: Extracted and deduplicated concepts
3. **Community subgraph**: Clustered summaries of related entities

**Self-hosting status (critical finding):**
- Zep Community Edition: **deprecated** -- no self-hosted option
- Zep Cloud: managed only, credit-based pricing
- Graphiti: open-source, self-hostable, but requires Neo4j/FalkorDB/Kuzu + LLM API
- BYOC (Bring Your Own Cloud): enterprise option for Zep platform

**Relevant to @chude/memory:** Zep's architecture confirms that graph databases are necessary for proper temporal knowledge graphs but are excessive for developer-tool use cases. The tiered subgraph concept (raw episodes, extracted entities, community summaries) maps to a simpler SQLite schema: sessions table (raw), facts table (extracted), summaries table (consolidated).

---

## 4. Data vs Knowledge: How They Bridge the Gap

### Mem0's Approach: Extract-and-Compress

Mem0 treats the gap as a compression problem:

- **Data**: Raw conversation messages (26k tokens average)
- **Knowledge**: Extracted facts (7k tokens for flat facts, 14k for graph variant)
- **Compression ratio**: ~73% (flat) to ~46% (graph) token reduction
- **Quality tradeoff**: 91% latency reduction but accuracy drops on multi-hop reasoning (55 percentage points worse on some tasks)

The pipeline is: messages -> LLM extraction -> atomic facts -> embedding -> vector store. Facts are first-class citizens; raw messages are not retained after extraction (in the default pipeline).

### Zep's Approach: Preserve-and-Layer

Zep treats the gap as a layering problem:

- **Data**: Episodes (raw messages, JSON, documents) -- kept permanently
- **Knowledge**: Entities + relationships extracted from episodes
- **Meta-knowledge**: Community summaries clustering related entities

Episodes are never discarded. Knowledge is built on top of them. This means retrieval can pull from any layer depending on query needs -- raw data for exact recall, entities for relationship queries, communities for broad context.

### What This Means for @chude/memory v4.0

Our sessions are JSONL files -- they're already "episodes" in Zep's terminology. The v4.0 intelligence layer needs to build knowledge on top of this raw data without discarding it. The architecture should be:

1. **Layer 0 (existing)**: Raw session data in SQLite (messages, sessions, topics tables)
2. **Layer 1 (v4.0)**: Extracted facts/knowledge linked back to source sessions
3. **Layer 2 (future)**: Consolidated summaries/representations built from facts

This mirrors Zep's three-tier approach but implemented in flat SQLite tables with foreign keys instead of graph subgraphs.

---

## 5. SDK and CLI Surface Design

### Mem0 SDK

**Python:**
```python
from mem0 import Memory       # self-hosted
from mem0 import MemoryClient # cloud API

m = Memory()
m.add("User prefers dark mode", user_id="alice")
results = m.search("preferences", user_id="alice")
m.update(memory_id, "Updated preference")
m.delete(memory_id)
history = m.history(memory_id)
```

**CLI (npm package `@mem0/cli`):**
```bash
mem0 init
mem0 add "Prefers dark mode" --user-id alice
mem0 search "preferences" --user-id alice
```

**Design patterns worth noting:**
- Identical API for self-hosted and cloud (swap `Memory` for `MemoryClient`)
- Entity scoping via `user_id`, `agent_id`, `session_id`, `app_id` parameters
- `history()` method provides audit trail per memory
- Async variants: `AsyncMemory`, `AsyncMemoryClient`

### Zep SDK

Zep Cloud uses a REST API client. Graphiti (the OSS engine) is a Python library:

```python
from graphiti_core import Graphiti

g = Graphiti(neo4j_uri, neo4j_user, neo4j_password)
await g.add_episode(
    name="session-1",
    episode_body="User discussed migration from Redis to Valkey",
    source=EpisodeType.text,
    reference_time=datetime.now()
)
results = await g.search("caching strategy")
```

**Design patterns worth noting:**
- Episode-centric ingestion (add episodes, not memories)
- `reference_time` parameter enables temporal queries
- Search returns entities + relationships, not just text matches
- MCP server available for Claude Code / Cursor integration

### Patterns Applicable to @chude/memory

Our existing CLI already follows similar patterns (`memory search`, `memory context`, etc.). For v4.0, the key additions would be:

```bash
# New commands for knowledge layer
memory extract <session-id>       # Extract knowledge from a specific session
memory extract --all --since 7d   # Batch extraction
memory consolidate                # Background dedup + merge
memory facts <project>            # Show extracted facts for a project
memory facts --superseded         # Show historical/superseded facts

# Enhanced existing commands
memory context <project>          # Now returns synthesized context, not just recent sessions
memory search "query"             # Now searches facts + raw sessions
```

The `extract` command maps to Mem0's `add()` with `infer=True`. The `consolidate` command maps to Mem0's background consolidation. The `facts` command is new -- neither Mem0 nor Zep has a dedicated "show me what you know" command, but it's essential for developer trust.

---

## 6. Self-Hosted and Local-First Options

### Mem0 Self-Hosted

**Fully local deployment is possible but requires:**
- LLM: Ollama (local) or OpenAI API key
- Vector DB: Local Qdrant (default) or FAISS
- Graph DB: Kuzu (embedded, no server) or Neo4j
- History: SQLite at `~/.mem0/history.db` (always local)

**Minimum viable local setup:**
```
Ollama (LLM + embeddings) + local Qdrant + SQLite = fully offline
```

**Key limitation:** Extraction quality degrades significantly with smaller local models. Mem0's paper benchmarks use GPT-4o-mini; local models (llama, mistral) may not match the structured output quality needed for reliable ADD/UPDATE/DELETE/NOOP decisions.

### Zep Self-Hosted

**Not available as of April 2026.**
- Zep Community Edition: deprecated
- Zep Cloud: managed only
- Graphiti: open-source engine, self-hostable, but requires:
  - Neo4j 5.26, FalkorDB, or Kuzu
  - OpenAI API key (structured output required for reliable extraction)
  - Python 3.10+
- Running Graphiti locally means provisioning 3+ services

### Implications for @chude/memory

Our architecture is better positioned for local-first than either platform:
- **SQLite**: Already our primary store, no external DB needed
- **LLM calls**: Can use Claude API (user already has access for Claude Code), Ollama, or any provider
- **No vector DB needed initially**: FTS5 handles text search; sqlite-vec for embeddings in later phases
- **Single binary**: `memory` CLI is self-contained

The tradeoff is that we cannot replicate the graph-based reasoning of Zep or the multi-store parallel retrieval of Mem0. We should not try. Instead, optimize for what a local SQLite tool does well: fast full-text search, structured metadata queries, and LLM-assisted extraction that writes results back to SQLite.

---

## 7. Recent Changes (Early 2026)

### Mem0

- **v1.0.0 released** (major milestone): API modernization, async mode as default, expanded reranker support (Cohere, ZeroEntropy, HuggingFace, sentence transformers)
- **CLI v0.2.1** (April 2026): npm package `@mem0/cli` for terminal operations
- **Research paper published** (arxiv 2504.19413): Formal architecture description with LOCOMO benchmark results
- **Graph memory expanded**: Support for Kuzu (embedded graph DB) and Apache AGE (PostgreSQL extension)
- **OpenClaw integration**: Plugin ecosystem for IDE integration
- **MCP server**: Official `mem0-mcp` for AI assistant integration
- **Key claim**: 26% accuracy improvement over OpenAI's built-in memory, 91% faster, 90% fewer tokens

### Zep/Graphiti

- **Zep Community Edition deprecated**: No more self-hosted Zep platform
- **Graphiti expanded backends**: Added Kuzu and Amazon Neptune support
- **MCP server added**: Graphiti MCP for Claude Code / Cursor
- **Research paper** (arxiv 2501.13956): Formal description of temporal knowledge graph architecture
- **BYOC option**: Enterprise bring-your-own-cloud deployment
- **Performance claims**: 18.5% accuracy improvement, 90% latency reduction vs baselines

---

## 8. Patterns to Adopt vs Patterns to Skip

### Adopt for v4.0

| Pattern | Source | How to Adapt |
|---------|--------|--------------|
| LLM fact extraction from messages | Mem0 | Extract facts from session JSONL, store as rows in `facts` table |
| Four-operation model (ADD/UPDATE/DELETE/NOOP) | Mem0 | Use at extraction time to prevent duplicate facts |
| Dual-mode extraction (infer vs direct) | Mem0 | Full extraction for important sessions, raw storage for routine ones |
| Two-tier consolidation thresholds | Mem0 | Write-time: 0.92 similarity, background: 0.95 similarity |
| Temporal invalidation (supersede, don't delete) | Zep | `superseded_at` + `superseded_by` columns on facts table |
| Episode preservation (non-lossy) | Zep | Keep raw session data, build knowledge on top |
| Relevance decay (exp(-lambda * delta_t)) | Mem0 | Score older facts lower in search results |
| Asynchronous summary generation | Mem0 | `memory consolidate` as background command |

### Skip

| Pattern | Source | Why |
|---------|--------|-----|
| Graph database storage | Both | Overkill for single-developer tool; SQLite + foreign keys suffice |
| Multi-store parallel retrieval | Mem0 | We have one store (SQLite); optimize within it |
| Entity-relationship triplets | Zep | Natural language facts are simpler and sufficient for our use case |
| Community detection / label propagation | Zep | Requires graph infrastructure we don't have |
| Multi-user scoping (user_id, agent_id) | Mem0 | Single-user tool; project-level scoping is our equivalent |
| Real-time extraction (per-message) | Both | We extract retrospectively from completed sessions |
| Factory pattern for storage backends | Mem0 | We target only SQLite; indirection adds complexity without benefit |

---

## 9. Proposed v4.0 Schema Additions

Based on research, the knowledge layer needs these SQLite structures:

```sql
-- Extracted facts from sessions
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    content TEXT NOT NULL,           -- Natural language fact
    source_session_id TEXT NOT NULL, -- Links to session that produced this fact
    source_message_ids TEXT,         -- JSON array of specific message IDs
    confidence REAL DEFAULT 1.0,     -- Extraction confidence
    observed_at TEXT NOT NULL,       -- When the fact was first observed
    superseded_at TEXT,              -- When the fact was invalidated (null = current)
    superseded_by TEXT,              -- ID of fact that replaced this one
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_session_id) REFERENCES sessions(id)
);

-- FTS5 index for fact search
CREATE VIRTUAL TABLE facts_fts USING fts5(
    content,
    project,
    content=facts,
    content_rowid=rowid
);

-- Extraction metadata (audit trail, like Mem0's history.db)
CREATE TABLE extraction_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    mode TEXT NOT NULL,              -- 'infer' or 'direct'
    facts_added INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    facts_superseded INTEGER DEFAULT 0,
    facts_skipped INTEGER DEFAULT 0,
    llm_provider TEXT,
    llm_model TEXT,
    tokens_used INTEGER,
    extracted_at TEXT NOT NULL
);

-- Consolidated summaries (future, post-embedding)
CREATE TABLE summaries (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    scope TEXT NOT NULL,             -- 'project', 'topic', 'session-group'
    content TEXT NOT NULL,
    fact_ids TEXT,                   -- JSON array of source fact IDs
    created_at TEXT NOT NULL,
    refreshed_at TEXT               -- When summary was last regenerated
);
```

---

## 10. Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Mem0 Architecture | HIGH | Arxiv paper (2504.19413) + DeepWiki source analysis + official docs |
| Zep/Graphiti Architecture | HIGH | Arxiv paper (2501.13956) + GitHub README + official blog |
| Extraction Pipeline Details | HIGH | Formal descriptions with specific parameters in both papers |
| Consolidation Thresholds | MEDIUM | Mem0 paper gives ranges (0.85-0.95), exact production values may differ |
| Self-Hosted Feasibility | HIGH | Tested against multiple sources; Zep deprecation confirmed on GitHub |
| SDK/CLI Surface | HIGH | Official docs + npm registry + PyPI |
| Applicability to @chude/memory | HIGH | Clear architectural differences make adaptation straightforward |
| Local LLM Quality for Extraction | LOW | No benchmarks found for extraction quality with Ollama/local models |

---

## 11. Open Questions

1. **Local LLM extraction quality**: Can Ollama models reliably produce ADD/UPDATE/DELETE/NOOP decisions? Mem0 benchmarks use GPT-4o-mini. This needs empirical testing during v4.0 implementation.

2. **Extraction cost model**: At developer scale (10-50 sessions/week), what's the Claude API cost for full fact extraction? Mem0 reports ~5-10 facts per conversation turn with 2 LLM calls each.

3. **sqlite-vec vs embedding alternatives**: Mem0 uses Qdrant/FAISS for embeddings. sqlite-vec is the planned approach for @chude/memory but its maturity for production similarity search needs validation (addressed in existing SEMANTIC-SEARCH.md research).

4. **Retroactive extraction challenges**: Both Mem0 and Zep assume real-time extraction during conversations. @chude/memory extracts retrospectively from completed JSONL files. The extraction prompts need adaptation -- we have full conversation context available, which is actually an advantage (no rolling window limitation).

5. **Consolidation frequency**: How often should `memory consolidate` run? Mem0 refreshes summaries every 50-100 turns. For @chude/memory, running after each `memory sync` batch may be more appropriate.

---

## Sources

### Primary (HIGH confidence)
- [Mem0 arxiv paper: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413)
- [Zep arxiv paper: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956)
- [Mem0 GitHub repository (51.8k stars)](https://github.com/mem0ai/mem0)
- [Graphiti GitHub repository (24.4k stars)](https://github.com/getzep/graphiti)
- [Mem0 official documentation](https://docs.mem0.ai/)
- [Mem0 DeepWiki architecture analysis](https://deepwiki.com/mem0ai/mem0)
- [Mem0 DeepWiki graph memory analysis](https://deepwiki.com/mem0ai/mem0/4-graph-memory)

### Secondary (MEDIUM confidence)
- [Vectorize.io: Best AI Agent Memory Systems comparison](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [Mem0 Graph Memory documentation](https://docs.mem0.ai/open-source/features/graph-memory)
- [Zep Graphiti official blog post](https://blog.getzep.com/zep-a-temporal-knowledge-graph-architecture-for-agent-memory/)
- [Emergent Mind: Mem0 Scalable Memory Architecture](https://www.emergentmind.com/topics/mem0-system)
- [Serenities AI: Memory system comparison 2026](https://serenitiesai.com/articles/ai-agent-memory-why-2026-is-the-year-of-persistent-context)

### Tertiary (contextual, not primary evidence)
- [OMEGA vs Mem0 vs Zep comparison](https://omegamax.co/blog/omega-vs-mem0-vs-zep)
- [Dev.to: Top 6 AI Agent Memory Frameworks 2026](https://dev.to/nebulagg/top-6-ai-agent-memory-frameworks-for-devs-2026-1fef)
- [Vectorize.io: Zep alternatives](https://vectorize.io/articles/zep-alternatives)
