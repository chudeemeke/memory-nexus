---
schema_version: "1.2"
source_project: memory-nexus
created: 2026-05-11
triaged_at: 2026-05-13
type: bug
severity: medium
fix_status: merged
affects_scope: this-project-only
status: merged
resolved_at: 2026-05-28
priority_rationale: Decision = MIGRATE (not delete); execution deferred until architecture audit Stage 3 recommends an outcome in {A, B, C, D}. Outcome E (deprecate memory-nexus) would abandon the fix entirely.
---

## Resolution (2026-05-28)

Archived as resolved/stale against the current implementation.

Resolution reference: local-worktree-verification.

Validation:
- `tests/presentation/cli/commands/friction.test.ts` exists.
- `bun test tests/presentation/cli/commands/friction.test.ts --timeout 15000` passes: 8 tests, 0 failures.
- The old import-path failure no longer reproduces; the file now exercises the dispatcher-style integration cases that the triage wanted preserved.

## Triage decision (2026-05-13)

**Decision:** MIGRATE, not delete.

**Why migrate (not delete):** the orphan file at `tests/presentation/cli/commands/friction.test.ts` contains 8 integration-style test cases that cover behaviors spanning multiple modules of the Phase-30 split:

- log + list interaction (write then filter by tool)
- list + markReviewed (state change observable across two list calls)
- list + NEW indicator + summary count (text-mode output formatting)
- dashboard --tool flag (consistent filter behavior across subcommands)
- auto-ingest (cross-cutting behavior that runs on any friction subcommand)

Verified: the co-located unit tests at `src/presentation/cli/commands/friction/*.test.ts` total 38 cases (8 across 7 files plus 18 in `index.test.ts`), but each tests a single module in isolation. The cross-module integration coverage in the orphan is NOT a subset.

Deleting would lose load-bearing integration coverage of the dispatcher seam. Migrating preserves it.

**Why execution is deferred (not done now):**

The migration is non-trivial — it's a full pattern arc, not an import-path rename:

1. Update imports from monolithic `friction.js` to `friction/index.js` (mechanical).
2. Replace `spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath)` with the canonical deps-injection pattern from the test-isolation arc — passing `{ dbPath: testDbPath }` through `executeFrictionCommand`. The current spy-on pattern was deprecated by that arc.
3. Restructure test cases to match the new module boundaries where appropriate (e.g., integration tests at the dispatcher vs unit tests per module).
4. Re-verify coverage (no lines drop in `src/presentation/cli/commands/friction/`).

This is a focused arc of its own — 8 cases at ~5 min/case + verification = ~1 session of work. Doing it inside a triage window mid-audit burns main-session context that's needed for Stage 1 first-principles thinking.

**Concrete trigger for execution:** architecture audit Stage 3 recommends an outcome in {A, B, C, D}. Specifically:

- If A/B/C (continue / federate / consolidate) — execute migration during the post-audit cleanup phase.
- If D (freeze at v4.0) — execute migration as part of the freeze hardening (test reliability matters for a frozen release).
- If E (deprecate / replace) — abandon. The migration is throwaway work because memory-nexus itself becomes throwaway.

**Owner:** memory-nexus, post-audit cleanup session.

**Side-effect during triage execution:** none. The orphan file stays in place; subagent test runs in Stage 1a/1b will see it fail at import time — this is a KNOWN issue surfaced in `~/.claude/projects/.../memory/test_isolation_cleanup.md`, NOT a Stage 1 finding.

# tests/presentation/cli/commands/friction.test.ts imports removed friction.js

## Symptom

```bash
$ bun test tests/presentation/cli/commands/friction.test.ts
error: Cannot find module '../../../../src/presentation/cli/commands/friction.js'
  from 'C:\...\tests\presentation\cli\commands\friction.test.ts'
```

Test file fails at import time. 1 fail + 1 error.

## Repro

```bash
bun test tests/presentation/cli/commands/friction.test.ts
```

## Root cause

Phase 30 (god-file cleanup) split `src/presentation/cli/commands/friction.ts` into a subdirectory of modules:

```
src/presentation/cli/commands/friction/
  dashboard.ts
  index.ts
  list.ts
  log.ts
  purge.ts
  resolve.ts
  types.ts
  wontfix.ts
```

The test file at `tests/presentation/cli/commands/friction.test.ts` still imports from the old monolithic path. Phase 30 cleanup migrated the production-code consumers and the new co-located unit tests at `src/presentation/cli/commands/friction/*.test.ts`, but missed the older tests/presentation/ duplicate.

Last touched by commit `ef5d588` (Phase 28-04) — predates Phase 30 cleanup.

## Proposed fix

Two paths:

**A. Delete the file** if its coverage is fully duplicated by the new co-located tests at `src/presentation/cli/commands/friction/*.test.ts`. Quick wins if the new tests are comprehensive.

**B. Migrate the file** if it tests scenarios not covered by the new module-level tests. Update imports to point at `friction/index.js` (and individual modules where appropriate). Likely some test cases need to be updated to match the new module boundaries.

Investigation step before deciding: diff the test coverage of `tests/presentation/cli/commands/friction.test.ts` vs the co-located `src/presentation/cli/commands/friction/*.test.ts` files. If A is a subset of B → delete. If A has unique coverage → migrate.

## Test plan

After fix: `bun test tests/presentation/cli/commands/` passes 11/11 (the previously-passing 10 + the migrated friction tests OR just the 10 if file deleted).

## Suggested commit message

If deleted:
```
test(friction): delete orphaned tests/presentation/cli/commands/friction.test.ts

The file was orphaned by Phase 30's god-file split of src/presentation/cli/
commands/friction.ts into a subdirectory. The new co-located tests at
src/presentation/cli/commands/friction/*.test.ts provide equivalent coverage.

File deleted: tests/presentation/cli/commands/friction.test.ts
```

If migrated:
```
test(friction): migrate orphaned test file after Phase 30 subdirectory split

Update imports to use the new friction/ subdirectory structure landed in
Phase 30. Re-scope test cases to match the new module boundaries.

File: tests/presentation/cli/commands/friction.test.ts
```

## Risks / things to verify before merging

- If deleting: confirm by running coverage report on `src/presentation/cli/commands/friction/` before and after to make sure no lines drop.
- If migrating: some test cases may test behavior that was split across multiple new modules — restructure into one test file per module, or keep as integration-style for the full friction subsystem.

## Related

- Pre-existed the test-isolation cleanup arc. Surfaced during the arc's closing verification (2026-05-11). Not caused by this arc — separate from the setTestPaths and setTestCheckpointPath collateral.
