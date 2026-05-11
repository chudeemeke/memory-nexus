OpenAI Codex v0.130.0
--------
workdir: C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, C:\Users\Destiny\.codex\memories]
reasoning effort: medium
reasoning summaries: none
session id: 019e1556-cc52-7e72-aac8-eaa14fa98664
--------
user
# Plan for review: Architecture-audit disposition

You are reviewing a triage decision, not code. Be adversarial. Push back hard on framing — the user explicitly wants pushback if any reasoning is weak. The user's reviewer preference: gpt-5.5 high reasoning.

## Context

`@chude/memory` (binary: `memory`) — TypeScript CLI for cross-project context persistence on SQLite + FTS5. Currently mid-v4.0 milestone (Intelligence Layer). Roadmap: 8 phases (30-37). Status:

- Phase 30 (God File Cleanup) — done
- Phase 31 (Bug Fixes) — done
- Phase 32-37 — not started
- Out-of-roadmap test-isolation cleanup arc — just closed (this session, today 2026-05-11)

An inbox item routed from `conversations` (filed 2026-05-08) asks for a **first-principles audit of memory-nexus architecture against adjacent memory systems** (Hermes / OpenClaw / Mem0 / MemPalace). The audit's purpose: decide between three candidate architectures from the conversations inventory:

- **A:** specialized surfaces + agent-as-router (status quo)
- **B:** federation router on memory-nexus (v5.0+)
- **C:** surgical surface consolidation (cheapest now)

The inbox item is filed at `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md` and is currently `status: open`. Its acceptance criteria: audit document landed, cross-AI reviewed, recommendation explicit, concrete next-step actionable.

## The user's worry (verbatim from the inbox item)

> "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."

## What the inbox item proposes

A full audit phase with these requirements:
1. First-principles derivation (independent of memory-nexus's current shape)
2. Adjacent-systems comparison (Hermes, OpenClaw, Mem0, MemPalace)
3. Multi-subagent verification of namespaces + commands in parallel (one subagent per command group: friction, search/context, sync/extract, install/doctor)
4. Inbox content review at audit start (other accumulated items)
5. Cross-AI adversarial review of the audit's plan AND solution
6. Output document at `docs/audits/2026-XX-XX-architecture-first-principles-audit.md`

Strict timing constraint stated in the prompt: **"after current bug-fix work concludes"**. That gate is now met — Phase 31 closed, test-isolation arc closed today.

## The triage I'm writing

I am writing the disposition for this inbox item. The decision is NOT "run the audit now" (that's a separate execution decision); it's **what disposition to set on the inbox file, and what schedule to commit to**.

## My first-principles framing

**Irreducible truths about this inbox item:**

1. The inbox item is a research/audit prompt. Its acceptance criterion is the audit document existing, not code shipping.
2. The audit's deliverable is a recommendation about A/B/C — which gates whether memory-nexus targets a v5.0 federation milestone, accepts narrow-scope steady state, or stops at v4.0.
3. Running the audit is a multi-session arc. Multi-agent verification + 4-system comparison + cross-AI review is not a 30-minute task.
4. NOT running the audit means continuing v4.0 work (Phases 32-37) without knowing if memory-nexus is the right system to be building.
5. The audit's gate ("after current bug-fix work concludes") is met as of today.
6. The user's worry is explicitly cited as load-bearing for the audit's existence.

**Derived structure for the disposition:**

The right disposition is NOT `merged` (audit hasn't run). NOT `rejected` (user's worry is real, scope is well-framed). The right state is `triaged` with an explicit schedule commitment.

The schedule question is the real architectural call: WHEN to run the audit relative to v4.0 phases.

**Compare against existing planning:**

Options for scheduling:

**Option 1 — Run audit immediately, before Phase 32.**
- Pro: catches architectural wrong-direction before any v4.0 phase commits more code
- Pro: bug-fix gate is met; "right time" per the prompt is now
- Con: pauses v4.0 critical-path execution for an unknown duration (audit could take days)
- Con: if audit recommends staying with current architecture, v4.0 momentum is dampened for no gain

**Option 2 — Run audit AFTER Phase 33 (Extraction Foundation).**
- Pro: Phase 33 is the biggest architectural commitment (Mem0-style ADD/UPDATE/DELETE/NOOP); having that landed gives the audit concrete code to compare
- Con: if audit recommends a different architecture, Phase 33 sunk cost grows
- Con: violates the inbox item's "after current bug-fix work concludes" timing — Phase 33 isn't bug-fix work, it's feature work, which technically still counts as "current work" but the prompt's intent suggests "now"

**Option 3 — Split the audit: run cheap parts now, defer expensive parts.**
- Sub-option 3a: run the namespace/command verification subagents NOW (cheap, surfaces dead code + intent drift), run the first-principles + 4-system comparison + cross-AI review LATER
- Pro: incremental value, addresses part of user worry immediately
- Con: the user's worry isn't about commands being mis-wired — it's about whether memory-nexus is the right SYSTEM. Splitting loses that load-bearing signal.
- Con: complicates inbox accounting (partial merge vs in-progress vs scheduled)

**Option 4 — Defer audit to v5.0 milestone scoping (after v4.0 ships).**
- Pro: v4.0 is the smaller commitment; ship it as "the version we have now" + run audit before v5.0 scoping
- Pro: aligns audit with the natural architectural decision point (federation = v5.0)
- Con: contradicts the inbox item's "this audit's recommendation gates v5.0 scoping decisions" — but if v4.0 is published as a stable surface, the cost of architectural pivot at v5.0 is well-scoped
- Con: user worry is unaddressed for v4.0 timeline

**My lean: Option 1 — run audit immediately, before Phase 32.**

Reasoning: the user's worry is the load-bearing signal. The prompt's timing gate is met. Phase 32 is "CLI Surface" — a labeled-help reorganization (gh-style). Reorganizing CLI surface IS itself the kind of architectural call the audit should inform. Doing Phase 32 before the audit means committing to a CLI shape we may then have to undo.

The cost (pausing v4.0 momentum) is real but bounded: the audit is well-scoped (the inbox item defines deliverables + acceptance), and running it now creates a clean baseline for every subsequent phase.

## Proposed disposition

1. Set `status: triaged`, `triaged_at: 2026-05-11`
2. Body addition documenting:
   - The disposition (run audit immediately as next major work item, BEFORE Phase 32)
   - Codex-reviewed rationale
   - Concrete acceptance criteria (carried forward from the inbox item)
   - Schedule commitment: audit Phase starts after this triage commits; expected duration estimate (be honest — give a range)
3. File stays in `docs/inbox/` (not moved to archived/) because the audit hasn't run
4. Counter-notify `conversations` with the SCHEDULE, not a closure outcome — but mark it as schedule-set so the conversations side knows the audit is committed
5. After audit lands: re-triage to `merged` (audit done) with audit-doc path in body, then move to archived/

## What I'm explicitly asking you (codex) to challenge

1. **Is Option 1 actually right?** I'm leaning on "user's worry is load-bearing." But is that just letting the urgent worry override pragmatic phase ordering? Specifically:
   - If Phase 33 (extraction foundation) is the biggest commitment, doesn't it make sense to LAND that first so the audit has concrete code to compare? My answer is "no, because the audit might say 'don't build that extraction layer' — but maybe I'm wrong."
   - The prompt's "after current bug-fix work concludes" — does it mean ALL feature work too, or just bugs? I read it as "any in-flight work" but the wording is "bug-fix work."

2. **Is the inbox-disposition meta-discipline tracking right?** I'm proposing `triaged` not `merged`. Triaged means "acknowledged, scheduled." But this audit is a multi-session arc. If we lose context between now and audit completion, will the next session understand the schedule from the inbox file alone? Should I encode the schedule MORE concretely (e.g., as a sub-task or a separate planning artifact in `.planning/phases/`)?

3. **Counter-notify timing.** Cross-project-issues v1.2 protocol says counter-notify fires on terminal-state transition (merged or rejected). `triaged` isn't terminal. Should I:
   - Wait until the audit finishes to counter-notify (matches protocol)?
   - Send an early "schedule-set" counter-notify (helps conversations side coordinate)?
   - Both — schedule-set now, closure-notify later?

4. **The cross-AI review requirement is RECURSIVE.** The inbox item says the audit's plan AND solution must be cross-AI reviewed. That's two more codex calls minimum during the audit itself. Is that proportionate, or is the audit slipping into "review the review the review"? I think it's proportionate at this stake level, but pushback welcome.

5. **The subagent brief framing.** The inbox item mandates specific subagent briefing requirements (anti-bias note, cross-session context, path-claim verification). My disposition reaffirms these. But should the disposition just adopt them by reference, or restate them so they survive context loss?

6. **The "would we deprecate memory-nexus" open question.** The inbox item's Open Question #4 explicitly raises whether the audit might recommend deprecating memory-nexus. My disposition doesn't address this — should it? Is dodging the question itself a form of bias?

7. **Phase 32 — Is "CLI Surface" really architectural?** I'm using Phase 32's reorganization as the trigger for "audit before Phase 32." But if Phase 32 is just labeled-help groupings (no command renames per the v4-milestone memory), it might be too superficial to gate on. Should the audit trigger be tied to Phase 33 (extraction foundation) instead?

8. **My honest belief about A/B/C.** First-principles, BEFORE the audit, my prior is: option C (surgical consolidation) is probably right because the user's "lots of similar but different" worry suggests fragmentation, not under-investment. But I'm wary of pre-committing to an outcome before the audit runs — that defeats its purpose. Is stating my prior here useful disclosure or biasing future agents?

## Constraints / non-goals

- This is a TRIAGE disposition, NOT the audit itself. The audit is a separate (multi-session) arc.
- The audit's actual content + recommendations are not in scope here. We're deciding WHEN and HOW it runs.
- If your reasoning supports rejecting the inbox item entirely (e.g., "the worry is being mis-categorized; this isn't an architecture problem"), say so — but recognize that contradicts the user's stated worry, which carries high authority.

Push back hard.

2026-05-11T04:41:13.665528Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Server returned error response: invalid_grant: Invalid refresh token"))
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Completed
codex
I’ll treat this as a disposition review, not an implementation request. I’m going to verify the local inbox/protocol state before giving a hard verdict, because a few of your premises depend on current repo documents rather than pure reasoning.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'git status --short' in C:\Projects\memory-nexus
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem -Force' in C:\Projects\memory-nexus
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"memory-nexus|cross-project|counter-notify|architecture audit|Phase 32|Phase 33|triaged|merged|rejected\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md" in C:\Projects\memory-nexus
 succeeded in 5729ms:
84:- The user explicitly rejected shared-agent churn: "doesn't make changes to the GSD project agent that will break once I update gsd" -> keep durable process rules in project-scoped docs/memory rather than upstream GSD internals. [Task 1]
99:- Symptom: merge/review artifacts claim a plan landed but the main tree disagrees. Cause: conflict resolution preserved summaries or trackers but lost the code commit. Fix: compare merged code, test counts, and actual file content after merge. [Task 1]
149:- When a shared security tool is implicated, the user said "I don't want to defer at all" because authkey is used by other projects -> treat cross-project secret leaks as urgent, not backlog-grade. [Task 1]
166:- Symptom: a scrub is declared done but contradictory wording remains elsewhere. Cause: only the new residual row was checked. Fix: grep the exact rejected phrase family and near-equivalents before approval. [Task 4]
313:- The user wanted GSD artifacts kept "clean and proper" and rejected silent deferral unless there is "a clear owner and a concrete trigger" -> preserve plan boundaries and surface debt explicitly. [Task 2][Task 3]
332:applies_to: cwd=C:\Projects\conversations; reuse_rule=Safe to reuse for this conversations checkout and closely related cross-project orchestration work; treat exact hook paths and reminder IDs as checkout-specific.
352:- cross-project-issues, docs/inbox/README.md, inbox-lint.cjs, getProjectsRoot, PROJECTS_ROOT, deferred-reminders-protocol, channels, Telegram plugin, phase_complete
369:- The user preferred centralized tooling when it is a cross-project concern: "IF it's going to be centralised then let it be in this project folder" -> put ecosystem utilities in conversations rather than scattering copies. [Task 2]
385:- Symptom: cross-project tooling drifts into duplicate implementations. Cause: local copies are created instead of choosing a single orchestration home. Fix: centralize shared utilities in conversations and point other projects at them. [Task 2]
390:applies_to: cwd=C:\Projects\conversations; reuse_rule=Safe to reuse for this conversations checkout and closely related cross-project tooling decisions; treat exact file paths, package names, and temporary review outputs as checkout-specific.
435:- The user wanted plans reviewed and "crystallized" before implementation, and rejected self-review as sufficient. [Task 2]
539:- The user rejected solo-maintainer framing: "I've chosen not to build it with the mindset as it'll make me cut corners" -> do not lower standards on this repo because it is a solo-maintained fork. [Task 1]
620:- Symptom: dev-cost recommendations are rejected as premature. Cause: launch-tier assumptions were made before distinguishing dev validation vs launch provisioning. Fix: ask which phase the user cares about before recommending paid tiers. [Task 2]
649:- `ssh desktop` resolved correctly in this environment, so the blocker was not DNS or aliasing; OpenSSH rejected `C:\Users\Destiny\.ssh\id_ed25519` because `DESTINY\CodexSandboxUsers` still had inherited read access. [Task 1]

hook: PostToolUse
 succeeded in 6021ms:
 m .claude/worktrees/agent-aa39fad9
 M bun.lock
 M package.json
?? .planning/reviews/2026-05-08-paths-ts-test-isolation-codex-review.md
?? .planning/reviews/2026-05-08-paths-ts-test-isolation-plan.md
?? .planning/reviews/2026-05-11-architecture-audit-disposition-codex-review.md
?? .planning/reviews/2026-05-11-architecture-audit-disposition-plan.md

hook: PostToolUse
 succeeded in 6558ms:


    Directory: C:\Projects\memory-nexus


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
d----l         6/22/2025   8:40 AM                .cc-guardian                                                         
d----l          5/8/2026  10:30 AM                .claude                                                              
d--h-l         5/11/2026   5:41 AM                .git                                                                 
d----l          5/8/2026   6:06 PM                .planning                                                            
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
-a----         5/10/2026  10:19 PM          86516 bun.lock                                                             
-a---l         1/27/2026  12:53 PM            235 bunfig.toml                                                          
-a---l         2/25/2026   9:14 PM           7232 CLAUDE.md                                                            
-a---l         2/25/2026   9:13 PM           2109 MIGRATION.md                                                         
-a----         5/10/2026  10:19 PM           2548 package.json                                                         
-a----          5/8/2026   8:19 PM           6357 README.md                                                            
-a---l          2/5/2026   9:58 PM           1866 stryker.config.js                                                    
-a---l          2/5/2026   7:12 PM             27 test-corrupt.db                                                      
-a---l         2/28/2026  11:26 PM             32 TO-DOS.md                                                            
-a---l         1/27/2026  12:48 PM            727 tsconfig.json                                                        
-a---l          3/1/2026  12:57 AM            573 tsconfig.lib.json                                                    
-a---l          2/5/2026   9:21 PM           1063 vitest.config.ts                                                     



hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
The repo has a dirty worktree with planning/review files and package changes, so I’m going to avoid touching anything and keep this to verification plus review. Next I’m checking the inbox item and the local inbox protocol so the disposition advice lines up with the project’s actual state labels.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\2026-05-08-conversations-first-principles-architecture-audit.md" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem docs\\inbox -Force" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "status:|triaged|merged|rejected|counter|notify|archive|archived|schedule" docs .planning README.md package.json' in C:\Projects\memory-nexus
 succeeded in 4592ms:
docs\03-DECISION-JOURNEY.md:15:### The Problem Emerged
docs\03-DECISION-JOURNEY.md:100:This project emerged from a specific conversation pattern worth noting:
docs\03-DECISION-JOURNEY.md:102:1. **Practical friction** - User encountered real workflow limitation
docs\01-VISION.md:121:- Permanent archive (no automatic deletion)
docs\agent-write-protocol.md:90:- **Over:** What was rejected
.planning\codebase\CONCERNS.md:162:Options that were rejected with documented rationale.
docs\audits\2026-04-26-adversarial-perf-tests.md:328:2. **Is the 942 MB backup file a one-off or part of a recurring backup loop?** If recurring, what's the rotation? If one-off, why is it in the active data dir instead of an archive subdir?
docs\inbox\README.md:17:When opening this project's CWD session, check this directory for untriaged items:
docs\inbox\README.md:23:Triage steps for each open file (frontmatter `status: open` or unset):
docs\inbox\README.md:26:3. Update frontmatter `status: triaged`, `triaged_at: <today>`
docs\inbox\README.md:29:After merge: `status: merged`, `resolved_at`, `pr_url` → move to `archived/`.
docs\inbox\README.md:30:After reject: `status: rejected`, append rationale → move to `rejected/`.
docs\audits\2026-04-26-adversarial-reliability.md:222:- **Trigger:** Checkpoint with completed sessions overlapping with filter-rejected sessions.
.planning\milestones\v1.0-MILESTONE-AUDIT.md:4:status: tech_debt
.planning\milestones\v1.0-MILESTONE-AUDIT.md:228:**Recommendation:** Proceed to `/gsd:complete-milestone v1` to archive and tag.
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:7:fix_status: none
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:9:status: open
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:47:Likely a Bun-on-Windows runtime bug — memory pressure from accumulating test coverage data, repeated module loads, and SQLite bindings exceeds an internal counter capacity. The integer overflow + KERNEL32 stack signature points to Bun's internals, not to test logic.
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:7:fix_status: none
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:9:status: open
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:10:closure_notify_to: conversations
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:11:closure_notify_reason: The audit's recommendation determines which architecture (A specialized + agent-as-router / B federation router / C surgical consolidation) from the conversations memory architecture inventory becomes load-bearing for memory tooling decisions across all projects. Outcome shapes whether memory-nexus targets a v5.0 federation milestone, accepts narrow-scope steady state, or stops at v4.0.
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:7:fix_status: none
docs\inbox\2026-05-11-memory-nexus-friction-test-phase-30-orphan.md:9:status: open
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:7:fix_status: none
docs\inbox\2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md:9:status: open
docs\audits\2026-04-26-adversarial-ux-dx.md:328:- Retention policy (e.g., auto-archive entries with no activity for 60+ days)
.planning\milestones\v1.0-REQUIREMENTS.md:6:This is the archived requirements specification for v1.0.
.planning\memory\gsd-executor.md:379:- finding: "When parallel worktrees (git worktree) merge to main, STATE.md gets merge conflicts. Check for UU (unmerged) status in git status before committing. Resolve by reading the merged content and using git add to mark resolved."
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:7:fix_status: merged
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:9:status: merged
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:10:triaged_at: 2026-05-11
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:12:closure_notify_to: conversations
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:13:closure_notify_reason: Decision determines whether the held-in-memory friction-primacy proposal in conversations gets closed (status quo accepted) or implemented as a memory-nexus phase. Either resolution closes a pending architectural item.
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:34:   - `memory friction reindex` rebuilds DB from JSONL on demand or schedule
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:94:**Decision: Option 1 — Status quo (DB canonical, JSONL transient ingestion channel).** No code change ships. The "flip primacy" proposal (Option 2) is rejected. Documentation in `~/.claude/rules/tool-friction.md` updated to remove confusion source.
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:98:### What was rejected and why
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:100:The "flip primacy to JSONL" proposal was rejected on **cost/benefit grounds**, not feasibility. The proposal's why-list (robustness via append-only, AI-first readability, schema-break safety, crash resilience, mimicry of `memory sync`) describes real properties, but each is either already addressed by simpler means or doesn't justify the cost of a second storage discipline for an auxiliary signal:
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:126:This disposition closes the held-in-memory proposal at `~/.claude/projects/C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-conversations/memory/friction_primacy_flip_pending.md`. The closure-notify counter-notification will be filed in `~/Projects/conversations/docs/inbox/` per the v1.2 closure-notify protocol.
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:130:Following codex's pushback #4: the inbox item title is "Decide friction-primacy: status quo vs flip" — a DECISION. The decision was made, with an accepted doc-update outcome and a closure-notify. So `status: merged` is correct (decision merged), with "rejected JSONL-canonical flip" stated in the body. `status: rejected` would only apply if the inbox item were narrowly "flip primacy to JSONL."
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:134:`~/.claude/rules/tool-friction.md` is outside the memory-nexus repo. The update was applied as part of this triage because the rule's wording IS the confusion source the inventory identified. Verified the edits land in the global rules directory before marking this as merged.
.planning\debug\resolved\path-decoding-lossy.md:2:status: resolved
docs\plans\2026-03-07-knowledge-layer-friction-design.md:93:  status: FrictionStatus;
.planning\memory\gsd-phase-researcher.md:60:  status: superseded
docs\plans\handoff-claude-analysis.md:25:- **What happened:** Friction encountered in get-stuff-done project, but the fix belongs in memory-nexus
docs\plans\handoff-claude-analysis.md:36:- **Lifecycle management** (open -> fixed -> archived)
docs\plans\handoff-claude-analysis.md:84:3. Claude logs friction when encountered, as part of normal work
.planning\memory\gsd-integration-checker.md:12:  status: "RESOLVED by Phase 20"
.planning\memory\gsd-integration-checker.md:25:  status: "OPEN - gap in INTEG-03 coverage"
.planning\memory\gsd-integration-checker.md:38:  status: "RESOLVED by Phase 21"
docs\plans\handoff-user-thoughts.md:32:3. **Auto-capture from all projects** -- every session logs friction as it encounters it
.planning\memory\gsd-roadmapper.md:13:- finding: "Project is brownfield. v1.0 shipped with Phases 1-12 (56 plans). v2.0 phases start at 13. The v1.0 roadmap is archived at .planning/milestones/v1.0-ROADMAP.md and collapsed in the main ROADMAP.md."
.planning\memory\gsd-verifier.md:158:    status: superseded
.planning\STATE.md:5:status: executing
.planning\STATE.md:22:**Current Focus:** Out-of-roadmap test-isolation cleanup paused at Stage 13/14 (paths.ts remains). Resume v4.0 Phase 32 (CLI Surface) once paths.ts done OR triaged.
.planning\v2.0-MILESTONE-AUDIT.md:26:**All 10 phases verified with status: passed. Zero gaps across all phases.**
.planning\reviews\2026-05-07-test-isolation-plan.md:77:1. **Is the DI-via-options pattern the right canonical seam, or is there a better one?** Alternatives considered: a DependencyContainer/IoC system; environment variables; a global injector singleton. I rejected those as overkill for a CLI tool of this size, but is that judgment right?
.planning\reviews\2026-05-08-paths-ts-test-isolation-codex-review.md:227:   I would require: env var is an exact directory path; empty string is ignored; no shell-style `~` expansion unless the project already does that elsewhere; relative paths are either rejected or resolved against `cwd` deliberately. Silent relative-path behavior is a future support trap.
.planning\reviews\2026-05-08-paths-ts-test-isolation-codex-review.md:301:   I would require: env var is an exact directory path; empty string is ignored; no shell-style `~` expansion unless the project already does that elsewhere; relative paths are either rejected or resolved against `cwd` deliberately. Silent relative-path behavior is a future support trap.
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:20:The inbox item is filed at `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md` and is currently `status: open`. Its acceptance criteria: audit document landed, cross-AI reviewed, recommendation explicit, concrete next-step actionable.
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:40:I am writing the disposition for this inbox item. The decision is NOT "run the audit now" (that's a separate execution decision); it's **what disposition to set on the inbox file, and what schedule to commit to**.
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:55:The right disposition is NOT `merged` (audit hasn't run). NOT `rejected` (user's worry is real, scope is well-framed). The right state is `triaged` with an explicit schedule commitment.
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:57:The schedule question is the real architectural call: WHEN to run the audit relative to v4.0 phases.
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:78:- Con: complicates inbox accounting (partial merge vs in-progress vs scheduled)
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:94:1. Set `status: triaged`, `triaged_at: 2026-05-11`
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:100:3. File stays in `docs/inbox/` (not moved to archived/) because the audit hasn't run
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:101:4. Counter-notify `conversations` with the SCHEDULE, not a closure outcome — but mark it as schedule-set so the conversations side knows the audit is committed
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:102:5. After audit lands: re-triage to `merged` (audit done) with audit-doc path in body, then move to archived/
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:110:2. **Is the inbox-disposition meta-discipline tracking right?** I'm proposing `triaged` not `merged`. Triaged means "acknowledged, scheduled." But this audit is a multi-session arc. If we lose context between now and audit completion, will the next session understand the schedule from the inbox file alone? Should I encode the schedule MORE concretely (e.g., as a sub-task or a separate planning artifact in `.planning/phases/`)?
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:112:3. **Counter-notify timing.** Cross-project-issues v1.2 protocol says counter-notify fires on terminal-state transition (merged or rejected). `triaged` isn't terminal. Should I:
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:113:   - Wait until the audit finishes to counter-notify (matches protocol)?
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:114:   - Send an early "schedule-set" counter-notify (helps conversations side coordinate)?
.planning\reviews\2026-05-11-architecture-audit-disposition-plan.md:115:   - Both — schedule-set now, closure-notify later?
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:32:The inbox item is filed at `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md` and is currently `status: open`. Its acceptance criteria: audit document landed, cross-AI reviewed, recommendation explicit, concrete next-step actionable.
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:52:I am writing the disposition for this inbox item. The decision is NOT "run the audit now" (that's a separate execution decision); it's **what disposition to set on the inbox file, and what schedule to commit to**.
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:67:The right disposition is NOT `merged` (audit hasn't run). NOT `rejected` (user's worry is real, scope is well-framed). The right state is `triaged` with an explicit schedule commitment.
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:69:The schedule question is the real architectural call: WHEN to run the audit relative to v4.0 phases.
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:90:- Con: complicates inbox accounting (partial merge vs in-progress vs scheduled)
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:106:1. Set `status: triaged`, `triaged_at: 2026-05-11`
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:112:3. File stays in `docs/inbox/` (not moved to archived/) because the audit hasn't run
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:113:4. Counter-notify `conversations` with the SCHEDULE, not a closure outcome — but mark it as schedule-set so the conversations side knows the audit is committed
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:114:5. After audit lands: re-triage to `merged` (audit done) with audit-doc path in body, then move to archived/
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:122:2. **Is the inbox-disposition meta-discipline tracking right?** I'm proposing `triaged` not `merged`. Triaged means "acknowledged, scheduled." But this audit is a multi-session arc. If we lose context between now and audit completion, will the next session understand the schedule from the inbox file alone? Should I encode the schedule MORE concretely (e.g., as a sub-task or a separate planning artifact in `.planning/phases/`)?
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:124:3. **Counter-notify timing.** Cross-project-issues v1.2 protocol says counter-notify fires on terminal-state transition (merged or rejected). `triaged` isn't terminal. Should I:
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:125:   - Wait until the audit finishes to counter-notify (matches protocol)?
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:126:   - Send an early "schedule-set" counter-notify (helps conversations side coordinate)?
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:127:   - Both — schedule-set now, closure-notify later?
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:177:"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"memory-nexus|cross-project|counter-notify|architecture audit|Phase 32|Phase 33|triaged|merged|rejected\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md" in C:\Projects\memory-nexus
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:179:84:- The user explicitly rejected shared-agent churn: "doesn't make changes to the GSD project agent that will break once I update gsd" -> keep durable process rules in project-scoped docs/memory rather than upstream GSD internals. [Task 1]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:180:99:- Symptom: merge/review artifacts claim a plan landed but the main tree disagrees. Cause: conflict resolution preserved summaries or trackers but lost the code commit. Fix: compare merged code, test counts, and actual file content after merge. [Task 1]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:182:166:- Symptom: a scrub is declared done but contradictory wording remains elsewhere. Cause: only the new residual row was checked. Fix: grep the exact rejected phrase family and near-equivalents before approval. [Task 4]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:183:313:- The user wanted GSD artifacts kept "clean and proper" and rejected silent deferral unless there is "a clear owner and a concrete trigger" -> preserve plan boundaries and surface debt explicitly. [Task 2][Task 3]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:189:435:- The user wanted plans reviewed and "crystallized" before implementation, and rejected self-review as sufficient. [Task 2]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:190:539:- The user rejected solo-maintainer framing: "I've chosen not to build it with the mindset as it'll make me cut corners" -> do not lower standards on this repo because it is a solo-maintained fork. [Task 1]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:191:620:- Symptom: dev-cost recommendations are rejected as premature. Cause: launch-tier assumptions were made before distinguishing dev validation vs launch provisioning. Fix: ask which phase the user cares about before recommending paid tiers. [Task 2]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:192:649:- `ssh desktop` resolved correctly in this environment, so the blocker was not DNS or aliasing; OpenSSH rejected `C:\Users\Destiny\.ssh\id_ed25519` because `DESTINY\CodexSandboxUsers` still had inherited read access. [Task 1]
.planning\reviews\2026-05-11-architecture-audit-disposition-codex-review.md:267:"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "status:|triaged|merged|rejected|counter|notify|archive|archived|schedule" docs .planning README.md package.json' in C:\Projects\memory-nexus
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:101:3. File status: `rejected` (not `merged`, since no code change ships) with detailed rationale.
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:102:4. Notify `closure_notify_to: conversations` via the automated script.
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:116:4. **Is "rejected" the right status, or should it be "merged" with the doc fix?** The doc fix IS a change, and the conversations notification has a `closure_notify_reason` that implies a real decision was made. "rejected" technically applies to the FLIP, not to the inbox item itself. Should the schema's status field be used differently?
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:127:- The disposition gets written into the inbox file's body. Final status updates `frontmatter.status` to terminal (`merged` or `rejected`) and triggers the automated closure-notify to conversations.
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:283:On status: I would use **`merged`**, not `rejected`, if the inbox item is “decide friction primacy” and the accepted resolution is “keep DB canonical + clarify docs.” `rejected` only fits if the item is narrowly “flip primacy to JSONL.” Since your own disposition includes an accepted doc/rule change and a closure notification, `merged` is cleaner. Put the rejected part in the body: “Rejected JSONL-canonical flip.”
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:287:Doc fix should be part of this triage, because the confusion source is the rule wording. But be careful: `~/.claude/rules/tool-friction.md` is outside the repo. The disposition should say “merged with external rule-doc update required/applied,” depending on whether you actually perform it. Also update “should auto-ingest” to “does auto-ingest” if verified.
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:306:On status: I would use **`merged`**, not `rejected`, if the inbox item is “decide friction primacy” and the accepted resolution is “keep DB canonical + clarify docs.” `rejected` only fits if the item is narrowly “flip primacy to JSONL.” Since your own disposition includes an accepted doc/rule change and a closure notification, `merged` is cleaner. Put the rejected part in the body: “Rejected JSONL-canonical flip.”
.planning\reviews\2026-05-11-friction-primacy-disposition-codex-review.md:310:Doc fix should be part of this triage, because the confusion source is the rule wording. But be careful: `~/.claude/rules/tool-friction.md` is outside the repo. The disposition should say “merged with external rule-doc update required/applied,” depending on whether you actually perform it. Also update “should auto-ingest” to “does auto-ingest” if verified.
.planning\reviews\2026-05-11-friction-primacy-disposition-plan.md:89:3. File status: `rejected` (not `merged`, since no code change ships) with detailed rationale.
.planning\reviews\2026-05-11-friction-primacy-disposition-plan.md:90:4. Notify `closure_notify_to: conversations` via the automated script.
.planning\reviews\2026-05-11-friction-primacy-disposition-plan.md:104:4. **Is "rejected" the right status, or should it be "merged" with the doc fix?** The doc fix IS a change, and the conversations notification has a `closure_notify_reason` that implies a real decision was made. "rejected" technically applies to the FLIP, not to the inbox item itself. Should the schema's status field be used differently?
.planning\reviews\2026-05-11-friction-primacy-disposition-plan.md:115:- The disposition gets written into the inbox file's body. Final status updates `frontmatter.status` to terminal (`merged` or `rejected`) and triggers the automated closure-notify to conversations.
.planning\reviews\2026-05-07-test-isolation-codex-review.md:89:1. **Is the DI-via-options pattern the right canonical seam, or is there a better one?** Alternatives considered: a DependencyContainer/IoC system; environment variables; a global injector singleton. I rejected those as overkill for a CLI tool of this size, but is that judgment right?
.planning\reviews\2026-05-07-test-isolation-codex-review.md:2095:.\src\infrastructure\hooks\log-writer.ts:150:            const archiveDate = new Date().toISOString().split("T")[0];
.planning\reviews\2026-05-07-test-isolation-codex-review.md:2791:src\infrastructure\hooks\auto-memory-writer.ts:96:        writeFileSync(memoryPath, merged, "utf-8");
.planning\reviews\2026-05-07-test-isolation-codex-review.md:2808:src\infrastructure\hooks\config-manager.ts:344:    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
.planning\reviews\2026-05-07-test-isolation-codex-review.md:3000:src\infrastructure\hooks\log-writer.ts:150:            const archiveDate = new Date().toISOString().split("T")[0];
.planning\research\ARCHITECTURE.md:518:- `~/.claude/rules-archive/hexagonal-architecture.md` - Hexagonal architecture requirements
.planning\research\CLI-SURFACE-PATTERNS.md:303:AI-specific CLIs tend to be **simpler, not more complex** than their data-management counterparts. They optimize for a single interaction mode (usually conversational or single-shot) and push complexity into flags rather than subcommands.
.planning\todos\infrastructure-checkpoint-eunknown-error-during-sync.md:5:status: pending
.planning\todos\infrastructure-onnx-binding-fails-in-bundled-dist.md:5:status: pending
.planning\research\HONCHO-ARCHITECTURE.md:121:- Triggered: scheduled or explicit dream task via queue
.planning\research\HONCHO-ARCHITECTURE.md:155:**When:** After sync, on explicit command, or on schedule
.planning\research\FEATURES.md:105:| Permanent archive | Low | No automatic deletion (unlike Claude Code's 30-day) | Solving the data loss problem |
.planning\todos\ui-model-download-progress-size-display.md:5:status: pending
.planning\research\HONCHO-COMPARISON.md:10:| **Purpose** | Multi-user AI personalization platform | Single-developer session archive + search |
.planning\research\HONCHO-FEATURES.md:54:   - Runs on schedule or explicit trigger
.planning\todos\ui-status-command-slow-response.md:5:status: pending
.planning\research\HONCHO-PITFALLS.md:47:  - Session history preservation (Claude Memory is about preferences, not conversation archive)
.planning\research\HONCHO-PITFALLS.md:104:| @chude/memory | Session archive + search | Yes (local-first) | Claude Code developers |
.planning\research\HONCHO-SUMMARY.md:11:Honcho solves a fundamentally different problem than @chude/memory. Honcho is a multi-user, multi-agent personalization platform designed for production SaaS applications that need to understand their users over time. It requires PostgreSQL + pgvector, multiple LLM API keys (Anthropic, OpenAI, Gemini, Groq), and background worker processes. @chude/memory is a local-first, single-developer tool that extracts existing Claude Code session data into a searchable archive. These are complementary tools operating at different scales and for different audiences.
.planning\phases\06-search-command-fts5\06-01-SUMMARY.md:93:## Issues Encountered
.planning\phases\03-jsonl-parsing-and-extraction\03-VERIFICATION.md:4:status: passed
.planning\phases\04-storage-adapters\04-VERIFICATION.md:4:status: passed
.planning\phases\02-database-schema-and-ports\02-UAT.md:2:status: complete
.planning\research\SEMANTIC-SEARCH.md:109:| **Windows** | Working (with caveat) | Bun 1.2.5 had a regression (Issue #18079) -- fix merged in PR #18107. Pin Bun >= 1.2.6 on Windows. |
.planning\research\SEMANTIC-SEARCH.md:584:| `onnxruntime-node` | Working (pinned) | Win needs >= Bun 1.2.6 | MEDIUM | PR #18107 merged, but future regressions possible |
.planning\research\SEMANTIC-SEARCH.md:729:| Transformers.js + Bun compatibility | HIGH | Issue #558 closed, fix merged, multiple working examples |
.planning\research\SEMANTIC-SEARCH.md:733:| onnxruntime-node Windows stability | MEDIUM | Fix merged for 1.2.5 regression, but future regressions possible |
.planning\phases\phase-01\PLAN.md:143:- RED: Test validation (empty query rejected)
.planning\phases\06-search-command-fts5\06-02-SUMMARY.md:92:## Issues Encountered
.planning\phases\04-storage-adapters\04-UAT.md:2:status: complete
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:4:status: passed
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:7:  previous_status: passed
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:160:**Previous status:** passed (8/8 truths, 2026-01-29)
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:163:**Current status:** passed (12/12 truths, all gaps closed)
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:4:status: passed
.planning\phases\06-search-command-fts5\06-UAT.md:2:status: complete
.planning\phases\06-search-command-fts5\06-UAT.md:54:  status: failed
.planning\phases\06-search-command-fts5\06-UAT.md:73:  status: failed
.planning\phases\13-package-rename\13-VERIFICATION.md:4:status: passed
.planning\phases\phase-01\01-UAT.md:2:status: complete
.planning\phases\06-search-command-fts5\06-VERIFICATION-OLD.md:4:status: passed
.planning\phases\05-basic-sync-command\05-UAT.md:2:status: complete
.planning\research\SUMMARY.md:10:1. **Stack clarity emerged**: Bun's built-in SQLite driver (bun:sqlite) is the correct choice, NOT better-sqlite3 which has ABI compatibility issues with Bun. FTS5 full-text search is enabled on Linux, with macOS requiring a workaround.
.planning\research\SUMMARY.md:63:- Permanent archive (no 30-day deletion like Claude Code)
.planning\research\SUMMARY.md:357:- `~/.claude/rules-archive/hexagonal-architecture.md` - Hexagonal architecture requirements
.planning\phases\06-search-command-fts5\06-03-SUMMARY.md:113:## Issues Encountered
.planning\phases\13-package-rename\13-UAT.md:2:status: complete
.planning\phases\08-stats-and-list-commands\08-VERIFICATION.md:4:status: passed
.planning\phases\08-stats-and-list-commands\08-VERIFICATION.md:7:  previous_status: passed
.planning\phases\05-basic-sync-command\05-RESEARCH.md:197:    status: "pending",
.planning\phases\04-storage-adapters\04-04-SUMMARY.md:118:## Issues Encountered
.planning\phases\08-stats-and-list-commands\08-UAT.md:2:status: complete
.planning\phases\08-stats-and-list-commands\08-UAT.md:79:  status: closed
.planning\phases\08-stats-and-list-commands\08-UAT.md:85:  status: closed
.planning\phases\08-stats-and-list-commands\08-UAT.md:91:  status: closed
.planning\phases\02-database-schema-and-ports\02-02-SUMMARY.md:43:- Default values (counters, timestamps)
.planning\phases\13-package-rename\13-RESEARCH.md:212:    status: "not-needed" | "pending" | "complete" | "partial";
.planning\phases\05-basic-sync-command\05-02-PLAN.md:249:       status: "pending",
.planning\phases\13-package-rename\13-01-SUMMARY.md:120:## Issues Encountered
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:113:Tool uses are nested in assistant message content. When we encounter a tool_use block, we should yield both:
.planning\phases\04-storage-adapters\04-03-SUMMARY.md:105:## Issues Encountered
.planning\phases\13-package-rename\13-02-SUMMARY.md:143:## Issues Encountered
.planning\phases\13-package-rename\13-03-PLAN.md:54:Purpose: Finalizes the rename by creating the artifacts users will encounter: the deprecation stub (what happens when someone installs the old package name), migration documentation (how to upgrade), updated project documentation, updated external WoW rules, and the "detect stale memory-nexus hooks" warning in the install command per the locked decision.
.planning\phases\13-package-rename\13-03-SUMMARY.md:5:status: completed
.planning\phases\13-package-rename\13-01-PLAN.md:147:    - `getMigrationStatus()`: Check if legacy dir exists and if new paths exist. Returns `{ legacyExists: boolean; newExists: boolean; status: MigrationStatus }`
.planning\phases\04-storage-adapters\04-02-SUMMARY.md:114:## Issues Encountered
.planning\phases\31-bug-fixes\31-02-SUMMARY.md:87:## Issues Encountered
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:123:## Issues Encountered
.planning\phases\31-bug-fixes\31-01-SUMMARY.md:87:## Issues Encountered
.planning\phases\21-architecture-boundary-cleanup\21-VERIFICATION.md:4:status: passed
.planning\phases\07-filtering-and-output-formatting\07-02-SUMMARY.md:89:## Issues Encountered
.planning\phases\19-verification-closure\19-VERIFICATION.md:4:status: passed
.planning\phases\19-verification-closure\19-VERIFICATION.md:22:| 1 | Phase 13 VERIFICATION.md exists and confirms all 5 RENAME requirements satisfied | VERIFIED | `.planning/phases/13-package-rename/13-VERIFICATION.md` exists with `status: passed`, `score: 5/5`. All 5 RENAME requirements (RENAME-01 through RENAME-05) listed as SATISFIED with commit evidence. All 6 Phase 13 implementation commits (7129a56, d8a38cb, cd9a5e6, 0ee3f88, 5fc9677, fa59a1a) confirmed present in git log. |
.planning\phases\19-verification-closure\19-VERIFICATION.md:23:| 2 | Phase 18 VERIFICATION.md reflects the StatusOptions export fix (INTEG-04 status updated from PARTIAL to SATISFIED) | VERIFIED | `.planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md` has `status: passed`, `score: 4/4`, `re_verification: true`. INTEG-04 row shows SATISFIED. StatusOptions export chain confirmed: exported from `status.ts:44`, re-exported through `commands/index.ts:53` and `src/index.ts:59-60`. Commit 38e4b29 confirmed present. |
.planning\phases\19-verification-closure\19-VERIFICATION.md:34:| `.planning/phases/13-package-rename/13-VERIFICATION.md` | Phase 13 verification closing RENAME-01, RENAME-03, RENAME-04, RENAME-05 orphan gap | VERIFIED | Contains `status: passed`, 5/5 observable truths VERIFIED, all 5 RENAME requirements SATISFIED with commit evidence, 7 artifacts listed, 4 key links verified. |
.planning\phases\19-verification-closure\19-VERIFICATION.md:35:| `.planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md` | Phase 18 re-verification reflecting INTEG-04 fix | VERIFIED | Updated to `status: passed`, `score: 4/4`, `re_verification: true`. INTEG-04 SATISFIED. StatusOptions anti-pattern items marked RESOLVED. |
.planning\phases\09-context-and-related-commands\09-VERIFICATION.md:4:status: passed
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-VERIFICATION.md:4:status: passed
.planning\phases\24-friction-system\CONTEXT.md:38:  status: FrictionStatus;
.planning\phases\24-friction-system\CONTEXT.md:89:  updateStatus(id: number, status: FrictionStatus): Promise<void>;
.planning\phases\24-friction-system\CONTEXT.md:150:When you encounter friction with the memory tool (commands that fail,
.planning\phases\19-verification-closure\19-RESEARCH.md:55:status: passed | gaps_found
.planning\phases\09-context-and-related-commands\09-UAT.md:2:status: complete
.planning\phases\09-context-and-related-commands\09-UAT.md:106:  status: noted
.planning\phases\09-context-and-related-commands\09-UAT.md:116:  status: not_a_bug
.planning\phases\09-context-and-related-commands\09-UAT.md:128:  status: noted
.planning\phases\11-session-navigation\11-UAT.md:2:status: complete
.planning\phases\21-architecture-boundary-cleanup\21-01-SUMMARY.md:94:## Issues Encountered
.planning\phases\24-friction-system\24-VERIFICATION.md:4:status: passed
.planning\phases\16-hybrid-search\16-VERIFICATION.md:4:status: passed
.planning\phases\16-hybrid-search\16-VERIFICATION.md:34:| 5 | Partial embedding coverage uses hybrid (vector for embedded, FTS for rest) merged via RRF | VERIFIED | Hybrid path at line 470-651: FTS covers all messages, vector covers embedded subset, both fed to `reciprocalRankFusion()`; partial coverage is structural to the RRF composition |
.planning\phases\16-hybrid-search\16-VERIFICATION.md:50:| `src/infrastructure/hooks/config-manager.ts` | `SearchConfigData`, `DEFAULT_SEARCH_CONFIG`, deep-merged `search` section | VERIFIED | `defaultMode: "auto"`, `temporalDecay: { enabled: true, halfLifeDays: 30 }`, `hintShown?: boolean`; two-level deep merge at lines 203-210 |
.planning\phases\19-verification-closure\19-01-SUMMARY.md:89:## Issues Encountered
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-UAT.md:2:status: complete
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-UAT.md:56:  status: failed
.planning\phases\11-session-navigation\11-RESEARCH.md:200:    rejected: string[];
.planning\phases\11-session-navigation\11-RESEARCH.md:548:   - Format: { subject, decision, rejected[], rationale }
.planning\phases\11-session-navigation\11-RESEARCH.md:549:   - Example: { subject: "database", decision: "use SQLite", rejected: ["PostgreSQL"], rationale: "embedded, no server" }
.planning\phases\11-session-navigation\11-RESEARCH.md:559:  "decisions": [{ "subject": "...", "decision": "...", "rejected": [], "rationale": "...", "confidence": 0.0-1.0 }],
.planning\phases\09-context-and-related-commands\09-04-SUMMARY.md:82:## Issues Encountered
.planning\phases\24-friction-system\24-RESEARCH.md:306:  status: FrictionStatus;
.planning\phases\19-verification-closure\19-01-PLAN.md:25:      contains: "status: passed"
.planning\phases\19-verification-closure\19-01-PLAN.md:90:status: passed
.planning\phases\19-verification-closure\19-01-PLAN.md:140:    <automated>test -f ".planning/phases/13-package-rename/13-VERIFICATION.md" && grep -q "status: passed" ".planning/phases/13-package-rename/13-VERIFICATION.md" && grep -q "RENAME-01" ".planning/phases/13-package-rename/13-VERIFICATION.md" && grep -q "RENAME-05" ".planning/phases/13-package-rename/13-VERIFICATION.md" && echo "PASS" || echo "FAIL"</automated>
.planning\phases\19-verification-closure\19-01-PLAN.md:142:  <done>13-VERIFICATION.md exists with status: passed, score: 5/5, all 5 RENAME requirements listed as SATISFIED with commit evidence, all 5 observable truths VERIFIED.</done>
.planning\phases\19-verification-closure\19-01-PLAN.md:154:   - Change `status: gaps_found` to `status: passed`
.planning\phases\19-verification-closure\19-01-PLAN.md:187:    <automated>grep -q "status: passed" ".planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md" && grep -q "re_verification: true" ".planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md" && grep -q "4/4" ".planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md" && echo "PASS" || echo "FAIL"</automated>
.planning\phases\19-verification-closure\19-01-PLAN.md:293:1. Phase 13 VERIFICATION.md exists with status: passed, 5/5 truths VERIFIED, 5 RENAME requirements SATISFIED
.planning\phases\19-verification-closure\19-01-PLAN.md:294:2. Phase 18 VERIFICATION.md updated to status: passed, 4/4 truths VERIFIED, INTEG-04 SATISFIED, re_verification: true
.planning\phases\19-verification-closure\19-01-PLAN.md:300:grep -q "status: passed" .planning/phases/13-package-rename/13-VERIFICATION.md
.planning\phases\19-verification-closure\19-01-PLAN.md:303:grep -q "status: passed" .planning/phases/18-api-stabilization-and-aidev-integration-readiness/18-VERIFICATION.md
.planning\phases\19-verification-closure\19-01-PLAN.md:314:- 13-VERIFICATION.md exists with status: passed and all RENAME requirements SATISFIED
.planning\phases\19-verification-closure\19-01-PLAN.md:315:- 18-VERIFICATION.md shows status: passed with re_verification: true and INTEG-04 SATISFIED
.planning\phases\11-session-navigation\11-CONTEXT.md:35:- **Structure:** `{ subject, decision, rejected[], rationale, confidence }`
.planning\phases\16-hybrid-search\16-RESEARCH.md:185:**What:** Reciprocal Rank Fusion implemented as a stateless pure function that takes two ranked lists and produces a merged ranked list.
.planning\phases\24-friction-system\24-03-SUMMARY.md:101:- **Fix:** Marked conflict as resolved (other agent had already merged the content)
.planning\phases\24-friction-system\24-03-SUMMARY.md:110:## Issues Encountered
.planning\phases\24-friction-system\24-01-SUMMARY.md:102:## Issues Encountered
.planning\phases\07-filtering-and-output-formatting\07-06-SUMMARY.md:82:## Issues Encountered
.planning\phases\11-session-navigation\11-05-SUMMARY.md:103:## Issues Encountered
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-02-SUMMARY.md:130:## Issues Encountered
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:4:status: passed
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:4:status: passed
.planning\phases\11-session-navigation\11-02-SUMMARY.md:108:## Issues Encountered
.planning\phases\24-friction-system\24-03-PLAN.md:408:When you encounter friction with the memory tool (commands that fail, output that is unhelpful, missing features, workarounds needed), log it:
.planning\phases\24-friction-system\24-01-PLAN.md:173:  status: FrictionStatus;
.planning\phases\24-friction-system\24-01-PLAN.md:230:  updateStatus(id: number, status: FrictionStatus): Promise<void>;
.planning\phases\24-friction-system\24-01-PLAN.md:318:  status: string;
.planning\phases\07-filtering-and-output-formatting\07-UAT.md:2:status: complete
.planning\phases\07-filtering-and-output-formatting\07-UAT.md:87:  status: resolved (false positive)
.planning\phases\07-filtering-and-output-formatting\07-UAT.md:98:  status: observation
.planning\phases\07-filtering-and-output-formatting\07-UAT.md:108:  status: resolved
.planning\phases\07-filtering-and-output-formatting\07-UAT.md:119:  status: resolved
.planning\phases\11-session-navigation\11-01-PLAN.md:21:    - "Decision entity has structured format with subject, decision, rejected[], rationale"
.planning\phases\11-session-navigation\11-01-PLAN.md:92:  rejected: string[];
.planning\phases\11-session-navigation\11-01-PLAN.md:212:3. DecisionMetadata has structured format (subject, decision, rejected, rationale)
.planning\phases\11-session-navigation\11-05-PLAN.md:140:    "rejected": ["..."],
.planning\phases\11-session-navigation\11-05-PLAN.md:159:6. Decision entities have complete metadata (subject, decision, rejected, rationale)
.planning\phases\16-hybrid-search\16-03-SUMMARY.md:136:## Issues Encountered
.planning\phases\24-friction-system\24-02-SUMMARY.md:117:## Issues Encountered
.planning\phases\11-session-navigation\11-01-SUMMARY.md:102:## Issues Encountered
.planning\phases\11-session-navigation\11-03-SUMMARY.md:124:## Issues Encountered
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-01-SUMMARY.md:131:## Issues Encountered
.planning\phases\11-session-navigation\11-04-SUMMARY.md:136:## Issues Encountered
.planning\phases\12-polish-error-handling\12-05-SUMMARY.md:138:## Issues Encountered
.planning\phases\24-friction-system\24-02-PLAN.md:91:  status: FrictionStatus;
.planning\phases\24-friction-system\24-02-PLAN.md:133:  updateStatus(id: number, status: FrictionStatus): Promise<void>;
.planning\phases\24-friction-system\24-02-PLAN.md:193:Wait -- the CONTEXT.md says `resolve(id: number, resolution: string): Promise<void>` and `updateStatus(id: number, status: FrictionStatus): Promise<void>`. The natural reading is: resolve() closes an item with a resolution (sets status=resolved, resolution=X, resolved_at=now). updateStatus() is for generic status changes. For wont-fix, the CLI command is `memory friction wont-fix 42 --resolution "By design"`. The service's wontFix(id, resolution) should: call updateStatus(id, "wont-fix"), then set resolution + resolvedAt. Since the port only has resolve() and updateStatus(), and resolve() implies status=resolved: the cleanest path is for the service to: for wontFix, directly call the repository with a custom SQL approach. But the port is locked.
.planning\phases\12-polish-error-handling\12-06-SUMMARY.md:93:## Issues Encountered
.planning\phases\10-hook-integration\10-01-PLAN.md:182:  - Rename to sync.log.YYYY-MM-DD (archive)
.planning\phases\10-hook-integration\10-01-PLAN.md:283:6. rotateLogsIfNeeded archives old logs based on retention
.planning\phases\16-hybrid-search\16-02-SUMMARY.md:114:## Issues Encountered
.planning\phases\30-god-file-cleanup\30-02-SUMMARY.md:115:## Issues Encountered
.planning\phases\12-polish-error-handling\12-04-SUMMARY.md:97:## Issues Encountered
.planning\phases\16-hybrid-search\16-02-PLAN.md:148:   - Test hybrid returns results from both FTS and vector, merged by RRF
.planning\phases\10-hook-integration\10-02-SUMMARY.md:112:## Issues Encountered
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:127:**openInBrowser status:** Currently a module-private function (NOT exported) at line 634. It is used as the DEFAULT value for the `openFn` parameter in `handleDashboard` (line 531). In the split, `openInBrowser` stays module-private within `dashboard.ts` -- it is NOT exported. The `handleDashboard` function IS exported so `executeFrictionCommand` can call it.
.planning\phases\12-polish-error-handling\12-11-SUMMARY.md:128:## Issues Encountered
.planning\phases\12-polish-error-handling\12-09-SUMMARY.md:112:## Issues Encountered
.planning\phases\16-hybrid-search\16-01-SUMMARY.md:19:  - Deep-merged search config in loadConfig()
.planning\phases\16-hybrid-search\16-01-SUMMARY.md:96:- `src/infrastructure/hooks/config-manager.ts` - SearchConfigData, DEFAULT_SEARCH_CONFIG, deep-merged search section
.planning\phases\16-hybrid-search\16-01-SUMMARY.md:115:## Issues Encountered
.planning\phases\12-polish-error-handling\12-03-SUMMARY.md:96:## Issues Encountered
.planning\phases\10-hook-integration\10-03-SUMMARY.md:148:## Issues Encountered
.planning\phases\16-hybrid-search\16-01-PLAN.md:95:   - Test `loadConfig()` with `{ search: { defaultMode: 'hybrid' } }` returns merged config with `search.defaultMode === 'hybrid'` AND `search.temporalDecay.enabled === true` (deep merge preserves nested defaults)
.planning\phases\12-polish-error-handling\12-VERIFICATION.md:4:status: gaps_found
.planning\phases\12-polish-error-handling\12-VERIFICATION.md:9:    status: failed
.planning\phases\12-polish-error-handling\12-VERIFICATION.md:83:| QUAL-02: Unit tests for all domain entities and services | SATISFIED | N/A - all domain files have .test.ts counterparts |
.planning\phases\12-polish-error-handling\12-10-SUMMARY.md:116:## Issues Encountered
.planning\phases\12-polish-error-handling\12-02-SUMMARY.md:101:## Issues Encountered
.planning\phases\20-public-api-type-exports\20-01-SUMMARY.md:81:## Issues Encountered
.planning\phases\10-hook-integration\10-03-PLAN.md:327:    console.log("\nTo check status: aidev memory status");
.planning\phases\10-hook-integration\10-03-PLAN.md:515:function formatStatusOutput(status: StatusInfo): void {
.planning\phases\12-polish-error-handling\12-12-SUMMARY.md:95:## Issues Encountered
.planning\phases\10-hook-integration\10-VERIFICATION.md:4:status: passed
.planning\phases\12-polish-error-handling\12-01-SUMMARY.md:102:## Issues Encountered
.planning\phases\17-provider-ecosystem\17-01-SUMMARY.md:115:## Issues Encountered
.planning\phases\10-hook-integration\10-04-SUMMARY.md:96:## Issues Encountered
.planning\phases\29-ambient-context\29-01-PLAN.md:104:    embedding: resolveProviderDefaults(mergedEmbedding, userEmbedding),
.planning\phases\29-ambient-context\29-01-PLAN.md:282:        const merged = mergeMemoryBlock(existing, blockContent);
.planning\phases\29-ambient-context\29-01-PLAN.md:283:        writeFileSync(memoryPath, merged, "utf-8");
.planning\phases\10-hook-integration\10-UAT.md:5:status: complete
.planning\phases\10-hook-integration\10-04-PLAN.md:253:Update stats command to include hook status:
.planning\phases\15-embedding-pipeline\15-01-SUMMARY.md:98:## Issues Encountered
.planning\phases\23-foundation\CONTEXT.md:77:- **Over:** What was rejected
.planning\phases\23-foundation\CONTEXT.md:241:1. Should memory_files FTS be a separate virtual table or merged with messages_fts?
.planning\phases\10-hook-integration\10-RESEARCH.md:303:    const archivePath = `${logPath}.${new Date().toISOString().split("T")[0]}`;
.planning\phases\10-hook-integration\10-RESEARCH.md:304:    renameSync(logPath, archivePath);
.planning\phases\10-hook-integration\10-RESEARCH.md:558:export function formatStatus(status: StatusInfo): string {
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:294:- Test `loadConfig()` with `{ embedding: { batchSize: 50 } }` returns merged config with batchSize 50
.planning\phases\15-embedding-pipeline\15-02-SUMMARY.md:85:## Issues Encountered
.planning\phases\15-embedding-pipeline\15-02-PLAN.md:60:   - Test receives `DownloadProgress` with `{ status: "downloading", file: "model.onnx", loaded: 5000000, total: 23000000 }` and updates bar
.planning\phases\16.1-migration-race-condition-fix\16.1-01-PLAN.md:21:**Root cause:** The move loop in `migrateFromLegacy()` skips items that do not exist at the source (`!existsSync(item.source)`), but never checks whether the destination already exists. When a prior CLI invocation created an empty XDG database via `initializeDatabase()`, subsequent migration calls encounter a "partial" state where both paths have data. The `moveFileOrDir()` function uses `renameSync` which silently overwrites on POSIX, but the code provides no guardrails: it could overwrite a populated database with an empty one (if someone ran `memory sync` on the XDG path first and then tried to migrate), or overwrite an empty stub with real data (the intended outcome that happens to work on POSIX but fails silently on Windows if the file is locked).
.planning\phases\23-foundation\23-VERIFICATION.md:4:status: passed
.planning\phases\17-provider-ecosystem\17-VERIFICATION.md:4:status: passed
.planning\phases\16.1-migration-race-condition-fix\16.1-01-SUMMARY.md:88:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:116:- Define `DownloadProgress` interface: `{ status: "downloading" | "loading" | "ready"; file?: string; loaded?: number; total?: number }`
.planning\phases\16.1-migration-race-condition-fix\16.1-RESEARCH.md:61:**When to use:** The `migrateFromLegacy()` function encounters an existing file at the destination path.
.planning\phases\16.1-migration-race-condition-fix\16.1-RESEARCH.md:95:This ordering is already correct: `migrateFromLegacy()` is synchronous and runs before `program.parse()` dispatches to any command action. The race condition is not in the ordering of these two calls within a single invocation. It is in the scenario where a **prior invocation** already created the empty XDG database (e.g., via `memory doctor`, `memory sync`, etc.), and then a subsequent invocation calls `migrateFromLegacy()` which encounters the `"partial"` state.
.planning\phases\29.1-test-determinism\29.1-02-SUMMARY.md:71:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:97:## Issues Encountered
.planning\phases\16.1-migration-race-condition-fix\16.1-VALIDATION.md:4:status: passed
.planning\phases\29-ambient-context\29-VERIFICATION.md:4:status: human_needed
.planning\phases\16.1-migration-race-condition-fix\16.1-VERIFICATION.md:4:status: passed
.planning\phases\17-provider-ecosystem\17-VALIDATION.md:4:status: draft
.planning\phases\15-embedding-pipeline\15-03-SUMMARY.md:83:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-02-SUMMARY.md:107:## Issues Encountered
.planning\phases\15-embedding-pipeline\15-04-SUMMARY.md:85:## Issues Encountered
.planning\phases\29-ambient-context\29-UAT.md:2:status: diagnosed
.planning\phases\29-ambient-context\29-UAT.md:36:expected: If ambient context generation encounters an error (e.g., SmartContextService fails, project not found), sync completes successfully. The error is logged to stderr but does not prevent session extraction or other sync operations.
.planning\phases\29-ambient-context\29-UAT.md:58:  status: failed
.planning\phases\14-embedding-infrastructure\14-03-PLAN.md:136:            status: p.status === "ready" ? "ready" : p.status === "progress" ? "downloading" : "loading",
.planning\phases\23-foundation\23-04-SUMMARY.md:94:## Issues Encountered
.planning\phases\17-provider-ecosystem\17-UAT.md:2:status: complete
.planning\phases\17-provider-ecosystem\17-UAT.md:46:  status: failed
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:208:2. Export a `resolveProviderDefaults(merged: EmbeddingConfigData, userEmbedding: Partial<EmbeddingConfigData> | undefined): EmbeddingConfigData` function:
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:209:   - Takes the already-merged config and the raw user embedding section
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:211:     - If userEmbedding has no `model` field: use PROVIDER_DEFAULTS[provider].model (fall back to merged.model if provider unknown)
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:212:     - If userEmbedding has no `dimensions` field: use PROVIDER_DEFAULTS[provider].dimensions (fall back to merged.dimensions if provider unknown)
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:213:   - If provider IS "local": return merged as-is (DEFAULT_EMBEDDING_CONFIG already correct)
.planning\phases\17-provider-ecosystem\17-03-PLAN.md:218:   - After computing the merged config, call `resolveProviderDefaults(merged.embedding, loaded.embedding)` and assign the result back to `merged.embedding`
.planning\phases\14-embedding-infrastructure\14-03-SUMMARY.md:113:## Issues Encountered
.planning\phases\15-embedding-pipeline\15-VALIDATION.md:4:status: draft
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:4:status: passed
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:7:previous_status: gaps_found
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:39:Previous status: `gaps_found` (4/5 truths verified)
.planning\phases\17-provider-ecosystem\17-03-SUMMARY.md:85:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-04-SUMMARY.md:123:## Issues Encountered
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:392:// Extend EmbeddingHealth with readiness status:
.planning\phases\29-ambient-context\29-02-SUMMARY.md:93:## Issues Encountered
.planning\phases\23-foundation\23-01-SUMMARY.md:95:## Issues Encountered
.planning\phases\23-foundation\23-03-SUMMARY.md:100:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:13:The key technical risk is sqlite-vec's npm package status: the "latest" tag on npm points to `0.1.7-alpha.2`, while the last stable release is `0.1.6`. Both versions use the same `sqliteVec.load(db)` API for bun:sqlite. The recommendation is to pin `sqlite-vec@0.1.6` (stable) and upgrade when 0.1.7 leaves alpha.
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:125:  status: "downloading" | "loading" | "ready";
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:159:            status: p.status === "ready" ? "ready" : "downloading",
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:353:  progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number }) => {
.planning\phases\23-foundation\23-02-SUMMARY.md:116:## Issues Encountered
.planning\phases\28-friction-universalization\28-01-SUMMARY.md:95:## Issues Encountered
.planning\phases\14-embedding-infrastructure\14-UAT.md:2:status: complete
.planning\phases\28-friction-universalization\28-01-PLAN.md:81:    status: FrictionStatus;
.planning\phases\28-friction-universalization\28-01-PLAN.md:110:    updateStatus(id: number, status: FrictionStatus): Promise<void>;
.planning\phases\14-embedding-infrastructure\14-VALIDATION.md:4:status: draft
.planning\phases\28-friction-universalization\28-02-PLAN.md:77:    updateStatus(id: number, status: FrictionStatus): Promise<void>;
.planning\phases\28-friction-universalization\28-02-PLAN.md:111:    status: string;
.planning\phases\28-friction-universalization\28-02-PLAN.md:144:4. **findAll with combined filters:** findAll({ tool: "aidev", status: "open" }) returns only matching entries.
.planning\phases\28-friction-universalization\28-02-SUMMARY.md:78:## Issues Encountered
.planning\phases\28-friction-universalization\28-04-SUMMARY.md:49:- **Fix:** Changed list() to use `findAll({ status: "open", tool })` when any filter (tool/category/sourceProject) is specified.
.planning\phases\14-embedding-infrastructure\14-VERIFICATION.md:4:status: passed
.planning\phases\29-ambient-context\29-01-SUMMARY.md:89:## Issues Encountered
.planning\phases\28-friction-universalization\28-05-SUMMARY.md:78:## Issues Encountered
.planning\phases\28-friction-universalization\28-06-SUMMARY.md:75:## Issues Encountered
.planning\phases\28-friction-universalization\28-RESEARCH.md:20:1. **Add `tool` column (CRITICAL):** `tool TEXT NOT NULL` on `friction_log` table. Default existing entries to `'memory'`. `tool` = which tool broke, `source_project` = where friction was encountered. Both always populated.
.planning\phases\28-friction-universalization\28-RESEARCH.md:318:    status: FrictionStatus;
.planning\phases\28-friction-universalization\28-RESEARCH.md:338:    status: string;
.planning\phases\28-friction-universalization\28-VERIFICATION.md:4:status: gaps_found
.planning\phases\28-friction-universalization\28-VERIFICATION.md:9:    status: failed
.planning\phases\28-friction-universalization\28-VERIFICATION.md:17:    status: failed
.planning\phases\28-friction-universalization\28-VERIFICATION.md:25:    status: failed
.planning\phases\28-friction-universalization\28-VERIFICATION.md:33:    status: failed
.planning\phases\28-friction-universalization\CONTEXT.md:3:**Source:** Real-world friction encountered during GSD v0.3.0 milestone completion (2026-03-08). 10 entries logged in ~/.claude/friction.jsonl. Design discussion in memory-nexus session (2026-03-09).
.planning\phases\28-friction-universalization\CONTEXT.md:19:- `source_project` = where the friction was encountered (e.g., "get-stuff-done")
.planning\phases\27-qmd-integration\27-01-SUMMARY.md:100:## Issues Encountered
.planning\phases\26-hooks-and-backfill\26-01-SUMMARY.md:77:## Issues Encountered
.planning\phases\25-intelligence\25-01-SUMMARY.md:108:## Issues Encountered
.planning\phases\25-intelligence\25-02-SUMMARY.md:113:## Issues Encountered
.planning\phases\27-qmd-integration\27-02-SUMMARY.md:37:  - "Informational status: [INFO] indicator for optional tool availability in doctor output"
.planning\phases\27-qmd-integration\27-02-SUMMARY.md:88:## Issues Encountered
.planning\phases\27-qmd-integration\27-RESEARCH.md:24:- Results shown separately with "File results:" header, not merged with session search results
.planning\phases\25-intelligence\25-03-SUMMARY.md:113:## Issues Encountered
.planning\phases\27-qmd-integration\27-VERIFICATION.md:4:status: passed
.planning\phases\25-intelligence\25-04-SUMMARY.md:74:## Issues Encountered
.planning\phases\26-hooks-and-backfill\26-VERIFICATION.md:4:status: human_needed
.planning\phases\26-hooks-and-backfill\26-VERIFICATION.md:92:Note: The full test suite encountered a Bun v1.3.5 segfault (RSS 3.35GB, known Bun bug). Phase-specific tests all pass cleanly.
.planning\phases\27-qmd-integration\CONTEXT.md:128:2. Should qmd results be merged with memory search results or shown separately?
.planning\phases\25-intelligence\25-VERIFICATION.md:4:status: human_needed
.planning\phases\25-intelligence\25-VERIFICATION.md:7:  previous_status: gaps_found

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 5880ms:
---
schema_version: "1.2"
source_project: conversations
created: 2026-05-08
type: enhancement
severity: medium
fix_status: none
affects_scope: this-project-only
status: open
closure_notify_to: conversations
closure_notify_reason: The audit's recommendation determines which architecture (A specialized + agent-as-router / B federation router / C surgical consolidation) from the conversations memory architecture inventory becomes load-bearing for memory tooling decisions across all projects. Outcome shapes whether memory-nexus targets a v5.0 federation milestone, accepts narrow-scope steady state, or stops at v4.0.
---

# First-principles audit of memory-nexus architecture against adjacent memory systems (hermes / OpenClaw / Mem0 / MemPalace)

## Motivation

User worry surfaced 2026-05-08, verbatim:

> "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."

The conversations inventory at `~/Projects/conversations/docs/research/2026-05-08-memory-architecture-inventory.md` catalogued 18 memory-adjacent surfaces, identified that memory-nexus is a partially-built umbrella with federation-ready foundation in progress, and proposed three candidate architectures (A/B/C). But the inventory's analysis did NOT compare memory-nexus against adjacent memory systems from first principles â€” that's this audit's job.

**Timing constraint.** The right time for this audit is **after current bug-fix work concludes** â€” running it mid-phase risks scope creep and dilutes both the bug fixes and the audit. Whenever memory-nexus is between phases (no in-flight Phase work, tests green, no shipping pressure), this prompt surfaces.

## Proposal

Run a discrete audit phase with these requirements:

### Scope

**Don't limit the review to getting a few solutions/tests correct. Examine the entire solution and even architecture/design/approach compared to the original goal: an intelligent memory system (akin to and even better than hermes's memory system, openclaw's memory system, mempalace) that's AI-first and serves all projects.**

### Reference systems to compare against

- **Hermes (NousResearch):** https://github.com/nousresearch/hermes-agent
- **OpenClaw:** https://openclaw.ai/ and https://github.com/openclaw/openclaw
- **Mem0:** already inspiration for v4.0 Phase 34 ADD/UPDATE/DELETE/NOOP semantics; revisit holistically (not just for the extraction primitives)
- **MemPalace:** spatial-memory metaphor; check if applicable patterns

### Method: first principles

Strip every assumption about HOW memory-nexus is currently built. Derive what an agent-memory system MUST do (irreducible truths). Then:
1. Derive minimum structure satisfying those truths
2. Compare derived structure against EACH reference system
3. Compare derived structure against current memory-nexus
4. Only THEN ask: would we build memory-nexus this way today?

Per `~/.claude/rules/first-principles-before-options.md`. The bias to watch: anchoring on what memory-nexus already does and deriving "options" within that anchor. The audit must derive truths independent of memory-nexus's current shape.

### Adversarial external AI review

Per `~/Projects/conversations/.claude/projects/...conversations/memory/feedback_cross_ai_review.md` â€” plan AND solution must be reviewed by Gemini and/or GPT-5.4 adversarially before landing. Cross-AI review caught issues self-review missed in prior memory-nexus work; this audit's stakes are high enough that the same discipline applies.

### Multi-agent verification of namespaces and commands

Spawn multiple subagents to complete the namespace and command review in parallel. Each subagent verifies a slice â€” for example:
- One subagent: `memory friction list/log/dashboard/resolve/wontfix`
- One subagent: `memory search/context/related/list/show/browse`
- One subagent: `memory sync/extract/backfill/purge/export/import`
- One subagent: `memory install/uninstall/doctor/status/stats`

Each subagent verifies the commands work as expected â€” not just unit tests passing, but **end-to-end behavior matching documented intent**. This includes: does the help text describe what the command actually does? Are there commands that exist but are unused or vestigial? Are there gaps where a command should exist but doesn't?

### Inbox content review

At audit start, review THIS inbox for any other issues/frictions filed by other projects since this prompt was created. The audit should incorporate them. (As of filing, only this prompt + the friction-primacy companion exist; more may accumulate.)

### Subagent brief framing (mandatory)

When delegating verification work to subagents, the brief MUST include:

1. The user's worry (verbatim above) â€” so subagents understand the stakes are not "is the code working" but "is this the right system."
2. Explicit anti-bias note: *"memory-nexus is not your sunk cost. If you would build something different from scratch, say so. The audit's purpose is to surface that gap, not justify the existing architecture."*
3. Cross-session context per `~/.claude/rules/subagent-trust-calibration.md`: judgments returned by subagents about "would we build this differently?" are context-dependent (medium-confidence). Path/file claims must be verified with `ls`/`grep` before propagating. The first-principles inventory in conversations had three correction layers because subagent path claims were treated as high-confidence â€” don't repeat that.

## Output

A recommendation document at `~/Projects/memory-nexus/docs/audits/2026-XX-XX-architecture-first-principles-audit.md` containing:

1. **Irreducible truths** â€” what an agent-memory system MUST do, derived independent of memory-nexus's current shape
2. **Adjacent-systems comparison matrix** â€” hermes / OpenClaw / Mem0 / MemPalace Ã— the truths from (1)
3. **Current memory-nexus comparison** â€” same matrix row for current state
4. **Gap analysis** â€” where memory-nexus diverges from the derived structure or from adjacent best practices
5. **Recommendation** on the conversations inventory's three architectures:
   - **A:** specialized surfaces + agent-as-router (status quo)
   - **B:** federation router on memory-nexus (memory-nexus v5.0+)
   - **C:** surgical surface consolidation (cheapest now)
6. **Concrete next-phase plan** if Aâ†’B or Bâ†’C transition is recommended

## Alternatives considered

- **Run audit during current bug-fix phase.** Rejected â€” scope creep, both the audit and the fixes get diluted.
- **Run audit in conversations CWD instead of memory-nexus.** Rejected â€” memory-nexus session has full architecture context that conversations doesn't. (Exception: if the audit's first-principles derivation surfaces that memory-nexus is the wrong project to host this work, the audit itself can route the work elsewhere.)
- **Skip audit, accept current trajectory.** Rejected â€” user's worry is real, the inventory's three-architecture comparison is not yet decided, and continuing without a decision means the gap compounds.

## Open questions

- Should this audit be its own discrete phase, or part of v5.0 milestone scoping?
- Should the audit produce concrete v5.0 phase plans, or only the recommendation? (Opinion: produce both â€” the recommendation is cheap once the truths are derived; phase plans inform whether v5.0 is worth scoping or v4.0 is the natural ceiling.)
- How does the audit interact with publishing (Phase 37, v4.0 npm publish)? Does v4.0 ship before audit, or does audit gate the v4.0 â†’ v5.0 transition?
- Does the audit's "would we build this differently?" framing extend to the *project itself* â€” i.e., is it possible the audit recommends deprecating memory-nexus in favor of one of the adjacent systems?

## Test plan

This is a research/audit prompt â€” no code-test plan. The audit's own deliverable (the audit document) is the artifact.

Acceptance: audit document landed, cross-AI reviewed, recommendation explicit, concrete next-step actionable.

## Risks / things to verify before "merging" (i.e., closing this inbox item)

- Audit must NOT be a memory-nexus self-justification. The anti-bias subagent brief is the load-bearing safeguard.
- Audit must verify all path/file claims via `ls`/`grep` (per `subagent-trust-calibration.md` â€” three correction layers in the conversations inventory came from skipping this).
- Cross-AI adversarial review must happen before recommendation is locked.

## Related

- **Source doc:** `~/Projects/conversations/docs/research/2026-05-08-memory-architecture-inventory.md` (full surface catalogue + three-architecture analysis with Â§8.5 correction log + Â§10 documentation-vs-reality drift insight)
- **User worry origin:** conversations session 2026-05-07 â†’ 2026-05-08
- **Companion prompt (smaller scope, can ship first):** `2026-05-08-conversations-friction-primacy-decision.md`
- **Anti-bias rules to brief subagents on:** `~/.claude/rules/first-principles-before-options.md`, `~/.claude/rules/subagent-trust-calibration.md`, `~/.claude/rules/feedback_cross_ai_review.md` (project-scoped in conversations)

hook: PostToolUse
 succeeded in 5894ms:


    Directory: C:\Users\CodexSandboxOffline\.codex\.sandbox\cwd\48e51ee654eb38f3\docs\inbox


Mode                 LastWriteTime         Length Name                                                                 
----                 -------------         ------ ----                                                                 
d-----         5/11/2026   5:37 AM                archived                                                             
-a----          5/8/2026  11:22 AM           9347 2026-05-08-conversations-first-principles-architecture-audit.md      
-a----         5/11/2026   5:27 AM           3870 2026-05-11-memory-nexus-bun-windows-full-suite-crash.md              
-a----         5/11/2026   5:27 AM           3501 2026-05-11-memory-nexus-friction-test-phase-30-orphan.md             
-a----         5/11/2026   5:26 AM           5030 2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md        
-a----          5/8/2026  11:20 AM           1714 README.md                                                            



hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"Phase 32|32|CLI Surface|Phase 33|Extraction|ADD|UPDATE|DELETE|NOOP|v4.0|Phase 37|publish\" .planning\\ROADMAP.md .planning\\STATE.md .planning\\phases docs README.md" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content docs\\inbox\\README.md" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem .planning\\phases -Directory | Sort-Object Name | Select-Object -ExpandProperty Name" in C:\Projects\memory-nexus
 succeeded in 4073ms:
README.md:197:This package was previously published as `memory-nexus`. The old package name now installs a deprecation stub. See [MIGRATION.md](MIGRATION.md) for upgrade instructions.
.planning\STATE.md:3:milestone: v4.0
.planning\STATE.md:22:**Current Focus:** Out-of-roadmap test-isolation cleanup paused at Stage 13/14 (paths.ts remains). Resume v4.0 Phase 32 (CLI Surface) once paths.ts done OR triaged.
.planning\STATE.md:29:**Milestone:** v4.0 Intelligence Layer
.planning\STATE.md:33:v4.0 Progress: [######__________________] 2/8 phases complete
.planning\STATE.md:36:  Phase 32: CLI Surface                     [ ] Not started
.planning\STATE.md:37:  Phase 33: Knowledge Extraction Foundation [ ] Not started
.planning\STATE.md:38:  Phase 34: Extraction Pipeline             [ ] Not started
.planning\STATE.md:41:  Phase 37: Publishing                      [ ] Not started
.planning\STATE.md:70:- Mem0's ADD/UPDATE/DELETE/NOOP model adopted for fact consolidation
.planning\STATE.md:72:- IExtractionProvider follows IEmbeddingProvider pattern (pluggable adapters)
.planning\STATE.md:87:- bun link install active (symlink to source, not npm published yet)
.planning\STATE.md:104:- (b) Resume v4.0 roadmap: `/gsd:plan-phase 32` (CLI Surface).
.planning\ROADMAP.md:8:- **v4.0 Intelligence Layer** -- Phases 30-37 (in progress)
.planning\ROADMAP.md:17:- [x] Phase 3: JSONL Parsing and Extraction (4/4 plans)
.planning\ROADMAP.md:61:### v4.0 Intelligence Layer (Phases 30-37)
.planning\ROADMAP.md:63:**Overview:** Transform memory from a data store into a knowledge system. Automated extraction of decisions, learnings, and patterns from sessions via LLM-powered pipeline. Intelligent context delivery from SQLite fact tables instead of filesystem. Clean CLI surface with labeled help groups. Cross-environment portability for WSL migration. npm publish to registry.
.planning\ROADMAP.md:66:**Total v4.0 Requirements:** 25 phase-mapped + 4 cross-cutting (QUAL) = 29
.planning\ROADMAP.md:70:- [ ] **Phase 32: CLI Surface** - Labeled help groups, uniform --json and --format flags
.planning\ROADMAP.md:71:- [ ] **Phase 33: Knowledge Extraction Foundation** - Extraction provider port, facts schema, extraction_log, temporal tracking
.planning\ROADMAP.md:72:- [ ] **Phase 34: Extraction Pipeline** - The `memory extract` command with ADD/UPDATE/DELETE/NOOP operations
.planning\ROADMAP.md:75:- [ ] **Phase 37: Publishing** - npm publish @chude/memory to registry
.planning\ROADMAP.md:82:**Depends on**: Nothing (first v4.0 phase; builds on shipped v3.0)
.planning\ROADMAP.md:114:### Phase 32: CLI Surface
.planning\ROADMAP.md:127:### Phase 33: Knowledge Extraction Foundation
.planning\ROADMAP.md:133:  1. `IExtractionProvider` port exists in domain layer with an `extract(messages): Promise<CandidateFact[]>` method; adapters exist for Claude API (Anthropic SDK), Ollama, and OpenAI
.planning\ROADMAP.md:142:### Phase 34: Extraction Pipeline
.planning\ROADMAP.md:145:**Depends on**: Phase 33 (needs provider port, schema, and extraction_log)
.planning\ROADMAP.md:149:  2. Each candidate fact is compared against existing facts using embedding similarity; the pipeline decides ADD, UPDATE, DELETE (supersede), or NOOP per fact
.planning\ROADMAP.md:184:### Phase 37: Publishing
.planning\ROADMAP.md:186:**Goal**: `@chude/memory` is published to npm and installable globally by any user
.planning\ROADMAP.md:187:**Depends on**: Phase 35 (all features complete before publishing)
.planning\ROADMAP.md:190:  1. `@chude/memory` is published to the npm registry with correct `bin`, `files`, and dependency configuration
.planning\ROADMAP.md:192:  3. `memory --version` reports the published version; `memory doctor` passes all health checks on a fresh install
.planning\ROADMAP.md:197:### Cross-Cutting: Quality (All v4.0 Phases)
.planning\ROADMAP.md:209:## v4.0 Dependency Graph
.planning\ROADMAP.md:216:    +---> Phase 33 (Knowledge Extraction Foundation)
.planning\ROADMAP.md:218:              +---> Phase 34 (Extraction Pipeline)
.planning\ROADMAP.md:222:                                  +---> Phase 37 (Publishing)
.planning\ROADMAP.md:224:Phase 32 (CLI Surface)
.planning\ROADMAP.md:230:Phase 37 (Publishing)
.planning\ROADMAP.md:231:    depends on Phase 35 (all features in before publish)
.planning\ROADMAP.md:232:    depends on Phase 31 (bugs fixed before publish)
.planning\ROADMAP.md:233:    depends on Phase 32 (CLI surface clean before publish)
.planning\ROADMAP.md:234:    depends on Phase 36 (portability in before publish)
.planning\ROADMAP.md:263:| 30. God File Cleanup | v4.0 | 2/2 | Complete    | 2026-04-03 |
.planning\ROADMAP.md:264:| 31. Bug Fixes | v4.0 | 1/2 | In Progress|  |
.planning\ROADMAP.md:265:| 32. CLI Surface | v4.0 | TBD | Not started | - |
.planning\ROADMAP.md:266:| 33. Knowledge Extraction Foundation | v4.0 | TBD | Not started | - |
.planning\ROADMAP.md:267:| 34. Extraction Pipeline | v4.0 | TBD | Not started | - |
.planning\ROADMAP.md:268:| 35. Context Intelligence | v4.0 | TBD | Not started | - |
.planning\ROADMAP.md:269:| 36. Portability | v4.0 | TBD | Not started | - |
.planning\ROADMAP.md:270:| 37. Publishing | v4.0 | TBD | Not started | - |
docs\02-RESEARCH.md:396:### Incremental Extraction
docs\01-VISION.md:232:| Aspect | MCP Approach | Direct Extraction |
docs\05-IMPLEMENTATION.md:286:    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
docs\05-IMPLEMENTATION.md:328:CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
docs\05-IMPLEMENTATION.md:334:CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
docs\04-ARCHITECTURE.md:21:|                    Extraction Engine                           |
docs\04-ARCHITECTURE.md:138:  "uuid": "fa6e64c1-84fe-4c50-abdc-38ce3294b856",
docs\04-ARCHITECTURE.md:309:-- Extraction state (for incremental sync)
docs\04-ARCHITECTURE.md:567:  const state = await db.getExtractionState(sessionFile);
docs\04-ARCHITECTURE.md:588:  await db.updateExtractionState(sessionFile, lineNumber, bytesRead, fileStats);
docs\04-ARCHITECTURE.md:652:### Extraction Errors
docs\04-ARCHITECTURE.md:655:enum ExtractionError {
docs\04-ARCHITECTURE.md:662:interface ExtractionResult {
docs\04-ARCHITECTURE.md:668:    type: ExtractionError;
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:114:IExtractionStateRepository:
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:115:- findById(id: string): Promise<ExtractionState | null>
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:116:- findBySessionPath(sessionPath: string): Promise<ExtractionState | null>
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:117:- findPending(): Promise<ExtractionState[]>
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:118:- save(state: ExtractionState): Promise<void>
.planning\phases\02-database-schema-and-ports\02-01-PLAN.md:248:2. Supporting interfaces defined (IToolUseRepository, ILinkRepository, IExtractionStateRepository, SearchOptions, SessionFileInfo, ParsedEvent)
.planning\phases\02-database-schema-and-ports\02-01-SUMMARY.md:57:- **IExtractionStateRepository** - Sync state tracking
.planning\phases\02-database-schema-and-ports\02-01-SUMMARY.md:153:- [x] IExtractionStateRepository defined for sync state
.planning\phases\02-database-schema-and-ports\02-02-PLAN.md:87:    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
.planning\phases\02-database-schema-and-ports\02-02-PLAN.md:109:CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages_meta BEGIN
.planning\phases\02-database-schema-and-ports\02-02-PLAN.md:113:CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages_meta BEGIN
.planning\phases\02-database-schema-and-ports\02-02-PLAN.md:129:    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
.planning\phases\02-database-schema-and-ports\02-03-PLAN.md:217:- Initialize with cacheSize: -32000
.planning\phases\02-database-schema-and-ports\02-03-PLAN.md:219:- Assert equals -32000
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:148:        snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:193:Test 14: Trigger DELETE synchronization
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:196:- DELETE from messages_meta
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:200:Test 15: Trigger UPDATE synchronization
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:203:- UPDATE content to "new content"
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:243:Trigger synchronization tests verify INSERT/UPDATE/DELETE keep FTS5 index consistent. Edge cases cover special characters, unicode, and large content.
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:253:- [ ] Trigger synchronization keeps index updated on INSERT/UPDATE/DELETE
.planning\phases\02-database-schema-and-ports\02-04-PLAN.md:263:4. Trigger synchronization verified for INSERT/UPDATE/DELETE
docs\SCRATCHPAD.md:8:3. UPDATE the status below when done
docs\audits\2026-04-26-adversarial-ux-dx.md:257:- `gh --help` groups commands into "CORE COMMANDS", "GITHUB ACTIONS COMMANDS", "ADDITIONAL COMMANDS." Visually scannable.
docs\audits\2026-04-26-adversarial-ux-dx.md:435:3. **Does the friction system need the test-data hygiene fixed before publishing v2.1?** Currently the user's own dogfooding is buried in test fixtures. If shipping a v2.1 that exposes friction-tracking to other tools (per friction #146's request), the polluted state will be confusing to those tools' authors.
docs\audits\2026-04-26-adversarial-ux-dx.md:439:5. **Is the legacy `memory-nexus` package name's deprecation stub being measured?** With v2.0.0 published as `@chude/memory`, are there metrics on how many users still pull the old name? If high, MIGRATION.md may need a stronger nudge in the deprecation message.
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:45:| 14 | Trigger DELETE removes content from FTS |
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:46:| 15 | Trigger UPDATE synchronizes modified content |
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:95:SELECT snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:106:- DELETE trigger: Removes content from FTS index
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:107:- UPDATE trigger: Re-indexes with new content (delete old + insert new)
.planning\phases\02-database-schema-and-ports\02-04-SUMMARY.md:139:| Trigger synchronization for INSERT/UPDATE/DELETE | Verified (Tests 13-15) |
docs\audits\2026-04-26-adversarial-security.md:17:- **File(s):** `src/infrastructure/parsers/event-classifier.ts:179-236, 320-362`; `src/infrastructure/database/repositories/message-repository.ts:117-126`; `src/infrastructure/database/repositories/tool-use-repository.ts` (entire `save` path); `src/infrastructure/parsers/jsonl-parser.ts:29-63`
docs\audits\2026-04-26-adversarial-security.md:91:- **Impact:** Data integrity, not confidentiality. Extraction-state row in the DB may end up "complete" while messages are missing, silently dropping content from the index.
docs\audits\2026-04-26-adversarial-security.md:123:#### LOW-1: README publishes the database location explicitly — recon assist
docs\audits\2026-04-26-adversarial-security.md:153:3. **Does the OpenAI embeddings endpoint log request bodies?** Anthropic's stance is published; OpenAI's varies by tier. The risk surface in CRIT-2 depends on the answer; mitigation does not.
.planning\phases\02-database-schema-and-ports\02-RESEARCH.md:95:-- DELETE trigger
.planning\phases\02-database-schema-and-ports\02-RESEARCH.md:96:CREATE TRIGGER messages_ftsd AFTER DELETE ON messages_meta BEGIN
.planning\phases\02-database-schema-and-ports\02-RESEARCH.md:107:-- UPDATE trigger (delete + insert pattern)
.planning\phases\02-database-schema-and-ports\02-RESEARCH.md:108:CREATE TRIGGER messages_ftsu AFTER UPDATE ON messages_meta BEGIN
.planning\phases\02-database-schema-and-ports\02-RESEARCH.md:279:import type { ExtractionState } from "../entities/extraction-state.js";
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:1:# Phase 5 Plan 01: ExtractionState File Metadata Extension - Summary
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:30:ExtractionState entity extended with fileMtime/fileSize properties for incremental sync detection.
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:34:### Task 1: Add file metadata properties to ExtractionState entity
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:35:- Added `fileMtime?: Date` and `fileSize?: number` optional properties to ExtractionStateParams
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:42:### Task 2: Update ExtractionStateRepository to persist file metadata
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:43:- Updated rowToExtractionState() to reconstruct fileMtime and fileSize from database rows
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:56:| 7df46bb | feat(05-01): add file metadata properties to ExtractionState entity |
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:57:| f9d340f | feat(05-01): update ExtractionStateRepository to persist file metadata |
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:65:- **extraction-state-file-metadata**: ExtractionState now tracks fileMtime and fileSize for comparing against session files during incremental sync detection
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:70:1. Create ExtractionState with file metadata from SessionFileInfo
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:79:const state = ExtractionState.create({
.planning\phases\05-basic-sync-command\05-01-SUMMARY.md:94:function needsReextraction(session: SessionFileInfo, state: ExtractionState | null): boolean {
.planning\phases\06-search-command-with-fts5\06-RESEARCH.md:141:**Why it happens:** snippet() limited to 32 tokens by design
.planning\phases\06-search-command-with-fts5\06-RESEARCH.md:153:snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32)
.planning\phases\06-search-command-with-fts5\06-RESEARCH.md:160:- `32`: Maximum tokens (words) in snippet
docs\audits\2026-04-26-adversarial-reliability.md:24:INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))   // 1
docs\audits\2026-04-26-adversarial-reliability.md:47:this.db.exec("DELETE FROM message_embeddings");   // (a)
docs\audits\2026-04-26-adversarial-reliability.md:48:this.db.exec("DELETE FROM embedding_state");      // (b)
docs\audits\2026-04-26-adversarial-reliability.md:58:this.db.exec("DELETE FROM embedding_state");               // (c)
docs\audits\2026-04-26-adversarial-reliability.md:119:- **Trigger:** User runs `memory sync --embed` after switching embedding model; the call path is `service.clearAndReembed -> repository.clearAllEmbeddings`. Kill (Ctrl+C, OOM, power loss) between `DELETE FROM message_embeddings` and `DELETE FROM embedding_state`. Same risk for `recreateVecTable` (DROP/CREATE/DELETE — three windows).
docs\audits\2026-04-26-adversarial-reliability.md:122:- **Fix:** Wrap each of the two methods in `db.transaction(() => { ... })()`. For `recreateVecTable`, this means DROP+CREATE+DELETE in a single transaction. Verify that vec0 virtual-table DDL is transactional in sqlite-vec; if not, document the constraint and add a post-condition check that closes the consistency gap (see CRIT-4).
docs\audits\2026-04-26-adversarial-reliability.md:149:- **Symptom:** sync-service.ts:324 catches "locked" / "SQLITE_BUSY" and wraps as `DB_LOCKED`. Session record may end up half-saved depending on where in the per-session transaction the timeout fires. Sync succeeds for some sessions, fails for others, with the user-visible message being a lock error.
docs\audits\2026-04-26-adversarial-reliability.md:175:- **Trigger:** Model change; clearAndReembed interrupted mid-clear (the DELETE itself is one statement so this is rarer, but the model change scenario plus a retry that doesn't re-trigger clearAndReembed is realistic).
docs\audits\2026-04-26-adversarial-reliability.md:182:- **Files:** `src/infrastructure/migration.ts:165-172`, `:319-321`, `:339-341`, `:343-360`
docs\audits\2026-04-26-adversarial-reliability.md:225:- **Fix:** Track skip reasons explicitly: `skippedByCheckpoint`, `skippedByFilter`, `skippedByExtractionState`. Sum once at the end. Add invariant: `discovered == processed + skipped + errors.length + completed_recovered`.
docs\audits\2026-04-26-adversarial-reliability.md:294:4. **Does the extraction-state row for an in-flight session ever block resume?** If a sync is killed mid-transaction, the row is `pending` or `in_progress` — `needsExtraction` re-runs it, which is correct. But if the row's `id` (UUID) collides on a re-run via `INSERT OR REPLACE` — fine for `id` PK — but `session_path` UNIQUE means duplicate-by-path raises. The repo uses INSERT OR REPLACE so it's idempotent. Worth a test that kills the parent during the sessionRepo.save() inside the transaction and checks state after.
.planning\phases\05-basic-sync-command\05-01-PLAN.md:1:# Phase 5 Plan 01: ExtractionState File Metadata Extension
.planning\phases\05-basic-sync-command\05-01-PLAN.md:14:    - ExtractionState entity has fileMtime and fileSize properties
.planning\phases\05-basic-sync-command\05-01-PLAN.md:18:    - Updated ExtractionState entity with file metadata
.planning\phases\05-basic-sync-command\05-01-PLAN.md:28:Extend ExtractionState entity and repository to track file modification time and size, enabling incremental sync detection in subsequent plans.
.planning\phases\05-basic-sync-command\05-01-PLAN.md:56:<title>Add file metadata properties to ExtractionState entity</title>
.planning\phases\05-basic-sync-command\05-01-PLAN.md:62:1. Add optional properties to ExtractionStateParams interface:
.planning\phases\05-basic-sync-command\05-01-PLAN.md:68:2. Add private readonly fields and getters to ExtractionState class:
.planning\phases\05-basic-sync-command\05-01-PLAN.md:85:   withFileMetadata(mtime: Date, size: number): ExtractionState
.planning\phases\05-basic-sync-command\05-01-PLAN.md:101:ExtractionState entity has fileMtime, fileSize properties and withFileMetadata() method. All state transitions preserve metadata.
.planning\phases\05-basic-sync-command\05-01-PLAN.md:106:<title>Update ExtractionStateRepository to persist file metadata</title>
.planning\phases\05-basic-sync-command\05-01-PLAN.md:168:   - Create ExtractionState with metadata
.planning\phases\05-basic-sync-command\05-01-PLAN.md:180:All tests pass. ExtractionState now supports file metadata for incremental sync detection.
.planning\phases\05-basic-sync-command\05-01-PLAN.md:198:- [ ] ExtractionState entity has fileMtime and fileSize optional properties
docs\audits\2026-04-26-adversarial-perf-tests.md:241:**Where:** `src/infrastructure/database/services/hybrid-search-service.ts:732-746` (`passesFilters`)
docs\audits\2026-04-26-adversarial-perf-tests.md:254:This is in a per-result loop. For a `--limit 50 --project foo` hybrid search, that's up to 50 individual SELECTs against the sessions table. Should be a single JOIN-based filter (as the FTS path already does in search-service.ts:132-138) or a batch lookup.
.planning\phases\05-basic-sync-command\05-02-SUMMARY.md:49:- Implemented `needsExtraction()` method comparing:
.planning\phases\05-basic-sync-command\05-02-SUMMARY.md:59:  - ExtractionState creation with file metadata
.planning\phases\05-basic-sync-command\05-02-SUMMARY.md:125:private needsExtraction(
.planning\phases\05-basic-sync-command\05-02-SUMMARY.md:127:  existingState: ExtractionState | null,
docs\audits\2026-04-26-adversarial-architecture.md:15:- **What's wrong:** Application services type their constructor / function arguments with `Database` from `bun:sqlite`. `SyncService` calls `this.db.transaction(() => { ... })` (line 455) and `ExportService` calls `db.query<...>(...)`, `db.prepare(...)`, `db.exec("DELETE FROM ...")` directly. The "depend on abstractions" rule is broken at the application/infrastructure boundary.
docs\audits\2026-04-26-adversarial-architecture.md:21:- **What's wrong:** `exportToJson(db, ...)` and `importFromJson(db, ...)` are exported as top-level functions in the application layer that take a raw `Database`, run hand-coded `db.query<SessionExport, []>("SELECT id, project_path_encoded as projectPathEncoded, ... FROM sessions")` for every table, and on import issue `db.exec("DELETE FROM session_entities;")`, `db.exec("DELETE FROM messages_meta;")`, etc. Schema column names, FTS5 table names (`messages_fts`, `sessions_fts`), `PRAGMA foreign_keys = OFF`, and table semantics live inside the application layer.
docs\audits\2026-04-26-adversarial-architecture.md:23:- **Recommended fix:** Move `exportToJson` / `importFromJson` to `infrastructure/database/services/export-service.ts` (it's an infrastructure concern — JSON-to-SQLite serialization). Or, keep an `ExportService` in application that depends on `ISessionRepository`, `IMessageRepository`, `IToolUseRepository`, `ILinkRepository`, `IEntityRepository`, `IExtractionStateRepository`, `IUnitOfWork`, and `IFileWriter`. Either way: zero raw SQL in `application/`.
docs\audits\2026-04-26-adversarial-architecture.md:44:- **File(s):** `src/presentation/cli/commands/show.ts:35-45`, `purge.ts:23-32, 140-156`, `status.ts`, `install.ts`, `browse.ts`, `pickers/session-picker.ts`, `infrastructure/paths.ts:28-47`, `infrastructure/hooks/config-manager.ts:21-30`, `infrastructure/hooks/settings-manager.ts:113-148`, `infrastructure/hooks/log-writer.ts`, `infrastructure/database/health-checker.ts`, `infrastructure/signals/checkpoint-manager.ts`
docs\audits\2026-04-26-adversarial-architecture.md:103:- **What's wrong:** `extract()` always returns `{ topics: [], terms: [], decisions: [], summary: "" }`. The comment says "actual extraction happens in hook context." The `_prompt = LlmExtractor.createExtractionPrompt(messages)` is computed and discarded.
docs\audits\2026-04-26-adversarial-architecture.md:108:- **File(s):** `src/application/services/llm-extractor.ts:93` (`class LlmExtractor` with `static extract` and `static createExtractionPrompt`); `src/application/services/pattern-extractor.ts` (similar)
.planning\phases\05-basic-sync-command\05-02-PLAN.md:95:   import type { ISessionRepository, IMessageRepository, IToolUseRepository, IExtractionStateRepository } from "../../domain/ports/repositories.js";
.planning\phases\05-basic-sync-command\05-02-PLAN.md:104:       private readonly extractionStateRepo: IExtractionStateRepository,
.planning\phases\05-basic-sync-command\05-02-PLAN.md:124:   private needsExtraction(session: SessionFileInfo, existingState: ExtractionState | null, force: boolean): boolean
.planning\phases\05-basic-sync-command\05-02-PLAN.md:157:1. Implement needsExtraction() method:
.planning\phases\05-basic-sync-command\05-02-PLAN.md:159:   private needsExtraction(
.planning\phases\05-basic-sync-command\05-02-PLAN.md:161:     existingState: ExtractionState | null,
.planning\phases\05-basic-sync-command\05-02-PLAN.md:181:2. Update filterSessions() to use needsExtraction():
.planning\phases\05-basic-sync-command\05-02-PLAN.md:205:       if (this.needsExtraction(session, state, options.force ?? false)) {
.planning\phases\05-basic-sync-command\05-02-PLAN.md:245:     let state = ExtractionState.create({
.planning\phases\05-basic-sync-command\05-02-PLAN.md:310:Extraction tests pass.
.planning\phases\05-basic-sync-command\05-03-PLAN.md:245:   import { SqliteSessionRepository, SqliteMessageRepository, SqliteToolUseRepository, SqliteExtractionStateRepository } from "../../../infrastructure/database/repositories/index.js";
.planning\phases\05-basic-sync-command\05-03-PLAN.md:282:       const extractionStateRepo = new SqliteExtractionStateRepository(db);
.planning\phases\phase-01\SUMMARY.md:37:| ExtractionState | Tracks extraction progress for incremental sync | 100% |
.planning\phases\05-basic-sync-command\05-04-SUMMARY.md:126:  const extractionStateRepo = new SqliteExtractionStateRepository(db);
docs\plans\PRD-knowledge-layer.md:12:Memory-nexus v1.0 stores 42K+ messages across 532 sessions and provides keyword search. The data is there. The intelligence is not.
docs\plans\PRD-knowledge-layer.md:26:### Why Not Post-Session LLM Extraction?
docs\plans\PRD-knowledge-layer.md:63:| Aspect | LLM Extraction (v1 draft) | Agent-Written Memory (v2) |
docs\plans\PRD-knowledge-layer.md:433:3. **Backfill:** 532 existing sessions have no memory files. Should memory-nexus offer a backfill command that generates summary-style entries from historical JSONL data? This would require LLM extraction (API cost) but only as a one-time catch-up. Recommendation: optional backfill via `memory backfill --api-key <key>`, not required for the feature to work going forward.
.planning\phases\04-storage-adapters\04-VERIFICATION.md:38:| src/infrastructure/database/repositories/extraction-state-repository.ts | IExtractionStateRepository implementation | VERIFIED | 157 lines, exports SqliteExtractionStateRepository, all 4 interface methods |
.planning\phases\04-storage-adapters\04-VERIFICATION.md:51:| SqliteExtractionStateRepository | extraction_state table | INSERT OR REPLACE | WIRED | Line 76 in extraction-state-repository.ts |
.planning\phases\10-hook-integration\10-03-PLAN.md:441:  SqliteExtractionStateRepository,
.planning\phases\10-hook-integration\10-03-PLAN.md:490:      const extractionStateRepo = new SqliteExtractionStateRepository(db);
.planning\phases\05-basic-sync-command\05-04-PLAN.md:67:   import { SqliteSessionRepository, SqliteMessageRepository, SqliteToolUseRepository, SqliteExtractionStateRepository } from "../../infrastructure/database/repositories/index.js";
.planning\phases\phase-01\PLAN.md:17:| DOM-05 | ExtractionState entity for incremental sync tracking |
.planning\phases\phase-01\PLAN.md:298:#### Task 3.5: ExtractionState entity
.planning\phases\phase-01\PLAN.md:306:- GREEN: Implement ExtractionState class
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:15:      provides: "ExtractionState with fileMtime/fileSize for incremental sync"
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:27:      to: "ISessionRepository, IMessageRepository, IToolUseRepository, IExtractionStateRepository"
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:54:| 2 | Running sync twice skips unchanged sessions (incremental behavior) | VERIFIED | Integration test "skips unchanged sessions on second sync" passes; needsExtraction() compares fileMtime/fileSize |
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:65:| src/domain/entities/extraction-state.ts | ExtractionState with file metadata | VERIFIED | 286 lines, fileMtime/fileSize properties, withFileMetadata() method |
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:66:| src/application/services/sync-service.ts | SyncService orchestration | VERIFIED | 449 lines, full sync pipeline with filterSessions(), needsExtraction() |
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:85:| SyncService | IExtractionStateRepository | constructor injection | WIRED | Line 100 |
.planning\phases\05-basic-sync-command\05-VERIFICATION.md:95:| SYNC-02: Incremental sync (mtime/size) | SATISFIED | needsExtraction() at lines 224-247 |
.planning\phases\05-basic-sync-command\05-RESEARCH.md:14:3. **Incremental sync** - Compare file mtime/size against ExtractionState records
.planning\phases\05-basic-sync-command\05-RESEARCH.md:79:    private readonly extractionStateRepo: IExtractionStateRepository,
.planning\phases\05-basic-sync-command\05-RESEARCH.md:142:**What:** Compare file mtime/size against stored ExtractionState to skip unchanged sessions.
.planning\phases\05-basic-sync-command\05-RESEARCH.md:191:): Promise<ExtractionResult> {
.planning\phases\05-basic-sync-command\05-RESEARCH.md:193:  const state = ExtractionState.create({
.planning\phases\05-basic-sync-command\05-RESEARCH.md:246:| Incremental state | Custom tracking | ExtractionState entity + repository | Already implemented in Phase 4 |
.planning\phases\05-basic-sync-command\05-RESEARCH.md:269:### Pitfall 2: Incomplete ExtractionState Population
.planning\phases\05-basic-sync-command\05-RESEARCH.md:275:**How to avoid:** Update ExtractionState with file metadata from SessionFileInfo.
.planning\phases\05-basic-sync-command\05-RESEARCH.md:406:  existingState: ExtractionState | null,
.planning\phases\05-basic-sync-command\05-RESEARCH.md:419:  // Note: Need to extend ExtractionState to store these
.planning\phases\05-basic-sync-command\05-RESEARCH.md:469:   - Resolved: Compare mtime + size from SessionFileInfo against stored ExtractionState
.planning\phases\05-basic-sync-command\05-RESEARCH.md:470:   - Need to add fileMtime/fileSize properties to ExtractionState (schema has columns)
.planning\phases\phase-01\01-UAT.md:31:note: All commands functional - sync processed 1032 sessions, list/show/related all respond correctly
.planning\phases\10-hook-integration\10-04-SUMMARY.md:51:**RecoveryService for crash recovery, stats hook status display, and 332-line HOOKS.md user guide**
.planning\phases\10-hook-integration\10-04-SUMMARY.md:83:- `docs/HOOKS.md` - 332-line comprehensive hook integration guide
.planning\phases\10-hook-integration\10-04-SUMMARY.md:107:- 1318 tests passing (32 new tests: 17 RecoveryService + 15 stats hooks)
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:45:| 3 | Each result shows snippet with matched text highlighted (context visible) | VERIFIED | search-service.ts line 61,176: snippet() with 64 tokens (doubled from 32). output-formatter.ts lines 82-92: highlightSnippet() converts mark tags. |
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:53:| 11 | Snippets provide meaningful context around matched text (64+ tokens) | VERIFIED | search-service.ts lines 61,176: snippet() uses 64 tokens (doubled from original 32). Integration test lines 550-557 confirms context is sufficient. |
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:75:| search-service.ts | FTS5 snippet() | SQL query with 64 tokens | WIRED | Lines 61,176: snippet(messages_fts, 0, mark tags, ..., 64). Token count doubled from 32. |
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:103:- Issue: Missing role, 8-char session IDs, 32-token snippets too small
.planning\phases\06-search-command-fts5\06-VERIFICATION.md:122:Full test suite: 1548 tests pass, 0 fail, 3132 assertions
.planning\phases\04-storage-adapters\04-RESEARCH.md:9:Phase 4 implements infrastructure adapters that persist domain entities (Session, Message, ExtractionState) to SQLite using bun:sqlite. The codebase already has a solid foundation: schema with FTS5 triggers, port interfaces, and database initialization with WAL mode.
.planning\phases\04-storage-adapters\04-RESEARCH.md:13:2. **FTS5 INSERT** - External content tables with triggers (already implemented) automatically update FTS index on INSERT/UPDATE/DELETE
.planning\phases\04-storage-adapters\04-RESEARCH.md:55:│   └── extraction-state-repository.ts  # IExtractionStateRepository
.planning\phases\04-storage-adapters\04-RESEARCH.md:237:**How to avoid:** The existing schema already has INSERT/UPDATE/DELETE triggers. Verify triggers exist before bulk operations.
.planning\phases\04-storage-adapters\04-RESEARCH.md:308:    snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
.planning\phases\04-storage-adapters\04-RESEARCH.md:345:): Promise<ExtractionResult> {
.planning\phases\04-storage-adapters\04-RESEARCH.md:391:| DELETE mode journal | WAL mode | SQLite 3.7 (2010) | Concurrent readers, better write perf |
.planning\phases\10-hook-integration\10-04-PLAN.md:83:import type { IExtractionStateRepository } from "../../domain/ports/repositories.js";
.planning\phases\10-hook-integration\10-04-PLAN.md:102:    private readonly extractionStateRepo: IExtractionStateRepository,
.planning\phases\10-hook-integration\10-04-PLAN.md:291:    const extractionStateRepo = new SqliteExtractionStateRepository(db);
.planning\phases\06-search-command-fts5\06-03-SUMMARY.md:14:  - Larger FTS5 snippet context (64 tokens instead of 32)
.planning\phases\06-search-command-fts5\06-03-SUMMARY.md:35:  - "64 tokens for FTS5 snippet (doubled from 32 for better context)"
.planning\phases\06-search-command-fts5\06-03-SUMMARY.md:59:- FTS5 snippet token count increased from 32 to 64 for better context
.planning\phases\06-search-command-fts5\06-03-SUMMARY.md:86:- 64 tokens for snippet context (doubled from 32 for meaningful context)
.planning\phases\06-search-command-fts5\06-VERIFICATION-OLD.md:49:| Fts5SearchService | FTS5 snippet() | SQL query with snippet() | ✓ WIRED | search-service.ts line 63: snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32). Returns highlighted snippets. |
.planning\phases\06-search-command-fts5\06-VERIFICATION-OLD.md:58:| SRCH-04: Result snippets with surrounding context | ✓ SATISFIED | Truth 3: snippet() with 32 tokens context |
.planning\phases\10-hook-integration\10-VERIFICATION.md:55:| stats-formatter.ts | HooksSummary | ExtendedStatsResult | WIRED | Lines 18-32: HooksSummary interface, ExtendedStatsResult |
.planning\phases\10-hook-integration\10-VERIFICATION.md:87:- **New tests added in Phase 10:** 32 tests
.planning\phases\04-storage-adapters\04-CONTEXT.md:51:interface ExtractionResult {
.planning\phases\03-jsonl-parsing-and-extraction\03-VERIFICATION.md:8:# Phase 3: JSONL Parsing and Extraction Verification Report
.planning\phases\03-jsonl-parsing-and-extraction\03-VERIFICATION.md:58:| PARSE-04: Tool use extraction from assistant events | SATISFIED | extractToolUseEvents() function at line 320 |
.planning\phases\03-jsonl-parsing-and-extraction\03-VERIFICATION.md:146:5. Extraction Helpers: Tool use/result extraction from events
.planning\phases\06-search-command-fts5\06-03-PLAN.md:117:   - Change snippet token count from 32 to 64 for better context
.planning\phases\06-search-command-fts5\06-03-PLAN.md:279:2. FTS5 snippet uses 64 tokens (up from 32) for better context
.planning\phases\04-storage-adapters\04-04-SUMMARY.md:130:- SqliteExtractionStateRepository (04-01)
.planning\phases\04-storage-adapters\04-04-SUMMARY.md:135:**Ready for Phase 5:** Extraction Pipeline
.planning\phases\10-hook-integration\10-UAT.md:168:docs/HOOKS.md verified at 332 lines with comprehensive coverage:
.planning\phases\10-hook-integration\10-UAT.md:190:4. Documentation is thorough (332 lines)
.planning\phases\06-search-command-fts5\06-UAT.md:77:  root_cause: "Three issues: (1) Role field not propagated from DB to display, (2) Session ID truncated to only 8 chars, (3) FTS5 snippet uses only 32 tokens - too small for context"
.planning\phases\06-search-command-fts5\06-UAT.md:80:      issue: "SearchRow missing role field, snippet() uses only 32 tokens"
.planning\phases\06-search-command-fts5\06-UAT.md:90:    - "Increase FTS5 snippet token count from 32 to 64+"
.planning\phases\03-jsonl-parsing-and-extraction\03-UAT.md:3:**Phase:** 3 - JSONL Parsing and Extraction
.planning\phases\04-storage-adapters\04-04-PLAN.md:85:  snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
.planning\phases\04-storage-adapters\04-04-PLAN.md:187:   - Update extraction state to 'complete' via SqliteExtractionStateRepository
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:1:# Plan 03-03: Event Classification and Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:41:### Task 2: Implement User Event Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:75:### Task 3: Implement Assistant Event Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:108:### Task 4: Implement Tool Event Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:135:### Task 5: Implement Tool Result Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:166:### Task 6: Implement Summary Event Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-PLAN.md:189:### Task 7: Implement System Event Extraction
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:49:- Does memory-nexus's v4.0 knowledge-extraction path (Phase 33-35 ADD/UPDATE/DELETE/NOOP) interact with friction storage? Should friction extraction be unified with that pipeline?
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:111:   - "Fallback (until `memory friction` is published)" → "Manual-entry channel (when `memory friction` is not installed)" — reflects the fact that the CLI HAS shipped.
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:120:### v4.0 caveat (forward-looking, NOT in scope here)
docs\inbox\archived\2026-05-08-conversations-friction-primacy-decision.md:122:If memory-nexus's v4.0 knowledge-extraction pipeline (Phase 33-35 ADD/UPDATE/DELETE/NOOP) evolves into a general event-log/projection architecture for facts + decisions + learnings, friction can be reconsidered as one event stream under that unified design. This avoids prematurely creating a special-purpose friction event store now. Recorded as forward-looking note; no commitment.
.planning\phases\09-context-and-related-commands\09-VERIFICATION.md:28:| 6 | User can run memory context project and see aggregated context | VERIFIED | createContextCommand() exists in context.ts, registered in CLI index.ts line 32 |
.planning\phases\09-context-and-related-commands\09-VERIFICATION.md:62:| CLI index.ts | createContextCommand | import and registration | WIRED | Imported line 10, registered line 32 |
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:28: https://bun.report/1.3.5/wt11e86cebijGukggCw2gkRsmx3M6lsqHsosvRynmwN2/72mB6t3oFu5o6FuvbgjMopvizDCYKERNEL32.DLLu10LCSntdll.dll4nhBA0eNrLzCtJTU8tUsgvSy1Ky8kvBwA2xQaD
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:31:The crash signature is identical across multiple attempts: integer overflow after Bun's memory grows past ~6.8GB peak. Stack: `KERNEL32.DLL` → `ntdll.dll`.
docs\inbox\2026-05-11-memory-nexus-bun-windows-full-suite-crash.md:47:Likely a Bun-on-Windows runtime bug — memory pressure from accumulating test coverage data, repeated module loads, and SQLite bindings exceeds an internal counter capacity. The integer overflow + KERNEL32 stack signature points to Bun's internals, not to test logic.
.planning\phases\03-jsonl-parsing-and-extraction\03-RESEARCH.md:1:# Phase 3 Research: JSONL Parsing and Extraction
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:11:closure_notify_reason: The audit's recommendation determines which architecture (A specialized + agent-as-router / B federation router / C surgical consolidation) from the conversations memory architecture inventory becomes load-bearing for memory tooling decisions across all projects. Outcome shapes whether memory-nexus targets a v5.0 federation milestone, accepts narrow-scope steady state, or stops at v4.0.
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:38:- **Mem0:** already inspiration for v4.0 Phase 34 ADD/UPDATE/DELETE/NOOP semantics; revisit holistically (not just for the extraction primitives)
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:100:- Should the audit produce concrete v5.0 phase plans, or only the recommendation? (Opinion: produce both — the recommendation is cheap once the truths are derived; phase plans inform whether v5.0 is worth scoping or v4.0 is the natural ceiling.)
docs\inbox\2026-05-08-conversations-first-principles-architecture-audit.md:101:- How does the audit interact with publishing (Phase 37, v4.0 npm publish)? Does v4.0 ship before audit, or does audit gate the v4.0 → v5.0 transition?
.planning\phases\03-jsonl-parsing-and-extraction\03-02-SUMMARY.md:116:**03-03: Event Classification and Extraction**
.planning\phases\03-jsonl-parsing-and-extraction\03-04-SUMMARY.md:176:With plan 03-04 complete, Phase 3 (JSONL Parsing and Extraction) is finished.
.planning\phases\03-jsonl-parsing-and-extraction\03-04-SUMMARY.md:198:**Phase 4: Content Extraction Pipeline**
.planning\phases\03-jsonl-parsing-and-extraction\03-03-SUMMARY.md:1:# Plan 03-03 Summary: Event Classification and Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-SUMMARY.md:23:### Event Type Extraction
.planning\phases\03-jsonl-parsing-and-extraction\03-03-SUMMARY.md:25:| Event Type | Extraction Logic |
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:12:    provides: Domain entities (Session, ExtractionState) and port interfaces
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:15:  - SqliteExtractionStateRepository implementing IExtractionStateRepository
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:58:# Phase 4 Plan 01: Session and Extraction State Repositories Summary
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:60:**SQLite adapters for Session and ExtractionState domain entities with prepared statements, idempotent inserts, and upsert semantics**
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:73:- SqliteExtractionStateRepository with full IExtractionStateRepository implementation
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:82:2. **Task 2: Implement SqliteExtractionStateRepository** - `2ebf578` (feat)
.planning\phases\04-storage-adapters\04-01-SUMMARY.md:89:- `src/infrastructure/database/repositories/extraction-state-repository.ts` - IExtractionStateRepository implementation with upsert
.planning\phases\04-storage-adapters\04-01-PLAN.md:19:    - "Extraction states track sync progress per session"
.planning\phases\04-storage-adapters\04-01-PLAN.md:26:      provides: "IExtractionStateRepository implementation"
.planning\phases\04-storage-adapters\04-01-PLAN.md:27:      exports: ["SqliteExtractionStateRepository"]
.planning\phases\04-storage-adapters\04-01-PLAN.md:33:    - from: "SqliteExtractionStateRepository"
.planning\phases\04-storage-adapters\04-01-PLAN.md:40:Implement SqliteSessionRepository and SqliteExtractionStateRepository adapters.
.planning\phases\04-storage-adapters\04-01-PLAN.md:42:Purpose: Sessions are the root aggregate - all other entities reference sessions. Extraction state tracks incremental sync progress. Both are needed before messages can be stored.
.planning\phases\04-storage-adapters\04-01-PLAN.md:44:Output: Two repository classes implementing ISessionRepository and IExtractionStateRepository ports, with unit tests validating all interface methods.
.planning\phases\04-storage-adapters\04-01-PLAN.md:83:   - deleteStmt: DELETE by id
.planning\phases\04-storage-adapters\04-01-PLAN.md:91:   - delete(id): Simple DELETE, cascade handled by FK
.planning\phases\04-storage-adapters\04-01-PLAN.md:116:  <name>Task 2: Implement SqliteExtractionStateRepository</name>
.planning\phases\04-storage-adapters\04-01-PLAN.md:122:Create SqliteExtractionStateRepository implementing IExtractionStateRepository:
.planning\phases\04-storage-adapters\04-01-PLAN.md:131:   - findById(id): Returns ExtractionState | null
.planning\phases\04-storage-adapters\04-01-PLAN.md:137:   - ExtractionState.create() requires: id, sessionPath, startedAt, status (optional), completedAt (optional), messagesExtracted (optional), errorMessage (optional)
.planning\phases\04-storage-adapters\04-01-PLAN.md:157:SqliteExtractionStateRepository implements all IExtractionStateRepository methods. Tests verify state tracking and upsert semantics work correctly.
.planning\phases\04-storage-adapters\04-01-PLAN.md:170:   - Export SqliteExtractionStateRepository
.planning\phases\04-storage-adapters\04-01-PLAN.md:207:2. SqliteExtractionStateRepository passes all interface contract tests
.planning\phases\09-context-and-related-commands\09-04-PLAN.md:101:  SqliteExtractionStateRepository,
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:22:| 2 | User can search with `--project wow-system` and see only results from that project (substring match) | ✓ VERIFIED | search-service.ts line 132 uses LOWER(project_name) LIKE with wildcards (line 133); projectFilter passed as string from search.ts line 182 |
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:24:| 4 | User can search with `--role assistant` and only see Claude's responses | ✓ VERIFIED | search.ts lines 132-140 parses role filter; search-service.ts lines 137-146 applies role filter in SQL |
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:40:| `src/infrastructure/database/services/search-service.ts` | Project filter using LIKE on project_name | ✓ VERIFIED | 226 lines, lines 132-133 use LOWER(project_name) LIKE with wildcards |
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:50:| search-service.ts | sessions.project_name | LIKE clause | ✓ WIRED | Line 132: `LOWER(s.project_name) LIKE LOWER(?)`, line 133: wildcards `%${options.projectFilter}%` |
.planning\phases\07-filtering-and-output-formatting\07-VERIFICATION.md:87:- **Verified:** search-service.ts line 132 uses LOWER(project_name) LIKE, line 133 adds wildcards
.planning\phases\08-stats-and-list-commands\08-VERIFICATION.md:3:verified: 2026-02-04T02:41:32Z
.planning\phases\08-stats-and-list-commands\08-VERIFICATION.md:22:**Verified:** 2026-02-04T02:41:32Z
.planning\phases\07-filtering-and-output-formatting\07-03-PLAN.md:78:- green("text") with color -> "\x1b[32mtext\x1b[0m"
.planning\phases\07-filtering-and-output-formatting\07-03-PLAN.md:95:   - green(text, useColor?): "\x1b[32m"
.planning\phases\07-filtering-and-output-formatting\07-RESEARCH.md:360:const green = (text: string) => colorize(text, "32");
.planning\phases\07-filtering-and-output-formatting\07-RESEARCH.md:389:### Snippet Extraction with Ellipsis
.planning\phases\11-session-navigation\11-01-PLAN.md:155:    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-01-PLAN.md:156:    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-01-PLAN.md:166:    FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-01-PLAN.md:167:    FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\16-hybrid-search\16-01-PLAN.md:80:   - Test `SearchResult.create()` with `rawScores: { bm25: -5.2, cosine: 0.85, rrf: 0.032 }` -- `result.rawScores` returns the object
.planning\phases\16-hybrid-search\16-01-PLAN.md:256:     - Create a query embedding (Float32Array of 384 dimensions)
.planning\phases\16-hybrid-search\16-01-PLAN.md:406:    * @param queryEmbedding The query vector (Float32Array)
.planning\phases\16-hybrid-search\16-01-PLAN.md:410:   vectorKnnSearch(queryEmbedding: Float32Array, limit: number): VectorSearchRow[] {
.planning\phases\16-hybrid-search\16-01-PLAN.md:412:     const stmt = this.db.prepare<VectorSearchRow, [Float32Array, number]>(`
.planning\phases\31-bug-fixes\31-01-PLAN.md:77:    - Test: sanitizeFtsQuery with Cyrillic (e.g., "\u041f\u0440\u0438\u0432\u0435\u0442") returns "\u041f\u0440\u0438\u0432\u0435\u0442"
.planning\phases\31-bug-fixes\31-01-PLAN.md:88:    **Review concern addressed: FTS5 phrase query support (MEDIUM from Gemini review).** The primary regex (lines 32-38) already preserves balanced double-quotes for phrase searching. However, the fallback regex (line 50) strips them. The fix must preserve balanced quotes in the fallback path too, so that Unicode-heavy queries that hit the fallback can still use phrase search.
.planning\phases\11-session-navigation\11-01-SUMMARY.md:61:- **Started:** 2026-01-31T19:02:32Z
.planning\phases\11-session-navigation\11-02-SUMMARY.md:41:  - "Max confidence preservation uses SELECT then conditional UPDATE"
.planning\phases\11-session-navigation\11-02-SUMMARY.md:43:  - "Frequency increment uses ON CONFLICT DO UPDATE SET syntax"
.planning\phases\11-session-navigation\11-02-SUMMARY.md:70:- SqliteEntityRepository with INSERT/UPDATE for max confidence preservation
.planning\phases\11-session-navigation\11-02-SUMMARY.md:96:1. **Max confidence preservation strategy** - Used SELECT to check existing entity, then conditional UPDATE only if new confidence is higher. Returns Entity with max(existing, new) confidence. Avoids INSERT OR REPLACE which would reset metadata.
.planning\phases\11-session-navigation\11-02-SUMMARY.md:100:3. **Frequency increment syntax** - Used `ON CONFLICT DO UPDATE SET frequency = frequency + excluded.frequency` for session-entity linking. This correctly accumulates frequency across multiple link calls.
.planning\phases\21-architecture-boundary-cleanup\21-VERIFICATION.md:60:| QUAL-03 | 21-01 | All new infrastructure adapters follow existing port/adapter patterns | SATISFIED | IEmbeddingRepository port defined in domain layer; EmbeddingRepository implements it with `implements IEmbeddingRepository` clause; EmbeddingService imports only from domain. All 7 repository adapters (ISession, IMessage, IToolUse, ILink, IExtractionState, IEntity, IEmbedding) now follow the port/adapter pattern. REQUIREMENTS.md tracking table updated: "Phase 19 + 21 (gap closure): Complete". |
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:11:The fix is mechanical: define an `IEmbeddingRepository` port interface in `domain/ports/`, make `EmbeddingRepository` implement it, and update `EmbeddingService` to import only the domain port. The same treatment applies to the `EmbeddingConfigData` type reference. Every other repository in the codebase already follows this pattern (ISessionRepository, IMessageRepository, IToolUseRepository, ILinkRepository, IExtractionStateRepository, IEntityRepository), so this phase aligns the embedding repository with the established convention.
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:50:- `IExtractionStateRepository` -> `SqliteExtractionStateRepository`
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:64:      repositories.ts        # ADD: IEmbeddingRepository interface
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:65:      index.ts                # ADD: re-export IEmbeddingRepository
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:76:### Pattern: Interface Extraction from Concrete Class
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:115:interface EmbeddingBatchItem { rowid: number; embedding: Float32Array; }
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:118:They are used in the `IEmbeddingRepository` method signatures, so they MUST live in the domain layer alongside the port interface. They contain only primitives and `Float32Array` -- zero external dependencies, safe for the domain layer.
.planning\phases\21-architecture-boundary-cleanup\21-RESEARCH.md:181:    embedding: Float32Array;
.planning\phases\11-session-navigation\11-04-SUMMARY.md:149:- Plan 11-05 (LLM Extraction Service) can proceed independently
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:91:    embedding: Float32Array;
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:104:    vectorKnnSearch(queryEmbedding: Float32Array, limit: number): VectorSearchRow[]
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:125:export type { ISessionRepository, IMessageRepository, IToolUseRepository, ILinkRepository, IExtractionStateRepository } from "./repositories.js";
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:126:// ADD: IEmbeddingRepository, UnembeddedMessage, EmbeddingBatchItem, EmbeddingServiceConfig
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:156:2. **EmbeddingBatchItem interface** -- Move from infrastructure to domain. Fields: `rowid: number`, `embedding: Float32Array`. JSDoc the interface and each field.
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:180:  IExtractionStateRepository,
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:193:- No external imports needed (only primitives and Float32Array)
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:223:// ADD this single import:
.planning\phases\21-architecture-boundary-cleanup\21-01-PLAN.md:241:// ADD this single import:
.planning\phases\11-session-navigation\11-05-PLAN.md:26:      exports: ["LlmExtractor", "ExtractionResult"]
.planning\phases\11-session-navigation\11-05-PLAN.md:78:export interface ExtractionResult {
.planning\phases\11-session-navigation\11-05-PLAN.md:105:  static async extract(options: LlmExtractorOptions): Promise<ExtractionResult>;
.planning\phases\11-session-navigation\11-05-PLAN.md:111:  static createExtractionPrompt(messages: Message[]): string;
.planning\phases\11-session-navigation\11-05-PLAN.md:117:  static parseExtractionResponse(
.planning\phases\11-session-navigation\11-05-PLAN.md:120:  ): ExtractionResult;
.planning\phases\11-session-navigation\11-05-PLAN.md:124:Extraction prompt structure:
.planning\phases\11-session-navigation\11-05-PLAN.md:154:1. createExtractionPrompt() formats messages correctly
.planning\phases\11-session-navigation\11-05-PLAN.md:155:2. parseExtractionResponse() handles valid JSON
.planning\phases\11-session-navigation\11-05-PLAN.md:156:3. parseExtractionResponse() handles missing fields gracefully
.planning\phases\11-session-navigation\11-05-PLAN.md:157:4. parseExtractionResponse() handles malformed JSON (returns empty result)
.planning\phases\11-session-navigation\11-05-PLAN.md:254:ALTER TABLE sessions ADD COLUMN summary TEXT;
.planning\phases\11-session-navigation\11-05-PLAN.md:271:CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
.planning\phases\11-session-navigation\11-05-PLAN.md:272:  DELETE FROM sessions_fts WHERE rowid = old.rowid;
.planning\phases\11-session-navigation\11-05-PLAN.md:313:1. LlmExtractor.extract() returns structured ExtractionResult
.planning\phases\11-session-navigation\11-05-SUMMARY.md:40:  - "FTS triggers only on UPDATE and DELETE (summary NULL on INSERT)"
.planning\phases\11-session-navigation\11-05-SUMMARY.md:46:  - "FTS5 UPDATE trigger with DELETE+INSERT for clean index updates"
.planning\phases\11-session-navigation\11-05-SUMMARY.md:53:# Phase 11 Plan 05: LLM Extraction Service Summary
.planning\phases\11-session-navigation\11-05-SUMMARY.md:96:- **FTS triggers on UPDATE only:** INSERT trigger omitted since summary is NULL on initial insert; UPDATE trigger handles FTS indexing when summary is set
.planning\phases\16-hybrid-search\16-VERIFICATION.md:79:| HSRCH-06 | 16-02 | Embed query at search time via provider | SATISFIED | `embedQuery()` in `hybrid-search-service.ts:326`; called in `vectorSearch()` and `hybridSearch()` |
.planning\phases\11-session-navigation\11-CONTEXT.md:23:### Entity Extraction
.planning\phases\11-session-navigation\11-CONTEXT.md:25:- **Extraction method:** Hybrid approach — pattern-based for artifacts, LLM for concepts/decisions
.planning\phases\16.1-migration-race-condition-fix\16.1-RESEARCH.md:135:**How to avoid:** The existing `closeDatabase()` function switches from WAL to DELETE journal mode before closing, which removes WAL/SHM files. Ensure the destination DB is not open before attempting the overwrite. In the migration path, no DB connection is open yet (migration runs before `program.parse()`), so this should not be an issue.
.planning\phases\11-session-navigation\11-RESEARCH.md:156:### Pattern 3: Entity Extraction (Hybrid)
.planning\phases\11-session-navigation\11-RESEARCH.md:195:export interface LLMExtraction {
.planning\phases\11-session-navigation\11-RESEARCH.md:232:    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-RESEARCH.md:233:    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-RESEARCH.md:243:    FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-RESEARCH.md:244:    FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
.planning\phases\11-session-navigation\11-RESEARCH.md:289:### Pitfall 4: LLM Extraction Timeout
.planning\phases\11-session-navigation\11-RESEARCH.md:475:### Entity Extraction (Pattern-Based)
.planning\phases\11-session-navigation\11-RESEARCH.md:538:### LLM Extraction Prompt Template
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-RESEARCH.md:28:1. **Build gap:** The current build script (`bun build src/presentation/cli/index.ts`) only produces `dist/presentation/cli/index.js` (the CLI binary). There is no `dist/index.js` — the library entry point declared in `package.json` as `"main": "dist/index.js"` does not exist in the published artifact.
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-RESEARCH.md:81:├── index.ts                    # UPDATED: also exports execute*Command surface
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-RESEARCH.md:307:**How to avoid:** Add `build:lib` as a separate npm script using `tsc`. Gate `aidev publish` on `bun run build` which runs both.
.planning\phases\16-hybrid-search\16-RESEARCH.md:309:| Vector similarity search | Custom cosine in JS | sqlite-vec `WHERE embedding MATCH ?` | SIMD-optimized C code; 10-50x faster than JS Float32Array loops |
.planning\phases\16-hybrid-search\16-RESEARCH.md:395:  queryEmbedding: Float32Array,
.planning\phases\16-hybrid-search\16-RESEARCH.md:398:  const stmt = db.prepare<VectorSearchRow, [Float32Array, number]>(`
.planning\phases\16-hybrid-search\16-RESEARCH.md:418:): Promise<Float32Array> {
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:70:| `src/presentation/cli/commands/sync.ts` | DELETED (confirmed) |
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:71:| `src/presentation/cli/commands/sync.test.ts` | DELETED (confirmed) |
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:72:| `src/presentation/cli/commands/sync.integration.test.ts` | DELETED (confirmed) |
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:73:| `src/presentation/cli/commands/sync-lazy-loaders.test.ts` | DELETED (confirmed) |
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:74:| `src/presentation/cli/commands/friction.ts` | DELETED (confirmed) |
.planning\phases\30-god-file-cleanup\30-VERIFICATION.md:75:| `src/presentation/cli/commands/friction.test.ts` | DELETED (confirmed) |
.planning\phases\16.1-migration-race-condition-fix\16.1-01-SUMMARY.md:53:- **Completed:** 2026-02-27T23:14:32Z
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-02-SUMMARY.md:17:affects: [aidev-integration, npm-publish, api-consumers, documentation]
.planning\phases\30-god-file-cleanup\30-REVIEWS.md:71:**Summary:** Closer to workable than 30-01 because friction handlers map cleanly to subcommands, but still has one major feasibility problem: `friction/index.ts` is too overloaded for the 200-line cap. Types + `createFrictionCommand()` + `executeFrictionCommand()` cover lines 34-321 (~287 lines).
.planning\phases\30-god-file-cleanup\30-REVIEWS.md:74:- **HIGH:** friction/index.ts (~200 line estimate) won't hold. Lines 34-321 is ~287 lines of types + registration + dispatch before imports.
.planning\phases\30-god-file-cleanup\30-REVIEWS.md:101:- **HIGH:** Both `sync/index.ts` and `friction/index.ts` WILL NOT fit under 200 lines. Codex verified against actual line counts: sync lines 111-309 (~200 lines without interfaces/imports), friction lines 34-321 (~287 lines). Plans must either add a module (e.g., types.ts, registration.ts) or relax the cap for entrypoints.
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:12:  - "sync.ts Phase 15 code paths covered: model-change-declined (lines 320-327), interactive readline prompt (lines 418-430), and lazy loader functions (lines 492-520) now tested"
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:18:    why_human: "Requires real ONNX model download and vec_f32 writes to sqlite-vec; cannot simulate in unit tests without running the full ONNX pipeline"
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:60:| 5 | Coverage meets 95%+ at each metric for all new Phase 15 code paths | VERIFIED | background-embedder.ts: 100%/100%; status.ts Phase 15 paths (lines 161-187): covered; sync.ts Phase 15 paths (lines 320-327, 418-430, 492-520): covered; all remaining uncovered lines are pre-existing code from before Phase 15 |
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:83:- Previously uncovered Phase 15 paths: lines 320-327, 418-430, 492-520
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:97:| `src/infrastructure/database/schema.ts` | EMBEDDING_STATE_ADD_MODEL_NAME migration | VERIFIED | Migration constant and PRAGMA table_info check in createSchema() present |
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:144:**Why human:** Requires real ONNX model download and vec_f32 writes to sqlite-vec. Cannot simulate in unit tests without running the full ONNX pipeline.
.planning\phases\15-embedding-pipeline\15-VERIFICATION.md:170:- **sync.ts**: Phase 15 paths (lines 320-327, 418-430, 492-520) are now covered. Remaining 39.87% line coverage is pre-existing `executeSyncCommand`, `executeDryRun`, `handleError`, and `reportResults` functions that predate Phase 15.
.planning\phases\13-package-rename\13-RESEARCH.md:26:- Stub published once and left forever. One version, never updated.
.planning\phases\13-package-rename\13-RESEARCH.md:413:   - Recommendation: Verify `npm whoami` and check npm org setup before attempting publish. This is a pre-requisite, not a code change.
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-02-PLAN.md:126:32. Return value has `exitCode` property as a number
.planning\phases\16.1-migration-race-condition-fix\16.1-01-PLAN.md:89:   - Create XDG data dir with `memory.db` (100 bytes), `memory.db-wal` (50 bytes), `memory.db-shm` (32 bytes)
.planning\phases\13-package-rename\13-03-PLAN.md:19:    - "Deprecation stub package exists as a self-contained directory ready for independent npm publish"
.planning\phases\13-package-rename\13-03-PLAN.md:56:Output: deprecation-stub/ directory ready for npm publish, MIGRATION.md, updated README.md and CLAUDE.md, renamed WoW rules file, install command with stale hook warning.
.planning\phases\13-package-rename\13-03-PLAN.md:90:    Create a `deprecation-stub/` directory at the project root. This is a separate, self-contained npm package that will be published independently to the `memory-nexus` package name on npm.
.planning\phases\13-package-rename\13-03-PLAN.md:120:    This stub is intentionally minimal per the locked decision: "Stub published once and left forever. One version, never updated. It's a signpost."
.planning\phases\13-package-rename\13-03-PLAN.md:149:    Deprecation stub directory exists at project root, ready for independent npm publish. Install command detects and warns about stale memory-nexus hook references. All tests pass.
.planning\phases\13-package-rename\13-03-PLAN.md:186:    - Add a note at the bottom or a brief section: "Previously published as memory-nexus. See MIGRATION.md for upgrade instructions."
.planning\phases\13-package-rename\13-03-PLAN.md:267:- Deprecation stub exists as self-contained publishable package
.planning\phases\17-provider-ecosystem\17-VERIFICATION.md:43:| `src/presentation/cli/commands/sync.ts` | Dimension change detection before clearAndReembed | VERIFIED | Lines 327-334 in runEmbeddingPass(); getStoredEmbeddingDimensions() + recreateVecTable() called when dimensions differ |
.planning\phases\17-provider-ecosystem\17-VERIFICATION.md:54:| `runEmbeddingPass()` | `repository.recreateVecTable()` | dimension check after model change confirmed | WIRED | Lines 327-334: getStoredEmbeddingDimensions() compared to config.embedding.dimensions; recreateVecTable called when different |
.planning\phases\17-provider-ecosystem\17-VERIFICATION.md:55:| `EmbeddingRepository` | `getStoredEmbeddingDimensions()` | byteLength/4 detection | WIRED | Lines 197-210: queries message_embeddings, returns byteLength/4 for Float32 dimension count |
.planning\phases\17-provider-ecosystem\17-VERIFICATION.md:113:| sync.ts (Phase 17 additions: ~11 lines) | -- | lines 327-334 dimension-change block | YES (verified via DI test mocks) |
.planning\phases\13-package-rename\13-CONTEXT.md:9:Rename the package from `memory-nexus` to `@chude/memory` with the `memory` binary. Migrate existing user data paths, update hooks, and publish a deprecation stub for the old package name. No new features or capabilities -- purely organizational rename with data migration.
.planning\phases\13-package-rename\13-CONTEXT.md:26:- Stub published once and left forever. One version, never updated. It's a signpost.
.planning\phases\14-embedding-infrastructure\14-VERIFICATION.md:29:| 2  | `EmbeddingResult` and `EmbeddingConfig` value objects exist with validation and immutability      | VERIFIED   | `embedding-result.ts` (94 lines) copies Float32Array on construction and getter; `embedding-config.ts` (113 lines) validates dimensions > 0 integer |
.planning\phases\14-embedding-infrastructure\14-VERIFICATION.md:45:| `src/domain/value-objects/embedding-result.ts`                   | Float32Array value object with immutability        | VERIFIED   | 94 lines; copies on construction + getter; validates dimensions match |
.planning\phases\18-api-stabilization-and-aidev-integration-readiness\18-01-SUMMARY.md:17:affects: [aidev-integration, npm-publish, programmatic-api-consumers]
.planning\phases\16-hybrid-search\16-03-PLAN.md:234:      "raw_scores": { "bm25": -3.2, "cosine": 0.87, "rrf": 0.032 },
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:27:- Completion summary: "Embedded 500 messages in 32s (15.6 msg/s)" -- matches sync's existing summary style
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:76:| sqlite-vec | 0.1.6 | vec0 table for storing embeddings | Already loaded by connection.ts; INSERT via vec_f32() |
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:168:  "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:263:**How to avoid:** For re-embedding: `DELETE FROM message_embeddings` (clears all vectors) + `DELETE FROM embedding_state` (clears all tracking). Both must be deleted. Then re-embed from scratch.
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:300:  "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:309:  embedding: Float32Array;
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:396:1. **vec_f32() input format in bun:sqlite**
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:397:   - What we know: sqlite-vec docs show `vec_f32(?)` with Float32Array as parameter
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:398:   - What's unclear: Whether bun:sqlite passes Float32Array correctly to sqlite-vec's vec_f32() function, or if it needs Buffer conversion
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:420:- sqlite-vec documentation: `INSERT INTO ... (rowid, embedding) VALUES (?, vec_f32(?))` pattern
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:427:- vec_f32() + bun:sqlite Float32Array interop -- needs validation (see Open Question 1)
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:480:      embedding: new Float32Array(384).fill(0.1),
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:487:        embedding: new Float32Array(384).fill(0.1),
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:520:| PIPE-05 | message_embeddings vec0 insert with vec_f32() | integration | `bun test src/infrastructure/database/repositories/embedding-repository.test.ts` | Wave 0 |
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:530:- [ ] Verify `createSchema(db)` with sqlite-vec loads correctly in test environment for vec0 table operations (Open Question 1: Float32Array + vec_f32() interop)
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:538:| vec_f32() + Float32Array interop | bun:sqlite may not pass Float32Array correctly to sqlite-vec vec_f32() function; could need Buffer conversion | Insert a Float32Array via vec_f32() and read it back; compare dimensions | integration |
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:553:- EmbeddingRepository: INSERT into embedding_state + message_embeddings vec0 table, LEFT JOIN unembedded query, bulk DELETE for re-embedding, round-trip verification
.planning\phases\15-embedding-pipeline\15-RESEARCH.md:555:- vec_f32() interop validation: Float32Array insert + readback
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:52:| @huggingface/transformers v3 | v4.0.0-next.4 | v4 has 4x BERT speedup + 53% smaller bundle, but is preview-only (`@next` tag); migrate when stable |
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:101:  embedding: Float32Array;
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:200:  FOREIGN KEY (message_id) REFERENCES messages_meta(rowid) ON DELETE CASCADE
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:247:| Vector distance computation | Manual cosine similarity in JS | sqlite-vec `MATCH` operator | sqlite-vec uses SIMD (AVX2/NEON) for 10-50x speedup over pure JS Float32Array loops |
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:277:### Pitfall 3: Float32Array Serialization for sqlite-vec
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:279:**What goes wrong:** Passing a JavaScript `number[]` array to sqlite-vec's `vec_f32()` SQL function instead of a `Float32Array` causes incorrect results or errors.
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:281:**Why it happens:** sqlite-vec expects raw binary float32 data. A `Float32Array` provides the correct binary representation. A `number[]` would be serialized as JSON text.
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:283:**How to avoid:** Always pass `Float32Array` to sqlite-vec query parameters. The `EmbeddingResult.embedding` field is typed as `Float32Array` for this reason.
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:326:// Insert a vector (must be Float32Array)
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:327:const vector = new Float32Array(384);
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:328:const stmt = db.prepare("INSERT INTO embeddings(rowid, embedding) VALUES (?, vec_f32(?))");
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:332:const query = new Float32Array(384);
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:342:### Transformers.js Feature Extraction Pipeline
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:368:const float32 = new Float32Array(embedding);    // For sqlite-vec
.planning\phases\14-embedding-infrastructure\14-RESEARCH.md:435:   - What's unclear: Whether this is intentional or a publishing mistake. The `alpha` tag points to `0.1.7-alpha.10` (a newer alpha).
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:22:  - "Detect stored dimensions by querying one embedding and dividing byteLength by 4 (Float32)"
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:25:  - "Same-dimension model changes use existing DELETE-only path (no table drop)"
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:50:**getStoredEmbeddingDimensions()** -- Queries one embedding from message_embeddings, returns byteLength/4 (Float32 = 4 bytes per dimension). Returns null when no embeddings exist.
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:60:4. If same: uses existing DELETE-only path (no table recreation needed)
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:67:2. **Atomic state clearing in recreateVecTable**: Both message_embeddings (DROP+CREATE) and embedding_state (DELETE) are cleared together. This prevents orphaned state when vectors are gone.
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:71:4. **Same-dimension model changes**: When switching between models with identical dimensions (e.g., two 384d local models), the standard DELETE-only clearAllEmbeddings() path runs. No table drop needed.
.planning\phases\17-provider-ecosystem\17-02-SUMMARY.md:90:- Same-dimension model changes (384 -> 384) use DELETE-only path
.planning\phases\14-embedding-infrastructure\14-03-PLAN.md:34:- [ ] `embed(text)` returns `EmbeddingResult` with Float32Array of 384 dimensions using mean pooling + normalization
.planning\phases\14-embedding-infrastructure\14-03-PLAN.md:57:**Research Pitfall 3 (Float32Array Serialization):** `embed()` must return Float32Array (not number[]). The pipeline output `.tolist()[0]` returns number[], which must be wrapped in `new Float32Array(...)`.
.planning\phases\14-embedding-infrastructure\14-03-PLAN.md:86:   - Test `embedding` field is Float32Array with correct length (384)
.planning\phases\14-embedding-infrastructure\14-03-PLAN.md:162:    const embedding = new Float32Array(output.tolist()[0]);
.planning\phases\16-hybrid-search\16-02-SUMMARY.md:56:- **Completed:** 2026-02-27T17:17:32Z
.planning\phases\30-god-file-cleanup\30-02-SUMMARY.md:131:- Ready for Phase 31 (Bug Fixes) or Phase 32 (CLI Surface)
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:5:tags: [embedding, value-objects, ports, hexagonal-architecture, float32array]
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:21:  patterns: [Float32Array immutable copy in value objects, DownloadProgress callback pattern for model downloads]
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:37:  - "Float32Array copied on construction and on getter access for full immutability"
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:42:  - "Float32Array value object pattern: copy on construction + copy on getter for immutability"
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:54:**IEmbeddingProvider port with embed/embedBatch/initialize/dispose lifecycle, EmbeddingResult Float32Array value object, and EmbeddingConfig with validated defaults**
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:66:- EmbeddingResult value object wrapping Float32Array with defensive copy immutability, model metadata, and dimension validation
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:78:- `src/domain/value-objects/embedding-result.ts` - Immutable Float32Array wrapper with model/dimensions validation
.planning\phases\14-embedding-infrastructure\14-01-SUMMARY.md:89:- Float32Array is copied both on construction (from input) and on getter access (to caller) to ensure full immutability, at the cost of allocation overhead per access
.planning\phases\15-embedding-pipeline\15-CONTEXT.md:25:- Completion summary: "Embedded 500 messages in 32s (15.6 msg/s)" -- matches sync's existing summary style
.planning\phases\17-provider-ecosystem\17-UAT.md:50:  root_cause: "migrateFromLegacy() move list excludes .db-shm/.db-wal sidecars; directory skip logic (line 263) leaves legacy copies; final cleanup (line 326-334) only removes legacy dir if completely empty"
.planning\phases\20-public-api-type-exports\20-VERIFICATION.md:18:| 2 | IStatsService, StatsResult, ProjectStats exported from domain/ports barrel | Pass | All three in domain/ports/index.ts lines 30-32 |
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:22:When the user switches providers or models (e.g., local 384d to OpenAI 1536d), the vec0 table must be dropped and recreated with the new dimension before re-embedding. The existing `clearAllEmbeddings()` only DELETEs rows -- it does not change the structural dimension of the vec0 table. This plan adds dimension-aware vec0 table recreation and integrates it into the re-embedding flow.
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:29:3. `service.clearAndReembed()` calls `repository.clearAllEmbeddings()` (DELETE FROM) then `embedUnembedded()`
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:31:The gap: `clearAllEmbeddings()` only DELETEs rows. The vec0 virtual table `message_embeddings` was created with `float[384]` in schema.ts. Inserting a 1536-dimensional Float32Array into a `float[384]` table causes sqlite-vec errors.
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:40:- Existing 384d -> 384d model changes (same dimension) still use DELETE-only path (no table recreation)
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:62:Strategy for detecting stored dimensions: Query a single embedding from message_embeddings and check the Float32Array length. The vec0 table stores raw vectors -- reading one back reveals its dimension. Alternative: probe the vec0 table definition via `PRAGMA table_info` (but vec0 virtual tables may not report this reliably). Safest approach: query one row, check the length of the returned embedding vector.
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:79:  // Float32 = 4 bytes per dimension
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:84:Note: sqlite-vec returns embeddings as raw bytes. A Float32Array has 4 bytes per element. Dividing byteLength by 4 gives the dimension count.
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:103:  this.db.exec("DELETE FROM embedding_state");
.planning\phases\17-provider-ecosystem\17-02-PLAN.md:181:5. Re-embedding without dimension change: 384d -> 384d uses standard DELETE path
.planning\phases\16-hybrid-search\16-02-PLAN.md:105:  embed: mock(() => Promise.resolve({ embedding: new Float32Array(384), model: "mock", dimensions: 384 })),
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:116:export async function executeFrictionCommand(options, deps?): Promise<CommandResult>; // lines 268-321
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:118:// function handleLog(service, options): Promise<CommandResult>     // lines 326-365
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:175:    **Why 8 modules instead of 7:** Codex verified that types/interfaces (lines 34-112, ~79 lines) + `createFrictionCommand()` (lines 119-257, ~139 lines) + `executeFrictionCommand()` (lines 268-321, ~54 lines) + imports (~15 lines) = ~287 lines, exceeding the 200-line cap. Per D-03 and D-discretion, extract all type/interface definitions to a dedicated `types.ts` module.
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:193:    - `executeFrictionCommand()` function (lines 268-321) -- the dispatch orchestrator
.planning\phases\30-god-file-cleanup\30-02-PLAN.md:222:    Contains: `handleLog()` function (lines 326-365)
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:30:- [ ] `EmbeddingResult` value object exists with `embedding` (Float32Array), `model` (string), `dimensions` (number) fields
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:48:- Test `EmbeddingResult.create()` with valid Float32Array, model string, dimensions number
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:49:- Test that `embedding` getter returns a Float32Array (not number[])
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:52:- Test immutability: modifying the input Float32Array after creation does not affect the value object
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:66:- Private constructor, static `create(params: { embedding: Float32Array; model: string; dimensions: number })` factory
.planning\phases\14-embedding-infrastructure\14-01-PLAN.md:68:- Copy the Float32Array on construction (`new Float32Array(embedding)`) for immutability
.planning\phases\15-embedding-pipeline\15-04-SUMMARY.md:60:- sync.ts Phase 15 paths covered: model-change-declined (320-327), interactive readline (418-430), lazy loaders (492-520)
.planning\phases\14-embedding-infrastructure\14-02-PLAN.md:84:  FOREIGN KEY (message_id) REFERENCES messages_meta(rowid) ON DELETE CASCADE
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:11:The most significant finding is a **dimension mismatch problem**: the vec0 virtual table (`message_embeddings`) is created with hardcoded `float[384]` dimensions in the schema. Switching from the default local model (384d) to OpenAI's text-embedding-3-small (1536d) requires dropping and recreating the vec0 table, not just clearing rows. The existing `clearAllEmbeddings()` only DELETEs rows. This is the one non-trivial piece of Phase 17 -- all other work is straightforward adapter implementation.
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:124:    const embedding = new Float32Array(result.data[0].embedding);
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:158:          embedding: new Float32Array(item.embedding),
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:226:    const embedding = new Float32Array(result.embeddings[0]);
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:250:        embedding: new Float32Array(emb),
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:305:**What goes wrong:** User switches from local (384d) to OpenAI (1536d). The vec0 table is still `float[384]`. New embeddings are 1536-dimensional Float32Arrays. sqlite-vec rejects or silently truncates them.
.planning\phases\17-provider-ecosystem\17-RESEARCH.md:306:**Why it happens:** `clearAllEmbeddings()` only DELETEs rows, does not DROP/CREATE the table. The vec0 schema dimension is structural (defined at CREATE time).
.planning\phases\20-public-api-type-exports\20-01-PLAN.md:94:**Name collision check:** Before committing, verify no duplicate export names. The domain barrel currently exports from `entities`, `value-objects`, `services`, `errors`. Adding `ports` introduces: `ISessionRepository`, `IMessageRepository`, `IToolUseRepository`, `ILinkRepository`, `IExtractionStateRepository`, `IEmbeddingProvider`, `DownloadProgress`, `EmbeddingModelInfo`, `ISearchService`, `SearchOptions`, `SearchMode`, `HybridSearchOptions`, `IStatsService`, `StatsResult`, `ProjectStats`, `ISessionSource`, `IEventParser`, `SessionFileInfo`, `ParsedEvent`, `UserEventData`, `AssistantEventData`, `ToolUseEventData`, `ToolResultEventData`, `SummaryEventData`, `SystemEventData`, `ContentBlock`. None of these conflict with entity/value-object/service/error names (those use concrete class names like `Session`, `Message`, `SearchQuery`, `SearchResult`, `ContentExtractor`, `QueryParser`, `ParsedQuery`, `QueryFilters`).
.planning\phases\15-embedding-pipeline\15-04-PLAN.md:32:- [ ] `sync.ts` Phase 15 code paths are covered: `runEmbeddingPass` model-change-declined early return (lines 320-327), `handleModelChange` interactive readline prompt (lines 418-430), lazy loader functions `loadBackgroundDeps`/`loadFactory`/`loadConfig`/`loadRepository` (lines 492-520)
.planning\phases\15-embedding-pipeline\15-04-PLAN.md:169:**1. runEmbeddingPass model-change-declined path (lines 320-327):**
.planning\phases\15-embedding-pipeline\15-04-PLAN.md:170:When `modelState.modelChanged && modelState.needsReEmbed` is true at line 319, `handleModelChange` is called. If it returns `false` (user declines), lines 321-324 execute: `await factory.dispose(); return;`. There is also a quiet-mode log at lines 325-327 when user confirms. The test for `runEmbeddingPass` needs to simulate a model change where the user declines.
.planning\phases\15-embedding-pipeline\15-04-PLAN.md:178:The actual gap is that `runEmbeddingPass` itself never exercises the `!proceed` branch at line 321. We need a test where:
.planning\phases\15-embedding-pipeline\15-01-SUMMARY.md:28:  - "Float32Array passed directly to sqlite-vec vec_f32() works in bun:sqlite (no Buffer conversion needed)"
.planning\phases\15-embedding-pipeline\15-01-SUMMARY.md:80:- `src/infrastructure/database/schema.ts` -- EMBEDDING_STATE_ADD_MODEL_NAME migration + createSchema migration logic
.planning\phases\15-embedding-pipeline\15-01-SUMMARY.md:82:- `src/infrastructure/database/index.ts` -- Added EmbeddingRepository and EMBEDDING_STATE_ADD_MODEL_NAME exports
.planning\phases\15-embedding-pipeline\15-01-SUMMARY.md:89:1. **Float32Array works with vec_f32()**: bun:sqlite passes Float32Array correctly to sqlite-vec's vec_f32() function. No Buffer conversion needed (confirmed by storeBatch tests passing).
.planning\phases\20-public-api-type-exports\20-RESEARCH.md:166:// ADD these lines:
.planning\phases\20-public-api-type-exports\20-RESEARCH.md:178:export * from "./ports/index.js";   // ADD this line
.planning\phases\17-provider-ecosystem\17-01-PLAN.md:92:- Both methods construct `EmbeddingResult.create({ embedding: new Float32Array(data), model, dimensions })`
.planning\phases\30-god-file-cleanup\30-01-PLAN.md:114:export async function runEmbeddingPass(db, options, deps?): Promise<void>;  // lines 321-430
.planning\phases\30-god-file-cleanup\30-01-PLAN.md:206:    - `runEmbeddingPass()` function (lines 321-430)
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:34:- [ ] `storeBatch()` inserts into both `message_embeddings` (vec0 via `vec_f32()`) and `embedding_state` within a single transaction, storing both `model_hash` and `model_name`
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:60:The `message_embeddings` table is a `vec0` virtual table with `embedding float[384]`. Inserts use `vec_f32()` to convert Float32Array to the vec0 storage format: `INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))`.
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:64:**Open question (from research):** Whether bun:sqlite passes Float32Array correctly to sqlite-vec's `vec_f32()` function. The first storeBatch test will validate this. If Float32Array does not work, convert to Buffer: `Buffer.from(embedding.buffer)`.
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:78:   - Create a test Float32Array (384 dimensions) with known values
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:79:   - Test `storeBatch([{ rowid: 1, embedding: float32 }], "abc123", "test-model")` inserts into both `embedding_state` and `message_embeddings`
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:146:export const EMBEDDING_STATE_ADD_MODEL_NAME = `
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:147:ALTER TABLE embedding_state ADD COLUMN model_name TEXT NOT NULL DEFAULT '';
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:159:  db.exec(EMBEDDING_STATE_ADD_MODEL_NAME);
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:175:  embedding: Float32Array;
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:194:      "INSERT INTO message_embeddings(rowid, embedding) VALUES (?, vec_f32(?))"
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:224:    this.db.exec("DELETE FROM message_embeddings");
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:225:    this.db.exec("DELETE FROM embedding_state");
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:244:**Note on vec_f32() and Float32Array:** The research flagged this as MEDIUM confidence. If bun:sqlite does not pass Float32Array correctly to `vec_f32()`, the storeBatch test will fail. In that case, convert to Buffer before passing:
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:248:Try Float32Array first. Only switch to Buffer if tests fail.
.planning\phases\15-embedding-pipeline\15-01-PLAN.md:321:   - Test that repository's `storeBatch()` is called with the correct rowids, Float32Arrays from provider results, modelHash, AND modelName
.planning\phases\26-hooks-and-backfill\26-02-PLAN.md:48:Follow the established entity pattern: private constructor, static `create()`, validation, immutability. See `ExtractionState` in `src/domain/entities/extraction-state.ts` for the closest analog -- both track processing state for an external operation.
.planning\phases\26-hooks-and-backfill\26-02-PLAN.md:50:The `BackfillState` entity is simpler than `ExtractionState` because backfill has only two terminal states (success or error), not a lifecycle (pending -> in_progress -> complete/error).
.planning\phases\26-hooks-and-backfill\26-03-PLAN.md:145:  ISummaryGenerator,  // ADD THIS
.planning\phases\26-hooks-and-backfill\26-01-SUMMARY.md:62:1. **Task A RED: PreCompact flush reminder tests** - `f32f6ec` (test) -- committed in prior session
.planning\phases\26-hooks-and-backfill\26-01-SUMMARY.md:94:- FOUND: f32f6ec (test commit)
.planning\phases\26-hooks-and-backfill\26-RESEARCH.md:304:// Source: pattern from ExtractionState entity
.planning\phases\26-hooks-and-backfill\26-RESEARCH.md:401:- Architecture: HIGH - every component has a 1:1 analog in existing codebase (BackfillState->ExtractionState, BackfillService->MemoryFileSyncService, backfill_state->extraction_state)
.planning\phases\25-intelligence\25-01-SUMMARY.md:63:- **Started:** 2026-03-09T11:26:32Z
.planning\phases\26-hooks-and-backfill\26-VERIFICATION.md:89:| backfill.ts (CLI command) | 37.50% | 53.37% | Uncovered: lazy-import action handler (168-216), FileDailyLogWriter (46-58), promptConfirmation (222-232). These are infrastructure composition root and readline integration -- tested via the separated executeBackfillCommand function. Matches established pattern (sync.ts lazy loaders). |
.planning\phases\12-polish-error-handling\12-05-SUMMARY.md:100:- **FTS5 deletion via triggers:** Cannot DELETE FROM FTS5 external content tables directly; delete from source table and let triggers handle cleanup
.planning\phases\12-polish-error-handling\12-05-SUMMARY.md:111:- **Issue:** Direct DELETE FROM messages_fts caused SQLITE_CORRUPT_VTAB because FTS5 external content tables cannot be deleted directly
.planning\phases\25-intelligence\25-04-PLAN.md:58:1. **Add a helper function** `insertTestEmbeddingWithVector(db, rowid, embedding, modelHash?, modelName?)` that accepts a pre-built `Float32Array` instead of generating random values. Place it near the existing `insertTestEmbedding` helper (line 71). The function body is identical to `insertTestEmbedding` except it uses the provided embedding instead of generating a random one.
.planning\phases\25-intelligence\25-04-PLAN.md:61:   - Create a controlled query embedding: a 384-dimensional `Float32Array` unit vector along dimension 0 (`[1, 0, 0, ..., 0]`).
.planning\phases\25-intelligence\25-04-SUMMARY.md:30:  - "insertTestEmbeddingWithVector: use pre-built Float32Array for deterministic similarity testing"
.planning\phases\12-polish-error-handling\12-VERIFICATION.md:48:| src/infrastructure/signals/signal-handler.ts | SIGINT/SIGTERM handling | VERIFIED | 320 lines, 3-option prompt, cleanup registration, substantive |
.planning\phases\12-polish-error-handling\12-VERIFICATION.md:66:| sync service | checkpoint manager | saveCheckpoint() | WIRED | Lines 31-32 import, line 155+ uses checkpoint |
.planning\phases\26-hooks-and-backfill\CONTEXT.md:86:- Requires explicit confirmation ("Process 532 sessions? Estimated cost: ~$0.53 [y/N]")
.planning\phases\26-hooks-and-backfill\CONTEXT.md:137:- 532 existing sessions = ~$0.53 total
.planning\phases\23-foundation\23-03-PLAN.md:33:- [ ] FTS5 sync triggers exist for INSERT, DELETE, UPDATE on `memory_files` to keep `memory_files_fts` synchronized
.planning\phases\23-foundation\23-03-PLAN.md:65:- Test FTS5 trigger: UPDATE content in `memory_files` updates FTS5 index (old content no longer matches, new content does)
.planning\phases\23-foundation\23-03-PLAN.md:66:- Test FTS5 trigger: DELETE from `memory_files` removes entry from FTS5 index
.planning\phases\23-foundation\23-03-PLAN.md:114:CREATE TRIGGER IF NOT EXISTS memory_files_fts_delete AFTER DELETE ON memory_files BEGIN
.planning\phases\23-foundation\23-03-PLAN.md:118:CREATE TRIGGER IF NOT EXISTS memory_files_fts_update AFTER UPDATE ON memory_files BEGIN
.planning\phases\23-foundation\23-03-PLAN.md:216:      ON CONFLICT(file_path) DO UPDATE SET
.planning\phases\23-foundation\23-03-PLAN.md:239:          ON CONFLICT(file_path) DO UPDATE SET
.planning\phases\12-polish-error-handling\12-10-SUMMARY.md:54:- **Completed:** 2026-02-05T23:40:32Z
.planning\phases\23-foundation\23-03-SUMMARY.md:66:- memory_files table with CHECK constraint on file_type, UNIQUE on file_path, FTS5 virtual table, and INSERT/UPDATE/DELETE sync triggers
.planning\phases\23-foundation\23-RESEARCH.md:200:- **DO NOT add FTS5 triggers for memory_files_fts.** Unlike messages_meta (which uses INSERT/UPDATE/DELETE triggers), memory files are inserted/updated in batch during sync. Use explicit FTS5 content sync commands (INSERT INTO memory_files_fts(memory_files_fts) VALUES('rebuild')) after batch operations, or manual INSERT/DELETE in the repository.
.planning\phases\23-foundation\23-RESEARCH.md:209:| FTS5 external content sync | Manual trigger management | FTS5 'rebuild' command or manual INSERT/DELETE pairs | FTS5 has built-in content sync commands for external content tables |
.planning\phases\23-foundation\23-RESEARCH.md:216:**What goes wrong:** External content FTS5 tables (content=memory_files) require manual synchronization. If you INSERT into memory_files without also inserting into memory_files_fts, search returns stale results. If you DELETE from memory_files without corresponding FTS5 delete, you get phantom results.
.planning\phases\23-foundation\23-RESEARCH.md:218:**How to avoid:** Two options: (1) Use triggers like messages_fts (the existing pattern), or (2) perform manual FTS5 operations in the repository's save/delete methods. Option 1 is safer and matches the existing codebase convention. Add INSERT/DELETE/UPDATE triggers on memory_files that sync to memory_files_fts, identical to the messages_fts triggers pattern.
.planning\phases\23-foundation\23-RESEARCH.md:297:CREATE TRIGGER IF NOT EXISTS memory_files_fts_delete AFTER DELETE ON memory_files BEGIN
.planning\phases\23-foundation\23-RESEARCH.md:301:CREATE TRIGGER IF NOT EXISTS memory_files_fts_update AFTER UPDATE ON memory_files BEGIN
.planning\phases\24-friction-system\24-03-SUMMARY.md:35:  - "openInBrowser uses platform-detection (win32/darwin/linux) for system open command"
.planning\phases\24-friction-system\24-03-PLAN.md:392:  const cmd = platform() === "win32" ? "start" :
.planning\phases\24-friction-system\24-RESEARCH.md:191:- **Don't make FrictionEntry mutable:** Status transitions (open -> resolved) create new entities, not mutate existing ones. However, the repository's resolve() method updates in place (SQL UPDATE) -- the entity itself stays immutable per construction.
.planning\phases\24-friction-system\24-RESEARCH.md:414:  const cmd = platform() === "win32" ? "start" :
.planning\phases\24-friction-system\24-01-PLAN.md:99:From src/domain/ports/repositories.ts (ADD TO -- existing port file):
.planning\phases\24-friction-system\24-01-PLAN.md:120:From src/domain/entities/index.ts (ADD export line):
.planning\phases\24-friction-system\24-01-PLAN.md:126:From src/infrastructure/database/repositories/index.ts (ADD export line):
.planning\phases\24-friction-system\24-01-PLAN.md:334:- **resolve(id, resolution):** UPDATE friction_log SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?. Use new Date().toISOString() for resolved_at. Throw if id not found.
.planning\phases\24-friction-system\24-01-PLAN.md:335:- **updateStatus(id, status):** UPDATE friction_log SET status = ? WHERE id = ?. Throw if id not found.
.planning\phases\28-friction-universalization\28-02-PLAN.md:180:   UPDATE friction_log SET last_reviewed_at = ? WHERE tool = ? AND status = 'open'
.planning\phases\28-friction-universalization\28-01-PLAN.md:337:3. In `createSchema()`, add migration logic AFTER the schema SQL loop, using the same `PRAGMA table_info` pattern as the `EMBEDDING_STATE_ADD_MODEL_NAME` migration:
.planning\phases\28-friction-universalization\28-RESEARCH.md:11:This is entirely a composition/extension phase -- every component has a 1:1 existing analog in the Phase 24 friction system. No new external libraries are needed. The schema migration uses SQLite's `ALTER TABLE ADD COLUMN` pattern already established in the codebase (see `EMBEDDING_STATE_ADD_MODEL_NAME` in schema.ts). The category generalization requires removing the SQL CHECK constraint, which SQLite does not support via ALTER TABLE -- the correct approach is to recreate the table with the new schema and migrate data.
.planning\phases\28-friction-universalization\28-RESEARCH.md:136:**Why not ALTER TABLE ADD COLUMN only:** The `tool` and `tags` columns could use ALTER TABLE ADD COLUMN, but removing the category CHECK constraint cannot. Since we need table recreation anyway, do all changes in one migration.
.planning\phases\28-friction-universalization\28-RESEARCH.md:138:**Precedent:** The codebase already has `EMBEDDING_STATE_ADD_MODEL_NAME` for simple column additions. This is the first table recreation migration, but the pattern is standard SQLite practice.
.planning\phases\28-friction-universalization\28-RESEARCH.md:202:1. `IFrictionRepository.markReviewed(tool: string, reviewedAt: Date)` -- UPDATE last_reviewed_at for all open entries matching tool
.planning\phases\28-friction-universalization\28-RESEARCH.md:236:- **Don't add a separate migration tracking table.** The existing codebase uses inline migration logic in `createSchema()` (see `EMBEDDING_STATE_ADD_MODEL_NAME` check via `PRAGMA table_info`). Follow this pattern -- check if `tool` column exists, if not, run the migration.
.planning\phases\28-friction-universalization\CONTEXT.md:22:**Migration:** ALTER TABLE friction_log ADD COLUMN tool TEXT NOT NULL DEFAULT 'memory'. Existing entries default to 'memory' since they were all memory friction.

hook: PostToolUse
 succeeded in 4493ms:
# Inbox â€” Cross-Project Issues

This directory accepts issue reports from other Claude Code sessions per the
convention documented in `~/.claude/rules/cross-project-issues.md`.

## What lives here

Structured issue files (one per issue) following the format defined in the rule
linked above. Each file represents:

- A bug or improvement opportunity found while another project was using this tool
- Substantive enough to warrant a patch or detailed analysis (lightweight
  friction goes to `~/.claude/friction.jsonl` per `tool-friction.md`)

## Triage

When opening this project's CWD session, check this directory for untriaged items:

```bash
ls docs/inbox/*.md 2>/dev/null
```

Triage steps for each open file (frontmatter `status: open` or unset):
1. Read severity + affects_scope
2. Validate proposed fix against current code
3. Update frontmatter `status: triaged`, `triaged_at: <today>`
4. Either apply per project standards or document rejection

After merge: `status: merged`, `resolved_at`, `pr_url` â†’ move to `archived/`.
After reject: `status: rejected`, append rationale â†’ move to `rejected/`.

## Conventions

- Filename: `YYYY-MM-DD-<reporting-project>-<slug>.md`
- One issue per file
- Frontmatter schema: see `~/.claude/rules/cross-project-issues.md` (currently v1.1)

## Why this directory exists (not a rule restatement)

This stub references the global rule rather than restating it. If the rule's
schema or workflow changes, only the rule file is updated â€” this stub stays
correct because it has no spec content. If the convention is ever migrated to
a different mechanism (hook, MCP server, etc.), this README documents the
historical pattern for projects that haven't migrated yet.

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 4412ms:
02-database-schema-and-ports
03-jsonl-parsing-and-extraction
04-storage-adapters
05-basic-sync-command
05-basic-sync-commandcommander.js-cli-patterns-(standard-library)
06-search-command-fts5
06-search-command-with-fts5
07-filtering-and-output-formatting
08-stats-and-list-commands
09-context-and-related-commands
10-hook-integration
11-session-navigation
12-polish-error-handling
13-package-rename
14-embedding-infrastructure
15-embedding-pipeline
16.1-migration-race-condition-fix
16-hybrid-search
17-provider-ecosystem
18-api-stabilization-and-aidev-integration-readiness
19-verification-closure
20-public-api-type-exports
21-architecture-boundary-cleanup
22-integration-checker-cleanup
23-foundation
24-friction-system
25-intelligence
26-hooks-and-backfill
27-qmd-integration
28-friction-universalization
29.1-test-determinism
29-ambient-context
30-god-file-cleanup
31-bug-fixes
phase-01

hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content .planning\\STATE.md | Select-Object -First 115" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content $HOME'"\\.Codex\\rules\\cross-project-issues.md" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content .planning\\ROADMAP.md | Select-Object -Skip 110 -First 42" in C:\Projects\memory-nexus
 succeeded in 4400ms:
---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Intelligence Layer
status: executing
last_updated: "2026-05-08T22:00:00.000Z"
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 6
  completed_plans: 5
---

# State: @chude/memory (memory-nexus)

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Out-of-roadmap test-isolation cleanup paused at Stage 13/14 (paths.ts remains). Resume v4.0 Phase 32 (CLI Surface) once paths.ts done OR triaged.

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5 + sqlite-vec, Commander.js v14, @huggingface/transformers v3, cli-progress, chrono-node, Chart.js (HTML dashboard)

## Current Position

Phase: 31 (bug-fixes) â€” COMPLETE
**Milestone:** v4.0 Intelligence Layer
**Status:** Out-of-roadmap test-isolation cleanup PAUSED at Stage 13/14. paths.ts migration is the last blocker. See `~/.claude/projects/<encoded>/memory/test_isolation_cleanup.md` for full arc and design options.

```
v4.0 Progress: [######__________________] 2/8 phases complete
  Phase 30: God File Cleanup                [done]
  Phase 31: Bug Fixes                       [done] (31-01 + 31-02)
  Phase 32: CLI Surface                     [ ] Not started
  Phase 33: Knowledge Extraction Foundation [ ] Not started
  Phase 34: Extraction Pipeline             [ ] Not started
  Phase 35: Context Intelligence            [ ] Not started
  Phase 36: Portability                     [ ] Not started
  Phase 37: Publishing                      [ ] Not started
```

## Out-of-roadmap: Test Isolation Cleanup (2026-05-08)

41 â†’ 0 test failures, 28 â†’ 3 gate violations across 13 atomic commits. Established the deps-parameter pattern as canonical seam for testable production code. Latest commit: c8838c3 (settings-manager).

**Remaining:** paths.ts migration (3 violations: `let testOverrides`, `setTestPaths`, `resetTestPaths`). 67 production call sites. See test_isolation_cleanup.md for design options A/B/C.

**CI gate:** `bun run test:isolation` (script: `scripts/check-test-isolation.ts`).

## Milestone History

**v1.0 (shipped 2026-02-16):** 12 phases, 56 plans, full CLI with sync, search, context, hooks
**v2.0 (shipped 2026-03-01):** 10 phases (13-22), package rename, hybrid search (FTS5 + sqlite-vec), embedding providers, API stabilization
**v3.0 (shipped 2026-04-02):** 9 phases (23-29.1), agent-written memory, smart context, friction system, backfill, qmd, ambient context, test determinism

## Performance Metrics

**v3.0 final:**

- 9 phases, 26 plans
- All tests passing (0 failures after Phase 29.1 determinism fixes)

## Accumulated Context

### Decisions

- LLM-powered extraction is non-negotiable (Mem0/Zep research confirms heuristic-only is unusable)
- Mem0's ADD/UPDATE/DELETE/NOOP model adopted for fact consolidation
- Zep's temporal superseding adopted in simplified form (observed_at, superseded_at)
- IExtractionProvider follows IEmbeddingProvider pattern (pluggable adapters)
- CLI help groups via Commander.js labeled categories (no command renames)
- SmartContextService reads from SQLite fact tables, not ~/.memory/ files
- ~/.memory/ directory deprecated (knowledge goes in SQLite)
- [Phase 30]: Compressed JSDoc and consolidated imports to keep all sync modules under 200 lines
- [Phase 30]: Compressed JSDoc and consolidated imports to keep friction/index.ts under 200-line cap
- [Phase 31-bug-fixes]: Blacklist regex approach for FTS5 fallback (preserves symbols like C++, TCP/IP)
- [Phase 31-bug-fixes]: maxTotal tracking for download progress bar to defer display until non-zero total
- [Phase 31-02]: text-width utility (string-width lib); truncateForTerminal derives prefix width from string, not magic number
- [Test isolation cleanup, 2026-05-08]: deps parameter is canonical seam (not options.dbPath). options = user input; deps = operational deps.
- [Test isolation cleanup]: codex (gpt-5.5 high) review caught framing errors â€” codex review IS Stage 0 of any non-trivial architectural plan

### Blockers/Concerns

- sync.ts (928 lines) and friction.ts (638 lines): RESOLVED via Phase 30 SRP splits
- bun link install active (symlink to source, not npm published yet)
- paths.ts is the last test-isolation gate violator (3 of 3 remaining)

## Session Continuity

### Last Session â€” 2026-05-08

**Completed:**
- Phase 31 (bug-fixes) fully complete: 31-01 + 31-02 (CLI output width-aware via truncateForTerminal)
- 13-stage out-of-roadmap test-isolation cleanup: 41 â†’ 0 failures, 28 â†’ 3 gate violations
- Codex-validated deps-parameter pattern as canonical seam across CLI commands and infrastructure
- Latest commit: c8838c3 (settings-manager migration to PathOverrides)
- Tests: 3096/3096 passing in full src/ suite
- CLI verified working

**Next step (decision needed):**
- (a) Continue test-isolation cleanup: migrate paths.ts (Stage 14, 3 final violations). See test_isolation_cleanup.md "What remains" â€” 3 design options (A: per-call PathOverrides, B: env-var-based, C: Paths service interface). Recommendation: Option B (env vars) for smallest scope.
- (b) Resume v4.0 roadmap: `/gsd:plan-phase 32` (CLI Surface).

**Per `feedback_validate_with_external_ai.md`:** if going option (a) with Option C scope, run plan past codex first.

---

*Last updated: 2026-05-08 (test isolation cleanup, paths.ts deferred)*

hook: PostToolUse
 succeeded in 4192ms:

---

### Phase 32: CLI Surface

**Goal**: The help output is organized and all query commands support uniform output format flags so users can discover commands by category and consume output programmatically
**Depends on**: Nothing (independent of extraction work; can run in parallel with Phases 30-31)
**Requirements**: CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. `memory --help` groups commands under labeled categories (Query, Data, System, Feedback) instead of a flat alphabetical list
  2. All query commands (`search`, `context`, `show`, `list`, `related`, `stats`) accept `--json` and produce valid JSON to stdout
  3. All query commands support `--format brief` and `--format ai` where applicable, producing condensed or AI-optimized output respectively
**Plans**: TBD

---

### Phase 33: Knowledge Extraction Foundation

**Goal**: The domain model, database schema, and provider infrastructure for knowledge extraction are in place so the extraction pipeline has everything it needs to store and compare facts
**Depends on**: Phase 30 (clean sync modules make it easier to integrate extraction)
**Requirements**: KNOW-01, KNOW-03, KNOW-05, KNOW-06
**Success Criteria** (what must be TRUE):
  1. `IExtractionProvider` port exists in domain layer with an `extract(messages): Promise<CandidateFact[]>` method; adapters exist for Claude API (Anthropic SDK), Ollama, and OpenAI
  2. `facts` table exists in SQLite schema with `observed_at`, `superseded_at`, and `superseded_by` columns for temporal tracking
  3. `extraction_log` table records each extraction run with session ID, mode, fact counts (added/updated/superseded/skipped), provider/model, and tokens consumed
  4. Re-running extraction on an already-extracted session is a no-op (idempotency tracked via extraction_log)
  5. `memory doctor` reports extraction provider configuration and readiness
**Plans**: TBD

---

### Phase 34: Extraction Pipeline

**Goal**: Users can extract structured knowledge from sessions into the facts table, compare candidates against existing facts, and view extracted knowledge per project
**Depends on**: Phase 33 (needs provider port, schema, and extraction_log)
**Requirements**: KNOW-02, KNOW-04, KNOW-07, KNOW-08
**Success Criteria** (what must be TRUE):
  1. `memory extract <project>` processes session messages through the configured provider and stores extracted facts in the `facts` table
  2. Each candidate fact is compared against existing facts using embedding similarity; the pipeline decides ADD, UPDATE, DELETE (supersede), or NOOP per fact
  3. `memory extract --all --since 7d` batch-extracts from all sessions in the last 7 days with a progress bar showing sessions processed
  4. `memory facts <project>` displays current (non-superseded) facts for a project; `--superseded` includes historical/invalidated facts
  5. Running `memory extract <project>` a second time on already-processed sessions skips them and reports "N sessions already extracted"

hook: PostToolUse
 exited 1 in 4655ms:
Get-Content : Cannot find path 'C:\Users\Destiny\.Codex\rules\cross-project-issues.md' because it does not exist.
At line:2 char:1
+ Get-Content $HOME\.Codex\rules\cross-project-issues.md
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\Destin...oject-issues.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

2026-05-11T04:44:42.088385Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 4.7 seconds
Output:
Get-Content : Cannot find path 'C:\Users\Destiny\.Codex\rules\cross-project-issues.md' because it does not exist.
At line:2 char:1
+ Get-Content $HOME\.Codex\rules\cross-project-issues.md
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\Destin...oject-issues.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

hook: PostToolUse Completed
hook: PostToolUse Completed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem $HOME'"\\.claude\\rules -Force | Select-Object -ExpandProperty Name" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-ChildItem $HOME -Force | Where-Object { $_.Name -match '"'codex|claude|Codex' } | Select-Object Name,FullName" in C:\Projects\memory-nexus
 succeeded in 4185ms:
reference
actions-not-promises.md
apple-philosophy.md
atomic-reminders.md
authkey-conventions.md
bash-gotchas.md
cli-standards.md
communication-style.md
cross-machine-execution.md
cross-project-issues.md
deferred-reminders-protocol.md
design-philosophy.md
document-for-clear.md
document-methodology.md
environment.md
first-principles-before-options.md
git-commits.md
hexagonal-architecture.md
honor-directives.md
market-ready-default.md
memory.md
mistakes-log.md
network.md
no-hidden-debt.md
planning-first.md
progress-reporting.md
project-structure.md
quality-standards.md
restate-before-act.md
secrets-in-tool-output.md
secrets-management.md
security.md
solid-principles.md
specs-interview.md
subagent-trust-calibration.md
tdd-workflow.md
testing-pyramid.md
thoughts-trigger.md
tool-friction.md
tooling-preferences.md
tui-standards.md
wow-definition.md

hook: PostToolUse
 succeeded in 4078ms:

Name                 FullName                             
----                 --------                             
.claude              C:\Users\Destiny\.claude             
.claude-context      C:\Users\Destiny\.claude-context     
.claude-worktrees    C:\Users\Destiny\.claude-worktrees   
.codex               C:\Users\Destiny\.codex              
.claude.json         C:\Users\Destiny\.claude.json        
.claude.json.backup  C:\Users\Destiny\.claude.json.backup 
.claude.json.backup1 C:\Users\Destiny\.claude.json.backup1
.claude.json.backup2 C:\Users\Destiny\.claude.json.backup2
.claude.lock         C:\Users\Destiny\.claude.lock        



hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Completed
codex
One repo-level wrinkle already matters: `docs/inbox/README.md` says `triaged` is the normal non-terminal state and `merged`/`rejected` are terminal. The global rule appears to live under `.claude` in this environment rather than `.Codex`, so I’m checking that next for the closure-notify constraint.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'Get-Content $HOME'"\\.claude\\rules\\cross-project-issues.md" in C:\Projects\memory-nexus
hook: PreToolUse Completed
hook: PreToolUse Completed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'rg -n "closure_notify|counter|notify|terminal|merged|rejected|triaged|status" $HOME'"\\.claude\\rules\\cross-project-issues.md "'$HOME'"\\.claude\\rules\\deferred-reminders-protocol.md" in C:\Projects\memory-nexus
 succeeded in 3447ms:
C:\Users\Destiny\.claude\rules\cross-project-issues.md:61:fix_status: none | drafted | tested | merged   # default: none
C:\Users\Destiny\.claude\rules\cross-project-issues.md:65:closure_notify_to: <project-slug>      # v1.2: receiver auto-authors counter-notification in this project's inbox on terminal-state transition
C:\Users\Destiny\.claude\rules\cross-project-issues.md:66:closure_notify_reason: <one-line>      # v1.2: why the reporter cares about closure (e.g., "local workaround in CI is redundant when fix ships")
C:\Users\Destiny\.claude\rules\cross-project-issues.md:69:status: open | triaged | in-progress | merged | rejected   # default: open
C:\Users\Destiny\.claude\rules\cross-project-issues.md:70:triaged_at: <YYYY-MM-DD>
C:\Users\Destiny\.claude\rules\cross-project-issues.md:78:| `schema_version` | `"1.2"` (current) | Required. MUST be quoted (`"1.2"`, not bare `1.2`). Linter rejects files without it AND files with bare numeric values. Bump on any breaking schema change. v1.2 is backward-compatible with v1.1; the new closure-notify fields are optional. |
C:\Users\Destiny\.claude\rules\cross-project-issues.md:81:| `fix_status` | `none` / `drafted` (code written, untested) / `tested` (verified locally) / `merged` (terminal) | |
C:\Users\Destiny\.claude\rules\cross-project-issues.md:84:| `closure_notify_to` | project slug, optional | v1.2. Target project's slug. Receiver resolves to `~/Projects/<slug>/docs/inbox/`. Target should have opted in to the convention (its inbox dir + README must exist) — linter warns (not errors) if missing, since target may opt out between filing and lint. |
C:\Users\Destiny\.claude\rules\cross-project-issues.md:85:| `closure_notify_reason` | one-line string, optional | v1.2. Why the reporter cares about closure. Helps the receiver write a meaningful counter-notification body. |
C:\Users\Destiny\.claude\rules\cross-project-issues.md:86:| `status` | `open` (default, needs triage) / `triaged` / `in-progress` / `merged` / `rejected` | Receiver owns this field |
C:\Users\Destiny\.claude\rules\cross-project-issues.md:143:[Other designs and why rejected]
C:\Users\Destiny\.claude\rules\cross-project-issues.md:157:1. `ls docs/inbox/*.md` — find files with `status: open` (or unset).
C:\Users\Destiny\.claude\rules\cross-project-issues.md:159:3. Update frontmatter: `status: triaged`, `triaged_at: <today>`.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:161:5. After merge: `status: merged`, `resolved_at`, `pr_url`; move to `docs/inbox/archived/`.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:162:5b. **(v1.2)** If `closure_notify_to` is set AND the new status is terminal (`merged` or `rejected`): author a counter-notification filing in the named project's inbox.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:163:   - **Use the script:** `node ~/Projects/conversations/scripts/inbox-notify-closure.cjs <closing-item.md>` — auto-detects commit ref via `pr_url` field or `git log`, generates filename + frontmatter per convention, writes to target inbox. Flags: `--dry-run` (print, don't write), `--edit` (open in `$EDITOR`), `--commit <sha>` (override auto-detected ref).
C:\Users\Destiny\.claude\rules\cross-project-issues.md:165:   - **Fail-open:** script no-ops if `closure_notify_to` is unset, skips with log line if target inbox is missing (target opted out). Never errors the triage.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:166:   - **Manual fallback (if script unavailable):** filename `YYYY-MM-DD-<this-project>-<original-slug>-<status>.md`. Use the FULL original slug — do not compress. Frontmatter: `type: docs`, `severity: low`, `status: open`. Body documents closure outcome, references original filing path, includes commit/PR ref or rationale.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:167:6. After reject: `status: rejected`, `resolved_at`, append rationale; move to `docs/inbox/rejected/`.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:169:`archived/` and `rejected/` are sibling directories created on first use.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:173:Run `node ~/Projects/conversations/scripts/inbox-audit-closures.cjs` periodically to verify step-5b compliance across all opted-in inboxes. The script scans archived items with `closure_notify_to` set and confirms a matching counter-notification exists in the target inbox. Findings are warnings (not errors) per fail-open semantics — but each warning indicates a hidden-debt instance to resolve. Use `--history` to append run records to `data/inbox-audit-history.jsonl` for trend tracking.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:190:Open inbox items must be visible to the receiver without depending on memory. The session-start hook at `~/.claude/hooks/inbox-surface.cjs` lists items with `status: open | triaged | in-progress` whenever you open a CWD where `docs/inbox/` exists. Silent when the inbox is empty or the directory doesn't exist.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:194:**Directory layout constraint:** the surface hook reads `docs/inbox/` flatly — it does NOT recurse into subdirectories. Issue files MUST live directly in `docs/inbox/`, not in nested folders (other than the canonical `archived/` and `rejected/` subdirectories which are handled separately by the triage protocol). If you want quarterly grouping or similar organization, do it via filename prefix (`2026-q2-*.md`), not subdirectories.
C:\Users\Destiny\.claude\rules\cross-project-issues.md:216:# Cross-project issue inbox — open issues are WIP, archived/rejected are tracked for audit
C:\Users\Destiny\.claude\rules\cross-project-issues.md:221:!docs/inbox/rejected/
C:\Users\Destiny\.claude\rules\cross-project-issues.md:224:Tracks the README (discovery layer) and `archived/` + `rejected/` subdirectories (audit trail of resolved issues). Ignores open `*.md` files in `docs/inbox/` directly because they're WIP — pre-review patches, may contain incident details, and don't need to live in git history forever. Once an issue is triaged into `archived/` or `rejected/`, it becomes tracked.
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:42:  "notify": {
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:47:  "status": "active" | "completed" | "dismissed",
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:88:If omitted, the reminder surfaces only in the SessionStart inbox channel (the briefing output). When the push layer is operational, `notify.channels` adds ntfy/telegram dispatch and `notify.priority` shapes urgency.
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:92:- `count` — incremented by the SessionStart hook each session. Reset by hook when status changes.
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:93:- `status: active` — default; reminder is live and may fire. `completed` and `dismissed` are terminal.
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:101:4. **Set initial state**: `count: 0`, `status: "active"`, `history: []`.
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:114:| "Yes" / "let's do it" / "do it now" | Execute the work the reminder describes. Then update the entry: set `status: "completed"` and append `{fired_at: <today>, count_at_fire: <current count>, response: "accepted"}` to `history`. |
C:\Users\Destiny\.claude\rules\deferred-reminders-protocol.md:116:| "Kill it" / "I don't want this" | Confirm with one clarifying question. If confirmed, set `status: "dismissed"` and append `{response: "dismissed", reason: "<their reason>"}` to `history`. |

hook: PostToolUse
hook: PostToolUse Completed
 succeeded in 4190ms:
# Cross-Project Issues

When you find a non-trivial bug or improvement in a first-party tool the user maintains, route it to that tool's inbox. Don't modify the global install.

**Related Rules:** [tool-friction.md](tool-friction.md), [actions-not-promises.md](actions-not-promises.md), [no-hidden-debt.md](no-hidden-debt.md)
**Reference:** [reference/inbox-readme-stub.md](reference/inbox-readme-stub.md) â€” canonical README content for opted-in projects

## When this rule fires

Two conditions, both must hold:

1. **First-party scope.** The buggy thing lives in (or is installed from) `~/Projects/<X>/` AND `~/Projects/<X>/docs/inbox/` exists.
2. **Substantive threshold.** You have either a proposed fix (patch, code change, design doc) OR substantive analysis (root cause identified, line-level evidence).

If only first-party but lightweight (no fix, no analysis) â†’ friction log per `tool-friction.md`.
If substantive but not first-party (third-party OSS) â†’ file upstream as a normal issue.

## What is a "first-party tool" (convention-as-marker)

A project the user maintains in `~/Projects/<X>/` participates if BOTH:
1. `~/Projects/<X>/docs/inbox/` directory exists
2. `~/Projects/<X>/docs/inbox/README.md` exists (canonical stub from `~/.claude/rules/reference/inbox-readme-stub.md`)

The directory + README pair IS the registration. The README's presence is the human-visible signal that the project actually opted in (not just an empty directory created accidentally). The surface hook warns when a directory exists without its README, prompting the receiver to either complete the opt-in or remove the directory.

To opt in: `mkdir docs/inbox && cp <stub-content> docs/inbox/README.md`. To opt out: delete the directory.

This is staleness-proof: marker and storage are the same artifact, so they cannot drift apart.

## What not to do

- Don't modify the installed/published version (`~/.claude/<X>/`, `~/.bun/install/global/<X>/`, `npm root -g/<X>`). Source repo is upstream of those.
- Don't propose workarounds in the calling project for tool bugs that have a fork-side fix path. Fork-side fix benefits all consumers.
- Don't file inbox issues for upstream OSS â€” only first-party tools.
- Don't file lightweight friction as inbox items â€” that's `~/.claude/friction.jsonl`.

## Where to read source

When investigating root cause, read source from the fork at `~/Projects/<X>/` â€” NOT from the global install path (`~/.claude/<X>/`, `~/.bun/install/global/<X>/`, `npm root -g/<X>`). The fork is upstream; the global install is downstream and may be stale relative to the fork. Line numbers and behavior diverge. If you must read the global install (e.g., to confirm what the consumer is actually running), say so explicitly in the file's `## Risks / things to verify` section.

## File location and naming

`~/Projects/<source-project>/docs/inbox/YYYY-MM-DD-<reporting-project>-<slug>.md`

- `<source-project>` â€” the tool that owns the bug (where the inbox lives)
- `<reporting-project>` â€” the project running when the bug was found
- `<slug>` â€” kebab-case description; recommended â‰¤60 chars but descriptive beats short. The slug shows up in `ls`, `grep`, and commit messages â€” verbose descriptive slugs are easier to triage than terse ones. Hard cap: 100 chars (filesystem-friendly).

## Frontmatter schema (v1.2)

```yaml
---
# Required
schema_version: "1.2"
source_project: <reporting-project-slug>
created: <YYYY-MM-DD>
type: bug | enhancement | refactor | docs | pr-draft
severity: low | medium | high | critical

# Optional (set by author)
fix_status: none | drafted | tested | merged   # default: none
affects_scope: this-project-only | all-consumers | unknown   # default: unknown
workaround_applied: <one-line description of any workaround the consumer is running while fix is pending>
priority_rationale: <string>
closure_notify_to: <project-slug>      # v1.2: receiver auto-authors counter-notification in this project's inbox on terminal-state transition
closure_notify_reason: <one-line>      # v1.2: why the reporter cares about closure (e.g., "local workaround in CI is redundant when fix ships")

# Lifecycle (set by receiver during triage)
status: open | triaged | in-progress | merged | rejected   # default: open
triaged_at: <YYYY-MM-DD>
resolved_at: <YYYY-MM-DD>
pr_url: <url>
---
```

| Field | Values | Notes |
|---|---|---|
| `schema_version` | `"1.2"` (current) | Required. MUST be quoted (`"1.2"`, not bare `1.2`). Linter rejects files without it AND files with bare numeric values. Bump on any breaking schema change. v1.2 is backward-compatible with v1.1; the new closure-notify fields are optional. |
| `severity` | `low` cosmetic / `medium` minor workaround / `high` major workaround / `critical` blocking, security, data-loss | |
| `type` | `bug` / `enhancement` / `refactor` / `docs` / `pr-draft` (file IS a PR-ready patch) | If the proposal is design-shaped (multiple options, open questions, larger than a single fix), use `enhancement` and structure the body with Motivation/Proposal/Alternatives sections per the body-structure guidance below. |
| `fix_status` | `none` / `drafted` (code written, untested) / `tested` (verified locally) / `merged` (terminal) | |
| `affects_scope` | `this-project-only` / `all-consumers` (every consumer hits it) / `unknown` (unverified) | |
| `workaround_applied` | free text or omitted | Surface what the consumer is doing right now while fix is pending. Changes triage urgency. |
| `closure_notify_to` | project slug, optional | v1.2. Target project's slug. Receiver resolves to `~/Projects/<slug>/docs/inbox/`. Target should have opted in to the convention (its inbox dir + README must exist) â€” linter warns (not errors) if missing, since target may opt out between filing and lint. |
| `closure_notify_reason` | one-line string, optional | v1.2. Why the reporter cares about closure. Helps the receiver write a meaningful counter-notification body. |
| `status` | `open` (default, needs triage) / `triaged` / `in-progress` / `merged` / `rejected` | Receiver owns this field |

**Frontmatter format constraints:** all values MUST be single-line scalars. The linter does not parse multi-line strings (block scalars `|`/`>`), YAML lists (`- item`), or nested objects. Use a single-line string for `priority_rationale` and `workaround_applied` even if long.

**Schema validation:** A linter at `~/Projects/conversations/scripts/inbox-lint.cjs` validates frontmatter against this schema. Run before commit: `node ~/Projects/conversations/scripts/inbox-lint.cjs <file>...`. Unknown fields and missing required fields are errors. The linter lives in conversations (the cross-project orchestration project) because the cross-project-issues convention is orchestration tooling. Future aidev integration (filed at `~/Projects/ai-dev-environment/docs/inbox/2026-04-27-medesine-rx-cross-project-issues-tooling-integration.md`) will wrap this script as `aidev inbox lint` via shell-out â€” canonical implementation stays in conversations.

## Body structure

Use the default template below. Omit a section ONLY when it is structurally inapplicable (e.g., omit `Test plan` for `type: docs`; omit `Repro` when the symptom is observation rather than reproducible behavior). Do not omit sections because they feel optional â€” the template exists because each section captures information the receiver needs at triage time. When in doubt, keep the section and write "N/A" with one sentence explaining why.

Common additions when the file calls for them:
- `## Suggested CHANGELOG entry` â€” for projects that maintain one
- `## What I did NOT do (correctly)` â€” reflection on near-miss decisions; useful when the rule prevented an instinctive wrong action
- For design-shaped `enhancement` issues â€” replace `Symptom`/`Repro`/`Root cause` with `Motivation`/`Proposal`/`Alternatives considered`/`Open questions` (see "Design-shaped enhancement variant" below)

Default template:

```markdown
# <Issue title â€” verb-led, descriptive>

## Symptom
[What was observed; concrete, with version/commit reference]

## Repro
[Steps to reproduce]

## Root cause
[Why; code references with file:line if known. Read source from ~/Projects/<X>/, not the global install.]

## Proposed fix
[Patch, design doc, or specific changes]

## Test plan
[Tests that verify the fix; omit for type=docs]

## Suggested commit message
[Complete commit message in project's convention]

## Risks / things to verify before merging
[Edge cases, performance, untested paths]

## Related
[Cross-references to issues, friction entries, commits]
```

Design-shaped `enhancement` variant (use when the proposal has open questions the receiver must decide before implementation):

```markdown
# <Title â€” verb-led>

## Motivation
[Problem being solved; why now]

## Proposal
[The design â€” commands, data shapes, integration points]

## Alternatives considered
[Other designs and why rejected]

## Open questions
[Things the receiver should decide]

## Migration / rollout
[How existing consumers adopt this]

## Suggested commit message
[If implementable as one commit]
```

## Triage protocol (receiver's CWD session)

1. `ls docs/inbox/*.md` â€” find files with `status: open` (or unset).
2. Read each; validate fix against current code (specs may have drifted).
3. Update frontmatter: `status: triaged`, `triaged_at: <today>`.
4. Apply per project standards OR document rejection.
5. After merge: `status: merged`, `resolved_at`, `pr_url`; move to `docs/inbox/archived/`.
5b. **(v1.2)** If `closure_notify_to` is set AND the new status is terminal (`merged` or `rejected`): author a counter-notification filing in the named project's inbox.
   - **Use the script:** `node ~/Projects/conversations/scripts/inbox-notify-closure.cjs <closing-item.md>` â€” auto-detects commit ref via `pr_url` field or `git log`, generates filename + frontmatter per convention, writes to target inbox. Flags: `--dry-run` (print, don't write), `--edit` (open in `$EDITOR`), `--commit <sha>` (override auto-detected ref).
   - **After running, review the draft and add substance.** Script generates skeleton with `<!-- TODO -->` markers; agent fills decisions, caveats, and recommendations the script can't infer.
   - **Fail-open:** script no-ops if `closure_notify_to` is unset, skips with log line if target inbox is missing (target opted out). Never errors the triage.
   - **Manual fallback (if script unavailable):** filename `YYYY-MM-DD-<this-project>-<original-slug>-<status>.md`. Use the FULL original slug â€” do not compress. Frontmatter: `type: docs`, `severity: low`, `status: open`. Body documents closure outcome, references original filing path, includes commit/PR ref or rationale.
6. After reject: `status: rejected`, `resolved_at`, append rationale; move to `docs/inbox/rejected/`.

`archived/` and `rejected/` are sibling directories created on first use.

### Compliance audit

Run `node ~/Projects/conversations/scripts/inbox-audit-closures.cjs` periodically to verify step-5b compliance across all opted-in inboxes. The script scans archived items with `closure_notify_to` set and confirms a matching counter-notification exists in the target inbox. Findings are warnings (not errors) per fail-open semantics â€” but each warning indicates a hidden-debt instance to resolve. Use `--history` to append run records to `data/inbox-audit-history.jsonl` for trend tracking.

## Composition with friction log

| Channel | Use for | Threshold | Storage |
|---|---|---|---|
| Friction log | Lightweight signal | One-line description, severity, no patch | `~/.claude/friction.jsonl` |
| Inbox | Detailed issue | Has fix or substantive analysis | `~/Projects/<X>/docs/inbox/` |

Test: does the report fit on one JSONL line? Yes â†’ friction. No â†’ inbox. Same bug can appear in both â€” friction signals "recurring across projects," inbox carries the fix.

**Friction â†’ inbox promotion trigger.** When 3+ entries in `~/.claude/friction.jsonl` share the same `tool` field within a 30-day window, consolidate into an inbox item with proper analysis. Recurrence is the threshold â€” a single annoying friction is just friction; recurring friction across multiple sessions is a structural problem worth a fix path.

**Actor and fire-time:** the periodic `friction-to-inbox-sweep-*` deferred reminder in `~/Projects/conversations/hooks/deferred-reminders.json` is the canonical sweep point (currently scheduled monthly). When that reminder fires, the sweep groups `friction.jsonl` entries by `tool`, identifies tools crossing the threshold, and creates inbox items for them. This is the *only* expected automation â€” Claude does NOT proactively grep `friction.jsonl` on every friction log. Manual triggering at log-time is fine when the reporter notices a recurrence themselves. Existing friction entries stay in `friction.jsonl` as historical signal regardless of whether they get promoted.

## Receiver-side surfacing

Open inbox items must be visible to the receiver without depending on memory. The session-start hook at `~/.claude/hooks/inbox-surface.cjs` lists items with `status: open | triaged | in-progress` whenever you open a CWD where `docs/inbox/` exists. Silent when the inbox is empty or the directory doesn't exist.

**Fallback** (when the surface hook isn't installed/running): manually run `ls docs/inbox/*.md` at session start in any CWD with an inbox directory. Any session opening a project's CWD MUST check the inbox before assuming there's no pending work â€” the hook is an automation of this requirement, not a substitute for it.

**Directory layout constraint:** the surface hook reads `docs/inbox/` flatly â€” it does NOT recurse into subdirectories. Issue files MUST live directly in `docs/inbox/`, not in nested folders (other than the canonical `archived/` and `rejected/` subdirectories which are handled separately by the triage protocol). If you want quarterly grouping or similar organization, do it via filename prefix (`2026-q2-*.md`), not subdirectories.

This closes the no-hidden-debt gap on the pull side: filing an inbox item discharges the reporter's obligation, and session-start surfacing fires the trigger that surfaces the item to the receiver. Without this, items accumulate silently â€” the very failure mode the rule was designed to prevent, just one indirection away.

## Coexistence with GitHub Issues

**Default: single destination.**

| Project state | Default destination |
|---|---|
| Public, published, has GH Issues | `gh issue create` |
| Private OR not published OR no GH Issues | `docs/inbox/` |

Use BOTH only when the patch is too long for a GH issue body (objective test: GH issue body has a soft limit; if your fix doesn't fit cleanly, use both). In that case, file the GH issue first, then mirror the structured patch to the inbox with `Tracks: gh#<n>` cross-link in the inbox file's `## Related` section.

The previous "when in doubt, file in both" guidance was retracted because it defaulted dual-write maintenance for borderline cases. Pick one based on the table; only escalate to both when the patch genuinely doesn't fit.

## Git tracking

Recommended `.gitignore` pattern for opted-in projects (hybrid: track resolved, ignore WIP):

```gitignore
# Cross-project issue inbox â€” open issues are WIP, archived/rejected are tracked for audit
# (Convention: ~/.claude/rules/cross-project-issues.md)
docs/inbox/*.md
!docs/inbox/README.md
!docs/inbox/archived/
!docs/inbox/rejected/
```

Tracks the README (discovery layer) and `archived/` + `rejected/` subdirectories (audit trail of resolved issues). Ignores open `*.md` files in `docs/inbox/` directly because they're WIP â€” pre-review patches, may contain incident details, and don't need to live in git history forever. Once an issue is triaged into `archived/` or `rejected/`, it becomes tracked.

Override at project level if a project's needs differ (e.g., OSS projects may want full-track for public visibility).

## Origin

Created 2026-04-27 in medesine-rx after a session almost edited `~/.claude/get-shit-done/bin/lib/state.cjs` directly to fix a `percent: 100` misleading-progress bug. The user's framing: *"there probably should be a signal/rule for all projects to know what to do."* Convention-as-marker design (inbox dir IS the opt-in) was iterated through pushback before landing. First issue under this convention: `~/Projects/get-stuff-done/docs/inbox/2026-04-27-medesine-rx-percent-100-misleading-when-roadmap-has-undeclared-plans.md`.

hook: PostToolUse
hook: PostToolUse Completed
codex
**Verdict:** Option 1 is right, but your stated rationale is too soft in the wrong place.

Run the audit before Phase 32, but do **not** justify it primarily on “Phase 32 is architectural.” Phase 32 is mostly CLI help grouping and output-format consistency. That is user-facing architecture, but not the real irreversible commitment. The stronger reason is: memory-nexus is currently between roadmap phases, the bug-fix gate is met, and Phase 33/34 will harden the extraction/fact model that the audit may reject or substantially redirect. The audit should happen before the next phase because the next meaningful work resumes the v4.0 trajectory, not because labeled help groups are uniquely dangerous.

Pushback by point:

1. **Option 1 vs after Phase 33:** run now. Landing Phase 33 first is backwards. If the audit needs “concrete code,” it already has years of current architecture plus planned Phase 33/34 artifacts to compare. Building a provider port, facts schema, extraction log, and provider adapters just to make the audit more concrete is sunk-cost manufacturing.

2. **Disposition state:** `triaged` is correct only if you are not starting immediately. If your disposition says “audit starts after this triage commits,” then the status should become `in-progress` at audit kickoff, not sit indefinitely as `triaged`. Recommended flow: set `status: triaged` with `triaged_at: 2026-05-11` and explicit “next major work item”; once the audit plan file exists or work begins, update to `in-progress`.

3. **Durability:** inbox file alone is not enough. The rule says open/triaged files surface, but open inbox files are WIP and may not be git-tracked. Encode the schedule in a durable planning artifact too: update `.planning/STATE.md` current focus and create a dedicated audit plan artifact, e.g. `.planning/phases/31.5-architecture-first-principles-audit/31.5-PLAN.md` or `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`. The inbox item should point to that artifact.

4. **Counter-notify:** do **not** use the v1.2 closure notification now. The global rule is explicit: `closure_notify_to` fires only on terminal transition, `merged` or `rejected`. If conversations needs coordination before closure, file a separate non-closure inbox/update item or reminder, clearly labeled schedule/status update. Then send the real closure notification after the audit is merged/rejected.

5. **Cross-AI review recursion:** proportionate, but constrain it. Review the **audit plan once** before execution and the **final recommendation once** before closing. Do not review every intermediate subagent synthesis. Put that cap in the disposition so the audit does not become process theater.

6. **Subagent brief framing:** restate the mandatory constraints in the durable audit plan, not only by reference. References rot under context loss. Keep the inbox item as source, but the executable plan should include the anti-bias note, user worry, and path-claim verification rule verbatim or near-verbatim.

7. **Deprecation question:** yes, explicitly include it. If “deprecate memory-nexus” is out of scope, the audit is biased before it starts. The disposition should say the audit may recommend: continue v4.0, consolidate surfaces, scope v5 federation, freeze at v4, or deprecate/replace memory-nexus. That does not pre-commit to deprecation; it protects the audit from self-justification.

8. **Phase 32 trigger:** your Phase 32 argument is overstated. Use it as secondary support only. The hard gate is before Phase 33/34 and before Phase 37 publishing. If someone challenges “why before Phase 32,” the answer is “because this is the first clean between-phase point after the stated bug-fix gate, and we should not resume the roadmap until the architecture question is settled.”

9. **Your prior for Option C:** useful only if labeled as a prior and quarantined. Add a short “initial hypothesis, not recommendation” section in the audit plan. Better phrasing: “Prior to audit, fragmentation suggests C may be likely, but the audit must be allowed to recommend A, B, C, stop-at-v4, or deprecation.”

Recommended disposition wording: `triaged`, schedule “next major work item before Phase 32 / before any Phase 33 extraction foundation work,” durable plan artifact required, transition to `in-progress` when audit begins, terminal `merged` only after audit doc lands and plan+solution cross-AI review are recorded.


hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Failed
tokens used
55,619
**Verdict:** Option 1 is right, but your stated rationale is too soft in the wrong place.

Run the audit before Phase 32, but do **not** justify it primarily on “Phase 32 is architectural.” Phase 32 is mostly CLI help grouping and output-format consistency. That is user-facing architecture, but not the real irreversible commitment. The stronger reason is: memory-nexus is currently between roadmap phases, the bug-fix gate is met, and Phase 33/34 will harden the extraction/fact model that the audit may reject or substantially redirect. The audit should happen before the next phase because the next meaningful work resumes the v4.0 trajectory, not because labeled help groups are uniquely dangerous.

Pushback by point:

1. **Option 1 vs after Phase 33:** run now. Landing Phase 33 first is backwards. If the audit needs “concrete code,” it already has years of current architecture plus planned Phase 33/34 artifacts to compare. Building a provider port, facts schema, extraction log, and provider adapters just to make the audit more concrete is sunk-cost manufacturing.

2. **Disposition state:** `triaged` is correct only if you are not starting immediately. If your disposition says “audit starts after this triage commits,” then the status should become `in-progress` at audit kickoff, not sit indefinitely as `triaged`. Recommended flow: set `status: triaged` with `triaged_at: 2026-05-11` and explicit “next major work item”; once the audit plan file exists or work begins, update to `in-progress`.

3. **Durability:** inbox file alone is not enough. The rule says open/triaged files surface, but open inbox files are WIP and may not be git-tracked. Encode the schedule in a durable planning artifact too: update `.planning/STATE.md` current focus and create a dedicated audit plan artifact, e.g. `.planning/phases/31.5-architecture-first-principles-audit/31.5-PLAN.md` or `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`. The inbox item should point to that artifact.

4. **Counter-notify:** do **not** use the v1.2 closure notification now. The global rule is explicit: `closure_notify_to` fires only on terminal transition, `merged` or `rejected`. If conversations needs coordination before closure, file a separate non-closure inbox/update item or reminder, clearly labeled schedule/status update. Then send the real closure notification after the audit is merged/rejected.

5. **Cross-AI review recursion:** proportionate, but constrain it. Review the **audit plan once** before execution and the **final recommendation once** before closing. Do not review every intermediate subagent synthesis. Put that cap in the disposition so the audit does not become process theater.

6. **Subagent brief framing:** restate the mandatory constraints in the durable audit plan, not only by reference. References rot under context loss. Keep the inbox item as source, but the executable plan should include the anti-bias note, user worry, and path-claim verification rule verbatim or near-verbatim.

7. **Deprecation question:** yes, explicitly include it. If “deprecate memory-nexus” is out of scope, the audit is biased before it starts. The disposition should say the audit may recommend: continue v4.0, consolidate surfaces, scope v5 federation, freeze at v4, or deprecate/replace memory-nexus. That does not pre-commit to deprecation; it protects the audit from self-justification.

8. **Phase 32 trigger:** your Phase 32 argument is overstated. Use it as secondary support only. The hard gate is before Phase 33/34 and before Phase 37 publishing. If someone challenges “why before Phase 32,” the answer is “because this is the first clean between-phase point after the stated bug-fix gate, and we should not resume the roadmap until the architecture question is settled.”

9. **Your prior for Option C:** useful only if labeled as a prior and quarantined. Add a short “initial hypothesis, not recommendation” section in the audit plan. Better phrasing: “Prior to audit, fragmentation suggests C may be likely, but the audit must be allowed to recommend A, B, C, stop-at-v4, or deprecation.”

Recommended disposition wording: `triaged`, schedule “next major work item before Phase 32 / before any Phase 33 extraction foundation work,” durable plan artifact required, transition to `in-progress` when audit begins, terminal `merged` only after audit doc lands and plan+solution cross-AI review are recorded.


