---
phase: 32
plans_checked:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
verdict: NEEDS_REVISION
checker: gsd-plan-checker
checked_at: 2026-05-14
---

# Phase 32 Plan Verification

## Goal-Backward Analysis

Walking each ROADMAP success criterion to the task that delivers it:

**Success Criterion 1 — memory --help groups commands under labeled categories (Query / Data / System / Feedback):**
- Delivered by Plan 32-01, Task 2 (Implement envelope.ts + register help groups (GREEN)) action step C, which replaces flat program.addCommand(...) with four .commandsGroup() calls: Query Commands, Data Commands, System Commands, Feedback Commands.
- Verified by Plan 32-01, Task 1 (help-groups.test.ts) which asserts the 4 group headings literal-match, command-to-group placement, and snapshot.
- COVERED.

**Success Criterion 2 — All 6 query commands accept --json and produce valid JSON to stdout:**
- All 6 commands already accept --json today; Plan 32-02 normalizes the JSON shape to QueryResultEnvelope<T>. Tasks 2 and 3 of Plan 32-02 refactor search/context/show then list/related/stats.
- Verified by Plan 32-02 Task 1 — six new .json.test.ts files asserting envelope shape, error envelope, stdout-is-one-JSON-document, advisory-to-stderr, empty-result-as-data-empty.
- COVERED.

**Success Criterion 3 — All 6 query commands support --format brief and --format ai where applicable:**
- Delivered by Plan 32-03, Task 3 which wires .choices([brief, ai]) (and [brief, ai, detailed] on context/related) and routes the action handler to formatBrief or formatForAi.
- Brief formatter paths added by Plan 32-03 Task 2 (4 formatter files: output, list, show, stats; context/related already have brief).
- Verified by Plan 32-03 Task 1 — extended .test.ts blocks asserting choices include brief/ai, brief shape conformance, no-flag default unchanged, ai-mode ANSI-stripped, --json --format ai precedence preserved, stats brief = top-line counters.
- COVERED.

**Union of 3 plans satisfies all 3 success criteria.** The graph closes goal-backward. Now checking the dimensions for executability.

## Findings

### Plan 01 (32-01-PLAN.md)

- **PASS — Dimension 1 (Requirement Coverage):** CLI-01 mapped explicitly via requirements: [CLI-01]. Envelope contract is CLI-02 *foundation* and openly declared as such (downstream consumed by Plan 02).
- **PASS — Dimension 2 (Task Completeness):** Both task elements carry files/behavior/action/verify (with automated bash)/done. Done criteria measurable (coverage 95%, snapshot file committed, full suite passes).
- **PASS — Dimension 3 (Dependency Correctness):** depends_on: [], wave: 1. No cycles. Plans 02/03 declare depends_on: [32-01] and [32-01, 32-02] — clean 1->2->3 wave graph.
- **PASS — Dimension 4 (Key Links Planned):** key_links covers (a) index.ts -> .commandsGroup(), (b) index.ts -> factory functions, (c) envelope.ts -> Phase 32.5 unified primitive. Action step C explicitly wires .commandsGroup(); step A implements envelope shape with kind/scope carry-through.
- **PASS — Dimension 5 (Scope Sanity):** 2 tasks, 5 files modified. Well within budget.
- **PASS — Dimension 6 (Verification Derivation):** must_haves.truths are user-observable. Not implementation-focused.
- **PASS — Dimension 7 (Context Compliance):** No CONTEXT.md provided per prompt; N/A. Audit A-prime decisions encoded: §21 Phase 32.5 acceptance criteria referenced; envelope kind+scope reserved per audit §21 line 779.
- **PASS — Dimension 7c (Architectural Tier):** Plan touches ONLY src/presentation/cli/* (formatters + index + tests). No domain/application changes. Tier-pure presentation per RESEARCH §Architectural Responsibility Map.
- **PASS — Dimension 8 (Nyquist):** Both tasks have automated bash commands. Wave 0 Task 1 builds the test files that Wave 1 Task 2 satisfies. VALIDATION.md exists and lists envelope.test.ts + help-groups.test.ts as Wave 0 deliverables — matches plan exactly.
- **PASS — Dimension 9 (Cross-Plan Data Contracts):** Envelope shape is the cross-plan contract; defined here, consumed by Plan 02. Interfaces block specifies the exact types Plan 02 imports. No transformation conflict.
- **PASS — Dimension 10 (CLAUDE.md Compliance):** TDD enforced (Task 1 RED before Task 2 GREEN per rules/tdd-workflow.md). 95% coverage per metric on envelope.ts asserted in done. bun (not npm). No emojis/AI attribution per rules/git-commits.md. Hexagonal preserved (presentation-only).
- **PASS — threat_model block present** with STRIDE register (T-32-01, T-32-02, T-32-03) and ASVS V5 reference.

- **WARN — Help-snapshot stability concern:** Task 1 specifies toMatchSnapshot(). The snapshot capture includes the program.version(pkg.version) line — when package.json version bumps occur, the snapshot churns. **Severity: warning.** Not a blocker.

- **WARN — Test file placement inconsistency vs Plan 02/03:** Plan 01 places help-groups.test.ts and envelope.test.ts co-located in src/presentation/cli/ (sibling to source). Plan 02 places .json.test.ts under tests/presentation/cli/commands/. Plan 03 extends existing src/presentation/cli/commands/*.test.ts. See Cross-Plan Issues for the blocker.

### Plan 02 (32-02-PLAN.md)

- **PASS — Dimension 1 (Requirement Coverage):** CLI-02 mapped via requirements: [CLI-02]. All 6 query commands covered (search/context/show in Task 2; list/related/stats in Task 3).
- **PASS — Dimension 2 (Task Completeness):** All 3 tasks have files/behavior/action/verify/done. Automated bash commands present.
- **PASS — Dimension 3 (Dependency Correctness):** depends_on: [32-01], wave: 2. Builds on envelope.ts from Plan 01. No cycles.
- **PASS — Dimension 4 (Key Links Planned):** key_links covers (a) commands/search.ts -> formatters/envelope.ts via import { buildEnvelope }, (b) command handler -> stdout via JSON.stringify(envelope).
- **WARN — Dimension 5 (Scope Sanity):** 3 tasks, 12 files modified (6 command files + 6 new test files). 10+ files is warning-zone. However, the work is repetitive (same refactor applied 3 commands × 2 batches) and the split keeps per-task diff reviewable. **Acceptable but at upper boundary.**
- **PASS — Dimension 6 (Verification Derivation):** Truths are user-observable.
- **PASS — Dimension 7c (Architectural Tier):** Touches only presentation files. Tier-pure.
- **PASS — Dimension 8 (Nyquist):** All 3 tasks have automated. Wave 0 Task 1 creates the 6 .json.test.ts files; Waves 1 (Tasks 2 and 3) satisfy them. Matches VALIDATION.md.
- **PASS — Dimension 9 (Cross-Plan Data Contracts):** Consumes envelope.ts contract from Plan 01. Interfaces block restates the exact types — no drift. Plan 03 does NOT touch the JSON branch (explicitly noted in 32-03 action step 7) — clean handoff.
- **PASS — Dimension 10 (CLAUDE.md Compliance):** TDD, bun, coverage. Hexagonal preserved.
- **PASS — threat_model present** with T-32-04 (crafted query in JSON), T-32-05 (error.context leakage — accepted with rationale), T-32-06 (mixed stdout breaking jq), T-32-07 (test DB pollution).

- **BLOCKER — Test file location convention conflict:** Plan 02 creates tests/presentation/cli/commands/*.json.test.ts — a directory that does NOT currently exist in the codebase. Existing convention (verified: all 24+ *.test.ts files under src/presentation/cli/) is to co-locate tests next to source. Introducing a new tests/ tree without justification is a structural drift. **Required fix:** place .json.test.ts files at src/presentation/cli/commands/search.json.test.ts etc.

- **WARN — Task 2 covers 3 files in ONE commit:** Per project mistakes-log.md rule commits should be atomic. However, the refactor IS the same logical change applied uniformly (one feature: envelope-wrapping). **Acceptable** but note for executor: split per-file if the refactor diverges materially.

- **WARN — Task 1 force error path is brittle:** Specifies dbPath: /non/existent/path/missing.db — relies on executeSearchCommand actually attempting DB init at the bad path before catching. **Resolvable by adjusting trigger condition during execution.**

- **WARN — Plan 32-01-SUMMARY.md referenced but doesn't exist yet:** Plan 02 context block lists @.planning/phases/32-cli-surface/32-01-SUMMARY.md — forward-reference resolved at execute time. Standard GSD pattern.

### Plan 03 (32-03-PLAN.md)

- **PASS — Dimension 1 (Requirement Coverage):** CLI-03 mapped. All 6 commands covered.
- **PASS — Dimension 2 (Task Completeness):** All 3 tasks complete with automated verify.
- **PASS — Dimension 3 (Dependency Correctness):** depends_on: [32-01, 32-02], wave: 3. Sequentialized to avoid concurrent writes with Plan 02. No cycles.
- **PASS — Dimension 4 (Key Links Planned):** key_links covers (a) command --format option -> Commander .choices([brief, ai]), (b) formatter brief path -> single-line output.
- **WARN — Dimension 5 (Scope Sanity):** 17 files modified (6 commands + 6 tests + 4 formatters + 1 CHANGELOG). At **warning threshold** (10+ warning, 15+ blocker per checker spec). However, work is shallow-touch per file. The split into 3 tasks keeps per-task scope tractable. **Recommend executor monitor context budget.**
- **PASS — Dimension 6 (Verification Derivation):** Truths user-observable.
- **PASS — Dimension 7 (Context Compliance):** All 7 research Open Questions decisions encoded (browse->System Q1, --json silent override Q2, detailed alias Q3, no .default() Q4, stats brief Option A Q5, schema_version 1 Q6, friction OUT Q7).
- **PASS — Dimension 7c (Architectural Tier):** Touches only src/presentation/cli/* and CHANGELOG. Tier-pure.
- **PASS — Dimension 8 (Nyquist):** All 3 tasks have automated. Task 1 (RED) precedes Tasks 2-3 (GREEN).
- **WARN — Dimension 9 (Cross-Plan Data Contracts):** Plan 02 and Plan 03 BOTH modify the same 6 commands/*.ts files. Wave dependency (2 -> 3) sequencing avoids concurrent write. Plan 03 Task 3 step 5 grep-migrates options.format === default literals — must happen AFTER Plan 02 lands envelope. Plan 02 doesn't touch format choices (only JSON branch), so the default literal persists for Plan 03 to migrate. **Acceptable — verify-during-execution.**
- **PASS — Dimension 10 (CLAUDE.md Compliance):** TDD, bun, coverage, no emoji/AI attribution.
- **PASS — threat_model present** with T-32-08 through T-32-11.

- **WARN — formatBrief factory wiring is under-specified:** Task 2 says add brief to the type and a corresponding branch. The plan does NOT specify whether OutputMode is exported and consumed elsewhere — extending the union may have downstream type-check cascade. **Recommend: executor checks all callers of OutputMode before extending the union.**

- **WARN — Stats brief 3-line assertion may be too tight:** Task 1 assertion 11 says line count <= 3. If formatBrief adds a trailing newline or a generation timestamp line, the assertion fails. **Recommend: <= 5 lines as a softer bound.** Cosmetic.

- **WARN — CHANGELOG.md modified atomically with code in Task 3:** Could be its own commit OR bundled. Plan 03 reads as bundled with the wiring commit — acceptable.

## Cross-Plan Issues

### BLOCKER 1 — Test file placement inconsistency across plans

| Plan | Test File Location |
|------|---------------------|
| 32-01 | src/presentation/cli/help-groups.test.ts + src/presentation/cli/formatters/envelope.test.ts (CO-LOCATED — matches codebase convention) |
| 32-02 | tests/presentation/cli/commands/*.json.test.ts (NEW tests/ ROOT — does not exist in codebase) |
| 32-03 | Extends existing src/presentation/cli/commands/*.test.ts (CO-LOCATED) |

Plan 02 is the outlier. The codebase has 24+ existing *.test.ts files all co-located under src/. Introducing a parallel tests/ tree without justification:
1. Risks bunfig.toml test discovery skipping the new files (depends on glob configuration — needs verification but co-location is the safe path).
2. Splits test discovery into two locations, fragmenting the test surface.
3. Contradicts the convention Plan 01 and Plan 03 follow.

**Required fix:** Plan 02 relocates the 6 .json.test.ts files to src/presentation/cli/commands/search.json.test.ts (and parallel paths for context/show/list/related/stats). Update files_modified frontmatter, action descriptions, verify automated commands, and VALIDATION.md test file paths accordingly. Any shared test helper should be relocated to src/presentation/cli/_test-helpers/ or inlined per file.

### WARNING 2 — Plan 02 + Plan 03 both touch all 6 command files

Both plans modify all 6 of src/presentation/cli/commands/{search,context,show,list,related,stats}.ts. Sequencing via wave dependency (2 -> 3) avoids concurrent edits. A failure mid-Plan-02 would leave the same 6 files in an intermediate state when Plan 03 starts. The wave model handles this correctly. **No fix required** — flagging the coupling so the executor knows interruption recovery is non-trivial.

### WARNING 3 — Coverage gate vs new files

envelope.ts (new file) and the per-command refactors must each pass 95% per-metric. Branches coverage on buildEnvelope is the riskiest metric — conditional spreads create branches. Plan 01 Task 2 action acknowledges this. Not a blocker.

### PASS — Phase 32.5 convergence is correctly preserved

All three plans carry the audit §21 acceptance criterion. Plan 01 establishes kind (set from command name) and reserves scope (optional, undefined in Phase 32). Plan 02 every buildEnvelope({...}) call sets kind explicitly per the per-command kind table. Plan 03 --format brief|ai choice list is **conservative (2 values)**, leaving room for Phase 32.5 --shape / --scope / --kind / --mode flags without conflict.

## Verdict

**NEEDS_REVISION** — one BLOCKER and several WARNINGS. Goal-backward analysis confirms the plans, if executed *as written*, would deliver all 3 success criteria. However, the test file placement BLOCKER in Plan 02 risks test-discovery failure and contradicts established codebase convention. The fix is mechanical (a path change) but must happen before execution.

### Required changes (BLOCKERS — must fix)

1. **Plan 02:** Relocate all 6 .json.test.ts files from tests/presentation/cli/commands/ to src/presentation/cli/commands/. Specifically:
   - Update files_modified frontmatter list (6 entries).
   - Update Task 1 files attribute and action description.
   - Update each verify automated command path glob (e.g., bun test src/presentation/cli/commands/search.json.test.ts instead of tests/...).
   - Update VALIDATION.md test file paths to match (lines referencing tests/presentation/cli/commands/*.json.test.ts).
   - Shared test helper (tests/presentation/cli/_helpers/capture-json.ts) should be relocated to src/presentation/cli/_test-helpers/capture-json.ts or inlined per file.

### Recommended changes (WARNINGS — fix if revising)

2. **Plan 01:** Document help-snapshot policy: either exclude the program.version() line from the snapshot OR add a comment noting that snapshots churn on version bump and that is expected.
3. **Plan 03:** Soften stats brief assertion from <= 3 lines to <= 5 lines to give the formatter implementation breathing room.
4. **Plan 03:** Task 2 action add explicit step: Check downstream consumers of OutputMode type before extending the union (grep OutputMode to find all import sites).

### PASS confirmations

- ROADMAP success criteria 1-3 all have task coverage.
- Audit §21 Phase 32.5 convergence preserved (envelope kind/scope reserved; brief|ai floor leaves room for --shape).
- TDD compliance: Wave 0 = tests first, Wave 1+ = implementation in every plan.
- Hexagonal preserved: presentation-only changes across all 3 plans.
- Threat models present in all 3 plans with STRIDE registers and ASVS mapping.
- Coverage gate 95% per metric asserted in every done block.
- All 7 Open Questions from research have explicit decisions encoded.
- Friction excluded from scope per audit §14.A (correctly).
- --format detailed aliased (not removed) — backward compat preserved.
- No domain or application changes.
- No new dependencies (Commander v14 already in package.json at ^14.0.2, supports .commandsGroup()).
- bun-only commands; no npm references.
- No emojis, no AI attribution in commit message templates.

## Phase 32.5 Convergence Check

**Verified across all 3 plans:**

The envelope shape established in Plan 01 (schema_version, command, kind, optional scope, optional meta, data) is **forward-compatible with Phase 32.5 unified query primitive** as specified in audit §21:

> Read surfaces (search / context / related / list / show) are accessible via ONE query primitive with shape flags (--scope, --kind, --mode). Original commands either deprecate or become thin views.

Concretely:
- **kind:** Phase 32 sets from command name (search -> message, context -> context, etc.). Phase 32.5 --kind <message|session|...> flag will set the same field from CLI input. No schema change needed.
- **scope:** Reserved as optional/undefined in Phase 32. Phase 32.5 --scope <project|global> flag populates it. Additive field; existing consumers unaffected.
- **meta:** Per-command in Phase 32; Phase 32.5 may normalize meta keys across the unified primitive. Field is Record<string, unknown> — extensible without breaking.
- **--format brief|ai:** Conservative 2-value choice list leaves room for Phase 32.5 to introduce --shape (per audit §21 shape flags) without overloading --format. The brief|ai floor is what every query surface today supports; 32.5 may extend.

**The deprecated --format detailed alias** (Plan 03, context + related only) does NOT propagate to Phase 32.5. CHANGELOG note flags removal at next minor; Phase 32.5 may finalize the removal.

**Risk to Phase 32.5 if Phase 32 ships as-planned:** LOW. The envelope schema is schema_version: 1 and Phase 32.5 explicitly should NOT require a bump (additive changes only). The plan documents this in 32-01 action step A: Schema version policy: bump ENVELOPE_SCHEMA_VERSION ONLY when the field set changes in a backward-incompatible way.

**Convergence: PASS.**

## CHECK COMPLETE — NEEDS_REVISION
