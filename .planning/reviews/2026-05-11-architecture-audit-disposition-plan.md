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
