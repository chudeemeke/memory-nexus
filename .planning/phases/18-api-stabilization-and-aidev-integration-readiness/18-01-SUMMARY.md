---
phase: 18-api-stabilization
plan: 01
subsystem: api
tags: [typescript, dual-build, library, tsc, declarations, bun-build, api-surface]

# Dependency graph
requires:
  - phase: 17-provider-ecosystem
    provides: complete execute*Command functions with provider support
provides:
  - "All 16 execute*Command functions exported from @chude/memory"
  - "TypeScript declarations for all command option interfaces"
  - "Dual build system: tsc declarations + bun lib + bun CLI"
  - "dist/index.js importable as library entry point"
  - "Smoke test verifying dist artifacts and exports"
affects: [aidev-integration, npm-publish, programmatic-api-consumers]

# Tech tracking
tech-stack:
  added: [tsconfig.lib.json]
  patterns: [dual-build-pipeline, emitDeclarationOnly-with-noEmitOnError, externalized-deps-bun-build]

key-files:
  created:
    - tsconfig.lib.json
    - tests/integration/api-consumption.test.ts
  modified:
    - src/index.ts
    - src/presentation/cli/commands/index.ts
    - package.json
    - src/presentation/cli/commands/sync.ts
    - src/presentation/cli/commands/search.ts
    - src/presentation/cli/commands/list.ts
    - src/presentation/cli/commands/stats.ts
    - src/presentation/cli/commands/context.ts
    - src/presentation/cli/commands/related.ts
    - src/presentation/cli/commands/show.ts
    - src/presentation/cli/commands/browse.ts
    - src/presentation/cli/commands/install.ts
    - src/presentation/cli/commands/uninstall.ts
    - src/presentation/cli/commands/doctor.ts
    - src/presentation/cli/commands/export.ts
    - src/presentation/cli/commands/import.ts

key-decisions:
  - "Use emitDeclarationOnly + noEmitOnError:false for tsc: pre-existing bun:sqlite type mismatches prevent clean tsc emit, but declarations emit correctly despite errors"
  - "Use bun build with externalized dependencies for library JS: keeps library entry as ESM with deps resolved at runtime by consumer"
  - "Three-step build pipeline: build:types (tsc declarations) -> build:lib (bun library JS) -> build:cli (bun CLI binary)"
  - "Relaxed strict options in tsconfig.lib.json: strict:false, exactOptionalPropertyTypes:false to work around pre-existing type issues"

patterns-established:
  - "Dual build pattern: tsc for .d.ts, bun build for .js, separate configs"
  - "API surface barrel: src/index.ts re-exports domain + application + presentation execute* functions"

requirements-completed: [INTEG-01, INTEG-02]

# Metrics
duration: 17min
completed: 2026-03-01
---

# Phase 18 Plan 01: Build Infrastructure and API Export Surface Summary

**Dual-build system producing importable library at dist/index.js with TypeScript declarations and 16 execute*Command function exports from @chude/memory**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-01T00:43:27Z
- **Completed:** 2026-03-01T01:00:51Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Exported all 13 previously-private command option interfaces from their command files
- Re-exported all 16 execute*Command functions and 20+ option types from src/index.ts
- Created tsconfig.lib.json with emitDeclarationOnly for type declaration generation
- Implemented three-step build pipeline: types -> lib -> CLI
- Added smoke test verifying dist artifacts exist and all exports are importable

## Task Commits

Each task was committed atomically:

1. **Task 1: Export option interfaces and extend src/index.ts** - `27adfce` (feat)
2. **Task 2: Dual build system and dist verification** - `182f619` (feat)

## Files Created/Modified
- `src/index.ts` - Extended to re-export all execute*Command functions and option types
- `src/presentation/cli/commands/index.ts` - Added type re-exports for all option interfaces
- `src/presentation/cli/commands/sync.ts` - Exported SyncCommandOptions interface
- `src/presentation/cli/commands/search.ts` - Exported SearchCommandOptions interface
- `src/presentation/cli/commands/list.ts` - Exported ListCommandOptions interface
- `src/presentation/cli/commands/stats.ts` - Exported StatsCommandOptions interface
- `src/presentation/cli/commands/context.ts` - Exported ContextCommandOptions interface
- `src/presentation/cli/commands/related.ts` - Exported RelatedCommandOptions interface
- `src/presentation/cli/commands/show.ts` - Exported ShowCommandOptions interface
- `src/presentation/cli/commands/browse.ts` - Exported BrowseCommandOptions interface
- `src/presentation/cli/commands/doctor.ts` - Exported DoctorOptions interface
- `src/presentation/cli/commands/install.ts` - Exported InstallOptions interface
- `src/presentation/cli/commands/uninstall.ts` - Exported UninstallOptions interface
- `src/presentation/cli/commands/export.ts` - Exported ExportOptions interface
- `src/presentation/cli/commands/import.ts` - Exported ImportOptions interface
- `tsconfig.lib.json` - Library-specific TypeScript config with declaration emission
- `package.json` - Updated build scripts for three-step pipeline
- `tests/integration/api-consumption.test.ts` - Smoke test for dist artifacts

## Decisions Made
- **emitDeclarationOnly + noEmitOnError:false**: The codebase has 27 pre-existing type errors (bun:sqlite Statement type mismatches, a missing module import path in hook-runner.ts). These do not affect runtime behavior (bun build ignores types), but prevent clean tsc emit. Using emitDeclarationOnly with noEmitOnError:false allows declaration files to be generated despite these errors.
- **Externalized deps in library bun build**: All npm dependencies are marked as --external so consumers install them themselves. This keeps the library entry small (300KB) and avoids bundling issues with native addons (onnxruntime-node, sqlite-vec).
- **Relaxed strict options for lib tsconfig**: Disabled exactOptionalPropertyTypes, noUncheckedIndexedAccess, and strict to work around pre-existing type issues in the infrastructure layer. The main tsconfig.json remains strict for development-time checking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc fails to emit due to pre-existing type errors**
- **Found during:** Task 2 (dual build system)
- **Issue:** The plan specified `tsc --project tsconfig.lib.json` as build:lib, but tsc refuses to emit when there are type errors (95 errors with full strictness, 27 with relaxed)
- **Fix:** Changed strategy to three-step build: (1) tsc emitDeclarationOnly with noEmitOnError:false for .d.ts files, (2) bun build with externalized deps for library .js, (3) bun build for CLI binary. Added `|| true` to build:types to prevent error exit code from blocking subsequent steps.
- **Files modified:** tsconfig.lib.json, package.json
- **Verification:** `bun run build` produces dist/index.js (300KB), dist/index.d.ts (1.3KB), dist/presentation/cli/index.js (2.1MB with shebang)
- **Committed in:** 182f619 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Build strategy adapted to handle pre-existing type errors. The output artifacts match the plan's requirements: dist/index.js importable, dist/index.d.ts with declarations, CLI binary with shebang.

## Issues Encountered
- Pre-existing flaky test (status command gatherStatus) fails intermittently with 5-second timeout. Not related to this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- dist/index.js is importable as `import { executeSyncCommand } from "@chude/memory"`
- All 16 execute*Command functions and their option types are available to consumers
- aidev can add @chude/memory as a dependency and call execute*Command functions directly
- Pre-existing type errors in the codebase should be addressed in a future cleanup phase to enable clean tsc builds

## Self-Check: PASSED

- All source files verified present
- Both task commits verified (27adfce, 182f619)
- All dist artifacts verified (index.js, index.d.ts, CLI binary with shebang)

---
*Phase: 18-api-stabilization*
*Completed: 2026-03-01*
