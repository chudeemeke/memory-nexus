---
phase: 32-cli-surface
plan: 03
status: complete
completed: 2026-05-16
wave: 3
requirements: [CLI-03]
tags: [cli, format, brief, ai, presentation]
---

# Plan 32-03 — Wave 3: Normalize `--format brief|ai` across 6 query commands

## Outcome

CLI-03 landed. All six query commands (`search`, `context`, `show`, `list`, `related`, `stats`) now accept the normalized `--format brief|ai` choice set. Deprecated aliases (`default` on search/list/show/stats, `detailed` on context/related) are retained for one minor with one-shot stderr warnings that are suppressed in `--json` mode (preserves the JSON-on-stdout contract from Plan 32-02). Each command's text-mode path routes `--format brief` to a new `Brief*Formatter` class; `--format ai` continues to post-process via `formatForAi()` (unchanged behavior). The no-flag default text output is preserved unchanged (backward compatible).

Phase 32 is now complete:
- Plan 32-01 (Wave 1): CLI-01 (help groups) + envelope contract + emission helpers
- Plan 32-02 (Wave 2): CLI-02 (uniform `--json` envelope + DTO helpers + test seams)
- Plan 32-03 (Wave 3): CLI-03 (uniform `--format brief|ai` + deprecation aliases + CHANGELOG)

All three CLI-* requirements from REQUIREMENTS.md are satisfied.

## Files

### Added

| Path | Purpose |
|------|---------|
| `CHANGELOG.md` | Project release-note SSOT, established with canonical Keep a Changelog 1.1.0 + SemVer structure. Documents Phase 32's Changed (CLI-01 groups, CLI-02 envelope, CLI-03 format) + Deprecated (`--format default` / `--format detailed`) entries under `[Unreleased]`. |
| `src/presentation/cli/commands/_helpers/deprecation-warning.ts` | One-shot deprecation-warning helper. Module-scoped `Set` tracks emitted `(command, alias)` keys to avoid log floods. `emitFormatDeprecationWarning({ command, alias, replacement, json })` suppresses when `json: true`. Test-only `resetFormatDeprecationWarningsForTesting()` allows per-test isolation. |

### Modified

| Path | Change |
|------|--------|
| `src/presentation/cli/formatters/output-formatter.ts` | Extended `OutputMode` union with `"brief"`. New `BriefOutputFormatter` class produces `<sessionId> [<score>%] <snippet>` (snippet stripped of `<mark>` and truncated to 80 chars). Factory routes `mode === "brief"` to it. |
| `src/presentation/cli/formatters/list-formatter.ts` | Extended `ListOutputMode` with `"brief"`. New `BriefListFormatter` produces `<idShort> <project> <messageCount> <relativeTime>` one line per session. |
| `src/presentation/cli/formatters/show-formatter.ts` | Extended `ShowOutputMode` with `"brief"`. New `BriefShowFormatter` produces single pipe-separated line: `<sessionId> \| <project> \| <N> messages \| <startTime>`. No conversation thread. |
| `src/presentation/cli/formatters/stats-formatter.ts` | Extended `StatsOutputMode` with `"brief"`. New `BriefStatsFormatter` produces 5-line top-line counters: sessions, messages, tool uses, projects, size. Pitfall 4 Option A (top-line counters) / W5 (≤5 lines) resolved. |
| `src/presentation/cli/commands/search.ts` | `--format` choices = `["brief", "ai", "default"]`, no `.default()`. `format?: "brief" \| "ai" \| "default"`. Imports + calls `emitFormatDeprecationWarning` for `format === "default"`. Output mode dispatch updated: `--format brief` routes to `BriefOutputFormatter`; default-alias falls through to text default. |
| `src/presentation/cli/commands/show.ts` | Same shape as search; `determineOutputMode` updated to route `format === "brief"` to `"brief"` mode. |
| `src/presentation/cli/commands/list.ts` | Same shape as search/show. |
| `src/presentation/cli/commands/stats.ts` | Same shape as search/show/list. |
| `src/presentation/cli/commands/related.ts` | `--format` choices = `["brief", "ai", "detailed"]`, no `.default()`. `format?: "brief" \| "ai" \| "detailed"`. `emitFormatDeprecationWarning` for `format === "detailed"`. Existing logic that routes `format === "detailed"` to detailed formatter preserved. |
| `src/presentation/cli/commands/context.ts` | Same shape as related (detailed deprecated alias). Both legacy + smart-context paths preserve `detailed` routing. |
| 6× `*.test.ts` (search/show/list/stats/related/context) | New `CLI-03: --format normalization (Phase 32)` describe blocks. Existing `--format option with default and ai choice` / `--format option with choices` assertions migrated to assert `argChoices` contains brief + ai + deprecated-alias AND `defaultValue` is `undefined`. `beforeEach` calls `resetFormatDeprecationWarningsForTesting()` for per-test isolation. |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `7d3d159` | test | `test(32-03): add failing --format brief|ai tests (RED)` |
| `4aac847` | feat | `feat(32-03): formatter brief paths + ai post-process (GREEN)` |
| `06bf27b` | feat | `feat(32-03): normalize --format brief|ai with deprecation aliases` |

Per atomic-commit + TDD discipline: 3 commits, RED before GREEN. Task 3 was not split (context budget held under 50%).

## CLI-03 verification evidence

| Command | `--help` snippet | brief output spec |
|---------|---|---|
| `search` | `--format <type>  Output format: brief (single-line per record) or ai (AI-optimized text). 'default' accepted as deprecated alias. (choices: "brief", "ai", "default")` | `<sessionId> [<score>%] <snippet 80 chars>` |
| `context` | `--format <type>  Output format: brief, ai. 'detailed' accepted as deprecated alias. (choices: "brief", "ai", "detailed")` | One-line summary via existing `BriefContextFormatter` |
| `show` | `--format <type>  Output format: brief (single-line summary) or ai (AI-optimized text). 'default' accepted as deprecated alias. (choices: "brief", "ai", "default")` | `<sessionId> \| <project> \| <N> messages \| <startTime>` |
| `list` | `--format <type>  Output format: brief (single-line per session) or ai (AI-optimized text). 'default' accepted as deprecated alias. (choices: "brief", "ai", "default")` | `<idShort> <project> <messageCount> <relativeTime>` |
| `related` | `--format <type>  Output format: brief, ai. 'detailed' accepted as deprecated alias. (choices: "brief", "ai", "detailed")` | Existing `BriefRelatedFormatter` (unchanged) |
| `stats` | `--format <type>  Output format: brief (top-line counters) or ai (AI-optimized text). 'default' accepted as deprecated alias. (choices: "brief", "ai", "default")` | 5 lines: `<N> sessions / <N> messages / <N> tool uses / <N> projects / <size>` |

`--help` was verified manually via `bun src/presentation/cli/index.ts <command> --help` for all 6 commands.

## Deprecation cadence

`--format default` (search/list/show/stats) and `--format detailed` (context/related) are scheduled for **removal in the next minor release**. CHANGELOG.md `[Unreleased] > Deprecated` section is the SSOT.

- One-shot stderr warning (module-scoped `Set` tracks emissions per process): `warning: --format <alias> is deprecated and will be removed in the next minor release. <replacement>`
- Suppressed when `--json` is set (industry-standard: machine output must not be polluted by advisory stderr that consumers don't parse).
- Behavior preserved: alias values map to the existing text default path (alias = same behavior, no semantic change).

The next-minor release author should:
1. Remove `default` from search/list/show/stats `.choices()` list.
2. Remove `detailed` from context/related `.choices()` list.
3. Remove the `emitFormatDeprecationWarning` calls.
4. Remove the alias literals from each command's `format?:` interface type.
5. Move the corresponding CHANGELOG entries from `[Unreleased] > Deprecated` to `[Removed]` under the next minor version heading.
6. (Optional) Delete `_helpers/deprecation-warning.ts` if no other deprecated alias remains.

## Optional polish status (Gemini LOW-3)

**`.optionsGroup("Output Options:")` for `--json/--format/--verbose/--quiet`:** DEFERRED to post-Phase-32 polish. Reason: Commander v14's `.optionsGroup()` API is per-`Option` (not per-`Command`), so grouping requires re-binding each option via `cmd.options[i].helpGroup("Output Options:")` after `addOption`. Adding this across 6 commands × 4 options = 24 mechanical edits would push commit count and reviewer surface without functional benefit; deferred to a dedicated post-Phase-32 polish PR. Plan 32-RESEARCH.md noted it as "optional polish if context budget permits"; Task 3 noted it as optional. The functional surface (groups + envelope + format normalization) is the load-bearing part of Phase 32 — output-option grouping is a discoverability improvement that can ship independently.

## Resolved review findings

| Finding | Resolution |
|---------|-----------|
| Codex MEDIUM-2 — `--format default` deprecation parity | `default` retained as deprecated alias on search/list/show/stats with one-shot stderr warning + `--json` suppression. Parity with `detailed` on context/related. CHANGELOG documents one-minor removal cadence. |
| Codex MEDIUM-3 — Windows shell safety | All Task 3 verify steps use `bun test <paths>` (no shell pipes); `bun --print "Bun.file('CHANGELOG.md').exists()"` for cross-platform file checks. Subdirectory `bun test src/presentation/cli` used as Windows-safe full-suite gate (bun-test integer-overflow workaround per inbox 2026-05-11). |
| Codex LOW-1 — CHANGELOG.md existence | Verified missing (`test -f CHANGELOG.md` returned "missing"); created with canonical Keep a Changelog 1.1.0 + SemVer structure. Project now has a release-note SSOT. |
| Gemini LOW-2 — stats brief verbosity for AI mode | DEFERRED. Current spec is ≤5 lines for stats brief (W5) — sufficient for AI consumers without adding complexity. Future tightening to single-line for `--format ai` specifically is post-Phase-32 polish. |
| Gemini LOW-3 — `.optionsGroup()` for output flags | DEFERRED — see "Optional polish status" above. |

## Verification (all gates green)

| Gate | Result |
|------|--------|
| `bun test src/presentation/cli/commands/search.test.ts` | PASS (113/113) |
| `bun test src/presentation/cli/commands/show.test.ts` | PASS (26/26) |
| `bun test src/presentation/cli/commands/list.test.ts` | PASS (36/36) |
| `bun test src/presentation/cli/commands/stats.test.ts` | PASS (38/38) |
| `bun test src/presentation/cli/commands/related.test.ts` | PASS (34/34) |
| `bun test src/presentation/cli/commands/context.test.ts` | PASS (40/40) |
| `bun test src/presentation/cli/commands/*.json.test.ts` | PASS — 42 envelope tests green (Plan 32-02 regression check) |
| `bun test src/presentation/cli/commands/list.deps.test.ts` `+stats.deps.test.ts` | PASS (deps seams unchanged) |
| `bun test src/presentation/cli` (Windows-safe subdirectory) | 1177 pass / 8 fail (pre-existing friction-dashboard failures only — deferred-items.md baseline) |
| `bun run test:isolation` | PASS — 0 violations |
| `bun --bun tsc --noEmit` (total error count) | 181 — **unchanged from pre-plan baseline** (envelope `EmitDeprecationOptions.json` typed with explicit `boolean \| undefined` to satisfy `exactOptionalPropertyTypes: true`) |
| `bun src/presentation/cli/index.ts <cmd> --help` for all 6 commands | All show normalized `--format <choices>` line with proper deprecation hint |
| `bun --print "Bun.file('CHANGELOG.md').exists()"` | `true` |

## Pre-existing baseline (unchanged)

Per `deferred-items.md`:
- 181 pre-existing TS errors in CLI files NOT touched by this plan — confirmed unchanged
- 8 pre-existing `friction-dashboard.test.ts` failures — confirmed identical to baseline

Zero new test failures, zero new TS errors introduced by Plan 32-03.

## Phase 32.5 readiness

| Forward-compat property | Status |
|-------------------------|--------|
| `--format brief\|ai` choice list is the conservative 2-value floor | Preserved; Phase 32.5 may add `--shape <...>` as a separate flag without revisiting `--format` |
| Deprecated `default`/`detailed` aliases do NOT carry forward | CHANGELOG signals next-minor removal; Phase 32.5 inherits a clean `brief\|ai` taxonomy |
| `--format brief` and `--format ai` are uniform across 6 commands | Phase 32.5's unified query primitive can route all 6 to a single brief/ai code path |
| `--json` always wins over `--format` (Plan 32-02 contract) | Re-asserted at format layer via routing-equivalence tests; precedence rule documented in code comments |

## W5 note

Stats brief output is bounded at **≤5 lines** (Pitfall 4 Option A). Implementation: `BriefStatsFormatter.formatStats` returns exactly 5 lines (sessions / messages / tool uses / projects / size). Empty-state also returns 5 lines. Verified by `Stats Command > CLI-03 > --format brief produces top-line counters (≤5 lines, W5)` test.

## W6 note (OutputMode caller cascade)

Step 0 grep sweep at start of Task 2 enumerated 19 `OutputMode` callers, all within `src/presentation/cli/` (no leakage to domain/application/infrastructure). Each formatter file defines its own `<Foo>OutputMode` union (output/list/show/stats), so the extension was per-file additive (`+ "brief"`) — no cross-cutting cascade required. context-formatter and related-formatter already declared `brief` in their unions; no extension needed there. `bun --bun tsc --noEmit` count unchanged across Task 2 and Task 3 (181 baseline).

## Self-Check: PASSED

| Claim | Verification |
|-------|--------------|
| `CHANGELOG.md` exists at repo root | FOUND |
| `src/presentation/cli/commands/_helpers/deprecation-warning.ts` exists | FOUND |
| `7d3d159` RED commit exists | FOUND in `git log` |
| `4aac847` formatter GREEN commit exists | FOUND in `git log` |
| `06bf27b` wiring + CHANGELOG commit exists | FOUND in `git log` |
| All 6 commands' `--format` argChoices contain `"brief"` | VERIFIED via per-command `bun src/presentation/cli/index.ts <cmd> --help` |
| All 6 commands' `--format` argChoices contain `"ai"` | VERIFIED |
| search/list/show/stats argChoices contain `"default"` (deprecated alias) | VERIFIED |
| context/related argChoices contain `"detailed"` (deprecated alias) | VERIFIED |
| No `.default()` on any `--format` (defaultValue is undefined) | VERIFIED by per-test-file CLI-03 assertion |
| `bun test src/presentation/cli` exits 0 except 8 pre-existing failures | VERIFIED |
| `bun run test:isolation` exits 0 | VERIFIED |
| `bun --bun tsc --noEmit` error count unchanged at 181 | VERIFIED |
| `BriefStatsFormatter.formatStats` returns ≤5 lines | VERIFIED by test and code inspection (5 hard-coded lines) |
| Deprecation warning emitted on `--format default` (text mode) | VERIFIED by per-command test |
| Deprecation warning suppressed on `--format default --json` | VERIFIED by per-command test |
| CHANGELOG has Unreleased > Changed (CLI-01/02/03) + Deprecated (default + detailed) | VERIFIED by reading file |

No checks failed.
