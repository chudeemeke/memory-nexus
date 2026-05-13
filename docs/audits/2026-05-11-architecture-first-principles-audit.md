# First-Principles Architecture Audit of memory-nexus

**Status:** in-progress (phase-level plan revised post codex review #1; ready for Stage 0)
**Started:** 2026-05-11
**Durable plan artifact:** `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md`
**Source inbox item:** `docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md`
**Codex review #1 of 2:** integrated 2026-05-11 (verdict was BLOCK; all 8 findings addressed below)

---

## 0. User worry (verbatim, load-bearing)

> "I'm begining to worry about the number of solutions that I'm creating that a similar but different and as such none are the exact fit so most/all of my memory concerns. I honestly wonder if the memory tool (memory-nexus project) has a lot of the right things but is not quite done right or finished right or something that I can't quite put my finger on."
>
> — user, 2026-05-07/08 (conversations session)

This is THE load-bearing signal. Any subagent brief, any internal disposition, any recommendation MUST quote it. Any framing that minimizes it is biased.

---

## 1. Acceptance criteria

1. This audit document landed with all sections filled
2. Cross-AI adversarial review of the audit plan AND final recommendation recorded (capped at 2 calls per durable plan §9)
3. Recommendation is explicit — exactly one of the 5 candidate outcomes
4. Concrete next-step actionable (phase plan, deprecation timeline, or "stop and document why no change")

---

## 2. Five candidate outcomes

| Outcome | Meaning |
|---|---|
| **A** Continue v4.0 | Status quo. Run Phase 32-37 as planned. memory-nexus is right, just not finished. |
| **B** Scope v5.0 federation | memory-nexus becomes the federation router across adjacent memory surfaces. v5.0 milestone added; v4.0 publishes as foundation. |
| **C** Surgical consolidation | Consolidate redundant surfaces; do not federate. Cheapest. |
| **D** Freeze at v4.0 | Ship v4.0, declare it the ceiling. Phase 37 publishes; no v5.0 scoping. |
| **E** Deprecate / replace | memory-nexus is wrong shape. Adopt an adjacent system or new architecture. Migration plan required. |

The audit MUST explicitly evaluate ALL FIVE before recommending.

---

# PART I — Phase-level Audit Plan (revised 2026-05-11 post codex review #1)

Codex review #1 returned BLOCK with 8 findings. Full review: `.planning/reviews/2026-05-11-architecture-audit-phase-plan-codex-review.md`.

Revisions integrated below:

| # | Codex finding | Integrated in |
|---|---|---|
| 1 | Stage 0 missing — derivation order let CLI surface frame the audit | §3 Execution stages + §3.0 Stage 0 deliverable |
| 2 | Adjacent-system research was memory-nexus-aware | §5 (independent per-system summaries; no incumbent comparison inside writeups) |
| 3 | CLI subagents over-weighted; architecture-evidence pass missing | §6.5 architecture-evidence pass added |
| 4 | Subagent vs main-session contradiction for reference research | §5.2 (main session owns it) |
| 5 | Evidence standards under-specified | §8 evidence standards section |
| 6 | Decision rubric lacks thresholds | §9 expanded with explicit decision tests |
| 7 | MemPalace not pinned | §5.1 fallback rule defined |
| 8 | State drift across inbox/STATE/durable plan | §12 state reconciliation note |

## 3. Execution stages (per codex finding #1)

The original plan let memory-nexus's command surface and adjacent systems' designs anchor the audit before any truths were derived. Revised order inverts this:

| Stage | What | Owner | Anchoring risk |
|---|---|---|---|
| **Stage 0** | Derive PROVISIONAL irreducible truths + provisional minimum structure from user worry + general agent-memory requirements ONLY. No memory-nexus inspection, no adjacent-system research yet. | Main session | Lowest — no incumbent or external bias |
| **Stage 1a** | Memory-nexus CLI surface verification (4 parallel subagents A-D, §6.1-6.4) — evaluate against Stage 0 truths | Subagents | Bounded — subagents see Stage 0 truths as lens |
| **Stage 1b** | Architecture-evidence pass (§6.5) — storage model, taxonomy, capture-to-retrieval flow, consolidation/supersedence/deletion/export, AI-readability, cross-project/machine boundaries, doc/code/roadmap drift. **Produces evidence map, NOT verdict.** | 5th subagent OR main session | Bounded — separate from command surface |
| **Stage 2** | Adjacent-system research (Hermes / OpenClaw / Mem0 / MemPalace). **Independent per-system summaries against Stage 0 truths.** No memory-nexus comparison inside per-system writeups. | Main session, with strict source citations | Independent of incumbent |
| **Stage 3** | Synthesis (§7): refine truths against accumulated evidence, fill comparison matrix, gap analysis, apply §9 thresholds, recommend | Main session | Mitigated by §8 evidence standards |

Provisional truths from Stage 0 are revised in Stage 3 ONLY when Stage 1/2 evidence disproves them. Each revision must cite the disproving evidence per §8 standards.

### 3.0 Stage 0 deliverable (gate before any subagent spawn)

Before Stage 1, the main session writes a Stage 0 output as §16.0 in PART II containing:

1. **Provisional irreducible truths list (5-10 items)** — derived from §4.2 seed questions + user worry + general agent-memory requirements. NOT from memory-nexus inspection. NOT from adjacent-system research.
2. **Provisional minimum structure** — what minimum design satisfies those truths? At least 2-3 wildly different design candidates considered (event log / triple store / vector-only / hybrid / knowledge graph / spatial-graph / etc.) before settling.
3. **Anti-anchoring self-check (verbatim statement):** "These truths were derived without inspecting memory-nexus's schema, commands, or current code, and without reading Hermes/OpenClaw/Mem0/MemPalace docs. Stage 1 and Stage 2 evidence may revise them; the revision must cite the disproving evidence."

Stage 0 is the gate. Stage 1 cannot begin until §16.0 exists.

---

## 4. First-principles derivation framework (used by Stage 0)

### 4.1 The discipline (mandatory)

Per `~/.claude/rules/first-principles-before-options.md`:

1. Strip every assumption about HOW memory-nexus is currently built.
2. Derive irreducible truths about what an agent-memory system MUST do, independent of memory-nexus's current shape.
3. Derive minimum structure satisfying those truths.
4. Compare derived structure against each reference system AND current memory-nexus.
5. Only THEN ask: would we build memory-nexus this way today?

The bias to watch: **anchoring on what memory-nexus already does and deriving "options" within that anchor.** If the derivation feels like working backwards from current code, restart.

### 4.2 Seed questions for the derivation

These seed §16's "Irreducible truths" output. They prompt thinking; they're not the answer. The actual derivation must derive its OWN list of truths; these just make sure obvious axes aren't missed.

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

### 4.3 Anti-anchoring discipline

When deriving truths, the deriver MUST NOT:
- Reach for "memory-nexus does X, so X must be a truth"
- Use memory-nexus's existing schema as a starting point
- Use memory-nexus's existing commands as the structure
- Assume SQLite, JSONL, FTS5, or any specific tech is required

The deriver MUST:
- Imagine designing from scratch, today, with only the user's worry as constraint
- Consider 2-3 wildly different designs before settling
- Document the alternatives considered, even if rejected

---

## 5. Adjacent-system research (Stage 2, per codex findings #2 + #4 + #7)

### 5.1 Reference systems

| System | URL | Pin status | Fallback if no stable reference |
|---|---|---|---|
| Hermes | https://github.com/nousresearch/hermes-agent | Pinned (URL stable as of 2026-05-11) | N/A |
| OpenClaw | https://github.com/openclaw/openclaw + https://openclaw.ai/ | Pinned | N/A |
| Mem0 | https://github.com/mem0ai/mem0 | Pinned | N/A |
| MemPalace | (TBD — main session must locate canonical source during Stage 2) | **Not pinned (per codex finding #7)** | If no stable project or documentation is found, record "MemPalace: no stable reference found" in §15.D. **Do not invent a comparison row from secondary summaries.** Either find a primary source or skip the system. |

### 5.2 Research ownership (per codex finding #4)

**Main session owns adjacent-system research.** NOT subagents. Reason: the cap on cross-AI review (§11) is meant to avoid process theater; spawning 4+ subagents that each do an independent system writeup, then synthesizing them, then reviewing — that path inflates token cost without proportionate evidence gain. Main session does the research sequentially with strict source citations per §8.

The internal contradiction in the original plan (§4.3 said subagents; §5.5 said main session) is resolved in favor of main session.

### 5.3 Per-system research protocol (per codex finding #2 — independence)

For EACH reference system, write a per-system summary at `docs/audits/2026-05-11-comparison-<system>.md` that:

1. Evaluates the system against the Stage 0 provisional truths (§16.0)
2. Captures: storage model, memory taxonomy, retrieval surface, consolidation/dedup model, AI-readability story, stated non-goals
3. Cites primary sources (URL + retrieval date) per §8 evidence standards
4. **Does NOT reference memory-nexus.** No "memory-nexus does X; this system does Y" framing inside the per-system writeup. That comparison happens in the synthesis matrix (§17), not in the source-system summaries.

The per-system summaries feed §17 (comparison matrix), not the synthesis itself.

---

## 6. Memory-nexus verification (Stage 1a + 1b)

### 6.1 Subagent A — Friction subsystem

**Brief includes verbatim:**

**The user's worry** (from §0, quote exactly).

**Anti-bias note:**
> "memory-nexus is not your sunk cost. If you would build something different from scratch, say so. The audit's purpose is to surface that gap, not justify the existing architecture."

**Cross-session context discipline:**
> "Per `~/.claude/rules/subagent-trust-calibration.md`: judgments returned by you about 'would we build this differently?' are context-dependent (medium-confidence). Path/file claims MUST be verified with `ls` / `grep` / `Read` before propagating into the audit document. The conversations inventory had three correction layers because subagent path claims were treated as high-confidence. Do not repeat that."

**Stage 0 lens:** the brief will include the Stage 0 provisional truths (§16.0). The subagent evaluates the friction subsystem against those truths — does the subsystem help satisfy them, ignore them, or actively work against them?

**Scope:** verify `memory friction list/log/dashboard/resolve/wontfix`. End-to-end behavior matching documented intent. Help text matches actual behavior? Vestigial commands? Missing commands? Subsystem coherent or fragmented?

**Output:** `docs/audits/2026-05-11-subagent-A-friction-surface.md`. <600 words. Each claim cites file:line or command output per §8.

### 6.2 Subagent B — Search / context subsystem

Same verbatim brief blocks as 6.1. Stage 0 lens applies.

**Scope:** verify `memory search/context/related/list/show/browse`. Especially: do these compose? Does `memory context` use semantic recall or just FTS? Is `related` actually used or vestigial? Is the search surface coherent?

**Output:** `docs/audits/2026-05-11-subagent-B-search-surface.md`. <600 words.

### 6.3 Subagent C — Sync / ingestion subsystem

Same verbatim brief blocks as 6.1. Stage 0 lens applies.

**Scope:** verify `memory sync/extract/backfill/purge/export/import`. The data-flow: where does sync get sessions from, what happens to them, where do extracted facts land, when does the user run each command? Lifecycle coherent or accreted?

**Output:** `docs/audits/2026-05-11-subagent-C-sync-surface.md`. <600 words.

### 6.4 Subagent D — Admin subsystem

Same verbatim brief blocks as 6.1. Stage 0 lens applies.

**Scope:** verify `memory install/uninstall/doctor/status/stats`. Operational scaffolding that grew organically, or designed system-management surface? Does `doctor` find real issues or just check existence? Is `stats` informative or noise?

**Output:** `docs/audits/2026-05-11-subagent-D-admin-surface.md`. <600 words.

### 6.5 Architecture-evidence pass (NEW per codex finding #3)

CLI verification (A-D) shows whether commands work end-to-end. It does NOT show whether the system is the right shape. A command can work cleanly while the architecture is still wrong.

This pass produces an EVIDENCE MAP, not a verdict. Inspected dimensions:

| Dimension | What to evidence |
|---|---|
| **Storage model + source of truth** | What's canonical for each kind of memory? DB? JSONL? Both? Where do schema-enforced facts live vs free-form notes? |
| **Memory taxonomy + lifecycle** | What kinds of memory exist? Where is each born → updated → superseded → deleted → exported? Where does the lifecycle break? |
| **Capture-to-retrieval data flow** | When the user/agent writes memory at time T, what's the path to first retrieval? Latency? Indexing? Embedding pipeline? |
| **Consolidation, supersedence, deletion, export guarantees** | When facts conflict, what wins? Can old facts be invalidated without erasure? Is the export round-trippable? |
| **AI-readability + no-tool recovery** | If memory-nexus is uninstalled, can a future model read accumulated state? What's the cost? |
| **Cross-project + cross-machine boundary model** | One DB per machine? Synced? How is state portable? |
| **Doc/code/roadmap drift** | Where do CLAUDE.md, docs, code, and ROADMAP.md disagree? (This is the user's worry's likely fingerprint.) |

**Owner:** main session OR 5th subagent in parallel with A-D, depending on session budget at Stage 1 start.

**Output:** `docs/audits/2026-05-11-architecture-evidence-map.md`. ~1000-1500 words. Evidence-cited per §8. NO verdict, NO recommendation, NO outcome-mapping. Just the map.

---

## 7. Synthesis methodology (Stage 3)

After Stage 1 (subagents A-D + architecture-evidence pass) and Stage 2 (adjacent-system summaries) return:

### 7.1 Refine truths

Sit with:
- Stage 0 provisional truths (§16.0)
- Subagent outputs (§14)
- Architecture-evidence map (§14.5)
- Adjacent-system summaries (§15)

Revise the truth set ONLY where evidence disproves a provisional truth. Each revision cites the disproving evidence. Lock the refined truths as §16.

### 7.2 Fill comparison matrix

For each truth in §16, fill a row in §17 across: Hermes / OpenClaw / Mem0 / MemPalace / memory-nexus / derived min-structure. Cell evidence per §8.

### 7.3 Gap analysis

For each truth where memory-nexus differs from the derived min-structure OR from adjacent best practices, document the gap in §18:
- What's the gap (specific, concrete, evidence-cited)
- Severity (would the user notice? would it block a use case?)
- Cost to close (rewrite vs refactor vs config)
- Cost to live with it

### 7.4 Apply decision thresholds + recommend

Apply §9 decision thresholds to map gap analysis to one of the 5 outcomes (§2). The recommendation in §19 MUST explicitly address why the other 4 outcomes were rejected.

---

## 8. Evidence standards (NEW per codex finding #5)

This audit is high-stakes — the recommendation decides whether to keep investing in memory-nexus. Every claim must be evidence-cited.

**Matrix cells (§17):** each must cite ONE of —
- Local file/line reference (`src/path/to/file.ts:123`)
- Command output artifact (`bun run X` output captured at <path>)
- Upstream source URL + retrieval date (`https://... retrieved 2026-05-11`)
- Explicit "Not found in reviewed docs / source"

**Gaps (§18):** each must cite the evidence that proves the gap. Severity claims must cite the user-visible impact.

**Inferences:** any claim that is not directly verified is labeled `[inference]` inline. Inference chains > 2 hops are flagged as low-confidence.

**Recommendation (§19):** each rejection of an outcome must cite specific gaps/evidence that make that outcome wrong.

The reviewer (and codex review #2) should be able to trace every load-bearing claim to a citation.

---

## 9. Decision rubric with thresholds (expanded per codex finding #6)

The 5-outcome rubric maps gap analysis to a recommendation. The original rubric was qualitative enough to be steered toward the prior. Codex required explicit decision tests:

| If gap analysis shows... | Outcome |
|---|---|
| Few gaps; memory-nexus has right shape; just incomplete | **A** Continue v4.0 |
| Right shape AND clear federation story across surfaces in conversations inventory | **B** Scope v5.0 federation |
| Multiple memory surfaces serve overlapping roles; consolidation is real fix; federation is over-engineering | **C** Surgical consolidation |
| memory-nexus good enough but doesn't justify further investment | **D** Freeze at v4.0 |
| Structurally wrong; an adjacent system fits truths better; rewrite-cost ≤ migrate-cost | **E** Deprecate / replace |

**Explicit decision thresholds (codex finding #6):**

Apply these tests after gap analysis (§18). Each test forces a yes/no with evidence:

1. **High-severity truth gaps:** How many truths in §16 are seriously violated by memory-nexus? If >50% of truths have high-severity gaps → outcome shifts away from A toward C/E.
2. **Closeability inside v4.0:** Can the high-severity gaps be closed in the remaining v4.0 phases (32-37) WITHOUT changing the architecture? If yes → A. If no → C/B/E.
3. **Migration cost vs rewrite cost:** If E is on the table, evidence comparing migration cost (memory-nexus → adjacent system) vs rewrite cost (build new from scratch) is required. Migration > rewrite → bias against E.
4. **Consolidation surface reduction:** If C is on the table, gap analysis must show that consolidation reduces the number of memory surfaces (not just hides them behind a router). If consolidation = router-over-fragmentation → B is wrong, C is wrong, lean toward A or E.
5. **v4.0 publishing risk:** Would shipping Phase 37 (npm publish v4.0) cement a wrong source of truth that's hard to undo? If yes → D (freeze) is wrong; A/B/E ship first.

If gap analysis doesn't cleanly map to ANY outcome through these tests, document why and propose a sixth outcome explicitly rather than forcing one of the five.

---

## 10. Initial hypothesis (prior, quarantined per durable plan §11)

**This is a PRIOR, not a recommendation.** Recorded for transparency only.

The user's framing — "lots of similar but different solutions, none exact fit" — suggests **fragmentation**, not under-investment. That points toward **Outcome C (surgical consolidation)** as the most-likely best fit. Outcome E (deprecate/replace) is possible if consolidation cost approaches rewrite cost. Outcome B (federation) is risky because federation across already-fragmented surfaces compounds the worry.

This prior MUST NOT shape the audit's first-principles derivation. If the audit lands on C, that recommendation is held to a HIGHER standard ("how do I know this isn't just following the prior?"). If it lands on anything else, that surprise is recorded as learning signal per the actions-not-promises mid-session-surprise rule.

---

## 11. Cross-AI review constraints (capped at 2 calls per durable plan §9)

- **Call #1 (THIS plan, INTEGRATED 2026-05-11):** the original phase-level audit plan (sections 3-9). Codex returned BLOCK with 8 findings. Revisions integrated above and tagged at top of PART I. Execution begins after this commit.
- **Call #2 (final recommendation, before close):** the recommendation in §19 with rejection rationale for the other 4 outcomes. Codex pushback integrated into §20 ("Recommendation revisions from codex review"). Then audit doc locked.

**Intermediate subagent syntheses are NOT cross-AI reviewed.** Internal review only. This is the discipline against process theater.

---

## 12. State reconciliation (NEW per codex finding #8)

Codex flagged drift across:
- Source inbox item (`docs/inbox/2026-05-08-conversations-first-principles-architecture-audit.md`)
- `.planning/audits/2026-05-11-architecture-first-principles-audit-plan.md` (the durable plan artifact)
- `.planning/STATE.md`

Resolved state (locked 2026-05-11 in this commit):

| Artifact | Status field | Rationale |
|---|---|---|
| Source inbox item | `in-progress` | Audit kickoff has happened (commit `8711f92`); audit is actively running. |
| Durable plan artifact | `in-progress` | Audit kickoff has happened; this plan is the audit's external spec. |
| `.planning/STATE.md` | milestone `gated_on_audit`; current focus is the audit | Audit is the current focus; v4.0 Phase 32-37 paused. |
| Audit doc itself | `in-progress (phase-level plan revised post codex review #1; ready for Stage 0)` | Codex review #1 integrated; Stage 0 is the next action. |

The earlier disposition section in the source inbox item (titled "Disposition (2026-05-11) — TRIAGED") was written when status was `triaged`. That section is HISTORICAL — it captures the disposition AT TRIAGE TIME, not the current state. The current state lives in the frontmatter `status` field and in this audit doc.

---

# PART II — Execution outputs (to be filled during audit)

## 13. Plan revisions from codex review #1

Codex review #1 at `.planning/reviews/2026-05-11-architecture-audit-phase-plan-codex-review.md`. Verdict was BLOCK. All 8 findings integrated in PART I above and summarized in the table at the top of PART I.

Key structural changes:
- **§3 + §3.0 NEW:** Stage 0 (provisional truths) runs BEFORE any subagent or adjacent research.
- **§5 RESTRUCTURED:** adjacent-system research is independent of memory-nexus, main-session-owned (resolved §4.3/§5.5 contradiction).
- **§6.5 NEW:** architecture-evidence pass produces evidence map separate from CLI verification.
- **§8 NEW:** evidence standards for matrix cells, gaps, inferences.
- **§9 EXPANDED:** decision rubric now has 5 explicit threshold tests.
- **§5.1 NEW:** MemPalace fallback rule defined (record "no stable reference found", don't invent).
- **§12 NEW:** state reconciliation across inbox/STATE/durable plan.

## 14. Subagent outputs (Stage 1a)

Stage 1a executed 2026-05-13. Four parallel `general-purpose` subagents per audit §6.1–6.4. Each output includes verbatim user worry, anti-bias note, cross-session context discipline, Stage 0 lens, scope, evidence-cited findings. Word counts exceeded the <600 target in 3 of 4 cases (A:1135, B:728, C:838, D:561) because §8 evidence density was prioritized.

Trust calibration applied per `~/.claude/rules/subagent-trust-calibration.md`. File:line citations and grep-verified absences are local-confidence-high. Cross-subsystem judgments and "would you build differently" calls are context-dependent-medium — pressure-test against Stage 1b evidence map and Stage 2 adjacent-system research before locking into Stage 3 synthesis.

### 14.A — Friction surface

Output: `docs/audits/2026-05-11-subagent-A-friction-surface.md`

**Load-bearing finding (high-confidence on local; medium on judgment):** friction is internally coherent (clean DDD layering post-Phase-30) but architecturally orphan. Zero mentions in `docs/01-VISION.md`, `docs/04-ARCHITECTURE.md`, `docs/05-IMPLEMENTATION.md`. Friction is the ONLY typed memory entity in `src/domain/entities/` — no decision / learning / preference / observation peers exist. The subsystem is a parallel journal, NOT one event type in a unified event stream (the provisional minimum structure shape). C3 fail. T2 / T4 / T7 / T8 violations evidence-cited.

### 14.B — Search / context surface

Output: `docs/audits/2026-05-11-subagent-B-search-surface.md`

**Load-bearing finding (high-confidence local; high-confidence judgment):** `memory context` — the command whose intent is "what's relevant to this project now" — has ZERO semantic-recall code paths. Grep of `context-service.ts` and `smart-context-service.ts` for `embedding|vector|cosine|similarity|HybridSearch` returns nothing. `HybridSearchService` + `sqlite-vec` infrastructure exists (`src/infrastructure/search/...`, `schema.ts:54,217`) and IS wired into `memory search` only.

This is the user-worry fingerprint at its sharpest: **"right thing built, not wired through."** T2 violation in the command whose name IS "context." C3 fragmentation also present internally — 5 parallel read surfaces (search/context/related/list/show) with overlapping flags, only composed by `browse` which is TTY-gated.

### 14.C — Sync / ingestion surface

Output: `docs/audits/2026-05-11-subagent-C-sync-surface.md`

**Load-bearing finding (high-confidence):** typed `LlmExtractor` at `src/application/services/llm-extractor.ts:1-44` exists but is UNWIRED from the sync path (no caller in `extractSession`). Sync ingests at message/tool_use granularity, never extracts typed events (decisions, terms, supersedence). Five ingestion-adjacent commands (sync, backfill, purge, export, import) write three storage shapes with non-composing lifecycles.

T4 (supersedence) absent at the data layer. T7 weakness: the SQLite DB's "canonical" status is accidentally dependent on Claude Code's 30-day JSONL retention — re-extract is only possible while JSONL still exists upstream. Same "right thing built, not wired" pattern.

### 14.D — Admin surface

Output: `docs/audits/2026-05-11-subagent-D-admin-surface.md`

**Load-bearing finding (high-confidence local):** `doctor` / `status` / `stats` each independently implement `checkHooksInstalled` (3 copies). `status` and `stats` duplicate the pending-session loop verbatim. All three emit the same "Run install" recommendation. The C3 fragmentation worry recurs in miniature inside the admin subsystem. Consolidation (not federation, not freeze, not deprecation) is the local remedy at this level.

### 14.5.1 Convergent theme across A-D (preliminary, for Stage 3 to weigh)

All four subagents independently arrived at variants of "right things present, not coherently wired" plus "the user's fragmentation worry recurs at both top-level and fractal-level." This convergence is itself evidence — Stage 0 anti-bias self-check held; subagents reading the truths landed on the user-worry fingerprint without being told to look for it.

Stage 1b and Stage 2 must pressure-test whether this convergence reflects (a) a real architectural pattern, (b) shared subagent reasoning bias on shared inputs, or (c) both. Stage 3 synthesis owns the final classification per §8.

## 14.5 Architecture-evidence map (Stage 1b)

Stage 1b executed 2026-05-13. Owner: main session (rationale recorded in evidence-map preamble — A-D outputs converged on themes; single voice synthesizes across them; a 5th parallel subagent would re-derive in isolation without seeing A-D).

Output: `docs/audits/2026-05-11-architecture-evidence-map.md` (1409 words, within §6.5 target of 1000-1500).

**Dimensions covered per §6.5:**
1. Storage model + source of truth (5 distinct canonicity stances — no unified SoT rule)
2. Memory taxonomy + lifecycle (only friction is first-class typed entity; supersedence absent — Phase 33-34 plans to add)
3. Capture-to-retrieval data flow (wiring gap: `LlmExtractor` and `HybridSearchService` exist but unwired from sync/context)
4. Consolidation, supersedence, deletion, export guarantees (supersedence absent at data layer; export round-trip partial)
5. AI-readability + no-tool recovery (friction is worst case — DB-locked, no plain-text persistence)
6. Cross-project + cross-machine boundary model (no remote sync; single-machine; Phase 36 planned migration not replication)
7. Doc/code/roadmap drift (friction/ambient/smart-context = 0 matches across `docs/01-VISION.md`, `04-ARCHITECTURE.md`, `05-IMPLEMENTATION.md`; canonical docs are v1.0-vintage)

**Cross-dimensional pattern surfaced (NOT a verdict):**

> "Capability infrastructure exists; capture/retrieval surfaces don't use it."

Six concrete instances cited. This is the user-worry fingerprint at architecture-evidence level. **The right things ARE built; they are not coherently wired through to the surfaces the user actually touches.**

The v4.0 roadmap (Phase 33-35) plans to close exactly these wiring gaps. Stage 3 must weigh whether Phase 33-35 close the gaps in the right shape (outcome A) or whether the gaps are structural enough that a different shape is required (outcomes C/E). Stage 2 adjacent-system research tests whether other systems face the same wiring gap or have closed it.

**Internal review only** per audit §11 — Stage 1b is NOT cross-AI reviewed. The internal-review discipline applied: each finding is evidence-cited per §8; inferences are labeled inline; cross-subsystem judgments are flagged for Stage 3 cross-check.

## 15. Adjacent-system research (Stage 2)

Stage 2 executed 2026-05-13. Main session owner per §5.2. Per-system summaries written independently against Stage 0 truths; no memory-nexus comparison inside any per-system writeup per §5.3. Cross-system + memory-nexus comparison happens in Stage 3 §17 matrix.

Evidence standard per §8: URLs + retrieval date 2026-05-13 captured in each per-system file. Inferences labeled inline. §5.1 MemPalace fallback NOT triggered — multiple stable references located.

### 15.A — Mem0

Output: `docs/audits/2026-05-11-system-A-mem0.md` (691 words)

**Distinctive primitives:** three parallel stores (vector + graph + key-value); 4-5 dim scope sharding (`user_id`, `agent_id`, `run_id`, `app_id`, optional `org_id`); LLM-driven extraction at write time with explicit Memory Compression Engine; conflict detector at graph layer for supersedence.

**Strong-fit truths:** T2 (semantic recall as headline), T4 (conflict detector + self-correction), T5 (SDK-first), T8 (graph-layer dedup), C1 (one SDK call).

**Gaps:** T7 weak (compression-engine lock-in), C2 partial (cloud-first), AI-readability low if Mem0 disappears.

### 15.B — OpenClaw

Output: `docs/audits/2026-05-11-system-B-openclaw.md` (728 words)

**Distinctive primitives:** markdown-as-canonical (8 specific filenames + daily logs); optional indexing tier (ClawMem: SQLite + sqlite-vec + FTS5); identity-first (SOUL.md read before MEMORY.md); search-first-not-dump; bootstrap caps (20k/file, 150k aggregate).

**Strong-fit truths:** T5 (workspace IS the agent), T7 (zero-cost recovery via plain markdown), C1 (agent writes markdown directly), C2 (filesystem-local).

**Gaps:** T1 partial (filename-conventional types, not enforced enum), T2 partial (boot or on-demand search; no ambient surfacing), T4 weak (manual curation only, no formal supersedence event), T8 weak (manual dedup).

### 15.C — Hermes Agent (Nous Research)

Output: `docs/audits/2026-05-11-system-C-hermes.md` (700 words)

**Distinctive primitives:** four-layer memory (built-in markdown + 8 external provider plugins + HRR holographic + FTS5); trust scoring as soft supersedence (weight decay); plugin-based provider architecture (Mem0, Hindsight, Honcho, OpenViking, RetainDB, ByteRover, Holographic, Supermemory).

**Strong-fit truths:** T1 via providers, T2 (multi-modal recall), T4 (trust scoring), T5 (memory IS the agent), T8 (trust scoring as soft dedup).

**Gaps:** C3 risk acknowledged — four-layer architecture IS fragmented by design (trade-off: capability vs surface coherence); T7 partial (built-in OK; providers vary).

### 15.D — MemPalace

Output: `docs/audits/2026-05-11-system-D-mempalace.md` (823 words)

**Distinctive primitives:** spatial metaphor (Wings / Rooms / Halls / Closets / Drawers); token-budgeted boot (~170 tokens at L0+L1, on-demand L2/L3); verbatim storage (no summarization at write); zero-LLM ingestion; temporal entity-relationship graph with validity windows for supersedence; 29 MCP tools.

**Strong-fit truths:** T2 (layered semantic + structured), T3 (Wings = project scope), T4 (validity windows), T6 (SQLite + L0-L3 layering), C1 (zero-LLM = deterministic + free), C2 (SQLite + offline), C3 (one framework, internally coherent).

**Gaps:** T1 partial (Halls type cross-Wing but no enforced per-chunk taxonomy), T7 partial (SQLite plain-readable; spatial schema framework-specific), C3 internal risk (29 MCP tools is itself a surface-choice burden for the agent).

### 15.E — Cross-system pattern (for Stage 3 to weigh)

All four systems independently address T4 (supersedence/lifecycle) and T8 (reconciliation) at the data layer — Mem0 via conflict detector, OpenClaw via manual curation, Hermes via trust scoring, MemPalace via temporal validity windows. **The 2026 state-of-the-art treats supersedence as a load-bearing primitive, not an afterthought.**

Two systems (OpenClaw, MemPalace) achieve C3 internally by being narrow surface frameworks. Two systems (Mem0, Hermes) take wider surface trade-offs — Mem0 by being cloud-first, Hermes by acknowledging four-layer fragmentation.

T7 (no-tool recovery) splits cleanly: OpenClaw best-in-class (plain markdown); MemPalace partial (SQLite readable, schema framework-specific); Mem0 weak (compression-engine lock-in); Hermes mixed (built-in tier OK, providers vary).

Stage 3 synthesis owns the comparison-to-memory-nexus.

## 16. Irreducible truths

### 16.0 Stage 0 provisional truths (GATE for Stage 1)

**Filled 2026-05-11 by main session, before any subagent spawn, before any adjacent-system research, without inspecting memory-nexus's schema or commands or current code.**

#### 16.0.1 Anti-anchoring self-check (verbatim, per §3.0)

> These truths were derived without inspecting memory-nexus's schema, commands, or current code, and without reading Hermes/OpenClaw/Mem0/MemPalace docs. Stage 1 and Stage 2 evidence may revise them; the revision must cite the disproving evidence.

I (main session) commit to that statement. The derivation below was performed by imagining the problem space from scratch with only the user worry (§0), the seed questions (§4.2), and general agent-memory requirements as input. Any phrase below that sounds like a description of memory-nexus is coincidence, not derivation.

#### 16.0.2 Design candidates considered (per §3.0 item 2)

Before settling on the provisional minimum structure, I considered five wildly different designs:

| # | Design | Storage shape | Retrieval | Failure mode | Scale |
|---|---|---|---|---|---|
| 1 | **Append-only event log** | JSONL files, date-prefixed | grep/scan | one corrupt line skipped | degrades >100k entries |
| 2 | **Schema-enforced DB** | Relational tables, FK-constrained | SQL | corrupted DB = data loss | fast to millions |
| 3 | **Knowledge graph** | Subject-predicate-object triples | Graph query | engine-dependent | engine-dependent |
| 4 | **Vector-only store** | Embeddings of every observation | similarity | lossy retrieval | degrades >1M |
| 5 | **Hybrid: event log SSOT + derived projection** | Append-only files (canonical) + DB/index (derived) | Read projection, write events | event corruption catastrophic; projection rebuildable | projections handle scale |

These are not exhaustive — file-only-by-project + symlinks, content-addressable store, distributed CRDT log, log-structured merge tree, etc. are also possible. The five above span the design space well enough to identify which structural properties matter.

#### 16.0.3 Provisional irreducible truths (8 items, derived independently)

**T1. Distinguish memory kinds.**
The system must distinguish distinct memory categories — decisions, learnings, preferences, friction, observations, episodes — and answer questions about each category separately. Not necessarily separate tables, but the recall surface must serve typed queries, not undifferentiated content dump.

**T2. Context-driven recall.**
Given current task context, the system must surface relevant prior memory without explicit user-typed query. Semantic similarity or equivalent — not just keyword match. The agent should not have to know what to search for.

**T3. Project scope + cross-project rollup.**
The user works across many projects. Some memory is project-specific ("we decided to use OAuth in this app"); some is cross-project ("user prefers terse commit messages globally"). Both must be queryable in their respective scopes, AND cross-project rollup must be possible without conflating scopes.

**T4. Lifecycle semantics.**
Facts change over time. Decisions get superseded. Friction gets resolved. Preferences evolve. The system must support invalidation / supersedence / temporal versioning — pure append-only without consolidation creates noise (old decisions return alongside current ones).

**T5. Agent integration is part of the system.**
A memory system the agent forgets to use is useless. There must be a mechanism for WHEN the agent queries memory — triggers, ambient context at session start, hooks on tool calls, or explicit query commands prompted by reasoning. The integration is not an afterthought; it is co-load-bearing with storage and recall.

**T6. Scale to 10k-100k+ entries.**
Cross-project accumulation reaches 10k-100k+ entries within a year of regular use. Retrieval must stay sub-second at that scale. This rules out plain text scans beyond a few thousand entries — indexing is required.

**T7. Self-evident recovery.**
If the tool dies, breaks, or is uninstalled, the user's accumulated knowledge must remain readable WITHOUT the tool. Either plain text (event log / JSONL / markdown) or a standardized exchange format (export-on-write, or scheduled snapshot). The user must not be locked in.

**T8. Reconciliation across concurrent sessions.**
Multiple Claude sessions in multiple projects can log overlapping observations. The system must dedupe or merge, not just accumulate duplicates. "Decided X" said in three sessions on the same day is one fact, not three.

#### 16.0.4 Constraints (qualities the system must have, distinct from truths)

These are not capabilities (verbs) — they're properties the system must hold:

- **C1. Low-friction capture.** Writing memory must be one tool call or auto-extracted. If logging takes effort, the agent won't do it consistently.
- **C2. Local-first storage.** The user's data does not require cloud sync. Local store, optional sync. (Inferred from the user's privacy/sovereignty stance per global rules.)
- **C3. The system must not itself become another fragmented surface.** This is THE user's worry rephrased. If the solution adds a new memory surface to the pile rather than consolidating the layer, it fails by the user's own measure.

#### 16.0.5 Provisional minimum structure

Evaluating the 5 design candidates against T1-T8 + C1-C3:

- **Candidate 1 (append-only event log alone):** fails T1 (no typed queries without parser), T2 (no semantic recall), T6 (scale degrades), T8 (no reconciliation primitive).
- **Candidate 2 (schema-enforced DB alone):** fails T7 (recovery requires SQL knowledge and schema awareness), T5 (no inherent integration story).
- **Candidate 3 (knowledge graph alone):** complex; T1-T8 are partially addressable but engine choice introduces lock-in conflict with T7.
- **Candidate 4 (vector-only):** fails T1 (no categorization), T4 (no supersedence), T7 (embedding-recovery requires the same embedding model).
- **Candidate 5 (hybrid event log + projection):** satisfies T1 (event types), T2 (projection includes vector index), T3 (project scope in event metadata), T4 (supersedence as event type), T5 (orthogonal to integration layer), T6 (projection scales), T7 (event log is the recovery layer), T8 (reconciliation as projection-build operation).

**Provisional minimum structure: Hybrid event-log SSOT + derived projection.**

- **Canonical layer:** append-only event log. Plain text (JSONL or similar). Each event has: type (decision / learning / preference / friction / observation / supersedence), project scope, timestamp, content, optional reference to prior event(s) it modifies.
- **Projection layer:** structured DB + vector index, rebuildable from event log on demand. Used for typed queries (T1), fast retrieval (T6), semantic recall (T2), dedup (T8). Projection corruption is non-catastrophic (rebuild).
- **Integration layer:** hooks that fire on session events, triggering auto-capture from session content AND ambient retrieval that surfaces relevant memory before the agent's own queries. (T5.)
- **Scope model:** project IS a first-class event field. Cross-project queries are projection-level operations (filter / rollup). (T3.)
- **Lifecycle:** supersedence is an event type, not a record-edit. Old facts remain in the event log; the projection's "current" view excludes superseded ones. (T4 + T7.)

This structure is provisional. Stage 1/2 evidence may surface load-bearing properties not captured here, or may show that T1-T8 are wrong or incomplete. Revisions in Stage 3 must cite the disproving evidence per §8.

#### 16.0.6 What the provisional structure deliberately does NOT specify

To preserve first-principles framing, the structure above is silent on:

- Storage tech (SQLite vs DuckDB vs Postgres vs SQLite-WASM vs raw files)
- Vector backend (sqlite-vec vs Faiss vs Chroma vs none-yet)
- Schema layer (per-event-type tables vs event-sourcing-replay vs JSON columns)
- Process model (CLI vs daemon vs library vs MCP server vs hybrid)
- Sync mechanism (none vs Git vs custom protocol vs CRDT)

These are implementation choices that the synthesis stage (§7) will compare against adjacent systems and current memory-nexus. None of them is a TRUTH; all are options within the provisional structure.

#### 16.0.7 Stage 1 spawn gate cleared

Stage 0 deliverable complete:
- ✅ Provisional truths (T1-T8) — 8 items
- ✅ Constraints (C1-C3) — 3 items
- ✅ Provisional minimum structure (hybrid event log + projection + integration)
- ✅ Design candidates considered (5 wildly different)
- ✅ Anti-anchoring self-check committed verbatim

Stage 1 (CLI subagents A-D + architecture-evidence pass) is now spawnable per §3 execution table.

### 16. Refined truths (after Stage 3)

*[To be filled per §7.1. Revisions from §16.0 must cite disproving evidence.]*

## 17. Comparison matrix

*[To be filled per §7.2 with the structure from §17 below.]*

For each refined truth in §16:

| Truth | Hermes | OpenClaw | Mem0 | MemPalace | memory-nexus (current) | Derived min-structure | Best fit? |
|---|---|---|---|---|---|---|---|

Each cell per §8 evidence standards.

## 18. Gap analysis

*[To be filled per §7.3. Each gap evidence-cited per §8.]*

## 19. Recommendation

*[To be filled per §7.4 against §9 decision thresholds. Single outcome from §2 with explicit rejection of the other 4.]*

## 20. Recommendation revisions from codex review #2

*[To be filled after codex review #2 returns.]*

## 21. Concrete next-phase plan

*[If recommendation is A/B/C/D: phase numbering, deps, acceptance. If E: migration timeline.]*
