---
phase: 31-bug-fixes
plan: 01
subsystem: search, cli
tags: [fts5, unicode, regex, progress-bar, cli-progress]

# Dependency graph
requires: []
provides:
  - Unicode-safe FTS5 query sanitization with blacklist approach
  - Download progress bar with maxTotal tracking and flicker guard
affects: [search, embedding, cli]

# Tech tracking
tech-stack:
  added: []
  patterns: [blacklist regex for FTS5 operator stripping, maxTotal tracking for multi-file downloads]

key-files:
  created: []
  modified:
    - src/application/services/fts-sanitizer.ts
    - src/application/services/fts-sanitizer.test.ts
    - src/presentation/cli/progress-reporter.ts
    - src/presentation/cli/progress-reporter.test.ts

key-decisions:
  - "Blacklist approach for FTS5 fallback regex instead of whitelist -- preserves user intent for symbols like C++, TCP/IP"
  - "Defer progress bar start until non-zero total known -- skips misleading 0/0 MB from config.json events"
  - "Guard setTotal() behind change check to prevent visual flicker on rapid updates"

patterns-established:
  - "Blacklist regex pattern: strip known operators, preserve everything else (Unicode, symbols)"
  - "maxTotal tracking: keep largest value across multi-file progress events"

requirements-completed: [FIX-01, FIX-03]

# Metrics
duration: 11min
completed: 2026-04-03
---

# Phase 31 Plan 01: Bug Fixes Summary

**Unicode-safe FTS5 query sanitization with blacklist regex and download progress bar maxTotal tracking for correct MB display**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-03T18:11:51Z
- **Completed:** 2026-04-03T18:22:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- FTS5 query sanitizer now preserves CJK, emoji, accented Latin, Cyrillic, and mixed-script input via Unicode flag (/gu) and blacklist fallback
- Download progress bar defers display until actual model file size is known, showing correct MB values instead of 0/0 MB
- Extracted testable pure function trackDownloadTotal for download total tracking
- 16 new tests (9 Unicode, 7 download tracking) with 100% line coverage on both source files

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Unicode-safe FTS5 query sanitization** - `5b629ef` (fix)
2. **Task 2: Fix download progress bar 0/0 MB display** - `1ac0bae` (fix)

## Files Created/Modified
- `src/application/services/fts-sanitizer.ts` - Added /gu flag to main regexes, replaced whitelist fallback with blacklist approach preserving Unicode and balanced quotes
- `src/application/services/fts-sanitizer.test.ts` - Added 9 Unicode test cases (CJK, emoji, accented, Cyrillic, mixed, operator+Unicode, all-emoji, phrase, fallback)
- `src/presentation/cli/progress-reporter.ts` - Added trackDownloadTotal() function, maxTotal tracking in handler, deferred bar start, setTotal flicker guard
- `src/presentation/cli/progress-reporter.test.ts` - Added 7 trackDownloadTotal test cases covering zero, small, large, decreasing, boundary inputs

## Decisions Made
- Used blacklist approach (strip known FTS5 operators) instead of whitelist (keep only alphanumeric) for the fallback regex -- preserves symbols users might search for (C++, TCP/IP, C#)
- Added Unicode flag (/gu) to all operator-stripping regexes for correct surrogate pair handling
- Extracted trackDownloadTotal as a pure exported function for testability rather than inlining the logic

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FTS5 search now safely handles all Unicode scripts
- Download progress bar shows meaningful file sizes during model setup
- Ready for Phase 31 Plan 02 (remaining bug fixes)

---
*Phase: 31-bug-fixes*
*Completed: 2026-04-03*
