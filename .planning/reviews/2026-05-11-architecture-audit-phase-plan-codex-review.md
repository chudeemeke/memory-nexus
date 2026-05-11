# Codex Review: Architecture First-Principles Audit Plan

**Date:** 2026-05-11
**Reviewer:** Codex (GPT-5.5)
**Artifact reviewed:** `docs/audits/2026-05-11-architecture-first-principles-audit.md` sections 3-9
**Verdict:** BLOCK until revisions below are integrated.

## Findings

### 1. The plan still derives truths too late

The stated method says to derive irreducible truths before comparing current memory-nexus or adjacent systems, but the execution order does the opposite: subagents first inspect current CLI namespaces, then adjacent-system research runs with memory-nexus behavior already in mind, and only then section 6.1 derives truths.

That is the central anchoring risk the plan claims to prevent. The fix is to add a Stage 0 before any command-surface subagent spawn:

1. Derive provisional irreducible truths from the user worry, original project goal, and general agent-memory requirements.
2. Derive a provisional minimum structure satisfying those truths.
3. Mark both as provisional and subject to revision only when evidence disproves them.
4. Only then run memory-nexus CLI verification and adjacent-system research.

Without this inversion, the command namespace becomes the hidden frame for the whole audit.

### 2. Adjacent-system research is intentionally memory-nexus-aware

Section 5.5 says sequential adjacent-system research should happen after the CLI subagents because it benefits from knowing what memory-nexus does. That is backwards for this audit. It makes Hermes/OpenClaw/Mem0/MemPalace serve as comparison fodder for memory-nexus rather than independent design stimuli.

Revise the plan so adjacent-system research is conducted against the Stage 0 truth set and research protocol, with no memory-nexus comparison during the per-system writeups. The comparison belongs in the synthesis matrix, not inside the source-system summaries.

### 3. CLI-surface subagents are useful but over-weighted

The four subagents verify command coherence, which is necessary evidence, but they do not cover the architecture question by themselves. A command can work end-to-end while the system is still the wrong shape.

Add one architecture-evidence pass owned by the main session or a fifth bounded verifier. It should inspect:

- Storage model and source of truth
- Memory taxonomy and lifecycle
- Capture-to-retrieval data flow
- Consolidation, supersedence, deletion, and export guarantees
- AI-readability and no-tool recovery
- Cross-project and cross-machine boundary model
- Where docs, code, and roadmap disagree

This pass should produce an evidence map, not a verdict.

### 4. The plan has an internal contradiction about reference-system subagents

Section 4.3 says "the audit's verification subagents" research each reference system. Section 5.5 says adjacent-system research is sequential and performed by the main session, not subagents. Pick one. The better choice is main-session research with strict source citations, because the cap on cross-AI review is already meant to avoid process theater.

### 5. Evidence standards are under-specified

The plan requires path/file claims to be verified, but the final audit needs a broader claim ledger. Add a compact evidence standard:

- Every matrix cell should cite either a local file/line, command output artifact, upstream source URL plus retrieval date, or explicit "not found in reviewed docs."
- Every gap should cite the evidence that proves it.
- Any unverified inference must be labeled as inference.

This matters because the recommendation will decide whether to keep investing in memory-nexus.

### 6. Outcome rubric lacks decision thresholds

The five outcomes are right, but the rubric is qualitative enough that the author can still steer it toward the prior. Add threshold language before recommendation:

- Number of high-severity truth gaps
- Whether gaps are closeable inside v4.0 without architecture churn
- Whether another system satisfies more load-bearing truths with lower migration cost
- Whether consolidation reduces surfaces or just hides fragmentation behind a router
- Whether v4.0 publishing would cement a wrong source of truth

These thresholds do not need fake numeric scoring, but they need explicit decision tests.

### 7. MemPalace is not pinned

MemPalace is listed as TBD. Before execution, define the exact target or define a fallback rule: if no stable project/documentation is found, record "no stable reference found" and do not invent a comparison row from secondary summaries.

### 8. Source-of-truth drift is already visible

The durable plan says the inbox item transitions to `in-progress` at kickoff, but the inbox file still says `status: in-progress` while its disposition text says TRIAGED. `.planning/STATE.md` says triaged will transition on first commit. The audit should not begin with state ambiguity.

Before spawning subagents, normalize the inbox/status wording or add a short "state reconciliation" entry explaining the chosen state.

## Required Plan Revisions

1. Add Stage 0: provisional truths and minimum structure before subagents or adjacent research.
2. Move adjacent-system research before memory-nexus comparison, or constrain it to independent per-system summaries with no incumbent comparison.
3. Add architecture-evidence pass beyond CLI command verification.
4. Fix the subagent/main-session contradiction for reference-system research.
5. Add evidence standards for matrix cells, gaps, and inferences.
6. Add decision thresholds for mapping evidence to A/B/C/D/E.
7. Pin MemPalace or define a no-stable-reference fallback.
8. Reconcile inbox/status wording before execution.

## Verdict

BLOCK for execution as written. The plan is strong on anti-bias language, but its sequencing still lets current memory-nexus shape drive the audit. Once the Stage 0 derivation, independent research boundary, evidence ledger, and state reconciliation are added, it is fit to execute.
