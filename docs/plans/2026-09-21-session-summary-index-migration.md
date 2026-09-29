# Session summary index repair (unreleased)

Owner: memory-nexus. Delivery: draft baseline repair PR #1. No installed database
has been changed by this work; verification uses synthetic databases only.

The old summary trigger left text searchable after a summary was cleared. It also
did not index summaries supplied when inserting a session, including imported
sessions. The revised schema indexes non-empty inserted summaries, replaces text
on updates, and removes text when the summary becomes empty/null or is deleted.

On schema initialization, absence of `sessions_fts_insert` identifies the legacy
trigger set. One SQLite transaction replaces the old update/delete triggers,
installs insert handling, and rebuilds the derived summary index from authoritative
session rows. It removes stale/orphan/duplicate index rows. Failure rolls back
both triggers and index; a later initialization retries. An enclosing caller
transaction remains authoritative. Subsequent initialization skips the rebuild.

No export format, CLI flag, source session row or storage path changes. Existing
databases need the normal schema initialization after approved installation;
users should not run ad-hoc index deletion commands. A one-time full summary-index
rebuild can require additional time/disk, which must be measured on a representative
installed workload before rollout (Q019). The new insert trigger is a version
marker, not a claim that arbitrary third-party schema edits are supported.

Verification in the source checkout:

```powershell
bun test --timeout 15000 tests/infrastructure/database/schema-lifecycle.test.ts src/infrastructure/database/schema.test.ts
```

Native regression evidence, Windows runtime identities and wider caller results
are in `.planning/memory-resilience/evidence/B11.74.5-schema.json`. Whole-schema
atomicity, support-probe error classification, friction migration error handling,
SQL decision completeness, Linux, installed-artifact and independent review remain
required. Numeric diagnostic coverage does not close those gates.

Consumer notification: R04 must inventory opted-in first-party consumers and
broadcast this migration notice before integration/adoption. No consumer action is
required while this change remains an unmerged, uninstalled draft.
