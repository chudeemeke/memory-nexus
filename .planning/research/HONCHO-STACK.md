# Honcho Technology Stack

**Project:** Honcho (plastic-labs/honcho)
**Researched:** 2026-04-02
**Version:** 3.0.3 (459 commits, 1.5k GitHub stars)

## Honcho's Stack

### Core Application

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| Python | >=3.9 | Primary language | FastAPI backend |
| FastAPI | - | HTTP API server | Async-capable, OpenAPI docs |
| PostgreSQL | - | Primary database | With pgvector and pg_trgm extensions |
| pgvector | - | Vector similarity search | HNSW indexes for embeddings |
| Alembic | - | Database migrations | SQLAlchemy-based |
| UV | >=0.4.9 | Package manager | Replaces pip/poetry |

### LLM Providers (Required for Reasoning Features)

| Provider | Usage | Notes |
|----------|-------|-------|
| Anthropic (Claude) | Dialectic reasoning | Primary reasoning model |
| Google Gemini | Deriver/summary generation | Background processing |
| Groq | Query generation | Fast inference for search queries |
| OpenAI | Embeddings (optional) | text-embedding model |

### SDKs

| Language | Package | Registry |
|----------|---------|----------|
| Python | honcho-ai | PyPI |
| TypeScript | @honcho-ai/sdk | npm |

### Development Tools

| Tool | Purpose |
|------|---------|
| Docker + docker-compose | Local development and deployment |
| ruff | Python linting/formatting |
| biome | TypeScript linting/formatting |
| basedpyright | Python type checking |
| pytest | Testing |
| Redis | Caching (optional) |

### Deployment

| Target | Method |
|--------|--------|
| Cloud (managed) | app.honcho.dev |
| Self-hosted | Docker Compose or manual |
| Fly.io | Supported via fly.toml |

## Comparison: Honcho Stack vs @chude/memory Stack

| Concern | Honcho | @chude/memory | Notes |
|---------|--------|---------------|-------|
| Language | Python | TypeScript | Different ecosystems |
| Database | PostgreSQL + pgvector | SQLite + FTS5 | Server vs embedded |
| Search | pgvector (vector) + pg_trgm (trigram) | FTS5 (BM25) + planned sqlite-vec | Both heading toward hybrid |
| API | FastAPI REST server | CLI tool (Commander.js) | Server vs local binary |
| Embeddings | OpenAI API | Planned (Phase 14-16) | Cloud vs TBD |
| Reasoning | Multi-LLM pipeline (Claude + Gemini + Groq) | None (raw retrieval) | Biggest capability gap |
| Deployment | PostgreSQL + FastAPI + Workers | Single binary + SQLite file | Orders of magnitude simpler |
| Dependencies | ~20+ Python packages + 3-4 LLM APIs | ~5 npm packages, zero APIs | @chude/memory wins on simplicity |
| Infrastructure | PostgreSQL server + background workers | Zero infrastructure | @chude/memory wins on portability |

## What This Means for v4.0

Honcho's stack validates certain technology choices while highlighting gaps:

**Validated by Honcho:**
- Vector search (pgvector/sqlite-vec) is essential for semantic memory
- Hybrid search (keyword + vector) outperforms either alone
- Background processing for memory consolidation is a proven pattern

**Gaps in @chude/memory:**
- No reasoning layer -- raw retrieval only
- No embedding pipeline yet (planned Phases 14-16)
- No consolidation/summarization of historical data
- No synthesized context (returns search results, not reasoned summaries)

**Stack recommendations for v4.0 features:**
- sqlite-vec for vector search (already planned, Honcho validates the approach)
- Local embedding model (Ollama or similar) to avoid API costs
- Optional Claude API integration for reasoning/consolidation (not required)
- Background consolidation job (equivalent to Honcho's Dreamer, simpler implementation)

## Sources

- [Honcho GitHub Repository](https://github.com/plastic-labs/honcho)
- [Honcho CLAUDE.md](https://github.com/plastic-labs/honcho/blob/main/CLAUDE.md)
- [Honcho Documentation](https://docs.honcho.dev/)
- [Honcho SDK Reference](https://docs.honcho.dev/v3/documentation/reference/sdk)
- [Announcing Honcho 3](https://blog.plasticlabs.ai/blog/Honcho-3)
