---
phase: 24-friction-system
plan: 02
subsystem: cli
tags: [friction, commander, service, cli, application-service]

requires:
  - phase: 24-friction-system
    provides: FrictionEntry entity, IFrictionRepository port, SqliteFrictionRepository, friction_log schema

provides:
  - FrictionService application service with business rule enforcement
  - CLI friction command group (log, list, resolve, wont-fix, dashboard)
  - executeFrictionCommand programmatic API
  - NOT_FOUND and INVALID_STATE error codes

affects: [24-03, 25-intelligence]

tech-stack:
  added: []
  patterns:
    - "Commander.js nested subcommands via addCommand() for command groups"
    - "Service-level status guards before repository mutation"
    - "wontFix two-phase flow: resolve() then updateStatus() for correct final state"

key-files:
  created:
    - src/application/services/friction-service.ts
    - src/application/services/friction-service.test.ts
    - src/presentation/cli/commands/friction.ts
    - src/presentation/cli/commands/friction.test.ts
  modified:
    - src/application/services/index.ts
    - src/domain/errors/error-codes.ts
    - src/presentation/cli/formatters/error-formatter.ts
    - src/presentation/cli/commands/index.ts
    - src/presentation/cli/index.ts
    - src/index.ts

key-decisions:
  - "wontFix flow: resolve() sets resolution+resolvedAt, then updateStatus() overwrites status to wont-fix"
  - "Added NOT_FOUND and INVALID_STATE error codes to domain errors (generic, not session-specific)"
  - "--json defined on each subcommand individually (Commander.js does not inherit parent options)"
  - "Dashboard is a stats stub; Plan 03 replaces with rich formatters"

patterns-established:
  - "Commander.js nested subcommand group pattern for domain-specific command families"
  - "Service-layer validation guards: existence + state checks before repository calls"

requirements-completed: [FRIC-01, FRIC-02, FRIC-03]

duration: 14min
completed: 2026-03-08
---

# Phase 24 Plan 02: Friction Service and CLI Summary

**FrictionService application service with business rule enforcement and CLI friction command group (log, list, resolve, wont-fix, dashboard) wired into programmatic API**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-08T10:34:45Z
- **Completed:** 2026-03-08T10:49:16Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- FrictionService with constructor-injected IFrictionRepository: log, list, resolve, wontFix, getStats, getWeeklyTrends
- Business rule validation: entry existence checks, status guards (cannot resolve/wontFix already-closed entries)
- CLI friction command group with 5 subcommands: log, list, resolve, wont-fix, dashboard
- executeFrictionCommand programmatic API returning CommandResult, exported from @chude/memory
- 57 new tests (24 service + 33 CLI) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: FrictionService application service (TDD)** - `73b53ba` (feat)
2. **Task 2: CLI friction commands and programmatic API** - `81e25cb` (feat)

## Files Created/Modified
- `src/application/services/friction-service.ts` - FrictionService with business rule enforcement
- `src/application/services/friction-service.test.ts` - 24 tests with mock IFrictionRepository
- `src/presentation/cli/commands/friction.ts` - CLI command group with 5 subcommands
- `src/presentation/cli/commands/friction.test.ts` - 33 tests with real in-memory database
- `src/application/services/index.ts` - Added FrictionService barrel export
- `src/domain/errors/error-codes.ts` - Added NOT_FOUND and INVALID_STATE error codes
- `src/presentation/cli/formatters/error-formatter.ts` - Added suggestions for new error codes
- `src/presentation/cli/commands/index.ts` - Added friction command exports
- `src/presentation/cli/index.ts` - Registered friction command in CLI
- `src/index.ts` - Added executeFrictionCommand and option types to public API

## Decisions Made
- wontFix two-phase flow: repository.resolve() first (sets status='resolved', resolution, resolved_at), then updateStatus(id, 'wont-fix') to overwrite status. Net result: status=wont-fix with resolution and timestamp set.
- Added generic NOT_FOUND and INVALID_STATE error codes rather than friction-specific ones. These are reusable across any entity.
- --json flag defined on each subcommand individually because Commander.js does not propagate parent options to child commands.
- Dashboard subcommand outputs basic stats text/JSON. Plan 03 will replace with the rich formatter (charts, HTML).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added NOT_FOUND and INVALID_STATE error codes**
- **Found during:** Task 1 (FrictionService)
- **Issue:** Plan references ErrorCode.NOT_FOUND but domain errors only had SESSION_NOT_FOUND. Service needs generic entity-level error codes.
- **Fix:** Added NOT_FOUND and INVALID_STATE to error-codes.ts, added suggestions to error-formatter.ts
- **Files modified:** src/domain/errors/error-codes.ts, src/presentation/cli/formatters/error-formatter.ts
- **Verification:** All tests pass, error codes used in resolve/wontFix validation
- **Committed in:** 73b53ba (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness. Generic error codes are more reusable than friction-specific ones. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Friction CLI fully functional end-to-end
- Ready for 24-03 (Dashboard formatters with rich output, HTML reports)
- FrictionService and executeFrictionCommand available as programmatic API

---
*Phase: 24-friction-system*
*Completed: 2026-03-08*
