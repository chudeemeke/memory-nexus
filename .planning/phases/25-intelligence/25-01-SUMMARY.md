---
phase: 25-intelligence
plan: 01
subsystem: search
tags: [ansi, temporal-decay, memory-files, fts5, hybrid-search, token-estimation]

requires:
  - phase: 23-foundation
    provides: memory_files table, MemoryFile entity, IMemoryFileRepository port
  - phase: 16-hybrid-search
    provides: HybridSearchService, temporal decay function, SearchResult value object
provides:
  - stripAnsi/estimateTokens/formatForAi utilities for AI-consumable output
  - applyTemporalDecayWithExemptions for curated file protection
  - CURATED_FILE_TYPES constant (decisions, learnings, user_prefs)
  - findCrossProjectLearnings repository query
  - Uniform temporal decay across FTS, vector, and hybrid search modes
affects: [25-02-smart-context, 25-03-cli-integration]

tech-stack:
  added: []
  patterns:
    - "Uniform pipeline decay: decay applied once at search() exit, not per-mode"
    - "SQL LIKE for small-set content filtering (cross-project tag matching)"

key-files:
  created:
    - src/presentation/cli/formatters/ai-formatter.ts
    - src/presentation/cli/formatters/ai-formatter.test.ts
  modified:
    - src/application/services/temporal-decay.ts
    - src/application/services/temporal-decay.test.ts
    - src/application/services/index.ts
    - src/domain/ports/repositories.ts
    - src/infrastructure/database/repositories/memory-file-repository.ts
    - src/infrastructure/database/repositories/memory-file-repository.test.ts
    - src/infrastructure/database/services/hybrid-search-service.ts
    - src/infrastructure/database/services/hybrid-search-service.test.ts
    - src/presentation/cli/formatters/index.ts

key-decisions:
  - "SQL LIKE over FTS5 MATCH for cross-project tag: FTS5 tokenizes hyphens, causing false matches on small result sets"
  - "Decay at search() pipeline exit, not per-mode: SRP -- each mode handles retrieval, decay is cross-cutting scoring"
  - "applyDecayToResults inline in HybridSearchService rather than reusing applyTemporalDecay: uses SearchResult.timestamp directly, no rowid-to-timestamp map needed"

patterns-established:
  - "Pipeline-exit decay: temporal decay applied once after switch(mode), before metadata assembly"
  - "Exemption-based decay: curated files skip decay via rowid set, preserving evergreen knowledge"

requirements-completed: []

duration: 7min
completed: 2026-03-09
---

# Plan 25-01: AI Formatter, Temporal Decay Extension, Cross-Project Query Summary

**AI formatter with ANSI stripping and token estimation, temporal decay with curated-file exemptions, cross-project learnings query, and uniform decay across all search modes**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T11:26:32Z
- **Completed:** 2026-03-09T11:33:24Z
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments

- Shared AI formatter utility (stripAnsi, estimateTokens, formatForAi) ready for --format ai and SmartContextService
- Temporal decay extended with exemption mechanism for curated files (decisions, learnings, user_prefs)
- Cross-project learnings query enables intelligence surfacing across projects
- Temporal decay lifted from hybrid-only to unified search pipeline: FTS, vector, and hybrid all apply recency weighting consistently

## Task Commits

Each task was committed atomically:

1. **Task 1: AI Formatter Utility** - `cb155f5` (feat)
2. **Task 2: Temporal Decay with Curated File Exemptions** - `a12571f` (feat)
3. **Task 3: Cross-Project Learnings Repository Query** - `dad1edf` (feat)
4. **Task 4: Uniform Temporal Decay in Search Pipeline** - `d15bc16` (refactor)

## Files Created/Modified

- `src/presentation/cli/formatters/ai-formatter.ts` - stripAnsi, estimateTokens, formatForAi utilities
- `src/presentation/cli/formatters/ai-formatter.test.ts` - 16 tests covering all functions
- `src/presentation/cli/formatters/index.ts` - Barrel export for new utilities
- `src/application/services/temporal-decay.ts` - Added CURATED_FILE_TYPES and applyTemporalDecayWithExemptions
- `src/application/services/temporal-decay.test.ts` - 8 new tests for exemptions and constant
- `src/application/services/index.ts` - Barrel export for new functions
- `src/domain/ports/repositories.ts` - Added findCrossProjectLearnings to IMemoryFileRepository
- `src/infrastructure/database/repositories/memory-file-repository.ts` - Implemented findCrossProjectLearnings
- `src/infrastructure/database/repositories/memory-file-repository.test.ts` - 7 new tests for cross-project query
- `src/infrastructure/database/services/hybrid-search-service.ts` - Moved decay to search(), added applyDecayToResults
- `src/infrastructure/database/services/hybrid-search-service.test.ts` - 5 new tests for uniform decay

## Decisions Made

- Used SQL LIKE instead of FTS5 MATCH for cross-project tag detection: FTS5 would tokenize "cross-project" into two tokens and produce false matches. The result set is small (typically <50 learnings files) so LIKE performance is acceptable.
- Applied decay at the search() pipeline exit rather than in each mode method: follows SRP where each private method handles its mode's retrieval logic, and decay is a cross-cutting scoring concern applied once at the pipeline boundary.
- Implemented applyDecayToResults as an inline method using SearchResult.timestamp directly, rather than reusing the existing applyTemporalDecay which requires rowid-to-timestamp maps. This is cleaner since SearchResult already carries timestamps.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 foundational pieces are in place for Plan 25-02 (SmartContextService) and Plan 25-03 (CLI integration)
- SmartContextService can use: stripAnsi/estimateTokens for budget management, applyTemporalDecayWithExemptions for curated file protection, findCrossProjectLearnings for cross-project intelligence
- HybridSearchService now applies decay uniformly, so `memory search` results are recency-weighted regardless of mode

## Self-Check: PASSED

All 6 key source files verified present. All 4 task commits verified in git log.

---
*Phase: 25-intelligence*
*Completed: 2026-03-09*
