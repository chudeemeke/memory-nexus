---
phase: 32
plans_checked:
  - 32-01-PLAN.md
  - 32-02-PLAN.md
  - 32-03-PLAN.md
verdict: PASS
revision: 2
checker: gsd-plan-checker
checked_at: 2026-05-14
previous_verdict: NEEDS_REVISION (1 BLOCKER + 5 WARNINGS)
---

# Phase 32 Plan Verification — Pass 2 (post-revision)

## Posture

Adversarial second-pass check on revised plans. Starting hypothesis: the planner papered over the BLOCKER and the WARNINGS without fully wiring the fixes. Goal of this pass: confirm each PASS-1 finding has a verifiable artifact in the current plans/VALIDATION, AND that nothing that PASSed in PASS-1 was broken.

Verification ran:
- grep for "tests/presentation/cli" across 32-0[123]-PLAN.md and 32-VALIDATION.md returned zero matches (BLOCKER-resolved)
- Historical refs in 32-RESEARCH.md (10 lines) and the previous 32-PLAN-CHECK.md (about to be overwritten) — acceptable per orchestrator instructions
- Codebase confirms co-located convention: `ls src/presentation/cli/commands/` returns 16 paired `<cmd>.ts` + `<cmd>.test.ts` siblings (backfill, browse, completion, context, doctor, export, import, install, list, purge, related, search, show, stats, status, uninstall)
- Plan-by-plan structural and content checks below

## BLOCKER resolution — VERIFIED

**Required fix:** Move 6 `.json.test.ts` files from `tests/presentation/cli/commands/` to `src/presentation/cli/commands/`. Update everywhere these paths appear.

Verification (each item independently confirmed):

| Surface | Required state | Observed | Status |
|---|---|---|---|
| Plan 02 frontmatter `files_modified` | 6 entries with `src/presentation/cli/commands/<cmd>.json.test.ts` | Lines 14-19 of 32-02-PLAN.md show exactly these 6 paths | PASS |
| Plan 02 Task 1 `<files>` | All 6 paths co-located under src/ | Line 178 of 32-02-PLAN.md lists `src/presentation/cli/commands/search.json.test.ts` ... `stats.json.test.ts` | PASS |
| Plan 02 Task 1 verify automated | Glob targets src/ path | Line 269 — `bun test src/presentation/cli/commands/*.json.test.ts` | PASS |
| Plan 02 Task 2 verify automated | Specific src/ paths | Line 356 — search/context/show.json.test.ts under src/ | PASS |
| Plan 02 Task 3 verify automated | Specific src/ paths | Line 400 — list/related/stats.json.test.ts under src/ | PASS |
| Plan 02 `<test_placement_convention>` block | Explicit "Resolves checker BLOCKER 1" + codebase-convention citation | Lines 71-75 of 32-02-PLAN.md | PASS |
| Plan 02 `<artifacts>` entry for tests | Path glob under src/ + co-located comment | Line 51-52 | PASS |
| Plan 02 `<key_links>` | from-clause references `src/presentation/cli/commands/search.ts` (not tests/) | Line 54 | PASS |
| Plan 02 `<acceptance_criteria>` | Explicit gate: "No `.json.test.ts` files created outside `src/presentation/cli/commands/`" | Line 479 | PASS |
| VALIDATION.md per-task verification map | Rows 57-62 use `src/presentation/cli/commands/<cmd>.json.test.ts` paths | Lines 57-62 | PASS |
| VALIDATION.md Wave 0 Requirements | All 6 `.json.test.ts` entries use src/ paths | Lines 78-83 | PASS |
| VALIDATION.md "Test Placement Convention" section | Exists with explicit BLOCKER 1 reference | Lines 41-46 | PASS |
| VALIDATION.md Sign-Off | Checklist item: "All `.test.ts` files co-located under `src/presentation/cli/` (BLOCKER 1 resolved)" | Line 136 | PASS |

Additionally, the grep-clean of `tests/presentation/cli` is confirmed across the four revised documents: zero occurrences in 32-01-PLAN.md, 32-02-PLAN.md, 32-03-PLAN.md, 32-VALIDATION.md. Historical references survive only in 32-RESEARCH.md (research artifact, not revised in this pass) and the previous 32-PLAN-CHECK.md (about to be overwritten by this file).

**Adversarial check:** Could the planner have left a stale path elsewhere — e.g., a `mkdir tests/...` instruction inside an action block, or a path embedded in a code snippet? Grep confirms no. The single mention of "tests/" in Plan 03 Task 2 (line 253) is `grep -rn "OutputMode" tests/` — an exploratory grep, defensive in case any cross-tree references remain. Not a file-creation instruction; sensible.

**BLOCKER: fully resolved.**
## WARNING resolutions — VERIFIED

### W1 (Plan 01): help snapshot version-line churn — RESOLVED

**Required:** Strip lines matching `/versions+d+.d+.d+/i` before `toMatchSnapshot()`, OR document the policy explicitly.

Observed in 32-01-PLAN.md:
- Line 21 (must_haves.truths): "snapshot intentionally excludes the version line to avoid churn on package version bumps"
- Lines 190-202 (Task 1 behavior): Explicit code sample with `.filter(line => !/versions+d+.d+.d+/i.test(line))` before `expect(sanitized).toMatchSnapshot()`. Code comment block documents policy.
- Line 213 (Task 1 action): Explicit "(resolves checker W1)" callout
- Line 228 (Task 1 done): Explicit "Snapshot test strips the version line before assertion per W1 resolution"
- Line 301 (Task 2 action D): "confirm the snapshot does NOT contain a `version X.Y.Z` line"
- Lines 324, 357, 366, 393, 405: All downstream done/verification/acceptance/output entries reinforce the policy
- Line 344 (threat model T-32-02): "Version line is also stripped before snapshot (W1 policy)"

Policy documented at multiple anchor points; sanitization is verifiable (acceptance criterion line 393: `Help snapshot does NOT contain a "version X.Y.Z" line`).

**W1: resolved with multi-anchor enforcement.**

### W2 (Plan 02): batched 3-file commit in Task 2 — RESOLVED (with explicit rationale)

**Required:** Add a `<rationale>` block acknowledging the batched commit decision, OR split into per-file commits.

Observed in 32-02-PLAN.md Task 2 (lines 283-285) — the `<rationale>` block:
- Names the resolution: "Resolves checker W2 (acknowledgement, not structural change)"
- Justifies the bundle: 3 call-sites of the identical refactor template; bundling reduces commit churn while preserving SRP at file level
- Explains the trade-off: per-file commits would produce three near-identical diffs with no semantic distinction, adding review burden without improving auditability
- Includes the escape hatch: "If during execution the refactor diverges materially in any one file (e.g., context.ts requires a unique data-shape transformation), split that file into its own commit"

The escape hatch composes well with `actions-not-promises.md` thinking — the executor has explicit authorization to split if invariants change.

**W2: resolved.**

### W3 (Plan 02): brittle force-error trigger — RESOLVED

**Required:** Replace `dbPath: "/non/existent/path"` with deterministic strategy.

Observed in 32-02-PLAN.md (lines 209-236):
- New `<error_trigger_strategy>` block under Task 1
- **Strategy A (preferred):** `:memory:` DB + crafted-failure input. Lists per-command failure paths:
  - search: FTS5 control characters (e.g., quoted unclosed-paren input)
  - context: non-existent project + invalid budget value
  - show: non-existent session ID
  - list: `since > until` date range
  - related: invalid source type
  - stats: explicit escape — use Strategy B or drop error test for stats
- **Strategy B (fallback):** `mock.module()` injection with code sample
- **Explicit ban:** Line 230 — "DO NOT use `dbPath: '/non/existent/path/missing.db'` — relies on OS-level open-failure which is flaky on Windows file-locking semantics and can produce different error codes than the handler expects"
- Line 234 — Mandate: each `.json.test.ts` file documents chosen strategy in a header comment
- Line 262 (action): "apply `<error_trigger_strategy>` above. Pick Strategy A unless the command lacks a deterministic input-shaped failure path"

VALIDATION.md edge cases line 115 echoes the strategy: "Error-trigger strategy: deterministic (FTS-control-char query OR `mock.module()` injection); NOT `dbPath: '/non/existent/...'` per W3 resolution".

**W3: resolved with Windows-file-locking justification (correct — bun:test on Windows has hit exactly this flake before).**

### W4 (Plan 03): 17 files modified at threshold — RESOLVED

**Required:** Add `<context_budget>` block with per-file edit-size breakdown and Task 3 sub-task split guidance.

Observed in 32-03-PLAN.md (lines 64-74) — the `<context_budget>` block:
- Names the resolution: "Resolves checker W4"
- Per-file edit-size estimates:
  - 6 command files: ~5-10 lines each
  - 6 test files: append one `describe("CLI-03: ...")` block per file (~30-50 lines per file)
  - 4 formatter files: add `formatBrief()` function (~10-20 lines each)
  - CHANGELOG.md: ~10 lines
- Executor instructions: if context consumption exceeds 50% before Task 3 completes, split Task 3 into per-command sub-tasks
- Pre-specified sub-split boundaries: search+show, list+stats, context+related (the last grouping pairs the two commands that share the deprecated `detailed` alias — semantically coherent)
- Risk localization: "Tasks 1 and 2 are pre-budgeted and unlikely to exceed 30% each. The risk is concentrated in Task 3 cross-command consistency edits"

Per-file edit-size estimates are concrete (lines per file × file count = total LOC budget mentally calculable). Task 3 action block (line 321) reinforces the split guidance. Acceptance criteria line 484 codifies the escape hatch: "Task 3 MAY split into 3 sub-commits if context budget requires (W4 resolution)".

**W4: resolved.**

### W5 (Plan 03): stats brief `≤3 lines` too tight — RESOLVED

**Required:** Change to `≤5 lines` and update VALIDATION.md edge-case row.

Observed in 32-03-PLAN.md — every occurrence of the bound for stats is now `≤5`:
- Line 37 (must_haves.truths): "≤5 lines"
- Line 50 (artifacts): "≤5 lines"
- Line 153 (interfaces brief table): "Up to 5 lines... The hard upper bound is ≤5 lines (per W5 resolution); 3 lines is the typical case"
- Line 202 (Task 1 behavior assertion 5): "at most 5 lines (per W5 resolution — was 3, softened to 5 to give the formatter implementation breathing room for optional `generated_at` line and trailing newlines)"
- Line 218 (Task 1 behavior assertion 11): "line count ≤ 5"
- Line 240 (Task 1 done): "Stats brief assertion uses ≤5 line bound (W5 resolution)"
- Line 287 (Task 2 action stats-formatter): "hard ceiling 5 lines"
- Line 397 (Task 3 verify smoke): "≤ 5 lines of empty-state output"
- Line 451 (success_criteria): "≤5 lines (W5 resolution)"
- Line 479 (acceptance_criteria): "≤ 5 lines total for stats"
- Line 498 (output summary): "softened from initial ≤3 for formatter breathing room"

VALIDATION.md line 118: "top-line counters, ≤5 lines total (W5 resolution; was ≤3, softened for formatter breathing room)".

**Adversarial check:** Is there a residual `≤3` for stats anywhere? Searched: line 479 (acceptance_criteria) reads "produces ≤ 1 line per record (or ≤ 5 lines total for stats; ≤ 3 lines for context/show)". The `≤3` here is for **context/show**, not stats — those commands produce single-line summaries and 3 is reasonable for context optional metadata fields. Not a W5 regression.

**W5: resolved consistently across all anchor points.**

### W6 (Plan 03): OutputMode caller cascade — RESOLVED

**Required:** Add grep step at start of Task 2 + `bun --bun tsc --noEmit` verification gate.

Observed in 32-03-PLAN.md Task 2 (lines 250-260) — the Step 0 (W6 resolution — OutputMode caller discovery) block:
- Before extending the `OutputMode` union with `"brief"`, run a discovery sweep
- `grep -rn "OutputMode" src/ 2>&1 | head -50`
- `grep -rn "OutputMode" tests/ 2>&1 | head -50` (defensive cross-tree check)
- Expected callers listed (formatter helpers and command handlers)
- Architectural guard: "If grep reveals callers outside `src/presentation/cli/`, STOP and surface to user — adding `"brief"` to the union must not leak presentation-layer types into other tiers"
- Workflow: commit immediately after the union extension so the type-error cascade is visible in one diff; iterate per cascade-fix block

Plus:
- Line 290: "Confirm via Step 0 grep output that every site listed there has been updated"
- Line 303 (verify): `bun --bun tsc --noEmit 2>&1 | head -20` — ZERO type errors after the OutputMode union extension. If errors remain, an unmigrated caller exists; locate via the grep from Step 0
- Line 306 (done): "Step 0 grep output captured (in commit message or task notes); all OutputMode callers known before union extension"
- Line 310 (done): "Type compilation passes (`bun --bun tsc --noEmit` clean — verifies W6 cascade complete)"
- Line 446 (verification): `bun --bun tsc --noEmit` exits 0 (W6 cascade complete; no stale OutputMode callers)
- Line 456 (success_criteria): "OutputMode union extension complete with all callers updated (W6 resolution; verified via Step 0 grep + clean tsc)"
- Line 477 (acceptance_criteria): `[ ] bun --bun tsc --noEmit exits 0 (OutputMode cascade complete)`

The discovery → extend → cascade-fix workflow is now explicit, with a hard architectural guard ("If grep reveals callers outside `src/presentation/cli/`, STOP and surface to user").

**W6: resolved with hexagonal-architecture guard included as a bonus (presentation-layer type leak detection).**

## Preserved-since-PASS-1 — VERIFIED INTACT

Adversarial sweep: did the revisions break any of the PASS-1 PASSes?

| Property | Required | Observed | Status |
|---|---|---|---|
| 8-task structure across 3 plans | 2 + 3 + 3 = 8 tasks total | Plan 01: 2 tasks (lines 171, 232). Plan 02: 3 tasks (lines 176, 277, 368). Plan 03: 3 tasks (lines 183, 243, 314) | INTACT |
| Wave 0 strictly before Wave 1 | All RED tests precede GREEN impl | Plan 01: W0-T1 (RED) → W1-T2 (GREEN). Plan 02: W0-T1 (RED) → W1-T2/T3 (GREEN). Plan 03: W0-T1 (RED) → W1-T2/T3 (GREEN). Wave assignments in task names match. | INTACT |
| Atomic commits per task | One commit per logical change | Plan 02 W2 rationale acknowledges batch with split-escape-hatch. Plan 03 W4 sub-split is optional. | INTACT (with documented carve-outs) |
| TDD compliance | `tdd="true"` attr; tests before code | All 8 tasks declare `tdd="true"`. RED tasks have `<files>` that include only test files; GREEN tasks `<files>` include only implementation. | INTACT |
| 95% coverage gates per file | Every modified-file done block asserts coverage | Plan 01 line 311, 323. Plan 02 line 353, 364, 410. Plan 03 line 297, 308, 408. | INTACT |
| Threat model blocks | Each plan has STRIDE register with ASVS reference | Plan 01: T-32-01..03 (lines 330-348). Plan 02: T-32-04..07 (lines 416-435). Plan 03: T-32-08..11 (lines 414-433). All carry ASVS V5 reference. | INTACT |
| Phase 32.5 convergence | envelope carries `kind` + reserves `scope` | Plan 01 interfaces (line 119) declares `kind: QueryResultKind` + `scope?: string`. Plan 02 per-command kind table (line 145). Plan 03 `--format brief|ai` floor preserves room for `--shape`. Each plan has explicit `<phase_32_5_convergence>` block. | INTACT |
| 7 Open Question decisions encoded | Q1-Q7 all decided | Plan 01: Q1 (browse→System line 305), Q6 (schema_version=1 line 307), Q7 (friction OUT line 308). Plan 02: Q2 (silent override line 346). Plan 03: Q3 (deprecated alias line 381), Q4 (no .default() line 382), Q5 (Option A line 383), Q7 (friction OUT line 464). | INTACT |
| Friction OUT of scope | No friction-command modifications | Plan 01 frontmatter `files_modified` does not include friction.ts. Plan 02 same. Plan 03 same. Audit §14.A referenced. | INTACT |
| `--format detailed` aliased not removed | Retained on context+related only | Plan 03 lines 138-142, 356-365. CHANGELOG entry line 376. | INTACT |
| `Chude <chude@emeke.org>` author + no AI attribution + no emojis | All plans assert in acceptance_criteria | Plan 01 line 394. Plan 02 line 477. Plan 03 line 485. | INTACT |
| No domain/application changes | Hexagonal preserved | Plan 01 files_modified scope: src/presentation/cli/*. Plan 02 same. Plan 03 same + CHANGELOG.md (root, not a layer). | INTACT |
| Commander v14 — no new deps | `.commandsGroup()` and `.choices()` native | Plan 01 line 365 acceptance: "commander@^14.0.2 already supports `.commandsGroup()`". | INTACT |
| Dependencies: 01 → 02 → 03 | depends_on chain | Plan 01: `depends_on: []`, wave 1. Plan 02: `depends_on: ["32-01"]`, wave 2. Plan 03: `depends_on: ["32-01", "32-02"]`, wave 3. | INTACT |

Nothing was broken in revision.

## Dimensions — second-pass summary

| Dimension | Plan 01 | Plan 02 | Plan 03 | Cross-plan |
|---|---|---|---|---|
| 1. Requirement coverage | PASS (CLI-01) | PASS (CLI-02, all 6 cmds) | PASS (CLI-03, all 6 cmds) | All 3 ROADMAP criteria covered |
| 2. Task completeness | PASS | PASS | PASS | — |
| 3. Dependency correctness | PASS (wave 1) | PASS (wave 2) | PASS (wave 3) | DAG closes; no cycles |
| 4. Key links planned | PASS | PASS | PASS | — |
| 5. Scope sanity | PASS (2 tasks, 5 files) | PASS (3 tasks, 12 files) | PASS (3 tasks, 17 files with context-budget guard) | — |
| 6. Verification derivation | PASS | PASS | PASS | — |
| 7. Context compliance | N/A (no CONTEXT.md provided) | N/A | N/A | All 7 Open Questions decided |
| 7b. Scope reduction | PASS (no v1/v2 hedging) | PASS | PASS | — |
| 7c. Architectural tier | PASS (presentation-only) | PASS (presentation-only) | PASS (presentation-only + CHANGELOG; W6 cross-tier guard added) | All presentation-tier; no leak |
| 8. Nyquist compliance | PASS | PASS | PASS | VALIDATION.md exists, sampling continuity satisfied, no watch-mode flags |
| 9. Cross-plan data contracts | PASS | PASS (envelope from 01) | PASS (sequenced after 02) | Envelope shape stable; sequenced wave-graph prevents concurrent writes |
| 10. CLAUDE.md compliance | PASS (bun, TDD, no emoji, hexagonal) | PASS | PASS | — |
| 11. Research resolution | N/A | N/A | N/A | RESEARCH §Open Questions all decided in plans (decisions encoded plan-side per audit §21) |

## Phase 32.5 Convergence — re-confirmed

Envelope shape (`schema_version: "1"`, `command`, `kind`, `scope?`, `meta?`, `data`) is forward-compatible with the unified query primitive per audit §21:
- `kind` set from command name in Phase 32; from `--kind` flag in Phase 32.5 — same field
- `scope` reserved as optional/undefined in Phase 32; populated by `--scope` flag in Phase 32.5 — additive
- `--format brief|ai` 2-value floor leaves room for `--shape` in 32.5 without overload
- Deprecated `--format detailed` does NOT carry forward — CHANGELOG signals removal at next minor

**Risk to Phase 32.5 if Phase 32 ships as planned: LOW.** Schema bump not expected.

## Verdict

All revision targets verified. The BLOCKER is mechanically resolved at every surface (frontmatter, action, verify, VALIDATION.md). All 6 WARNINGS have explicit resolutions cited by their W-codes (W1, W2, W3, W4, W5, W6) at multiple anchor points per plan — survives /clear by being load-bearing across must_haves/acceptance_criteria/threat_model. Nothing PASSed in pass-1 was broken in revision.

Goal-backward analysis: each of CLI-01, CLI-02, CLI-03 has a task that delivers it, a test that verifies it, and an acceptance criterion that gates it. Wave graph closes acyclically. Coverage gates at 95% per metric on every modified file. Hexagonal preserved. No domain/application layer touched.

Phase 32 is ready for execution.

## CHECK COMPLETE — PASS
