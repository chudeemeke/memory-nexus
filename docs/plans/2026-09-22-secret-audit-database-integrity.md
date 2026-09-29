# Secret-audit database integrity checkpoint (unreleased)

Owner: memory-nexus. Draft baseline PR #1. Only synthetic isolated databases and
files were used; no canonical memory, quarantine or installed CLI was changed.

Database audit prepares now dispose within their operation or table iteration.
Requested database redaction and the associated FTS rebuild execute together in
one synchronous immediate transaction. A late write, redactor or index failure
restores prior database content and indexes. Nested caller transactions retain
their work. An ignored update rejects instead of reporting a redacted field.
Read-only scans retain their behavior.

Native evidence: 13 tests / 572 assertions on Windows Bun 1.4.1 and 1.3.14;
seven targeted disposal/transaction/acknowledgement/index faults detected. New
driver diagnostic coverage is 100% in all metrics. Production branches are
95.89%, which fails Tier S. Evidence is in
`.planning/memory-resilience/evidence/B11.74.5-secret.json`.

Q101 remains required before baseline acceptance:

1. Inventory every supported sensitive surface and define how redaction updates
   derived vectors, content hashes and source/projection consistency. The current
   field list and FTS repair do not establish complete secret removal.
2. Verify persisted values and truthful acknowledgement under adversarial write
   behavior; test policy and redactor failures, including JSON fallback catches.
3. Make event-log quarantine/replacement failure-safe with explicit ownership,
   collision, interrupted-write and concurrent-append semantics. Current code
   renames the original before writing the replacement. A database transaction
   cannot make filesystem changes atomic.
4. Define cross-surface partial-failure and retry reporting, including report
   publication. Protect raw quarantined material and ensure identifiers, paths,
   diagnostics and public reports cannot disclose secrets.
5. Complete Tier S branch/decision/adversarial checks, changed-line/package and
   platform gates, installed CLI recovery and independent final-source review.

These are required acceptance tasks, not claims that all listed risks have been
reproduced. The native partial-database-write and ignored-update defects described
above were reproduced and repaired. R04 owns consumer notification of the final
accepted contract before integration/adoption; this draft requires no action by
installed consumers.
