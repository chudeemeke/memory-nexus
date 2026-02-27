---
title: "Failed to save checkpoint: EUNKNOWN" errors during sync
area: infrastructure
priority: normal
status: pending
created: 2026-02-27
source: conversation
---

## Description

During `memory sync --embed` with 1539 sessions, repeated errors appear interleaved with the sync progress bar:

```
Failed to save checkpoint: EUNKNOWN: unknown error, open '...'
```

These appear from approximately 67% through 83% of session processing. Sync completes successfully despite the errors (all 1539 sessions processed, 96391 messages extracted).

## Context

Pre-existing issue, not introduced by Phase 15. The checkpoint mechanism writes progress state during sync so it can resume on interruption. The EUNKNOWN error suggests a file lock or concurrent access issue -- possibly the checkpoint file is being written while still open from a previous write, or a Windows-specific file locking issue (EBUSY-adjacent).

The sync still completes and data integrity appears unaffected, but the error output is noisy and could mask real issues.

## Acceptance Criteria

- [ ] Identify root cause of EUNKNOWN on checkpoint file open
- [ ] Either fix the file access pattern or suppress/retry gracefully
- [ ] Sync progress bar output is clean (no interleaved error messages)
