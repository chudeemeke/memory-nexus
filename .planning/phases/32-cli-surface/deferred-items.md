# Phase 32 — Deferred Items

Items surfaced during Phase 32 execution that are out of scope for the plan that found them. Per `no-hidden-debt.md`: every item here has a clear owner and concrete trigger.

**Status:** All 3 items have been dispositioned by the user during Phase 32 close-out (2026-05-16) and have concrete ROADMAP-scheduled owners. The previous "future friction-envelope phase" placeholder owner has been replaced by Phase 32.7.

## Item 1 — Pre-existing TypeScript errors in unrelated CLI files

**Surfaced during:** Plan 32-01 Task 2 verification (`bun --bun tsc --noEmit`)

**Scope:** 181 errors across pre-existing CLI files (`db-startup.ts`, `context-formatter.ts`, `friction-dashboard.ts`, `output-formatter.ts`, `related-formatter.ts`, `stats-formatter.ts`, and others). Confirmed identical count (within ±1 from Plan 32-02 import cleanup) before and after Phase 32 changes via git-stash baseline.

**Why deferred:** Zero TS errors caused by Phase 32 changes. Per executor scope-boundary rule, pre-existing failures in files NOT touched by the plan that found them are out of scope. Stash baseline confirmed.

**Owner / trigger:** **Phase 32.6 (TS Error Cleanup)** — scheduled in ROADMAP.md. Success criterion 1: `bun --bun tsc --noEmit` exits 0. Trigger auto-fires when planning loops reach Phase 32.6.

**Verification:** `bun --bun tsc --noEmit 2>&1 | grep -cE "error TS"` should remain at ~181 until Phase 32.6 lands. Increase = regression worth investigating.

## Item 2 — Pre-existing friction-dashboard test failures (8)

**Surfaced during:** Plan 32-01 Task 2 verification (`bun test src/presentation/cli`)

**Scope:** 8 failing tests in `src/presentation/cli/formatters/friction-dashboard.test.ts` covering `generateFrictionHtml` rendering and the `--html` action path. Confirmed pre-existing via stash baseline. The `friction-dashboard` module is out of every Phase 32 plan's `files_modified` list.

**Why deferred:** Zero failures caused by Phase 32 changes. Phase 32 also explicitly deferred friction envelope adoption per audit §14.A (Plan 32-01 Open Q7) — keeping friction in its own arc.

**Owner / trigger:** **Phase 32.7 (Friction Dashboard Tests + Envelope Adoption)** — scheduled in ROADMAP.md. Success criterion 1: the 8 failing tests pass. Trigger auto-fires when planning loops reach Phase 32.7. This closes both the test failures AND the deferred Open Q7 (friction envelope adoption) in one phase.

**Verification:** `bun test src/presentation/cli/formatters/friction-dashboard.test.ts` failure count should stay ≤8 until Phase 32.7 cleanup. Any increase = regression.

## Item 3 — Coverage on Plan-32 modified files below QUAL-01 (added 2026-05-16, resolved before Phase 32 merge)

**Surfaced during:** Phase 32 verifier audit (`bun test --coverage`)

**Scope:** `dto-helpers.ts` and the 6 query command files had coverage below the 95% per-metric QUAL-01 gate after Plan 32-02 / 32-03 GREEN tasks. Specifically:
- `dto-helpers.ts`: 70% functions / 78.5% branches
- `context.ts`: 62.5% functions / 66.24% branches
- `search.ts`: 80% functions / 82.59% branches
- `show.ts`: 85.71% functions / 85.71% branches
- `list.ts`: 83.33% functions / 76.41% branches
- `related.ts`: 71.43% functions / 54.69% branches
- `stats.ts`: 83.33% functions / 78.91% branches
- `_helpers/deprecation-warning.ts`: 94.12% branches (near-miss)

NEW Phase-32-authored files (`envelope.ts`, `formatters/index.ts` re-export, `help-groups.test.ts`) are at 100% per metric. The gap was on the MODIFIED files (commands + dto-helpers + deprecation-warning).

**Why surfaced:** Plan 32-02 SUMMARY claimed coverage was "deferred per deferred-items.md Phase 32 close-out" — but no coverage entry actually existed. The verifier caught this as a hidden-debt instance.

**Owner / trigger:** **Phase 32 close-out (this commit cycle).** User disposition: FIX coverage now before merge (not defer). Resolved by adding tests to bring each modified file to 95%+ per metric.

**Verification:** `bun test --coverage src/presentation/cli/...` confirms each touched file ≥95% per metric. PASS on re-verification = item resolved.

**Status:** **RESOLVED 2026-05-16.** See `32-COVERAGE-CLOSURE.md` for the closure summary. All 8 files at ≥95% per metric (7 at 100/100, related.ts 100/99.48, list.ts 100/98.98, search.ts 100/99.01). Resolved by commits `a3e80e6` + `c50a38e` (147 new test cases, test-only, no production code changes). Two files have 4 residual unreachable lines (`throw err;` after non-DateParseError from named-import `parseDate`) — documented in COVERAGE-CLOSURE.md with rationale.
