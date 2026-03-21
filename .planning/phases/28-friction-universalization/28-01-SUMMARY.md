---
phase: 28-friction-universalization
plan: 01
subsystem: domain
tags: [friction, entity, schema, migration, sqlite]

requires:
  - phase: 24-friction-system
    provides: FrictionEntry entity, IFrictionRepository port, friction_log schema
provides:
  - FrictionEntry with tool, tags, lastReviewedAt fields
  - Open FrictionCategory (any non-empty string)
  - Extended IFrictionRepository with tool/sourceProject filters, markReviewed, findPatterns
  - FrictionStats.byTool breakdown
  - FrictionPattern interface
  - FRICTION_LOG_UNIVERSALIZE_MIGRATION for table recreation
affects: [28-02, 28-03, 28-04, friction-repository, friction-service, friction-cli]

tech-stack:
  added: []
  patterns: [pre-loop migration detection for index-on-missing-column safety]

key-files:
  modified:
    - src/domain/entities/friction-entry.ts
    - src/domain/ports/repositories.ts
    - src/infrastructure/database/schema.ts

key-decisions:
  - "Pre-loop migration: friction_log migration runs before SCHEMA_SQL loop to avoid CREATE INDEX on missing tool column"
  - "COMMON_CATEGORIES as documentation-only export replacing enforced VALID_CATEGORIES"
  - "Category CHECK constraint removed at both domain (type) and infrastructure (SQL) levels"

patterns-established:
  - "Pre-loop migration pattern: detect and migrate old schema before main schema loop when new indexes reference new columns"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03, QUAL-04]

duration: 6min
completed: 2026-03-21
---

# Phase 28 Plan 01: Domain Model and Schema Extension Summary

**FrictionEntry extended with tool (required), tags, lastReviewedAt; category opened from fixed union to any string; schema migration via table recreation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T21:46:10Z
- **Completed:** 2026-03-21T21:52:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- FrictionEntry accepts tool as required field, tags as optional array, lastReviewedAt as optional date
- FrictionCategory changed from 6-value union to any non-empty string
- IFrictionRepository extended with tool/sourceProject filters, markReviewed, findPatterns methods
- Schema migration recreates friction_log table with new columns, preserving data with tool='memory'
- 29 domain entity tests + 122 schema tests passing

## Task Commits

1. **Task 1: Extend FrictionEntry entity and IFrictionRepository port** - `ca84d52` (feat)
2. **Task 2: Schema migration for friction_log table recreation** - `8547054` (feat)

## Files Created/Modified
- `src/domain/entities/friction-entry.ts` - Added tool, tags, lastReviewedAt; open category type
- `src/domain/entities/friction-entry.test.ts` - 29 tests covering new fields and open category
- `src/domain/ports/repositories.ts` - FrictionStats.byTool, FrictionPattern, extended IFrictionRepository
- `src/infrastructure/database/schema.ts` - New FRICTION_LOG_TABLE, FRICTION_LOG_UNIVERSALIZE_MIGRATION, pre-loop migration
- `src/infrastructure/database/schema.test.ts` - 5 new migration tests, updated category CHECK test

## Decisions Made
- Pre-loop migration: friction_log migration runs before SCHEMA_SQL loop to avoid CREATE INDEX on missing tool column (deviation from plan which placed migration after loop)
- COMMON_CATEGORIES as documentation-only export (not enforced)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-loop migration ordering**
- **Found during:** Task 2 (schema migration)
- **Issue:** Plan placed friction migration after SCHEMA_SQL loop, but FRICTION_LOG_TABLE now includes idx_friction_tool which references the tool column. On old databases, the loop hits this index before migration runs, causing "no such column: tool" error.
- **Fix:** Moved migration detection to before the SCHEMA_SQL loop with try/catch for fresh databases where friction_log doesn't exist yet
- **Files modified:** src/infrastructure/database/schema.ts
- **Verification:** All 122 schema tests pass including migration + fresh DB scenarios
- **Committed in:** 8547054

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration ordering fix necessary for correctness. No scope creep.

## Issues Encountered
None beyond the migration ordering issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Domain model and schema ready for infrastructure adapter updates (plan 28-02)
- Downstream tests (friction-repository, friction-service, friction-cli) will need updates to pass tool field and handle byTool in FrictionStats
- FrictionPattern and findPatterns/markReviewed methods need infrastructure implementation

---
*Phase: 28-friction-universalization*
*Completed: 2026-03-21*
