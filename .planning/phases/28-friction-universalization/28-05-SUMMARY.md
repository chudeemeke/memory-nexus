---
phase: 28-friction-universalization
plan: 05
subsystem: testing
tags: [di, dependency-injection, test-isolation, error-codes]

requires:
  - phase: 28-friction-universalization
    provides: friction CLI commands, ErrorCode enum
provides:
  - injectable openInBrowser via BrowserOpener type and FrictionCommandDeps
  - resilient ErrorCode tests with dynamic count assertions
affects: [friction-system, error-handling]

tech-stack:
  added: []
  patterns: [DI for side-effecting functions via optional deps parameter]

key-files:
  created: []
  modified:
    - src/presentation/cli/commands/friction.ts
    - src/presentation/cli/commands/friction.test.ts
    - src/domain/errors/error-codes.test.ts

key-decisions:
  - "BrowserOpener type alias + FrictionCommandDeps interface for DI (matches existing BackfillService pattern)"
  - "Object.values(ErrorCode) cast to ErrorCodeType[] for auto-complete type acceptance test"
  - "Removed hardcoded count assertion from frozen test (loop already validates all keys)"

patterns-established:
  - "Side-effecting functions (exec, spawn) injectable via optional deps parameter with real default"

requirements-completed: [QUAL-01, QUAL-04]

duration: 8min
completed: 2026-03-21
---

# Phase 28 Plan 05: Gap Closure Summary

**Injectable browser opener via DI and resilient ErrorCode tests with dynamic counts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-21T00:39:26Z
- **Completed:** 2026-03-21T00:47:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- openInBrowser is now injectable via FrictionCommandDeps, tests pass no-op to prevent browser spawning
- ErrorCode tests use Object.values/Object.keys for automatic resilience to new error code additions
- Zero hardcoded counts remain in error-codes.test.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Make openInBrowser injectable via DI** - `72f56c1` (refactor)
2. **Task 2: Fix ErrorCode frozen test stale count** - `38ea634` (fix)

## Files Created/Modified
- `src/presentation/cli/commands/friction.ts` - Added BrowserOpener type, FrictionCommandDeps interface, threaded openFn parameter
- `src/presentation/cli/commands/friction.test.ts` - Updated --html test to pass no-op opener
- `src/domain/errors/error-codes.test.ts` - Replaced hardcoded counts with dynamic assertions

## Decisions Made
- BrowserOpener type alias keeps the DI surface minimal (single function, not an interface with methods)
- Object.values(ErrorCode) as ErrorCodeType[] leverages TypeScript compiler to catch type mismatches at compile time while being automatically complete
- Frozen test count assertion removed entirely since the key-equals-value loop already validates all keys

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All gap closure items from 28-05 resolved
- Friction universalization phase fully complete

---
*Phase: 28-friction-universalization*
*Completed: 2026-03-21*
