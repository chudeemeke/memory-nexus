# Phase 13: Package Rename - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the package from `memory-nexus` to `@chude/memory` with the `memory` binary. Migrate existing user data paths, update hooks, and publish a deprecation stub for the old package name. No new features or capabilities -- purely organizational rename with data migration.

</domain>

<decisions>
## Implementation Decisions

### Migration behavior
- Auto-migrate silently on first run: detect old `memory-nexus` paths, move data to new `memory` paths, print a one-line notice
- Move (rename) files, not copy: relocate to new paths directly, old paths disappear
- On migration failure: roll back any partial moves, fall back to old paths, print error with manual migration steps
- `memory doctor` reports migration status as a health check (legacy paths detected, migration complete, etc.)

### Deprecation strategy
- `bun add memory-nexus` installs a stub that prints "memory-nexus is now @chude/memory" on any command and exits. No functionality.
- Clean break: no `memory-nexus` binary alias in the new package. Only `memory` exists.
- Mark old `memory-nexus` package with `npm deprecate` on the registry (shows warning on install/search)
- Stub published once and left forever. One version, never updated. It's a signpost.

### Binary and command naming
- All user-facing text says `memory`. No references to the old `memory-nexus` name anywhere in help, errors, or output.
- CLI output uses `memory`, not `@chude/memory`. Package scope is an install detail, not a user-facing identity.
- Config and data paths: `~/.config/memory/config.json` (was `~/.config/memory-nexus/`). Same file structure, new directory name.
- README presents `@chude/memory` as a fresh product. Separate `MIGRATION.md` for existing users with upgrade instructions.

### Hook transition
- Migration does a full re-install: removes old hooks, runs `memory install` to write fresh hooks with new binary name
- `memory install` detects and warns if stale `memory-nexus` hook references still exist
- In-flight background syncs during upgrade: not handled. Sync takes seconds, overlap window is near-zero. If it breaks, user re-syncs.

### Claude's Discretion
- Exact migration rollback implementation details
- Order of migration operations (DB first vs config first vs hooks first)
- MIGRATION.md content structure and depth
- Deprecation stub implementation details (postinstall message vs bin entry)

</decisions>

<specifics>
## Specific Ideas

- Migration should feel invisible -- user upgrades, runs `memory`, everything just works from new paths
- Doctor check for legacy paths ensures users who upgrade but don't trigger migration (e.g., fresh install on new machine with old data) still get guidance
- Deprecation stub is intentionally minimal -- a dead end, not a bridge

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 13-package-rename*
*Context gathered: 2026-02-22*
