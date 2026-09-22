---
schema_version: "1.3"
source_project: remotely
created: 2026-07-23
type: docs
severity: medium
fix_status: none
affects_scope: this-project-only
workaround_applied: Require a live Fable READY smoke before future mandatory external-review gates.
priority_rationale: Memory Nexus retains Fable review requirements, and route failures must not be mistaken for completed independent review.
issue_id: remotely:2026-07-23:memory-nexus-fable-auth-preflight-notice
thread_id: remotely:2026-07-23:cross-ai-review-live-auth-preflight
related_issue: remotely:2026-07-23:cross-ai-review-live-auth-preflight
next_owner: memory-nexus
status: triaged
triaged_at: 2026-09-12
---

# Verify live Fable readiness before Memory Nexus review gates

## Summary

`remotely` reproduced a Claude Code state where subscription metadata reported
logged in but daemon authentication and live Fable inference were unusable.
The route returned 401 until an owner performed a full logout/login; a live
`READY` smoke then succeeded.

## Action for Memory Nexus

- Require the canonical live Fable smoke before future mandatory independent
  reviews.
- Distinguish authentication, quota, model availability, timeout, and
  transport failures from technical reviewer verdicts.
- Preserve completed review evidence with substantive model output; this notice
  does not retroactively invalidate it.
- Do not use model substitution to close a Fable authority requirement.

No Memory Nexus source, planning, runtime, or existing review artifact was
modified.

## Related

- Conversations owner issue:
  `remotely:2026-07-23:cross-ai-review-live-auth-preflight`

## Event Log
<!-- inbox-events:v1 -->
- 2026-07-23T12:47:42.518Z | remotely | filed | Routed the operational-auth distinction to Memory Nexus's independent-review policy.
- 2026-09-12T10:08:22.743Z | memory-nexus | triaged | Accepted for the next mandatory Fable review: require a live readiness smoke and preserve substantive review output. No live Fable review was invoked in this status assessment. Phase 43 evidence explicitly records a narrow Sonnet safe-mode summary review after full-packet timeouts; it must not be relabelled as a full Opus/Fable review. Owner: memory-nexus; trigger: before the next external-review gate. See docs/audits/2026-09-12-project-status.md.
