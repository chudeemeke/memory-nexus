---
schema_version: "1.3"
source_project: conversations
created: 2026-07-22
type: bug
severity: high
fix_status: none
affects_scope: all-consumers
priority_rationale: Twenty-seven open synthetic test rows remain in the canonical friction store and materially distort the dashboard patterns used for recurring promotion and prioritisation.
closure_notify_to: conversations
closure_notify_reason: Conversations uses the canonical friction dashboard for reminder-driven portfolio triage and needs corrected counts when the historical pollution is removed.
issue_id: conversations:2026-07-22:synthetic-friction-rows-pollute-dashboard
thread_id: conversations:2026-07-22:synthetic-friction-rows-pollute-dashboard
related_issue: memory-nexus:2026-05-11:programmatic-api-real-db-pollution
next_owner: memory-nexus
status: triaged
triaged_at: 2026-09-12
---

# Remove historical synthetic friction rows from the canonical store

## Summary

The current memory friction dashboard contains 27 open rows whose descriptions
are test fixtures such as `JSON friction entry`, `Entry for list test`, and
`Test friction entry`. They inflate the dominant `memory` friction patterns and
can cause the reminder-driven friction-to-inbox sweep to promote test data as
real operational debt.

The earlier programmatic-API pollution fix moved current tests to temporary
storage, but historical rows left in the real database still affect every
consumer of the canonical dashboard.

## Evidence

The 2026-07-22 dashboard inspection identified three groups of nine synthetic
open rows:

- `memory` / `sync`: IDs 165, 171, 177, 184, 190, 196, 202, 213, and 221.
- `memory` / `cli`: IDs 166, 172, 178, 182, 188, 194, 200, 211, and 219.
- `memory` / `search`: IDs 164, 170, 176, 183, 189, 195, 201, 212, and 220.

The canonical store reported 81 total rows, of which 48 were open. The 27
synthetic open rows therefore dominate the open-pattern counts.

## Requested outcome

1. Confirm the exact provenance of the listed IDs and make the cleanup target
   explicit.
2. Provide a dry-run that lists only the rows to be removed or terminally
   quarantined.
3. Back up the affected data before mutation and keep the operation recoverable.
4. Remove or quarantine only proven fixtures; do not pattern-delete legitimate
   user data.
5. Add a durable test-store guard or fixture marker so tests cannot silently
   write to the production database again.
6. Re-run the dashboard and report corrected totals and grouped counts.

## Boundary

`conversations` has not edited the memory database. Cleanup and verification
belong in the `memory-nexus` project under its own implementation, test, and
review workflow.

## Event log

- 2026-07-22T01:08:46Z | conversations | filed | Coherence sink-health audit found 27 historical synthetic rows distorting the canonical dashboard.
- 2026-09-12T10:08:22.743Z | memory-nexus | triaged | Read-only SQLite inspection confirms all 27 listed IDs remain open with the reported fixture descriptions, tool, and category. Current totals: 194 rows, 161 open, 24 resolved, 9 wont-fix. No data mutated. Owner: memory-nexus; trigger: baseline repair before the next release or friction-driven prioritisation. See docs/audits/2026-09-12-project-status.md. The existing deleteByPattern API does not satisfy the exact-ID, backup, dry-run, and provenance requirements of this cleanup.
