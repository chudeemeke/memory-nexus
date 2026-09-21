# Legacy import replacement integrity (unreleased)

Owner: memory-nexus. Delivery: draft baseline repair PR #1. Synthetic databases
only; no installed or canonical store has been changed.

Previously, `clearExisting` deleted destination records before entering the
import transaction. A later clear/import/preparation failure could lose existing
data. It also toggled foreign-key enforcement, reported input lengths as imported
counts, silently ignored invalid SQLite constraints, and left old vectors behind.

The repair puts clearing and insertion inside one immediate transaction and
preserves the caller's foreign-key setting. Replacement invalidates old message
vectors, embedding metadata and skip decisions; a failed replacement restores
them with the original records. Successful replacement requires re-embedding.
Duplicate conflicts remain skipped, while other SQLite constraint failures reject
the import. Returned counts describe actual inserted records, excluding skipped
duplicates or trigger-ignored writes; FTS side effects do not inflate counts.

The JSON shape and existing optional legacy fields are unchanged. Export and
import statements are scoped to the operation, including redactor/output errors
and partial preparation. No-op redaction only implements the text method this
service uses; default no-op privacy policy remains a required Q004 review.

This v1 format covers a legacy subset of memory tables. It is not a complete
backup of governance, event logs, persona, graph, dream or every other surface.
Q004 owns that inventory/disposition, reference and conflict semantics, complete
row/version validation, single-snapshot input reading, atomic output, redaction
and installed consumer proof. This repair does not establish full backup/restore
or whole-memory consistency acceptance.

Verification:

```powershell
bun test --timeout 15000 tests/infrastructure/database/export-lifecycle.test.ts
```

The existing export behavior suite additionally runs in an owned outer temporary
directory because its historical fixture uses a fixed name. Retained commands and
outputs are in `.planning/memory-resilience/evidence/B11.74.5-export.json`.
Older-runtime, Linux, installed and independent acceptance remain explicit gates.

R04 must notify opted-in consumers before integration/adoption, including the
corrected count semantics and re-embedding requirement. This unmerged draft
requires no consumer action now.
