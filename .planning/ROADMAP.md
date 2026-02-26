# Roadmap: @chude/memory (memory-nexus)

## Milestones

- SHIPPED **v1.0 Full Vision Implementation** -- Phases 1-12 (shipped 2026-02-16) -- [Archive](milestones/v1.0-ROADMAP.md)
- ACTIVE **v2.0 Hybrid Search and Rebrand** -- Phases 13-18

## Phases

<details>
<summary>SHIPPED v1.0 Full Vision Implementation (Phases 1-12) -- SHIPPED 2026-02-16</summary>

- [x] Phase 1: Project Setup and Domain Entities (2/2 plans)
- [x] Phase 2: Database Schema and Ports (4/4 plans)
- [x] Phase 3: JSONL Parsing and Extraction (4/4 plans)
- [x] Phase 4: Storage Adapters (4/4 plans)
- [x] Phase 5: Basic Sync Command (4/4 plans)
- [x] Phase 6: Search Command with FTS5 (3/3 plans)
- [x] Phase 7: Filtering and Output Formatting (6/6 plans)
- [x] Phase 8: Stats and List Commands (4/4 plans)
- [x] Phase 9: Context and Related Commands (4/4 plans)
- [x] Phase 10: Hook Integration (4/4 plans)
- [x] Phase 11: Session Navigation (5/5 plans)
- [x] Phase 12: Polish, Error Handling, Edge Cases (12/12 plans)

</details>

### v2.0 Hybrid Search and Rebrand (Phases 13-18)

**Overview:** Rename the package from `memory-nexus` to `@chude/memory`, add hybrid search combining vector similarity (sqlite-vec) with BM25 (FTS5) using Reciprocal Rank Fusion, implement a pluggable embedding provider architecture with local-first defaults, and stabilize the programmatic API for aidev integration.

**Depth:** Standard (6 phases)
**Total v2.0 Requirements:** 35 phase-mapped + 4 cross-cutting (QUAL) = 39

---

### Phase 13: Package Rename

**Goal:** Users install and run `@chude/memory` with the `memory` binary; the old `memory-nexus` name is deprecated and redirects to the new package.

**Depends on:** None (no v2 dependencies; builds on shipped v1.0)
**Plans:** 3 plans

Plans:
- [x] 13-01-PLAN.md -- Centralized XDG paths module and legacy migration with rollback
- [x] 13-02-PLAN.md -- Rename all internal identifiers and user-facing strings
- [x] 13-03-PLAN.md -- Deprecation stub, migration docs, CLAUDE.md updates

Requirements: RENAME-01, RENAME-02, RENAME-03, RENAME-04, RENAME-05

Success Criteria:
1. `bun add -g @chude/memory` installs the tool and the `memory` binary is available in PATH
2. All user-facing paths (`~/.config/memory/`, `~/.local/share/memory/`, log directories) use the new name, with automatic migration of existing data from `memory-nexus` paths
3. Existing hook scripts reference the `memory` binary and continue to trigger background sync
4. `bun add memory-nexus` installs a deprecation stub that prints a message directing users to `@chude/memory`
5. All existing tests pass with the renamed package (no behavioral regression)

---

### Phase 14: Embedding Infrastructure

**Goal:** The application can generate vector embeddings from text using a pluggable provider architecture, store them in sqlite-vec alongside existing FTS5 data, and lazy-load the ONNX runtime only when semantic search is invoked.

**Depends on:** Phase 13 (new package name determines config paths like `~/.config/memory/config.json`)
**Estimated Plans:** 4-5

Requirements: EMBED-01, EMBED-02, EMBED-03, EMBED-04, EMBED-05, EMBED-06, EMBED-07

Success Criteria:
1. `IEmbeddingProvider` port exists in domain layer with zero external dependencies; at least `TransformersJsProvider` implements it
2. `memory doctor` reports sqlite-vec extension loaded successfully and `message_embeddings` virtual table exists
3. Running `memory search "test"` (FTS5-only, no embeddings generated yet) does NOT load the ONNX runtime or download any model
4. On first semantic search invocation, user sees a progress indicator for model download (23 MB one-time) and the model is cached for subsequent runs
5. If onnxruntime-node fails to initialize, the system falls back to WASM backend with a warning and embedding still succeeds

---

### Phase 15: Embedding Pipeline

**Goal:** The sync workflow can generate embeddings for extracted messages, track embedding state per message, and process embeddings in the background without blocking the sync completion.

**Depends on:** Phase 14 (needs embedding providers, sqlite-vec schema, and provider factory)
**Estimated Plans:** 3-4

Requirements: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05

Success Criteria:
1. `memory sync --embed` extracts sessions AND generates embeddings for new messages, with a progress bar showing embedding progress
2. Running `memory sync --embed` a second time skips already-embedded messages (incremental embedding via `embedding_state` tracking)
3. Changing the configured embedding model triggers full re-embedding on next `memory sync --embed`, with a confirmation prompt before proceeding
4. `memory sync` (without `--embed`) completes immediately at the same speed as v1.0; embedding is opt-in, not default
5. Background embedding (`memory sync --embed --background`) returns control to the user immediately while embeddings generate asynchronously

---

### Phase 16: Hybrid Search and Graceful Degradation

**Goal:** Users can search sessions using keyword, semantic, or hybrid mode; the system automatically falls back to FTS5-only when embeddings are unavailable, so search always works regardless of embedding state.

**Depends on:** Phase 15 (needs embedded messages to search against)
**Estimated Plans:** 4-5

Requirements: HSRCH-01, HSRCH-02, HSRCH-03, HSRCH-04, HSRCH-05, HSRCH-06, DEGRADE-01, DEGRADE-02, DEGRADE-03, DEGRADE-04

Success Criteria:
1. `memory search "authentication patterns" --mode hybrid` returns results ranked by Reciprocal Rank Fusion combining BM25 and vector similarity scores
2. `memory search "authentication patterns"` (no explicit mode) uses hybrid when embeddings exist for the database, and silently falls back to FTS5-only when no embeddings are present
3. `memory search "auth" --mode vector` returns semantically similar messages even when the exact word "auth" does not appear in the result text
4. `memory search "query" --no-vector` forces FTS5-only search regardless of embedding availability
5. When only a subset of messages have embeddings, hybrid search uses vector results for embedded messages and FTS5 results for unembedded ones, merging via RRF

---

### Phase 17: Provider Ecosystem

**Goal:** Users can configure alternative embedding providers (OpenAI API, local Ollama server) beyond the default local Transformers.js model, with automatic re-embedding when the provider or model changes.

**Depends on:** Phase 14 (needs `IEmbeddingProvider` port defined)
**Can run in parallel with:** Phases 15-16 (only needs the port, not the pipeline or search)
**Estimated Plans:** 2-3

Requirements: PROV-01, PROV-02, PROV-03, PROV-04

Success Criteria:
1. Setting `"provider": "openai"` with a valid API key in `~/.config/memory/config.json` causes embedding generation to use OpenAI's text-embedding-3-small model
2. Setting `"provider": "ollama"` with a running Ollama server causes embedding generation to use the configured Ollama model
3. `memory doctor` reports the configured provider name, model, and readiness status (API key set, server reachable, etc.)
4. Changing from one provider/model to another is detected on next `memory sync --embed` and triggers a re-embedding confirmation prompt before proceeding

---

### Phase 18: API Stabilization and aidev Integration Readiness

**Goal:** The programmatic API surface is stable, typed, tested for library consumption, and documented so that aidev can depend on `@chude/memory` and expose it via `aidev memory` without surprises.

**Depends on:** Phase 16 (needs working hybrid search to expose in the API)
**Estimated Plans:** 2-3

Requirements: INTEG-01, INTEG-02, INTEG-03, INTEG-04

Success Criteria:
1. A consuming package can `import { executeSyncCommand, executeSearchCommand } from "@chude/memory"` and call them programmatically with typed options, receiving typed return values (not just exit codes)
2. Installing `@chude/memory` as an npm dependency (not globally) and calling execute functions from a test script produces correct results against a test database
3. Integration test suite exercises all public `execute*Command` functions with various option combinations and asserts on return value structure
4. API surface is documented with JSDoc and a concise API reference in the package README, listing every exported function, its parameters, and return type

---

### Cross-Cutting: Quality (All Phases)

Requirements: QUAL-01, QUAL-02, QUAL-03, QUAL-04

These are enforced in every phase, not assigned to a single phase:
- 95%+ coverage at EACH metric for all new code
- Domain layer maintains zero external dependencies
- All new infrastructure adapters follow existing port/adapter patterns
- TDD workflow (RED-GREEN-REFACTOR) for all new features

---

## Dependency Graph

```
Phase 13 (Package Rename)
    |
    +---> Phase 14 (Embedding Infrastructure)
              |
              +---> Phase 15 (Embedding Pipeline)
              |         |
              |         +---> Phase 16 (Hybrid Search + Degradation)
              |                   |
              |                   +---> Phase 18 (API Stabilization)
              |
              +---> Phase 17 (Provider Ecosystem)
                    [parallel with Phases 15-16]
```

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-12 | v1.0 | 56 | Complete | 2026-02-06 |
| 13 | v2.0 | 3/3 | Complete | 2026-02-25 |
| 14 | v2.0 | 1/4 | In Progress | -- |
| 15 | v2.0 | -- | Pending | -- |
| 16 | v2.0 | -- | Pending | -- |
| 17 | v2.0 | -- | Pending | -- |
| 18 | v2.0 | -- | Pending | -- |

---

*Last updated: 2026-02-26 (Phase 14-01 complete)*
