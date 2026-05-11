---
schema_version: "1.2"
source_project: conversations
created: 2026-05-08
type: enhancement
severity: medium
fix_status: merged
affects_scope: this-project-only
status: merged
triaged_at: 2026-05-11
resolved_at: 2026-05-11
closure_notify_to: conversations
closure_notify_reason: Decision determines whether the held-in-memory friction-primacy proposal in conversations gets closed (status quo accepted) or implemented as a memory-nexus phase. Either resolution closes a pending architectural item.
---

# Decide friction-primacy: status quo (DB canonical, JSONL transient) vs flip (JSONL canonical, DB derived)

## Motivation

Surfaced via the conversations memory architecture inventory at `~/Projects/conversations/docs/research/2026-05-08-memory-architecture-inventory.md`. Today's reality (verified 2026-05-08): memory-nexus DB is canonical for friction; `~/.claude/friction.jsonl` is a transient ingestion landing pad — written manually, ingested + deleted by the next `memory friction *` invocation. System works as designed.

The held-in-memory proposal at `~/.claude/projects/C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-conversations/memory/friction_primacy_flip_pending.md` (created 2026-05-05) asks whether to flip primacy: make JSONL the permanent SSOT and DB a derived query cache.

This was held in conversations memory until memory-nexus opted into the cross-project-issues inbox convention. Memory-nexus completed opt-in 2026-05-08 (this directory's README.md). Filing now.

## Proposal

Three options:

1. **Status quo.** JSONL stays transient. Update `~/.claude/rules/tool-friction.md` to describe the transient-landing-pad pattern explicitly (rather than calling JSONL a "fallback" — which has caused two correction layers in the conversations inventory). Close the conversations memory file as resolved.

2. **Flip primacy** (the held-in-memory proposal). JSONL becomes permanent + append-only. DB becomes derived. Required memory-nexus changes:
   - `memory friction log` writes JSONL first, DB second; DB write failure non-blocking
   - `memory friction reindex` rebuilds DB from JSONL on demand or schedule
   - One-time migration: existing DB-only entries dumped to JSONL
   - `tool-friction.md` rule updated: "JSONL is canonical; DB is a query cache"

   Why-list (from the proposal): robustness (JSONL append-only survives partial writes); AI-model-first (markdown/JSONL readable by any future model with zero tooling); schema-break safety (no DB migration risk); crash resilience (one bad line skipped, rest parseable); mimicry of `memory sync`'s own pattern (already pulls Claude Code session JSONLs as canonical).

3. **Defer.** Re-evaluate at next coherence audit if friction tracking starts breaking in ways JSONL-canonical would prevent.

## Alternatives considered

- **Build the JSONL writer ad-hoc in conversations side.** Rejected — this is memory-nexus's concern; cross-project workaround would be hidden debt.
- **Hybrid (write both, but DB authoritative on read conflict).** Rejected as added complexity without clear win.

## Open questions

- Does memory-nexus's v4.0 knowledge-extraction path (Phase 33-35 ADD/UPDATE/DELETE/NOOP) interact with friction storage? Should friction extraction be unified with that pipeline?
- If we flip, what happens to `memory friction dashboard` rendering — does it read from JSONL directly or via reindex'd DB?
- Does the flip break the existing `friction_pattern_detected` condition checker in `~/Projects/conversations/data/adapters/FileReminderStore.js`? (It currently reads JSONL directly; would still work post-flip.)

## Test plan

For option 2 (flip):
- New unit test: `memory friction log` writes JSONL atomically (line append, no partial state)
- New unit test: `memory friction reindex` rebuilds DB from JSONL with byte-equivalent results
- Migration test: existing DB-only entries roundtrip through JSONL → DB without loss
- E2E test: `friction_pattern_detected` reminder check still fires correctly post-flip

## Suggested commit message (option 2 path)

```
feat(friction): flip primacy — JSONL canonical, DB derived

- Write path: JSONL first (atomic append), DB second (best-effort)
- Read path: unchanged at first; DB stays consistent post-write
- New: `memory friction reindex` rebuilds DB from JSONL
- Migration: one-time DB → JSONL dump for legacy entries
- Updates ~/.claude/rules/tool-friction.md to reflect new primacy

Resolves: ~/Projects/conversations/docs/inbox/2026-05-08-conversations-friction-primacy-decision.md
Closes: friction_primacy_flip_pending.md (conversations memory)
```

## Risks / things to verify before merging

- Backward compat: existing scripts that call `memory friction list` keep working
- JSONL file growth: append-only means it grows unbounded; need rotation policy
- Concurrent writes: two sessions logging friction simultaneously must not corrupt JSONL (file locking? line-atomic write semantics?)
- Reindex performance: if DB reaches 10k+ entries, reindex from JSONL must be reasonable

## Related

- **Source doc:** `~/Projects/conversations/docs/research/2026-05-08-memory-architecture-inventory.md` §6.1 + §8.1
- **Held-in-memory proposal:** `~/.claude/projects/C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-conversations/memory/friction_primacy_flip_pending.md`
- **Rule documenting current behavior:** `~/.claude/rules/tool-friction.md`
- **Companion prompt (broader scope):** `2026-05-08-conversations-first-principles-architecture-audit.md` — this friction decision can ship before the larger audit.

---

## Disposition (2026-05-11) — MERGED

**Decision: Option 1 — Status quo (DB canonical, JSONL transient ingestion channel).** No code change ships. The "flip primacy" proposal (Option 2) is rejected. Documentation in `~/.claude/rules/tool-friction.md` updated to remove confusion source.

**Codex-reviewed** via `~/Projects/memory-nexus/.planning/reviews/2026-05-11-friction-primacy-disposition-codex-review.md` (gpt-5.5 high). Eight pushbacks integrated below.

### What was rejected and why

The "flip primacy to JSONL" proposal was rejected on **cost/benefit grounds**, not feasibility. The proposal's why-list (robustness via append-only, AI-first readability, schema-break safety, crash resilience, mimicry of `memory sync`) describes real properties, but each is either already addressed by simpler means or doesn't justify the cost of a second storage discipline for an auxiliary signal:

- **AI-first readability:** Acknowledged honestly — the current hybrid writes go STRAIGHT to SQLite, not through JSONL. JSONL is only on the manual-entry path for sessions without the CLI installed. Future-model readability is covered by the existing `memory export` command and (if needed later) a periodic snapshot job — NOT by inverting storage primacy.
- **Concurrent-write robustness:** A lockfile library (e.g., `proper-lockfile`) would make JSONL-canonical workable on POSIX and Windows. The stronger objection is the **cost/benefit failure**: JSONL-canonical introduces a second storage discipline, replay/reindex semantics, corruption handling, file-lock behavior, and DB-projection consistency — all for a low-volume auxiliary signal (~10 open entries today, single-digit growth rate).
- **Schema-break safety:** Real, not fake. JSONL would reduce migration blast radius for stored raw events. However, friction has a small, stable shape today. If schema churn becomes a recurring concern, the correct response is a versioned event export OR a unified event-log/projection architecture across facts + decisions + learnings + friction — NOT ad-hoc flipping of one leaf subsystem.
- **Crash resilience:** SQLite WAL mode plus the project's existing `health-checker` paths handle this layer.
- **Mimicry of `memory sync`'s pattern:** `memory sync` treats Claude Code session JSONLs as canonical because they ARE — Claude Code writes them as its own SSOT. Memory-nexus is downstream of that source. Friction is different: memory-nexus IS the source. Inventing a JSONL SSOT here is not mimicry; it's invention.

### What changed (doc + cross-repo)

1. **`~/.claude/rules/tool-friction.md`** updated:
   - "Fallback (until `memory friction` is published)" → "Manual-entry channel (when `memory friction` is not installed)" — reflects the fact that the CLI HAS shipped.
   - Auto-ingest section now states "JSONL is the un-ingested backlog, not a durable store" and cites the verified implementation at `friction-service.ts:222-260` and `friction/index.ts:124`.
   - Auto-ingest language changed from "should first check" to "first auto-ingests" (the implementation exists).
   - New "Architectural primacy" paragraph documenting this decision.
   - New "Implication for `friction_pattern_detected`" paragraph (see next item).

2. **`friction_pattern_detected` reminder semantics clarified** (highest-risk omission codex flagged):
   The conversations `~/Projects/conversations/data/adapters/FileReminderStore.js` registers a `friction_pattern_detected` condition checker that scans `~/.claude/friction.jsonl` directly. Given JSONL's transient nature, that checker only sees un-ingested backlog entries — NOT the canonical DB. The rule update documents this explicitly so future readers don't assume JSONL is a durable pattern source. If a reminder needs to watch durable friction signal, it should query the DB (e.g., via `memory friction patterns --threshold 3 --since <date>`) rather than scanning JSONL.

### v4.0 caveat (forward-looking, NOT in scope here)

If memory-nexus's v4.0 knowledge-extraction pipeline (Phase 33-35 ADD/UPDATE/DELETE/NOOP) evolves into a general event-log/projection architecture for facts + decisions + learnings, friction can be reconsidered as one event stream under that unified design. This avoids prematurely creating a special-purpose friction event store now. Recorded as forward-looking note; no commitment.

### Conversations-side closure

This disposition closes the held-in-memory proposal at `~/.claude/projects/C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-conversations/memory/friction_primacy_flip_pending.md`. The closure-notify counter-notification will be filed in `~/Projects/conversations/docs/inbox/` per the v1.2 closure-notify protocol.

### Status field semantics

Following codex's pushback #4: the inbox item title is "Decide friction-primacy: status quo vs flip" — a DECISION. The decision was made, with an accepted doc-update outcome and a closure-notify. So `status: merged` is correct (decision merged), with "rejected JSONL-canonical flip" stated in the body. `status: rejected` would only apply if the inbox item were narrowly "flip primacy to JSONL."

### Cross-repo doc update applied

`~/.claude/rules/tool-friction.md` is outside the memory-nexus repo. The update was applied as part of this triage because the rule's wording IS the confusion source the inventory identified. Verified the edits land in the global rules directory before marking this as merged.
