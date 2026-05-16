Reading additional input from stdin...
OpenAI Codex v0.130.0
--------
[1mworkdir:[0m C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus
[1mmodel:[0m gpt-5.5
[1mprovider:[0m openai
[1mapproval:[0m never
[1msandbox:[0m workspace-write [workdir, /tmp, $TMPDIR, C:\Users\Destiny\.codex\memories]
[1mreasoning effort:[0m high
[1mreasoning summaries:[0m none
[1msession id:[0m 019e202d-d012-7be0-bebe-29ac669ed1a2
--------
[36muser[0m
Review this triage disposition plan. Be adversarial. Push back on the first-principles framing question at top, the per-item decisions, the systems-thinking aspects, and the reviewer-ask numbered list. Return findings as numbered list with severity tag per finding. End with a verdict: BLOCK / PROCEED-WITH-CHANGES / PROCEED-AS-IS.

<stdin>
# Triage Disposition Plan — 4 open inbox items (memory-nexus)

You are reviewing a plan, not code. Be adversarial. Identify weaknesses, missed framings, anchoring on wrong primitives, and hidden debt. Push back hard on the first-principles question at the end.

## Context (cold-readable)

`@chude/memory` is a TypeScript CLI tool (Bun runtime, hexagonal architecture). v4.0 milestone (Phase 32–37) is **paused** pending a first-principles architecture audit kicked off 2026-05-11 (`docs/audits/2026-05-11-architecture-first-principles-audit.md`). Audit Stage 0 is complete: 8 provisional truths derived, 3 constraints, provisional minimum structure (hybrid event-log + derived projection). Stage 1 (CLI surface verification + architecture-evidence pass) is the next step. Audit will recommend ONE of 5 outcomes:

- **A** Continue v4.0 (status quo)
- **B** Scope v5.0 federation
- **C** Surgical consolidation
- **D** Freeze at v4.0
- **E** Deprecate / replace

The user's load-bearing worry (verbatim, see audit §0): "I honestly wonder if the memory tool has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."

The 4 inbox items below were surfaced during the test-isolation arc's closing verification (2026-05-11) or filed by adjacent projects. They need triage decisions BEFORE Stage 1 begins so the audit isn't carrying ambient ambiguity.

## First-principles framing question (load-bearing — review this FIRST)

**Should we triage these 4 items NOW, or defer until the audit recommends an outcome?**

Arguments for NOW:
- Audit is research, not implementation; doesn't change project state.
- Items 2 (friction orphan) and 3 (programmatic-api) are blocking test reliability TODAY. The test-isolation arc just closed at 28→0 violations; carrying these forward muddies signal.
- Items 1 (bun crash) and 4 (friction-list enhancement) require no project-side code change — triage decision is documentation/disposition only.
- Audit may take 1-3 sessions. Leaving 4 items in `status: open` accumulates inbox debt.
- Per `no-hidden-debt.md`: items deferred without concrete trigger become hidden debt.

Arguments for DEFER:
- Outcome **E** (deprecate) would make any code fix for items 2 & 3 wasted work.
- Audit Stage 1a subagents read the codebase. Mid-audit code churn (item 2 fix, item 3 fix) could destabilize their evidence.
- Cognitive load: triage burns main-session context that's needed for Stage 0-derived first-principles thinking.

My disposition (please pressure-test):
- Items 1 and 4 → triage NOW (documentation-only; no code churn risk).
- Item 2 (friction orphan) → triage decision NOW (delete vs migrate), EXECUTE NOW because it's truly orphaned dead code (8 tests, 319 lines, fail at import time) — leaving it open creates Stage 1 friction.
- Item 3 (programmatic-api) → triage decision NOW (fix is canonical deps-injection pattern from closed arc), EXECUTION DEFERRED with concrete trigger = "Stage 3 audit recommendation in {A, B, C, D}; if E, fix is abandoned." This bounds the wasted-work risk to ONE item, not all four.

The question for codex: **is the "decision now, deferred execution for item 3" split sound, or am I anchoring on a sunk-cost-avoidance frame that ignores systems-level coupling I'm not seeing?**

---

## Per-item dispositions

### Item 1 — `bun test` (full suite) crashes on Windows with integer overflow
- **File:** `docs/inbox/2026-05-11-memory-nexus-bun-windows-full-suite-crash.md`
- **Severity:** medium · **Type:** bug · **Source:** memory-nexus
- **Root cause:** Bun runtime bug on Windows. Memory pressure past ~6.8GB triggers integer overflow in KERNEL32 stack. NOT memory-nexus code.
- **Disposition:** **TRIAGED → KEEP OPEN, document workaround.**
  - **Action this session:** add a "Running tests on Windows" section to project docs (which? — see ambiguity below) noting the subdivided-run workaround.
  - **Defer the fix** to upstream Bun. Concrete trigger: deferred reminder watcher on Bun version bump past 1.3.5 OR the project explicitly retries full-suite run during a CI/release cycle.
  - **Frontmatter update:** `status: triaged`, `triaged_at: 2026-05-13`, add `workaround_documented_in: <doc path>`.
- **Owner:** upstream Bun team for the fix; memory-nexus owns the documented workaround.
- **Ambiguity for codex:** which doc — CONTRIBUTING.md (doesn't exist), README.md (user-facing, wrong audience), or docs/development.md (also doesn't exist)? My call: create `docs/development.md` with this as the first entry. Pushback welcome — could also live in README.md "Development" section.

### Item 2 — `tests/presentation/cli/commands/friction.test.ts` imports removed friction.js
- **File:** `docs/inbox/2026-05-11-memory-nexus-friction-test-phase-30-orphan.md`
- **Severity:** medium · **Type:** bug · **Source:** memory-nexus
- **Root cause:** Phase 30 (god-file cleanup, commit history confirms) split `src/presentation/cli/commands/friction.ts` into `friction/` subdirectory with co-located *.test.ts files. The older orphan test file at `tests/presentation/cli/commands/friction.test.ts` imports the removed monolithic path and fails at import time.
- **Verified state (just checked):**
  - Co-located dir EXISTS: dashboard.ts/test, index.ts/test, list.ts/test, log.ts/test, purge.ts/test, resolve.ts/test, types.ts, wontfix.ts/test (8 files + 7 test files).
  - Co-located test count: 38 test cases across 7 files (936 lines).
  - Orphan test count: 8 test cases (319 lines).
- **Disposition:** **TRIAGED → MIGRATE, not delete.**
  - **Why not delete:** 8-case orphan is unlikely to be a strict subset of 38-case co-located. The orphan title says "Tests for --tool flag, auto-ingest, seen/unseen indicators, and markReviewed integration" — these read as integration-style (full executeFrictionCommand wiring), not unit-per-module (which is what the co-located files cover, given the file naming).
  - **Action this session:** read the orphan, classify each test case as duplicate-of-co-located or unique. For duplicates: drop. For uniques: migrate import to `friction/index.js` (the dispatch surface).
  - **Frontmatter update:** `status: in-progress` while migrating; `merged` + `resolved_at` after commit; then move to `archived/`.
- **Owner:** this session.
- **Ambiguity for codex:** if the migrated tests are integration-style and the co-located tests are unit-style, am I creating a redundant integration layer? Or is integration coverage at the executeFrictionCommand boundary actually load-bearing (it tests the dispatch + service wiring, which unit tests of submodules don't catch)?

### Item 3 — `programmatic-api.test.ts` hits real user DB; 6 commands time out
- **File:** `docs/inbox/2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md`
- **Severity:** medium · **Type:** bug · **Source:** memory-nexus
- **Root cause:** Tests call `executeXCommand(options)` without the `deps` argument. Production defaults resolve `getDbPath()` to the user's real DB. As that DB grew, reads exceeded Bun's 5s test timeout. 13 timed-out test cases.
- **Verified state:** the canonical fix pattern (per-call deps injection) landed during the test-isolation arc. The fix is mechanical: thread `{ dbPath: testDbPath }` into each call, with a per-test temp DB via `tests/helpers/test-database.ts`. `doctor` also needs `healthOverrides`.
- **Disposition:** **TRIAGED → fix decision recorded NOW, EXECUTION DEFERRED.**
  - **Why not fix now:** medium-effort arc (13 cases + doctor healthOverrides + assertion strengthening). Burns main-session context needed for Stage 1.
  - **Why not full-defer:** the fix pattern is well-known; the decision is settled. Recording the decision now lets a future session pick this up without re-deriving.
  - **Concrete trigger for execution:** Stage 3 audit recommendation is one of {A, B, C, D}. If outcome E, fix is abandoned (and so are the 13 tests).
  - **Frontmatter update:** `status: triaged`, `triaged_at: 2026-05-13`, add `execution_blocked_on: audit-recommendation-stage-3-non-E`.
- **Owner:** this project, post-audit-recommendation session.
- **Ambiguity for codex:** is "execution deferred on Stage 3 outcome" a concrete trigger per `no-hidden-debt.md`, or hidden debt dressed up as a gate? The audit is finite work, with a known endpoint, but it's not a date or version-bump. Push back if this fails the trigger test.

### Item 4 — `memory friction list` durable filter + count extensions
- **File:** `docs/inbox/2026-05-12-conversations-friction-list-durable-filters.md`
- **Severity:** low · **Type:** enhancement · **Source:** conversations
- **Context:** conversations filed this 2026-05-12 as future capacity, NOT actionable today. Their `friction_pattern_detected` reminder check scans JSONL (transient) acceptably; this filing documents what they'd need IF a future checker required durable DB-backed signal.
- **Disposition:** **TRIAGED → KEEP OPEN, accept as future-capacity backlog.**
  - **Why not merge/build:** explicit "do NOT build solely for conversations" in the filing. No consumer is blocked.
  - **Why not reject:** the proposal is sound, well-bounded (extend `list`, not new subcommand), and the conversations team flagged 6 hard requirements that ARE the right questions to settle BEFORE implementation. Rejecting would lose useful design work.
  - **Frontmatter update:** `status: triaged`, `triaged_at: 2026-05-13`, add `execution_blocked_on: v4.x post-audit if outcome A or B; abandon if D or E`. Outcome C may revisit.
- **Owner:** v4.x post-audit (conditional on outcome).
- **Ambiguity for codex:** the conditional execution gate ("if A/B do consider; if C revisit; if D/E abandon") looks like it COULD slip into hidden debt if outcome A/B happens but the v4.x roadmap doesn't actually surface this item. Should I write the gate as a deferred reminder in `~/Projects/conversations/hooks/deferred-reminders.json` keyed off audit Stage 3 outcome? That's the only way to make the trigger fire automatically rather than rely on memory.

---

## Out of scope (NOT in this triage)

- Actual fix execution for items 2, 3 (item 2's fix execution IS in this triage; items 3, 4 are not).
- Re-opening the friction-primacy or test-isolation arcs.
- Modifying the audit plan or Stage 0 truths.
- Adding new inbox items.
- Closing the active audit item (`2026-05-08-conversations-first-principles-architecture-audit.md`) — that closes at Stage 3.

## Risks / invariants throughout triage execution

- **Invariant:** the audit doc and `.planning/audits/` durable plan are READ-ONLY during triage. Triage changes inbox files + at most ONE production file (`docs/development.md`).
- **Invariant:** no friction.jsonl writes from triage (per `secrets-in-tool-output.md` adjacency: avoid side-effect channels during decision work).
- **Invariant:** all status transitions follow cross-project-issues.md v1.2: terminal = merged/rejected; triaged/in-progress = WIP.
- **Rollback:** all triage changes are git-reversible. No destructive ops.
- **Cross-project notifications:** items 1, 2, 3 are memory-nexus → memory-nexus (no closure_notify_to). Item 4 has `closure_notify_to: conversations` — would fire only on terminal merged/rejected, NOT on `triaged`. Triage does not trigger any counter-notification.

---

## Reviewer ask (numbered — be ruthless on these)

1. **First-principles question (top of doc):** is "triage NOW with item 3 execution deferred to Stage 3 outcome" sound, or am I anchoring on sunk-cost avoidance? Are there second-order effects (e.g., Stage 1 subagents seeing different test pass rates because item 2 was migrated mid-audit) I'm missing?

2. **Item 2 (friction orphan) — migrate vs delete:** is migrating an 8-case integration-style test file on top of 38 unit-style co-located tests architecturally sound, or am I preserving redundant coverage? What's the systems-thinking call?

3. **Item 3 trigger:** is "Stage 3 audit recommendation in non-E" a concrete enough trigger to satisfy `no-hidden-debt.md`? Or is it really "vibe-defer with audit-shaped face paint"?

4. **Item 4 reminder gate:** should I file a deferred reminder in conversations' system keyed off audit Stage 3 outcome, so the v4.x decision surfaces automatically? Or is that over-engineering for a LOW-severity enhancement?

5. **Item 1 doc location:** create `docs/development.md` (new file) vs README.md "Development" section? Project convention check — what does memory-nexus prefer?

6. **Anchoring check:** the Stage 0 audit truths are deliberately memory-nexus-blind. Does this triage plan ANCHOR on memory-nexus's current shape in a way that would predispose Stage 1 evidence toward outcome A? Specifically: by migrating the friction orphan in item 2, am I implicitly endorsing the Phase 30 god-file split, which IS a memory-nexus-shaped architectural decision?

7. **Systems thinking:** is the inbox itself a load-bearing surface that the audit should consider, or is it orthogonal? The audit's Stage 0 truth T2 is "memory is captured (sub-second human-input cost) and retrieved" — does the inbox triage process count as memory capture/retrieval in scope?

8. **Hidden debt audit:** review the disposition for any item I'm marking `triaged` that actually meets the criteria for rejection (item 4? — conversations explicitly said don't build for them today, so does "triaged with conditional execution" really differ from rejection?).

Return findings as numbered list with severity (BLOCK / HIGH / MEDIUM / LOW / NIT) per finding.
</stdin>
[2m2026-05-13T07:12:15.742854Z[0m [31mERROR[0m [2mrmcp::transport::worker[0m[2m:[0m worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Server returned error response: invalid_grant: Invalid refresh token"))
[1mhook:[0m [2mSessionStart[0m
[1mhook:[0m [2mSessionStart[0m
[1mhook:[0m [2mSessionStart[0m
[1mhook:[0m [2mSessionStart[0m
[1mhook:[0m [2mSessionStart[0m
[1mhook:[0m [2mSessionStart[0m Completed
[1mhook:[0m [2mSessionStart[0m Failed
[1mhook:[0m [2mSessionStart[0m Completed
[1mhook:[0m [2mSessionStart[0m Failed
[1mhook:[0m [2mSessionStart[0m Completed
[35m[3mcodex[0m[0m
I’ll review this as a plan-level risk assessment, but I’m going to verify the repo conventions and the relevant memory-nexus context first because the doc-location and “test isolation arc” claims are state-dependent. I’ll keep this read-only.
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force; Get-ChildItem -Force docs; Get-ChildItem -Force docs\\inbox"[0m in C:\Projects\memory-nexus
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short'[0m in C:\Projects\memory-nexus
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"memory-nexus|test-isolation|programmatic-api|friction\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md"[0m in C:\Projects\memory-nexus
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg --files docs | sort'[0m in C:\Projects\memory-nexus
[32m succeeded in 11237ms:[0m
157:# Task Group: memory-nexus test-isolation cleanup and external-review gatekeeping
158:scope: Use when test pollution, module-level seams, or architectural cleanup in `memory-nexus` need a staged refactor with a static gate and mandatory external review.
159:applies_to: cwd=C:\Projects\memory-nexus; reuse_rule=Safe to reuse for this checkout and similar Bun/CLI cleanup work; exact file names and counts are repo-specific.
161:## Task 1: Long-running test-isolation cleanup removed first-party pollution and reduced the remaining seam to `paths.ts`, success
165:- rollout_summaries/2026-05-10T13-26-54-xSuJ-memory_nexus_test_isolation_cleanup_and_doc_for_clear.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c510-7933-aee8-dbe7ed665d11.jsonl, updated_at=2026-05-10T13:26:55+00:00, thread_id=019e1211-c510-7933-aee8-dbe7ed665d11, captures the broad cleanup arc and persistence)
166:- rollout_summaries/2026-05-10T13-26-54-Z8cx-memory_nexus_test_isolation_codex_review_preference.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c311-79d2-ab5c-90d0070898b1.jsonl, updated_at=2026-05-10T13:26:54+00:00, thread_id=019e1211-c311-79d2-ab5c-90d0070898b1, captures the env-var migration finish and standing review preference)
170:- test:isolation, scripts/check-test-isolation.ts, mock.module, deps parameters, env-overrides.ts, paths.ts, setTestPaths, resetTestPaths, 3096 pass, MEMORY_HOME
176:- rollout_summaries/2026-05-10T13-26-54-Z8cx-memory_nexus_test_isolation_codex_review_preference.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c311-79d2-ab5c-90d0070898b1.jsonl, updated_at=2026-05-10T13:26:54+00:00, thread_id=019e1211-c311-79d2-ab5c-90d0070898b1, codifies the review-before-execution requirement)
184:- The user said `Let's close out the test-isolation arc cleanly then inbox triage` -> finish the currently active cleanup arc before pivoting to a new queue. [Task 1]
190:- `scripts/check-test-isolation.ts` is the authoritative static gate: it bans module-level mutable test seams and first-party `mock.module()` pollution, and the safe migration pattern is env/deps support first, test migration second, seam deletion last. [Task 1]
466:- The app is portable rather than Vercel-locked: `vercel.json` pins `lhr1`, middleware is edge-default, cron is GitHub Actions + bearer auth, and the likely friction is Node-style routes / platform assumptions that still need a fuller audit. [Task 1]
772:- remotely, cargo install --path . --force, cross-machine, friction_pattern_detected, phase_complete, document-for-clear, medisin naming, portfolio.json, ssh desktop, printf
806:- `phase_complete` and `friction_pattern_detected` became registry-backed reminder checks; `friction_pattern_detected` scans `~/.claude/friction.jsonl` and fails closed on missing/malformed input. [Task 1]

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 11378ms:[0m
 m .claude/worktrees/agent-aa39fad9
 M bun.lock
 M package.json
?? .planning/reviews/2026-05-08-paths-ts-test-isolation-codex-review.md
?? .planning/reviews/2026-05-08-paths-ts-test-isolation-plan.md
?? .planning/reviews/2026-05-13-triage-disposition-codex-review.md
?? .planning/reviews/2026-05-13-triage-disposition-gemini-review.md

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 14056ms:[0m
docs\01-VISION.md
docs\02-RESEARCH.md
docs\03-DECISION-JOURNEY.md
docs\04-ARCHITECTURE.md
docs\05-IMPLEMENTATION.md
docs\agent-write-protocol.md
docs\audits\2026-04-26-adversarial-architecture.md
docs\audits\2026-04-26-adversarial-perf-tests.md
docs\audits\2026-04-26-adversarial-reliability.md
docs\audits\2026-04-26-adversarial-security.md
docs\audits\2026-04-26-adversarial-ux-dx.md
docs\audits\2026-04-26-CONSOLIDATED.md
docs\audits\2026-05-11-architecture-first-principles-audit.md
docs\HOOKS.md
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md
docs\inbox\README.md
docs\plans\2026-03-07-knowledge-layer-friction-design.md
docs\plans\handoff-claude-analysis.md
docs\plans\handoff-user-thoughts.md
docs\plans\PRD-knowledge-layer.md
docs\plans\qmd-integration-notes.md
docs\SCRATCHPAD.md

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[32m succeeded in 14738ms:[0m


    Directory: C:\Projects\memory-nexus


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
d----l         6/22/2025   8:40 AM                .cc-guardian                                                         
d----l          5/8/2026  10:30 AM                .claude                                                              
d--h-l         5/13/2026   8:13 AM                .git                                                                 
d----l         5/11/2026   3:48 PM                .planning                                                            
d----l          2/5/2026  11:08 PM                .stryker-tmp                                                         
d----l         3/18/2026   7:25 PM                coverage                                                             
d----l         2/25/2026   9:11 PM                deprecation-stub                                                     
d----l          3/1/2026  12:59 AM                dist                                                                 
d----l          5/5/2026   8:07 AM                docs                                                                 
d----l          4/3/2026   7:15 PM                node_modules                                                         
d----l          2/5/2026  10:56 PM                reports                                                              
d----l          5/8/2026  10:38 AM                scripts                                                              
d----l          3/8/2026  10:39 AM                src                                                                  
d----l         5/11/2026   4:11 AM                tests                                                                
d----l         3/19/2026   5:21 AM                ~                                                                    
-a---l         3/13/2026   6:29 AM            401 .gitignore                                                           
-a---l         5/10/2026  10:19 PM          86516 bun.lock                                                             
-a---l         1/27/2026  12:53 PM            235 bunfig.toml                                                          
-a---l         2/25/2026   9:14 PM           7232 CLAUDE.md                                                            
-a---l         2/25/2026   9:13 PM           2109 MIGRATION.md                                                         
-a---l         5/10/2026  10:19 PM           2548 package.json                                                         
-a---l          5/8/2026   8:19 PM           6357 README.md                                                            
-a---l          2/5/2026   9:58 PM           1866 stryker.config.js                                                    
-a---l          2/5/2026   7:12 PM             27 test-corrupt.db                                                      
-a---l         2/28/2026  11:26 PM             32 TO-DOS.md                                                            
-a---l         1/27/2026  12:48 PM            727 tsconfig.json                                                        
-a---l          3/1/2026  12:57 AM            573 tsconfig.lib.json                                                    
-a---l          2/5/2026   9:21 PM           1063 vitest.config.ts                                                     


    Directory: C:\Projects\memory-nexus\docs


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
d----l         5/11/2026   1:57 PM                audits                                                               
d----l         5/12/2026   7:12 AM                inbox                                                                
d----l          3/7/2026   9:09 PM                plans                                                                
-a---l         1/25/2026   3:06 PM          10110 01-VISION.md                                                         
-a---l         1/25/2026   6:09 PM          12201 02-RESEARCH.md                                                       
-a---l         1/25/2026   3:05 PM           5261 03-DECISION-JOURNEY.md                                               
-a---l         1/25/2026   6:10 PM          23944 04-ARCHITECTURE.md                                                   
-a---l         1/25/2026   6:11 PM          33442 05-IMPLEMENTATION.md                                                 
-a---l          3/8/2026   3:30 AM           6607 agent-write-protocol.md                                              
-a---l         1/31/2026  12:59 AM           7981 HOOKS.md                                                             
-a---l         1/25/2026   3:15 PM           1396 SCRATCHPAD.md                                                        


    Directory: C:\Projects\memory-nexus\docs\inbox


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
d----l         5/11/2026   5:37 AM                archived                                                             
-a----         5/11/2026   1:43 PM          12926 2026-05-08-conversations-first-principles-architecture-audit.md      
-a----         5/11/2026   5:27 AM           3870 2026-05-11-memory-nexus-bun-windows-full-suite-crash.md              
-a----         5/11/2026   5:27 AM           3501 2026-05-11-memory-nexus-friction-test-phase-30-orphan.md             
-a----         5/11/2026   5:26 AM           5030 2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md        
-a----         5/12/2026   7:12 AM           5573 2026-05-12-conversations-friction-list-durable-filters.md            
-a----          5/8/2026  11:20 AM           1714 README.md                                                            



[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[35m[3mcodex[0m[0m
I confirmed the repo has no `docs/development.md` or `CONTRIBUTING.md`; the existing durable docs are numbered product/architecture/implementation docs plus `docs/HOOKS.md`, `docs/agent-write-protocol.md`, and inbox docs. I’m reading the inbox protocol and the specific files now so the critique is grounded in current conventions, not the plan’s assumptions.
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md -TotalCount 160"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md -TotalCount 120"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\README.md"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md -TotalCount 180"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\2026-05-12-conversations-friction-list-durable-filters.md -TotalCount 180"[0m in C:\Projects\memory-nexus
[31m exited 124 in 20306ms:[0m
[31m exited 124 in 20867ms:[0m
[31m exited 124 in 20287ms:[0m
[2m2026-05-13T07:16:08.642205Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 124
Wall time: 20.3 seconds
Output:
command timed out after 20306 milliseconds

[2m2026-05-13T07:16:08.661930Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 124
Wall time: 20.9 seconds
Output:
command timed out after 20867 milliseconds

[2m2026-05-13T07:16:08.773266Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 124
Wall time: 20.3 seconds
Output:
command timed out after 20287 milliseconds

[31m exited 124 in 20958ms:[0m
[31m exited 124 in 21129ms:[0m
---
schema_version: "1.2"
source_project: memory-nexus
created: 2026-05-11
type: bug
severity: medium
fix_status: none
affects_scope: this-project-only
status: open
workaround_applied: run tests by subdirectory (bun test src/infrastructure/, src/presentation/, etc.) instead of bare `bun test`
---

# `bun test` (full suite) crashes on Windows with integer overflow

## Symptom

Running the full test suite on Windows produces:

```
RSS: 3.20GB | Peak: 6.80GB | Commit: 4.44GB | Faults: 5965445 | Machine: 16.51GB

panic(main thread): integer overflow
oh no: Bun has crashed. This indicates a bug in Bun, not your code.

To send a redacted crash report to Bun's team,
please file a GitHub issue using the link below:

 https://bun.report/1.3.5/wt11e86cebijGukggCw2gkRsmx3M6lsqHsosvRynmwN2/72mB6t3oFu5o6FuvbgjMopvizDCYKERNEL32.DLLu10LCSntdll.dll4nhBA0eNrLzCtJTU8tUsgvSy1Ky8kvBwA2xQaD
```

The crash signature is identical across multiple attempts: integer overflow after Bun's memory grows past ~6.8GB peak. Stack: `KERNEL32.DLL` â†’ `ntdll.dll`.

Bun version: 1.3.5.
OS: Windows 11 Pro 10.0.26200, 16GB RAM.

## Repro

```bash
cd ~/Projects/memory-nexus
bun test
```

Crashes consistently after running thousands of tests successfully.

## Root cause

Likely a Bun-on-Windows runtime bug â€” memory pressure from accumulating test coverage data, repeated module loads, and SQLite bindings exceeds an internal counter capacity. The integer overflow + KERNEL32 stack signature points to Bun's internals, not to test logic.

Evidence the test code is fine:
- Running by subdirectory works cleanly: `bun test src/infrastructure/` (1249 pass), `bun test src/presentation/` (1040 pass), `bun test src/application src/domain` (802 pass), `bun test tests/` (subset-by-subset passes).
- Total pass count across all subsets: 3091+ tests.
- The crash always happens at memory pressure, not on a specific test.

## Proposed fix

No fix on the project side. Two paths:

**A. Wait for upstream Bun fix.** Track Bun changelog for memory/integer-overflow fixes. Bug seems likely to surface for any large Bun test suite on Windows; should attract upstream attention.

**B. Report upstream.** File a Bun GitHub issue with:
- The crash report URL above
- Repo size + test count
- Confirmation that splitting the suite by subdirectory works
- Bun version + Windows version

The bun.report URL above appears to be a redacted report builder â€” opening it should produce a draft GitHub issue body. We may need to confirm the URL is still active.

## Test plan

N/A â€” there's no project-side change to test. Workaround verification: confirm `bun test src/...` and `bun test tests/<subdir>/` continue to pass.

## Suggested CHANGELOG entry

N/A â€” workaround only, no code change. If we document the workaround, add to CONTRIBUTING.md or docs/development.md:

```
## Running tests

`bun test` is known to crash on Windows during full-suite runs due to a
Bun runtime memory issue (#<inbox-ref>). Workaround: run by subdirectory:

    bun test src/infrastructure/
    bun test src/presentation/
    bun test src/application src/domain

[2m2026-05-13T07:16:09.045358Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 124
Wall time: 21 seconds
Output:
command timed out after 20958 milliseconds

[2m2026-05-13T07:16:09.129539Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 124
Wall time: 21.1 seconds
Output:
command timed out after 21129 milliseconds
---
schema_version: "1.2"
source_project: memory-nexus
created: 2026-05-11
type: bug
severity: medium
fix_status: none
affects_scope: this-project-only
status: open
workaround_applied: run tests by subdirectory (bun test src/infrastructure/, src/presentation/, etc.) instead of bare `bun test`
---

# `bun test` (full suite) crashes on Windows with integer overflow

## Symptom

Running the full test suite on Windows produces:

```
RSS: 3.20GB | Peak: 6.80GB | Commit: 4.44GB | Faults: 5965445 | Machine: 16.51GB

panic(main thread): integer overflow
oh no: Bun has crashed. This indicates a bug in Bun, not your code.

To send a redacted crash report to Bun's team,
please file a GitHub issue using the link below:

 https://bun.report/1.3.5/wt11e86cebijGukggCw2gkRsmx3M6lsqHsosvRynmwN2/72mB6t3oFu5o6FuvbgjMopvizDCYKERNEL32.DLLu10LCSntdll.dll4nhBA0eNrLzCtJTU8tUsgvSy1Ky8kvBwA2xQaD
```

The crash signature is identical across multiple attempts: integer overflow after Bun's memory grows past ~6.8GB peak. Stack: `KERNEL32.DLL` â†’ `ntdll.dll`.

Bun version: 1.3.5.
OS: Windows 11 Pro 10.0.26200, 16GB RAM.

## Repro

```bash
cd ~/Projects/memory-nexus
bun test
```

Crashes consistently after running thousands of tests successfully.

## Root cause

Likely a Bun-on-Windows runtime bug â€” memory pressure from accumulating test coverage data, repeated module loads, and SQLite bindings exceeds an internal counter capacity. The integer overflow + KERNEL32 stack signature points to Bun's internals, not to test logic.

Evidence the test code is fine:
- Running by subdirectory works cleanly: `bun test src/infrastructure/` (1249 pass), `bun test src/presentation/` (1040 pass), `bun test src/application src/domain` (802 pass), `bun test tests/` (subset-by-subset passes).
- Total pass count across all subsets: 3091+ tests.
- The crash always happens at memory pressure, not on a specific test.

## Proposed fix

No fix on the project side. Two paths:

**A. Wait for upstream Bun fix.** Track Bun changelog for memory/integer-overflow fixes. Bug seems likely to surface for any large Bun test suite on Windows; should attract upstream attention.

**B. Report upstream.** File a Bun GitHub issue with:
- The crash report URL above
- Repo size + test count
- Confirmation that splitting the suite by subdirectory works
- Bun version + Windows version

The bun.report URL above appears to be a redacted report builder â€” opening it should produce a draft GitHub issue body. We may need to confirm the URL is still active.

## Test plan

N/A â€” there's no project-side change to test. Workaround verification: confirm `bun test src/...` and `bun test tests/<subdir>/` continue to pass.

## Suggested CHANGELOG entry

N/A â€” workaround only, no code change. If we document the workaround, add to CONTRIBUTING.md or docs/development.md:

```
## Running tests

`bun test` is known to crash on Windows during full-suite runs due to a
Bun runtime memory issue (#<inbox-ref>). Workaround: run by subdirectory:

    bun test src/infrastructure/
    bun test src/presentation/
    bun test src/application src/domain

[35m[3mcodex[0m[0m
The first read hit iCloud/PowerShell latency, but it did surface a useful problem: the existing Bun crash inbox file already contains mojibake in the arrow text, so any doc work should avoid propagating that encoding damage. I’m switching to targeted `rg`/short reads.
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "''^(#|##|status:|closure_notify_to:|execution_blocked_on:|fix_status:|workaround|Proposed|Suggested|## )" docs'"\\inbox\\README.md docs\\inbox\\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md docs\\inbox\\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md docs\\inbox\\2026-05-12-conversations-friction-list-durable-filters.md"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"describe\\(|test\\(|it\\(|--tool|auto|seen|unseen|markReviewed|executeFrictionCommand|from .*friction\" tests\\presentation\\cli\\commands\\friction.test.ts src\\presentation\\cli\\commands\\friction -g \"*.test.ts\" -g \"*.ts\""[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"programmatic|execute.*Command\\(|healthOverrides|dbPath|testDbPath\" tests src -g \"*programmatic-api.test.ts\" -g \"*.test.ts\""[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Stage 0|Stage 1|Stage 3|Outcome|truth|minimum structure|hybrid|projection|event\" docs\\audits\\2026-05-11-architecture-first-principles-audit.md"[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content C:'"\\Users\\Destiny\\.codex\\memories\\MEMORY.md | ForEach-Object { "'$i++; if ($i -ge 157 -and $i -le 190) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[32m succeeded in 12594ms:[0m
3:**Status:** in-progress (phase-level plan revised post codex review #1; ready for Stage 0)
32:| Outcome | Meaning |
52:| 1 | Stage 0 missing — derivation order let CLI surface frame the audit | §3 Execution stages + §3.0 Stage 0 deliverable |
63:The original plan let memory-nexus's command surface and adjacent systems' designs anchor the audit before any truths were derived. Revised order inverts this:
67:| **Stage 0** | Derive PROVISIONAL irreducible truths + provisional minimum structure from user worry + general agent-memory requirements ONLY. No memory-nexus inspection, no adjacent-system research yet. | Main session | Lowest — no incumbent or external bias |
68:| **Stage 1a** | Memory-nexus CLI surface verification (4 parallel subagents A-D, §6.1-6.4) — evaluate against Stage 0 truths | Subagents | Bounded — subagents see Stage 0 truths as lens |
69:| **Stage 1b** | Architecture-evidence pass (§6.5) — storage model, taxonomy, capture-to-retrieval flow, consolidation/supersedence/deletion/export, AI-readability, cross-project/machine boundaries, doc/code/roadmap drift. **Produces evidence map, NOT verdict.** | 5th subagent OR main session | Bounded — separate from command surface |
70:| **Stage 2** | Adjacent-system research (Hermes / OpenClaw / Mem0 / MemPalace). **Independent per-system summaries against Stage 0 truths.** No memory-nexus comparison inside per-system writeups. | Main session, with strict source citations | Independent of incumbent |
71:| **Stage 3** | Synthesis (§7): refine truths against accumulated evidence, fill comparison matrix, gap analysis, apply §9 thresholds, recommend | Main session | Mitigated by §8 evidence standards |
73:Provisional truths from Stage 0 are revised in Stage 3 ONLY when Stage 1/2 evidence disproves them. Each revision must cite the disproving evidence per §8 standards.
75:### 3.0 Stage 0 deliverable (gate before any subagent spawn)
77:Before Stage 1, the main session writes a Stage 0 output as §16.0 in PART II containing:
79:1. **Provisional irreducible truths list (5-10 items)** — derived from §4.2 seed questions + user worry + general agent-memory requirements. NOT from memory-nexus inspection. NOT from adjacent-system research.
80:2. **Provisional minimum structure** — what minimum design satisfies those truths? At least 2-3 wildly different design candidates considered (event log / triple store / vector-only / hybrid / knowledge graph / spatial-graph / etc.) before settling.
81:3. **Anti-anchoring self-check (verbatim statement):** "These truths were derived without inspecting memory-nexus's schema, commands, or current code, and without reading Hermes/OpenClaw/Mem0/MemPalace docs. Stage 1 and Stage 2 evidence may revise them; the revision must cite the disproving evidence."
83:Stage 0 is the gate. Stage 1 cannot begin until §16.0 exists.
87:## 4. First-principles derivation framework (used by Stage 0)
94:2. Derive irreducible truths about what an agent-memory system MUST do, independent of memory-nexus's current shape.
95:3. Derive minimum structure satisfying those truths.
103:These seed §16's "Irreducible truths" output. They prompt thinking; they're not the answer. The actual derivation must derive its OWN list of truths; these just make sure obvious axes aren't missed.
110:- **What's the schema-evolution story?** (Migrations required? Schema-on-read? Append-only events?)
118:When deriving truths, the deriver MUST NOT:
119:- Reach for "memory-nexus does X, so X must be a truth"
152:1. Evaluates the system against the Stage 0 provisional truths (§16.0)
161:## 6. Memory-nexus verification (Stage 1a + 1b)
175:**Stage 0 lens:** the brief will include the Stage 0 provisional truths (§16.0). The subagent evaluates the friction subsystem against those truths — does the subsystem help satisfy them, ignore them, or actively work against them?
183:Same verbatim brief blocks as 6.1. Stage 0 lens applies.
191:Same verbatim brief blocks as 6.1. Stage 0 lens applies.
199:Same verbatim brief blocks as 6.1. Stage 0 lens applies.
213:| **Storage model + source of truth** | What's canonical for each kind of memory? DB? JSONL? Both? Where do schema-enforced facts live vs free-form notes? |
221:**Owner:** main session OR 5th subagent in parallel with A-D, depending on session budget at Stage 1 start.
227:## 7. Synthesis methodology (Stage 3)
229:After Stage 1 (subagents A-D + architecture-evidence pass) and Stage 2 (adjacent-system summaries) return:
231:### 7.1 Refine truths
234:- Stage 0 provisional truths (§16.0)
239:Revise the truth set ONLY where evidence disproves a provisional truth. Each revision cites the disproving evidence. Lock the refined truths as §16.
243:For each truth in §16, fill a row in §17 across: Hermes / OpenClaw / Mem0 / MemPalace / memory-nexus / derived min-structure. Cell evidence per §8.
247:For each truth where memory-nexus differs from the derived min-structure OR from adjacent best practices, document the gap in §18:
283:| If gap analysis shows... | Outcome |
289:| Structurally wrong; an adjacent system fits truths better; rewrite-cost ≤ migrate-cost | **E** Deprecate / replace |
295:1. **High-severity truth gaps:** How many truths in §16 are seriously violated by memory-nexus? If >50% of truths have high-severity gaps → outcome shifts away from A toward C/E.
299:5. **v4.0 publishing risk:** Would shipping Phase 37 (npm publish v4.0) cement a wrong source of truth that's hard to undo? If yes → D (freeze) is wrong; A/B/E ship first.
309:The user's framing — "lots of similar but different solutions, none exact fit" — suggests **fragmentation**, not under-investment. That points toward **Outcome C (surgical consolidation)** as the most-likely best fit. Outcome E (deprecate/replace) is possible if consolidation cost approaches rewrite cost. Outcome B (federation) is risky because federation across already-fragmented surfaces compounds the worry.
338:| Audit doc itself | `in-progress (phase-level plan revised post codex review #1; ready for Stage 0)` | Codex review #1 integrated; Stage 0 is the next action. |
351:- **§3 + §3.0 NEW:** Stage 0 (provisional truths) runs BEFORE any subagent or adjacent research.
359:## 14. Subagent outputs (Stage 1a)
368:## 14.5 Architecture-evidence map (Stage 1b)
370:*[To be filled after Stage 1b. Per §6.5.]*
381:## 16. Irreducible truths
383:### 16.0 Stage 0 provisional truths (GATE for Stage 1)
389:> These truths were derived without inspecting memory-nexus's schema, commands, or current code, and without reading Hermes/OpenClaw/Mem0/MemPalace docs. Stage 1 and Stage 2 evidence may revise them; the revision must cite the disproving evidence.
395:Before settling on the provisional minimum structure, I considered five wildly different designs:
399:| 1 | **Append-only event log** | JSONL files, date-prefixed | grep/scan | one corrupt line skipped | degrades >100k entries |
403:| 5 | **Hybrid: event log SSOT + derived projection** | Append-only files (canonical) + DB/index (derived) | Read projection, write events | event corruption catastrophic; projection rebuildable | projections handle scale |
407:#### 16.0.3 Provisional irreducible truths (8 items, derived independently)
428:If the tool dies, breaks, or is uninstalled, the user's accumulated knowledge must remain readable WITHOUT the tool. Either plain text (event log / JSONL / markdown) or a standardized exchange format (export-on-write, or scheduled snapshot). The user must not be locked in.
433:#### 16.0.4 Constraints (qualities the system must have, distinct from truths)
441:#### 16.0.5 Provisional minimum structure
445:- **Candidate 1 (append-only event log alone):** fails T1 (no typed queries without parser), T2 (no semantic recall), T6 (scale degrades), T8 (no reconciliation primitive).
449:- **Candidate 5 (hybrid event log + projection):** satisfies T1 (event types), T2 (projection includes vector index), T3 (project scope in event metadata), T4 (supersedence as event type), T5 (orthogonal to integration layer), T6 (projection scales), T7 (event log is the recovery layer), T8 (reconciliation as projection-build operation).
451:**Provisional minimum structure: Hybrid event-log SSOT + derived projection.**
453:- **Canonical layer:** append-only event log. Plain text (JSONL or similar). Each event has: type (decision / learning / preference / friction / observation / supersedence), project scope, timestamp, content, optional reference to prior event(s) it modifies.
454:- **Projection layer:** structured DB + vector index, rebuildable from event log on demand. Used for typed queries (T1), fast retrieval (T6), semantic recall (T2), dedup (T8). Projection corruption is non-catastrophic (rebuild).
455:- **Integration layer:** hooks that fire on session events, triggering auto-capture from session content AND ambient retrieval that surfaces relevant memory before the agent's own queries. (T5.)
456:- **Scope model:** project IS a first-class event field. Cross-project queries are projection-level operations (filter / rollup). (T3.)
457:- **Lifecycle:** supersedence is an event type, not a record-edit. Old facts remain in the event log; the projection's "current" view excludes superseded ones. (T4 + T7.)
459:This structure is provisional. Stage 1/2 evidence may surface load-bearing properties not captured here, or may show that T1-T8 are wrong or incomplete. Revisions in Stage 3 must cite the disproving evidence per §8.
467:- Schema layer (per-event-type tables vs event-sourcing-replay vs JSON columns)
468:- Process model (CLI vs daemon vs library vs MCP server vs hybrid)
473:#### 16.0.7 Stage 1 spawn gate cleared
475:Stage 0 deliverable complete:
476:- ✅ Provisional truths (T1-T8) — 8 items
478:- ✅ Provisional minimum structure (hybrid event log + projection + integration)
482:Stage 1 (CLI subagents A-D + architecture-evidence pass) is now spawnable per §3 execution table.
484:### 16. Refined truths (after Stage 3)
492:For each refined truth in §16:

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 12616ms:[0m
tests\integration\programmatic-api.test.ts:4: * Verifies that all execute*Command functions can be called programmatically
tests\integration\programmatic-api.test.ts:89:      const result = await executeSyncCommand(options);
tests\integration\programmatic-api.test.ts:96:      const result = await executeSyncCommand(options);
tests\integration\programmatic-api.test.ts:102:      const result = await executeSyncCommand({ dryRun: true, quiet: true });
tests\integration\programmatic-api.test.ts:110:      const result = await executeSearchCommand("nonexistent-term-xyz-9999", options);
tests\integration\programmatic-api.test.ts:116:      const result = await executeSearchCommand("test", options);
tests\integration\programmatic-api.test.ts:123:      const result = await executeSearchCommand("test", options);
tests\integration\programmatic-api.test.ts:130:      const result = await executeSearchCommand("test", options);
tests\integration\programmatic-api.test.ts:139:      const result = await executeListCommand(options);
tests\integration\programmatic-api.test.ts:145:      const result = await executeListCommand(options);
tests\integration\programmatic-api.test.ts:152:      const result = await executeListCommand(options);
tests\integration\programmatic-api.test.ts:161:      const result = await executeStatsCommand(options);
tests\integration\programmatic-api.test.ts:167:      const result = await executeStatsCommand(options);
tests\integration\programmatic-api.test.ts:173:      const result = await executeStatsCommand(options);
tests\integration\programmatic-api.test.ts:182:      const result = await executeContextCommand("nonexistent-project-xyz", options);
tests\integration\programmatic-api.test.ts:188:      const result = await executeContextCommand("memory", options);
tests\integration\programmatic-api.test.ts:195:      const result = await executeContextCommand("memory", options);
tests\integration\programmatic-api.test.ts:204:      const result = await executeRelatedCommand("session-1", options);
tests\integration\programmatic-api.test.ts:211:      const result = await executeRelatedCommand("session-1", options);
tests\integration\programmatic-api.test.ts:217:      const result = await executeRelatedCommand("nonexistent-session-id", options);
tests\integration\programmatic-api.test.ts:225:      const result = await executeShowCommand("session-1", options);
tests\integration\programmatic-api.test.ts:231:      const result = await executeShowCommand("session-1", options);
tests\integration\programmatic-api.test.ts:237:      const result = await executeShowCommand("nonexistent-session-id", options);
tests\integration\programmatic-api.test.ts:246:      const result = await executeBrowseCommand(options);
tests\integration\programmatic-api.test.ts:254:      const result = await executeBrowseCommand({});
tests\integration\programmatic-api.test.ts:262:      const result = await executeInstallCommand(options);
tests\integration\programmatic-api.test.ts:267:      const result = await executeInstallCommand({});
tests\integration\programmatic-api.test.ts:275:      const result = await executeUninstallCommand(options);
tests\integration\programmatic-api.test.ts:280:      const result = await executeUninstallCommand({});
tests\integration\programmatic-api.test.ts:292:      const result = await executePurgeCommand(options);
tests\integration\programmatic-api.test.ts:304:      const result = await executePurgeCommand(options);
tests\integration\programmatic-api.test.ts:310:      const result = await executePurgeCommand({
tests\integration\programmatic-api.test.ts:322:      const result = await executeExportCommand(exportPath(), options);
tests\integration\programmatic-api.test.ts:333:      const result = await executeExportCommand(exportPath(), { quiet: true });
tests\integration\programmatic-api.test.ts:341:      const result = await executeImportCommand(exportPath(), options);
tests\integration\programmatic-api.test.ts:348:      const result = await executeImportCommand("nonexistent-file-xyz.json", options);
tests\integration\programmatic-api.test.ts:354:      const result = await executeImportCommand(exportPath(), { quiet: true, force: true });
tests\integration\programmatic-api.test.ts:362:      const result = await executeDoctorCommand(options);
tests\integration\programmatic-api.test.ts:371:      const result = await executeDoctorCommand(options);
tests\integration\programmatic-api.test.ts:376:      const result = await executeDoctorCommand({});
tests\integration\programmatic-api.test.ts:383:      const result = await executeStatusCommand({});
tests\integration\programmatic-api.test.ts:388:      const result = await executeStatusCommand({ json: true });
tests\integration\programmatic-api.test.ts:395:      const result = executeCompletionCommand("bash");
tests\integration\programmatic-api.test.ts:460:        await executeSyncCommand({ dryRun: true, quiet: true }),
tests\integration\programmatic-api.test.ts:461:        await executeSearchCommand("test", { quiet: true }),
tests\integration\programmatic-api.test.ts:462:        await executeListCommand({ quiet: true }),
tests\integration\programmatic-api.test.ts:463:        await executeStatsCommand({ quiet: true }),
tests\integration\programmatic-api.test.ts:464:        await executeContextCommand("test", { quiet: true }),
tests\integration\programmatic-api.test.ts:465:        await executeDoctorCommand({}),
tests\integration\programmatic-api.test.ts:466:        executeCompletionCommand("bash"),
tests\integration\programmatic-api.test.ts:479:      await executeSyncCommand({ dryRun: true, quiet: true });
tests\integration\programmatic-api.test.ts:482:      await executeListCommand({ quiet: true });
tests\integration\programmatic-api.test.ts:485:      executeCompletionCommand("bash");
tests\integration\concurrent-commands.test.ts:101:  let dbPath: string;
tests\integration\concurrent-commands.test.ts:113:    dbPath = join(testDir, "test.db");
tests\integration\concurrent-commands.test.ts:150:    const db = new Database(dbPath, { create: true });
tests\integration\concurrent-commands.test.ts:222:    const db = new Database(dbPath, { create: true });
tests\integration\concurrent-commands.test.ts:288:    const db = new Database(dbPath, { create: true });
tests\integration\concurrent-commands.test.ts:382:    const db = new Database(dbPath, { create: true });
tests\integration\concurrent-commands.test.ts:444:    const db = new Database(dbPath, { create: true });
tests\presentation\cli\commands\friction.test.ts:67:    let dbPath: string;
tests\presentation\cli\commands\friction.test.ts:73:        dbPath = path.join(fs.mkdtempSync(path.join(tmp, "friction-cli-")), "test.db");
tests\presentation\cli\commands\friction.test.ts:74:        const result = initializeDatabase({ path: dbPath });
tests\presentation\cli\commands\friction.test.ts:90:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:92:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:112:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:115:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:123:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:132:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:148:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:151:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:159:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:166:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:181:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:183:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:191:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:207:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:209:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:216:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:229:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:232:            await executeFrictionCommand({ action: "log", description: "item 1", tool: "aidev", severity: "high" });
tests\presentation\cli\commands\friction.test.ts:233:            await executeFrictionCommand({ action: "log", description: "item 2", tool: "aidev", severity: "medium" });
tests\presentation\cli\commands\friction.test.ts:234:            await executeFrictionCommand({ action: "log", description: "item 3", tool: "aidev", severity: "medium" });
tests\presentation\cli\commands\friction.test.ts:237:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:253:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:255:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:262:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:283:            const spy = spyOn(dbModule, "getDefaultDbPath").mockReturnValue(dbPath);
tests\presentation\cli\commands\friction.test.ts:299:                await executeFrictionCommand({
src\application\services\sync-service.integration.test.ts:503:      const dbPath = join(tempDir, "test.db");
src\application\services\sync-service.integration.test.ts:504:      const result = initializeDatabase({ path: dbPath });
src\presentation\cli\db-startup.test.ts:30:function cleanupTempDb(dbPath: string): void {
src\presentation\cli\db-startup.test.ts:31:  const dir = dirname(dbPath);
src\presentation\cli\db-startup.test.ts:82:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:83:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:85:      const result = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:94:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:95:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:98:      const result1 = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:105:      const result2 = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:113:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:114:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:117:      writeFileSync(dbPath, "not a valid sqlite database");
src\presentation\cli\db-startup.test.ts:126:        const result = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:143:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:144:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:147:      writeFileSync(dbPath, "corrupted data");
src\presentation\cli\db-startup.test.ts:156:        const result = await initializeDatabaseForCli({ dbPath, json: true });
src\presentation\cli\db-startup.test.ts:174:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:175:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:178:      const result1 = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:184:      const result2 = await initializeDatabaseForCli({ dbPath, skipCheck: true });
src\presentation\cli\db-startup.test.ts:198:        dbPath: invalidPath,
src\presentation\cli\db-startup.test.ts:208:    test("respects custom dbPath option", async () => {
src\presentation\cli\db-startup.test.ts:209:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:210:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:212:      const result = await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:216:      expect(existsSync(dbPath)).toBe(true);
src\presentation\cli\db-startup.test.ts:229:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:230:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:232:      writeFileSync(dbPath, "corrupt");
src\presentation\cli\db-startup.test.ts:241:        await initializeDatabaseForCli({ dbPath });
src\presentation\cli\db-startup.test.ts:254:      const dbPath = createTempDbPath();
src\presentation\cli\db-startup.test.ts:255:      tempPaths.push(dbPath);
src\presentation\cli\db-startup.test.ts:257:      writeFileSync(dbPath, "corrupt");
src\presentation\cli\db-startup.test.ts:266:        await initializeDatabaseForCli({ dbPath });
src\infrastructure\database\integration.test.ts:670:    let dbPath: string;
src\infrastructure\database\integration.test.ts:675:        dbPath = join(tmpdir(), `memory-nexus-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
src\infrastructure\database\integration.test.ts:676:        walPath = `${dbPath}-wal`;
src\infrastructure\database\integration.test.ts:678:        const result = initializeDatabase({ path: dbPath });
src\infrastructure\database\integration.test.ts:693:            if (existsSync(dbPath)) unlinkSync(dbPath);
src\infrastructure\database\integration.test.ts:695:            if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
src\infrastructure\paths.test.ts:115:            const dbPath = getDbPath();
src\infrastructure\paths.test.ts:116:            expect(dbPath).toBe(join(getDataDir(), "memory.db"));
src\infrastructure\database\health-checker.test.ts:28:    const testDbPath = join(testDir, "test.db");
src\infrastructure\database\health-checker.test.ts:63:            const dbPath = join(testDir, "integrity-test.db");
src\infrastructure\database\health-checker.test.ts:64:            const { db } = initializeDatabase({ path: dbPath });
src\infrastructure\database\health-checker.test.ts:99:            const dbPath = join(testDir, "speed-test.db");
src\infrastructure\database\health-checker.test.ts:100:            const { db } = initializeDatabase({ path: dbPath });
src\infrastructure\database\health-checker.test.ts:326:            const { db } = initializeDatabase({ path: testDbPath });
src\infrastructure\database\health-checker.test.ts:331:            dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:362:                dbPath: join(testDir, "nonexistent.db"),
src\infrastructure\database\health-checker.test.ts:377:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:390:                dbPath: testDbPath,
src\infrastructure\database\health-checker.test.ts:404:                dbPath: testDbPath,
src\infrastructure\database\connection.test.ts:35:function cleanupTempDb(dbPath: string): void {
src\infrastructure\database\connection.test.ts:36:    const dir = dirname(dbPath);
src\infrastructure\database\connection.test.ts:80:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:81:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:84:                path: dbPath,
src\infrastructure\database\connection.test.ts:161:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:162:            const nestedPath = join(dirname(dbPath), "nested", "deep", "test.db");
src\infrastructure\database\connection.test.ts:163:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:178:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:179:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:182:                path: dbPath,
src\infrastructure\database\connection.test.ts:196:            const walPath = dbPath + "-wal";
src\infrastructure\database\connection.test.ts:208:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:209:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:212:                path: dbPath,
src\infrastructure\database\connection.test.ts:288:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:289:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:292:                path: dbPath,
src\infrastructure\database\connection.test.ts:303:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:304:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:308:                path: dbPath,
src\infrastructure\database\connection.test.ts:314:                path: dbPath,
src\infrastructure\database\connection.test.ts:337:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:338:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:342:                path: dbPath,
src\infrastructure\database\connection.test.ts:352:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:353:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:356:            writeFileSync(dbPath, "not a valid sqlite database file with garbage data");
src\infrastructure\database\connection.test.ts:361:                    path: dbPath,
src\infrastructure\database\connection.test.ts:370:                expect(mnError.context?.path).toBe(dbPath);
src\infrastructure\database\connection.test.ts:375:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:376:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:380:                path: dbPath,
src\infrastructure\database\connection.test.ts:386:                path: dbPath,
src\infrastructure\database\connection.test.ts:417:            const dbPath = createTempDbPath();
src\infrastructure\database\connection.test.ts:418:            tempPaths.push(dbPath);
src\infrastructure\database\connection.test.ts:421:            writeFileSync(dbPath, "corrupted data that is definitely not sqlite");
src\infrastructure\database\connection.test.ts:425:                    path: dbPath,
src\presentation\cli\commands\browse.test.ts:88:  let dbPath: string;
src\presentation\cli\commands\browse.test.ts:94:      dbPath,
src\presentation\cli\commands\browse.test.ts:139:    dbPath = join(tempDir, "test.db");
src\presentation\cli\commands\browse.test.ts:142:    const result = initializeDatabase({ path: dbPath });
src\presentation\cli\commands\browse.test.ts:180:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:196:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:211:    await executeBrowseCommand({ limit: "50" }, deps());
src\presentation\cli\commands\browse.test.ts:223:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:236:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:249:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:263:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:278:    const { db: db2 } = initializeDatabase({ path: dbPath });
src\presentation\cli\commands\browse.test.ts:283:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:293:    await executeBrowseCommand({ limit: "100" }, deps());
src\presentation\cli\commands\browse.test.ts:305:    const result = await executeBrowseCommand({}, deps());
src\presentation\cli\commands\context.test.ts:211:  let dbPath: string;
src\presentation\cli\commands\context.test.ts:217:    dbPath = join(tempDir, "test.db");
src\presentation\cli\commands\context.test.ts:218:    const { db } = initializeDatabase({ path: dbPath });
src\presentation\cli\commands\context.test.ts:229:    const result = await executeContextCommand("nonexistent-project-xyz", { dbPath });
src\presentation\cli\commands\context.test.ts:236:    const result = await executeContextCommand("nonexistent-project", { dbPath });
src\presentation\cli\commands\context.test.ts:242:    const result = await executeContextCommand("nonexistent-project", { json: true, dbPath });
src\presentation\cli\commands\context.test.ts:250:    const result = await executeContextCommand("nonexistent-project-xyz", { format: "ai", dbPath });
src\presentation\cli\commands\context.test.ts:257:    const result = await executeContextCommand("nonexistent-project-xyz", { budget: 1500, dbPath });
src\presentation\cli\commands\context.test.ts:264:    const result = await executeContextCommand("nonexistent-project-xyz", { crossProject: true, dbPath });
src\presentation\cli\commands\context.test.ts:271:    const result = await executeContextCommand("nonexistent-project-xyz", { format: "brief", dbPath });
src\presentation\cli\commands\context.test.ts:279:    const result = await executeContextCommand("nonexistent-project-xyz", { format: "detailed", dbPath });
src\presentation\cli\commands\backfill.test.ts:6: * programmatic API with mocked BackfillService.
src\presentation\cli\commands\backfill.test.ts:86:      const result = await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:108:      const result = await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:141:      const result = await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:165:      await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:181:      await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:205:      await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:227:      const result = await executeBackfillCommand(
src\presentation\cli\commands\backfill.test.ts:248:      await executeBackfillCommand(
src\presentation\cli\commands\completion.test.ts:243:            const result = executeCompletionCommand("bash");
src\presentation\cli\commands\completion.test.ts:251:            const result = executeCompletionCommand("zsh");
src\presentation\cli\commands\completion.test.ts:259:            const result = executeCompletionCommand("fish");
src\presentation\cli\commands\completion.test.ts:267:            const result = executeCompletionCommand("invalid");
src\presentation\cli\commands\completion.test.ts:277:            const result = executeCompletionCommand("");
src\presentation\cli\commands\related.test.ts:218:  let dbPath: string;
src\presentation\cli\commands\related.test.ts:224:    dbPath = join(tempDir, "test.db");
src\presentation\cli\commands\related.test.ts:225:    const { db } = initializeDatabase({ path: dbPath });
src\presentation\cli\commands\related.test.ts:236:    const result = await executeRelatedCommand("nonexistent-session-xyz", { dbPath });
src\presentation\cli\commands\related.test.ts:243:    const result = await executeRelatedCommand("nonexistent-session", { dbPath });
src\presentation\cli\commands\related.test.ts:249:    const result = await executeRelatedCommand("nonexistent-session", { json: true, dbPath });
src\presentation\cli\commands\list.test.ts:148:    const result = await executeListCommand({ limit: "invalid" });
src\presentation\cli\commands\list.test.ts:157:    const result = await executeListCommand({ limit: "-5" });
src\presentation\cli\commands\list.test.ts:166:    const result = await executeListCommand({ limit: "0" });
src\presentation\cli\commands\list.test.ts:175:    const result = await executeListCommand({ limit: "invalid", json: true });
src\presentation\cli\commands\list.test.ts:184:    const result = await executeListCommand({ limit: "-10" });
src\presentation\cli\commands\list.test.ts:247:    const result = await executeListCommand({ since: "not-a-real-date-at-all" });
src\presentation\cli\commands\list.test.ts:254:    const result = await executeListCommand({ before: "not-a-real-date-at-all" });
src\presentation\cli\commands\purge.test.ts:214:  let testDbPath: string;
src\presentation\cli\commands\purge.test.ts:219:    return { dbPath: testDbPath, askConfirmation };
src\presentation\cli\commands\purge.test.ts:250:    testDbPath = path.join(testDir, "memory.db");
src\presentation\cli\commands\purge.test.ts:253:    const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:290:      const result = await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:302:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:313:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:323:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:331:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:342:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:352:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:363:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:374:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:382:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:398:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:405:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:415:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:420:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:429:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:440:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:449:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:464:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:473:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:484:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:489:      const { db: db2 } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:498:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:508:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:517:      const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\purge.test.ts:528:      await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:541:      const result = await executePurgeCommand(options, deps());
src\presentation\cli\commands\purge.test.ts:553:      const result = await executePurgeCommand(options, deps());
src\presentation\cli\commands\doctor.test.ts:23:    const testDbPath = join(testDir, "test.db");
src\presentation\cli\commands\doctor.test.ts:35:    const healthOverrides = () => ({
src\presentation\cli\commands\doctor.test.ts:36:        dbPath: testDbPath,
src\presentation\cli\commands\doctor.test.ts:49:        const { db } = initializeDatabase({ path: testDbPath });
src\presentation\cli\commands\doctor.test.ts:361:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:378:            await executeDoctorCommand({}, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:391:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:406:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:422:            await executeDoctorCommand({ fix: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:656:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:671:            const result = await executeDoctorCommand({}, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:682:            const result = await executeDoctorCommand({}, {
src\presentation\cli\commands\doctor.test.ts:683:                healthOverrides: {
src\presentation\cli\commands\doctor.test.ts:684:                    dbPath: join(testDir, "nonexistent.db"),
src\presentation\cli\commands\doctor.test.ts:802:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\doctor.test.ts:934:            await executeDoctorCommand({ json: true }, { healthOverrides: healthOverrides() });
src\presentation\cli\commands\export.test.ts:89:      await executeExportCommand(outputPath);
src\presentation\cli\commands\export.test.ts:97:      await executeExportCommand(outputPath);
src\presentation\cli\commands\export.test.ts:106:      await executeExportCommand(outputPath, { quiet: true });
src\presentation\cli\commands\export.test.ts:116:      await executeExportCommand(outputPath, { json: true });
src\presentation\cli\commands\export.test.ts:129:      const result = await executeExportCommand(outputPath);
src\presentation\cli\commands\export.test.ts:142:      const result = await executeExportCommand(outputPath);
src\presentation\cli\commands\export.test.ts:151:      await executeExportCommand(outputPath);
src\presentation\cli\commands\export.test.ts:159:      await executeExportCommand(outputPath, { json: true });
src\presentation\cli\commands\uninstall.test.ts:67:            await executeUninstallCommand({}, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:86:            await executeUninstallCommand({}, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:105:            await executeUninstallCommand({}, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:126:            await executeUninstallCommand({ restore: true }, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:141:            await executeUninstallCommand({ restore: true }, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:171:            await executeUninstallCommand({}, { hookOverrides });
src\presentation\cli\commands\uninstall.test.ts:183:            await executeUninstallCommand({}, { hookOverrides });
src\presentation\cli\commands\install.test.ts:83:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:102:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:106:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:114:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:118:            await executeInstallCommand({ force: true }, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:131:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:147:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:156:            const result = await executeInstallCommand({}, {
src\presentation\cli\commands\install.test.ts:189:            await executeInstallCommand({ force: true }, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:199:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\install.test.ts:210:            await executeInstallCommand({}, { hookScriptSourceOverride: mockHookScriptPath, hookOverrides });
src\presentation\cli\commands\stats.test.ts:244:      const result = await executeStatsCommand({ projects: "invalid" });
src\presentation\cli\commands\stats.test.ts:253:      const result = await executeStatsCommand({ projects: "-5" });
src\presentation\cli\commands\stats.test.ts:262:      const result = await executeStatsCommand({ projects: "0" });
src\presentation\cli\commands\stats.test.ts:271:      const result = await executeStatsCommand({ projects: "invalid", json: true });
src\presentation\cli\commands\stats.test.ts:279:      const result = await executeStatsCommand({ projects: "-1" });
src\presentation\cli\commands\import.test.ts:131:      const result = await executeImportCommand(exportFilePath);
src\presentation\cli\commands\import.test.ts:146:      await executeImportCommand(exportFilePath);
src\presentation\cli\commands\import.test.ts:157:      const result = await executeImportCommand(invalidFile);
src\presentation\cli\commands\import.test.ts:164:      const result = await executeImportCommand("/nonexistent/file.json");
src\presentation\cli\commands\import.test.ts:181:      await executeImportCommand(exportFilePath, { clear: true });
src\presentation\cli\commands\import.test.ts:194:      await executeImportCommand(exportFilePath, { json: true });
src\presentation\cli\commands\import.test.ts:208:      await executeImportCommand(invalidFile, { json: true });
src\presentation\cli\commands\import.test.ts:225:      const result = await executeImportCommand(exportFilePath);
src\presentation\cli\commands\import.test.ts:241:      const result = await executeImportCommand(exportFilePath, { force: true });
src\presentation\cli\commands\import.test.ts:257:      await executeImportCommand(exportFilePath, { clear: true });
src\presentation\cli\commands\import.test.ts:263:      await executeImportCommand(exportFilePath);
src\presentation\cli\commands\search.test.ts:346:      const result = await executeSearchCommand("", {});
src\presentation\cli\commands\search.test.ts:353:      const result = await executeSearchCommand("   ", {});
src\presentation\cli\commands\search.test.ts:360:      const result = await executeSearchCommand("test", { limit: "invalid", dbPath: searchDbPath });
src\presentation\cli\commands\search.test.ts:367:      const result = await executeSearchCommand("test", { limit: "-5", dbPath: searchDbPath });
src\presentation\cli\commands\search.test.ts:374:      const result = await executeSearchCommand("test", { limit: "0", dbPath: searchDbPath });
src\presentation\cli\commands\search.test.ts:1009:      const result = await executeSearchCommand("", { json: true });
src\presentation\cli\commands\search.test.ts:1017:      const result = await executeSearchCommand("", {});
src\presentation\cli\commands\search.test.ts:1025:      const result = await executeSearchCommand("", { limit: "10" });
src\presentation\cli\commands\search.test.ts:1038:        const result = await executeSearchCommand("test", { limit: "-5", dbPath: errDbPath });
src\presentation\cli\commands\search.test.ts:1233:      const result = await executeSearchCommand("test query", { files: true });
src\presentation\cli\commands\search.test.ts:1249:      const result = await executeSearchCommand("test query", { files: true });
src\presentation\cli\commands\search.test.ts:1274:      const result = await executeSearchCommand("test query", { files: true });
src\presentation\cli\commands\search.test.ts:1304:      const result = await executeSearchCommand("test query", { files: true, format: "ai" });
src\presentation\cli\commands\search.test.ts:1326:      const result = await executeSearchCommand("test query", { files: true });
src\presentation\cli\commands\search.test.ts:1348:      const result = await executeSearchCommand("test query", { files: true });
src\presentation\cli\commands\search.test.ts:1361:      const result = await executeSearchCommand("", {});
src\presentation\cli\commands\search.test.ts:1380:      const result = await executeSearchCommand("test query", { files: true, json: true });
src\presentation\cli\commands\show.test.ts:177:      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:190:      await executeShowCommand(partialId, {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:199:      await executeShowCommand("nonexistent-session-id", {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:210:      await executeShowCommand(testSessionId, { json: true }, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:223:      await executeShowCommand(testSessionId, { tools: true }, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:236:      await executeShowCommand(testSessionId, { verbose: true }, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:247:      await executeShowCommand(testSessionId, { quiet: true }, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:261:      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:275:      await executeShowCommand(testSessionId, {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:306:      await executeShowCommand(partialId, {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:322:      const result = await executeShowCommand("nonexistent-session-xyz", {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:330:      const result = await executeShowCommand("nonexistent-session-xyz", { json: true }, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\show.test.ts:341:      const result = await executeShowCommand("nonexistent-id", {}, { dbPath: TEST_DB_PATH });
src\presentation\cli\commands\status.test.ts:50:    const testDbPath = join(testBaseDir, ".memory-nexus", "test.db");
src\presentation\cli\commands\status.test.ts:92:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:105:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:113:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:125:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:132:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:140:            const status = await gatherStatus({ dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:191:                const status = await gatherStatus({ dbPath: embeddingTestDb });
src\presentation\cli\commands\status.test.ts:331:            await executeStatusCommand({}, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:340:            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:356:            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\status.test.ts:443:            await executeStatusCommand({ json: true }, { dbPath: testDbPath, logPath: testLogPath, configPath: testConfigPath, hookOverrides });
src\presentation\cli\commands\friction\dashboard.test.ts:20:    let dbPath: string;
src\presentation\cli\commands\friction\dashboard.test.ts:27:        dbPath = join(tempDir, "test.db");
src\presentation\cli\commands\friction\dashboard.test.ts:29:        const { db } = initializeDatabase({ path: dbPath });
src\presentation\cli\commands\friction\dashboard.test.ts:35:        await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:41:        }, { dbPath });
src\presentation\cli\commands\friction\dashboard.test.ts:54:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:56:        }, { dbPath });
src\presentation\cli\commands\friction\dashboard.test.ts:68:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:71:        }, { dbPath });
src\presentation\cli\commands\friction\dashboard.test.ts:82:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:85:        }, { dbPath, openInBrowser: () => {} });
src\presentation\cli\commands\friction\list.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:33:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:43:        await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:49:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:39:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:47:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:26:        await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:35:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:48:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:59:        await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:68:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:82:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:91:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:26:        await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:35:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:48:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:58:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.test.ts:39:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.test.ts:57:        const result = await executeFrictionCommand({

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 13295ms:[0m
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:7:fix_status: none
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:9:status: open
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:12:# tests/presentation/cli/commands/friction.test.ts imports removed friction.js
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:14:## Symptom
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:24:## Repro
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:30:## Root cause
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:50:## Proposed fix
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:60:## Test plan
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:64:## Suggested commit message
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:87:## Risks / things to verify before merging
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:92:## Related
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:7:fix_status: none
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:9:status: open
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:10:workaround_applied: tests/integration/programmatic-api.test.ts is excluded from the test-isolation arc's "all green" claim; surfaced for separate triage
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:13:# programmatic-api.test.ts hits real user DB; 6 commands time out
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:15:## Symptom
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:42:## Repro
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:48:## Root cause
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:65:## Proposed fix
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:80:## Test plan
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:84:## Suggested commit message
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:97:## Risks / things to verify before merging
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:103:## Related
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:7:fix_status: none
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:9:status: open
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:11:closure_notify_to: conversations
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:15:# `memory friction list` — durable filter + count extensions
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:17:## Motivation
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:25:## What we'd need (if memory-nexus chooses to extend)
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:40:## API exit-code contract (if `--min` added)
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:57:## Hard requirements / open questions for memory-nexus to resolve
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:68:## Alternatives memory-nexus may prefer
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:74:## What NOT to do
docs\inbox\2026-05-12-conversations-friction-list-durable-filters.md:80:## Related
docs\inbox\README.md:1:# Inbox — Cross-Project Issues
docs\inbox\README.md:6:## What lives here
docs\inbox\README.md:15:## Triage
docs\inbox\README.md:32:## Conventions
docs\inbox\README.md:38:## Why this directory exists (not a rule restatement)

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 12926ms:[0m
tests\presentation\cli\commands\friction.test.ts:4: * Tests for --tool flag, auto-ingest, seen/unseen indicators,
tests\presentation\cli\commands\friction.test.ts:5: * and markReviewed integration in friction CLI commands.
tests\presentation\cli\commands\friction.test.ts:9:import { FrictionEntry } from "../../../../src/domain/entities/friction-entry.js";
tests\presentation\cli\commands\friction.test.ts:12:// We test executeFrictionCommand which creates its own service internally.
tests\presentation\cli\commands\friction.test.ts:24:    executeFrictionCommand,
tests\presentation\cli\commands\friction.test.ts:26:} from "../../../../src/presentation/cli/commands/friction.js";
tests\presentation\cli\commands\friction.test.ts:65:describe("friction CLI commands", () => {
tests\presentation\cli\commands\friction.test.ts:84:    describe("log subcommand --tool flag", () => {
tests\presentation\cli\commands\friction.test.ts:85:        it("passes tool to service when --tool provided", async () => {
tests\presentation\cli\commands\friction.test.ts:87:            // Since executeFrictionCommand calls getDefaultDbPath internally,
tests\presentation\cli\commands\friction.test.ts:92:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:109:    describe("list subcommand --tool flag", () => {
tests\presentation\cli\commands\friction.test.ts:110:        it("filters by tool when --tool provided", async () => {
tests\presentation\cli\commands\friction.test.ts:115:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:123:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:132:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:146:        it("calls markReviewed when --tool provided", async () => {
tests\presentation\cli\commands\friction.test.ts:151:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:159:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:166:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:173:            // After markReviewed, lastReviewedAt should be set
tests\presentation\cli\commands\friction.test.ts:179:        it("does NOT call markReviewed when --tool not provided", async () => {
tests\presentation\cli\commands\friction.test.ts:183:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:191:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:197:            // Without --tool, markReviewed not called, lastReviewedAt stays null
tests\presentation\cli\commands\friction.test.ts:204:    describe("list NEW indicator", () => {
tests\presentation\cli\commands\friction.test.ts:205:        it("shows NEW for unreviewed entries in text output", async () => {
tests\presentation\cli\commands\friction.test.ts:209:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:216:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:227:        it("shows summary with new count", async () => {
tests\presentation\cli\commands\friction.test.ts:232:            await executeFrictionCommand({ action: "log", description: "item 1", tool: "aidev", severity: "high" });
tests\presentation\cli\commands\friction.test.ts:233:            await executeFrictionCommand({ action: "log", description: "item 2", tool: "aidev", severity: "medium" });
tests\presentation\cli\commands\friction.test.ts:234:            await executeFrictionCommand({ action: "log", description: "item 3", tool: "aidev", severity: "medium" });
tests\presentation\cli\commands\friction.test.ts:237:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:250:    describe("dashboard --tool flag", () => {
tests\presentation\cli\commands\friction.test.ts:251:        it("passes tool filter to dashboard", async () => {
tests\presentation\cli\commands\friction.test.ts:255:            await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:262:            const result = await executeFrictionCommand({
tests\presentation\cli\commands\friction.test.ts:276:    describe("auto-ingest", () => {
tests\presentation\cli\commands\friction.test.ts:277:        it("ingests friction.jsonl before command execution", async () => {
tests\presentation\cli\commands\friction.test.ts:299:                await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:4: * Tests the friction dashboard action via executeFrictionCommand.
src\presentation\cli\commands\friction\dashboard.test.ts:13:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\dashboard.test.ts:16:describe("friction dashboard action", () => {
src\presentation\cli\commands\friction\dashboard.test.ts:35:        await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:53:    it("dashboard action returns exitCode 0 with rich output", async () => {
src\presentation\cli\commands\friction\dashboard.test.ts:54:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:67:    it("dashboard action with JSON output", async () => {
src\presentation\cli\commands\friction\dashboard.test.ts:68:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\dashboard.test.ts:81:    it("dashboard action with --html writes file", async () => {
src\presentation\cli\commands\friction\dashboard.test.ts:82:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\index.test.ts:11:describe("createFrictionCommand", () => {
src\presentation\cli\commands\friction\index.test.ts:12:    it("returns a Command instance", () => {
src\presentation\cli\commands\friction\index.test.ts:17:    it("has name 'friction'", () => {
src\presentation\cli\commands\friction\index.test.ts:22:    it("has description", () => {
src\presentation\cli\commands\friction\index.test.ts:27:    it("has log subcommand", () => {
src\presentation\cli\commands\friction\index.test.ts:35:    it("has list subcommand", () => {
src\presentation\cli\commands\friction\index.test.ts:43:    it("has resolve subcommand", () => {
src\presentation\cli\commands\friction\index.test.ts:51:    it("has wont-fix subcommand", () => {
src\presentation\cli\commands\friction\index.test.ts:59:    it("has dashboard subcommand", () => {
src\presentation\cli\commands\friction\index.test.ts:67:    it("log subcommand has --json option", () => {
src\presentation\cli\commands\friction\index.test.ts:78:    it("list subcommand has --json option", () => {
src\presentation\cli\commands\friction\index.test.ts:89:    it("resolve subcommand has --json option", () => {
src\presentation\cli\commands\friction\index.test.ts:100:    it("wont-fix subcommand has --json option", () => {
src\presentation\cli\commands\friction\index.test.ts:111:    it("dashboard subcommand has --json option", () => {
src\presentation\cli\commands\friction\index.test.ts:122:    it("has --format option on parent command with default and ai choice", () => {
src\presentation\cli\commands\friction\index.test.ts:133:    it("log subcommand has --severity option with default", () => {
src\presentation\cli\commands\friction\index.test.ts:145:    it("log subcommand has --category option with default", () => {
src\presentation\cli\commands\friction\index.test.ts:157:    it("list subcommand has --all option", () => {
src\presentation\cli\commands\friction\index.test.ts:168:    it("resolve subcommand has required --resolution option", () => {
src\presentation\cli\commands\friction\dashboard.ts:14:import type { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\dashboard.ts:15:import { formatFrictionDashboard, generateFrictionHtml } from "../../formatters/friction-dashboard.js";
src\presentation\cli\commands\friction\index.ts:12:import { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\index.ts:34:            .option("--tool <name>", "Tool that had friction (e.g., aidev, memory, gsd)")
src\presentation\cli\commands\friction\index.ts:39:                const result = await executeFrictionCommand({ action: "log", description, ...options });
src\presentation\cli\commands\friction\index.ts:50:            .option("--tool <name>", "Filter by tool name")
src\presentation\cli\commands\friction\index.ts:54:                const result = await executeFrictionCommand({ action: "list", ...options });
src\presentation\cli\commands\friction\index.ts:66:                const result = await executeFrictionCommand({ action: "resolve", id, ...options });
src\presentation\cli\commands\friction\index.ts:78:                const result = await executeFrictionCommand({ action: "wont-fix", id, ...options });
src\presentation\cli\commands\friction\index.ts:87:            .option("--tool <name>", "Filter by tool name")
src\presentation\cli\commands\friction\index.ts:90:                const result = await executeFrictionCommand({ action: "dashboard", ...options });
src\presentation\cli\commands\friction\index.ts:103:                const result = await executeFrictionCommand({ action: "purge", pattern, ...options });
src\presentation\cli\commands\friction\index.ts:112:export async function executeFrictionCommand(
src\presentation\cli\commands\friction\list.test.ts:4: * Tests the friction list action via executeFrictionCommand.
src\presentation\cli\commands\friction\list.test.ts:8:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\list.test.ts:10:describe("friction list action", () => {
src\presentation\cli\commands\friction\list.test.ts:24:    it("list action returns exitCode 0", async () => {
src\presentation\cli\commands\friction\list.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:32:    it("list action with --all returns exitCode 0", async () => {
src\presentation\cli\commands\friction\list.test.ts:33:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:41:    it("list action with JSON output", async () => {
src\presentation\cli\commands\friction\list.test.ts:43:        await executeFrictionCommand({
src\presentation\cli\commands\friction\list.test.ts:49:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\list.ts:9:import type { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\list.ts:96:        await service.markReviewed(options.tool);
src\presentation\cli\commands\friction\log.test.ts:4: * Tests the friction log action via executeFrictionCommand.
src\presentation\cli\commands\friction\log.test.ts:8:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\log.test.ts:10:describe("friction log action", () => {
src\presentation\cli\commands\friction\log.test.ts:24:    it("log action returns exitCode 0", async () => {
src\presentation\cli\commands\friction\log.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.test.ts:38:    it("log action with JSON output", async () => {
src\presentation\cli\commands\friction\log.test.ts:39:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.test.ts:56:    it("log action returns exitCode 1 without description", async () => {
src\presentation\cli\commands\friction\log.test.ts:57:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:4: * Tests the friction purge action via executeFrictionCommand.
src\presentation\cli\commands\friction\purge.test.ts:8:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\purge.test.ts:10:describe("friction purge action", () => {
src\presentation\cli\commands\friction\purge.test.ts:24:    it("purge without --force requires --dry-run or --force", async () => {
src\presentation\cli\commands\friction\purge.test.ts:25:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:38:    it("purge returns exitCode 1 without pattern", async () => {
src\presentation\cli\commands\friction\purge.test.ts:39:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.test.ts:46:    it("purge with --force on non-matching pattern reports zero", async () => {
src\presentation\cli\commands\friction\purge.test.ts:47:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\log.ts:9:import type { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\resolve.test.ts:4: * Tests the friction resolve action via executeFrictionCommand.
src\presentation\cli\commands\friction\resolve.test.ts:8:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\resolve.test.ts:10:describe("friction resolve action", () => {
src\presentation\cli\commands\friction\resolve.test.ts:24:    it("resolve action returns exitCode 0 after logging", async () => {
src\presentation\cli\commands\friction\resolve.test.ts:26:        await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:35:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:47:    it("resolve action returns exitCode 1 for non-existent id", async () => {
src\presentation\cli\commands\friction\resolve.test.ts:48:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:57:    it("resolve action with JSON output", async () => {
src\presentation\cli\commands\friction\resolve.test.ts:59:        await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:68:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:81:    it("resolve action returns exitCode 1 without id", async () => {
src\presentation\cli\commands\friction\resolve.test.ts:82:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\resolve.test.ts:90:    it("resolve action returns exitCode 1 with non-numeric id", async () => {
src\presentation\cli\commands\friction\resolve.test.ts:91:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\purge.ts:9:import type { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\purge.ts:30:            return regex.test(e.description);
src\presentation\cli\commands\friction\resolve.ts:9:import type { FrictionService } from "../../../../application/services/friction-service.js";
src\presentation\cli\commands\friction\wontfix.test.ts:4: * Tests the friction wont-fix action via executeFrictionCommand.
src\presentation\cli\commands\friction\wontfix.test.ts:8:import { executeFrictionCommand } from "./index.js";
src\presentation\cli\commands\friction\wontfix.test.ts:10:describe("friction wont-fix action", () => {
src\presentation\cli\commands\friction\wontfix.test.ts:24:    it("wont-fix action returns exitCode 0 after logging", async () => {
src\presentation\cli\commands\friction\wontfix.test.ts:26:        await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:35:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:47:    it("wont-fix action returns exitCode 1 for non-existent id", async () => {
src\presentation\cli\commands\friction\wontfix.test.ts:48:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\wontfix.test.ts:57:    it("wont-fix action returns exitCode 1 without id", async () => {
src\presentation\cli\commands\friction\wontfix.test.ts:58:        const result = await executeFrictionCommand({
src\presentation\cli\commands\friction\types.ts:13: * Runtime dependencies for executeFrictionCommand.
src\presentation\cli\commands\friction\types.ts:72: * Options passed to executeFrictionCommand.
src\presentation\cli\commands\friction\wontfix.ts:9:import type { FrictionService } from "../../../../application/services/friction-service.js";

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[32m succeeded in 16757ms:[0m
157:# Task Group: memory-nexus test-isolation cleanup and external-review gatekeeping
158:scope: Use when test pollution, module-level seams, or architectural cleanup in `memory-nexus` need a staged refactor with a static gate and mandatory external review.
159:applies_to: cwd=C:\Projects\memory-nexus; reuse_rule=Safe to reuse for this checkout and similar Bun/CLI cleanup work; exact file names and counts are repo-specific.
160:
161:## Task 1: Long-running test-isolation cleanup removed first-party pollution and reduced the remaining seam to `paths.ts`, success
162:
163:### rollout_summary_files
164:
165:- rollout_summaries/2026-05-10T13-26-54-xSuJ-memory_nexus_test_isolation_cleanup_and_doc_for_clear.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c510-7933-aee8-dbe7ed665d11.jsonl, updated_at=2026-05-10T13:26:55+00:00, thread_id=019e1211-c510-7933-aee8-dbe7ed665d11, captures the broad cleanup arc and persistence)
166:- rollout_summaries/2026-05-10T13-26-54-Z8cx-memory_nexus_test_isolation_codex_review_preference.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c311-79d2-ab5c-90d0070898b1.jsonl, updated_at=2026-05-10T13:26:54+00:00, thread_id=019e1211-c311-79d2-ab5c-90d0070898b1, captures the env-var migration finish and standing review preference)
167:
168:### keywords
169:
170:- test:isolation, scripts/check-test-isolation.ts, mock.module, deps parameters, env-overrides.ts, paths.ts, setTestPaths, resetTestPaths, 3096 pass, MEMORY_HOME
171:
172:## Task 2: Non-trivial plans must go through external Codex/GPT-5.5 review with first-principles background, success
173:
174:### rollout_summary_files
175:
176:- rollout_summaries/2026-05-10T13-26-54-Z8cx-memory_nexus_test_isolation_codex_review_preference.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c311-79d2-ab5c-90d0070898b1.jsonl, updated_at=2026-05-10T13:26:54+00:00, thread_id=019e1211-c311-79d2-ab5c-90d0070898b1, codifies the review-before-execution requirement)
177:
178:### keywords
179:
180:- codex exec -, GPT-5.5, verifier, reviewer, first principles breakdown, inbox triage blocker, external AI review
181:
182:## User preferences
183:
184:- The user said `Let's close out the test-isolation arc cleanly then inbox triage` -> finish the currently active cleanup arc before pivoting to a new queue. [Task 1]
185:- The user said `always part to an external AI to review your plan of actions (including your first principles breakdown as background)` -> treat external adversarial review as a standing gate for non-trivial plans, not an optional enhancement. [Task 2]
186:- The user later said `never again look at some issue or error that pre-existing as to mean not urgent or not my business` -> pre-existing failures still belong to the system and should not be waved away because they were inherited. [Task 1]
187:
188:## Reusable knowledge
189:
190:- `scripts/check-test-isolation.ts` is the authoritative static gate: it bans module-level mutable test seams and first-party `mock.module()` pollution, and the safe migration pattern is env/deps support first, test migration second, seam deletion last. [Task 1]

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs'"\\inbox\\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md | ForEach-Object { "'$i++; if ($i -le 115) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs'"\\inbox\\README.md | ForEach-Object { "'$i++; if ($i -le 80) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs'"\\inbox\\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md | ForEach-Object { "'$i++; if ($i -le 120) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content src'"\\presentation\\cli\\commands\\friction\\types.ts | ForEach-Object { "'$i++; if ($i -ge 1 -and $i -le 100) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$i=0; Get-Content docs'"\\inbox\\2026-05-12-conversations-friction-list-durable-filters.md | ForEach-Object { "'$i++; if ($i -le 100) { "${i}:$_" } }'[0m in C:\Projects\memory-nexus
[32m succeeded in 19002ms:[0m
1:---
2:schema_version: "1.2"
3:source_project: memory-nexus
4:created: 2026-05-11
5:type: bug
6:severity: medium
7:fix_status: none
8:affects_scope: this-project-only
9:status: open
10:---
11:
12:# tests/presentation/cli/commands/friction.test.ts imports removed friction.js
13:
14:## Symptom
15:
16:```bash
17:$ bun test tests/presentation/cli/commands/friction.test.ts
18:error: Cannot find module '../../../../src/presentation/cli/commands/friction.js'
19:  from 'C:\...\tests\presentation\cli\commands\friction.test.ts'
20:```
21:
22:Test file fails at import time. 1 fail + 1 error.
23:
24:## Repro
25:
26:```bash
27:bun test tests/presentation/cli/commands/friction.test.ts
28:```
29:
30:## Root cause
31:
32:Phase 30 (god-file cleanup) split `src/presentation/cli/commands/friction.ts` into a subdirectory of modules:
33:
34:```
35:src/presentation/cli/commands/friction/
36:  dashboard.ts
37:  index.ts
38:  list.ts
39:  log.ts
40:  purge.ts
41:  resolve.ts
42:  types.ts
43:  wontfix.ts
44:```
45:
46:The test file at `tests/presentation/cli/commands/friction.test.ts` still imports from the old monolithic path. Phase 30 cleanup migrated the production-code consumers and the new co-located unit tests at `src/presentation/cli/commands/friction/*.test.ts`, but missed the older tests/presentation/ duplicate.
47:
48:Last touched by commit `ef5d588` (Phase 28-04) â€” predates Phase 30 cleanup.
49:
50:## Proposed fix
51:
52:Two paths:
53:
54:**A. Delete the file** if its coverage is fully duplicated by the new co-located tests at `src/presentation/cli/commands/friction/*.test.ts`. Quick wins if the new tests are comprehensive.
55:
56:**B. Migrate the file** if it tests scenarios not covered by the new module-level tests. Update imports to point at `friction/index.js` (and individual modules where appropriate). Likely some test cases need to be updated to match the new module boundaries.
57:
58:Investigation step before deciding: diff the test coverage of `tests/presentation/cli/commands/friction.test.ts` vs the co-located `src/presentation/cli/commands/friction/*.test.ts` files. If A is a subset of B â†’ delete. If A has unique coverage â†’ migrate.
59:
60:## Test plan
61:
62:After fix: `bun test tests/presentation/cli/commands/` passes 11/11 (the previously-passing 10 + the migrated friction tests OR just the 10 if file deleted).
63:
64:## Suggested commit message
65:
66:If deleted:
67:```
68:test(friction): delete orphaned tests/presentation/cli/commands/friction.test.ts
69:
70:The file was orphaned by Phase 30's god-file split of src/presentation/cli/
71:commands/friction.ts into a subdirectory. The new co-located tests at
72:src/presentation/cli/commands/friction/*.test.ts provide equivalent coverage.
73:
74:File deleted: tests/presentation/cli/commands/friction.test.ts
75:```
76:
77:If migrated:
78:```
79:test(friction): migrate orphaned test file after Phase 30 subdirectory split
80:
81:Update imports to use the new friction/ subdirectory structure landed in
82:Phase 30. Re-scope test cases to match the new module boundaries.
83:
84:File: tests/presentation/cli/commands/friction.test.ts
85:```
86:
87:## Risks / things to verify before merging
88:
89:- If deleting: confirm by running coverage report on `src/presentation/cli/commands/friction/` before and after to make sure no lines drop.
90:- If migrating: some test cases may test behavior that was split across multiple new modules â€” restructure into one test file per module, or keep as integration-style for the full friction subsystem.
91:
92:## Related
93:
94:- Pre-existed the test-isolation cleanup arc. Surfaced during the arc's closing verification (2026-05-11). Not caused by this arc â€” separate from the setTestPaths and setTestCheckpointPath collateral.

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 19132ms:[0m
1:/**
2: * Friction Command Types
3: *
4: * Type definitions and interfaces for friction command handlers.
5: */
6:
7:/**
8: * Function type for opening a file in the system browser.
9: */
10:export type BrowserOpener = (filePath: string) => void;
11:
12:/**
13: * Runtime dependencies for executeFrictionCommand.
14: *
15: * Operational dependencies that tests substitute for isolation.
16: * Defaults to production resolution when omitted.
17: */
18:export interface FrictionCommandDeps {
19:    /** Database path. Defaults to getDefaultDbPath(). */
20:    dbPath?: string;
21:    /** Browser opener for --html mode. Defaults to system default. */
22:    openInBrowser?: BrowserOpener;
23:}
24:
25:/**
26: * Base options shared by all friction subcommands.
27: */
28:export interface FrictionCommandOptions {
29:    json?: boolean;
30:    /** Output format: default or ai */
31:    format?: "default" | "ai";
32:}
33:
34:/**
35: * Options for the friction log subcommand.
36: */
37:export interface FrictionLogOptions extends FrictionCommandOptions {
38:    severity?: string;
39:    category?: string;
40:    source?: string;
41:    context?: string;
42:    tool?: string;
43:}
44:
45:/**
46: * Options for the friction list subcommand.
47: */
48:export interface FrictionListOptions extends FrictionCommandOptions {
49:    all?: boolean;
50:    status?: string;
51:    category?: string;
52:    tool?: string;
53:    limit?: string;
54:}
55:
56:/**
57: * Options for the friction resolve/wont-fix subcommands.
58: */
59:export interface FrictionResolveOptions extends FrictionCommandOptions {
60:    resolution: string;
61:}
62:
63:/**
64: * Options for the friction purge subcommand.
65: */
66:export interface FrictionPurgeOptions extends FrictionCommandOptions {
67:    dryRun?: boolean;
68:    force?: boolean;
69:}
70:
71:/**
72: * Options passed to executeFrictionCommand.
73: */
74:export interface FrictionExecuteOptions {
75:    action: "log" | "list" | "resolve" | "wont-fix" | "dashboard" | "purge";
76:    description?: string;
77:    pattern?: string;
78:    id?: string;
79:    json?: boolean;
80:    /** Output format: default or ai */
81:    format?: "default" | "ai";
82:    severity?: string;
83:    category?: string;
84:    source?: string;
85:    context?: string;
86:    all?: boolean;
87:    status?: string;
88:    limit?: string;
89:    resolution?: string;
90:    tool?: string;
91:    html?: boolean;
92:    dryRun?: boolean;
93:    force?: boolean;
94:}

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 19481ms:[0m
1:# Inbox â€” Cross-Project Issues
2:
3:This directory accepts issue reports from other Claude Code sessions per the
4:convention documented in `~/.claude/rules/cross-project-issues.md`.
5:
6:## What lives here
7:
8:Structured issue files (one per issue) following the format defined in the rule
9:linked above. Each file represents:
10:
11:- A bug or improvement opportunity found while another project was using this tool
12:- Substantive enough to warrant a patch or detailed analysis (lightweight
13:  friction goes to `~/.claude/friction.jsonl` per `tool-friction.md`)
14:
15:## Triage
16:
17:When opening this project's CWD session, check this directory for untriaged items:
18:
19:```bash
20:ls docs/inbox/*.md 2>/dev/null
21:```
22:
23:Triage steps for each open file (frontmatter `status: open` or unset):
24:1. Read severity + affects_scope
25:2. Validate proposed fix against current code
26:3. Update frontmatter `status: triaged`, `triaged_at: <today>`
27:4. Either apply per project standards or document rejection
28:
29:After merge: `status: merged`, `resolved_at`, `pr_url` â†’ move to `archived/`.
30:After reject: `status: rejected`, append rationale â†’ move to `rejected/`.
31:
32:## Conventions
33:
34:- Filename: `YYYY-MM-DD-<reporting-project>-<slug>.md`
35:- One issue per file
36:- Frontmatter schema: see `~/.claude/rules/cross-project-issues.md` (currently v1.1)
37:
38:## Why this directory exists (not a rule restatement)
39:
40:This stub references the global rule rather than restating it. If the rule's
41:schema or workflow changes, only the rule file is updated â€” this stub stays
42:correct because it has no spec content. If the convention is ever migrated to
43:a different mechanism (hook, MCP server, etc.), this README documents the
44:historical pattern for projects that haven't migrated yet.

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 19606ms:[0m
1:---
2:schema_version: "1.2"
3:source_project: conversations
4:created: 2026-05-12
5:type: enhancement
6:severity: low
7:fix_status: none
8:affects_scope: all-consumers
9:status: open
10:priority_rationale: Interface-contract note from conversations after the friction-primacy disposition (2026-05-11). Do NOT implement solely for conversations today â€” file this as future capacity. Status quo (JSONL scan) is acceptable for conversations' current use case.
11:closure_notify_to: conversations
12:closure_notify_reason: If memory-nexus extends `friction list` per this proposal, conversations' `friction_pattern_detected` reminder check has a path to durable signal (today it scans transient JSONL only).
13:---
14:
15:# `memory friction list` â€” durable filter + count extensions
16:
17:## Motivation
18:
19:Conversations has a reminder condition check `friction_pattern_detected` (commit `8bbfe25`, 2026-05-03) used by parked-project reactivation watchers. It scans `~/.claude/friction.jsonl` for recent entries matching configured criteria.
20:
21:Per the 2026-05-11 friction-primacy disposition, JSONL is transient (auto-deleted on next `memory friction *` invocation). For the current reactivation-watcher use case, "recent + un-processed" is acceptable semantics. Documented in conversations' `data/adapters/FileReminderStore.js:133-156`.
22:
23:Hypothetical future need: a checker that wants DURABLE signal (e.g., "this friction has occurred N+ times over the last 30 days, across sessions, regardless of memory CLI usage"). No such checker exists today. **No conversations work is blocked on this filing.**
24:
25:## What we'd need (if memory-nexus chooses to extend)
26:
27:`memory friction list` already filters by `--tool`, `--category`, `--status`, `--all`, `--json`. Cleanest path is extending `list` rather than introducing a new subcommand.
28:
29:Missing filters that a durable pattern checker would need:
30:- `--since <YYYY-MM-DD>` â€” entries on/after date
31:- `--severity <low|medium|high|critical>` â€” exact match
32:- `--project <name>` â€” exact match (if `project` field is stored)
33:- `--description-contains <s>` â€” case-insensitive substring
34:- `--context-contains <s>` â€” case-insensitive substring
35:
36:Missing output modes for boolean checks:
37:- `--count` â€” print only the count
38:- `--min <n>` â€” exit code semantic: `0` if `count >= n`, `1` if `count < n`, `2+` for execution/config error
39:
40:## API exit-code contract (if `--min` added)
41:
42:| Exit | Meaning |
43:|---|---|
44:| 0 | Threshold met (`count >= n`) â€” or, without `--min`, normal success |
45:| 1 | Threshold not met (`count < n`) |
46:| 2 | CLI argument / config error |
47:| 3+ | Execution error (DB unavailable, corrupt, etc.) |
48:
49:Caller shape (illustrative):
50:```bash
51:memory friction list \
52:  --tool memory --since 2026-05-01 --status open \
53:  --count --min 3 \
54:  && echo "fire reminder"
55:```
56:
57:## Hard requirements / open questions for memory-nexus to resolve
58:
59:These are what memory-nexus would need to nail down BEFORE conversations could adopt the contract:
60:
61:1. **Stable JSON schema for `--json`.** Versioned; backward-compatible. Without this, consumers couple to schema drift.
62:2. **Date/timezone semantics.** Is `--since` UTC, local, or as-stored? Inclusive or exclusive of the named date?
63:3. **Resolved-vs-open interaction.** Does `--since` honor `--status open` (default) or include resolved? Composition matters for "is the pattern still recurring or has it been actioned?"
64:4. **Project / tool normalization.** Substring vs exact, case sensitivity. Today `--tool` doc says "Filter by tool name" â€” exact? case-sensitive?
65:5. **DB unavailable / corrupt behavior.** Exit code 3+ or distinct codes per failure mode?
66:6. **Privacy / redaction.** `--description-contains` / `--context-contains` operate on potentially sensitive friction content. Confirm no logging of the query string in audit trails.
67:
68:## Alternatives memory-nexus may prefer
69:
70:- **Reject the filing.** "JSONL-scan is fine forever; we won't extend `list`." Conversations accepts this; the existing checker stays.
71:- **Counter-propose a separate subcommand.** `memory friction query` or `memory friction count`. Codex's view (consulted via cross-AI review): prefer extending `list` because the proposed filters are list-shaped, not query-engine-shaped.
72:- **Defer to v4.x event-log architecture.** If memory-nexus's v4.0 evolves into a general event-log/projection for facts + decisions + learnings, friction becomes one stream under that unified design. Reconsider this filing then.
73:
74:## What NOT to do
75:
76:- **Do NOT build this solely for conversations.** No conversations work is blocked today. JSONL-scan is acceptable for parked-project reactivation watchers. Capacity should go to roadmap-aligned work first.
77:- **Do NOT introduce a new top-level subcommand** just for one consumer. Extending `list` is the parsimonious shape.
78:- **Do NOT couple this to a programmatic Node API.** A stable CLI JSON/exit-code contract is sufficient; in-process API creates version coupling between first-party tools that may not be worth the maintenance overhead.
79:
80:## Related
81:
82:- conversations' `friction_pattern_detected` impl + 2026-05-11 docstring clarification: `~/Projects/conversations/data/adapters/FileReminderStore.js:133-156`
83:- Friction-primacy disposition (memory-nexus side, closed): `~/Projects/memory-nexus/docs/inbox/archived/2026-05-08-conversations-friction-primacy-decision.md`
84:- Counter-notification that prompted this filing: `~/Projects/conversations/docs/inbox/archived/2026-05-11-memory-nexus-friction-primacy-decision-merged.md`
85:- Cross-project-issues convention: `~/.claude/rules/cross-project-issues.md` (v1.2)

[1mhook:[0m [2mPostToolUse[0m
[32m succeeded in 20162ms:[0m
1:---
2:schema_version: "1.2"
3:source_project: memory-nexus
4:created: 2026-05-11
5:type: bug
6:severity: medium
7:fix_status: none
8:affects_scope: this-project-only
9:status: open
10:workaround_applied: tests/integration/programmatic-api.test.ts is excluded from the test-isolation arc's "all green" claim; surfaced for separate triage
11:---
12:
13:# programmatic-api.test.ts hits real user DB; 6 commands time out
14:
15:## Symptom
16:
17:Running `bun test tests/integration/programmatic-api.test.ts` produces:
18:
19:```
20:44 pass
21: 6 fail
22:```
23:
24:The 6 failures are all 5â€“39 second timeouts:
25:
26:- `executeStatsCommand > returns CommandResult` (5031ms)
27:- `executeStatsCommand > returns CommandResult with exitCode 0` (8078ms)
28:- `executeStatsCommand > JSON mode returns CommandResult with exitCode 0` (6735ms)
29:- `executeRelatedCommand > with session ID returns CommandResult` (5031ms)
30:- `executeRelatedCommand > nonexistent session returns CommandResult` (5890ms)
31:- `executeShowCommand > JSON mode returns CommandResult` (5594ms)
32:- `executeShowCommand > nonexistent session returns CommandResult with exitCode 1` (5016ms)
33:- `executePurgeCommand > dry-run JSON mode returns CommandResult with exitCode 0` (5188ms)
34:- `executeDoctorCommand > returns CommandResult with exitCode as a number` (39235ms)
35:- `executeDoctorCommand > JSON mode returns CommandResult` (25687ms)
36:- `executeDoctorCommand > exitCode is a number` (25438ms)
37:- `executeStatusCommand > JSON mode returns CommandResult` (5015ms)
38:- `Return type validation > all CommandResult objects have exactly { exitCode: number } shape` (38688ms)
39:
40:(13 entries in the timing output even though aggregate count says "6 fail" â€” Bun's reporter has some discrepancy. Either way, all are timeouts, not assertion failures.)
41:
42:## Repro
43:
44:```bash
45:bun test tests/integration/programmatic-api.test.ts
46:```
47:
48:## Root cause
49:
50:The test file imports and invokes each `executeXCommand` directly with only the user-facing `options` argument:
51:
52:```ts
53:// tests/integration/programmatic-api.test.ts:160-176
54:test("returns CommandResult", async () => {
55:  const options: StatsCommandOptions = { quiet: true };
56:  const result = await executeStatsCommand(options);  // <-- no deps
57:  expectCommandResult(result);
58:});
59:```
60:
61:The commands accept `(options, deps = {})` after the test-isolation arc landed deps injection. Tests calling without `deps` fall through to the production defaults â€” `getDbPath()` resolves to `~/.local/share/memory/memory.db`, the user's real database. As that DB has grown over time (10+ open friction entries, embedded conversation history, etc.), reads now exceed Bun's default 5-second test timeout for some commands. `doctor` is worst-affected because it scans multiple sources.
62:
63:This is the **real-DB pollution pattern** â€” distinct from the `setTestPaths` pattern the test-isolation arc fixed. The test file was not migrated as part of that arc because it never used setTestPaths.
64:
65:## Proposed fix
66:
67:Migrate the test file to use deps injection per the arc's canonical pattern:
68:
69:```ts
70:const testDbPath = join(tempDir, "test.db");
71:// ...initialize test DB with minimal seed data...
72:const result = await executeStatsCommand(options, { dbPath: testDbPath });
73:```
74:
75:This requires:
76:1. A per-test or per-describe test DB created in beforeEach with the same schema (use `tests/helpers/test-database.ts`)
77:2. Pass `{ dbPath: testDbPath }` to every `executeXCommand` call
78:3. For `doctor`, also override health-checker paths via `deps.healthOverrides`
79:
80:## Test plan
81:
82:After migration: `bun test tests/integration/programmatic-api.test.ts` runs in <5s total (no real-DB I/O) and 50/50 pass. Order-stress with `bun test --rerun-each 2` also clean.
83:
84:## Suggested commit message
85:
86:```
87:test(integration): migrate programmatic-api.test.ts to deps injection
88:
89:Tests previously hit the real user DB at ~/.local/share/memory/memory.db,
90:causing 5-39 second timeouts as that DB grew. Migrate to per-test temp DB
91:via deps.dbPath, matching the canonical pattern from the test-isolation
92:arc. Doctor command also gets healthOverrides for path-driven sub-checks.
93:
94:File: tests/integration/programmatic-api.test.ts
95:```
96:
97:## Risks / things to verify before merging
98:
99:- The `doctor` command invokes health-checker, which has its own deps surface (`DoctorCommandDeps.healthOverrides`). Verify all sub-paths used inside doctor are reachable via the deps interface.
100:- Some commands may call sync internally (e.g., `status` checks sync state). Confirm the test DB is initialized with whatever schema/state those reads expect.
101:- The test file uses `expectCommandResult(result)` which only checks `{ exitCode: number }` shape. After migration, consider strengthening assertions (e.g., known seed data â†’ expected result counts).
102:
103:## Related
104:
105:- Surfaced during the closing-arc verification of the test-isolation cleanup (2026-05-11). Documented in `~/.claude/projects/.../memory/test_isolation_cleanup.md` as a pre-existing concern that needs its own scoped fix.
106:- Composes with `feedback_preexisting_ownership.md`: pre-existing failures must be surfaced, not dismissed.

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPostToolUse[0m Completed
[35m[3mcodex[0m[0m
1. **[BLOCK]** The top framing is the wrong binary. “Triage now vs defer” conflates four separate actions: classify, preserve evidence, execute fixes, and roadmap/backlog commitment. The audit’s next stage is explicitly evidence-gathering against Stage 0 truths, so mutating Item 2 before Stage 1 risks erasing useful evidence of test-surface drift. Better framing: **what state transitions reduce operational risk while preserving audit evidence?**

2. **[HIGH]** Item 3 should not be execution-deferred as written. This is not just a timeout; it is known real-user-DB access from tests. That is operationally unsafe independent of whether the audit ends in A, B, C, D, or E. Minimum acceptable action is quarantine/skip/guard so accidental runs cannot touch the user DB. Best action is probably fix now if the deps pattern is truly mechanical.

3. **[HIGH]** Item 1 overstates root cause as “NOT memory-nexus code.” The inbox evidence says “likely” Bun-on-Windows runtime pressure, not proof that project test behavior is irrelevant. Disposition should say **upstream-suspected**, with memory-nexus owning a deterministic split-test script and doc. Also, current repo convention does not support creating `docs/development.md` as a first-entry island; use README “Development / Testing” or existing implementation docs unless you are deliberately creating a contributor guide.

4. **[HIGH]** Item 2 says “migrate, not delete” before performing the investigation the inbox itself requires. The actual safe disposition is: classify each orphan case first, then either delete duplicates or migrate unique behavior using the current deps-injection surface. Do not “just update import to `friction/index.js`”; the orphan uses `spyOn(getDefaultDbPath)`, which is exactly the kind of first-party mutable seam the test-isolation cleanup was trying to eliminate.

5. **[MEDIUM]** Migrating Item 2 can bias Stage 1 toward outcome A by normalizing the Phase 30 split before the audit records the broken handoff. The issue is not that integration coverage endorses the split; the issue is that fixing it first removes a concrete signal about architecture churn, test ownership, and command-surface fragmentation. If you fix it before Stage 1, capture a before/after evidence note for the audit.

6. **[MEDIUM]** Item 4 looks closer to “reject for now with rationale” than “triaged keep open.” The filing says no consumer is blocked and conversations accepts rejection. Keeping it open with A/B/C conditional language creates roadmap gravity around the current friction subsystem before the audit decides whether friction should remain a distinct surface.

7. **[MEDIUM]** The Stage 3 trigger for Item 4 is too vague unless it is tied to a concrete artifact. “Outcome A/B/C” is not automatically actionable unless some process reads that outcome and promotes/discards the item. A deferred reminder is reasonable only if it points at the exact audit doc/status field to inspect. Otherwise, mark it rejected/parked and require the audit synthesis to reconsider inbox-derived product contracts.

8. **[MEDIUM]** The inbox is not orthogonal to the audit. It is part of the memory system’s capture/retrieval/triage lifecycle, especially cross-project `closure_notify_to`, durable issue files, and friction handoff. Stage 1b should treat `docs/inbox/` as architecture evidence, not just housekeeping.

9. **[MEDIUM]** The write-scope invariant is inaccurate. Item 2 execution touches tests and maybe command deps if the surface is insufficient. Archiving moves files. A conversations reminder would touch another project. The invariant should enumerate exact allowed write sets per item, not say “inbox files + at most ONE production file.”

10. **[LOW]** Item 3 has a count mismatch that should stay explicit: Bun reports `6 fail`, but the timing output lists 13 timeout entries. Do not flatten that into “13 cases” without preserving the reporter discrepancy.

11. **[LOW]** Reviewer ask list is leading. It asks reviewers to validate proposed choices more than to find disconfirming evidence. Add asks like: “Which action changes Stage 1 evidence?”, “Which open item is actually unsafe to leave runnable?”, and “Which disposition creates roadmap gravity?”

12. **[NIT]** Current `docs/inbox/README.md` still says schema v1.1 while files use v1.2. If triage touches inbox protocol/statuses, note or fix that drift. Also several existing docs have mojibake around arrows; new docs should avoid copying that encoding damage.

**Verdict: BLOCK**


[1mhook:[0m [2mStop[0m
[1mhook:[0m [2mStop[0m
[1mhook:[0m [2mStop[0m Completed
[1mhook:[0m [2mStop[0m Failed
[2mtokens used[0m
101,956
1. **[BLOCK]** The top framing is the wrong binary. “Triage now vs defer” conflates four separate actions: classify, preserve evidence, execute fixes, and roadmap/backlog commitment. The audit’s next stage is explicitly evidence-gathering against Stage 0 truths, so mutating Item 2 before Stage 1 risks erasing useful evidence of test-surface drift. Better framing: **what state transitions reduce operational risk while preserving audit evidence?**

2. **[HIGH]** Item 3 should not be execution-deferred as written. This is not just a timeout; it is known real-user-DB access from tests. That is operationally unsafe independent of whether the audit ends in A, B, C, D, or E. Minimum acceptable action is quarantine/skip/guard so accidental runs cannot touch the user DB. Best action is probably fix now if the deps pattern is truly mechanical.

3. **[HIGH]** Item 1 overstates root cause as “NOT memory-nexus code.” The inbox evidence says “likely” Bun-on-Windows runtime pressure, not proof that project test behavior is irrelevant. Disposition should say **upstream-suspected**, with memory-nexus owning a deterministic split-test script and doc. Also, current repo convention does not support creating `docs/development.md` as a first-entry island; use README “Development / Testing” or existing implementation docs unless you are deliberately creating a contributor guide.

4. **[HIGH]** Item 2 says “migrate, not delete” before performing the investigation the inbox itself requires. The actual safe disposition is: classify each orphan case first, then either delete duplicates or migrate unique behavior using the current deps-injection surface. Do not “just update import to `friction/index.js`”; the orphan uses `spyOn(getDefaultDbPath)`, which is exactly the kind of first-party mutable seam the test-isolation cleanup was trying to eliminate.

5. **[MEDIUM]** Migrating Item 2 can bias Stage 1 toward outcome A by normalizing the Phase 30 split before the audit records the broken handoff. The issue is not that integration coverage endorses the split; the issue is that fixing it first removes a concrete signal about architecture churn, test ownership, and command-surface fragmentation. If you fix it before Stage 1, capture a before/after evidence note for the audit.

6. **[MEDIUM]** Item 4 looks closer to “reject for now with rationale” than “triaged keep open.” The filing says no consumer is blocked and conversations accepts rejection. Keeping it open with A/B/C conditional language creates roadmap gravity around the current friction subsystem before the audit decides whether friction should remain a distinct surface.

7. **[MEDIUM]** The Stage 3 trigger for Item 4 is too vague unless it is tied to a concrete artifact. “Outcome A/B/C” is not automatically actionable unless some process reads that outcome and promotes/discards the item. A deferred reminder is reasonable only if it points at the exact audit doc/status field to inspect. Otherwise, mark it rejected/parked and require the audit synthesis to reconsider inbox-derived product contracts.

8. **[MEDIUM]** The inbox is not orthogonal to the audit. It is part of the memory system’s capture/retrieval/triage lifecycle, especially cross-project `closure_notify_to`, durable issue files, and friction handoff. Stage 1b should treat `docs/inbox/` as architecture evidence, not just housekeeping.

9. **[MEDIUM]** The write-scope invariant is inaccurate. Item 2 execution touches tests and maybe command deps if the surface is insufficient. Archiving moves files. A conversations reminder would touch another project. The invariant should enumerate exact allowed write sets per item, not say “inbox files + at most ONE production file.”

10. **[LOW]** Item 3 has a count mismatch that should stay explicit: Bun reports `6 fail`, but the timing output lists 13 timeout entries. Do not flatten that into “13 cases” without preserving the reporter discrepancy.

11. **[LOW]** Reviewer ask list is leading. It asks reviewers to validate proposed choices more than to find disconfirming evidence. Add asks like: “Which action changes Stage 1 evidence?”, “Which open item is actually unsafe to leave runnable?”, and “Which disposition creates roadmap gravity?”

12. **[NIT]** Current `docs/inbox/README.md` still says schema v1.1 while files use v1.2. If triage touches inbox protocol/statuses, note or fix that drift. Also several existing docs have mojibake around arrows; new docs should avoid copying that encoding damage.

**Verdict: BLOCK**


