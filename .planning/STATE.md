# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** v2.0 Hybrid Search and Rebrand -- package rename, embedding infrastructure, hybrid search, API stabilization.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node

## Current Position

**Milestone:** v2.0 Hybrid Search and Rebrand
**Phase:** 21 (Architecture Boundary Cleanup) -- Complete (1/1 plans)
**Status:** Milestone complete

```
v2.0 Progress: [########################] 10/10 phases
  Phase 13: Package Rename          [x] Complete (3/3 plans)
  Phase 14: Embedding Infrastructure [x] Complete (4/4 plans)
  Phase 15: Embedding Pipeline       [x] Complete (4/4 plans)
  Phase 16: Hybrid Search            [x] Complete (3/3 plans)
  Phase 16.1: Migration Race Fix     [x] Complete (1/1 plans)
  Phase 17: Provider Ecosystem       [x] Complete (3/3 plans)
  Phase 18: API Stabilization        [x] Complete (2/2 plans)
  Phase 19: Verification Closure     [x] Complete (1/1 plans)
  Phase 20: Public API Type Exports  [x] Complete (1/1 plans)
  Phase 21: Architecture Boundary    [x] Complete (1/1 plans)
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
| 15-04 | Coverage gap closure for Phase 15 embedding pipeline | 9min | 2 | 4 |
| 16-01 | Domain types, RRF algorithm, vector KNN, search config | 3min | 2 | 13 |
| 16-02 | HybridSearchService with mode resolution and graceful degradation | 12min | 2 | 6 |
| 16-03 | CLI integration, output formatting, and doctor enhancement | ~30min | 2 | 9 |
| 16.1-01 | Size-aware migration conflict resolution with WAL/SHM cleanup | 4min | 2 | 3 |
| 17-01 | OpenAI and Ollama provider adapters with config and factory wiring | 16min | 2 | 13 |
| 17-02 | Dimension-aware re-embedding on provider/model change | 6min | 2 | 4 |
| 17-03 | Provider-specific default resolution (gap closure) | 5min | 2 | 3 |
| 18-01 | Build infrastructure and API export surface | 17min | 2 | 18 |
| 18-02 | Integration tests and API documentation | 20min | 2 | 18 |
| 19-01 | Verification closure (Phase 13, Phase 18 re-verify, QUAL formal verify) | 13min | 3 | 3 |
| 20-01 | Export domain port types and verify public API surface | 15min | 2 | 4 |
| 21-01 | IEmbeddingRepository domain port and boundary cleanup | 15min | 2 | 5 |

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
| mock.module isolation | Separate test file for lazy loaders | Bun's mock.module is global; prevents leakage to other test files |
| RRF minimum score threshold | 0.001 | Filters rank-1000+ noise while keeping moderate single-source results |
| RRF score normalization | Max-score division (top result = 1.0) | Proportional scaling; consistent 0-1 range for SearchResult |
| Temporal decay missing timestamp | Score unchanged | Safe default; no penalty for incomplete data |
| vectorKnnSearch guard clause | Return empty for limit <= 0 | Avoids unnecessary SQL roundtrip |
| SearchConfig deep merge | Two-level (search + search.temporalDecay) | Matches embedding pattern; supports partial config overrides |
| HybridSearchService degradation tracking | Return objects from hybridSearch() | Cleaner data flow than mutation; caller updates metadata accurately |
| Dimension mismatch detection | Query actual stored embedding from vec0 | More reliable than comparing config values; detects real mismatches |
| Provider initialization timing | Deferred to search execution | FTS mode never touches provider; zero ONNX overhead for keyword search |
| Hybrid filter application | FTS via SQL, vector/hybrid via post-hydration | FTS leg uses SQL WHERE clauses; hybrid filters during result assembly |
| Commander --no-X pattern | opts.X = false (not opts.noX = true) | Commander.js negation convention; check opts.vector === false |
| JSON metadata envelope | Additive-only, envelope when searchMeta present | Old consumers see plain array; new consumers get meta + results |
| Doctor exit codes | 0=OK+vectorReady, 1=degraded, 2=broken | Degraded includes no embeddings or permission issues |
| Context/related hybrid benefit | Deferred (SqliteContextService does own SQL) | Requires constructor injection refactor; search benefits immediately |
| Migration conflict resolution | Size comparison (larger file wins) | Simple, correct, fast; no content hashing or timestamps needed |
| WAL/SHM sidecar cleanup | Only on overwrite (source > dest) | Prevents stale WAL state corrupting migrated database |
| Migration guard placement | CLI entry point (index.ts), not connection.ts | No coupling between migration and database initialization modules |
| Entry-point migration guard | isMigrationPending() before program.parse() | Prevents empty-stub race; fast path (single existsSync) when no legacy |
| OpenAI initialize() no-op | Mark ready immediately, no API health check | Auth errors surface on first embed(), avoiding blocking network calls |
| Ollama initialize() reachability check | GET /api/tags with actionable error hints | Local server may not be running; clear recovery guidance needed |
| Ollama doctor readiness deferred | ready:true + readyReason text | Server connectivity verified at sync time, not during doctor |
| OpenAI doctor readiness gated on apiKey | ready:false when apiKey missing | Clear "API key not set" reason for user |
| Fetch-based providers | Native fetch(), zero npm deps | OpenAI and Ollama both have simple HTTP APIs; no SDK needed |
| Dimension detection method | Query stored embedding byteLength/4 | More reliable than PRAGMA on vec0 virtual tables |
| recreateVecTable atomicity | DROP vec0 + DELETE embedding_state | Prevents orphaned state when vectors are dropped |
| Dimension change skip on null | Skip recreation when no stored embeddings | Table already correct from initial schema or will be created fresh |
| Same-dimension model change | DELETE-only path (no table recreation) | No structural change needed when dimensions match |
| Provider default resolution | "in" operator on raw user JSON | Distinguishes user-explicit from inherited defaults; unknown providers fall back to local |
| Dual build system | tsc emitDeclarationOnly + bun build lib + bun build CLI | Pre-existing type errors prevent clean tsc emit; three-step pipeline produces declarations, library JS, and CLI binary independently |
| Library externals | All npm deps externalized in bun build | Consumers install deps themselves; keeps library small; avoids native addon bundling issues |
| Ports barrel re-export | export * from "./ports/index.js" in domain/index.ts | Consistent with existing barrel pattern; no selective re-exports needed |
| IEmbeddingRepository sync methods | Return T, not Promise<T> | bun:sqlite is synchronous; port contract matches actual API |
| IEmbeddingRepository ISP | 7 methods (excludes vectorKnnSearch, etc.) | Only methods EmbeddingService uses; infrastructure-only methods stay on concrete class |
| EmbeddingServiceConfig minimal subset | 4 fields (provider, model, dimensions, batchSize) | Application layer needs only operational config, not enabled/apiKey/baseUrl |

### Research Completed

- .planning/research/SEMANTIC-SEARCH.md -- Embedding models, sqlite-vec, hybrid search architecture, Bun compatibility
- .planning/research/AIDEV-INTEGRATION.md -- Integration options evaluated, Option E selected

### Open Questions

None blocking. All technical questions resolved during research phase.

### Roadmap Evolution

- Added 3 gap closure phases (19-21) from milestone audit (2026-03-01)
- Inserted Phase 16.1: Migration Race Condition Fix (urgent) (2026-02-27)
  - Discovered during Phase 16 human verification: `memory search --mode hybrid` returned no results because the CLI reads from an empty XDG database while real data sits at the legacy path
  - Root cause: `initializeDatabase()` creates an empty DB at XDG path before `migrateFromLegacy()` can move the real 266MB database from `~/.memory-nexus/`
  - Blocks Phase 17/18: hybrid search cannot be validated against real data until migration works correctly

### Blockers

None. Phase 16.1 complete; Phase 17/18 unblocked.

## Session Continuity

### Last Session

**Date:** 2026-03-01
**Completed:** Phase 21 executed (1/1 plans, all 2604 tests pass, 0 failures)
**Stopped at:** Phase 21 complete -- all v2.0 phases done

### Context for Next Session

1. Phase 21 complete: IEmbeddingRepository domain port closes last architecture boundary violation (BOUNDARY-01)
2. All 10/10 v2.0 phases complete -- milestone ready for final sign-off
3. 2604 tests pass, 0 fail, 5423 expect() calls
4. All 39 v2.0 requirements at Complete status in REQUIREMENTS.md
5. No remaining gap closure phases

---

*Last updated: 2026-03-01 (Plan 21-01 complete)*
