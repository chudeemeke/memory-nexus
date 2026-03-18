---
phase: 27-qmd-integration
plan: 01
subsystem: search
tags: [qmd, subprocess, hexagonal, port-adapter, child_process]

requires:
  - phase: 23-foundation
    provides: "memory file directory structure (~/.memory/) for qmd to search"
provides:
  - "IExternalSearchProvider domain port for external tool delegation"
  - "QmdSearchResult and QmdHealthInfo domain types"
  - "QmdRunner infrastructure adapter (spawn-based qmd invocation)"
  - "isQmdAvailable() and getQmdInfo() standalone detection utilities"
affects: [27-02, doctor, search-command]

tech-stack:
  added: []
  patterns: ["spawn-based CLI adapter (follows ClaudeSummaryGenerator pattern)", "standalone convenience functions alongside DI class"]

key-files:
  created:
    - src/infrastructure/external/qmd-runner.ts
    - src/infrastructure/external/qmd-runner.test.ts
    - src/infrastructure/external/index.ts
  modified:
    - src/domain/ports/services.ts
    - src/domain/ports/index.ts

key-decisions:
  - "QmdRunner follows ClaudeSummaryGenerator spawn pattern exactly for consistency"
  - "Standalone functions (isQmdAvailable, getQmdInfo) duplicate class logic for non-DI contexts like doctor command"
  - "which command used for binary detection (cross-platform sufficient for this project)"

patterns-established:
  - "infrastructure/external/ directory for external CLI tool adapters"
  - "IExternalSearchProvider port pattern for optional tool delegation"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03, QUAL-04]

duration: 4min
completed: 2026-03-18
---

# Phase 27 Plan 01: QmdRunner Adapter Summary

**IExternalSearchProvider domain port and QmdRunner subprocess adapter for optional qmd markdown file search integration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T19:04:20Z
- **Completed:** 2026-03-18T19:08:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Defined IExternalSearchProvider domain port with QmdSearchResult and QmdHealthInfo types (zero external dependencies)
- Implemented QmdRunner infrastructure adapter using spawn-based subprocess invocation
- Created standalone isQmdAvailable() and getQmdInfo() convenience functions for non-DI contexts
- TDD workflow followed: RED commit (failing tests) then GREEN commit (passing implementation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define IExternalSearchProvider port** - `8a926a1` (feat)
2. **Task 2 RED: Failing tests** - `68b7de3` (test)
3. **Task 2 GREEN: Implementation** - `9384fc6` (feat)

## Files Created/Modified
- `src/domain/ports/services.ts` - Added QmdSearchResult, QmdHealthInfo, IExternalSearchProvider interfaces
- `src/domain/ports/index.ts` - Added type exports for new interfaces
- `src/infrastructure/external/qmd-runner.ts` - QmdRunner class implementing IExternalSearchProvider via spawn
- `src/infrastructure/external/qmd-runner.test.ts` - 15 unit tests (256 lines) covering all paths
- `src/infrastructure/external/index.ts` - Barrel export for external adapters

## Decisions Made
- Followed ClaudeSummaryGenerator spawn pattern exactly for consistency across infrastructure adapters
- Standalone functions duplicate class logic rather than delegating to an instance, keeping them dependency-free
- Used `which qmd` for binary detection (sufficient for this project's Unix-like environments)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added error-path tests for standalone functions**
- **Found during:** Task 2 (GREEN phase coverage review)
- **Issue:** Standalone isQmdAvailable() and getQmdInfo() only had success-path tests, leaving catch blocks uncovered (90.91% function coverage)
- **Fix:** Added 2 additional test cases covering error paths for standalone functions
- **Files modified:** src/infrastructure/external/qmd-runner.test.ts
- **Verification:** Line coverage at 100%, aggregate function coverage at 95.45%
- **Committed in:** 9384fc6 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Coverage gap fix, no scope creep. Test count increased from 13 to 15.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Domain port and infrastructure adapter ready for Plan 27-02
- Plan 27-02 will wire QmdRunner to search command --files flag and doctor qmd status check
- Barrel export at infrastructure/external/index.ts ready for import

---
*Phase: 27-qmd-integration*
*Completed: 2026-03-18*
