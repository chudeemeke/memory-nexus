# Memory Nexus disk ownership

Owner: memory-nexus. Inspected 2026-09-19. Authority: project owner requested management of this project's disk usage, including active, stale, and disconnected worktrees. Other projects were inspected only for checkout identity; none of their contents were modified.

## Completed reclamation

| Artifact | Original bytes | Archive bytes | Reclaimed bytes |
| --- | ---: | ---: | ---: |
| Six Guardian daily logs from June 2025 | 59,623,944 | 4,285,144 | 55,338,800 |
| April 2 immutable database backup | 987,656,192 | 411,213,456 | 576,442,736 |
| Total | 1,047,280,136 | 415,498,600 | 631,781,536 |

This is 631.8 MB / 602.5 MiB of logical file bytes reclaimed, before small archive manifests and this evidence. It is not an NTFS allocated-block measurement. Every ZIP entry's original length and SHA-256 were verified before removing its original. The database backup was held open against writes during compression and hashed again before removal. The live database was not modified by cleanup.

Recovery locations:

- `C:/Projects/memory-nexus/.cc-guardian/archives/guardian-daily-2025-preserved-20260919.zip`, with its adjacent manifest.
- `C:/Users/Destiny/.local/share/memory/backups/preserved/memory-db-20260402-preserved-20260919.zip`, with the adjacent JSON manifest retaining source name, timestamps, attributes, ACL, and SHA-256.

Extract to a new scratch directory and compare each recovered file's hash to its manifest before any deliberate restoration. Never extract over the live `memory.db`. The archives remain local and outside Git.

## Worktrees

Git previously registered two missing `.claude/worktrees/` locations: `agent-aa39fad9` and `phase-32.5-discuss`. Both corresponding branch tips were verified as ancestors of the current checkout. Their registration evidence was retained before `git worktree prune --expire now`; both branch refs remain. There were no existing worktree directories to delete.

The active checkout is `C:/Projects/memory-nexus`, branch `fix/baseline-trust-repair`. Its tracked changes, untracked plans, audits, and inbox items remain intact.

A metadata/name scan inspected 2,422 directories to depth three under `C:/Projects`. It found only this Memory Nexus checkout. Standard external agent worktree roots (`~/.claude/worktrees`, `~/.codex/worktrees`, `~/.worktrees`, `C:/worktrees`) were absent. Nested symlinks and heavy dependency/build trees were not traversed. This bounded scan is not proof that no renamed disconnected copy exists anywhere on every disk. The desktop was unreachable in this session; its clone and runtime data remain unmodified and unverified today.

## Retained storage and limits

The pre-backup-compression inventory found approximately 918 MB in the checkout, dominated by 884 MB of active dependencies. Git history, recovered planning, current build, source, tests, and coverage evidence are retained. Guardian learned patterns, session state, and unsaved-work state were preserved rather than classified as disposable logs.

The canonical runtime store contained a 2,586,361,856-byte live database. The old 987,656,192-byte backup is now the verified 411,213,456-byte archive above. No VACUUM, database replacement, retention deletion, global cache cleanup, model removal, or other-project cleanup was performed. Runtime memory data remains valuable portfolio data even though Memory Nexus owns its storage lifecycle.

The completed temporary coverage work copy uses 14,129,788 bytes. Automatic approval review rejected its removal with only `blocked by policy`; it remains in place. The later inventory observed five temporary test homes at 503,808 bytes each and one at 5,167,576 bytes during verification. Their owner markers were no longer present, so name similarity alone was not treated as sufficient cleanup authority. The test-home ownership/cleanup lifecycle needs hardening before automated reclamation; additional test activity can change this inventory.

## Ongoing operating policy

1. Inventory this checkout, Git registrations, known agent worktree roots, project-owned temporary runs, and runtime backups before substantial disk work. Report scan boundaries and do not follow unknown links into other projects.
2. Before removing a worktree, establish ownership, registration, process activity, tracked and untracked contents, unique commits, and a verified recovery path. Missing Git registrations can be pruned after their pointers and retained refs are recorded. Disconnected existing directories require the same inspection as registered worktrees.
3. Preserve active dependencies and current verification output. Reclaim completed reproducible test/build copies only after process exit, link-target verification, and retention of useful evidence. Current pending temporary cleanup remains subject to the approval-review rejection; do not bypass it through a different command.
4. Archive historical logs and immutable backups losslessly when this produces worthwhile savings. Preserve restoration metadata and verify archive contents before removing originals. Do not age-delete a backup without a verified newer recovery point and an explicit retention decision.
5. Keep canonical databases, model caches, and shared package caches out of opportunistic cleanup. Any database compaction needs its own free-space, concurrency, backup, restore, and rollback proof. Scope future model downloads to the approved offline spike and record their size and uninstall path.
6. Memory Nexus owns the remaining temporary cleanup and future desktop inventory. Retry the former only after the approval-review restriction is resolved; inspect the latter on the next successful desktop connection before any clone retirement. No unattended cleanup service was installed.

Evidence: `2026-09-19-repair-evidence/{disk-before.jsonl,disk-after.json,disk-final.json,worktrees-before.txt,guardian-archive.json,database-backup-archive.json}`. `disk-after.json` predates database-backup compression; `disk-final.json` records the later inventory while verification was running: approximately 918 MB in the checkout and 2.998 GB in the runtime data directory, including the preserved backup archive.
