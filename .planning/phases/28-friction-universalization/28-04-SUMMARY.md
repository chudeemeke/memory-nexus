---
phase: 28-friction-universalization
plan: 04
subsystem: presentation
tags: [friction, cli, dashboard, tool-flag, auto-ingest, patterns]
dependency_graph:
  requires: [28-02, 28-03]
  provides: [friction-cli-universal, friction-dashboard-universal]
  affects: []
tech_stack:
  added: []
  patterns: [dynamic-category-iteration, auto-ingest-before-dispatch, seen-unseen-tracking]
key_files:
  created:
    - tests/presentation/cli/commands/friction.test.ts
    - tests/presentation/cli/formatters/friction-dashboard.test.ts
  modified:
    - src/presentation/cli/commands/friction.ts
    - src/presentation/cli/formatters/friction-dashboard.ts
    - src/application/services/friction-service.ts
decisions:
  - "service.list() uses findAll with status='open' when tool filter specified (findOpen has no filter support)"
  - "markReviewed called after list display, not before (user sees NEW indicators before they are cleared)"
  - "byCategory iteration made fully dynamic via Object.entries (no hardcoded category list)"
requirements_completed: [SC-01, SC-02, SC-04, SC-05, SC-06, SC-07, SC-08]
metrics:
  duration: 5m
  completed: 2026-03-21
---

# Phase 28 Plan 04: CLI Wiring and Dashboard Formatters Summary

Wire universal friction features into CLI commands and dashboard formatters with --tool flags, auto-ingest, NEW indicators, de-branded dashboard with By Tool chart, and pattern alerts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add --tool flag, auto-ingest, NEW indicators | ef5d588 | friction.ts, friction-service.ts, friction.test.ts |
| 2 | De-brand dashboard, By Tool chart, pattern alerts | 75e4e14 | friction-dashboard.ts, friction-dashboard.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] service.list() did not support tool filtering for open-only queries**
- **Found during:** Task 1
- **Issue:** `service.list()` called `findOpen()` (no filters) when `all` was false. Specifying `--tool` without `--all` had no effect.
- **Fix:** Changed list() to use `findAll({ status: "open", tool })` when any filter (tool/category/sourceProject) is specified.
- **Files modified:** src/application/services/friction-service.ts
- **Commit:** ef5d588

## Verification

- `bun test tests/presentation/cli/commands/friction.test.ts` -- 8 pass, 0 fail
- `bun test tests/presentation/cli/formatters/friction-dashboard.test.ts` -- 10 pass, 0 fail
- --tool flag available on log, list, and dashboard subcommands
- Auto-ingest runs before every friction command
- List shows [NEW] indicators and calls markReviewed when --tool provided
- Dashboard title is "Friction Dashboard" in both terminal and HTML
- HTML includes byToolChart canvas with Chart.js doughnut
- Pattern alerts appear when threshold met, absent otherwise
