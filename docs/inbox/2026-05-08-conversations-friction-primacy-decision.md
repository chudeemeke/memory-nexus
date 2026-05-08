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
