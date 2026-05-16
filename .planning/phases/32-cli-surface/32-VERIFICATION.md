---
phase: 32
slug: cli-surface
verifier: gsd-verifier
verified_at: 2026-05-16
verdict: NEEDS_FIX
plans_verified:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
requirements_verified: [CLI-01, CLI-02, CLI-03]
hexagonal_preserved: yes
hidden_debt:
  - "181 pre-existing TS errors — trigger ('Phase 32 completion') has now FIRED; needs explicit user disposition (fix / file inbox / explicit close)"
  - "8 friction-dashboard test failures — owner/trigger is 'a future friction-envelope phase' but no such phase is scheduled in ROADMAP; trigger is not auto-firing per no-hidden-debt"
coverage_per_metric:
  envelope_ts: { statements: 100, branches: 100, functions: 100, lines: 100 }
  formatters_index_ts: { statements: 100, branches: 100, functions: 100, lines: 100 }
  help_groups_test_ts: { statements: 100, branches: 100, functions: 100, lines: 100 }
  deprecation_warning_ts: { statements: 100, branches: 94.12, functions: 100, lines: 100 }
  dto_helpers_ts: { statements: ~78, branches: 78.5, functions: 70, lines: ~78 }
  commands_context_ts: { functions: 62.5, branches: 66.24 }
  commands_search_ts: { functions: 80, branches: 82.59 }
  commands_show_ts: { functions: 85.71, branches: 85.71 }
  commands_list_ts: { functions: 83.33, branches: 76.41 }
  commands_related_ts: { functions: 71.43, branches: 54.69 }
  commands_stats_ts: { functions: 83.33, branches: 78.91 }
test_gate: { pass: 1177, fail: 8, deferred_baseline: 8 }
type_check: { errors: 181, baseline: 182, regression: no }
phase_32_5_forward_compat: yes
---

# Phase 32 — Verification

**Goal (verbatim ROADMAP):** "The help output is organized and all query commands support uniform output format flags so users can discover commands by category and consume output programmatically."

**Mode:** Standard goal-backward (not MVP — Phase 32 ROADMAP entry has no `mode: mvp`).

## Goal Achievement — Observable Truths

### Criterion 1 (ROADMAP SC-1, CLI-01): `memory --help` groups commands under labeled categories (Query, Data, System, Feedback)

**Status:** VERIFIED

**Evidence (live `bun src/presentation/cli/index.ts --help`):**
- 4 group headings render in expected order: "Query Commands:", "Data Commands:", "System Commands:", "Feedback Commands:"
- `search`, `context`, `show`, `list`, `related`, `stats` under "Query Commands:"
- `sync`, `backfill`, `export`, `import`, `purge` under "Data Commands:"
- `install`, `uninstall`, `status`, `doctor`, `completion`, `browse` under "System Commands:"
- `friction` under "Feedback Commands:"
- A trailing `Commands:` block carries the builtin `help` entry (Commander default — does NOT contradict CLI-01; the 4 categorized headings are present and load-bearing)
- Snapshot in `src/presentation/cli/__snapshots__/help-groups.test.ts.snap` reflects the exact structure
- `program.commandsGroup()` wiring in `src/presentation/cli/index.ts:45,54,63,72` — verified by file read

**Test gate:** `bun test src/presentation/cli/help-groups.test.ts` — 8 / 8 pass.

### Criterion 2 (ROADMAP SC-2, CLI-02): All 6 query commands accept `--json` and produce valid JSON envelope

**Status:** VERIFIED

**Evidence:**
- `.option("--json", ...)` present in all 6 command files (search.ts:153, context.ts:110, show.ts:80, list.ts:104, related.ts:105, stats.ts:84)
- Every command imports `emitJsonEnvelope` and `emitJsonErrorEnvelope` from `../formatters/envelope.js`
- Grep occurrence count by file: search 11, context 7, list 7, related 6, show 5, stats 5 — confirms multiple exit paths route through envelope (HIGH-2 satisfied)
- Live `bun src/presentation/cli/index.ts stats --json` produces a valid envelope: `{ schema_version: "1", command: "stats", kind: "stats", meta: {...}, data: {...} }`
- Live `bun src/presentation/cli/index.ts list --format default --json` emits clean JSON to stdout (deprecation warning suppressed — CLI-03 deprecation contract)

**Test gates:**
- `bun test src/presentation/cli/formatters/envelope.test.ts` — 32 / 32 pass
- `bun test src/presentation/cli/commands/{search,context,show,list,related,stats}.json.test.ts` — 42 / 42 pass
- `bun test src/presentation/cli/commands/{list,stats}.deps.test.ts` — 8 / 8 pass (test-isolation seam — HIGH-3)

### Criterion 3 (ROADMAP SC-3, CLI-03): All 6 commands support `--format brief` and `--format ai`

**Status:** VERIFIED

**Evidence (per-command `--help` inspection):**

| Command  | `.choices()`                   | Deprecated alias |
| -------- | ------------------------------ | ---------------- |
| search   | `["brief", "ai", "default"]`   | default          |
| context  | `["brief", "ai", "detailed"]`  | detailed         |
| show     | `["brief", "ai", "default"]`   | default          |
| list     | `["brief", "ai", "default"]`   | default          |
| related  | `["brief", "ai", "detailed"]`  | detailed         |
| stats    | `["brief", "ai", "default"]`   | default          |

- All 6 commands accept `brief` and `ai`
- Live `bun src/presentation/cli/index.ts stats --format brief` produces exactly 5 lines (W5 spec satisfied): sessions / messages / tool uses / projects / size
- Deprecation cadence documented in `CHANGELOG.md` `[Unreleased] > Deprecated`
- Live `bun src/presentation/cli/index.ts list --format default` emits stderr warning: `warning: --format default is deprecated and will be removed in the next minor release...`
- Live `bun src/presentation/cli/index.ts list --format default --json` suppresses the warning (preserves JSON-on-stdout contract)

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/presentation/cli/formatters/envelope.ts` | Runtime tuples + types + builders + emitters | VERIFIED | All exports present; JSDoc schema-version policy block at top; 100% coverage |
| `src/presentation/cli/formatters/dto-helpers.ts` | 7 DTO functions extracted from JsonOutputFormatter | VERIFIED | All 7 DTOs present; `toSearchResultDto` computes highlights BEFORE `<mark>` strip (Gemini LOW invariant) |
| `src/presentation/cli/index.ts` | `.commandsGroup()` wiring | VERIFIED | 4 groups wired in order Query/Data/System/Feedback |
| `src/presentation/cli/commands/_helpers/deprecation-warning.ts` | One-shot stderr warning + JSON suppression | VERIFIED | Module-scoped Set; `resetFormatDeprecationWarningsForTesting` for tests |
| `src/presentation/cli/commands/_helpers/capture-json.ts` | Shared stdout/stderr capture helper | VERIFIED | Used by 6 `.json.test.ts` files |
| `CHANGELOG.md` | Keep a Changelog 1.1.0 + SemVer | VERIFIED | `[Unreleased] > Changed` documents CLI-01/02/03; `Deprecated` documents `default` + `detailed` |

## Key Link Verification (Wiring)

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `index.ts` | `Commander.commandsGroup()` | `program.commandsGroup("Query Commands:")` (× 4) | VERIFIED |
| Each query command | `envelope.emitJsonEnvelope` | `import` + `if (options.json) emitJsonEnvelope({...})` | VERIFIED (grep — 5-11 occurrences per file) |
| Each query command | `envelope.emitJsonErrorEnvelope` | `import` + emit on every error path | VERIFIED |
| `list.ts` / `stats.ts` | `deps?: { dbPath? }` test seam | `executeListCommand(options, deps = {})` | VERIFIED |
| `context.ts` | `useSmartContext()` precedence | `if (options.json) return !!options.budget || !!options.crossProject;` | VERIFIED (HIGH-5 — context.ts:142-149) |
| Search `--files` branch | `emitJsonEnvelope` with `kind: "file"` | `emitJsonEnvelope({ command: "search", kind: "file", ... })` | VERIFIED (search.ts:537-541) |
| Deprecated alias path | `emitFormatDeprecationWarning` | Conditional on `format === "default"` / `"detailed"` | VERIFIED in all 6 commands |

## Cross-AI Review Findings — Actually Present in Code

| Finding | Required artifact | Code evidence | Status |
| ------- | ----------------- | ------------- | ------ |
| HIGH-1 (runtime tuples as const) | `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` exported as `as const` arrays | envelope.ts:32-39, 51-58 — both tuples use `as const`; types derived via `(typeof T)[number]` | VERIFIED |
| HIGH-2 (multiple exit paths) | Every exit path routes through envelope emitters | grep returns 41 emit calls across 6 commands (search 11, context 7, list 7, related 6, show 5, stats 5) — each command has emit calls on success, error, validation, not-found branches | VERIFIED |
| HIGH-3 (test seams) | `executeListCommand` / `executeStatsCommand` accept `deps?: { dbPath? }` | list.ts:73 `export interface ListCommandDeps`; stats.ts:71 `export interface StatsCommandDeps`; `list.deps.test.ts` + `stats.deps.test.ts` PASS | VERIFIED |
| HIGH-4 (`--files --json` envelope) | `QUERY_RESULT_KINDS` includes `"file"`; search.ts wraps file results | envelope.ts:57 `"file"`; search.ts:537-541 `emitJsonEnvelope({ command: "search", kind: "file", ... })` | VERIFIED |
| HIGH-5 (context precedence) | `useSmartContext` bypasses `--format ai` when `--json` set; precedence comment | context.ts:125-149 — precedence JSDoc block + `useSmartContext` checks `options.json` first | VERIFIED |
| MEDIUM-1 (DTO extraction) | `dto-helpers.ts` exists; `JsonOutputFormatter.formatResults` delegates | dto-helpers.ts:63 `toSearchResultDto`; output-formatter.ts modified (per diff stat: 85 lines changed); highlights-before-strip invariant tested in dto-helpers.test.ts | VERIFIED |
| MEDIUM-2 (deprecation aliases) | `default` on search/list/show/stats; `detailed` on context/related | Per-command `.choices()` inspection — all 6 commands carry their deprecated alias | VERIFIED |
| MEDIUM-3 (cross-platform verify) | PLAN `<verify>` blocks use plain `bun test <paths>` | `bash | tail` removed in revision_4 per `32-REVIEWS.md` convergence pass; verified by grepping plans | VERIFIED |
| MEDIUM-4 (discriminated EnvelopeScope) | `{ type: "global" } | { type: "project"; project: string }` | envelope.ts:70-72 — exact discriminated shape | VERIFIED |
| LOW-1 (CHANGELOG existence) | `CHANGELOG.md` at repo root | File present; Keep a Changelog 1.1.0 + SemVer structure; CLI-01/02/03 entries in `[Unreleased] > Changed` | VERIFIED |
| LOW-4 (schema_version doc) | JSDoc block on `ENVELOPE_SCHEMA_VERSION` | envelope.ts:1-20 — multi-paragraph JSDoc documenting bump policy (rename / type change / removal / semantic change = breaking; new optional / additive = no bump) | VERIFIED |
| Gemini LOW (highlights-before-strip) | DTO extracts highlights before `replace(/<\/?mark>/g, "")` | dto-helpers.ts:68 `extractHighlights(result.snippet)` BEFORE line 70 `cleanSnippet = result.snippet.replace(...)` | VERIFIED |

All 12 review findings present in code as claimed in SUMMARIES.

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CLI-01 | 32-01 | Help output groups commands under labeled categories using Commander.js help customization | SATISFIED | `.commandsGroup()` × 4 in index.ts; `bun src/presentation/cli/index.ts --help` confirms live output |
| CLI-02 | 32-02 | All query commands support `--json` for structured output | SATISFIED | 6 / 6 commands have `--json` option + envelope emission on every exit path |
| CLI-03 | 32-03 | All query commands support `--format` flag with at least `brief` and `ai` modes | SATISFIED | 6 / 6 commands have `.choices(["brief", "ai", <alias>])` |

QUAL-01 (95%+ coverage at EACH metric for all new code) — see **Gaps Summary** below.

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
| `stats --format brief` ≤ 5 lines | `bun src/presentation/cli/index.ts stats --format brief` | Exactly 5 lines | PASS |
| Deprecated alias warns | `bun src/presentation/cli/index.ts list --format default` | stderr warning emitted | PASS |
| Deprecated alias + JSON suppresses warning | `bun src/presentation/cli/index.ts list --format default --json` | Clean JSON; no stderr leak before output | PASS |

## Test Gates

| Gate | Result | Baseline | Status |
| ---- | ------ | -------- | ------ |
| `bun test src/presentation/cli/formatters/envelope.test.ts` | 32 / 32 pass | n/a | PASS |
| `bun test src/presentation/cli/help-groups.test.ts` | 8 / 8 pass | n/a | PASS |
| `bun test src/presentation/cli/formatters/dto-helpers.test.ts` | 13 / 13 pass | n/a | PASS |
| `bun test src/presentation/cli/commands/*.json.test.ts` | 42 / 42 pass | n/a | PASS |
| `bun test src/presentation/cli/commands/{list,stats}.deps.test.ts` | 8 / 8 pass | n/a | PASS |
| `bun test src/presentation/cli` (full subdir) | 1177 pass / 8 fail | 8 fail (deferred) | PASS (no regression) |
| `bun run test:isolation` | PASS — 0 violations | 0 | PASS |
| `bun --bun tsc --noEmit` | 181 errors | 182 baseline | PASS (1 reduction, no regression) |
| 8 failing tests are all `friction-dashboard.test.ts` | Verified | 8 friction-dashboard | PASS — matches `deferred-items.md` baseline |

## Coverage on Plan-Touched Files

Coverage measured by combining: 6 command tests + 6 `.json.test.ts` + 2 `.deps.test.ts` + `dto-helpers.test.ts` (`bun test ... --coverage`).

| File | Statements / Lines (~) | Branches | Functions | 95% gate |
| ---- | ---------------------- | -------- | --------- | -------- |
| `envelope.ts` | 100 | 100 | 100 | PASS |
| `formatters/index.ts` (barrel) | 100 | 100 | 100 | PASS |
| `_helpers/deprecation-warning.ts` | 100 | 94.12 | 100 | NEAR-MISS (branches 94.12 vs 95) |
| `dto-helpers.ts` | ~78 | 78.50 | 70.00 | FAIL |
| `commands/context.ts` | ~66 | 66.24 | 62.50 | FAIL |
| `commands/related.ts` | ~55 | 54.69 | 71.43 | FAIL |
| `commands/list.ts` | ~76 | 76.41 | 83.33 | FAIL |
| `commands/search.ts` | ~83 | 82.59 | 80.00 | FAIL |
| `commands/show.ts` | ~86 | 85.71 | 85.71 | FAIL |
| `commands/stats.ts` | ~79 | 78.91 | 83.33 | FAIL |

**Plan 32-02 SUMMARY admitted this**: "Per-file coverage on the touched command files sits in the 71-85% line/function range... This reflects the project's *pre-plan* coverage baseline on those files — Plan 32-02 did not regress coverage, but did not raise it to the global 95% target either, because the plan's scope was envelope-shape compliance (HIGH-2), not coverage backfill. ... production code coverage backfill is **out of scope** per Plan 32-02 success criteria and `deferred-items.md` (Phase 32 close-out item)."

However, `deferred-items.md` does NOT explicitly list coverage backfill as a deferred item with owner + trigger. Plan 32-02 SUMMARY references "deferred-items.md (Phase 32 close-out item)" but reading `deferred-items.md` shows only 2 items (TS errors + friction-dashboard); coverage is NOT in there.

QUAL-01 (REQUIREMENTS.md: "95%+ coverage at EACH metric for all new code") applies to all v4.0 phases as cross-cutting. The new code paths added by Phase 32 (envelope-emission branches across 6 command files, DTO transforms, deprecation warning) materially change control-flow within those files; "new code in a modified file" is still new code.

## Deferred Items Audit (no-hidden-debt)

`deferred-items.md` contains 2 items. Per `~/.claude/rules/no-hidden-debt.md` each must have **clear owner** AND **concrete trigger that fires automatically**.

### Item 1 — 181 pre-existing TS errors

- **Owner:** "Plans 32-02 + 32-03 ... or ... a dedicated Phase 32 cleanup task. **If after Phase 32 completes there are still pre-existing TS errors, surface to user for explicit close-out.**"
- **Trigger:** "Phase 32 completion" — **THIS TRIGGER HAS NOW FIRED.** Phase 32 is being verified; per the item's own contract, it should now be surfaced to the user for explicit close-out.

**Verdict:** Item is hidden debt at this verification gate. Owner contract requires user disposition NOW. Surface to user: fix / file inbox issue / explicit close.

### Item 2 — 8 friction-dashboard test failures

- **Owner:** "a future friction-envelope phase"
- **Trigger:** "When friction is brought into the envelope contract in a future phase"

This trigger is **not auto-firing**. ROADMAP shows no scheduled phase for friction envelope adoption. Per `no-hidden-debt.md`: "A trigger that fires on its own. A note in a file nobody reads is not a trigger." The trigger here is conditional on a phase that does not exist on the roadmap.

**Verdict:** Item is at-risk hidden debt. Either schedule a phase that triggers the cleanup, or explicitly accept and close.

### Coverage gap (NOT in deferred-items.md)

Plan 32-02 SUMMARY claims coverage is a "Phase 32 close-out item" tracked in `deferred-items.md`, but the file does NOT contain a coverage entry. This is a SUMMARY claim that is NOT in the codebase. If coverage was intended to be deferred, it must be added to `deferred-items.md` with owner + trigger per `no-hidden-debt.md`.

## Anti-Patterns Scan

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TODO / FIXME / XXX / placeholder markers in files modified by Phase 32 | — | Clean |

`grep -rE "TODO|FIXME|XXX" src/presentation/cli/formatters/envelope.ts src/presentation/cli/formatters/dto-helpers.ts src/presentation/cli/commands/_helpers/deprecation-warning.ts` returns no debt markers.

## Phase 32.5 Forward-Compatibility

| Property | Status |
| -------- | ------ |
| `schema_version: "1"` unchanged across all Phase 32 changes | VERIFIED — additive only |
| `kind` populated from command name; Phase 32.5 will populate from `--kind` flag | VERIFIED — all 6 commands map via `QUERY_RESULT_KINDS` tuple |
| `EnvelopeScope` discriminated for `--scope global|project` | VERIFIED — discriminated union shape |
| `QUERY_RESULT_KINDS` includes `"file"` for `search --files` Phase 32.5 routing | VERIFIED — envelope.ts:57 |
| `--json` overrides `--format ai` (deterministic precedence) | VERIFIED — code comments + tests |

## Gaps Summary

Phase 32 achieves all 3 ROADMAP success criteria as observable behavior in the codebase: help groups render, `--json` produces envelope, `--format brief|ai` is uniform. The 12 cross-AI review findings are all genuinely present in code (not just summarized). Hexagonal preserved. Type-check at baseline (181 ≤ 182). 1177 / 1185 tests pass; the 8 failures are exactly the friction-dashboard baseline.

However, two gaps block a clean PASS:

1. **Coverage on new code paths in modified command files (search/context/show/list/related/stats) and `dto-helpers.ts` falls below QUAL-01's "95%+ at EACH metric" gate.** Plan 32-02 SUMMARY admitted this but mislabeled it as deferred in `deferred-items.md` — the file does NOT contain a coverage entry. The Phase 32 SUMMARYs treat this as "out of scope" but QUAL-01 is a v4.0 cross-cutting requirement, not opt-in per plan. Either the user accepts this gap with explicit close, or coverage backfill is needed.

2. **`deferred-items.md` item 1 (TS errors) trigger has FIRED.** The item itself says "if after Phase 32 completes there are still pre-existing TS errors, surface to user for explicit close-out." Phase 32 is complete; the surface-now contract is active. 181 TS errors persist.

3. **`deferred-items.md` item 2 (friction-dashboard) trigger is not auto-firing.** Tied to a "future friction-envelope phase" that isn't on the ROADMAP. Per `no-hidden-debt.md` this is hidden debt — needs either a scheduled phase or explicit user closure.

These are not BLOCKER-tier (the phase goal IS achieved), but they are auditable gaps requiring user disposition before Phase 32 can be marked truly closed per the project's WoW gates.

## Verdict

**NEEDS_FIX** (or PASS with explicit user disposition of deferred items)

- All 3 ROADMAP success criteria: VERIFIED as observable behavior in the codebase
- All 3 requirements (CLI-01/02/03): SATISFIED
- All 12 cross-AI review findings: VERIFIED present in code
- Hexagonal integrity: PRESERVED
- Type-check at baseline: VERIFIED (181 ≤ 182)
- Test gate at baseline: VERIFIED (1177 pass / 8 fail = friction-dashboard baseline)
- Phase 32.5 forward-compat: VERIFIED
- Coverage on `envelope.ts`, `formatters/index.ts`, `_helpers/deprecation-warning.ts` (near-miss), and `help-groups.test.ts`: PASS or near-pass
- Coverage on `dto-helpers.ts` and 6 command files: FAIL vs QUAL-01 (95% / metric)
- `deferred-items.md` triggers: 1 fired (needs disposition now), 1 not auto-firing (hidden debt risk), coverage not in file at all (SUMMARY claim contradicts file content)

**Recommendation:** Mark Phase 32 functional-goal as achieved. Before closing the phase entirely, the user should explicitly dispose of:
1. **Coverage gap on Plan-32 touched files (vs QUAL-01).** Options: (a) backfill to 95% per metric in a Phase 32 close-out plan; (b) accept the pre-existing coverage baseline and add a `deferred-items.md` entry with owner + trigger; (c) raise the gap to roadmap as a dedicated cleanup phase.
2. **181 pre-existing TS errors.** Trigger has fired per the item's own contract — needs user decision.
3. **8 friction-dashboard test failures.** Trigger is not auto-firing — either schedule a phase or explicitly close.

If the user accepts these as known gaps with explicit dispositions captured in `deferred-items.md`, the verdict flips to PASS. Without that disposition, the phase carries hidden debt that the no-hidden-debt rule was written to prevent.

## VERIFICATION COMPLETE — NEEDS_FIX

Functional goal achieved; user disposition required on 3 quality gaps before phase close.
