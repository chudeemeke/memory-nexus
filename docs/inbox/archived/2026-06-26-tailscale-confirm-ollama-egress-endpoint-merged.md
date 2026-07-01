---
schema_version: "1.3"
source_project: tailscale
created: 2026-06-26
type: docs
severity: low
priority_rationale: Counter-notification per cross-project-issues v1.3 closure-notify protocol. Original filing requested closure trigger.
issue_id: tailscale:2026-06-26:confirm-ollama-egress-endpoint-merged
thread_id: memory-nexus:2026-06-14:confirm-ollama-egress-endpoint
related_issue: C:\Projects\tailscale\docs\inbox\archived\2026-06-14-memory-nexus-confirm-ollama-egress-endpoint.md
next_owner: memory-nexus
status: merged
triaged_at: 2026-07-01
resolved_at: 2026-07-01
---


# Confirm Ollama Tailnet Endpoint Before Memory Egress Allowlisting - closed (merged)

## Closure outcome

The original filing
`C:\Projects\tailscale\docs\inbox\archived\2026-06-14-memory-nexus-confirm-ollama-egress-endpoint.md`
has transitioned to terminal state `merged` (resolved 2026-06-26).

Implementation reference: historical backfill; see original filing for implementation evidence

Review the original filing for detailed evidence, changed files, caveats, and
verification context. This counter-notification exists to make the closure
visible to `memory-nexus` without depending on the user to relay it manually.

## What this means for memory-nexus

memory-nexus needs the confirmed endpoint before documenting or automating provider egress consent for embeddings.

No automatic implementation change is requested by this counter-notification.
If the target project still has a local workaround, stale assumption, or
dependent follow-up, triage this file and either archive it with rationale or
open a fresh project-owned work item.

## Related

- Original filing: `C:\Projects\tailscale\docs\inbox\archived\2026-06-14-memory-nexus-confirm-ollama-egress-endpoint.md`
- Convention: `~/.claude/rules/cross-project-issues.md` (v1.3, this is the closure-notify counter-filing)

## Event Log
<!-- inbox-events:v1 -->
- 2026-06-26T00:00:00.000Z | tailscale | counter_notified | Generated closure counter-notification for terminal merged item confirm-ollama-egress-endpoint.
- 2026-07-01T20:36:00.000Z | memory-nexus | merged | Consumed by memory-nexus: config now points embeddings at https://ollama.tail859c3a.ts.net with provider egress consent granted and host allowlisted; direct /api/tags probe returned nomic-embed-text:latest.
