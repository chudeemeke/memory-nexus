---
phase: 32
slug: cli-surface
verifier: gsd-verifier
verified_at: 2026-05-16
verdict: PASS
re_verification:
  previous_verdict: NEEDS_FIX
  previous_verified_at: 2026-05-16 (first pass)
  gaps_closed:
    - "Gap A — Coverage on 8 Plan-32 modified files now >=95% per metric"
    - "Gap B — Item 1 owner now = Phase 32.6 (TS Error Cleanup) in ROADMAP.md line 137"
    - "Gap C — Item 2 owner now = Phase 32.7 (Friction Dashboard Tests + Envelope Adoption) in ROADMAP.md line 152"
  gaps_remaining: []
  regressions: []
plans_verified:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
requirements_verified: [CLI-01, CLI-02, CLI-03, QUAL-01]
hexagonal_preserved: yes
hidden_debt: none
coverage_per_metric:
  envelope_ts: { funcs: 100.00, lines: 100.00 }
  formatters_index_ts: { funcs: 100.00, lines: 100.00 }
  help_groups_test_ts: { funcs: 100.00, lines: 100.00 }
  deprecation_warning_ts: { funcs: 100.00, lines: 100.00 }
  dto_helpers_ts: { funcs: 100.00, lines: 100.00 }
  commands_context_ts: { funcs: 100.00, lines: 100.00 }
  commands_search_ts: { funcs: 100.00, lines: 99.01 }
  commands_show_ts: { funcs: 100.00, lines: 100.00 }
  commands_list_ts: { funcs: 100.00, lines: 98.98 }
  commands_related_ts: { funcs: 100.00, lines: 99.48 }
  commands_stats_ts: { funcs: 100.00, lines: 100.00 }
test_gate: { pass: 1327, fail: 8, deferred_baseline: 8 }
type_check: { errors: 181, baseline: 181, regression: no }
test_isolation_gate: PASS
phase_32_5_forward_compat: yes
---

# Phase 32 — Verification

**Goal (verbatim ROADMAP):** "The help output is organized and all query commands support uniform output format flags so users can discover commands by category and consume output programmatically."

**Mode:** Standard goal-backward (not MVP — Phase 32 ROADMAP entry has no `mode: mvp`).

## Re-verification (2026-05-16, second pass)

The first verification pass on 2026-05-16 returned **NEEDS_FIX**: functional goal achieved (all 3 ROADMAP success criteria + 12 cross-AI findings VERIFIED in code), but 3 quality-gap dispositions were required. This second pass confirms all 3 gaps are now closed.

### Gap A (Coverage) — RESOLVED

`32-COVERAGE-CLOSURE.md` reports all 8 Plan-32 modified files at >=95% per metric. Live verification confirms the numbers using the same combined-test invocation:

| File | % Funcs | % Lines | 95% Gate |
| ---- | -------:| -------:| -------- |
| `formatters/envelope.ts` | 100.00 | 100.00 | PASS |
| `formatters/dto-helpers.ts` | 100.00 | 100.00 | PASS |
| `commands/_helpers/deprecation-warning.ts` | 100.00 | 100.00 | PASS |
| `commands/context.ts` | 100.00 | 100.00 | PASS |
| `commands/related.ts` | 100.00 | 99.48 | PASS |
| `commands/list.ts` | 100.00 | 98.98 | PASS |
| `commands/show.ts` | 100.00 | 100.00 | PASS |
| `commands/search.ts` | 100.00 | 99.01 | PASS |
| `commands/stats.ts` | 100.00 | 100.00 | PASS |

(Verified by `bun test ... --coverage` run 2026-05-16.)

**Residual unreachable lines accepted:** 4 lines total across 3 files (`list.ts:195`, `search.ts:316-317, 336-337`). Each is `throw err;` after a non-`DateParseError` from the named-import `parseDate`. Exercising these lines directly requires `mock.module()` on `../parsers/date-parser.js`, which is forbidden by `scripts/check-test-isolation.ts` Rule 4. The failure-mode itself IS covered (the re-thrown error lands in the outer try/catch, which has test coverage). Each file remains >=98.98% lines, well above the 95% gate. Rationale documented in `32-COVERAGE-CLOSURE.md` §"Residual Unreachable Lines (Documented)".

**147 new test cases added across 8 test files**, all test-only — `git diff --stat src/presentation/cli/commands/*.ts src/presentation/cli/formatters/dto-helpers.ts src/presentation/cli/commands/_helpers/deprecation-warning.ts` confirms no production-code modifications were required to achieve coverage. Smoke checks confirm `memory --help`, `memory stats --format brief`, and `memory stats --json` emit unchanged output.

### Gap B (TS errors trigger fired) — RESOLVED

ROADMAP.md **line 137** contains `### Phase 32.6: TS Error Cleanup` with:
- **Goal:** "All TypeScript errors in the CLI presentation layer are resolved so `bun --bun tsc --noEmit` exits 0 cleanly."
- **Depends on:** Phase 32 (CLI Surface)
- **Requirements:** QUAL-04 (cleanup-aligned)
- **Success Criteria:** 3 items (tsc exits 0, no coverage regression, no behavioral change)

`deferred-items.md` Item 1 owner now reads: **"Phase 32.6 (TS Error Cleanup) — scheduled in ROADMAP.md. Success criterion 1: `bun --bun tsc --noEmit` exits 0. Trigger auto-fires when planning loops reach Phase 32.6."**

Per `no-hidden-debt.md`: clear owner (Phase 32.6) + concrete trigger (planning loop reaches Phase 32.6 → its own success-criterion-1 forces resolution). No longer hidden debt.

### Gap C (Friction-dashboard trigger not auto-firing) — RESOLVED

ROADMAP.md **line 152** contains `### Phase 32.7: Friction Dashboard Tests + Envelope Adoption` with:
- **Goal:** "The friction subsystem is brought into the `QueryResultEnvelope` contract and the 8 pre-existing friction-dashboard test failures are resolved."
- **Depends on:** Phase 32 (CLI Surface)
- **Requirements:** QUAL-04, QUAL-02
- **Success Criteria:** 3 items (8 failing tests pass; `friction list --json` produces envelope; deferred Open Q7 closed)

`deferred-items.md` Item 2 owner now reads: **"Phase 32.7 (Friction Dashboard Tests + Envelope Adoption) — scheduled in ROADMAP.md. Success criterion 1: the 8 failing tests pass. Trigger auto-fires when planning loops reach Phase 32.7."**

Per `no-hidden-debt.md`: clear owner (Phase 32.7) + concrete trigger. No longer hidden debt.

### Original Phase 32 verdict criteria still hold

All findings from the first pass remain VERIFIED:
- 3/3 ROADMAP success criteria (CLI-01, CLI-02, CLI-03) — VERIFIED
- 12/12 cross-AI review findings (HIGH-1..5, MEDIUM-1..4, LOW-1, LOW-4, Gemini LOW) — VERIFIED in code
- Hexagonal preserved (no diffs under `src/domain/` or `src/application/`)
- Smoke checks all pass
- Test-isolation gate at 0 violations (confirmed live: `bun run test:isolation` → PASS)
- TS error count at 181 (matches Phase 32 baseline; no regression)
- CLI test gate at 1327 / 1335 — up from 1177 / 1185 (Gap A test additions added 150 passing tests; 8 baseline failures unchanged)

---

## Goal Achievement — Observable Truths

### Criterion 1 (ROADMAP SC-1, CLI-01): `memory --help` groups commands under labeled categories

**Status:** VERIFIED

**Evidence (live `bun src/presentation/cli/index.ts --help`):**
- 4 group headings render in expected order: "Query Commands:", "Data Commands:", "System Commands:", "Feedback Commands:"
- `search`, `context`, `show`, `list`, `related`, `stats` under "Query Commands:"
- `sync`, `backfill`, `export`, `import`, `purge` under "Data Commands:"
- `install`, `uninstall`, `status`, `doctor`, `completion`, `browse` under "System Commands:"
- `friction` under "Feedback Commands:"
- A trailing `Commands:` block carries the builtin `help` entry (Commander default — does NOT contradict CLI-01)
- Snapshot in `src/presentation/cli/__snapshots__/help-groups.test.ts.snap` reflects the exact structure
- `program.commandsGroup()` wiring in `src/presentation/cli/index.ts:45,54,63,72`

**Test gate:** `bun test src/presentation/cli/help-groups.test.ts` — 8 / 8 pass.

### Criterion 2 (ROADMAP SC-2, CLI-02): All 6 query commands accept `--json` and produce valid JSON envelope

**Status:** VERIFIED

**Evidence:**
- `.option("--json", ...)` present in all 6 command files
- Every command imports `emitJsonEnvelope` and `emitJsonErrorEnvelope` from `../formatters/envelope.js`
- Grep occurrence count by file: search 11, context 7, list 7, related 6, show 5, stats 5 — confirms multiple exit paths route through envelope (HIGH-2 satisfied)
- Live `bun src/presentation/cli/index.ts stats --json` produces a valid envelope: `{ schema_version: "1", command: "stats", kind: "stats", meta: {...}, data: {...} }`
- Live `bun src/presentation/cli/index.ts list --format default --json` emits clean JSON to stdout (deprecation warning suppressed)

**Test gates:**
- `bun test src/presentation/cli/formatters/envelope.test.ts` — 32 / 32 pass
- `bun test src/presentation/cli/commands/{search,context,show,list,related,stats}.json.test.ts` — 42 / 42 pass
- `bun test src/presentation/cli/commands/{list,stats}.deps.test.ts` — 8 / 8 pass (HIGH-3)

### Criterion 3 (ROADMAP SC-3, CLI-03): All 6 commands support `--format brief` and `--format ai`

**Status:** VERIFIED

| Command  | `.choices()`                   | Deprecated alias |
| -------- | ------------------------------ | ---------------- |
| search   | `["brief", "ai", "default"]`   | default          |
| context  | `["brief", "ai", "detailed"]`  | detailed         |
| show     | `["brief", "ai", "default"]`   | default          |
| list     | `["brief", "ai", "default"]`   | default          |
| related  | `["brief", "ai", "detailed"]`  | detailed         |
| stats    | `["brief", "ai", "default"]`   | default          |

- All 6 commands accept `brief` and `ai`
- Live `bun src/presentation/cli/index.ts stats --format brief` produces exactly 5 lines (W5 spec satisfied)
- Deprecation cadence documented in `CHANGELOG.md` `[Unreleased] > Deprecated`
- Live `bun src/presentation/cli/index.ts list --format default` emits stderr warning
- Live `bun src/presentation/cli/index.ts list --format default --json` suppresses the warning (preserves JSON-on-stdout contract)

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/presentation/cli/formatters/envelope.ts` | Runtime tuples + types + builders + emitters | VERIFIED | All exports present; JSDoc schema-version policy block at top; 100% coverage |
| `src/presentation/cli/formatters/dto-helpers.ts` | 7 DTO functions extracted from JsonOutputFormatter | VERIFIED | All 7 DTOs present; `toSearchResultDto` computes highlights BEFORE `<mark>` strip (Gemini LOW invariant); 100% per metric |
| `src/presentation/cli/index.ts` | `.commandsGroup()` wiring | VERIFIED | 4 groups wired in order Query/Data/System/Feedback |
| `src/presentation/cli/commands/_helpers/deprecation-warning.ts` | One-shot stderr warning + JSON suppression | VERIFIED | Module-scoped Set; `resetFormatDeprecationWarningsForTesting` for tests; 100% per metric |
| `src/presentation/cli/commands/_helpers/capture-json.ts` | Shared stdout/stderr capture helper | VERIFIED | Used by 6 `.json.test.ts` files |
| `CHANGELOG.md` | Keep a Changelog 1.1.0 + SemVer | VERIFIED | `[Unreleased] > Changed` documents CLI-01/02/03; `Deprecated` documents `default` + `detailed` |

## Key Link Verification (Wiring)

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `index.ts` | `Commander.commandsGroup()` | `program.commandsGroup("Query Commands:")` (x 4) | VERIFIED |
| Each query command | `envelope.emitJsonEnvelope` | `import` + `if (options.json) emitJsonEnvelope({...})` | VERIFIED (grep — 5-11 occurrences per file) |
| Each query command | `envelope.emitJsonErrorEnvelope` | `import` + emit on every error path | VERIFIED |
| `list.ts` / `stats.ts` | `deps?: { dbPath? }` test seam | `executeListCommand(options, deps = {})` | VERIFIED |
| `context.ts` | `useSmartContext()` precedence | `if (options.json) return !!options.budget || !!options.crossProject;` | VERIFIED (HIGH-5) |
| Search `--files` branch | `emitJsonEnvelope` with `kind: "file"` | `emitJsonEnvelope({ command: "search", kind: "file", ... })` | VERIFIED |
| Deprecated alias path | `emitFormatDeprecationWarning` | Conditional on `format === "default"` / `"detailed"` | VERIFIED in all 6 commands |

## Cross-AI Review Findings — Actually Present in Code

| Finding | Required artifact | Code evidence | Status |
| ------- | ----------------- | ------------- | ------ |
| HIGH-1 (runtime tuples as const) | `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` exported as `as const` arrays | envelope.ts:32-39, 51-58 | VERIFIED |
| HIGH-2 (multiple exit paths) | Every exit path routes through envelope emitters | grep returns 41 emit calls across 6 commands | VERIFIED |
| HIGH-3 (test seams) | `executeListCommand` / `executeStatsCommand` accept `deps?: { dbPath? }` | list.ts:73, stats.ts:71; `.deps.test.ts` PASS | VERIFIED |
| HIGH-4 (`--files --json` envelope) | `QUERY_RESULT_KINDS` includes `"file"`; search.ts wraps file results | envelope.ts:57; search.ts:537-541 | VERIFIED |
| HIGH-5 (context precedence) | `useSmartContext` bypasses `--format ai` when `--json` set | context.ts:125-149 | VERIFIED |
| MEDIUM-1 (DTO extraction) | `dto-helpers.ts` exists; `JsonOutputFormatter.formatResults` delegates | dto-helpers.ts:63; highlights-before-strip invariant tested | VERIFIED |
| MEDIUM-2 (deprecation aliases) | `default` on search/list/show/stats; `detailed` on context/related | All 6 commands carry their deprecated alias | VERIFIED |
| MEDIUM-3 (cross-platform verify) | PLAN `<verify>` blocks use plain `bun test <paths>` | `bash \| tail` removed in revision_4 | VERIFIED |
| MEDIUM-4 (discriminated EnvelopeScope) | `{ type: "global" } \| { type: "project"; project: string }` | envelope.ts:70-72 | VERIFIED |
| LOW-1 (CHANGELOG existence) | `CHANGELOG.md` at repo root | File present; Keep a Changelog 1.1.0 + SemVer structure | VERIFIED |
| LOW-4 (schema_version doc) | JSDoc block on `ENVELOPE_SCHEMA_VERSION` | envelope.ts:1-20 — multi-paragraph JSDoc | VERIFIED |
| Gemini LOW (highlights-before-strip) | DTO extracts highlights before `replace(/<\/?mark>/g, "")` | dto-helpers.ts:68 BEFORE line 70 | VERIFIED |

All 12 review findings present in code as claimed in SUMMARIES.

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CLI-01 | 32-01 | Help output groups commands under labeled categories using Commander.js help customization | SATISFIED | `.commandsGroup()` x 4 in index.ts; live `--help` output confirms |
| CLI-02 | 32-02 | All query commands support `--json` for structured output | SATISFIED | 6 / 6 commands have `--json` option + envelope emission on every exit path |
| CLI-03 | 32-03 | All query commands support `--format` flag with at least `brief` and `ai` modes | SATISFIED | 6 / 6 commands have `.choices(["brief", "ai", <alias>])` |
| QUAL-01 | Cross-cutting | 95%+ coverage at EACH metric (functions, lines) for all new code | SATISFIED | All 8 modified files at >=95% per metric; residual unreachable lines documented |

## Hexagonal Integrity

**Status:** PRESERVED

`git diff main..HEAD --stat` shows NO files under:
- `src/domain/`
- `src/application/`

All changes confined to:
- `src/presentation/cli/` (production code + tests)
- `.planning/` (plan docs)
- `CHANGELOG.md` (project-root, presentation-tier)

## Behavioral Spot-Checks (Live Commands)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Help groups render | `bun src/presentation/cli/index.ts --help` | 4 group headings in expected order | PASS |
| `stats --json` produces envelope | `bun src/presentation/cli/index.ts stats --json` | Valid envelope with schema_version, command, kind, meta, data | PASS |
| `stats --format brief` <= 5 lines | `bun src/presentation/cli/index.ts stats --format brief` | Exactly 5 lines | PASS |
| Deprecated alias warns | `bun src/presentation/cli/index.ts list --format default` | stderr warning emitted | PASS |
| Deprecated alias + JSON suppresses warning | `bun src/presentation/cli/index.ts list --format default --json` | Clean JSON; no stderr leak before output | PASS |

## Test Gates

| Gate | Result | Baseline | Status |
| ---- | ------ | -------- | ------ |
| `bun test src/presentation/cli/formatters/envelope.test.ts` | 32 / 32 pass | n/a | PASS |
| `bun test src/presentation/cli/help-groups.test.ts` | 8 / 8 pass | n/a | PASS |
| `bun test src/presentation/cli/formatters/dto-helpers.test.ts` | ALL pass (extended) | n/a | PASS |
| `bun test src/presentation/cli/commands/*.json.test.ts` | 42 / 42 pass | n/a | PASS |
| `bun test src/presentation/cli/commands/{list,stats}.deps.test.ts` | 8 / 8 pass | n/a | PASS |
| `bun test src/presentation/cli/commands/*.coverage.test.ts` | 147 new tests pass (Gap A closure) | n/a | PASS |
| `bun test src/presentation/cli` (full subdir) | **1327 pass / 8 fail** | 8 fail (deferred) | PASS (no regression; +150 passing tests since previous pass) |
| `bun run test:isolation` | **PASS — 0 violations** | 0 | PASS |
| `bun --bun tsc --noEmit` | **181 errors** | 181 baseline | PASS (no regression; tracked in Item 1 → Phase 32.6) |
| 8 failing tests are all `friction-dashboard.test.ts` | Verified (`generateFrictionHtml` + `--html` action) | 8 friction-dashboard | PASS — matches `deferred-items.md` Item 2 baseline (Phase 32.7 owner) |

## Coverage on Plan-Touched Files (per-metric breakdown)

Measured via combined invocation: 6 command tests + 6 `.json.test.ts` + 6 `.coverage.test.ts` + 2 `.deps.test.ts` + `deprecation-warning.test.ts` + `dto-helpers.test.ts` (`bun test ... --coverage`).

| File | % Funcs | % Lines | 95% Gate |
| ---- | -------:| -------:| -------- |
| `formatters/envelope.ts` | 100.00 | 100.00 | PASS |
| `formatters/index.ts` (barrel) | 100.00 | 100.00 | PASS (already at gate; unchanged) |
| `_helpers/deprecation-warning.ts` | 100.00 | 100.00 | PASS (was 100/94.12 in first pass) |
| `formatters/dto-helpers.ts` | 100.00 | 100.00 | PASS (was 70/78.50 in first pass) |
| `commands/context.ts` | 100.00 | 100.00 | PASS (was 62.5/66.24 in first pass) |
| `commands/related.ts` | 100.00 | 99.48 | PASS (was 71.43/54.69) — 1 unreachable line |
| `commands/list.ts` | 100.00 | 98.98 | PASS (was 83.33/76.41) — line 195 unreachable |
| `commands/search.ts` | 100.00 | 99.01 | PASS (was 80/82.59) — lines 316-317, 336-337 unreachable |
| `commands/show.ts` | 100.00 | 100.00 | PASS (was 85.71/85.71 in first pass) |
| `commands/stats.ts` | 100.00 | 100.00 | PASS (was 83.33/78.91 in first pass) |

All 10 files at >=95% per metric. Residual 4 unreachable lines (across `list.ts`, `search.ts`) are documented in `32-COVERAGE-CLOSURE.md` §"Residual Unreachable Lines (Documented)" — each is a `throw err;` after a non-`DateParseError` from the named-import `parseDate`. The rationale (test-isolation gate forbids `mock.module()`; refactor to inject `parseDate` via deps would exceed test-only scope) is sound and accepted.

## Deferred Items Audit (no-hidden-debt)

Per `~/.claude/rules/no-hidden-debt.md`: each item must have **clear owner** AND **concrete trigger that fires automatically**.

### Item 1 — Pre-existing TypeScript errors (181)

- **Owner:** Phase 32.6 (TS Error Cleanup) — scheduled in ROADMAP.md line 137
- **Trigger:** Auto-fires when planning loops reach Phase 32.6 (success criterion 1 forces resolution: `bun --bun tsc --noEmit` exits 0)
- **Verdict:** Discharged. Hidden debt eliminated.

### Item 2 — Pre-existing friction-dashboard test failures (8)

- **Owner:** Phase 32.7 (Friction Dashboard Tests + Envelope Adoption) — scheduled in ROADMAP.md line 152
- **Trigger:** Auto-fires when planning loops reach Phase 32.7 (success criterion 1: the 8 failing tests pass)
- **Verdict:** Discharged. Hidden debt eliminated.

### Item 3 — Coverage gap on Plan-32 modified files

- **Status:** RESOLVED 2026-05-16 (before Phase 32 merge)
- **Disposition:** Closed via `32-COVERAGE-CLOSURE.md` (commits `a3e80e6` + `c50a38e`, 147 new tests, test-only)
- **Verdict:** Resolved in-phase. No deferral.

## Anti-Patterns Scan

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TODO / FIXME / XXX / placeholder markers in files modified by Phase 32 | — | Clean |

`grep -rE "TODO|FIXME|XXX" src/presentation/cli/formatters/envelope.ts src/presentation/cli/formatters/dto-helpers.ts src/presentation/cli/commands/_helpers/deprecation-warning.ts` returns no debt markers. The new test files (147 new test cases) introduce no debt markers either.

## Phase 32.5 Forward-Compatibility

| Property | Status |
| -------- | ------ |
| `schema_version: "1"` unchanged across all Phase 32 changes | VERIFIED — additive only |
| `kind` populated from command name; Phase 32.5 will populate from `--kind` flag | VERIFIED |
| `EnvelopeScope` discriminated for `--scope global\|project` | VERIFIED — discriminated union shape |
| `QUERY_RESULT_KINDS` includes `"file"` for `search --files` Phase 32.5 routing | VERIFIED — envelope.ts:57 |
| `--json` overrides `--format ai` (deterministic precedence) | VERIFIED — code comments + tests |

## Gaps Summary

**None.** Phase 32 achieves all 3 ROADMAP success criteria as observable behavior. All 12 cross-AI review findings present in code. Hexagonal preserved. Type-check at baseline (181 = 181). 1327 / 1335 tests pass; the 8 failures are exactly the friction-dashboard baseline tracked as Item 2 (Phase 32.7 owner). QUAL-01 (95%+ coverage at EACH metric) now satisfied for all 8 Plan-32 modified files. All 3 deferred items have clear owner + concrete trigger per `no-hidden-debt.md`.

## Verdict

**PASS**

- 3/3 ROADMAP success criteria: VERIFIED
- 3/3 requirements (CLI-01/02/03): SATISFIED
- 1/1 cross-cutting requirement (QUAL-01): SATISFIED (was the previous-pass gap)
- 12/12 cross-AI review findings: VERIFIED in code
- Hexagonal integrity: PRESERVED
- Type-check: 181 errors, no regression (Phase 32.6 owner)
- Test gate: 1327 pass / 8 fail = friction-dashboard baseline only (Phase 32.7 owner)
- Test-isolation gate: PASS (0 violations)
- Phase 32.5 forward-compat: VERIFIED
- Coverage on all Plan-32 modified files: PASS (>=95% per metric on all 8 files, with 4 documented unreachable lines)
- Hidden debt: NONE — all 3 deferred items have ROADMAP-scheduled owners (Phase 32.6, Phase 32.7) with auto-firing triggers OR are resolved in-phase (Item 3)

## VERIFICATION COMPLETE — PASS
