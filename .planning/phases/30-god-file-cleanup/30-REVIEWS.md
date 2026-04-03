---
phase: 30
reviewers: [gemini, codex]
reviewed_at: 2026-04-03
revised_at: 2026-04-03
plans_reviewed: [30-01-PLAN.md, 30-02-PLAN.md]
---

# Cross-AI Plan Review -- Phase 30

## Gemini Review

### Summary
The plans are well-structured, conservative, and strictly aligned with the architectural mandates of the project. By focusing on a "pure split" without altering logic or moving code across hexagonal layers, the strategy minimizes regression risk while effectively addressing technical debt. The decomposition into subdirectories with index entry points is a standard pattern that will significantly improve maintainability.

### Strengths
- Behavioral preservation via "no test assertion modification" rule is the gold standard for refactoring
- Granular decomposition reflects deep understanding of existing sync.ts responsibilities
- Sequential dependency prevents merge conflicts in shared barrel file
- Co-located tests improve developer ergonomics
- Circularity awareness for FrictionExecuteOptions type import

### Concerns
- **MEDIUM:** Implicit circular dependencies -- if sync/index.ts calls embedding-pass.ts, which calls helpers.ts functions also used by index.ts, the dependency graph can get messy
- **LOW:** Import extensions -- using `.js` extension in TypeScript source can conflict with tsconfig depending on ESM settings
- **LOW:** Test utility duplication -- splitting test files might duplicate shared test helpers
- **LOW:** Internal visibility -- previously private functions now need to be exported, increasing internal surface area

### Suggestions
- Introduce `types.ts` modules to avoid circular dependency issues
- Identify common test setup logic before splitting and create shared test helpers
- Run `madge` or similar tool to verify no circular dependencies after split
- Audit `wc -l` strictly as a CI-like gate

### Risk Assessment
**LOW** -- Exceptional test coverage acts as a high-fidelity safety net. Most likely failure is compilation error from broken import paths, easily caught by TypeScript compiler.

---

## Codex Review (GPT-5.4, revised with full source file access)

### Plan 30-01 Assessment

**Summary:** The split direction is sound and matches the phase goal, but the plan is too rigid in places where the current code shape makes that risky. The biggest problems are feasibility of the 200-line cap for `sync/index.ts`, an incorrect assumption about moved test import paths, and a hard-coded test baseline that does not match the current repo.

**Strengths:**
- Module boundaries are sensible for sync: orchestration, embedding, background mode, memory files, ambient context, and helpers
- Public API preservation is called out explicitly, including barrel updates
- The plan respects D-07/D-13: pure split, no layer movement, no assertion rewrites
- It preserves lazy-load behavior as an explicit verification target

**Concerns:**
- **HIGH:** The 200-line cap for `sync/index.ts` is likely not feasible. `createSyncCommand()` and `executeSyncCommand()` already span lines 111-309 in sync.ts (~200 lines), before adding `SyncCommandOptions`, imports, and re-exports. The plan estimates ~135 lines, which is wrong.
- **HIGH:** Task 2 says moved lazy-loader test can keep same relative `mock.module` paths, but moving from `commands/` to `commands/sync/` adds a directory level. Paths like `mock.module("../../../infrastructure/...")` need to become `"../../../../infrastructure/..."`. This statement is incorrect and will cause test failures.
- **HIGH:** The plan hard-codes `109` tests, but the current visible suites are `119` tests: 71 in sync.test.ts, 6 in sync.integration.test.ts, 4 in sync-lazy-loaders.test.ts, and 38 in friction.test.ts.
- **MEDIUM:** `memory-files.test.ts` and `helpers.test.ts` are listed as outputs but the task text does not identify existing tests to populate them. Ambiguity between "empty placeholder" and "write new tests."
- **MEDIUM:** "Identical output and behavior" is not fully proven by the listed checks. Current sync integration coverage is mostly CLI help/smoke.
- **LOW:** Verification snippets use Unix tooling (`wc`, `test`, `grep`, `tail`) on a Windows workspace.

**Suggestions:**
- Use the flexibility allowed in CONTEXT.md D-discretion: let function-to-module assignment vary for line-count compliance
- Either relax the 200-line cap for the entrypoint module, or add one more module for command registration/types
- Replace hard-coded `109` gate with "all pre-existing targeted tests pass" or compute baseline before split
- Update Task 2 to explicitly require fixing all relative imports including `mock.module(...)` paths
- Add a repo-wide search check that no internal `./sync.js` imports remain under `src/`

**Risk Assessment:** HIGH -- architecture is fine, but execution details are brittle enough to cause avoidable failures.

### Plan 30-02 Assessment

**Summary:** Closer to workable than 30-01 because friction handlers map cleanly to subcommands, but still has one major feasibility problem: `friction/index.ts` is too overloaded for the 200-line cap. Types + `createFrictionCommand()` + `executeFrictionCommand()` cover lines 34-321 (~287 lines).

**Concerns:**
- **HIGH:** friction/index.ts (~200 line estimate) won't hold. Lines 34-321 is ~287 lines of types + registration + dispatch before imports.
- **HIGH:** The combined `109`-test acceptance gate is inconsistent with current repo baseline (119 tests).
- **MEDIUM:** Plan disagrees with itself on `openInBrowser`: artifact list says exported from dashboard.ts, acceptance only requires `function openInBrowser`, Task 1 relies on it as default browser opener.
- **MEDIUM:** Split tests exercise `executeFrictionCommand()` not handler exports -- fine for behavior but doesn't validate handler artifacts.
- **LOW:** Verification commands assume Unix shell.
- **LOW:** No repo-wide search for lingering `./friction.js` imports.

**Suggestions:**
- Split `friction/index.ts` further: extract types to `types.ts` or command registration to `registration.ts`
- Make `openInBrowser` contract consistent across task text, artifacts, and acceptance criteria
- Replace fixed test-count assertions with zero-failure gating
- Add search-based acceptance check for stale `./friction.js` and `./sync.js` imports

**Risk Assessment:** MEDIUM -- intended split is cleaner than sync, but verification and contract issues justify revision.

---

## Consensus Summary

### Agreed Strengths
- Module breakdown aligns with user decisions (D-01, D-02) and avoids architectural drift
- Dependency ordering (Plan 02 depends on 01) correctly prevents barrel file conflicts
- Scope is appropriately narrow -- no architectural overreach or scope creep
- Pure split approach minimizes regression risk
- Co-located tests improve maintainability

### Agreed Concerns (Action Required)
- **HIGH:** Both `sync/index.ts` and `friction/index.ts` WILL NOT fit under 200 lines. Codex verified against actual line counts: sync lines 111-309 (~200 lines without interfaces/imports), friction lines 34-321 (~287 lines). Plans must either add a module (e.g., types.ts, registration.ts) or relax the cap for entrypoints.
- **HIGH:** Test baseline is wrong. Plans say 109 tests, actual count is 119 (71+6+4+38). Hard-coded count will cause false failures.
- **HIGH (Codex only):** mock.module paths will break when tests move from `commands/` to `commands/sync/`. Relative paths like `"../../../infrastructure/..."` need an extra `../` level.
- **MEDIUM:** Behavioral equivalence not sufficiently proven by structural checks alone. Need runtime verification beyond compilation and test pass.
- **MEDIUM:** No repo-wide import audit before deleting originals. Direct imports bypassing the barrel will break silently.

### Divergent Views
- **Risk level:** Gemini rates overall LOW (trusts test suite), Codex rates HIGH for Plan 30-01 and MEDIUM for Plan 30-02. Codex's concerns are more concrete because it read the actual source files and counted lines.
- **Types isolation:** Gemini suggests types.ts for circular dependency avoidance. Codex suggests splitting entrypoint further (registration.ts or types.ts). Both arrive at the same structural solution.

### Key Revisions Needed for Replanning
1. Compute actual test baseline before split (don't hard-code 109)
2. Add extra module to both sync/ and friction/ to keep index.ts under 200 lines
3. Fix mock.module path depth in test migration instructions
4. Add repo-wide import audit step before deleting originals
5. Make openInBrowser export consistent in Plan 30-02

---

*Reviewed: 2026-04-03 by Gemini CLI and Codex CLI (GPT-5.4)*
*Codex review revised with full source file access*
