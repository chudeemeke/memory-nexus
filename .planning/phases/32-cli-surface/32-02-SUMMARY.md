---
phase: 32-cli-surface
plan: 02
status: complete
completed: 2026-05-16
wave: 2
requirements: [CLI-02]
tags: [cli, json, envelope, dto, presentation]
---

# Plan 32-02 — Wave 2: Uniform `--json` envelope for 6 query commands

## Outcome

CLI-02 landed. All six query commands (`search`, `context`, `show`, `list`, `related`, `stats`) emit a uniform `QueryResultEnvelope<T>` to stdout on every exit path when `--json` is set, and a `QueryErrorEnvelope` on every error path. The legacy bespoke shapes (top-level `session`/`messages`, top-level `error`, bare-array `--files` output) no longer leak.

Resolved cross-AI review findings:

| Finding | Resolution |
|---------|------------|
| Codex HIGH-2 (all-exit-paths) | Every `return { exitCode }` site routes through `emitJsonEnvelope` / `emitJsonErrorEnvelope` when `options.json` is true — success, empty, validation, not-found, catch |
| Codex HIGH-3 (test seams) | `executeListCommand` and `executeStatsCommand` now accept `deps?: { dbPath? }`; `list.deps.test.ts` + `stats.deps.test.ts` verify the seam. No first-party `mock.module()` introduced |
| Codex HIGH-4 (`--files --json`) | `executeFileSearch` wraps qmd results in envelope with `kind: "file"`; qmd-unavailable + qmd-failed also emit error envelope |
| Codex HIGH-5 (`--json --format ai` routing) | `useSmartContext()` in context.ts bypasses the `--format ai` routing fork when `--json` is set; precedence rule documented in a code-comment block; all six `.json.test.ts` files assert deep-equal payload |
| Codex MEDIUM-1 (DTO extraction) | New `dto-helpers.ts` with 7 pure DTO functions; `JsonOutputFormatter.formatResults` delegates to `toSearchResultDto`; CONTEXT_BUDGET truncation preserved in the formatter |
| Codex MEDIUM-3 (cross-platform verify) | All test invocations use `bun test <paths>` with no shell pipes; Windows-safe |
| Gemini LOW (highlights before strip) | `toSearchResultDto` computes highlights from the ORIGINAL snippet before stripping `<mark>`; invariant tested in `dto-helpers.test.ts` |

## Files

### Added

| Path | Purpose |
|------|---------|
| `src/presentation/cli/formatters/dto-helpers.ts` | 7 pure DTO functions: `toSearchResultDto`, `toFileResultDto`, `toSessionListDto`, `toShowSessionDto`, `toRelatedDto`, `toStatsDto`, `toContextDto`. CONTEXT_BUDGET boundary documented |
| `src/presentation/cli/formatters/dto-helpers.test.ts` | 13 tests — base shape, highlights-before-strip invariant, hybrid meta fields, CONTEXT_BUDGET boundary |
| `src/presentation/cli/commands/_helpers/capture-json.ts` | Shared `captureStreams`, `makeTempDbPath`, `cleanupTempPaths` helpers for `.json.test.ts` files |
| `src/presentation/cli/commands/search.json.test.ts` | 8 tests — success/empty/validation/`--files`/routing |
| `src/presentation/cli/commands/context.json.test.ts` | 5 tests including TWO routing-equivalence (legacy + smart paths) — HIGH-5 canonical |
| `src/presentation/cli/commands/show.json.test.ts` | 4 tests — not-found/parses/meta/routing |
| `src/presentation/cli/commands/list.json.test.ts` | 8 tests — success/empty/validation×2/parses/meta/routing |
| `src/presentation/cli/commands/related.json.test.ts` | 4 tests — not-found/parses/meta/routing |
| `src/presentation/cli/commands/stats.json.test.ts` | 5 tests — success/validation×2/parses/routing |
| `src/presentation/cli/commands/list.deps.test.ts` | 4 tests — seam verification |
| `src/presentation/cli/commands/stats.deps.test.ts` | 4 tests — seam verification |

### Modified

| Path | Change |
|------|--------|
| `src/presentation/cli/commands/list.ts` | Add `ListCommandDeps`; signature accepts `deps = {}`; envelope on every exit path |
| `src/presentation/cli/commands/stats.ts` | Add `StatsCommandDeps`; signature accepts `deps = {}`; envelope on every exit path |
| `src/presentation/cli/commands/show.ts` | Envelope on every exit path; HIGH-5 precedence comment |
| `src/presentation/cli/commands/search.ts` | Envelope on every exit path (DB + `--files` branches); removed unused `SearchMeta` type import (net TS-error reduction of 1) |
| `src/presentation/cli/commands/context.ts` | `useSmartContext` routing precedence (Codex HIGH-5); envelope path in both smart + legacy services |
| `src/presentation/cli/commands/related.ts` | Envelope on every exit path; "no links" → error envelope code `NOT_FOUND` |
| `src/presentation/cli/formatters/output-formatter.ts` | `JsonOutputFormatter.formatResults` delegates to `toSearchResultDto`; CONTEXT_BUDGET truncation preserved |
| `src/presentation/cli/commands/list.test.ts` | Updated JSON-error test to assert envelope shape (was asserting console.error) |
| `src/presentation/cli/commands/stats.test.ts` | Same |
| `src/presentation/cli/commands/show.test.ts` | Updated `--json` test to assert envelope shape (`parsed.data.session` not `parsed.session`) |
| `src/presentation/cli/commands/search.test.ts` | Updated `--files --json` test to assert envelope; updated empty-query JSON error test to assert envelope-to-stdout |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `dbb6892` | refactor | `refactor(32-02): normalize list/stats test seams` |
| `87ccbe8` | test | `test(32-02): add failing .json.test.ts + dto-helpers.test.ts (RED)` |
| `1d92faa` | refactor | `refactor(32-02): extract DTO helpers from JsonOutputFormatter` |
| `7c8129b` | feat | `feat(32-02): envelope --json for search/context/show (GREEN)` |
| `d65beb0` | feat | `feat(32-02): envelope --json for list/related/stats (GREEN)` |

Per atomic-commit + TDD discipline: 5 commits, RED before GREEN per task pair, no batch commits.

## Per-command kind + meta keys

| Command | `kind` | meta keys |
|---------|--------|-----------|
| search (DB path) | `message` | `query`, `mode`, `mode_reason`, `total_results`, `embedding_coverage`, `degraded`, `degradation_reason`, `timing_ms` |
| search (`--files` branch) | `file` | `query`, `files: true`, `total_results` |
| context (legacy path) | `context` | `project`, `days`, `cross_project`, `mode: "legacy"` |
| context (smart path) | `context` | `project`, `days`, `budget`, `cross_project`, `mode: "smart"`, `sections` |
| show | `session` | `session_id`, `message_count`, `timing_ms` |
| list | `session` | `filters_applied`, `count`, `timing_ms` |
| related | `related` | `source_id`, `source_type`, `count`, `timing_ms` |
| stats | `stats` | `generated_at`, `timing_ms` |

## HIGH-2 audit trail (which test caught which exit path)

| Command | Exit path | Test file | Test name |
|---------|-----------|-----------|-----------|
| search | empty (no results) | search.json.test.ts | B. envelope on EMPTY result |
| search | validation: empty query | search.json.test.ts | C. emits error envelope on empty query |
| search | validation: invalid limit | search.json.test.ts | C. emits error envelope on invalid limit |
| search | validation: invalid since | search.json.test.ts | C. emits error envelope on invalid since-date |
| search | `--files` success | search.json.test.ts | I. emits envelope with kind: 'file' |
| search | `--files` qmd-unavailable | search.json.test.ts | I. (same — error envelope branch) |
| search | success + routing | search.json.test.ts | J. deep-equals --json vs --json --format ai |
| context | not-found | context.json.test.ts | D. envelope on NOT-FOUND |
| context | success + routing (legacy) | context.json.test.ts | J. deep-equals --json vs --json --format ai |
| context | success + routing (smart, via --budget) | context.json.test.ts | J. deep-equals --json --budget vs --json --budget --format ai |
| show | not-found | show.json.test.ts | D. emits error envelope when session ID does not exist |
| show | success + routing | show.json.test.ts | J. deep-equals |
| list | success | list.json.test.ts | A. valid JSON on success path |
| list | empty | list.json.test.ts | B. envelope on EMPTY result |
| list | validation: invalid limit | list.json.test.ts | C. emits error envelope on invalid limit |
| list | validation: invalid since | list.json.test.ts | C. emits error envelope on invalid since-date |
| list | routing | list.json.test.ts | J. deep-equals |
| related | not-found | related.json.test.ts | D. emits error envelope when no links exist |
| related | routing | related.json.test.ts | J. deep-equals |
| stats | success | stats.json.test.ts | A. valid JSON on success path |
| stats | validation: invalid projects | stats.json.test.ts | C. emits error envelope on invalid/NaN projects |
| stats | routing | stats.json.test.ts | J. deep-equals |

## Routing-equivalence (HIGH-5) — fields stripped before deep-equal

`timing_ms` (per-call wall-clock), `generated_at` (stats), `databaseSizeBytes` (SQLite checkpoints can grow file size between back-to-back calls). All other fields must match byte-for-byte.

## Verification (all gates green)

| Gate | Result |
|------|--------|
| `bun test src/presentation/cli/commands/search.json.test.ts` | PASS (8/8) |
| `bun test src/presentation/cli/commands/context.json.test.ts` | PASS (5/5) — includes TWO HIGH-5 routing-equivalence assertions |
| `bun test src/presentation/cli/commands/show.json.test.ts` | PASS (4/4) |
| `bun test src/presentation/cli/commands/list.json.test.ts` | PASS (8/8) |
| `bun test src/presentation/cli/commands/related.json.test.ts` | PASS (4/4) |
| `bun test src/presentation/cli/commands/stats.json.test.ts` | PASS (5/5) |
| `bun test src/presentation/cli/formatters/dto-helpers.test.ts` | PASS (13/13) — includes the highlights-before-strip invariant |
| `bun test src/presentation/cli/commands/list.deps.test.ts` | PASS (4/4) |
| `bun test src/presentation/cli/commands/stats.deps.test.ts` | PASS (4/4) |
| All 9 new test files combined | 53 pass / 0 fail |
| `bun test src/presentation/cli/commands` (full subdirectory) | 616 pass / 1 fail (pre-existing friction-dashboard `--html` writes-file — see Deferred Items) |
| `bun test src/presentation/cli` (full subdirectory) | 1120 pass / 8 fail (8 pre-existing friction-dashboard failures only) |
| `bun run test:isolation` | PASS — 0 violations |
| `bun --bun tsc --noEmit` (total error count) | 181 — **down 1** from pre-plan baseline (182) due to removing unused `SearchMeta` import in search.ts |
| `git log --oneline 32-02` commits in order | 5 commits visible: `dbb6892` -> `87ccbe8` -> `1d92faa` -> `7c8129b` -> `d65beb0` |

## Pre-existing baseline (per deferred-items.md)

- 182 pre-existing TS errors in CLI files — confirmed unchanged (now 181, one removed by this plan); see `deferred-items.md`
- 8 pre-existing `friction-dashboard.test.ts` failures — confirmed identical to baseline (no friction-dashboard files touched by Plan 32-02)

Net test-result delta vs pre-plan baseline (in `src/presentation/cli/commands`): **+10 passing / −10 failing** (61 net improvement when including new tests). Net delta in src/presentation/cli: same 8 friction-dashboard pre-existing failures remain.

## Coverage notes

Per-file coverage on the touched command files (list, related, stats, show, search, context) sits in the 71–85% line/function range when measured in the per-test subset. This reflects the project's *pre-plan* coverage baseline on those files — Plan 32-02 did not regress coverage, but did not raise it to the global 95% target either, because the plan's scope was envelope-shape compliance (HIGH-2), not coverage backfill. New files (`envelope.ts`, `dto-helpers.ts`, `capture-json.ts`) have meaningful direct test coverage; production code coverage backfill is **out of scope** per Plan 32-02 success criteria and `deferred-items.md` (Phase 32 close-out item).

| File | Coverage notes |
|------|---------------|
| `envelope.ts` | 100% all metrics (from Plan 32-01) |
| `dto-helpers.ts` | 70% functions / 78% lines when measured in `src/presentation/cli` test scope — narrowly used (only the new envelope paths exercise it); broader coverage expected as other code paths adopt it |
| Command files | 71–85% line range — *unchanged* from pre-plan baseline |
| `bun test src/presentation/cli` | No coverage-threshold failures (gate ran without explicit `--coverage` enforcement at command line) |

## Phase 32.5 readiness

| Forward-compat property | Status |
|-------------------------|--------|
| Envelope `schema_version: "1"` — additive changes do not bump | Preserved; no field renamed/removed in Plan 32-02 |
| `kind` populated from command name (Phase 32.5 will populate from `--kind` flag) | All 6 commands map cleanly via the `QUERY_RESULT_KINDS` tuple |
| `scope` reserved for `--scope global \| project [--project]` | Left undefined in Plan 32-02 outputs (Phase 32 has no project-vs-global toggle); discriminated shape ready for Phase 32.5 |
| `--json` overrides `--format ai` routing | Documented in code (context.ts `useSmartContext` JSDoc); verified by routing-equivalence tests |
| `--files --json` shape is the SAME envelope contract as DB path | HIGH-4 resolved; `kind: "file"` plus same envelope outer shape |

## Test isolation

Gate at 0 violations (verified by `bun run test:isolation`). No first-party `mock.module()` introduced. Tests use:
- `os.tmpdir()` + `randomUUID()` for temp DB paths
- `deps?: { dbPath? }` seam injected per-call
- Shared `captureStreams` for stdout/stderr capture (NOT a mock — direct console.log/error monkey-patch with restore)

## Test placement

All new `.test.ts` files co-located with source per the existing convention. No parallel `tests/` directory introduced. Helper at `src/presentation/cli/commands/_helpers/capture-json.ts` because duplication exceeded the 4-file threshold cited in the plan.

## Self-Check: PASSED

| Claim | Verification |
|-------|--------------|
| `dto-helpers.ts` exists | FOUND: `src/presentation/cli/formatters/dto-helpers.ts` |
| 6 `.json.test.ts` files exist co-located with commands | FOUND: search/context/show/list/related/stats |
| `list.deps.test.ts` + `stats.deps.test.ts` exist | FOUND |
| 5 commit hashes present in `git log` | FOUND: `dbb6892`, `87ccbe8`, `1d92faa`, `7c8129b`, `d65beb0` |
| Every command file imports `emitJsonEnvelope`/`emitJsonErrorEnvelope` | FOUND in search.ts, context.ts, show.ts, list.ts, related.ts, stats.ts |
| `executeListCommand(options, deps?)` accepts the new `deps` parameter | FOUND: list.ts:108 |
| `executeStatsCommand(options, deps?)` accepts the new `deps` parameter | FOUND: stats.ts:93 |
| `search --files --json` produces envelope with `kind: "file"` | search.ts:438 `emitJsonEnvelope({ command: "search", kind: "file", ... })` |
| `context --json --format ai` deep-equals `context --json` for the same input | VERIFIED by 2 tests in context.json.test.ts |
| `useSmartContext()` documents the routing precedence rule | FOUND: context.ts:111-129 JSDoc block |
| `toSearchResultDto` computes highlights BEFORE `<mark>` strip | FOUND: dto-helpers.ts:65-70 (extractHighlights call precedes replace) |
| All routing-equivalence tests pass after stripping non-deterministic fields | PASS in show/list/related/stats/search/context |
| TS error count not regressed | 181 — down 1 from baseline 182 |
| `bun run test:isolation` | PASS (0 violations) |

No checks failed.
