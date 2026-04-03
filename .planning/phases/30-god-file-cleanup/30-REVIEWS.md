---
phase: 30
reviewers: [gemini, codex]
reviewed_at: 2026-04-03
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

## Codex Review (GPT-5.4)

### Plan 30-01 Assessment

**Summary:** Mostly sound refactor with clear module boundaries aligned to phase decisions. Biggest gaps: proving behavioral equivalence beyond compilation, protecting external import compatibility, and leaving size headroom for modules near the 200-line cap.

**Strengths:**
- Module breakdown maps directly to approved concerns in D-01
- Functions explicitly stay in presentation layer (D-07)
- Barrel file update is the right compatibility move
- Deleting original only after split keeps endpoint state clean

**Concerns:**
- **HIGH:** Acceptance criteria do not prove success criterion 4 ("identical output and behavior"). `wc -l`, export checks, and compilation are structural, not behavioral.
- **HIGH:** Deleting sync.ts can break direct imports elsewhere if commands/index.ts is not the only consumer. No repo-wide import audit included.
- **MEDIUM:** helpers.ts (~200 lines) too close to hard limit -- import statements or comments can push it over.
- **MEDIUM:** No specification for how shared test setup/fixtures will be preserved during split.
- **MEDIUM:** Import path correctness only partially addressed -- .js specifiers for intra-folder imports not explicitly required.

**Risk Assessment:** MEDIUM

### Plan 30-02 Assessment

**Summary:** Directionally correct but more fragile than sync plan. Dispatch layer coupling and type-only import from ./index.js create maintainability hazard. Inherits same behavioral-verification gap.

**Concerns:**
- **HIGH:** friction/index.ts (~200 lines) at the limit with no margin.
- **HIGH:** Handler modules importing shared type from ./index.js ties leaf modules back to orchestration module -- can become runtime cycle if type-only import accidentally becomes value import.
- **HIGH:** No explicit verification that friction command output and side effects are identical.
- **MEDIUM:** If Plan 01 leaves subtle regressions, Plan 02's final verification can mask which wave introduced them.
- **MEDIUM:** Deleting friction.ts has same import-compatibility risk -- no audit of direct imports.

**Risk Assessment:** MEDIUM-HIGH

### Cross-Plan Assessment

**Overall Risk:** MEDIUM -- Refactor shape is good, but plans need tighter compatibility checks to satisfy "pure split only" and "identical behavior."

---

## Consensus Summary

### Agreed Strengths
- Module breakdown aligns with user decisions (D-01, D-02) and avoids architectural drift
- Dependency ordering (Plan 02 depends on 01) correctly prevents barrel file conflicts
- Scope is appropriately narrow -- no architectural overreach or scope creep
- Pure split approach minimizes regression risk
- Co-located tests improve maintainability

### Agreed Concerns
- **MEDIUM-HIGH:** Both `helpers.ts` and `friction/index.ts` are at or near the 200-line limit with no safety margin. Both reviewers flag this independently.
- **MEDIUM:** Test splitting could change shared setup/fixture scope or teardown order. Neither plan specifies how shared test utilities will be handled.
- **MEDIUM:** Behavioral equivalence not sufficiently proven by structural checks alone. Acceptance criteria focus on file shape (wc -l, grep for exports, tsc) but don't include runtime verification of command output.

### Divergent Views
- **Risk level:** Gemini rates overall LOW (trusts test suite as safety net), Codex rates MEDIUM-HIGH for friction plan (concerned about coupling and verification gaps). The truth is likely in between -- tests DO provide strong coverage, but explicit behavioral checks would increase confidence.
- **Circular dependencies:** Gemini suggests introducing types.ts files to isolate shared types. Codex flags the ./index.js type import as a maintainability hazard. Both point to the same underlying concern but with different severity assessments.
- **Import audit:** Codex specifically calls for repo-wide import audit before deleting originals. Gemini does not raise this concern. Codex's point is valid -- if any file imports directly from sync.ts or friction.ts (bypassing the barrel), deletion will break it silently.

---

*Reviewed: 2026-04-03 by Gemini CLI and Codex CLI (GPT-5.4)*
