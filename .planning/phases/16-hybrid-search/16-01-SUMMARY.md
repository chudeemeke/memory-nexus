---
phase: 16-hybrid-search
plan: "01"
subsystem: search
tags: [rrf, reciprocal-rank-fusion, temporal-decay, vector-search, sqlite-vec, hybrid-search, knn]

# Dependency graph
requires:
  - phase: 15-embedding-pipeline
    provides: EmbeddingRepository, message_embeddings vec0 table, storeBatch, sqlite-vec extension
provides:
  - SearchMode type and HybridSearchOptions interface in domain ports
  - SearchResult with optional source and rawScores metadata
  - Vector-related error codes (VECTOR_UNAVAILABLE, PROVIDER_TIMEOUT, etc.)
  - reciprocalRankFusion() pure function with k=60, normalization, threshold
  - applyTemporalDecay() pure function with exponential half-life formula
  - EmbeddingRepository.vectorKnnSearch() using sqlite-vec MATCH
  - SearchConfigData and DEFAULT_SEARCH_CONFIG in config manager
  - Deep-merged search config in loadConfig()
affects: [16-02 HybridSearchService, 16-03 CLI search command, 18-API-stabilization]

# Tech tracking
tech-stack:
  added: []
  patterns: [reciprocal-rank-fusion, temporal-decay, vector-knn-query]

key-files:
  created:
    - src/application/services/rrf-fusion.ts
    - src/application/services/rrf-fusion.test.ts
    - src/application/services/temporal-decay.ts
    - src/application/services/temporal-decay.test.ts
  modified:
    - src/domain/ports/services.ts
    - src/domain/value-objects/search-result.ts
    - src/domain/errors/error-codes.ts
    - src/domain/errors/error-codes.test.ts
    - src/infrastructure/hooks/config-manager.ts
    - src/infrastructure/hooks/config-manager.test.ts
    - src/infrastructure/database/repositories/embedding-repository.ts
    - src/infrastructure/database/repositories/embedding-repository.test.ts
    - src/application/services/index.ts

key-decisions:
  - "RRF minimum score threshold set to 0.001 -- filters rank-1000+ noise while keeping moderate results"
  - "Score normalization divides by max RRF score, mapping top result to 1.0 with proportional scaling"
  - "Temporal decay with missing timestamp returns score unchanged (safe default for incomplete data)"
  - "vectorKnnSearch returns early for limit <= 0 (guard clause, no SQL roundtrip)"

patterns-established:
  - "Pure algorithm functions in application/services with zero infrastructure deps"
  - "RankedCandidate/FusedResult interfaces for RRF pipeline data flow"
  - "DecayableResult/DecayedResult interfaces for temporal decay pipeline"
  - "VectorSearchRow interface for sqlite-vec MATCH query results"
  - "Double-nested deep merge pattern in loadConfig for search.temporalDecay"

requirements-completed: [HSRCH-01, HSRCH-02, HSRCH-04, HSRCH-05]

# Metrics
duration: 3min
completed: 2026-02-27
---

# Phase 16 Plan 01: Domain Types, RRF Algorithm, Vector KNN Query, and Search Config Summary

**Pure RRF fusion (k=60) with score normalization, temporal decay with 30-day half-life, vector KNN via sqlite-vec MATCH, and SearchMode/config extension**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T16:46:28Z
- **Completed:** 2026-02-27T16:49:19Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- SearchMode type union, HybridSearchOptions, and SearchResult source/rawScores metadata in domain layer
- Pure reciprocalRankFusion() function: combines FTS5 and vector ranked lists, filters noise, normalizes to 0-1
- Pure applyTemporalDecay() function: exponential decay with configurable half-life, re-sorts by decayed score
- vectorKnnSearch() on EmbeddingRepository using sqlite-vec MATCH with distance ASC ordering
- SearchConfigData with two-level deep merge in loadConfig()
- 5 new vector-related error codes for graceful degradation
- 2360 tests passing across full suite, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task A: Domain types, error codes, and search config extension** - `096a254` (feat)
2. **Task B: RRF fusion, temporal decay, and vector KNN query** - `f718fb1` (feat)

## Files Created/Modified
- `src/domain/ports/services.ts` - SearchMode type union and HybridSearchOptions interface
- `src/domain/value-objects/search-result.ts` - Optional source and rawScores metadata fields
- `src/domain/errors/error-codes.ts` - VECTOR_UNAVAILABLE, PROVIDER_TIMEOUT, PROVIDER_CONFIG_INVALID, EMBEDDING_DIMENSION_MISMATCH, MODEL_CORRUPTED
- `src/infrastructure/hooks/config-manager.ts` - SearchConfigData, DEFAULT_SEARCH_CONFIG, deep-merged search section
- `src/application/services/rrf-fusion.ts` - reciprocalRankFusion() pure function with k=60, threshold, normalization
- `src/application/services/rrf-fusion.test.ts` - 11 tests covering overlap boost, sorting, limits, threshold, normalization
- `src/application/services/temporal-decay.ts` - applyTemporalDecay() pure function with exponential half-life
- `src/application/services/temporal-decay.test.ts` - 8 tests covering age variants, custom half-life, re-sorting, missing timestamps
- `src/infrastructure/database/repositories/embedding-repository.ts` - VectorSearchRow interface and vectorKnnSearch() method
- `src/infrastructure/database/repositories/embedding-repository.test.ts` - 5 vector KNN tests with sqlite-vec integration
- `src/application/services/index.ts` - Exports for RRF and temporal decay types/functions

## Decisions Made
- RRF minimum score threshold set to 0.001 to filter extreme noise (rank 1000+ single-source results)
- Score normalization uses max-score division (top result always 1.0)
- Temporal decay preserves score unchanged when timestamp is missing (safe default)
- vectorKnnSearch guard clause returns empty for limit <= 0 without SQL roundtrip

## Deviations from Plan

None - plan executed exactly as written. Task A was already committed prior to this session. Task B implemented and committed cleanly.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All building blocks ready for HybridSearchService composition (Plan 16-02)
- RRF, temporal decay, and vector KNN are independently tested pure components
- SearchMode and HybridSearchOptions types ready for CLI integration (Plan 16-03)
- Config manager ready to provide search defaults to HybridSearchService

---
*Phase: 16-hybrid-search*
*Completed: 2026-02-27*
