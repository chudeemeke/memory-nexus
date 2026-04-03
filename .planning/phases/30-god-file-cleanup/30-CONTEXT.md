# Phase 30: God File Cleanup - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Split sync.ts (928 lines, 16 functions) and friction.ts (638 lines, 9 functions) into focused SRP-compliant modules. Pure refactoring -- no behavioral changes, no layer movement, no new features.

</domain>

<decisions>
## Implementation Decisions

### Module Boundaries
- **D-01:** sync.ts splits into one module per concern: core sync orchestration, embedding pass, background mode, memory file sync, ambient context generation, shared helpers (lazy loaders, dry run, error handling, drive resolver)
- **D-02:** friction.ts splits into one module per handler: command registration/dispatch, log, list, resolve, wontfix, dashboard, purge
- **D-03:** Each module must stay under 200 lines and handle exactly one concern

### File Organization
- **D-04:** Use subdirectory structure: `commands/sync/` and `commands/friction/` with `index.ts` as the entry point for each
- **D-05:** Original `sync.ts` and `friction.ts` are replaced by subdirectories (not kept as re-export barrels alongside directories)
- **D-06:** Subdirectory layout:
  ```
  commands/sync/
    index.ts          # createSyncCommand, executeSyncCommand
    embedding-pass.ts # runEmbeddingPass, handleModelChange
    background.ts     # handleBackgroundMode
    memory-files.ts   # runMemoryFileSync, reportMemoryFileResults
    ambient.ts        # runAmbientContextGeneration
    helpers.ts        # lazy loaders, executeDryRun, handleError, reportResults, createDriveResolver
  commands/friction/
    index.ts          # createFrictionCommand, executeFrictionCommand
    log.ts            # handleLog
    list.ts           # handleList
    resolve.ts        # handleResolve
    wontfix.ts        # handleWontFix
    dashboard.ts      # handleDashboard
    purge.ts          # handlePurge
  ```

### Layer Movement
- **D-07:** Pure split only -- no relocating functions between layers. All functions stay in the presentation layer where they currently live.
- **D-08:** Document architecturally misplaced functions (handleBackgroundMode is infrastructure, handleModelChange is application) as a note for future cleanup, but do not move them in this phase.
- **D-09:** Rationale: Split achieves SRP at module level. Layer correction is a separate concern with different risks (changed call chains, error propagation, timing). Incremental refactoring in small safe steps.

### Test Organization
- **D-10:** Split tests alongside modules: each module gets its own test file co-located in the same directory (e.g., `sync/embedding-pass.test.ts`, `friction/dashboard.test.ts`)
- **D-11:** Existing `sync.test.ts` and `friction.test.ts` are replaced by per-module test files
- **D-12:** `sync.integration.test.ts` and `sync-lazy-loaders.test.ts` move into the `sync/` subdirectory
- **D-13:** All tests must pass without modifying test assertions -- behavioral equivalence is the gate

### Claude's Discretion
- Exact function-to-module assignment may vary from D-06 if line count constraints or import cycles require adjustment
- Helper function grouping within `helpers.ts` can be further split if the file exceeds 200 lines

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Files (the god files to split)
- `src/presentation/cli/commands/sync.ts` -- 928 lines, 16 functions, the primary target
- `src/presentation/cli/commands/friction.ts` -- 638 lines, 9 functions, the secondary target

### Existing Tests
- `src/presentation/cli/commands/sync.test.ts` -- sync unit tests
- `src/presentation/cli/commands/sync.integration.test.ts` -- sync integration tests
- `src/presentation/cli/commands/sync-lazy-loaders.test.ts` -- lazy loader tests (already extracted)
- `src/presentation/cli/commands/friction.test.ts` -- friction unit tests

### Command Registry
- `src/presentation/cli/commands/index.ts` -- barrel file that imports createSyncCommand and createFrictionCommand; must be updated to point to subdirectory index.ts files

### Application Layer Services (understand what sync.ts calls)
- `src/application/services/sync-service.ts` -- core sync logic
- `src/application/services/embedding-service.ts` -- embedding orchestration
- `src/application/services/ambient-context-service.ts` -- ambient context generation
- `src/application/services/memory-file-sync-service.ts` -- memory file sync
- `src/application/services/friction-service.ts` -- friction CRUD operations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sync-lazy-loaders.test.ts` already exists as a partially extracted test file -- indicates the split pattern was anticipated
- All application services are already well-factored (SyncService, EmbeddingService, etc.) -- the presentation layer is the only bloated layer

### Established Patterns
- All other commands are single flat files (backfill.ts, browse.ts, context.ts, etc.) -- subdirectories are a new pattern for commands
- Test files are co-located with source files (`*.test.ts` alongside `*.ts`)
- barrel files (`index.ts`) re-export public symbols for clean imports

### Integration Points
- `commands/index.ts` imports `createSyncCommand` and `createFrictionCommand` -- must be updated to import from subdirectory index files
- Programmatic API exports (`src/index.ts`) may reference `executeSyncCommand` and `executeFrictionCommand` -- import paths must be updated
- `browse.ts` dispatches to friction commands -- verify import paths after split

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

### Layer Correctness (future concern)
After splitting, some modules may be architecturally misplaced:
- `sync/background.ts` (handleBackgroundMode) -- infrastructure concern in presentation layer
- `sync/embedding-pass.ts` (handleModelChange) -- application concern in presentation layer
- `sync/helpers.ts` (createDriveResolver) -- infrastructure factory in presentation layer

These should be reviewed for potential layer movement in a future cleanup phase, not in Phase 30.

</deferred>

---

*Phase: 30-god-file-cleanup*
*Context gathered: 2026-04-03*
