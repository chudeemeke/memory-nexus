# First-Principles Architecture Audit — Plan Artifact

**Status:** scheduled
**Triaged from:** `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md`
**Triaged on:** 2026-05-11
**Codex-reviewed (gpt-5.5 high):**
  - Disposition plan: `.planning/reviews/2026-05-11-architecture-audit-disposition-plan.md`
  - Disposition review: `.planning/reviews/2026-05-11-architecture-audit-disposition-codex-review.md`

This artifact is the durable plan for an upcoming architecture audit. The inbox item it originates from will move to `archived/` only when the audit completes and the recommendation lands. Until then, the audit's schedule + scope are encoded here so they survive context loss.

---

## 1. User worry (verbatim, load-bearing)

> "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."
>
> — user, 2026-05-07/08 (conversations session)

The worry is THE load-bearing signal for the audit's existence. Any subagent brief MUST quote this verbatim. Any internal disposition that minimizes it is biased.

---

## 2. Schedule commitment

**The audit runs as the next major work item.** Bug-fix gate is met:
- Phase 31 (Bug Fixes) closed.
- Out-of-roadmap test-isolation cleanup arc closed today (2026-05-11; gate at 0 violations).

**Hard gates** (not "before Phase 32" alone — per codex pushback #8, Phase 32 is overstated; the real architectural commitments are Phase 33/34 and Phase 37):
- Audit MUST land before Phase 33 (Knowledge Extraction Foundation) commits to the extraction provider port, fact schema, and Mem0-style ADD/UPDATE/DELETE/NOOP semantics.
- Audit MUST land before Phase 37 (Publishing) ships v4.0 to npm — if the audit recommends deprecation or major redirection, publishing v4.0 cements a sunk-cost trajectory.
- Phase 32 (CLI Surface) is secondary support — running before Phase 32 keeps the v4.0 roadmap unblocked while the audit runs, but Phase 32 itself is not the hard gate.

**State transitions:**
- Inbox file: `open` → **`triaged`** (today) → `in-progress` (audit kickoff) → `merged` (recommendation document landed + final cross-AI review recorded) → moved to `archived/`.
- This plan artifact: `scheduled` → `in-progress` → `complete` matching the inbox transitions.

---

## 3. Acceptance criteria

Carried forward from the inbox item:

1. Audit document landed at `~/Projects/memory-nexus/docs/audits/2026-XX-XX-architecture-first-principles-audit.md` (the dated final document — separate from this plan artifact)
2. Cross-AI adversarial review of the audit's plan AND final recommendation is recorded
3. Recommendation is explicit (one of: continue v4.0 / consolidate / scope v5 federation / freeze at v4 / deprecate-or-replace)
4. Concrete next-step is actionable (phase plan, deprecation timeline, or "stop and document why no change")

---

## 4. Candidate outcomes (5 explicit options — NOT just A/B/C)

Per codex pushback #7, excluding deprecation biases the audit toward self-justification. The audit may recommend ANY of:

| Outcome | Meaning |
|---|---|
| **A** Continue v4.0 | Status quo. Run Phase 32-37 as planned. memory-nexus is the right tool, just not finished. |
| **B** Scope v5.0 federation | memory-nexus becomes the federation router across adjacent memory surfaces (per conversations inventory option B). v5.0 milestone added; v4.0 publishes as foundation. |
| **C** Surgical consolidation | Consolidate redundant surfaces; do not federate. Cheapest path. Per conversations inventory option C. |
| **D** Freeze at v4.0 | Ship v4.0, declare it the ceiling. Phase 37 publishes; no v5.0 scoping. Steady-state maintenance only. |
| **E** Deprecate / replace | memory-nexus is the wrong shape. Recommend adopting one of the adjacent systems (Hermes / OpenClaw / Mem0 / MemPalace) OR a different new architecture. Migration plan required. |

The audit must explicitly evaluate ALL FIVE before recommending. Any subagent brief that suggests memory-nexus is fixed scope is biased.

---

## 5. First-principles framing (mandatory)

Per `~/.claude/rules/first-principles-before-options.md`. The discipline:

1. **Strip every assumption about HOW memory-nexus is currently built.**
2. **Derive irreducible truths** about what an agent-memory system MUST do, independent of memory-nexus's current shape.
3. **Derive minimum structure** satisfying those truths.
4. **Compare derived structure** against:
   - Each reference system (Hermes, OpenClaw, Mem0, MemPalace) row by row
   - Current memory-nexus row by row
5. **Only THEN ask:** would we build memory-nexus this way today?

The bias to watch: **anchoring on what memory-nexus already does and deriving "options" within that anchor.** The audit must derive truths independent of memory-nexus's current shape. If the derivation feels like working backwards from current code, restart.

---

## 6. Reference systems

| System | URL | Note |
|---|---|---|
| Hermes (NousResearch) | https://github.com/nousresearch/hermes-agent | Compare full architecture |
| OpenClaw | https://openclaw.ai/ and https://github.com/openclaw/openclaw | Compare full architecture; OpenClaw's SOUL.md identity-tier rules are referenced in this project's prompting-claude reference |
| Mem0 | (already inspiration for Phase 34 ADD/UPDATE/DELETE/NOOP) | Revisit HOLISTICALLY, not just extraction primitives |
| MemPalace | (spatial-memory metaphor) | Check if applicable patterns |

---

## 7. Multi-subagent verification scope (parallel)

Spawn subagents in parallel. Each verifies a slice of the CLI surface for end-to-end behavior matching documented intent (not just unit-test pass):

- Subagent 1: `memory friction list/log/dashboard/resolve/wontfix`
- Subagent 2: `memory search/context/related/list/show/browse`
- Subagent 3: `memory sync/extract/backfill/purge/export/import`
- Subagent 4: `memory install/uninstall/doctor/status/stats`

Each subagent answers: does the help text describe what the command actually does? Are there commands that exist but are unused or vestigial? Are there gaps where a command should exist but doesn't?

---

## 8. Subagent brief framing (MANDATORY — verbatim, not by reference)

Per codex pushback #6, restate verbatim because references rot under context loss.

Every subagent spawned during this audit MUST receive a brief that includes:

### 8.1 The user's worry (quote verbatim from §1 above)

### 8.2 Anti-bias note (verbatim)

> "memory-nexus is not your sunk cost. If you would build something different from scratch, say so. The audit's purpose is to surface that gap, not justify the existing architecture."

### 8.3 Cross-session context discipline

Per `~/.claude/rules/subagent-trust-calibration.md`:
- Judgments returned by subagents about "would we build this differently?" are **context-dependent (medium-confidence)**.
- Path/file claims MUST be verified with `ls` / `grep` / `Read` before propagating into the audit document. The conversations inventory had three correction layers because subagent path claims were treated as high-confidence. Do not repeat that.

### 8.4 First-principles anchor

The subagent's verification is part of a first-principles audit. The bias to watch: anchoring on current code. If the subagent finds itself reasoning "memory-nexus does X so it must do X," it should restart from "what MUST the system do?"

---

## 9. Cross-AI review constraints (capped at 2 calls)

Per codex pushback #5, prevent process theater. Exactly two cross-AI reviews:

1. **Audit plan review** (BEFORE execution begins): when the detailed phase-level audit plan is drafted (NOT this triage-stage artifact — the next-level plan inside `docs/audits/2026-XX-XX-...`), pipe to codex once. Integrate pushback. Then execute.
2. **Final recommendation review** (BEFORE closing): when the audit document's recommendation is locked, pipe to codex once. Integrate pushback. Then mark merged.

**Intermediate subagent syntheses are NOT cross-AI reviewed.** They are reviewed internally before final synthesis. Cross-AI review at every step turns the audit into process performance.

---

## 10. Inbox content review at audit start

At audit kickoff, sweep `docs/inbox/` for any new issues filed since 2026-05-08 that the audit should incorporate. As of triage today, the inbox contains (post-friction-primacy-archive):

- This item (`2026-05-08-conversations-first-principles-architecture-audit.md`)
- Three audit-discovered inbox items filed today: programmatic-api-real-db-pollution, friction-test-phase-30-orphan, bun-windows-full-suite-crash.

The three audit-discovered items are NOT architectural in scope. They should be triaged independently of this audit but flagged if they correlate with audit findings.

---

## 11. Initial hypothesis (quarantined)

Per codex pushback #9, declare prior so it doesn't bias execution.

**This is a PRIOR, not a recommendation.** The audit must remain free to recommend any of the 5 outcomes in §4.

Prior to audit: the user's framing — "lots of solutions that are similar but different and none are the exact fit" — suggests **fragmentation, not under-investment**. That points toward **Outcome C (surgical consolidation)** as the most-likely best fit. Outcome E (deprecate/replace) is possible if the consolidation cost approaches rewrite cost. Outcome B (federation) is risky because federation across already-fragmented surfaces compounds the worry rather than resolving it.

This prior MUST NOT shape the audit's first-principles derivation. It is recorded only so that if the audit recommends C, that recommendation is held to a higher standard ("how do I know you're not just following the prior?") — and if it recommends anything else, the surprise is recorded as learning signal per `~/.claude/rules/actions-not-promises.md` mid-session-surprise extension.

---

## 12. Output

A recommendation document at `docs/audits/2026-XX-XX-architecture-first-principles-audit.md` (separate file, dated when audit completes) containing:

1. **Irreducible truths** — what an agent-memory system MUST do, derived independent of memory-nexus's current shape
2. **Adjacent-systems comparison matrix** — Hermes / OpenClaw / Mem0 / MemPalace × the truths from (1)
3. **Current memory-nexus comparison** — same matrix row for current state
4. **Gap analysis** — where memory-nexus diverges from the derived structure or from adjacent best practices
5. **Recommendation** on the 5 candidate outcomes in §4
6. **Concrete next-phase plan** for the recommended outcome (phase numbering, deps, acceptance criteria)
7. **Cross-AI review records** (both calls, with codex outputs included or referenced)

---

## 13. What this triage does NOT do

- Run the audit. The audit is a separate, multi-session arc.
- Counter-notify conversations. Per codex pushback #4 and the cross-project-issues v1.2 rule, closure-notify fires ONLY on terminal-state transition (`merged` or `rejected`). The inbox item is currently `triaged`, not terminal. If conversations needs schedule coordination before closure, file a separate non-closure status item — but no such request has come from conversations.
- Pre-commit to outcome. Including the prior in §11 is disclosure, not commitment.

---

## 14. Next-action gate

The next time memory-nexus has a fresh major work session AND user has authorized the audit's execution AND the bug-fix gate remains met (no new in-flight phase), kick off the audit by:

1. Updating this artifact's status to `in-progress`
2. Creating `docs/audits/2026-XX-XX-architecture-first-principles-audit.md` (the audit doc itself)
3. Updating `.planning/STATE.md` current focus to architecture audit
4. Drafting the phase-level audit plan inside the audit doc
5. Codex-reviewing the phase-level plan (cross-AI call #1)
6. Spawning the 4 verification subagents in parallel with the briefs from §8
7. Synthesizing findings
8. Drafting the recommendation
9. Codex-reviewing the recommendation (cross-AI call #2)
10. Locking the recommendation, updating inbox status to `merged`, moving inbox file to `archived/`, sending closure-notify to conversations

This artifact is the durable handoff. The audit's execution is the next session.
