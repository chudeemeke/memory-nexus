# Phase 32 — Deferred Items

Items surfaced during Phase 32 execution that are out of scope for the plan that found them. Per `no-hidden-debt.md`: every item here has a clear owner and concrete trigger.

## Pre-existing TypeScript errors in unrelated CLI files

**Surfaced during:** Plan 32-01 Task 2 verification (`bun --bun tsc --noEmit`)

**Scope:** 182 errors across pre-existing CLI files (`db-startup.ts`, `context-formatter.ts`, `friction-dashboard.ts`, `output-formatter.ts`, `related-formatter.ts`, `stats-formatter.ts`, and others). Confirmed identical count before and after Plan 32-01 changes (git-stash baseline check).

**Why deferred:** Zero TS errors caused by Plan 32-01 changes. Per executor scope-boundary rule, pre-existing failures in files NOT touched by this plan are out of scope.

**Owner / trigger:** Plan 32-02 + 32-03 touch the formatters and command files. When those plans land, they will either (a) inherit and resolve the relevant subset via their own scope, or (b) explicitly defer the remainder to a dedicated Phase 32 cleanup task. If after Phase 32 completes there are still pre-existing TS errors, surface to user for explicit close-out.

**Verification:** `bun --bun tsc --noEmit 2>&1 | grep -cE "error TS"` should not exceed 182 until Plans 32-02 / 32-03 reduce it. Increase = regression worth investigating.

## Pre-existing friction-dashboard test failures (8)

**Surfaced during:** Plan 32-01 Task 2 verification (`bun test src/presentation/cli`)

**Scope:** 8 failing tests in `src/presentation/cli/formatters/friction-dashboard.test.ts` covering `generateFrictionHtml` rendering and the `--html` action path. Confirmed pre-existing via stash baseline (failure count drops from 16 → 8 after un-stashing only friction-dashboard exits scope; remaining 8 are NOT in any file I touched).

**Why deferred:** Zero failures caused by Plan 32-01 changes. The `friction-dashboard` module is out of Plan 32-01's `files_modified` list.

**Owner / trigger:** Phase 32 explicitly defers friction envelope adoption (`<open_questions>` Q7 in 32-01-PLAN.md). When friction is brought into the envelope contract in a future phase, the dashboard tests should be re-evaluated. If not handled by Phase 32 close-out, surface to user.

**Verification:** `bun test src/presentation/cli/formatters/friction-dashboard.test.ts` failure count should stay ≤8 until explicit cleanup.
