---
phase: 32
plans_checked:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
verdict: PASS
revision: 3
checker: gsd-plan-checker
checked_at: 2026-05-14
previous_verdict: PASS revision 2 (sonnet); cross-AI review identified 5 HIGH + 4 MEDIUM + 4 LOW
review_findings_addressed:
  high: 5/5
  medium: 4/4
  low: 4/5 (1 deferred with rationale)
---

# Phase 32 Plan Verification - Pass 3 (post cross-AI review)

## Posture

Adversarial third-pass check. Starting hypothesis: planner claimed in REVIEWS.md frontmatter that every cross-AI finding was fixed, but the actual plan files may have stale references, generic consider-X language, or aliasing that masks under-coverage. Goal: verify each Codex/Gemini finding has a concrete, load-bearing artifact in the actual plan body, not just a frontmatter mention.

Verification ran:
- Direct read of all 3 PLAN files (32-01, 32-02, 32-03), VALIDATION.md, REVIEWS.md
- Cross-check of Codex file:line citations against current src/presentation/cli/commands/ files (search.ts:190/195, list.ts:108/149, stats.ts:97, context.ts:118 -- all confirmed live in code)
- Confirmed search.ts:420 bare-array JSON.stringify leak is real and Plan 02 Task 4 explicitly replaces it
- Confirmed context.ts:118 useSmartContext does fork on format equals "ai" -- Plan 02 Task 4 rewrites this with documented precedence rule
- Confirmed list.ts:149 getDefaultDbPath direct call (no deps seam) -- Plan 02 Task 1 wires deps.dbPath fallback
- Confirmed stats.ts:97 same pattern -- Plan 02 Task 1 wires the seam
- Read REQUIREMENTS.md CLI-01/02/03 and confirmed coverage chain

## Goal-Backward Analysis

For each Phase 32 requirement, trace the delivery chain end-to-end:

**CLI-01 (help groups):** Plan 01 owns. Task 2 wires commandsGroup("Query Commands:") across 4 categories; Task 1 RED test asserts placement + snapshot. Snapshot strips version-X.Y.Z line (W1 policy). Verified deliverable chain: requirement -> 32-01 requirements:[CLI-01] -> must_haves.truths -> Task 2 action D -> acceptance_criteria line 510. **DELIVERED.**

**CLI-02 (--json on 6 commands):** Plan 02 owns (after Plan 01 establishes envelope). Now 5 tasks (was 3 in rev 2). Every exit path on every command (success + empty + validation + not-found + catch) routes through emitJsonEnvelope/emitJsonErrorEnvelope. search --files --json covered with kind:"file". --json --format ai routing equivalence asserted via deep-equal in every .json.test.ts. Verified chain through must_haves, Task 1-5 actions, threat model T-32-04/06/08/09, acceptance_criteria. **DELIVERED with HIGH-2/HIGH-4/HIGH-5 wiring intact.**

**CLI-03 (--format brief OR ai):** Plan 03 owns. All 6 commands get the normalized choice list. Stats brief at most 5 lines (W5). Deprecation aliases for "default" (search/list/show/stats, MEDIUM-2) AND "detailed" (context/related) preserved with stderr warnings suppressed in JSON mode. CHANGELOG.md verify-or-create (LOW-1). **DELIVERED.**

## Per-Finding Verification (Cross-AI Audit)

### HIGH findings -- all 5 confirmed resolved in plan body

**HIGH-1 (runtime tuples for envelope.ts):**
- 32-01-PLAN.md lines 134-152: QUERY_COMMAND_NAMES = [...] as const and QUERY_RESULT_KINDS = [...] as const with typeof X[number] type derivation. PRESENT.
- "file" included in QUERY_RESULT_KINDS (line 150) -- covers HIGH-4 prerequisite. PRESENT.
- envelope.test.ts assertions (lines 241-244): QUERY_COMMAND_NAMES.includes("search") plus 5 more includes; same for QUERY_RESULT_KINDS.includes("file"). PRESENT.
- acceptance_criteria line 512: Runtime tuples are exported as values, NOT type-only (verified by Task 1 includes-assertions). PRESENT.
- **VERDICT:** RESOLVED. Code WILL compile because the tuples are runtime values, not type-only exports.

**HIGH-2 (all exit paths through envelope helpers):**
- 32-01-PLAN.md lines 197-214: emitJsonEnvelope and emitJsonErrorEnvelope declared in the envelope module interfaces. PRESENT.
- 32-02-PLAN.md Task 4 lines 588-602: explicit Pre-step (HIGH-2 audit) enumerating exit points in search.ts (~10 returns), context.ts (~5), show.ts (~3). PRESENT.
- Task 4 action steps 3-5 (lines 632-685) show concrete before/after for validation, success, and catch paths routing through helpers. PRESENT.
- Task 5 lines 803-822 applies same pattern to list/related/stats with per-command return-point notes. PRESENT.
- .json.test.ts behaviors A-E (lines 297-334) assert envelope on success/empty/validation/not-found/catch -- 5 of the 5 exit-path categories. PRESENT.
- VALIDATION.md edge cases lines 143-144: validation error envelope on stdout in --json mode AND not-found error envelope on stdout. PRESENT.
- **VERDICT:** RESOLVED. No bare console.log(JSON.stringify(...)) patterns survive the refactor; every exit path is named in plan body.

**HIGH-3 (test isolation seams for list/stats):**
- 32-02-PLAN.md Task 1 (lines 191-280) titled Normalize test seams -- add deps?:{ dbPath? } to list + stats. Order is correct: Wave 0, before the .json.test.ts tasks that depend on the seam. PRESENT.
- Action explicitly forbids mock.module() on first-party modules (line 237). PRESENT.
- New list.deps.test.ts and stats.deps.test.ts files in Wave 0 (frontmatter line 20-21; VALIDATION.md lines 80-81, 106-107). PRESENT.
- Confirmed against codebase: list.ts:149 and stats.ts:97 currently do call getDefaultDbPath() directly. The plan fixes this exact pattern.
- **VERDICT:** RESOLVED. Wave-ordering correct; first-party mock.module ban explicit.

**HIGH-4 (search --files --json envelope coverage):**
- 32-01-PLAN.md line 150: "file" in QUERY_RESULT_KINDS tuple. PRESENT.
- 32-02-PLAN.md Task 4 step 7 (lines 689-725): explicit before/after replacing the search.ts:420 bare-array emission with emitJsonEnvelope command=search kind=file data=results.map(toFileResultDto). PRESENT.
- Also wraps the qmd-unavailable error (search.ts:402) in emitJsonErrorEnvelope (line 725). PRESENT.
- search.json.test.ts behavior I (lines 352-358) has a dedicated describe(--files --json) block testing qmd-available AND qmd-unavailable paths. PRESENT.
- VALIDATION.md edge case line 145: search --files --json envelope with kind=file, NOT bare array. PRESENT.
- Confirmed against codebase: search.ts:420 IS the bare console.log(JSON.stringify(results, null, 2)) leak. Plan exactly addresses it.
- **VERDICT:** RESOLVED.

**HIGH-5 (--json --format ai routing precedence):**
- 32-02-PLAN.md Task 4 step 8 (lines 727-762): rewrites useSmartContext() to bypass --format ai routing when --json is set, with code-comment block documenting the precedence rule. PRESENT.
- The new function body (lines 738-744) returns based on options.budget OR options.crossProject only when options.json is set -- --format ai is dropped from routing decision in JSON mode. PRESENT.
- Task 4 step 9 (lines 764-767) audits search/show for routing-vs-output forks and confirms text-only post-processing. PRESENT.
- .json.test.ts behavior J (lines 359-364): every test file has describe(--json --format ai routing) block asserting parsedA (no --format ai) deep-equals parsedB (with --format ai) -- NOT just JSON.parse success. PRESENT.
- context.json.test.ts call-out (line 418): the SmartContextService-vs-legacy routing fork is bypassed when --json is set. PRESENT.
- Confirmed against codebase: context.ts:118-119 currently DOES include options.format equals "ai" in the fork. Plan exactly fixes this.
- **VERDICT:** RESOLVED.

### MEDIUM findings -- all 4 confirmed resolved

**MEDIUM-1 (DTO extraction):**
- 32-02-PLAN.md Task 3 (lines 443-572) -- entire task for dto-helpers.ts module. PRESENT.
- 7 DTO functions named at lines 60 (must_haves.artifacts) and 467-540 (action). PRESENT.
- JsonOutputFormatter.formatResults delegates to toSearchResultDto (line 548). PRESENT.
- CONTEXT_BUDGET truncation loop preservation explicitly required at line 549. PRESENT.
- Highlights-BEFORE-strip invariant tested in dto-helpers.test.ts (lines 425, 291-294); also Gemini LOW addressed in same test. PRESENT.
- **VERDICT:** RESOLVED.

**MEDIUM-2 (--format default deprecation parity):**
- 32-03-PLAN.md must_haves line 36: --format default retained on search/list/show/stats as a deprecated alias (parity with detailed, per Codex MEDIUM-2). PRESENT.
- Task 1 behavior 10-11 (lines 211-213): asserts deprecation warning fires AND is suppressed in --json mode. PRESENT.
- Task 3 action lines 369-372: .choices([brief, ai, default]) retained. PRESENT.
- Action lines 378-384: stderr warning code; non-json guard for suppression. PRESENT.
- CHANGELOG entry lines 430-432: explicit Deprecated section covering both default and detailed. PRESENT.
- **VERDICT:** RESOLVED.

**MEDIUM-3 (Windows shell safety):**
- All verify blocks across 3 plans use bun test paths or bun --print snippets -- no grep pipe head chains required.
- Windows-specific gate documented in VALIDATION.md line 40 and in each plan verification section (32-01 line 462-463; 32-02 line 906-907; 32-03 line 518).
- Inbox 2026-05-11 bun-test integer overflow workaround explicit: use bun test src/presentation/cli (subdirectory).
- Acceptance criteria in each plan now includes Windows-safe subdirectory run.
- **VERDICT:** RESOLVED. Plans verify-block-by-verify-block.

**MEDIUM-4 (discriminated EnvelopeScope):**
- 32-01-PLAN.md lines 156-158: EnvelopeScope as discriminated union with global and project variants. PRESENT.
- envelope.test.ts asserts both scope variants (lines 246-248). PRESENT.
- must_haves.truths line 23: optional scope (discriminated shape). PRESENT.
- acceptance_criteria line 513: EnvelopeScope is a discriminated union, not a freeform string. PRESENT.
- Phase 32.5 convergence block notes 1-to-1 map to --scope global OR project plus optional --project name. PRESENT.
- **VERDICT:** RESOLVED. Forward-compat tightened -- Phase 32.5 inherits structured discriminator, not freeform string.

### LOW findings -- 4 of 5 addressed, 1 deferred

**LOW-1 (CHANGELOG existence -- Codex):** 32-03-PLAN.md Task 3 pre-step lines 339-359 verify-or-create CHANGELOG.md with Keep a Changelog 1.1.0 + SemVer canonical structure. Acceptance line 567 codifies it. **RESOLVED.**

**LOW-4 (schema-version JSDoc -- Gemini):** 32-01-PLAN.md Task 2 action step A (lines 324-347) -- top-of-file JSDoc explicitly documents additive-vs-breaking distinction. **RESOLVED.**

**Gemini highlights-before-strip:** Tested in dto-helpers.test.ts (32-02 line 425). **RESOLVED.**

**LOW-3 (Gemini optionsGroup):** 32-03-PLAN.md Task 3 line 443 marks as optional polish, skip if context budget tight, with explicit syntax-validation note. **CORRECTLY DEFERRED -- optional polish is acceptable disposition.**

**LOW-2 (Gemini stats brief AI-mode single-line):** Explicitly deferred in 32-03-PLAN.md open_questions line 546 with rationale: tightening to single-line for --format ai mode specifically would add complexity. POST-PHASE-32 polish. **CORRECTLY DEFERRED.**

## Cross-Plan Issues

None new. Sequenced 01 -> 02 -> 03 dependency chain still holds (verified in frontmatter depends_on). Files-modified sets are non-overlapping for new files; 6 command files in both 02 and 03 are correctly sequenced via wave assignments (wave 2 then wave 3) -- no parallel writes.

The expanded scope (10 tasks now, was 8; 38 files modified, was 30) raised a scope-sanity concern. Reviewed against thresholds:

- Plan 01: 2 tasks, 5 files. WITHIN budget.
- Plan 02: 5 tasks (up from 3), 16 files (up from 12). Each task is bounded -- Task 1 is preparatory seam-only (2 files), Task 2 is RED tests only (7 files), Task 3 is DTO extraction (2 files), Tasks 4 and 5 are 3 command files each. Per-task scope is healthy; total plan size is at the warning edge but not blocker because tasks are independently committable.
- Plan 03: 3 tasks, 17 files (same as rev 2 -- already had context_budget block with sub-split escape hatch). WITHIN budget with documented split path.

**Verdict on scope:** ACCEPTABLE. Expansion is justified by Codex findings (each new task addresses a specific HIGH). Sub-split escape hatches in Plan 03 (W4 resolution) and Plan 02 Task 4 rationale provide pressure release. The alternative -- leaving HIGH findings unaddressed to keep task count low -- produces partial CLI-02 compliance, which violates the goal-backward chain.

## Preserved-Since-PASS-2

All revision-2 PASS conditions still hold (spot-checked):

| Property | Status |
|---|---|
| Wave 0 RED before Wave 1 GREEN | INTACT (Plan 02 Task 1 + Task 2 in W0; Tasks 3-5 in W1; Plan 03 Task 1 in W0; Tasks 2-3 in W1) |
| TDD compliance | INTACT -- all 10 tasks tdd=true |
| 95% coverage per metric on touched files | INTACT -- asserted in every Task done block |
| Hexagonal: presentation-only | INTACT -- files_modified across all 3 plans = src/presentation/cli/* + CHANGELOG.md (root, not a layer) |
| Test placement co-located | INTACT -- VALIDATION.md test-placement convention preserves the BLOCKER 1 resolution from rev 2 |
| 7 Open Question decisions | INTACT -- Q1-Q7 still decided across plans |
| Threat models present | INTACT and expanded (T-32-04 through T-32-12 covering new HIGH-4, HIGH-5, MEDIUM-2 surfaces) |
| Chude email author, no AI attribution, no emojis | INTACT -- asserted in acceptance_criteria of every plan |
| Atomic commits per task | INTACT -- Plan 02 Task 4 retains the W2 rationale + split-escape-hatch from rev 2 |
| Phase 32.5 forward-compat | TIGHTENED -- discriminated EnvelopeScope is a structural improvement over rev 2 freeform string |
| Commander v14, no new deps | INTACT |

Nothing previously PASSing was broken in revision 3.

## Phase 32.5 Convergence -- re-confirmed and tightened

Envelope shape now carries:
- schema_version: "1" (literal const)
- command: QueryCommandName (derived from runtime tuple -- HIGH-1)
- kind: QueryResultKind (derived from runtime tuple, includes "file" -- HIGH-4)
- scope?: EnvelopeScope (discriminated union -- MEDIUM-4)
- meta?: Record<string, unknown>
- data: T

Phase 32.5 will set kind from a --kind flag and scope from --scope global OR project plus optional --project name. The discriminated EnvelopeScope maps 1-to-1 to that flag form. NO schema bump expected.

Risk to Phase 32.5: LOWER than rev 2 (which had freeform scope string).

## Verdict

All 5 HIGH findings resolved with concrete artifact pointers -- not just frontmatter mentions, but actual action, behavior, and verify blocks in the plan body that touch the exact file:line locations Codex flagged. All 4 MEDIUM findings same. 3 of 5 LOW findings addressed; 2 (Gemini stats AI single-line, Gemini optionsGroup) correctly deferred with rationale.

Cross-checked against codebase: every Codex citation (search.ts:190/199/420, context.ts:118, list.ts:108/149, show.ts:155, related.ts:149, stats.ts:97/104) matches live code, and the plans address each location specifically -- no generic consider-X language.

Scope expansion (8 -> 10 tasks, 30 -> 38 files) is justified by the goal-backward chain: omitting these expansions would leave HIGH findings unresolved, which produces partial CLI-02 compliance -- a goal-failure, not a goal-success at smaller scope.

VALIDATION.md updated correctly: 3 new test files added to Wave 0 (dto-helpers.test.ts, list.deps.test.ts, stats.deps.test.ts); Windows-safe gate documented; cross-platform verify discipline stated; revision_3 frontmatter entry present.

Phase 32 is ready for execution.

## CHECK COMPLETE -- PASS
