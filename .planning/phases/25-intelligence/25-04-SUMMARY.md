---
phase: 25-intelligence
plan: "04"
subsystem: testing
tags: [sqlite-vec, cosine-similarity, temporal-decay, flaky-test, deterministic]

# Dependency graph
requires:
  - phase: 25-intelligence
    provides: temporal decay in HybridSearchService search() pipeline
provides:
  - deterministic vector-only temporal decay test with controlled embeddings
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [insertTestEmbeddingWithVector helper for controlled cosine similarity testing]

key-files:
  created: []
  modified:
    - src/infrastructure/database/services/hybrid-search-service.test.ts

key-decisions:
  - "Controlled embeddings over mocked vectorKnnSearch: preserves real sqlite-vec KNN path"
  - "msg-old has higher raw similarity (0.95) than msg-new (0.7) to prove decay inverts ordering"

patterns-established:
  - "insertTestEmbeddingWithVector: use pre-built Float32Array for deterministic similarity testing"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-10
---

# Plan 25-04: Fix Flaky Vector-Only Temporal Decay Test Summary

**Replaced random embeddings with controlled cosine similarity vectors so decay-dependent ordering is deterministic across all runs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T21:44:36Z
- **Completed:** 2026-03-10T21:49:36Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed non-deterministic vector-only temporal decay test that failed when random embeddings produced near-zero cosine similarity for both messages
- Added `insertTestEmbeddingWithVector` helper for tests that need controlled embedding values
- Test now proves decay changes ordering: msg-old (0.95 similarity, 60+ days old, decayed to ~0.24) loses to msg-new (0.7 similarity, recent, ~0.7 effective) -- only possible when decay is applied
- Verified deterministic across 5 consecutive runs (40 tests, 0 failures each run)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor vector-only decay test to use controlled embeddings** - `60f7d53` (fix)

## Files Created/Modified
- `src/infrastructure/database/services/hybrid-search-service.test.ts` - Added insertTestEmbeddingWithVector helper; refactored vector-only decay test to use controlled query/stored embeddings with known cosine similarity values

## Decisions Made
- Used controlled embeddings injected via insertTestEmbeddingWithVector and mock provider.embed override, rather than mocking vectorKnnSearch -- this preserves the real sqlite-vec KNN search path and tests the full pipeline
- Chose msg-old similarity (0.95) > msg-new similarity (0.7) so that without decay, msg-old would rank first; with decay, msg-new ranks first -- proving the test is non-vacuous

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 25 gap closure complete: all 4 plans (3 feature + 1 gap closure) done
- Ready to proceed with phases 27, 28, 29 (all independent)

## Self-Check: PASSED

- FOUND: src/infrastructure/database/services/hybrid-search-service.test.ts
- FOUND: .planning/phases/25-intelligence/25-04-SUMMARY.md
- FOUND: commit 60f7d53 (fix(25-04): use controlled embeddings in vector-only decay test)
- VERIFIED: insertTestEmbeddingWithVector helper at line 92
- VERIFIED: 5/5 consecutive test runs pass (40 tests, 0 failures each)

---
*Phase: 25-intelligence*
*Completed: 2026-03-10*
