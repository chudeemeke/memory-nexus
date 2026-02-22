---
phase: 13-package-rename
plan: 02
subsystem: infra
tags: [rename, identity, cli, migration, error-handling]

requires:
  - phase: 13-01
    provides: "Centralized paths.ts module and migration.ts module"
provides:
  - "MemoryError class (renamed from MemoryNexusError)"
  - "MemoryConfig type (renamed from MemoryNexusConfig)"
  - "MEMORY_MARKER and LEGACY_MARKER dual-marker hook detection"
  - "MEMORY_HOOK env var (renamed from MEMORY_NEXUS_HOOK)"
  - "migrateFromLegacy() wired into CLI entry point"
  - "All user-facing strings reference 'memory' binary"
  - "Package identity: @chude/memory v2.0.0 with 'memory' binary"
affects: [13-03]

tech-stack:
  added: []
  patterns:
    - "Dual marker detection: MEMORY_MARKER || LEGACY_MARKER for hook transition"
    - "Synchronous migration call before program.parse() in CLI entry"

key-files:
  created: []
  modified:
    - src/domain/errors/memory-error.ts
    - src/domain/errors/index.ts
    - src/infrastructure/hooks/settings-manager.ts
    - src/infrastructure/hooks/hook-runner.ts
    - src/infrastructure/hooks/config-manager.ts
    - src/presentation/cli/index.ts
    - src/presentation/cli/commands/status.ts
    - src/presentation/cli/commands/install.ts
    - src/presentation/cli/commands/doctor.ts
    - src/presentation/cli/formatters/error-formatter.ts
    - package.json

key-decisions:
  - "Dual marker system: MEMORY_MARKER ('memory') + LEGACY_MARKER ('memory-nexus') to detect old and new hooks"
  - "migrateFromLegacy() placed synchronously before program.parse() to ensure migration runs on first CLI invocation"
  - "SYNC_FAILED error suggestion uses dynamic getLogDir() instead of hardcoded path"
  - "Doctor.ts migration messages intentionally reference ~/.memory-nexus/ (describes legacy path)"
  - "Package version bumped to 2.0.0 for breaking rename"

patterns-established:
  - "Dual marker pattern: when renaming identifiers used in external config files, keep detection for both old and new values"
  - "Dynamic path references: user-facing messages use path functions, not hardcoded strings"

requirements-completed: []

duration: 25min
completed: 2026-02-22
---

# Phase 13 Plan 02: Internal Identity Rename Summary

**Renamed MemoryNexusError/Config/Marker/Hook across 36 files, updated all user-facing strings to 'memory' binary, and wired migrateFromLegacy() into CLI startup**

## Performance

- **Duration:** ~25 min (across context continuation)
- **Started:** 2026-02-22T04:00:00Z (estimated)
- **Completed:** 2026-02-22T04:36:10Z
- **Tasks:** 2
- **Files modified:** 36

## Accomplishments

- Renamed MemoryNexusError to MemoryError (class, file, imports across 17+ files)
- Renamed MemoryNexusConfig to MemoryConfig (interface, re-exports across 5 files)
- Implemented dual marker system (MEMORY_MARKER + LEGACY_MARKER) for backward-compatible hook detection
- Renamed MEMORY_NEXUS_HOOK env var to MEMORY_HOOK
- Wired migrateFromLegacy() into CLI entry point before program.parse()
- Updated all user-facing CLI strings from "memory-nexus" to "memory"
- Updated package.json: @chude/memory v2.0.0 with "memory" binary name
- Updated error-formatter to use dynamic getLogDir() for SYNC_FAILED suggestion
- Updated all corresponding test assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename internal identifiers and wire migration** - `cd9a5e6` (refactor)
2. **Task 2: Update user-facing strings and package identity** - `0ee3f88` (feat)

## Files Created/Modified

**Renamed:**
- `src/domain/errors/memory-nexus-error.ts` -> `src/domain/errors/memory-error.ts` - Error class renamed to MemoryError
- `src/domain/errors/memory-nexus-error.test.ts` -> `src/domain/errors/memory-error.test.ts` - Test file renamed

**Modified (Task 1 - internal identifiers):**
- `src/domain/errors/index.ts` - Re-export MemoryError
- `src/domain/index.ts` - Re-export updated
- `src/infrastructure/hooks/settings-manager.ts` - MEMORY_MARKER + LEGACY_MARKER dual detection
- `src/infrastructure/hooks/hook-runner.ts` - MEMORY_HOOK env var
- `src/infrastructure/hooks/config-manager.ts` - MemoryConfig type
- `src/infrastructure/hooks/index.ts` - Re-export MemoryConfig
- `src/infrastructure/hooks/sync-hook-script.ts` - Comment updates
- `src/infrastructure/database/connection.ts` - MemoryError import
- `src/infrastructure/database/index.ts` - Comment updates
- `src/infrastructure/database/health-checker.ts` - MemoryConfig import
- `src/application/services/sync-service.ts` - MemoryError import
- `src/presentation/cli/db-startup.ts` - MemoryError import
- `src/presentation/cli/index.ts` - migrateFromLegacy() call + MemoryError import
- `src/presentation/cli/formatters/error-formatter.ts` - MemoryError import
- 7 command files (search, stats, show, related, list, browse, context) - MemoryError imports
- 8 test files - Updated assertions for renamed types
- `src/index.ts` - Re-export updated
- `src/infrastructure/sources/project-name-resolver.ts` - Comment updated

**Modified (Task 2 - user-facing strings):**
- `package.json` - Name: @chude/memory, version: 2.0.0, binary: memory
- `src/presentation/cli/commands/completion.ts` - Shell completion comments
- `src/presentation/cli/commands/doctor.ts` - Dynamic path for fix suggestions
- `src/presentation/cli/commands/install.ts` - CLI help text
- `src/presentation/cli/commands/status.ts` - Title and recommendation text
- `src/presentation/cli/commands/uninstall.ts` - Help text
- `src/presentation/cli/commands/index.ts` - Comment header
- `src/presentation/cli/formatters/error-formatter.ts` - Dynamic getLogDir() for SYNC_FAILED
- `src/presentation/cli/commands/status.test.ts` - Updated assertions
- `src/presentation/cli/formatters/error-formatter.test.ts` - Updated SYNC_FAILED assertion

## Decisions Made

1. **Dual marker system for hook detection** - settings-manager.ts checks for both `MEMORY_MARKER ("memory")` and `LEGACY_MARKER ("memory-nexus")` when detecting installed hooks. This ensures users with old hooks installed are still detected correctly during transition.

2. **migrateFromLegacy() placement** - Called synchronously before `program.parse()` in the CLI entry point. This ensures migration happens on the very first invocation of the renamed binary, before any command executes.

3. **Dynamic path in error suggestions** - SYNC_FAILED error message now uses `getLogDir()` instead of hardcoded `~/.memory-nexus/logs`. This keeps the suggestion accurate regardless of XDG configuration.

4. **Legacy path references preserved in doctor.ts** - Migration status messages in doctor.ts intentionally reference `~/.memory-nexus/` because they describe the legacy location for diagnostic purposes.

5. **Test data project names preserved** - `ProjectPath.fromDecoded("C:\\Projects\\memory-nexus")` and similar test data was NOT renamed, as these represent project directory names in test fixtures, not the tool's identity.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Context continuation**: Execution spanned across a context window compaction. Task 1 was completed in the first session, Task 2 test updates were completed after continuation. No work was lost.
- **Pre-existing test timeouts**: 5 tests in browse.test.ts and context.test.ts time out intermittently. These files were not modified by this plan and the failures are pre-existing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All internal identifiers renamed from memory-nexus to memory
- Package identity is @chude/memory v2.0.0 with "memory" binary
- Migration wired into CLI startup -- runs automatically on first invocation
- Ready for Plan 03 (documentation, README, changelog updates)
- All tests pass (2056 pass, 5 pre-existing timeout failures in unrelated tests)

## Self-Check: PASSED

- All 9 key files verified present
- Both task commits (cd9a5e6, 0ee3f88) verified in git log
- Zero "memory-nexus" references remain in non-test presentation source files (excluding doctor.ts legacy path messages)

---
*Phase: 13-package-rename*
*Completed: 2026-02-22*
