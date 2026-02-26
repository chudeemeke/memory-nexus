# Requirements: @chude/memory v2.0

**Defined:** 2026-02-18
**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## v2.0 Requirements

Requirements for v2.0: Hybrid Search, Package Rename, and API Stabilization.

### Package Rename

- [x] **RENAME-01**: Rename npm package from `memory-nexus` to `@chude/memory`
- [x] **RENAME-02**: Change CLI binary name from `memory-nexus` to `memory` in package.json bin field
- [x] **RENAME-03**: Update all internal references (config paths, database location, log directories, hook scripts) from `memory-nexus` to `memory`
- [x] **RENAME-04**: Deprecate `memory-nexus` npm package with pointer to `@chude/memory`
- [x] **RENAME-05**: Update CLAUDE.md, WoW rules, and hook configurations to reference `memory` binary

### Embedding Infrastructure

- [x] **EMBED-01**: Define `IEmbeddingProvider` port in domain layer with embed, embedBatch, isReady, initialize, dispose methods
- [x] **EMBED-02**: Implement `TransformersJsProvider` adapter using @huggingface/transformers v3 with all-MiniLM-L6-v2 default model (384 dimensions)
- [x] **EMBED-03**: Load sqlite-vec extension alongside existing FTS5 extension in database initialization
- [x] **EMBED-04**: Create `message_embeddings` virtual table (vec0, float[384]) and `embedding_state` tracking table via schema migration
- [x] **EMBED-05**: Implement `EmbeddingProviderFactory` with config-driven provider selection and lazy loading (ONNX runtime loads only when semantic search invoked)
- [x] **EMBED-06**: First-run model download with progress indicator ("Downloading embedding model (23 MB, one-time setup)...")
- [x] **EMBED-07**: WASM fallback when onnxruntime-node initialization fails, with user warning

### Embedding Pipeline

- [x] **PIPE-01**: Integrate embedding generation into sync pipeline (embed messages after extraction) with `--embed` flag
- [x] **PIPE-02**: Implement embedding cache with model_hash tracking; model change triggers full re-embedding
- [x] **PIPE-03**: Batch embedding with configurable batch size and progress reporting
- [x] **PIPE-04**: Background embedding: sync completes immediately, embeddings generate asynchronously
- [x] **PIPE-05**: Track embedding state per message (message_id, embedded_at, model_hash) for incremental embedding

### Hybrid Search

- [ ] **HSRCH-01**: Implement vector KNN query via sqlite-vec MATCH operator with configurable result limit
- [ ] **HSRCH-02**: Implement Reciprocal Rank Fusion (RRF) combining FTS5 BM25 ranks with vector similarity ranks (k=60)
- [ ] **HSRCH-03**: Extend search command with `--mode fts|vector|hybrid` flag (default: hybrid when embeddings available, fts when not)
- [ ] **HSRCH-04**: Candidate multiplier: fetch 4x candidates from each ranker before fusion
- [ ] **HSRCH-05**: Minimum score threshold to filter noise from hybrid results
- [ ] **HSRCH-06**: Embed query at search time via configured provider (sub-second for local model after first load)

### Graceful Degradation

- [ ] **DEGRADE-01**: Fall back to FTS5-only when embedding model not downloaded
- [ ] **DEGRADE-02**: Fall back to FTS5-only when sqlite-vec extension unavailable
- [ ] **DEGRADE-03**: Use FTS5 for unembedded messages, hybrid for embedded ones (partial coverage)
- [ ] **DEGRADE-04**: `--no-vector` flag to explicitly disable semantic search

### Provider Ecosystem

- [ ] **PROV-01**: Implement OpenAI embedding provider adapter (text-embedding-3-small)
- [ ] **PROV-02**: Implement Ollama embedding provider adapter (local server)
- [ ] **PROV-03**: Provider configuration via `~/.config/memory/config.json` (provider, model, dimensions, apiKey, batchSize)
- [ ] **PROV-04**: Model change detection: when configured model differs from embedded model_hash, trigger re-embedding with user confirmation

### aidev Integration

- [ ] **INTEG-01**: Export stable programmatic API surface (execute*Command functions with typed options and return values)
- [ ] **INTEG-02**: Verify memory-nexus works correctly when installed as npm dependency (not just standalone)
- [ ] **INTEG-03**: Add integration tests calling execute*Command functions programmatically
- [ ] **INTEG-04**: Document API surface for aidev MemoryCommand consumption

### Quality

- [ ] **QUAL-01**: 95%+ coverage at EACH metric (functions, lines) for all new code
- [ ] **QUAL-02**: Domain layer maintains zero external dependencies
- [ ] **QUAL-03**: All new infrastructure adapters follow existing port/adapter patterns
- [ ] **QUAL-04**: TDD workflow for all new features

## v3.0 Considerations

Deferred. Tracked for context, not in current roadmap.

### aidev-Side Integration

- **AIDEV-01**: Create MemoryCommand in aidev's TS CLI (`cli/src/presentation/commands/memory/`)
- **AIDEV-02**: Wire `cmd_memory()` in bash dispatcher to delegate to TS CLI
- **AIDEV-03**: Register memory commands in aidev's help and command registry

### Optimization

- **OPT-01**: Binary quantization option for large databases (32x storage reduction)
- **OPT-02**: Matryoshka dimension reduction for nomic-embed-text-v1.5
- **OPT-03**: Transformers.js v4 migration when stable (4x embedding speedup)

### aidev Migration Foundation

- **MIGRATE-01**: Establish bash-to-TS-CLI delegation pattern in aidev
- **MIGRATE-02**: Migrate release command from bash to TS CLI
- **MIGRATE-03**: Migrate publish command from bash to TS CLI

## Out of Scope

| Feature | Reason |
|---------|--------|
| ANN indexing (HNSW) | Brute-force is <75ms at 200K messages; unnecessary at current scale |
| Dedicated code embedding models | Too large (1.5B+ params); hybrid search compensates with BM25 for exact code matches |
| Transformers.js v4 | Preview only, no stable release; will migrate when stable |
| Cross-machine embedding sync | Embeddings are derived data, regenerated locally from session text |
| aidev bash dispatcher changes | v2.0 focuses on memory-nexus side; aidev-side wiring is v3.0 |
| Full aidev TS migration | Incremental approach; memory is first feature, broader migration is separate milestones |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RENAME-01 | Phase 13 | Complete |
| RENAME-02 | Phase 13 | Complete |
| RENAME-03 | Phase 13 | Complete |
| RENAME-04 | Phase 13 | Complete |
| RENAME-05 | Phase 13 | Complete |
| EMBED-01 | Phase 14 | Complete |
| EMBED-02 | Phase 14 | Complete |
| EMBED-03 | Phase 14 | Complete |
| EMBED-04 | Phase 14 | Complete |
| EMBED-05 | Phase 14 | Complete |
| EMBED-06 | Phase 14 | Complete |
| EMBED-07 | Phase 14 | Complete |
| PIPE-01 | Phase 15 | Complete |
| PIPE-02 | Phase 15 | Complete |
| PIPE-03 | Phase 15 | Complete |
| PIPE-04 | Phase 15 | Complete |
| PIPE-05 | Phase 15 | Complete |
| HSRCH-01 | Phase 16 | Pending |
| HSRCH-02 | Phase 16 | Pending |
| HSRCH-03 | Phase 16 | Pending |
| HSRCH-04 | Phase 16 | Pending |
| HSRCH-05 | Phase 16 | Pending |
| HSRCH-06 | Phase 16 | Pending |
| DEGRADE-01 | Phase 16 | Pending |
| DEGRADE-02 | Phase 16 | Pending |
| DEGRADE-03 | Phase 16 | Pending |
| DEGRADE-04 | Phase 16 | Pending |
| PROV-01 | Phase 17 | Pending |
| PROV-02 | Phase 17 | Pending |
| PROV-03 | Phase 17 | Pending |
| PROV-04 | Phase 17 | Pending |
| INTEG-01 | Phase 18 | Pending |
| INTEG-02 | Phase 18 | Pending |
| INTEG-03 | Phase 18 | Pending |
| INTEG-04 | Phase 18 | Pending |
| QUAL-01 | All | Pending |
| QUAL-02 | All | Pending |
| QUAL-03 | All | Pending |
| QUAL-04 | All | Pending |

**Coverage:**
- v2.0 requirements: 35 total (excluding QUAL cross-cutting)
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-26 (PIPE-04 complete, Phase 15 all PIPE requirements done)*
