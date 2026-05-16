---
phase: 32-cli-surface
plan: 01
status: complete
completed: 2026-05-16
wave: 1
requirements: [CLI-01]
tags: [cli, commander, help, envelope, presentation]
---

# Plan 32-01 — Foundation: Help Groups + Envelope Contract

## Outcome

Phase 32 foundation landed: labeled help groups (CLI-01) plus shared `QueryResultEnvelope<T>` contract and `emitJsonEnvelope` / `emitJsonErrorEnvelope` helpers (CLI-02 foundation). Plans 32-02 (CLI-02 wiring) and 32-03 (CLI-03 wiring) can now import the envelope module without inventing a contract.

## Files

### Added

| Path | Purpose |
|------|---------|
| `src/presentation/cli/formatters/envelope.ts` | `ENVELOPE_SCHEMA_VERSION`, `QUERY_COMMAND_NAMES` / `QUERY_RESULT_KINDS` runtime tuples, `QueryCommandName` / `QueryResultKind` types derived from tuples, discriminated `EnvelopeScope`, `QueryResultEnvelope<T>` / `QueryErrorEnvelope` interfaces, `buildEnvelope` / `buildErrorEnvelope` builders, `emitJsonEnvelope` / `emitJsonErrorEnvelope` shared emission helpers |
| `src/presentation/cli/formatters/envelope.test.ts` | 32 tests covering tuples, builders, JSON round-trip, both scope variants, and emission helpers (stdout capture via `console.log` monkey-patch) |
| `src/presentation/cli/help-groups.test.ts` | 8 tests covering 4 group headings present + 3 command placements + 1 snapshot (version-line stripped) |
| `src/presentation/cli/__snapshots__/help-groups.test.ts.snap` | Stable help structure snapshot; version-line excluded per W1 policy |
| `.planning/phases/32-cli-surface/deferred-items.md` | Out-of-scope items surfaced during execution: 182 pre-existing TS errors, 8 pre-existing friction-dashboard test failures |

### Modified

| Path | Change |
|------|--------|
| `src/presentation/cli/formatters/index.ts` | Re-export envelope contract (types + tuples + builders + emitters) from the barrel |
| `src/presentation/cli/index.ts` | Refactored flat `addCommand` block to use `.commandsGroup()` (Commander.js v14) for 4 groups: Query / Data / System / Feedback. `browse` placed under System per research §Open Q1 |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `03dc02c` | test | `test(32-01): add failing envelope + help-groups tests (RED)` |
| `c8020fa` | feat | `feat(32-01): envelope contract + help groups (GREEN)` |

Per atomic-commit discipline: 2 commits, RED before GREEN, no batch commits.

## Verification (all gates green)

| Gate | Result |
|------|--------|
| `bun test src/presentation/cli/formatters/envelope.test.ts src/presentation/cli/help-groups.test.ts` | 35 pass / 0 fail / 1 snapshot |
| envelope.ts coverage (statements / branches / functions / lines) | 100.00 / 100.00 / 100.00 / 100.00 |
| envelope.test.ts coverage | 100.00 across all metrics |
| help-groups.test.ts coverage | 100.00 across all metrics |
| `bun run test:isolation` | PASS — 0 violations |
| `bun src/presentation/cli/index.ts --help` | 4 group headings in order: Query / Data / System / Feedback |
| Snapshot contains a `version X.Y.Z` line | NO (regex `/version\s+\d+\.\d+\.\d+/i` matches 0 lines) |
| `bun --bun tsc --noEmit` for files touched by this plan | 0 errors |

## Coverage Delta

Coverage on plan-touched files:
- `envelope.ts` — new file, 100.00% / 100.00% / 100.00% / 100.00%
- `formatters/index.ts` — already 100.00%; re-export does not introduce uncovered branches
- `presentation/cli/index.ts` — 100.00% statements, 89.19% branches (unchanged — the `import.meta.main` block was already partial; `.commandsGroup()` wiring is straight-line code with no branches)

## Resolved Review Findings

| Finding | Resolution |
|---------|------------|
| Codex HIGH-1 — runtime tuples impossible if types were exported as type-only | `QUERY_COMMAND_NAMES` and `QUERY_RESULT_KINDS` exported as `as const` tuples; types derived via `(typeof T)[number]`. Runtime-importable, type-safe |
| Codex HIGH-2 — emission helpers must be canonical write surface | `emitJsonEnvelope` and `emitJsonErrorEnvelope` exported from envelope.ts and re-exported from formatters barrel. Plan 02 must route every exit path through these |
| Codex MEDIUM-4 — `scope` was a freeform string, ambiguous for Phase 32.5 | `EnvelopeScope` is now a discriminated union: `{ type: "global" } \| { type: "project"; project: string }`. Maps 1:1 to `--scope global \| project [--project <name>]` |
| Gemini suggestion — schema-version bump policy needs documentation | JSDoc block at top of envelope.ts documents additive-vs-breaking changes |

## Forward-Compat Notes

Plans 32-02 and 32-03 consume the envelope module like this:

```typescript
// Plan 32-02 (CLI-02 wiring for search/context/show/list/related/stats)
import {
  emitJsonEnvelope,
  emitJsonErrorEnvelope,
  type QueryResultKind,
} from "../formatters/envelope.js";

// Success path
emitJsonEnvelope({
  command: "search",
  kind: "message",
  data: results,
  scope: project ? { type: "project", project } : { type: "global" },
  meta: { total: results.length },
});

// Error path
emitJsonErrorEnvelope({
  command: "search",
  code: "VALIDATION_ERROR",
  message: "query required",
});
```

Phase 32.5 forward-compat: the discriminated `EnvelopeScope` shape maps directly to `memory query --scope global|project [--project <name>] --kind <message|session|...>` without a schema bump. `QUERY_RESULT_KINDS` already includes `"file"` so HIGH-4 (`search --files --json`) routes through the same envelope.

## Snapshot Policy (for future maintainers)

`src/presentation/cli/__snapshots__/help-groups.test.ts.snap` is generated by `help-groups.test.ts` and must NOT contain a `version X.Y.Z` line. The test sanitizes help output via:

```ts
const sanitized = help
  .split("\n")
  .filter((line) => !/version\s+\d+\.\d+\.\d+/i.test(line))
  .join("\n");
expect(sanitized).toMatchSnapshot();
```

This means:
- Package version bumps (`package.json` `version`) do NOT churn the snapshot
- Help structure changes (new group, new command, reordered group) DO churn the snapshot, and the maintainer must verify the new shape matches CLI-01 contract before running `bun test ... --update-snapshots`

If you find yourself running `--update-snapshots` to silence a failure, STOP. Read the diff first. If the diff is structural (new heading, new command), it may be intended; if it's a regression (group ordering changed, command moved to wrong group), the test caught a bug.

## Deferred Items

See `.planning/phases/32-cli-surface/deferred-items.md`:
- 182 pre-existing TS errors in CLI files NOT touched by this plan (confirmed via stash baseline — zero regression caused by Plan 32-01)
- 8 pre-existing friction-dashboard test failures (friction envelope adoption is explicitly out of Phase 32 scope per `<open_questions>` Q7)

Both items have clear owner/trigger and are surfaced rather than silently buried.

## Self-Check: PASSED

| Claim | Verification |
|-------|--------------|
| `envelope.ts` exists | FOUND: `src/presentation/cli/formatters/envelope.ts` |
| `envelope.test.ts` exists | FOUND: `src/presentation/cli/formatters/envelope.test.ts` |
| `help-groups.test.ts` exists | FOUND: `src/presentation/cli/help-groups.test.ts` |
| Help snapshot exists | FOUND: `src/presentation/cli/__snapshots__/help-groups.test.ts.snap` |
| RED commit exists | FOUND: `03dc02c test(32-01): add failing envelope + help-groups tests (RED)` |
| GREEN commit exists | FOUND: `c8020fa feat(32-01): envelope contract + help groups (GREEN)` |
| 4 group headings render in `--help` output in expected order | FOUND: Query / Data / System / Feedback |
| `search` under Query, `sync` under Data, `friction` under Feedback | FOUND in `--help` text |
| Snapshot does NOT contain a `version X.Y.Z` line | VERIFIED: 0 matches for `/version\s+\d+\.\d+\.\d+/i` |
| envelope.ts coverage ≥95% per metric | VERIFIED: 100% across statements / branches / functions / lines |

No checks failed.
