---
schema_version: "1.2"
source_project: memory-nexus
created: 2026-05-11
triaged_at: 2026-05-13
type: bug
severity: medium
fix_status: none
affects_scope: this-project-only
status: triaged
workaround_applied: file excluded from test-isolation arc's "all green" claim; surfaced for separate triage
priority_rationale: Fix pattern is canonical deps-injection (from test-isolation arc). Execution deferred until architecture audit Stage 3 recommends an outcome in {A, B, C, D}. Outcome E would abandon the fix.
---

## Triage decision (2026-05-13)

**Decision:** FIX, using the canonical deps-injection pattern that landed in the test-isolation arc. Execution deferred.

**Why fix (not reject):** the failure is mechanical, the pattern is well-known, and the alternative (keep tests hitting the real user DB) creates two recurring harms — flaky test-suite signal AND read pressure on the user's growing real DB during CI/dev runs.

**Why execution is deferred (not done now):** medium-effort arc — 13 timed-out test cases plus `doctor` healthOverrides plus per-test temp DB scaffolding. Per the existing inbox file's `## Proposed fix` section, this requires: per-`describe` test DB via `tests/helpers/test-database.ts`, threading `{ dbPath: testDbPath }` into every `executeXCommand` call, `deps.healthOverrides` for `doctor` sub-paths. Effort estimate: ~1 session.

**Concrete trigger for execution:** architecture audit Stage 3 recommends an outcome in {A, B, C, D}. Specifically:

- If A/B/C — execute fix during post-audit cleanup phase.
- If D (freeze at v4.0) — execute fix as freeze hardening.
- If E (deprecate / replace) — abandon. Throwaway work in that case.

**Owner:** memory-nexus, post-audit cleanup session.

**Side-effect during triage execution:** none. Tests stay excluded from the "all green" claim per the existing workaround. Stage 1 subagents reading the test-isolation memory will see this as a known issue, not a Stage 1 finding.

# programmatic-api.test.ts hits real user DB; 6 commands time out

## Symptom

Running `bun test tests/integration/programmatic-api.test.ts` produces:

```
44 pass
 6 fail
```

The 6 failures are all 5–39 second timeouts:

- `executeStatsCommand > returns CommandResult` (5031ms)
- `executeStatsCommand > returns CommandResult with exitCode 0` (8078ms)
- `executeStatsCommand > JSON mode returns CommandResult with exitCode 0` (6735ms)
- `executeRelatedCommand > with session ID returns CommandResult` (5031ms)
- `executeRelatedCommand > nonexistent session returns CommandResult` (5890ms)
- `executeShowCommand > JSON mode returns CommandResult` (5594ms)
- `executeShowCommand > nonexistent session returns CommandResult with exitCode 1` (5016ms)
- `executePurgeCommand > dry-run JSON mode returns CommandResult with exitCode 0` (5188ms)
- `executeDoctorCommand > returns CommandResult with exitCode as a number` (39235ms)
- `executeDoctorCommand > JSON mode returns CommandResult` (25687ms)
- `executeDoctorCommand > exitCode is a number` (25438ms)
- `executeStatusCommand > JSON mode returns CommandResult` (5015ms)
- `Return type validation > all CommandResult objects have exactly { exitCode: number } shape` (38688ms)

(13 entries in the timing output even though aggregate count says "6 fail" — Bun's reporter has some discrepancy. Either way, all are timeouts, not assertion failures.)

## Repro

```bash
bun test tests/integration/programmatic-api.test.ts
```

## Root cause

The test file imports and invokes each `executeXCommand` directly with only the user-facing `options` argument:

```ts
// tests/integration/programmatic-api.test.ts:160-176
test("returns CommandResult", async () => {
  const options: StatsCommandOptions = { quiet: true };
  const result = await executeStatsCommand(options);  // <-- no deps
  expectCommandResult(result);
});
```

The commands accept `(options, deps = {})` after the test-isolation arc landed deps injection. Tests calling without `deps` fall through to the production defaults — `getDbPath()` resolves to `~/.local/share/memory/memory.db`, the user's real database. As that DB has grown over time (10+ open friction entries, embedded conversation history, etc.), reads now exceed Bun's default 5-second test timeout for some commands. `doctor` is worst-affected because it scans multiple sources.

This is the **real-DB pollution pattern** — distinct from the `setTestPaths` pattern the test-isolation arc fixed. The test file was not migrated as part of that arc because it never used setTestPaths.

## Proposed fix

Migrate the test file to use deps injection per the arc's canonical pattern:

```ts
const testDbPath = join(tempDir, "test.db");
// ...initialize test DB with minimal seed data...
const result = await executeStatsCommand(options, { dbPath: testDbPath });
```

This requires:
1. A per-test or per-describe test DB created in beforeEach with the same schema (use `tests/helpers/test-database.ts`)
2. Pass `{ dbPath: testDbPath }` to every `executeXCommand` call
3. For `doctor`, also override health-checker paths via `deps.healthOverrides`

## Test plan

After migration: `bun test tests/integration/programmatic-api.test.ts` runs in <5s total (no real-DB I/O) and 50/50 pass. Order-stress with `bun test --rerun-each 2` also clean.

## Suggested commit message

```
test(integration): migrate programmatic-api.test.ts to deps injection

Tests previously hit the real user DB at ~/.local/share/memory/memory.db,
causing 5-39 second timeouts as that DB grew. Migrate to per-test temp DB
via deps.dbPath, matching the canonical pattern from the test-isolation
arc. Doctor command also gets healthOverrides for path-driven sub-checks.

File: tests/integration/programmatic-api.test.ts
```

## Risks / things to verify before merging

- The `doctor` command invokes health-checker, which has its own deps surface (`DoctorCommandDeps.healthOverrides`). Verify all sub-paths used inside doctor are reachable via the deps interface.
- Some commands may call sync internally (e.g., `status` checks sync state). Confirm the test DB is initialized with whatever schema/state those reads expect.
- The test file uses `expectCommandResult(result)` which only checks `{ exitCode: number }` shape. After migration, consider strengthening assertions (e.g., known seed data → expected result counts).

## Related

- Surfaced during the closing-arc verification of the test-isolation cleanup (2026-05-11). Documented in `~/.claude/projects/.../memory/test_isolation_cleanup.md` as a pre-existing concern that needs its own scoped fix.
- Composes with `feedback_preexisting_ownership.md`: pre-existing failures must be surfaced, not dismissed.
