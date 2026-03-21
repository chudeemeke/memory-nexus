---
phase: 28-friction-universalization
verified: 2026-03-21T22:30:00Z
status: gaps_found
score: 7/8 success criteria verified
gaps:
  - truth: "All friction tests pass (including pre-existing src/ test files updated to include tool)"
    status: failed
    reason: "Three pre-existing test files in src/ were not updated to pass the now-required tool field to FrictionEntry.create(). Plan 01 Task 1 explicitly required updating existing tests in the REFACTOR phase, but these src/ co-located tests were missed."
    artifacts:
      - path: "src/infrastructure/database/repositories/friction-repository.test.ts"
        issue: "createEntry() helper does not include tool field -- 18 tests fail with 'Tool cannot be empty'"
      - path: "src/presentation/cli/formatters/friction-dashboard.test.ts"
        issue: "createEntry() helper does not include tool field -- 14 tests fail with 'Tool cannot be empty'"
      - path: "src/presentation/cli/commands/friction.test.ts"
        issue: "2 subprocess-based integration tests timeout (may need tool field in DB seeding or are hitting timeout from auto-ingest path)"
    missing:
      - "Add tool: 'memory' to createEntry() / helper functions in all three src/ test files"
      - "Ensure subprocess-based CLI tests in src/presentation/cli/commands/friction.test.ts pass within 5000ms timeout"
---

# Phase 28: Friction Universalization Verification Report

**Phase Goal:** Upgrade the Phase 24 friction system from memory-specific to universal tool tracking. Add a `tool` column as the primary dimension, generalize categories, add source/tool filtering, implement seen/unseen tracking with `last_reviewed_at`, auto-ingest `~/.claude/friction.jsonl`, de-brand the dashboard with a "By Tool" chart, and add pattern detection for auto-escalation.

**Verified:** 2026-03-21T22:30:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from 8 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `memory friction log "desc" --tool aidev` stores friction with tool as first-class field | VERIFIED | friction.ts line 120 adds `--tool <name>` to log subcommand; service.log() threads it to FrictionEntry.create(tool) |
| 2 | `memory friction list --tool aidev` returns only aidev friction | VERIFIED | friction.ts line 146 adds `--tool <name>` to list; service.list() passes to repository.findAll({ tool }) |
| 3 | Categories not limited to 6 memory-specific values -- any string accepted | VERIFIED | FrictionCategory = string (friction-entry.ts line 23); category validation is non-empty check only (line 119-121) |
| 4 | `memory friction dashboard` shows "By Tool" chart alongside existing charts | VERIFIED | friction-dashboard.ts line 296: `<canvas id="byToolChart">`; Chart.js doughnut initialized at line 374 |
| 5 | Dashboard title is "Friction Dashboard" (not "Memory Friction Dashboard") | VERIFIED | friction-dashboard.ts lines 44 (terminal), 229, 254 (HTML): "Friction Dashboard" |
| 6 | On any `memory friction *` invocation, `~/.claude/friction.jsonl` is auto-ingested if present | VERIFIED | friction.ts line 239: `ingestFallbackFile(fallbackPath)` called before action dispatch |
| 7 | `memory friction list` shows "new" indicator on unreviewed entries | VERIFIED | friction.ts line 380: `const newMarker = isNew ? "[NEW]" : "     "` |
| 8 | All friction tests pass (including pre-existing src/ files) | FAILED | 3 src/ co-located test files have 34 failing tests due to missing tool field |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/entities/friction-entry.ts` | FrictionEntry with tool, tags, lastReviewedAt | VERIFIED | tool: string (required, line 54), tags?: string[] (line 55), lastReviewedAt?: Date (line 56) |
| `src/domain/ports/repositories.ts` | Extended IFrictionRepository, FrictionPattern, byTool in FrictionStats | VERIFIED | FrictionStats.byTool at line 555; FrictionPattern at line 563; markReviewed/findPatterns at lines 646/653 |
| `src/infrastructure/database/schema.ts` | Friction table recreation migration, new columns, no category CHECK | VERIFIED | FRICTION_LOG_UNIVERSALIZE_MIGRATION at line 319; tool TEXT NOT NULL DEFAULT 'memory' at line 296 |
| `src/infrastructure/database/repositories/friction-repository.ts` | Tool filtering, markReviewed, findPatterns, byTool stats | VERIFIED | markReviewed at line 294; findPatterns at line 300; byTool stat aggregation at line 209 |
| `src/application/services/friction-service.ts` | Tool threading, ingestFallbackFile, detectPatterns, markReviewed | VERIFIED | LogFrictionParams.tool at line 36; ingestFallbackFile at line 222; detectPatterns at line 268 |
| `src/presentation/cli/commands/friction.ts` | --tool flag, auto-ingest trigger, [NEW] indicator, markReviewed after list | VERIFIED | --tool options at lines 120/146/204; ingestFallbackFile at line 239; [NEW] at line 380 |
| `src/presentation/cli/formatters/friction-dashboard.ts` | De-branded title, By Tool chart, pattern alerts | VERIFIED | "Friction Dashboard" at lines 44/229/254; byToolChart canvas at line 296; Pattern detected at line 302 |
| `tests/infrastructure/database/repositories/friction-repository.test.ts` | New test coverage for tool filtering, markReviewed, findPatterns | VERIFIED | New test file with makeEntry(tool: 'memory' default), all 10 pass |
| `src/infrastructure/database/repositories/friction-repository.test.ts` | Pre-existing tests updated for tool field | FAILED | createEntry() helper missing tool field; 18 tests fail with "Tool cannot be empty" |
| `src/presentation/cli/formatters/friction-dashboard.test.ts` | Pre-existing tests updated for tool field | FAILED | createEntry() helper missing tool field; 14 tests fail with "Tool cannot be empty" |
| `src/presentation/cli/commands/friction.test.ts` | Pre-existing integration tests updated/pass | FAILED | 2 subprocess-based tests timeout (5000ms); may be related to missing tool in test data |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `friction-entry.ts` | `repositories.ts` | FrictionEntry type in IFrictionRepository | WIRED | FrictionEntry imported in repositories.ts; used in findAll, save, findById return types |
| `schema.ts` | `friction-entry.ts` | Schema columns match entity properties (tool TEXT NOT NULL) | WIRED | schema.ts line 296: `tool TEXT NOT NULL DEFAULT 'memory'`; entity has _tool field |
| `friction-repository.ts` | `repositories.ts` | implements IFrictionRepository with new methods | WIRED | markReviewed|findPatterns|byTool all present in grep output |
| `friction-repository.ts` | `schema.ts` | reads from migrated friction_log table | WIRED | tags, last_reviewed_at, tool references in repository INSERT/SELECT |
| `friction-service.ts` | `repositories.ts` | calls findAll with tool, findPatterns, markReviewed | WIRED | detectPatterns delegates to repository.findPatterns; markReviewed delegates to repository |
| `friction-service.ts` | `~/.claude/friction.jsonl` | reads and deletes fallback file | WIRED | friction-service.ts line 222: ingestFallbackFile reads fallbackPath with existsSync/readFileSync/unlinkSync |
| `friction.ts` (CLI) | `friction-service.ts` | calls ingestFallbackFile, log with tool, list with tool, detectPatterns, markReviewed | WIRED | All 5 patterns confirmed in grep of friction.ts |
| `friction-dashboard.ts` | `repositories.ts` | renders FrictionStats.byTool and FrictionPattern[] | WIRED | byToolChart at line 296; pattern alerts at line 302 iterate FrictionPattern[] |

### Requirements Coverage

#### Global Quality Requirements (QUAL-01 to QUAL-04)

Plan 28-01 claims QUAL-01 through QUAL-04. These are global requirements in REQUIREMENTS.md.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUAL-01 | 28-01 | 95%+ coverage at EACH metric for new code | PARTIAL | New tests/ files pass; but pre-existing src/ test files fail (34 tests broken), reducing effective coverage. New domain entity tests (29 pass), new schema tests (include migration tests). Coverage report for friction-service.ts shows 94.44% funcs, 92.11% lines (2 uncovered lines 269-277) |
| QUAL-02 | 28-01 | Domain layer zero external dependencies | VERIFIED | friction-entry.ts and repositories.ts have no external imports -- pure TypeScript types |
| QUAL-03 | 28-01 | All infrastructure adapters follow port/adapter pattern | VERIFIED | SqliteFrictionRepository implements IFrictionRepository; new methods markReviewed/findPatterns added to both port and adapter |
| QUAL-04 | 28-01 | TDD workflow for all new features | VERIFIED | SUMMARY 28-01 documents RED-GREEN-REFACTOR. New tests/ files were created with failing tests first. |

#### Phase-Specific Success Criteria (SC-01 to SC-08)

SC requirements are defined as the 8 success criteria in ROADMAP.md Phase 28 (not in REQUIREMENTS.md as global requirements). All plans reference these.

| Requirement | Source Plan | Description | Status |
|-------------|-------------|-------------|--------|
| SC-01 | 28-02, 28-04 | `--tool` flag stores tool field on log | VERIFIED |
| SC-02 | 28-02, 28-04 | `--tool` filter on list returns only matching tool | VERIFIED |
| SC-03 | 28-03 | Any string accepted as category | VERIFIED |
| SC-04 | 28-04 | Dashboard shows "By Tool" chart | VERIFIED |
| SC-05 | 28-04 | Dashboard title is "Friction Dashboard" | VERIFIED |
| SC-06 | 28-03, 28-04 | Auto-ingest friction.jsonl on any friction command | VERIFIED |
| SC-07 | 28-02, 28-04 | List shows "new" indicator for unreviewed entries | VERIFIED |
| SC-08 | 28-02, 28-03, 28-04 | Pattern detected alert when 3+ open entries share tool+category | VERIFIED |

#### Orphaned Requirements Check

REQUIREMENTS.md does not reference SC-01 through SC-08 (these are phase-local success criteria). No orphaned global requirements found for Phase 28 beyond QUAL-01 through QUAL-04.

### Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `src/infrastructure/database/repositories/friction-repository.test.ts` | createEntry() helper missing `tool` field -- 18 tests fail | Blocker | 18 tests fail outright; breaks CI |
| `src/presentation/cli/formatters/friction-dashboard.test.ts` | createEntry() helper missing `tool` field -- 14 tests fail | Blocker | 14 tests fail outright; breaks CI |
| `src/presentation/cli/commands/friction.test.ts` | 2 subprocess tests timeout at 5000ms | Warning | Integration tests unreliable; may need timeout increase or tool field fix in test data |
| `src/application/services/friction-service.ts` | Lines 269-277 uncovered (92.11% line coverage) | Warning | Just below 95% line threshold for QUAL-01; uncovered lines are in the `detectPatterns` and `markReviewed` public methods |

### Human Verification Required

#### 1. Auto-ingest in Real Environment

**Test:** Place a JSON line `{"tool":"aidev","severity":"high","description":"test friction","date":"2026-03-21"}` in `~/.claude/friction.jsonl`, then run `memory friction list`.
**Expected:** Output shows "Ingested 1 friction entries from fallback file", entry appears in list, `~/.claude/friction.jsonl` is deleted.
**Why human:** File system interaction with actual `~/.claude/` path not testable programmatically from verification context.

#### 2. Dashboard HTML in Browser

**Test:** Run `memory friction dashboard --html` (or equivalent) and open resulting HTML file in a browser.
**Expected:** Page title "Friction Dashboard", four Chart.js charts render (severity, category, status, By Tool doughnut), pattern alert section visible if patterns exist.
**Why human:** Chart.js canvas rendering requires browser environment.

### Gaps Summary

The phase goal is substantially achieved. All 8 success criteria are implemented in the production code -- the domain entity, schema migration, repository, service, CLI commands, and dashboard formatter all correctly implement universal friction tracking.

The single gap is a test hygiene failure: three co-located test files in the `src/` directory (kept from Phase 24) were not updated to include the now-required `tool` field in their `FrictionEntry.create()` calls. This causes 34 test failures (18 + 14 + 2 timeout). Plan 01 Task 1 REFACTOR phase explicitly required updating existing friction-entry tests, and Plan 02 Task 1 required updating existing repository tests. The src/ co-located test files were overlooked in favor of creating new tests/ directory equivalents.

The fix is mechanical: add `tool: "memory"` to the createEntry()/helper functions in all three src/ test files. This does not require any production code changes.

---

_Verified: 2026-03-21T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
