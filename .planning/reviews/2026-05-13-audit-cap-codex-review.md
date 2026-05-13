Reading additional input from stdin...
OpenAI Codex v0.130.0
--------
[1mworkdir:[0m C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus\.claude\worktrees\triage-2026-05-13b
[1mmodel:[0m gpt-5.5
[1mprovider:[0m openai
[1mapproval:[0m never
[1msandbox:[0m workspace-write [workdir, /tmp, $TMPDIR, C:\Users\Destiny\.codex\memories]
[1mreasoning effort:[0m high
[1mreasoning summaries:[0m none
[1msession id:[0m 019e2132-e3e3-7150-82e5-bc611d956127
--------
[36muser[0m
This is the memory-nexus first-principles architecture audit doc. Stages 0-3 are complete. Your job is audit-cap codex review #2 of section 19 (the DRAFT recommendation). Per section 11 of this audit, this is the SECOND of 2 cross-AI review calls permitted; section 19 locks after your review. Be adversarial. Focus your push-back on: (1) anti-A bias check — am I rationalizing the existing v4.0 plan rather than evaluating it? (2) Phase 32 rescope realism — is widening Phase 32 to include surface consolidation smuggling Outcome C under Outcome A hat? Should the recommendation split into A-prime + new Phase 32.5? (3) G3 closeability claim — is Phase 33-34 sufficient for true supersedence or only on-paper? (4) E migration cost claim — is the existing infrastructure (HybridSearchService, sqlite-vec, LlmExtractor) actually salvageable, or right-things-wrongly-wired where wiring alone will not fix? (5) C rejection sharpness — if v4.0 did not exist, would standalone-C still be wrong? (6) B under-weighted — Hermes is a federation system in production; did I dismiss B too quickly given memory-nexus already has fragmentation that consolidation may not close? (7) Phase 37 gating — does gating publish on Phase 33-35 effectively pause v4.0 indefinitely if those slip? (8) anti-anchoring check — what would the audit have to find for E to win? If almost nothing realistic, I have an anti-anchoring failure. (9) recommendation atomicity — is section 19 one recommendation or several (rescope + gating + doc-convention)? (10) blind spots not in the above. Return findings as numbered list with severity (BLOCK / HIGH / MEDIUM / LOW / NIT). End with verdict: BLOCK / PROCEED-WITH-CHANGES / PROCEED-AS-IS.

<stdin>
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

### 16. Refined truths (after Stage 3 — locked 2026-05-13)

Stage 1 (memory-nexus evidence) and Stage 2 (adjacent-system research) did NOT disprove any provisional truth in §16.0. T1-T8 and C1-C3 stand as written. The §16.0 derivation is therefore promoted to §16 as refined truths, unchanged.

**Reinforcement evidence (NOT revisions):**

- **T4 (lifecycle / supersedence)** is reinforced by Stage 2. All 4 adjacent systems (Mem0 conflict-detector, OpenClaw manual-curation-as-edit, Hermes trust-scoring, MemPalace temporal-validity-windows) have an explicit supersedence primitive. **The 2026 state-of-the-art treats supersedence as load-bearing**, not optional. memory-nexus has zero supersedence in production code (Stage 1b section 2 verified). Gap is critical.

- **T7 (self-evident recovery)** is reinforced as a spectrum, not a binary. OpenClaw best-in-class (markdown-as-canonical). MemPalace partial (SQLite + framework schema). Mem0 weak (compression-engine lock-in). Hermes mixed (built-in tier OK, provider-dependent). memory-nexus partial (sessions and memory_files yes, entities/topics/friction no). The truth holds; the metric is "what fraction of memory is recoverable without the tool."

- **C3 (not another fragmented surface)** is reinforced as a real engineering constraint, not just a user-worry rephrasing. OpenClaw and MemPalace satisfy C3 by being narrow-surface frameworks. Mem0 does not compose by design. Hermes explicitly accepts fragmentation as trade-off. memory-nexus Stage 1 evidence shows C3 violations at both top-level AND fractal-level — the worry is real and structural.

**No new truths surfaced by Stage 1/2.** The single-machine constraint flagged in Stage 1b section 6 is a feature-variant question across adjacent systems, not a universal truth. Stage 0 was correct to be silent on it.

**Anti-anchoring check (per section 3.0 self-check):** the Stage 0 truths derived without inspecting memory-nexus held up against memory-nexus inspection AND adjacent-system inspection. The framing discipline worked.

## 17. Comparison matrix

For each refined truth, row across the 6 reference points: Mem0 / OpenClaw / Hermes / MemPalace / **memory-nexus (current)** / **derived min-structure** (Stage 0 section 16.0.5: hybrid event-log SSOT + projection).

Cells use: **YES** (fully addressed), **PARTIAL** (partial), **NO** (not addressed). Citations are evidence-pointers; full evidence in Stage 1a/1b/2 output files.

| | Mem0 | OpenClaw | Hermes | MemPalace | memory-nexus | derived min-structure |
|---|---|---|---|---|---|---|
| **T1 typed kinds** | PARTIAL (entities typed; facts not enum-typed) | PARTIAL (filename-convention) | YES (via provider taxonomies) | PARTIAL (Halls cross-Wing typing) | **NO (only friction; Stage 1a-A)** | YES (event types: decision/learning/preference/friction/observation/supersedence) |
| **T2 context-driven recall** | YES (vector store) | PARTIAL (boot + on-demand search) | YES (mem0_search + holographic + FTS5) | YES (L0-L3 layered) | **NO in context cmd; YES in search only (Stage 1a-B)** | YES (projection has vector index; ambient retrieval at session-start) |
| **T3 project + cross-project** | YES (4-dim scope keys) | n/a (per-workspace) | PARTIAL (USER.md global; provider-dependent) | YES (Wings + Halls) | PARTIAL (flag-gated, not first-class scope; Stage 1a-B) | YES (project as first-class event field) |
| **T4 supersedence** | YES (conflict detector) | PARTIAL (manual curation only) | YES (trust-scoring decay) | YES (temporal validity windows) | **NO (zero in production code; Stage 1b section 2)** | YES (supersedence as event type) |
| **T5 agent integration** | YES (SDK-first) | YES (workspace IS the agent) | YES (memory IS the agent) | YES (29 MCP tools) | PARTIAL (sync hook exists; ambient surface not boot-injected; Stage 1a-B, 1b section 3) | YES (hooks fire on session events) |
| **T6 scale** | YES (claimed 100k+ per user) | PARTIAL (boot capped at 150k chars; indexed higher) | YES (provider-handled) | YES (SQLite + 96.6% search at scale claim) | YES (indexes per schema.ts:26-114; sub-second 100k plausible per Stage 1b inference) | YES (projection scales) |
| **T7 self-evident recovery** | NO (compression lock-in) | YES (markdown SoT) | PARTIAL (built-in OK; providers vary) | PARTIAL (SQLite readable; framework schema) | PARTIAL (sessions/memory_files OK; entities/topics/friction DB-locked; Stage 1b section 5) | YES (event log is plain text) |
| **T8 reconciliation** | YES (graph dedup) | PARTIAL (manual curation) | YES (trust scoring) | PARTIAL (verbatim — dedup at retrieval) | PARTIAL (no recall-time dedup; sync-stage unclear; Stage 1a-B) | YES (projection-build dedup) |
| **C1 low-friction capture** | YES | YES | YES | YES (zero-LLM) | PARTIAL (sync auto + friction one-call; extraction unwired per 1b section 3) | YES |
| **C2 local-first** | PARTIAL (cloud-first product) | YES | PARTIAL (built-in local; providers vary) | YES | YES | YES |
| **C3 no new fragmented surface** | n/a (single product) | YES (narrow framework) | risk (acknowledged trade-off) | YES (one framework, 1 schema) | **NO (Stage 1a A/B/C/D + 1b cross-dimensional pattern)** | YES (one event log + one projection + one integration layer) |

**Cells marked NO for memory-nexus identify load-bearing gaps. Cells marked PARTIAL identify partial gaps.**

## 18. Gap analysis

For each truth where memory-nexus differs from the derived min-structure OR from adjacent best practices, severity + closeability + cost:

| # | Gap | Severity | Closeable inside v4.0? | Cost to close | Cost to live with |
|---|---|---|---|---|---|
| G1 | T1: only friction is first-class typed entity. No decision/learning/preference/observation peers. | **HIGH** | YES — Phase 33 plans facts schema + extraction_log + temporal tracking | Med (schema + extractor + migration of existing data) | High — undifferentiated message-content blob means agent cannot ask typed questions. |
| G2 | T2: memory context has zero semantic-recall code paths despite HybridSearchService + sqlite-vec existing. | **HIGH** | YES — Phase 35 plans context rewire to fact tables + (implied) vector recall | Low (wiring change, no new infra) | High — the COMMAND named context does not deliver context; agent must know-what-to-search via search. |
| G3 | T4: zero supersedence in production code. | **CRITICAL** | YES — Phase 33 plans temporal tracking; Phase 34 plans ADD/UPDATE/DELETE/NOOP operations | Med-High (schema + service layer + UI for see-superseded mode) | Critical — old decisions return alongside current ones; agent cannot trust current state. |
| G4 | T7: entities/topics/friction are DB-locked; no plain-text counterpart for those kinds | MEDIUM | PARTIAL — memory export snapshots, but Phase 33 extraction_log adds another DB-only stream | Low-Med (export-on-write hooks or scheduled snapshot) | Med — user keeps source markdown + sessions; loses derived facts on uninstall. |
| G5 | T8: no recall-time dedup; sync-stage dedup unclear. LlmExtractor exists but unwired (Stage 1b section 3). | MED-HIGH | YES — wiring LlmExtractor into sync + Phase 34 DELETE/NOOP semantics close this | Low (wiring) — infra already exists | Med — duplicate decided-X entries across sessions return as separate facts. |
| G6 | C3 (top-level): friction is parallel journal, not event-stream row. ~/.memory/ is parallel surface; ROADMAP Phase 35 plans to deprecate ~/.memory/ — confirms intent. | **HIGH** | YES — Phase 35 deprecates ~/.memory/; ambient context becomes the projection-view, not parallel write | Med (data migration + service redirect) | High — IS the user worry verbatim. |
| G7 | C3 (fractal): admin subsystem fragmentation (doctor/status/stats triplicate per Stage 1a-D); read-surface fragmentation (5 parallel surfaces per Stage 1a-B). | MEDIUM | YES BUT — Phase 32 currently scoped to labeled help groups, not consolidation. **Phase 32 rescope needed.** | Low (consolidation; no new infra) | Med — recurring fragmentation noise inside the surface. |
| G8 | Doc/code/roadmap drift: friction/ambient/smart-context = 0 matches in canonical docs (Stage 1b section 7). | LOW (org) | YES — docs update during Phase 32-37 cycle | Trivial (doc writes) | Low — but compounds developer confusion; the docs say v1.0 vision. |

**Cumulative: 8 gaps. 3 HIGH+, 3 MEDIUM-HIGH/MEDIUM, 1 LOW. Per section 9 decision threshold #1, 3 HIGH-severity truth gaps (G1/G2/G3) is below the >50% threshold (3 of 8 = 38%). Threshold test does NOT force shift away from A.**

Per section 9 decision threshold #2 (closeability inside v4.0): every HIGH gap maps to a planned v4.0 phase. **The v4.0 roadmap is the right shape for the gaps Stage 1/2 surfaced.**

Per section 9 decision threshold #4 (consolidation surface reduction): G6 and G7 require consolidation, which Phase 35 partly handles (~/.memory/ deprecation). **Phase 32 RESCOPE from labeled help groups to labeled help groups plus surface consolidation is the missing piece.**

Per section 9 decision threshold #5 (v4.0 publishing risk): shipping Phase 37 BEFORE Phase 33-35 would cement the wrong SoT. Shipping Phase 37 AFTER Phase 33-35 closes the gaps and is safe. **Phase 37 must NOT ship before 33-35.**

## 19. Recommendation (DRAFT — pending audit-cap codex review #2)

**Recommended outcome: A (Continue v4.0) with Phase 32 rescope.**

### Specifics

1. **Continue v4.0 (Phases 31-37) as the path.** Do not abandon. Do not federate. Do not freeze.

2. **Phase 32 rescope (required).** Current scope: labeled help groups, uniform --json and --format flags. Expand to: labeled help groups + uniform flags + **surface consolidation pass** addressing the fractal C3 violations (G7) — merge doctor/status/stats into a single health surface with detail-flag selection; unify the read surfaces (search/context/related/list/show) behind one query primitive with shape flags per Stage 1a-B recommendation; document the unified surface in docs/04-ARCHITECTURE.md.

3. **Execute Phase 33-34 faithfully.** Typed events + supersedence + temporal tracking + ADD/UPDATE/DELETE/NOOP semantics. These close G1, G3, G5.

4. **Execute Phase 35 with the right framing.** Rewire SmartContextService to read from fact tables AND wire HybridSearch into the memory context command, so the command named context delivers semantic + structured context, not SQL aggregation only. Phase 35 also deprecates ~/.memory/ per current roadmap (closes G6).

5. **Phase 36 (Portability) as planned.** Cross-machine sync remains out of scope per Stage 0; this is acceptable.

6. **Phase 37 (Publishing) gated.** Do NOT publish until Phase 33-35 land. Gating prevents G3 (critical supersedence absence) from cementing as published v4.0 behavior.

7. **Doc drift closure (G8).** During Phase 32-37, every phase commits a corresponding update to docs/01-VISION.md, 04-ARCHITECTURE.md, 05-IMPLEMENTATION.md. Convention: no Phase merges without docs-update commit.

8. **Cross-cutting workstream — audit-output integration.** The 4 subagent outputs + architecture-evidence map + 4 adjacent-system summaries are kept as docs/audits/2026-05-11-*.md. Phase 33-37 PLAN.md files cite the relevant gap (G1-G8) as the requirement source.

### Rejection rationale for B, C, D, E

**B (Scope v5.0 federation):** REJECTED. Federation across already-fragmented surfaces compounds the worry (section 10 prior held this concern; Stage 1 evidence confirmed C3 violations at both top and fractal level). Federation would add a router OVER fragmentation, not consolidate it. Mem0/Hermes evidence shows federation is a wider-surface trade-off, not a narrower one.

**C (Surgical consolidation alone):** REJECTED as standalone. Consolidation is the RIGHT move at the surface layer (Phase 32 rescope absorbs this) BUT does not close G1 (T1 typing), G3 (T4 supersedence), G5 (T8 reconciliation). These require Phase 33-34 infrastructure. Standalone-C leaves the critical-severity gap (G3) open. **Outcome A + Phase 32 rescope is functionally C-built-into-A; standalone-C is incomplete.**

**D (Freeze at v4.0):** REJECTED. Would cement G3 (critical) — supersedence absent in published shape. T2 (G2) memory context would publish without semantic recall. Worst outcome relative to user worry.

**E (Deprecate / replace):** REJECTED. Migration cost ~ rewrite cost; existing infrastructure (HybridSearchService, sqlite-vec, LlmExtractor, AmbientContextService, friction subsystem) would be discarded despite being directionally correct (Stage 1b cross-dimensional pattern: right things built, not wired through). The investment recovers value through Phase 33-35 wiring, not through replacement.

### Prior reconciliation (per section 10)

Section 10 prior was C (surgical consolidation). Actual recommendation is **A with Phase 32 rescope**. Per ~/.claude/rules/actions-not-promises.md mid-session-surprise broadening: name the wrong prediction.

> Wrong prediction: standalone-C would close the user worry.
> Reality: standalone-C closes the surface fragmentation but leaves G1/G3/G5 (typed events, supersedence, reconciliation) open. The v4.0 plan Phase 33-34 are THE primitives the adjacent 2026 state-of-the-art treats as load-bearing. Standalone-C without Phase 33-34 would publish a memory-nexus that is clean on the surface but still structurally behind the 2026 baseline.
>
> The prior under-weighted that v4.0 plan was already directionally correct on the structural gaps. Stage 2 evidence — every 2026 system has explicit supersedence — was the disproving evidence the section 10 prior did not have access to.

This is a planned outcome under section 10 discipline: if it lands on anything else, that surprise is recorded as learning signal.

### Status

**DRAFT.** Section 11 hard-gates the final lock on codex review #2 (audit-cap call). Codex re-auth required. After codex review, integrate pushback into section 20, then lock section 19.

## 20. Recommendation revisions from codex review #2

*[To be filled after codex review #2 returns.]*

## 21. Concrete next-phase plan

*[If recommendation is A/B/C/D: phase numbering, deps, acceptance. If E: migration timeline.]*
</stdin>
[2m2026-05-13T11:57:28.853411Z[0m [31mERROR[0m [2mrmcp::transport::worker[0m[2m:[0m worker quit with fatal: Transport channel closed, when Auth(TokenRefreshFailed("Server returned error response: invalid_grant: Invalid refresh token"))
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
I’ll treat this as the second capped recommendation review, not as implementation. I’m doing a quick memory pass for the memory-nexus audit context, then I’ll return only findings and a verdict.
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n \"memory-nexus|test-isolation|external-review|codex review|Phase 32|architecture audit\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md"[0m in C:\Projects\memory-nexus
[32m succeeded in 10156ms:[0m
102:- aidev release minor, scripts/release-manager.sh, run_strategy_bash_suite, wait pid, buffered output, temp file, tests/run-all-tests.sh, first principles, codex review, timeout ceiling
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
873:- The working external-review invocation was `cat prompt | codex exec --skip-git-repo-check -c 'model=\"gpt-5.4\"' -c 'reasoning.effort=\"high\"' -`; `-p` was the wrong flag shape. [Task 2]
880:- Symptom: an external-review CLI invocation fails or silently uses the wrong mode. Cause: flag semantics were assumed. Fix: check help and pass the prompt on stdin with explicit model/reasoning settings. [Task 2]

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md | Select-Object -Index 156..190"[0m in C:\Projects\memory-nexus
[2m2026-05-13T12:00:57.383008Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mExit code: 1
Wall time: 12.9 seconds
Output:
Get-Content : Cannot find path 'C:\Users\Destiny\.codex\skills\.system\doc-methodology\SKILL.md' because it does not 
exist.
At line:2 char:1
+ Get-Content C:\Users\Destiny\.codex\skills\.system\doc-methodology\SK ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\Users\Destin...dology\SKILL.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

[2m2026-05-13T12:01:06.462681Z[0m [31mERROR[0m [2mcodex_core::exec[0m[2m:[0m exec error: windows sandbox: timed out after 15000ms waiting for runner spawn_ready
[31m exited -1 in 0ms:[0m
execution error: Io(Custom { kind: Other, error: "windows sandbox: timed out after 15000ms waiting for runner spawn_ready" })
[2m2026-05-13T12:01:06.561534Z[0m [31mERROR[0m [2mcodex_core::tools::router[0m[2m:[0m [3merror[0m[2m=[0mexecution error: Io(Custom { kind: Other, error: "windows sandbox: timed out after 15000ms waiting for runner spawn_ready" })
[35m[3mcodex[0m[0m
The memory hit is only process context: this repo has a standing external-review gate and full-suite truth matters. I’m checking the nearby lines so the final memory citation can be precise, then I’ll stay inside the provided audit text.
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 4 \"external-review gatekeeping|mandatory external review|full-suite truth|Full-suite truth\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md"[0m in C:\Projects\memory-nexus
[32m succeeded in 9146ms:[0m
153-- Symptom: alias resets get blamed on iCloud sync. Cause: the working tree actually held a stripped fixture copy left by killed tests. Fix: compare HEAD vs working tree before anchoring on sync-conflict theories. [Task 2]
154-- Symptom: command/help audits produce partial fixes but runtime still drifts. Cause: help text, registry state, and shell implementations diverge. Fix: verify advertised commands from the terminal and filter/manual-only commands out of help if they are not user-callable. [Task 3]
155-- Symptom: large test redesign plans preserve the original bug. Cause: the first architecture pass is too soft on legacy defaults or hides tier logic. Fix: surface the real baseline/default rules, inventory orphaned buckets, and move to an explicit config model with migration. [Task 4]
156-
157:# Task Group: memory-nexus test-isolation cleanup and external-review gatekeeping
158:scope: Use when test pollution, module-level seams, or architectural cleanup in `memory-nexus` need a staged refactor with a static gate and mandatory external review.
159-applies_to: cwd=C:\Projects\memory-nexus; reuse_rule=Safe to reuse for this checkout and similar Bun/CLI cleanup work; exact file names and counts are repo-specific.
160-
161-## Task 1: Long-running test-isolation cleanup removed first-party pollution and reduced the remaining seam to `paths.ts`, success
162-

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m
[1mhook:[0m [2mPreToolUse[0m Completed
[1mhook:[0m [2mPreToolUse[0m Completed
[35m[3mexec[0m[0m
[1m"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -C 3 \"Full-suite truth|full-suite|external review|review-before-execution|codifies the review\" C:\\Users\\Destiny\\.codex\\memories\\MEMORY.md"[0m in C:\Projects\memory-nexus
[32m succeeded in 8212ms:[0m
155-- Symptom: large test redesign plans preserve the original bug. Cause: the first architecture pass is too soft on legacy defaults or hides tier logic. Fix: surface the real baseline/default rules, inventory orphaned buckets, and move to an explicit config model with migration. [Task 4]
156-
157-# Task Group: memory-nexus test-isolation cleanup and external-review gatekeeping
158:scope: Use when test pollution, module-level seams, or architectural cleanup in `memory-nexus` need a staged refactor with a static gate and mandatory external review.
159-applies_to: cwd=C:\Projects\memory-nexus; reuse_rule=Safe to reuse for this checkout and similar Bun/CLI cleanup work; exact file names and counts are repo-specific.
160-
161-## Task 1: Long-running test-isolation cleanup removed first-party pollution and reduced the remaining seam to `paths.ts`, success
--
173-
174-### rollout_summary_files
175-
176:- rollout_summaries/2026-05-10T13-26-54-Z8cx-memory_nexus_test_isolation_codex_review_preference.md (cwd=\\?\C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus, rollout_path=C:\Users\Destiny\.codex\sessions\2026\05\10\rollout-2026-05-10T14-26-54-019e1211-c311-79d2-ab5c-90d0070898b1.jsonl, updated_at=2026-05-10T13:26:54+00:00, thread_id=019e1211-c311-79d2-ab5c-90d0070898b1, codifies the review-before-execution requirement)
177-
178-### keywords
179-
--
190-- `scripts/check-test-isolation.ts` is the authoritative static gate: it bans module-level mutable test seams and first-party `mock.module()` pollution, and the safe migration pattern is env/deps support first, test migration second, seam deletion last. [Task 1]
191-- Full-suite runs matter more than isolated-file green runs in this repo because Bun module mocks can leak across files; the cleanup only really proved out when the suite stayed green and the static violations collapsed toward `paths.ts`. [Task 1]
192-- The preferred seam shape is `executeXCommand(options, deps = createDefaultCommandDeps())`, not ad hoc `options.dbPath` or module-state test overrides. [Task 1]
193:- For this project, the external review path was a markdown plan piped to `codex exec -`; the user wants the first-principles framing included in that review payload, not just the implementation checklist. [Task 2]
194-
195-## Failures and how to do differently
196-

[1mhook:[0m [2mPostToolUse[0m
[1mhook:[0m [2mPostToolUse[0m Completed
[35m[3mcodex[0m[0m
1. **BLOCK — Section 19 is not one recommendation.** It is Outcome A plus Phase 32 rescope, publication gating, docs gating, and audit-output integration. That violates the audit’s own “exactly one of 5 outcomes” discipline unless you rename it honestly as **A-prime** or add a sixth hybrid outcome.

2. **BLOCK — Phase 32 rescope is smuggling Outcome C under Outcome A.** “Unify read surfaces” and “merge doctor/status/stats into one health surface” is surgical consolidation. That may be correct, but it is not ordinary “continue v4.0.” I would split this into **A-prime: continue v4.0 structural phases** plus **Phase 32.5: surface consolidation**, unless you can prove Phase 32 stays small.

3. **HIGH — The recommendation does not enforce the Stage 0 minimum structure.** §16.0.5 says canonical event-log SSOT plus derived projection. §19 talks about fact tables, extraction logs, and context rewiring, but does not require plain-text canonical events. That is the biggest anti-A smell: you derived event-log SSOT, then accepted DB-first v4.0 because the roadmap already exists.

4. **HIGH — G3 closeability is overclaimed.** Phase 33-34 can introduce supersedence primitives, but “true supersedence” also requires migration of old facts, current-vs-superseded retrieval semantics, conflict rules, export behavior, user-visible inspection, and tests proving stale decisions do not return as current context. As written, Phase 33-34 could satisfy G3 on paper only.

5. **HIGH — E rejection is under-evidenced.** “Migration cost ~ rewrite cost” is asserted, not demonstrated. Existing components being “directionally correct” does not prove salvageability; they may be right-things-wrongly-wired or wrong-abstraction-wrong-boundary. E needs a real cost model.

6. **HIGH — Anti-A bias remains live.** The decisive argument is “every high gap maps to a planned v4.0 phase.” That is roadmap fit, not architecture fit. A biased audit can always say “the existing plan already planned to fix that.” You need acceptance gates that prove the phases actually converge on the derived minimum structure.

7. **MEDIUM — Standalone C is rejected too narrowly.** You define C as surface cleanup only, then reject it for not solving typing/supersedence/reconciliation. But if v4.0 did not exist, a standalone-C plan could consolidate around typed event-log SSOT and include supersedence. The fair comparison is C-as-architecture-consolidation, not C-as-CLI-tidying.

8. **MEDIUM — B may be dismissed too quickly.** Hermes shows federation is a serious production pattern, not just a router smell. If memory-nexus must coexist with rules, markdown memory files, session logs, docs/inbox, and cross-project surfaces that cannot realistically be collapsed, then B or B-lite may be the honest model after consolidation.

9. **MEDIUM — Phase 37 gating is correct but too blunt.** “Do not publish until 33-35 land” protects users, but it can also pause v4.0 indefinitely. Better: gate public claims and default behavior on 33-35, while allowing internal prerelease publishing or feature-flagged packages that do not advertise supersedence/context guarantees.

10. **MEDIUM — The audit lacks an E-win test.** Add a paragraph: E wins if HybridSearch cannot support typed current-fact recall, LlmExtractor cannot produce reliable event operations, existing DB schemas resist event-log SSOT migration, or an adjacent system satisfies T1/T4/T7 with lower migration plus integration cost. If no realistic evidence could make E win, the audit is anchored.

11. **MEDIUM — T7 is still underweighted.** Phase 33 may make recovery worse by adding more DB-only derived facts. If A-prime proceeds, every new typed memory should have plain-text canonical representation or export-on-write before it becomes default.

12. **LOW — The docs convention is useful but should not be framed as peer to the architecture decision.** “No phase merges without docs-update commit” is a delivery control, not part of the outcome recommendation. Keep it in §21 acceptance criteria, not as core §19 rationale.

**Verdict: BLOCK.** Not because A-prime is wrong, but because §19 as written is too favorable to the existing v4.0 plan, under-specifies the event-log SSOT requirement, and hides consolidation inside “continue v4.0.” Locking it now would preserve exactly the ambiguity this audit was created to resolve.


[1mhook:[0m [2mStop[0m
[1mhook:[0m [2mStop[0m
[1mhook:[0m [2mStop[0m Completed
[1mhook:[0m [2mStop[0m Failed
[2mtokens used[0m
47,805
1. **BLOCK — Section 19 is not one recommendation.** It is Outcome A plus Phase 32 rescope, publication gating, docs gating, and audit-output integration. That violates the audit’s own “exactly one of 5 outcomes” discipline unless you rename it honestly as **A-prime** or add a sixth hybrid outcome.

2. **BLOCK — Phase 32 rescope is smuggling Outcome C under Outcome A.** “Unify read surfaces” and “merge doctor/status/stats into one health surface” is surgical consolidation. That may be correct, but it is not ordinary “continue v4.0.” I would split this into **A-prime: continue v4.0 structural phases** plus **Phase 32.5: surface consolidation**, unless you can prove Phase 32 stays small.

3. **HIGH — The recommendation does not enforce the Stage 0 minimum structure.** §16.0.5 says canonical event-log SSOT plus derived projection. §19 talks about fact tables, extraction logs, and context rewiring, but does not require plain-text canonical events. That is the biggest anti-A smell: you derived event-log SSOT, then accepted DB-first v4.0 because the roadmap already exists.

4. **HIGH — G3 closeability is overclaimed.** Phase 33-34 can introduce supersedence primitives, but “true supersedence” also requires migration of old facts, current-vs-superseded retrieval semantics, conflict rules, export behavior, user-visible inspection, and tests proving stale decisions do not return as current context. As written, Phase 33-34 could satisfy G3 on paper only.

5. **HIGH — E rejection is under-evidenced.** “Migration cost ~ rewrite cost” is asserted, not demonstrated. Existing components being “directionally correct” does not prove salvageability; they may be right-things-wrongly-wired or wrong-abstraction-wrong-boundary. E needs a real cost model.

6. **HIGH — Anti-A bias remains live.** The decisive argument is “every high gap maps to a planned v4.0 phase.” That is roadmap fit, not architecture fit. A biased audit can always say “the existing plan already planned to fix that.” You need acceptance gates that prove the phases actually converge on the derived minimum structure.

7. **MEDIUM — Standalone C is rejected too narrowly.** You define C as surface cleanup only, then reject it for not solving typing/supersedence/reconciliation. But if v4.0 did not exist, a standalone-C plan could consolidate around typed event-log SSOT and include supersedence. The fair comparison is C-as-architecture-consolidation, not C-as-CLI-tidying.

8. **MEDIUM — B may be dismissed too quickly.** Hermes shows federation is a serious production pattern, not just a router smell. If memory-nexus must coexist with rules, markdown memory files, session logs, docs/inbox, and cross-project surfaces that cannot realistically be collapsed, then B or B-lite may be the honest model after consolidation.

9. **MEDIUM — Phase 37 gating is correct but too blunt.** “Do not publish until 33-35 land” protects users, but it can also pause v4.0 indefinitely. Better: gate public claims and default behavior on 33-35, while allowing internal prerelease publishing or feature-flagged packages that do not advertise supersedence/context guarantees.

10. **MEDIUM — The audit lacks an E-win test.** Add a paragraph: E wins if HybridSearch cannot support typed current-fact recall, LlmExtractor cannot produce reliable event operations, existing DB schemas resist event-log SSOT migration, or an adjacent system satisfies T1/T4/T7 with lower migration plus integration cost. If no realistic evidence could make E win, the audit is anchored.

11. **MEDIUM — T7 is still underweighted.** Phase 33 may make recovery worse by adding more DB-only derived facts. If A-prime proceeds, every new typed memory should have plain-text canonical representation or export-on-write before it becomes default.

12. **LOW — The docs convention is useful but should not be framed as peer to the architecture decision.** “No phase merges without docs-update commit” is a delivery control, not part of the outcome recommendation. Keep it in §21 acceptance criteria, not as core §19 rationale.

**Verdict: BLOCK.** Not because A-prime is wrong, but because §19 as written is too favorable to the existing v4.0 plan, under-specifies the event-log SSOT requirement, and hides consolidation inside “continue v4.0.” Locking it now would preserve exactly the ambiguity this audit was created to resolve.


