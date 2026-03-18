---
phase: 29-ambient-context
plan: 02
subsystem: application
tags: [ambient-context, smart-context, sync-integration, application-service]

requires:
  - phase: 29-01
    provides: IAmbientContextWriter port, AutoMemoryWriter adapter, AmbientContextConfigData
  - phase: 25-intelligence
    provides: SmartContextService, SmartContextResult, ContextSection
provides:
  - AmbientContextService composing SmartContextService + IAmbientContextWriter via DI
  - runAmbientContextGeneration function in sync command
  - AmbientContextDeps interface for testable sync integration
affects: [sync-hook, install-command]

tech-stack:
  added: []
  patterns: [di-deps-pattern-for-sync-integration, structural-typing-for-formatter]

key-files:
  created:
    - src/application/services/ambient-context-service.ts
    - src/application/services/ambient-context-service.test.ts
  modified:
    - src/application/services/index.ts
    - src/presentation/cli/commands/sync.ts
    - src/presentation/cli/commands/sync.test.ts

key-decisions:
  - "AmbientContextDeps interface for DI-based testing of sync integration (matches EmbeddingPassDeps pattern)"
  - "Formatter injected as structural type (duck typing) to avoid presentation-layer import"
  - "Ambient context runs after memory file sync, before embedding pass"
  - "Non-fatal: errors caught and logged to stderr, never fail the overall sync"
  - "Lazy dynamic imports for all ambient context dependencies (zero startup overhead)"

patterns-established:
  - "AmbientContextDeps DI pattern: production path uses lazy imports, test path uses injected deps"
  - "buildSummaryBlock extracts section line counts for concise MEMORY.md block"

requirements-completed: [QUAL-01, QUAL-02, QUAL-03, QUAL-04]

duration: 5min
completed: 2026-03-18
---

# Phase 29 Plan 02: Ambient Context Service and Sync Integration Summary

**AmbientContextService application service composing SmartContextService + IAmbientContextWriter with sync command integration for automatic context.md and MEMORY.md generation after every sync**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T19:14:36Z
- **Completed:** 2026-03-18T19:19:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- AmbientContextService in application layer composes SmartContextService, IAmbientContextWriter, and a structurally-typed formatter via constructor DI
- generateAmbientContext handles three result paths: success (writes context.md + MEMORY.md), project-not-found, no-context
- buildSummaryBlock produces a concise MEMORY.md block with decision/learnings/friction counts and last synced date
- Sync command calls runAmbientContextGeneration after memory file sync, before embedding pass
- Non-fatal error handling: ambient context failure never fails the overall sync
- All lazy imports: SmartContextService, AutoMemoryWriter, SqliteProjectResolver loaded only when ambient context is enabled

## Task Commits

Each task was committed atomically:

1. **Task 1: AmbientContextService application service** - `86a4a2b` (feat)
2. **Task 2: Sync command integration** - `99500ef` (feat)

## Files Created/Modified
- `src/application/services/ambient-context-service.ts` - AmbientContextService class with generateAmbientContext and buildSummaryBlock methods (157 lines)
- `src/application/services/ambient-context-service.test.ts` - 10 unit tests with mock SmartContextService, IAmbientContextWriter, and formatter (345 lines)
- `src/application/services/index.ts` - Barrel export for AmbientContextService, AmbientContextOptions, AmbientContextResult
- `src/presentation/cli/commands/sync.ts` - runAmbientContextGeneration function with AmbientContextDeps DI pattern, called after runMemoryFileSync
- `src/presentation/cli/commands/sync.test.ts` - 5 integration tests for enabled/disabled/error/quiet/success scenarios

## Decisions Made
- Used AmbientContextDeps DI interface (matching existing EmbeddingPassDeps and BackgroundModeDeps patterns) instead of mock.module for testing sync integration -- avoids bun mock caching issues
- Formatter dependency uses structural typing (`{ formatSmartContext(result): string }`) rather than importing ContextFormatter from presentation layer -- maintains hexagonal boundary
- Ambient context runs after memory file sync but before embedding pass -- ensures memory files are indexed before context generation, and embedding doesn't depend on context
- Non-fatal error handling: try/catch wraps the entire ambient context flow, errors go to console.error, sync continues normally
- Lazy imports for all ambient context dependencies -- zero startup cost when ambient context is disabled or sync is invoked for other purposes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - ambient context generation is enabled by default (ambientContext.enabled: true in config). Users can disable it by setting `ambientContext.enabled: false` in `~/.config/memory/config.json`.

## Next Phase Readiness
- Phase 29 is now complete (both plans done)
- The end-to-end ambient context pipeline is operational: sync triggers SmartContextService query, formats via AI formatter, writes context.md, updates MEMORY.md with marker-based merge
- Phase 28 (Friction Universalization) still needs discuss-phase before planning
- Pre-existing issue: smart-context-service.test.ts "daily logs filtered" test is time-sensitive and may fail near day boundaries

## Self-Check: PASSED

- `src/application/services/ambient-context-service.ts` - FOUND (157 lines, exceeds 60 min)
- `src/application/services/ambient-context-service.test.ts` - FOUND (345 lines, exceeds 80 min)
- `src/application/services/index.ts` - FOUND (barrel exports present)
- `src/presentation/cli/commands/sync.ts` - FOUND (contains runAmbientContextGeneration)
- `src/presentation/cli/commands/sync.test.ts` - FOUND (5 new ambient context tests)
- Commit `86a4a2b` - FOUND (Task 1)
- Commit `99500ef` - FOUND (Task 2)

---
*Phase: 29-ambient-context*
*Completed: 2026-03-18*
