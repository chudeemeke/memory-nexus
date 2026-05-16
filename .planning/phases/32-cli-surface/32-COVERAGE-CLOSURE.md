---
phase: 32
slug: cli-surface
artifact: coverage-closure
created: 2026-05-16
status: COMPLETE
gate: QUAL-01 (95%+ at EACH metric)
verdict: PASS (8/8 files at >=95% per metric; 1-2 unreachable residual lines documented)
---

# Phase 32 — Coverage Closure

Closes the gap surfaced by the Phase 32 verifier (Gap A, `32-VERIFICATION.md`)
and tracked as Item 3 in `deferred-items.md`. Brings 8 modified CLI files to
QUAL-01's 95% per-metric threshold without modifying production behavior.

## Scope

Test-only. No production code changed. Smoke-verified before/after that
`memory --help`, `memory stats --format brief`, and `memory stats --json`
emit unchanged output.

## Coverage Per File (Before / After)

Bun's coverage reporter outputs % Funcs and % Lines (combining the verifier's
"branches" and "statements" into a single line-coverage figure that matches the
verifier's 78.5 / 82.59 / etc. numbers — those columns conflated to "branches"
in the original report).

| File | % Funcs Before | % Funcs After | % Lines Before | % Lines After | 95% gate |
| ---- | --------------:| -------------:| --------------:| -------------:| -------- |
| `formatters/envelope.ts`              | 100.00 | 100.00 | 100.00 | 100.00 | PASS (already at gate) |
| `formatters/index.ts` (barrel)        | 100.00 | 100.00 | 100.00 | 100.00 | PASS (already at gate) |
| `commands/_helpers/deprecation-warning.ts` | 100.00 | 100.00 |  94.12 | 100.00 | PASS |
| `formatters/dto-helpers.ts`           |  70.00 | 100.00 |  78.50 | 100.00 | PASS |
| `commands/context.ts`                 |  62.50 | 100.00 |  66.24 | 100.00 | PASS |
| `commands/related.ts`                 |  71.43 | 100.00 |  54.69 |  99.48 | PASS |
| `commands/list.ts`                    |  83.33 | 100.00 |  76.41 |  98.98 | PASS |
| `commands/show.ts`                    |  85.71 | 100.00 |  85.71 | 100.00 | PASS |
| `commands/search.ts`                  |  80.00 | 100.00 |  82.59 |  99.01 | PASS |
| `commands/stats.ts`                   |  83.33 | 100.00 |  78.91 | 100.00 | PASS |

All 8 files now satisfy QUAL-01.

## Tests Added

| File created | Tests added | Branches/functions covered |
| ------------ | -----------:| -------------------------- |
| `commands/_helpers/deprecation-warning.test.ts` |  8 | One-shot emission, JSON suppression, command+alias key memoization, reset-for-testing |
| `formatters/dto-helpers.test.ts` (extended) | 17 | `toFileResultDto` (5 variants), `toSessionListDto` (4 variants), `toShowSessionDto` (3 variants incl. tool result presence/absence), `toRelatedDto`, `toStatsDto` (3 variants incl. hooks presence), `toContextDto` (3 variants incl. null lastActivity + defensive-copy invariant) |
| `commands/related.coverage.test.ts` | 22 | Success paths (default text, JSON envelope, verbose/quiet/detailed/AI), self-filter, --limit, --hops, --type, empty-after-filter, action callback, catch branch (5 variants) |
| `commands/context.coverage.test.ts` | 25 | Legacy success paths (text + JSON), smart-context paths (--budget, --cross-project, --format ai, --days, NOT_FOUND), action callback, catch branch (5 variants), getSessionSummary callback, formatSmartContext vs session_summary fallback vs minimal-fallback branches |
| `commands/list.coverage.test.ts` | 22 | Success paths (default, verbose with filters, quiet, brief, default alias, ai, --days, --since, --before, project filter), empty-result formatEmpty, --since/--before invalid in BOTH text + JSON, action callback, catch branch (5 variants) |
| `commands/stats.coverage.test.ts` | 14 | Success paths (default, verbose, quiet, brief, default alias, ai, --projects), empty-db formatEmpty, action callback, catch branch (5 variants) |
| `commands/show.coverage.test.ts`  |  6 | Action callback, catch branch (5 variants) |
| `commands/search.coverage.test.ts` | 33 | Multi-role + single-role + --days + --since/--before invalid in BOTH text + JSON, --case-sensitive filter, text result formatter (brief + ai + verbose with all filters), --no-vector + --mode fts, searchMeta with degradation_reason, embedding-coverage hint (text + json), 'no semantic matches' vector short-circuit, --json with results (inline arrow), action callback, catch branch (5 variants), --files qmd unavailable (text + json), --files qmd available with results (text + json + ai + empty), --files qmd runner throws (text + json + non-Error) |
| **Total** | **147** | |

Test pass rate (CLI suite): 1327 / 1335 (up from 1177 / 1185). The 8 failures
remain the pre-existing `friction-dashboard.test.ts` failures tracked as
Item 2 in `deferred-items.md` (Phase 32.7 owner). Baseline unchanged.

## Residual Unreachable Lines (Documented)

Two files have 1-2 lines that cannot be exercised from tests without
mock.module() on first-party modules (forbidden by the test-isolation gate):

- `list.ts:195` — `throw err;` for non-`DateParseError` from the named-import
  `parseDate`. The re-thrown error WOULD land in the outer try/catch (which
  IS covered), so the failure mode itself has test coverage; only the
  re-throw line is unreachable directly.

- `search.ts:316-317`, `search.ts:336-337` — same pattern: `throw err;`
  after non-`DateParseError` from `parseDate` for `--since` and `--before`.
  Same justification.

These three locations represent 4 of ~700 covered lines across the 8 files
(~0.6% residual). Each file still scores >=98.98% lines and 100% funcs —
well above the 95% gate.

Rationale for accepting the residual: bun's `spyOn` cannot reliably stub the
named import `parseDate` from inside the calling module (`list.ts` /
`search.ts`). The only alternatives are (a) `mock.module()` on
`../parsers/date-parser.js`, which is banned by the test-isolation gate
(`scripts/check-test-isolation.ts` Rule 4), or (b) a production refactor to
inject `parseDate` via a deps parameter, which would change production code
beyond test-only scope.

## Verification

```bash
# Combined coverage on all touched files
bun test \
  src/presentation/cli/commands/{search,context,show,list,related,stats}.test.ts \
  src/presentation/cli/commands/{search,context,show,list,related,stats}.json.test.ts \
  src/presentation/cli/commands/{search,context,show,list,related,stats}.coverage.test.ts \
  src/presentation/cli/commands/{list,stats}.deps.test.ts \
  src/presentation/cli/commands/_helpers/deprecation-warning.test.ts \
  src/presentation/cli/formatters/dto-helpers.test.ts \
  --coverage
```

Confirms each of 8 touched files at >=95% per metric (verified 2026-05-16).

```bash
# No regression on CLI test gate
bun test src/presentation/cli
# → 1327 pass / 8 fail (deferred baseline unchanged)

# Test isolation gate clean
bun run test:isolation
# → PASS (no violations)

# TS baseline unchanged
bun --bun tsc --noEmit 2>&1 | grep -cE "error TS"
# → 181 (matches Phase 32 baseline; tracked in Item 1 → Phase 32.6)
```

## Smoke Check — Production Behavior Unchanged

```bash
bun src/presentation/cli/index.ts --help        # Help groups render correctly
bun src/presentation/cli/index.ts stats --format brief  # Exactly 5 lines
bun src/presentation/cli/index.ts stats --json  # Valid envelope
```

All three commands emit unchanged output. No production-code modifications
were necessary to achieve the coverage goal — all gains came from test
additions exercising existing branches.

## No `mock.module()` on First-Party (Test-Isolation Compliance)

All coverage tests use `spyOn(SomeClass.prototype, "method")` against
infrastructure classes (`SqliteSessionRepository`, `SqliteLinkRepository`,
`SqliteContextService`, `HybridSearchService`, `SqliteStatsService`, `QmdRunner`)
or against module-level named exports (`loadConfig`, `saveConfig`,
`isQmdAvailable`). `mock.module()` is NOT used. The test-isolation gate
script confirms PASS post-closure.

## Commits

| Hash    | Scope | Description |
| ------- | ----- | ----------- |
| `a3e80e6` | 32-cov | close coverage on dto-helpers, deprecation-warning, related, context |
| `c50a38e` | 32-cov | close coverage on list, stats, show, search |

## Item 3 Status

`deferred-items.md` Item 3 (coverage gap on Plan-32 modified files vs QUAL-01) —
**RESOLVED**. All 8 listed files at >=95% per metric.

## Self-Check: PASSED

- All 8 files at >=95% % Funcs and >=95% % Lines
- 147 new test cases (all pass)
- 0 production code changes
- 0 new test-isolation violations
- TS baseline at 181 (no regression)
- CLI test gate at 1327 / 1335 (8 baseline failures unchanged)
- Smoke checks confirm unchanged production behavior
