# Phase 30: God File Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 30-god-file-cleanup
**Areas discussed:** Module boundaries, File organization, Layer movement, Test splitting

---

## Module Boundaries (sync.ts)

| Option | Description | Selected |
|--------|-------------|----------|
| One module per concern | 5 modules: core sync, embedding pass, memory-file sync, ambient context, shared helpers. Each stays under 200 lines. Cleanest SRP. | Yes |
| Three modules | Core sync, embedding, supporting. Fewer files but weaker SRP. | |
| You decide | Claude picks the grouping. | |

**User's choice:** One module per concern (Recommended)
**Notes:** Maximum SRP granularity.

## Module Boundaries (friction.ts)

| Option | Description | Selected |
|--------|-------------|----------|
| One module per handler | 6 modules: log, list, resolve, wontfix, dashboard, purge. Plus registration module. | Yes |
| Grouped by type | 3 modules: CRUD, analytics, data management. | |
| You decide | Claude picks the grouping. | |

**User's choice:** One module per handler (Recommended)
**Notes:** Maximum SRP granularity.

## File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Subdirectories | commands/sync/index.ts, commands/sync/embedding-pass.ts, commands/friction/index.ts, etc. | Yes |
| Flat with prefix | commands/sync.ts, commands/sync-embedding.ts, commands/friction-log.ts, etc. | |

**User's choice:** Subdirectories (Recommended)
**Notes:** User saw preview of directory structure and selected it.

## Layer Movement

| Option | Description | Selected |
|--------|-------------|----------|
| Pure split only | Move functions into subdirectory modules but keep everything in presentation layer. Minimizes blast radius. | Yes |
| Split + relocate | Move reporting/formatting to application services while splitting. More correct but higher risk. | |
| You decide | Claude judges misplaced functions. | |

**User's choice:** Pure split only (after asking for the most robust systems-thinking approach)
**Notes:** User asked "What's the most robust and systems thinking approach that aligns to my WoW?" Claude explained that pure split satisfies SRP at module level, and layer correction is a separate concern with different risks. Incremental refactoring in small safe steps is the SOLID-aligned approach. User accepted this reasoning.

## Test Splitting

| Option | Description | Selected |
|--------|-------------|----------|
| Split alongside modules | Each module gets its own test file co-located. Matches codebase pattern. | Yes |
| Keep unified test files | Keep sync.test.ts and friction.test.ts as-is. Minimal churn. | |
| You decide | Claude picks based on test size and coupling. | |

**User's choice:** Split alongside modules (Recommended)
**Notes:** None.

---

## Claude's Discretion

- Exact function-to-module assignment can vary if line count or import cycle constraints require it
- Helper grouping within helpers.ts can be further split if needed

## Deferred Ideas

- Layer correctness for misplaced functions (handleBackgroundMode, handleModelChange, createDriveResolver) -- noted for future cleanup, not Phase 30
