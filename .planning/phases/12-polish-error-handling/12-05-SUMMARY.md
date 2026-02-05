---
phase: 12-polish-error-handling
plan: 05
subsystem: database
tags: [export, import, backup, restore, json, sqlite]

# Dependency graph
requires:
  - phase: 02-database-layer
    provides: SQLite schema and repositories for all data types
  - phase: 12-01
    provides: Error codes and error formatter for consistent error handling
provides:
  - Export service for JSON backup
  - Import service for restore with validation
  - Round-trip data integrity verification
  - CLI commands for export and import operations
affects: [12-09-final-integration, documentation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSON serialization for database backup"
    - "Round-trip verification for data integrity"
    - "CLI option patterns for quiet/json/force/clear modes"

key-files:
  created:
    - src/application/services/export-service.ts
    - src/application/services/export-service.test.ts
    - src/presentation/cli/commands/export.ts
    - src/presentation/cli/commands/export.test.ts
    - src/presentation/cli/commands/import.ts
    - src/presentation/cli/commands/import.test.ts
  modified:
    - src/application/services/index.ts
    - src/presentation/cli/commands/index.ts
    - src/presentation/cli/index.ts

key-decisions:
  - "Version field 1.0 in export for future compatibility"
  - "FTS5 content handled via triggers, not direct deletion"
  - "process.exitCode = 0 resets exit code (undefined does not)"
  - "Unique test directories per test for Windows file locking isolation"
  - "--force flag for merge, --clear flag for replace mode"

patterns-established:
  - "Export interface per entity type for JSON serialization"
  - "Validation function returns {valid, version, error} tuple"
  - "hasExistingData() utility for conflict detection"

# Metrics
duration: ~45min
completed: 2026-02-05
---

# Phase 12 Plan 05: Export/Import Commands Summary

**Database backup and restore with JSON serialization, round-trip integrity verification, and CLI commands for export/import operations**

## Performance

- **Duration:** ~45 minutes
- **Started:** 2026-02-05
- **Completed:** 2026-02-05
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Complete export service with JSON serialization for all data types (sessions, messages, toolUses, entities, links, sessionEntities, entityLinks, extractionStates)
- Import service with validation and conflict handling (--clear for replace, --force for merge)
- Round-trip integrity verification test proving export -> import preserves all data exactly
- CLI export command with --quiet and --json output options
- CLI import command with --clear, --force, --quiet, --json options

## Task Commits

Each task was committed atomically:

1. **Task 1: Create export/import service with round-trip verification** - `9a133ba` (feat)
2. **Task 2: Create export and import CLI commands** - `547318d` (feat)

## Files Created/Modified

- `src/application/services/export-service.ts` - Export/import logic with validation and round-trip support
- `src/application/services/export-service.test.ts` - 25 tests including critical round-trip integrity test
- `src/application/services/index.ts` - Added exports for export-service functions and types
- `src/presentation/cli/commands/export.ts` - CLI export command with --quiet, --json options
- `src/presentation/cli/commands/export.test.ts` - 13 tests for export command
- `src/presentation/cli/commands/import.ts` - CLI import command with --clear, --force, --quiet, --json options
- `src/presentation/cli/commands/import.test.ts` - 18 tests for import command
- `src/presentation/cli/commands/index.ts` - Added exports for createExportCommand, createImportCommand
- `src/presentation/cli/index.ts` - Registered export and import commands in main CLI

## Decisions Made

- **Version field "1.0":** Export includes version for future compatibility checking
- **FTS5 deletion via triggers:** Cannot DELETE FROM FTS5 external content tables directly; delete from source table and let triggers handle cleanup
- **process.exitCode = 0:** Using 0 to reset exit code instead of undefined (undefined doesn't clear previous value in Bun)
- **Unique test directories:** Each test gets unique directory with testCounter to avoid Windows file locking issues
- **--force vs --clear semantics:** --clear replaces all data, --force allows merge with existing data

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FTS5 SQLITE_CORRUPT_VTAB error**
- **Found during:** Task 1 (export-service.test.ts clearAllTables)
- **Issue:** Direct DELETE FROM messages_fts caused SQLITE_CORRUPT_VTAB because FTS5 external content tables cannot be deleted directly
- **Fix:** Removed direct FTS5 delete; let triggers handle cleanup when deleting from messages_meta
- **Files modified:** src/application/services/export-service.ts
- **Verification:** All 25 tests pass
- **Committed in:** 9a133ba (Task 1 commit)

**2. [Rule 1 - Bug] process.exitCode not resetting properly**
- **Found during:** Task 2 (import.test.ts)
- **Issue:** Tests failed because `process.exitCode = undefined` doesn't clear a previously set value
- **Fix:** Changed to `process.exitCode = 0` and check `toBe(0)` instead of `toBeUndefined()`
- **Files modified:** src/presentation/cli/commands/export.test.ts, src/presentation/cli/commands/import.test.ts
- **Verification:** All 31 CLI tests pass
- **Committed in:** 547318d (Task 2 commit)

**3. [Rule 3 - Blocking] Windows file locking in tests**
- **Found during:** Task 2 (import.test.ts)
- **Issue:** Tests failed with EBUSY errors due to SQLite database files being locked when tests shared directories
- **Fix:** Used unique test directories per test with testCounter increment
- **Files modified:** src/presentation/cli/commands/import.test.ts
- **Verification:** All import tests pass
- **Committed in:** 547318d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Export/import commands ready for use: `memory export backup.json` and `memory import backup.json`
- Backup format versioned for future compatibility
- Full data integrity verified via round-trip test
- Ready for Phase 12 remaining plans

---
*Phase: 12-polish-error-handling*
*Completed: 2026-02-05*
