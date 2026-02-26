# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v2.0 Hybrid Search and Rebrand -- package rename, embedding infrastructure, hybrid search, API stabilization.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node

## Current Position

**Milestone:** v2.0 Hybrid Search and Rebrand
**Phase:** 15 (Embedding Pipeline) -- COMPLETE (3/3 plans done)
**Status:** Active -- ready for Phase 16

```
v2.0 Progress: [##########..........] 4/6 phases
  Phase 13: Package Rename          [x] Complete (3/3 plans)
  Phase 14: Embedding Infrastructure [x] Complete (4/4 plans)
  Phase 15: Embedding Pipeline       [x] Complete (3/3 plans)
  Phase 16: Hybrid Search            [ ] Pending
  Phase 17: Provider Ecosystem       [ ] Pending
  Phase 18: API Stabilization        [ ] Pending
```

## Performance Metrics

**v1.0 (shipped):**
- 12 phases, 56 plans, 85 requirements
- ~1,966 tests, 95.67% line coverage, 94.49% function coverage
- 85.46% mutation score (domain layer)
- 49,764 LOC (17,073 source + 32,691 tests)

**v2.0 (target):**
- 6 phases, ~17-23 estimated plans, 35 phase-mapped + 4 cross-cutting requirements
- 95%+ coverage at EACH metric for all new code
- Zero domain layer external dependencies maintained

**v2.0 (actual):**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 13-01 | Centralized paths + migration | 14min | 2 | 18 |
| 13-02 | Internal identity rename + user-facing strings | 25min | 2 | 36 |
| 13-03 | Deprecation stub, migration docs, CLAUDE.md updates | 6min | 2 | 11 |
| 14-01 | Domain embedding port and value objects | 5min | 2 | 9 |
| 14-02 | sqlite-vec extension loading and schema migration | 6min | 2 | 7 |
| 14-03 | TransformersJsProvider with lazy loading and WASM fallback | 5min | 2 | 5 |
| 14-04 | EmbeddingProviderFactory, config integration, doctor reporting | 5min | 2 | 11 |
| 15-01 | EmbeddingRepository and EmbeddingService with model hash tracking | 6min | 2 | 10 |
| 15-02 | Sync --embed integration with progress and model change handling | 7min | 2 | 5 |
| 15-03 | Background embedding with PID lock and status command extension | 7min | 2 | 7 |

## Accumulated Context

### Key Technical Decisions (v2.0)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding runtime | Transformers.js v3 | Stable; v4 preview-only; migrate when stable |
| Vector storage | sqlite-vec (brute-force) | <75ms at 200K messages; ANN unnecessary at scale |
| Default model | all-MiniLM-L6-v2 (384d, 23MB) | Fastest, smallest; hybrid search compensates quality |
| Scoring fusion | Reciprocal Rank Fusion (k=60) | BM25 and cosine on incompatible scales; RRF uses ranks |
| Provider architecture | IEmbeddingProvider port | Domain-layer port; pluggable adapters in infrastructure |
| ONNX loading | Lazy (dynamic import) | Only loads when semantic search actually invoked |
| WASM fallback | Automatic on native failure | Transparent to user; 2-5x slower but always works |
| aidev integration | Option E (npm dependency) | memory as dependency in aidev TS CLI; discover surface before committing to merge |
| Package name | @chude/memory, binary: memory | Matches aidev subcommand; memory-nexus deprecated |
| XDG paths | ~/.config/memory (config), ~/.local/share/memory (data) | XDG Base Directory Specification compliance |
| Migration hook re-install | Non-fatal (logged, data migration still succeeds) | Data integrity prioritized over hook state |
| Dual marker hook detection | MEMORY_MARKER + LEGACY_MARKER | Backward compatible detection of old hooks during rename transition |
| Dynamic error paths | getLogDir() in SYNC_FAILED suggestion | User-facing paths always resolve correctly regardless of XDG config |
| Deprecation stub version | 0.2.0 (not matching main 2.0.0) | Stub is static signpost; its own version history is independent |
| Stale hook detection | warnStaleHookReferences() in install | Warns users if old memory-nexus hooks persist in settings.json |
| Float32Array immutability | Copy on construct + copy on getter | Full value object immutability at cost of allocation per access |
| Provider lifecycle | initialize(onProgress?) -> embed -> dispose | Consistent lifecycle pattern for all embedding providers |
| Default embedding config | Xenova/all-MiniLM-L6-v2, 384d, local | Matches research decision; EmbeddingConfig.defaults() codifies this |
| sqlite-vec loading | require() in try/catch, sync | Keeps initializeDatabase sync; graceful fallback to FTS5-only |
| Conditional vec0 schema | SchemaOptions.sqliteVecAvailable | vec0 tables only when extension loaded; embedding_state always created |
| TransformersJsProvider isReady() | Synchronous (boolean) | Matches domain port contract; no async overhead for status check |
| Sequential embedBatch() | Process one at a time | Simple and correct; batch optimization deferred to Phase 15 |
| Bun mock.module pattern | Shared mutable state, env mutated in place | Bun caches dynamic imports; getter-based delegation fails |
| Config stores plain data | EmbeddingConfigData interface, not domain class | Config files are JSON; factory validates via domain value objects |
| Factory cache key | provider:model:dimensions composite | Distinguishes configs with different parameters |
| Factory lazy initialization | create() does NOT call initialize() | Caller controls ONNX runtime load timing |
| Doctor health extension | New check functions + extended HealthCheckResult | Consistent pattern for adding health checks |
| Float32Array to vec_f32() | Direct pass (no Buffer conversion) | bun:sqlite passes Float32Array correctly to sqlite-vec |
| model_name migration | ALTER TABLE with PRAGMA table_info check | Idempotent migration for existing embedding_state tables |
| computeModelHash | Standalone pure function (not method) | Reusable across modules without instantiating EmbeddingService |
| EmbeddingService DI | Constructor injection of repo, provider, config | Testable with mock objects; no service locator |
| Default batchSize | 100 messages per batch | Balance between throughput and memory usage |
| Embedding pass DI | EmbeddingPassDeps interface for testing | Avoids mock.module; factory/config/repo overrides |
| Dynamic import for --embed | import() inside runEmbeddingPass | Zero ONNX overhead when --embed not specified |
| Separate EmbeddingProgressReporter | New interface without sessionId | ISP compliance; embedding update(current) vs sync update(current, sessionId) |
| handleModelChange prompt | Human-readable model names from ModelState | storedModelName/currentModelName, hash fallback for legacy data |
| Background embedding DI | BackgroundModeDeps interface for testing | Same DI pattern as EmbeddingPassDeps; avoids spawning real processes |
| Pre-spawn lock check | Check existing lock BEFORE spawning | Avoids wasting a process if lock already held |
| Status embedding progress | Database queries, not LockData.totalMessages | totalMessages is 0 at spawn; live counts from EmbeddingRepository |
| Background lock cleanup | finally block in embedding pass | Ensures cleanup on both success and failure |
| Background env detection | MEMORY_EMBED_BACKGROUND=1 env var | Prevents infinite recursion; background process skips re-spawn |

### Research Completed

- .planning/research/SEMANTIC-SEARCH.md -- Embedding models, sqlite-vec, hybrid search architecture, Bun compatibility
- .planning/research/AIDEV-INTEGRATION.md -- Integration options evaluated, Option E selected

### Open Questions

None blocking. All technical questions resolved during research phase.

### Blockers

None.

## Session Continuity

### Last Session

**Date:** 2026-02-26
**Completed:** Phase 15 Plan 03 -- Background embedding with PID lock and status command extension
**Stopped at:** Phase 15 complete (3/3 plans), Phase 16 next

### Context for Next Session

1. Phase 15 (Embedding Pipeline) COMPLETE: 3/3 plans done
2. Next: Phase 16 (Hybrid Search and Graceful Degradation)
3. BackgroundEmbedder: PID lock at {dataDir}/embedding.lock, stale lock detection, detached child process
4. handleBackgroundMode with BackgroundModeDeps DI overrides for testing
5. MEMORY_EMBED_BACKGROUND=1 env var signals background process (prevents re-spawn)
6. Status command shows embedding section: active (PID, progress) or idle
7. Status queries database for live embeddedCount/totalMessages (not LockData)
8. Background process cleans up lock in finally block (success and failure)
9. 2259 tests passing across full suite (excluding known EBUSY export flaky test)
10. All PIPE requirements complete (PIPE-01 through PIPE-05)

---

*Last updated: 2026-02-26 (Phase 15 Plan 03 complete)*
