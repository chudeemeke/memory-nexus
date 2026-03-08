---
phase: 23-foundation
plan: 02
subsystem: search
tags: [fts5, sanitizer, search, sqlite, query-safety]

requires:
  - phase: none
    provides: none
provides:
  - sanitizeFtsQuery() pure function for FTS5 query safety
  - Fts5SearchService.search() sanitizes queries before MATCH
  - SessionRepository.searchSummaries() for summary-based FTS5 search
affects: [search, context, hybrid-search]

tech-stack:
  added: []
  patterns: [FTS5 query sanitization before MATCH, balanced-quote preservation]

key-files:
  created:
    - src/application/services/fts-sanitizer.ts
    - src/application/services/fts-sanitizer.test.ts
  modified:
    - src/application/services/index.ts
    - src/infrastructure/database/services/search-service.ts
    - src/infrastructure/database/services/search-service.test.ts
    - src/infrastructure/database/repositories/session-repository.ts
    - src/infrastructure/database/repositories/session-repository.test.ts

key-decisions:
  - "Preserve asterisks in sanitizer -- FTS5 uses * for prefix search (auth*) and it does not cause syntax errors"
  - "Preserve balanced double quotes -- FTS5 phrase search (\"exact phrase\") is valid syntax; only strip unmatched quotes"
  - "Infrastructure importing application pure function is acceptable pragmatic exception (matches existing codebase pattern)"

patterns-established:
  - "FTS5 sanitization: always call sanitizeFtsQuery() before passing user input to MATCH"
  - "Empty sanitized queries return [] instead of throwing FTS5 errors"

requirements-completed: []

duration: 8min
completed: 2026-03-08
---

# Phase 23 Plan 02: FTS5 Query Sanitizer and Search Service Integration Summary

**Pure sanitizeFtsQuery() function stripping FTS5 operator characters, integrated into Fts5SearchService and SessionRepository.searchSummaries()**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T02:51:11Z
- **Completed:** 2026-03-08T02:59:11Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- sanitizeFtsQuery() pure function in application layer strips FTS5 operator chars (periods, hyphens, colons, parens, brackets, braces, carets, tildes, @, /, backslash)
- Fts5SearchService.search() sanitizes queries before FTS5 MATCH, preventing syntax errors
- SessionRepository.searchSummaries() added for querying sessions_fts with sanitized input
- "SYNC-09" and "Opus 4.6" queries return results instead of FTS5 errors
- All 1699 core tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 23-02-A: sanitizeFtsQuery pure function (TDD)**
   - `ad1c3ee` (test) RED: 23 test cases for sanitizer behavior
   - `6a1d19f` (feat) GREEN: implement sanitizeFtsQuery with regex replacement

2. **Task 23-02-B: Integrate sanitizer into Fts5SearchService and SessionRepository (TDD)**
   - `e45c7d0` (test) RED: 13 new tests across search-service and session-repository
   - `49a3362` (feat) GREEN: wire sanitizer into search() and add searchSummaries()

## Files Created/Modified
- `src/application/services/fts-sanitizer.ts` - Pure function: strip FTS5 operator chars, preserve asterisks and balanced quotes
- `src/application/services/fts-sanitizer.test.ts` - 24 tests covering all operator chars, edge cases, passthrough
- `src/application/services/index.ts` - Added sanitizeFtsQuery export
- `src/infrastructure/database/services/search-service.ts` - Sanitize query.value before FTS5 MATCH, return [] for empty
- `src/infrastructure/database/services/search-service.test.ts` - 7 new tests for special char queries and regression
- `src/infrastructure/database/repositories/session-repository.ts` - Added searchSummaries() with FTS5 sanitization
- `src/infrastructure/database/repositories/session-repository.test.ts` - 6 new tests for searchSummaries()

## Decisions Made
- Preserved asterisks in sanitizer: FTS5 uses `*` for prefix search (`auth*`) and it does not cause syntax errors, so stripping it would break existing prefix search functionality
- Preserved balanced double quotes: FTS5 phrase search (`"exact phrase"`) is valid syntax that users rely on; only unmatched quotes cause errors ("unterminated string")
- Infrastructure importing application pure function: accepted as pragmatic exception matching existing codebase pattern (HybridSearchService already imports rrf-fusion and temporal-decay from application layer)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved asterisks instead of stripping them**
- **Found during:** Task 23-02-B GREEN phase
- **Issue:** Plan specified stripping asterisks, but existing Test 21 (prefix search with `auth*`) relies on FTS5 wildcard syntax. Stripping `*` broke prefix search.
- **Fix:** Removed `*` from sanitizer regex. Verified asterisks don't cause FTS5 syntax errors (they silently return no results when used mid-word like `wild*card`).
- **Files modified:** src/application/services/fts-sanitizer.ts, src/application/services/fts-sanitizer.test.ts
- **Verification:** Test 21 passes, all 40 search service tests pass
- **Committed in:** 49a3362

**2. [Rule 1 - Bug] Preserved balanced double quotes instead of stripping all quotes**
- **Found during:** Task 23-02-B GREEN phase
- **Issue:** Plan specified stripping double quotes, but existing Test 22 (phrase search with `"user authentication"`) relies on FTS5 phrase syntax. Stripping all quotes broke phrase search.
- **Fix:** Added quote-counting logic: balanced pairs preserved, unmatched quotes stripped. Only unmatched quotes cause "unterminated string" FTS5 errors.
- **Files modified:** src/application/services/fts-sanitizer.ts, src/application/services/fts-sanitizer.test.ts
- **Verification:** Test 22 passes, all 40 search service tests pass
- **Committed in:** 49a3362

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug fixes)
**Impact on plan:** Both fixes prevent regression of existing FTS5 features. The sanitizer is more precise: it strips characters that actually cause FTS5 syntax errors while preserving characters that are valid FTS5 syntax.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FTS5 search reliability fix is complete
- sanitizeFtsQuery() available for any future FTS5 query paths
- searchSummaries() ready for use in context/intelligence features (Phase 25)

---
*Phase: 23-foundation*
*Completed: 2026-03-08*
