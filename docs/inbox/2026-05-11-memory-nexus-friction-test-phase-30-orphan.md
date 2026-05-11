---
schema_version: "1.2"
source_project: memory-nexus
created: 2026-05-11
type: bug
severity: medium
fix_status: none
affects_scope: this-project-only
status: open
---

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
