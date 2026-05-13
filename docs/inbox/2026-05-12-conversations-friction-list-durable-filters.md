---
schema_version: "1.2"
source_project: conversations
created: 2026-05-12
triaged_at: 2026-05-13
type: enhancement
severity: low
fix_status: none
affects_scope: all-consumers
status: triaged
priority_rationale: Sound proposal, accepted as future capacity. NOT actionable today (conversations explicitly said don't build for them). Conditional execution gated on architecture audit Stage 3 outcome — A/B consider, C revisit, D/E abandon.
closure_notify_to: conversations
closure_notify_reason: If memory-nexus extends `friction list` per this proposal, conversations' `friction_pattern_detected` reminder check has a path to durable signal (today it scans transient JSONL only).
---

## Triage decision (2026-05-13)

**Decision:** ACCEPT as future capacity. Triaged, not rejected.

**Why accept (not reject):**
- The proposal is sound, well-bounded (extend `list`, no new subcommand), and the 6 hard-requirements section in `## Hard requirements / open questions` are exactly the right questions to settle BEFORE implementation.
- Conversations team explicitly flagged "do NOT build solely for conversations" but ALSO explicitly flagged this is useful design work IF a future durable-signal checker is needed.
- Rejecting would lose the design work.

**Why not build now:** explicit "no consumer is blocked" in the filing.

**Conditional execution gates** (per architecture audit Stage 3 outcome):
- **A (continue v4.0)** — schedule for v4.x post-audit roadmap; v4.x picks up "extend friction list" as a phase.
- **B (federation v5.0)** — schedule for v5.0 federation design; friction's `list` becomes one surface in the federated query layer.
- **C (surgical consolidation)** — REVISIT first principles: if consolidation removes friction-as-separate-stream and unifies it under a single event-log + projection (per Stage 0 §16.0.5), this filing becomes "extend the unified query surface," not "extend `friction list`." Status reopens for re-disposition.
- **D (freeze at v4.0)** — ABANDON. No new features in a frozen release.
- **E (deprecate / replace)** — ABANDON. memory-nexus is throwaway; the consumer (conversations' reminder check) keeps scanning JSONL or migrates to the replacement system.

**Owner:** memory-nexus, post-audit roadmap planning (conditional on outcome).

**Hidden-debt check:** the conditional gate is concrete (Stage 3 terminal transition). NOT vibe-defer. The audit IS the trigger and the audit is finite work with a known endpoint. No deferred reminder needed — Stage 3 closure of the audit inbox item triggers this item's re-disposition automatically as part of post-audit planning.

**Why no closure counter-notification yet:** per cross-project-issues v1.2, `closure_notify_to` fires ONLY on terminal-state transition (`merged` or `rejected`). `triaged` is NOT terminal. Conversations' reminder check stays on JSONL until terminal disposition lands.

# `memory friction list` — durable filter + count extensions

## Motivation

Conversations has a reminder condition check `friction_pattern_detected` (commit `8bbfe25`, 2026-05-03) used by parked-project reactivation watchers. It scans `~/.claude/friction.jsonl` for recent entries matching configured criteria.

Per the 2026-05-11 friction-primacy disposition, JSONL is transient (auto-deleted on next `memory friction *` invocation). For the current reactivation-watcher use case, "recent + un-processed" is acceptable semantics. Documented in conversations' `data/adapters/FileReminderStore.js:133-156`.

Hypothetical future need: a checker that wants DURABLE signal (e.g., "this friction has occurred N+ times over the last 30 days, across sessions, regardless of memory CLI usage"). No such checker exists today. **No conversations work is blocked on this filing.**

## What we'd need (if memory-nexus chooses to extend)

`memory friction list` already filters by `--tool`, `--category`, `--status`, `--all`, `--json`. Cleanest path is extending `list` rather than introducing a new subcommand.

Missing filters that a durable pattern checker would need:
- `--since <YYYY-MM-DD>` — entries on/after date
- `--severity <low|medium|high|critical>` — exact match
- `--project <name>` — exact match (if `project` field is stored)
- `--description-contains <s>` — case-insensitive substring
- `--context-contains <s>` — case-insensitive substring

Missing output modes for boolean checks:
- `--count` — print only the count
- `--min <n>` — exit code semantic: `0` if `count >= n`, `1` if `count < n`, `2+` for execution/config error

## API exit-code contract (if `--min` added)

| Exit | Meaning |
|---|---|
| 0 | Threshold met (`count >= n`) — or, without `--min`, normal success |
| 1 | Threshold not met (`count < n`) |
| 2 | CLI argument / config error |
| 3+ | Execution error (DB unavailable, corrupt, etc.) |

Caller shape (illustrative):
```bash
memory friction list \
  --tool memory --since 2026-05-01 --status open \
  --count --min 3 \
  && echo "fire reminder"
```

## Hard requirements / open questions for memory-nexus to resolve

These are what memory-nexus would need to nail down BEFORE conversations could adopt the contract:

1. **Stable JSON schema for `--json`.** Versioned; backward-compatible. Without this, consumers couple to schema drift.
2. **Date/timezone semantics.** Is `--since` UTC, local, or as-stored? Inclusive or exclusive of the named date?
3. **Resolved-vs-open interaction.** Does `--since` honor `--status open` (default) or include resolved? Composition matters for "is the pattern still recurring or has it been actioned?"
4. **Project / tool normalization.** Substring vs exact, case sensitivity. Today `--tool` doc says "Filter by tool name" — exact? case-sensitive?
5. **DB unavailable / corrupt behavior.** Exit code 3+ or distinct codes per failure mode?
6. **Privacy / redaction.** `--description-contains` / `--context-contains` operate on potentially sensitive friction content. Confirm no logging of the query string in audit trails.

## Alternatives memory-nexus may prefer

- **Reject the filing.** "JSONL-scan is fine forever; we won't extend `list`." Conversations accepts this; the existing checker stays.
- **Counter-propose a separate subcommand.** `memory friction query` or `memory friction count`. Codex's view (consulted via cross-AI review): prefer extending `list` because the proposed filters are list-shaped, not query-engine-shaped.
- **Defer to v4.x event-log architecture.** If memory-nexus's v4.0 evolves into a general event-log/projection for facts + decisions + learnings, friction becomes one stream under that unified design. Reconsider this filing then.

## What NOT to do

- **Do NOT build this solely for conversations.** No conversations work is blocked today. JSONL-scan is acceptable for parked-project reactivation watchers. Capacity should go to roadmap-aligned work first.
- **Do NOT introduce a new top-level subcommand** just for one consumer. Extending `list` is the parsimonious shape.
- **Do NOT couple this to a programmatic Node API.** A stable CLI JSON/exit-code contract is sufficient; in-process API creates version coupling between first-party tools that may not be worth the maintenance overhead.

## Related

- conversations' `friction_pattern_detected` impl + 2026-05-11 docstring clarification: `~/Projects/conversations/data/adapters/FileReminderStore.js:133-156`
- Friction-primacy disposition (memory-nexus side, closed): `~/Projects/memory-nexus/docs/inbox/archived/2026-05-08-conversations-friction-primacy-decision.md`
- Counter-notification that prompted this filing: `~/Projects/conversations/docs/inbox/archived/2026-05-11-memory-nexus-friction-primacy-decision-merged.md`
- Cross-project-issues convention: `~/.claude/rules/cross-project-issues.md` (v1.2)
