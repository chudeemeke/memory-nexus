# First-Principles Architecture Audit of memory-nexus

**Status:** in-progress (phase-level plan drafted; awaiting codex review #1 of 2)
**Started:** 2026-05-11
**Durable plan artifact:** `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`
**Source inbox item:** `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md`

---

## 0. User worry (verbatim, load-bearing)

> "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."
>
> — user, 2026-05-07/08 (conversations session)

This is THE load-bearing signal. Any subagent brief, any internal disposition, any recommendation MUST quote it. Any framing that minimizes it is biased.

---

## 1. Acceptance criteria (carried from durable plan §3)

1. This audit document landed with all sections filled
2. Cross-AI adversarial review of the audit plan AND final recommendation recorded (capped at 2 calls per durable plan §9)
3. Recommendation is explicit — exactly one of the 5 candidate outcomes
4. Concrete next-step actionable (phase plan, deprecation timeline, or "stop and document why no change")

---

## 2. Five candidate outcomes (from durable plan §4)

| Outcome | Meaning |
|---|---|
| **A** Continue v4.0 | Status quo. Run Phase 32-37 as planned. memory-nexus is right, just not finished. |
| **B** Scope v5.0 federation | memory-nexus becomes the federation router across adjacent memory surfaces. v5.0 milestone added; v4.0 publishes as foundation. |
| **C** Surgical consolidation | Consolidate redundant surfaces; do not federate. Cheapest. |
| **D** Freeze at v4.0 | Ship v4.0, declare it the ceiling. Phase 37 publishes; no v5.0 scoping. |
| **E** Deprecate / replace | memory-nexus is wrong shape. Adopt an adjacent system or new architecture. Migration plan required. |

The audit MUST explicitly evaluate ALL FIVE before recommending.

---

# PART I — Phase-level Audit Plan (drafted 2026-05-11, awaiting codex review)

This is the plan that gets codex-reviewed before any subagent spawns. Once codex pushback is integrated and locked, execution begins.

## 3. First-principles derivation framework

### 3.1 The discipline (mandatory)

Per `~/.claude/rules/first-principles-before-options.md`:

1. **Strip every assumption about HOW memory-nexus is currently built.**
2. **Derive irreducible truths** about what an agent-memory system MUST do, independent of memory-nexus's current shape.
3. **Derive minimum structure** satisfying those truths.
4. **Compare derived structure** against:
   - Each reference system (Hermes, OpenClaw, Mem0, MemPalace) row by row
   - Current memory-nexus row by row
5. **Only THEN ask:** would we build memory-nexus this way today?

The bias to watch: **anchoring on what memory-nexus already does and deriving "options" within that anchor.** If the derivation feels like working backwards from current code, restart.

### 3.2 Seed questions for the derivation

These questions seed §6's "Irreducible truths" output. They're not the answer — they're the prompt for thinking. The actual derivation must derive its OWN list of truths; these questions just make sure we don't miss obvious axes.

- **What kinds of memory must an agent-memory system hold?** (Episodic / semantic / procedural / preference / friction / decisions / etc.)
- **What operations must it support?** (Capture, retrieval, ranking, consolidation, deduplication, supersedence, deletion, export, cross-project portability)
- **Who writes? Who reads?** (Agent? User? Both? Concurrent sessions?)
- **What's the consistency model?** (Eventual? Strong? Read-your-writes? Snapshot?)
- **What's the failure mode if storage is corrupted or lost?** (Acceptable? Catastrophic? Rebuildable from source?)
- **What's the schema-evolution story?** (Migrations required? Schema-on-read? Append-only events?)
- **How does the agent know WHEN to query memory?** (Always? On demand? Triggered? Ambient?)
- **How does memory remain useful at scale?** (1k entries vs 100k vs 1M)
- **Cross-project / cross-machine portability?** (One DB per project? One global? Synced? Backed up?)
- **AI-readability constraint:** must a future model with no tooling be able to read accumulated state?

### 3.3 Anti-anchoring discipline

When deriving truths, the agent doing the derivation MUST NOT:
- Reach for "well memory-nexus does X, so X must be a truth"
- Use memory-nexus's existing schema as a starting point
- Use memory-nexus's existing commands as the structure
- Assume SQLite, JSONL, FTS5, or any specific tech is required

The agent doing the derivation MUST:
- Imagine designing from scratch, today, with only the user's worry as constraint
- Consider 2-3 wildly different designs (event log / triple store / vector-only / hybrid / etc.) before settling on a derived structure
- Document the alternatives considered, even if rejected

---

## 4. Adjacent-systems comparison matrix template

### 4.1 Reference systems

| System | URL | Lens |
|---|---|---|
| Hermes | https://github.com/nousresearch/hermes-agent | Full architecture |
| OpenClaw | https://github.com/openclaw/openclaw and https://openclaw.ai/ | Full architecture; OpenClaw's SOUL.md identity-tier rules already referenced in this project's prompting-claude doc |
| Mem0 | https://github.com/mem0ai/mem0 | Already inspiration for Phase 34 ADD/UPDATE/DELETE/NOOP; revisit HOLISTICALLY |
| MemPalace | (TBD — verify URL during research) | Spatial-memory metaphor; check applicability |

### 4.2 Matrix shape

For each irreducible truth derived in §6, fill this row:

| Truth | Hermes | OpenClaw | Mem0 | MemPalace | memory-nexus (current) | Derived min-structure | Best fit? |
|---|---|---|---|---|---|---|---|

The "Best fit?" column captures which system (if any) most closely satisfies that truth. This is the gap-analysis kernel.

### 4.3 Research protocol for each system

For each reference system, the audit's verification subagents must (independent of memory-nexus comparison):

1. Read the system's own architecture documentation (README, design docs, papers)
2. Identify its **storage model** (DB, files, hybrid, event log, vector store, knowledge graph, etc.)
3. Identify its **memory taxonomy** (episodic/semantic/etc. or its native equivalent)
4. Identify its **retrieval surface** (search? ranked recall? agent-routed?)
5. Identify its **consolidation/dedup model** (if any)
6. Identify its **AI-readability story** (export? raw files? proprietary?)
7. Identify what it **explicitly is NOT** (its stated non-goals)

Output for each system: a 1-page summary at `docs/audits/2026-05-11-comparison-<system>.md` (4 separate files). These feed §7.

---

## 5. Subagent specs (4 parallel verifications)

Per durable plan §7 + §8. Each subagent gets a brief that includes the VERBATIM blocks below. References rot under context loss; restating them in the brief is mandatory.

### 5.1 Subagent A — Memory-nexus CLI surface verification (friction subsystem)

**Brief includes verbatim:**

**The user's worry** (from §0 above, quote exactly).

**Anti-bias note:**
> "memory-nexus is not your sunk cost. If you would build something different from scratch, say so. The audit's purpose is to surface that gap, not justify the existing architecture."

**Cross-session context discipline:**
> "Per `~/.claude/rules/subagent-trust-calibration.md`: judgments returned by you about 'would we build this differently?' are context-dependent (medium-confidence). Path/file claims MUST be verified with `ls` / `grep` / `Read` before propagating into the audit document. The conversations inventory had three correction layers because subagent path claims were treated as high-confidence. Do not repeat that."

**Scope:** verify `memory friction list/log/dashboard/resolve/wontfix`. End-to-end behavior matching documented intent. Help text matches actual behavior? Vestigial commands? Missing commands? Friction subsystem coherent or fragmented?

**Output:** `docs/audits/2026-05-11-subagent-A-friction-surface.md`. <600 words.

### 5.2 Subagent B — Memory-nexus CLI surface verification (search/context subsystem)

**Same verbatim brief blocks as 5.1.**

**Scope:** verify `memory search/context/related/list/show/browse`. Especially: do these compose with each other? Does `memory context` use semantic recall or just FTS? Is `related` actually used or vestigial? Is the search surface coherent?

**Output:** `docs/audits/2026-05-11-subagent-B-search-surface.md`. <600 words.

### 5.3 Subagent C — Memory-nexus CLI surface verification (sync/ingestion subsystem)

**Same verbatim brief blocks as 5.1.**

**Scope:** verify `memory sync/extract/backfill/purge/export/import`. The data-flow: where does sync get sessions from, what happens to them, where do extracted facts land, when does the user run each command? Is the lifecycle coherent or accreted?

**Output:** `docs/audits/2026-05-11-subagent-C-sync-surface.md`. <600 words.

### 5.4 Subagent D — Memory-nexus CLI surface verification (admin subsystem)

**Same verbatim brief blocks as 5.1.**

**Scope:** verify `memory install/uninstall/doctor/status/stats`. Are these operational scaffolding that grew organically, or designed system-management surface? Does `doctor` find real issues or just check existence? Is `stats` informative or noise?

**Output:** `docs/audits/2026-05-11-subagent-D-admin-surface.md`. <600 words.

### 5.5 (Sequential, not subagent — main session) Adjacent-systems research

After subagents A-D return, the MAIN session (not parallel subagents) researches each reference system per §4.3. Reason for sequential: each system's research benefits from understanding what memory-nexus actually does (which subagents A-D verified). 4 outputs, one per system.

This is a deliberate choice: parallelizing 4 system-research subagents would risk anchoring each on "memory-nexus does X, look for X in Hermes/OpenClaw" — which is anti-first-principles. Sequential research with internal-state-known-first reduces that anchor.

---

## 6. Synthesis methodology

After subagents A-D and the adjacent-systems research land:

### 6.1 Derive irreducible truths (independent of memory-nexus + adjacent systems)

The audit author (next session, possibly with codex-assisted derivation) sits with:
- The seed questions from §3.2
- The user's worry (§0)
- The adjacent-systems research as STIMULUS (not anchor)

And derives a list of 5-10 irreducible truths about agent-memory systems. NOT what current systems happen to do — what they MUST do, derived independently.

The output is a sub-section of this doc: §7 "Irreducible truths."

### 6.2 Fill the comparison matrix (§7.X)

For each truth from §7, fill the row across all 4 reference systems + memory-nexus + derived min-structure.

### 6.3 Gap analysis (§7.Y)

For each truth where memory-nexus differs from the derived min-structure OR from adjacent best practices, document the gap:
- What's the gap (specific, concrete)
- Severity (would the user notice? would it block a use case?)
- Cost to close it (rewrite vs refactor vs config)
- Cost to live with it (recurring confusion vs one-time learning vs invisible)

### 6.4 Recommend (§7.Z)

Recommend exactly ONE outcome from §2. The recommendation MUST explicitly address why the other 4 outcomes were rejected.

---

## 7. Five-outcome decision rubric

Use this rubric to prevent the recommendation from being driven by the prior. Each outcome maps to specific gap-analysis signals.

| If gap analysis shows... | Outcome |
|---|---|
| Few gaps; memory-nexus has the right shape; just incomplete | **A** Continue v4.0 |
| memory-nexus has right shape AND there's a clear federation story across surfaces in the conversations inventory | **B** Scope v5.0 federation |
| Multiple memory surfaces serve overlapping roles; consolidation is the real fix; federation is over-engineering | **C** Surgical consolidation |
| memory-nexus is good enough but doesn't justify further investment; v4.0 is the ceiling | **D** Freeze at v4.0 |
| memory-nexus is structurally wrong; an adjacent system fits the truths much better; rewrite-cost ≤ migrate-cost | **E** Deprecate / replace |

If none of these cleanly map, the rubric itself is wrong. Document why and propose a sixth outcome explicitly rather than forcing one of the five.

---

## 8. Initial hypothesis (prior, quarantined per durable plan §11)

**This is a PRIOR, not a recommendation.** Recorded for transparency only.

The user's framing — "lots of similar but different solutions, none exact fit" — suggests **fragmentation**, not under-investment. That points toward **Outcome C (surgical consolidation)** as the most-likely best fit. Outcome E (deprecate/replace) is possible if consolidation cost approaches rewrite cost. Outcome B (federation) is risky because federation across already-fragmented surfaces compounds the worry.

This prior MUST NOT shape the audit's first-principles derivation. If the audit lands on C, that recommendation is held to a HIGHER standard ("how do I know this isn't just following the prior?"). If it lands on anything else, that surprise is recorded as learning signal per the actions-not-promises mid-session-surprise rule.

---

## 9. Cross-AI review constraints (capped at 2 calls, per durable plan §9)

- **Call #1 (THIS plan, before subagent spawn):** the phase-level audit plan above (sections 3-8). Codex pushback integrated into a "Plan revisions from codex review" sub-section below. Then execution begins.
- **Call #2 (final recommendation, before close):** the recommendation in §7.Z with rejection rationale for the other 4 outcomes. Codex pushback integrated into a "Recommendation revisions from codex review" sub-section. Then audit doc locked.

**Intermediate subagent syntheses are NOT cross-AI reviewed.** Internal review only.

---

# PART II — Execution outputs (to be filled during audit)

## 10. Plan revisions from codex review

*[To be filled after codex review #1 returns. Capture deltas from §3-8.]*

## 11. Subagent outputs

*[To be filled after subagents A-D return. Each subagent's <600-word output linked here.]*

- 11.A Friction surface: *(awaiting)*
- 11.B Search/context surface: *(awaiting)*
- 11.C Sync/ingestion surface: *(awaiting)*
- 11.D Admin surface: *(awaiting)*

## 12. Adjacent-systems research

*[To be filled per §4.3 protocol. One subsection per system.]*

- 12.A Hermes: *(awaiting)*
- 12.B OpenClaw: *(awaiting)*
- 12.C Mem0: *(awaiting)*
- 12.D MemPalace: *(awaiting)*

## 13. Irreducible truths

*[To be filled per §6.1. 5-10 truths, derived independently.]*

## 14. Comparison matrix

*[To be filled per §6.2 with the structure from §4.2.]*

## 15. Gap analysis

*[To be filled per §6.3.]*

## 16. Recommendation

*[To be filled per §6.4. Single outcome from §2 with explicit rejection of the other 4.]*

## 17. Recommendation revisions from codex review

*[To be filled after codex review #2 returns.]*

## 18. Concrete next-phase plan

*[If recommendation is A/B/C/D: phase numbering, deps, acceptance. If E: migration timeline.]*
