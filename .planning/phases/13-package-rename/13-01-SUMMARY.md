---
phase: 13-package-rename
plan: 01
subsystem: infra
tags: [xdg, paths, migration, rollback, filesystem]

# Dependency graph
requires: []
provides:
  - "Centralized XDG-aware path module (paths.ts) with 9 exported functions"
  - "Legacy migration module (migration.ts) with rollback safety"
  - "All infrastructure modules rewired to delegate path resolution"
  - "Doctor command reports migration status"
affects: [13-02, 13-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized path resolution via paths.ts with test override mechanism"
    - "XDG Base Directory Specification compliance (~/.config/memory, ~/.local/share/memory)"
    - "Synchronous migration with ordered rollback on failure"
    - "EXDEV cross-filesystem fallback (copy+delete when rename fails)"

key-files:
  created:
    - src/infrastructure/paths.ts
    - src/infrastructure/paths.test.ts
    - src/infrastructure/migration.ts
    - src/infrastructure/migration.test.ts
  modified:
    - src/infrastructure/hooks/config-manager.ts
    - src/infrastructure/hooks/log-writer.ts
    - src/infrastructure/hooks/settings-manager.ts
    - src/infrastructure/hooks/hook-runner.ts
    - src/infrastructure/database/connection.ts
    - src/infrastructure/signals/checkpoint-manager.ts
    - src/presentation/cli/commands/doctor.ts

key-decisions:
  - "XDG paths: config at ~/.config/memory, data at ~/.local/share/memory"
  - "paths.ts test override: setTestPaths/resetTestPaths with independent config/data dir overrides"
  - "moveFileOrDir exported for direct EXDEV fallback testing"
  - "Migration hook re-install failure is non-fatal (logged to errors array, migrated still true)"

patterns-established:
  - "Path resolution: always import from paths.ts, never construct with homedir() directly"
  - "Test isolation: use setTestPaths() to redirect paths to temp directories"
  - "XDG override: respect XDG_CONFIG_HOME and XDG_DATA_HOME independently"

# Metrics
duration: 14min
completed: 2026-02-22
---

# Phase 13 Plan 01: Centralized Paths and Migration Summary

**XDG-aware centralized path module with synchronous legacy migration, rollback safety, and all 6 infrastructure modules rewired to delegate path resolution**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-22T03:13:00Z
- **Completed:** 2026-02-22T03:27:29Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Centralized all filesystem paths into paths.ts with XDG Base Directory Specification compliance
- Created synchronous migration module with rollback safety, EXDEV fallback, and hook re-install
- Rewired all 6 infrastructure modules to delegate path resolution to paths.ts
- Added migration status reporting to doctor command (pending/partial warnings, JSON output)
- 100% function and line coverage on both new modules (paths.ts, migration.ts)
- Zero regressions across 2061 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Create centralized paths module and migration module with tests** - `7129a56` (feat)
2. **Task 2: Rewire infrastructure modules to use centralized paths and add migration to doctor** - `d8a38cb` (refactor)

## Files Created/Modified

### Created
- `src/infrastructure/paths.ts` - Centralized XDG-aware path definitions (9 functions + test overrides)
- `src/infrastructure/paths.test.ts` - 26 tests covering XDG vars, defaults, overrides
- `src/infrastructure/migration.ts` - Legacy migration with rollback, EXDEV fallback, hook re-install
- `src/infrastructure/migration.test.ts` - 29 tests covering all migration scenarios

### Modified
- `src/infrastructure/hooks/config-manager.ts` - Delegates to paths.getConfigDir/getConfigPath
- `src/infrastructure/hooks/config-manager.test.ts` - Updated path expectations to XDG layout
- `src/infrastructure/hooks/log-writer.ts` - Delegates to paths.getLogDir
- `src/infrastructure/hooks/log-writer.test.ts` - Updated path expectations to XDG layout
- `src/infrastructure/hooks/settings-manager.ts` - Delegates to paths.getBackupDir/getHookDir
- `src/infrastructure/hooks/settings-manager.test.ts` - Updated default path assertions
- `src/infrastructure/hooks/hook-runner.ts` - Delegates to paths.getLogDir
- `src/infrastructure/hooks/hook-runner.test.ts` - Updated path assertion from .memory-nexus to memory
- `src/infrastructure/database/connection.ts` - Delegates to paths.getDbPath
- `src/infrastructure/database/connection.test.ts` - Updated path assertion
- `src/infrastructure/signals/checkpoint-manager.ts` - Delegates to paths.getCheckpointPath
- `src/infrastructure/signals/checkpoint-manager.test.ts` - Updated path assertion
- `src/presentation/cli/commands/doctor.ts` - Added migration status check and JSON migration field
- `src/presentation/cli/commands/doctor.test.ts` - Added migration status JSON output test

## Decisions Made

- **XDG split:** Config at `~/.config/memory`, data at `~/.local/share/memory` (not a single directory)
- **Test override mechanism:** Independent configDir/dataDir overrides via setTestPaths/resetTestPaths, allowing partial overrides
- **moveFileOrDir exported:** Exported for direct EXDEV testing since cross-filesystem errors cannot be triggered naturally in test environments
- **Hook re-install non-fatal:** If uninstallHooks/installHooks throws during migration, error is logged but migration reports success (data is already moved)
- **settings-manager retains homedir import:** It still needs homedir() for getClaudeSettingsPath() which references ~/.claude/settings.json (not a memory-nexus path)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Config-manager test paths:** Tests that construct expected paths using `join(testDir, ".memory-nexus")` needed updating to `join(testDir, ".config", "memory")` since config-manager now uses the XDG path layout. This was expected and specified in the plan.
- **Bun test mock leakage:** spyOn(nodeFs, "renameSync") mock leaked to subsequent tests when not restored before assertions. Fixed by restoring mocks immediately after the function call, before assertions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All infrastructure path resolution centralized and tested
- Migration module ready for integration into CLI startup flow (future plan)
- Doctor reports migration status for user diagnostics
- Ready for Plan 02 (package.json rename) and Plan 03 (deprecation stub)

## Self-Check: PASSED

- All 4 created files verified on disk
- Both task commits (7129a56, d8a38cb) verified in git history
- Full test suite: 2061 pass, 0 fail

---
*Phase: 13-package-rename*
*Completed: 2026-02-22*
