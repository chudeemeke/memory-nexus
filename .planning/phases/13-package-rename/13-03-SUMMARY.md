---
phase: "13-package-rename"
plan: "03"
title: "Deprecation stub, migration docs, CLAUDE.md updates"
status: completed
started: "2026-02-25T21:09:59Z"
completed: "2026-02-25T21:15:52Z"
duration: "6min"
tasks_completed: 2
tasks_total: 2
key-files:
  created:
    - deprecation-stub/package.json
    - deprecation-stub/index.js
    - MIGRATION.md
    - README.md
    - ~/.claude/rules/memory.md
  modified:
    - src/presentation/cli/commands/install.ts
    - src/presentation/cli/commands/install.test.ts
    - CLAUDE.md
    - ~/.claude/CLAUDE.md
  deleted:
    - ~/.claude/rules/memory-nexus.md
decisions:
  - "Deprecation stub version 0.2.0 (distinct from main package v2.0.0)"
  - "Updated install test fixture paths from .memory-nexus to memory to avoid false stale detection"
---

## Result

Shipped deprecation stub package for memory-nexus npm name, created migration guide, and updated all project/external documentation to reflect @chude/memory identity with memory binary.

## Tasks Completed

| # | Task | Result |
|---|------|--------|
| 1 | Create deprecation stub and stale hook detection | Stub at deprecation-stub/ exits 1 with migration message; install command warns about stale memory-nexus hook references; 3 new tests |
| 2 | Update MIGRATION.md, README.md, CLAUDE.md, external WoW rules | MIGRATION.md created; README.md created; CLAUDE.md rewritten; ~/.claude/rules/memory-nexus.md renamed to memory.md; global CLAUDE.md updated |

## Test Results

```
2064 pass, 0 fail, 4190 expect() calls
Ran 2064 tests across 83 files [19.31s]
```

TypeScript errors: pre-existing only (no new errors introduced by Phase 13).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated install test fixture paths**
- **Found during:** Task 1
- **Issue:** Test overrides used `.memory-nexus` in path names (e.g., `join(homedir(), ".memory-nexus-test-install")`), causing freshly installed hooks to contain "memory-nexus" in the command string and triggering false positive stale detection warnings.
- **Fix:** Changed test paths from `.memory-nexus-test-install`/`.memory-nexus/` to `.memory-test-install`/`memory/` to match the current XDG naming scheme.
- **Files modified:** `src/presentation/cli/commands/install.test.ts`
- **Commit:** 5fc9677

## Files Changed

### Created
- `deprecation-stub/package.json` -- Stub npm package (name: memory-nexus, version: 0.2.0)
- `deprecation-stub/index.js` -- Prints deprecation message to stderr, exits 1
- `MIGRATION.md` -- Upgrade guide from memory-nexus to @chude/memory
- `README.md` -- Project README with @chude/memory identity
- `~/.claude/rules/memory.md` -- Renamed WoW rules file with memory CLI commands

### Modified
- `src/presentation/cli/commands/install.ts` -- Added warnStaleHookReferences(), imported loadClaudeSettings
- `src/presentation/cli/commands/install.test.ts` -- Added 3 stale detection tests, updated fixture paths
- `CLAUDE.md` -- Rewritten for @chude/memory identity, updated paths and commands
- `~/.claude/CLAUDE.md` -- Updated Memory row to reference rules/memory.md

### Deleted
- `~/.claude/rules/memory-nexus.md` -- Replaced by memory.md

## Commits

- `5fc9677`: feat(13-03): add deprecation stub package and stale hook detection
- `fa59a1a`: docs(13-03): update project docs for @chude/memory identity

## Self-Check: PASSED

All created files verified present. Both commits (5fc9677, fa59a1a) confirmed in git log. Rules file rename confirmed (memory.md exists, memory-nexus.md deleted). 2064 tests pass, 0 fail.
