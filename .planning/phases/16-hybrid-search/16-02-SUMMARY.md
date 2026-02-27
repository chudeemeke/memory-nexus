---
phase: 16-hybrid-search
plan: 02
subsystem: database
tags: [hybrid-search, rrf, temporal-decay, graceful-degradation, sqlite-vec, embedding]

requires:
  - phase: 16-01
    provides: Domain types (SearchMode, HybridSearchOptions, SearchConfig), RRF fusion algorithm, temporal decay, vector KNN search, search config
provides:
  - HybridSearchService composing FTS5 + vector with mode resolution and graceful degradation
  - SearchMeta accessor for mode, capabilities, timing, degradation info
  - Error formatter suggestions for embedding/vector error codes
  - Dimension mismatch detection between stored and provider embeddings
affects: [16-03, 18-api-stabilization]

tech-stack:
  added: []
  patterns: [hybrid-search-service composition, degradation tracking via return objects, dimension mismatch detection via stored embedding query]

key-files:
  created:
    - src/infrastructure/database/services/hybrid-search-service.ts
    - src/infrastructure/database/services/hybrid-search-service.test.ts
  modified:
    - src/infrastructure/database/services/index.ts
    - src/infrastructure/database/index.ts
    - src/presentation/cli/formatters/error-formatter.ts
    - src/presentation/cli/formatters/error-formatter.test.ts

key-decisions:
  - "Degradation tracking via return objects: hybridSearch returns { results, degraded, degradationReason } to allow the caller to update metadata correctly"
  - "Dimension mismatch detection queries actual stored embedding from vec0 table rather than comparing config values"
  - "Provider initialization deferred to search time: getProvider() initializes lazily only when vector/hybrid mode actually executes"
  - "Filters applied post-fusion in hybrid mode: FTS leg applies filters via SQL, vector/hybrid results filter during hydration"

patterns-established:
  - "HybridSearchDeps interface for constructor injection of all service dependencies"
  - "SearchMeta via getLastSearchMeta() getter pattern for metadata reporting without changing ISearchService contract"
  - "vectorSnippet() uses first 200 chars for vector-only results (no FTS5 snippet available)"

requirements-completed: [HSRCH-03, HSRCH-06, DEGRADE-01, DEGRADE-02, DEGRADE-03]

duration: 12min
completed: 2026-02-27
---

# Phase 16 Plan 02: HybridSearchService Summary

**HybridSearchService with four search modes (auto/fts/vector/hybrid), RRF fusion, temporal decay, and graceful degradation to FTS-only when vector components unavailable**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-27T17:05:02Z
- **Completed:** 2026-02-27T17:17:32Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- HybridSearchService implementing ISearchService with mode resolution chain (explicit > config > auto)
- Graceful degradation: auto/hybrid silently fall back to FTS; vector mode throws actionable errors
- Dimension mismatch detection prevents KNN queries with incompatible embedding dimensions
- Error formatter extended with suggestions for 5 new embedding/vector error codes
- 35 hybrid search tests + 39 error formatter tests, 100% coverage on new files
- Full suite: 2400 tests passing (40 new tests added)

## Task Commits

Each task was committed atomically:

1. **Task A: HybridSearchService core -- mode resolution, FTS/vector/hybrid orchestration** - `e43645e` (feat)
2. **Task B: Error suggestions and degradation edge cases** - `d1bb0f4` (feat)

## Files Created/Modified
- `src/infrastructure/database/services/hybrid-search-service.ts` - Core service with 4 search modes, degradation, metadata
- `src/infrastructure/database/services/hybrid-search-service.test.ts` - 35 tests covering all modes and edge cases
- `src/infrastructure/database/services/index.ts` - Added HybridSearchService export
- `src/infrastructure/database/index.ts` - Added HybridSearchService to barrel exports
- `src/presentation/cli/formatters/error-formatter.ts` - 5 new error code suggestions
- `src/presentation/cli/formatters/error-formatter.test.ts` - 5 new suggestion tests

## Decisions Made
- Degradation tracking via return objects from hybridSearch() rather than mutation -- cleaner data flow
- Dimension mismatch detected by querying the actual stored embedding from the vec0 table (more reliable than comparing config values)
- FTS results tagged with `source: 'fts'` even in FTS-only mode for consistent SearchResult shape
- Provider initialization deferred to search execution (not constructor) -- FTS mode never touches provider

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed degradation tracking for provider failures during hybrid search**
- **Found during:** Task A (HybridSearchService core)
- **Issue:** resolveMode() correctly identified "hybrid" but when the provider failed during hybridSearch(), the outer metadata still reported mode="hybrid" instead of recognizing the degradation
- **Fix:** Changed hybridSearch() to return `{ results, degraded, degradationReason }` so the caller can update metadata accurately
- **Files modified:** src/infrastructure/database/services/hybrid-search-service.ts
- **Verification:** provider.initialize() failure test now correctly shows degraded=true, mode=fts
- **Committed in:** e43645e (Task A commit)

**2. [Rule 1 - Bug] Fixed dimension mismatch detection comparing wrong values**
- **Found during:** Task A (HybridSearchService core)
- **Issue:** Initial implementation compared provider.dimensions vs config.embedding.dimensions, but both could be the same (768) while stored embeddings were 384d
- **Fix:** Changed to query the actual stored embedding from the vec0 table to determine stored dimensions
- **Files modified:** src/infrastructure/database/services/hybrid-search-service.ts
- **Verification:** dimension mismatch test now correctly detects 384d stored vs 768d provider
- **Committed in:** e43645e (Task A commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct degradation behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HybridSearchService ready for CLI integration in Plan 16-03
- All 4 search modes functional (auto, fts, vector, hybrid)
- SearchMeta available for CLI display of mode, capabilities, timing
- Error suggestions ready for user-facing error messages
- Fts5SearchService unchanged (composed, not modified)

## Self-Check: PASSED

- All source files exist on disk
- Both task commits verified (e43645e, d1bb0f4)
- SUMMARY.md created and verified

---
*Phase: 16-hybrid-search*
*Completed: 2026-02-27*
