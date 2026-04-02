# Honcho Architecture Analysis

**Domain:** AI agent memory / reasoning-driven context
**Researched:** 2026-04-02

## Honcho's Architecture

### System Overview

```
                        API Clients (Python SDK, TS SDK)
                                    |
                                    v
                         +-------------------+
                         |   FastAPI Server   |
                         |   (REST API)       |
                         +-------------------+
                            |           |
                   +--------+           +--------+
                   v                             v
          +-----------------+          +-----------------+
          | Storage Layer   |          | Reasoning Layer |
          |                 |          |                 |
          | - Workspaces    |          | - Deriver Agent |
          | - Peers         |          | - Dialectic     |
          | - Sessions      |          | - Dreamer Agent |
          | - Messages      |          |                 |
          | - Collections   |          | Uses LLM APIs:  |
          | - Documents     |          | - Anthropic     |
          +-----------------+          | - Gemini        |
                   |                   | - Groq          |
                   v                   | - OpenAI        |
          +-----------------+          +-----------------+
          | PostgreSQL      |                   |
          | + pgvector      |<------------------+
          | + pg_trgm       |   (reads/writes observations)
          +-----------------+
```

### Data Model

```
Workspace (top-level isolation)
  |
  +-- Peers (entities: users, agents, groups)
  |     |
  |     +-- PeerCard (biographical facts, updated by Deriver/Dreamer)
  |     +-- Collections (vector document groups, internal)
  |     |     +-- Documents (embedded observations, searchable)
  |     +-- Conclusions (derived facts with session attribution)
  |
  +-- Sessions (interaction threads, many-to-many with Peers)
        |
        +-- Messages (content + peer attribution + token count)
        +-- SessionPeerConfig (observe_others, observe_me flags)
```

**Key Design Decisions:**
- Text IDs (nanoid format) as primary keys, not UUIDs or integers
- Composite foreign keys for multi-tenant relationships
- JSONB metadata fields on all entities for extensibility
- HNSW indexes for vector similarity search
- Feature flags at workspace, peer, and session levels

### Three-Agent Reasoning Pipeline

**1. Deriver Agent (Ingestion)**

```
New Message → Queue → Deriver Agent
                         |
                         +-- Extract explicit observations (stated facts)
                         +-- Generate deductive observations (inferences)
                         +-- Update peer card (biographical summary)
                         +-- Store as vector-embedded documents
                         |
                         v
                   Observation Store (PostgreSQL + pgvector)
```

- Triggered: automatically when messages are created via API
- Processing: session-based queue ensures message ordering
- Tools: create_observations, update_peer_card, search existing memory
- Output: embedded observations in vector collections
- Critical rule: "Never hold a DB session during external calls" (LLM/embedding/HTTP)

**2. Dialectic Agent (Query)**

```
peer.chat(query) → Dialectic Agent
                       |
                       +-- search_memory (vector search over observations)
                       +-- get_recent_observations
                       +-- get_recent_history
                       +-- (may create new deductive observations)
                       |
                       v
                  Natural language answer grounded in facts
```

- Triggered: API call to `/peers/{peer_id}/chat` with `agentic=true`
- Approach: agentic loop with tool calling (not fixed retrieval path)
- Supports: streaming, reasoning levels (minimal/low/medium/high/max)
- Key insight: "Retrieval methods turned into tools, handed to agent loop"

**3. Dreamer Agent (Consolidation)**

```
Schedule/Trigger → Dreamer Agent
                       |
                       +-- Random walk from recent/high-value observations
                       +-- Search for related content
                       +-- Consolidate redundancies
                       +-- Delete obsolete data
                       +-- Generate deductive/inductive/abductive conclusions
                       |
                       v
                  Improved observation store + updated peer cards
```

- Triggered: scheduled or explicit dream task via queue
- Strategy: random-walk exploration (not exhaustive scan)
- Tools: create/delete observations, update peer cards, search memory
- Output: consolidated observations, cleaned redundancies

### Context Assembly

The `context()` API method returns a structured package:

```python
# Session context
session.context(tokens=3000)
# Returns: SessionContext {
#   messages: [...],        # Recent conversation
#   summary: {...},         # Session summary
#   peer_representation: str,  # Reasoned peer model
#   peer_card: [str, ...],     # Biographical facts
# }

# Peer context (cross-session)
peer.context(target="other_peer")
# Returns: PeerContext {
#   representation: str,    # Working representation
#   peer_card: [str, ...],  # Biographical facts
# }
```

Token budget is configurable -- "Get the 10K tokens you need, not the 100K you don't."

## Patterns Applicable to @chude/memory

### Pattern 1: Consolidation Command (Dreamer Adaptation)

**What:** Periodic background summarization of raw session data into higher-level artifacts
**When:** After sync, on explicit command, or on schedule
**Adaptation:**

```bash
# Equivalent to Honcho's Dreaming
memory consolidate [--project <name>]

# Internally:
# 1. Select recent unprocessed sessions
# 2. Cluster related sessions by topic/project
# 3. Generate summaries per cluster
# 4. Extract decisions, patterns, conventions
# 5. Store as consolidated entries in SQLite
# 6. Mark source sessions as processed
```

Simpler than Honcho's random-walk: process chronologically, cluster by project, summarize in batches. No need for the agentic loop -- a single LLM call per batch suffices.

### Pattern 2: Synthesized Context (Representation Adaptation)

**What:** Pre-computed context packages instead of raw search results
**When:** `memory context <project>` is called
**Adaptation:**

```bash
# Current: returns recent sessions + topics
memory context wow-system

# Enhanced: returns reasoned summary
# Internally:
# 1. Retrieve consolidated summaries for project
# 2. Retrieve recent (unconsolidated) sessions
# 3. Combine into structured context package:
#    - Project summary (from consolidation)
#    - Recent activity (last N sessions)
#    - Key decisions (extracted during consolidation)
#    - Active patterns/conventions
```

### Pattern 3: Hybrid Search (Already Planned)

**What:** BM25 keyword search + vector semantic search combined
**When:** Any search query
**Adaptation:**

Already in the roadmap (Phases 14-16). Honcho validates this approach. Implementation:
- FTS5 for keyword matching (existing)
- sqlite-vec for semantic similarity (planned)
- Reciprocal rank fusion to merge results (standard technique)

### Anti-Pattern: Per-Message LLM Processing

**What Honcho does:** Every message triggers Deriver agent processing
**Why bad for @chude/memory:** Session data is historical and batch-oriented. Processing 1000s of messages individually through LLM is expensive and slow.
**Instead:** Batch processing during consolidation. One LLM call per session or session-cluster, not per message.

### Anti-Pattern: Multi-Service Architecture

**What Honcho does:** FastAPI server + PostgreSQL + background worker(s) + Redis
**Why bad for @chude/memory:** Completely contradicts local-first, zero-infrastructure design
**Instead:** Single binary, single SQLite file, optional consolidation command

## Architecture Comparison Matrix

| Concern | Honcho | @chude/memory | Winner (for dev-tool context) |
|---------|--------|---------------|-------------------------------|
| Setup complexity | PostgreSQL + pgvector + FastAPI + workers + LLM keys | `bun add -g @chude/memory` | @chude/memory |
| Data ownership | Cloud or self-hosted server | Local SQLite file | @chude/memory |
| Reasoning depth | Three-agent pipeline | Raw retrieval (planned: consolidation) | Honcho |
| Token efficiency | 11% mean (benchmark) | N/A (returns full results) | Honcho |
| Offline capability | Requires LLM APIs | Fully offline (search/sync) | @chude/memory |
| Multi-user | Native (Workspace/Peer model) | Single-user | Honcho |
| Scalability | Millions of users | One developer's sessions | Honcho |
| Maintenance | Ops overhead (DB, workers, LLMs) | Zero maintenance | @chude/memory |
| Cost | $2/M tokens + infrastructure | Free (optional LLM for consolidation) | @chude/memory |

## Sources

- [Honcho GitHub](https://github.com/plastic-labs/honcho)
- [Honcho CLAUDE.md](https://github.com/plastic-labs/honcho/blob/main/CLAUDE.md)
- [Honcho Documentation](https://docs.honcho.dev/)
- [Honcho 3 Announcement](https://blog.plasticlabs.ai/blog/Honcho-3)
- [Benchmarking Honcho](https://blog.plasticlabs.ai/research/Benchmarking-Honcho)
- [Honcho Self-Hosting](https://docs.honcho.dev/v3/contributing/self-hosting)
