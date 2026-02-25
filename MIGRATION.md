# Migrating from memory-nexus to @chude/memory

The `memory-nexus` package has been renamed to `@chude/memory` starting with v2.0.0. The old package name now installs a deprecation stub that directs users to the new package.

## Quick Upgrade

```bash
# 1. Remove old package
bun remove -g memory-nexus

# 2. Install new package
bun add -g @chude/memory

# 3. Verify installation
memory doctor
```

## Automatic Data Migration

On first run, `memory` automatically detects data at the legacy path (`~/.memory-nexus/`) and migrates it to XDG-compliant locations:

- Config: `~/.config/memory/`
- Data (database, logs, hooks): `~/.local/share/memory/`

A one-line notice is printed during migration. No manual action is required. The legacy directory is left intact as a backup; you may delete it after verifying the migration succeeded.

## Hook Migration

The automatic migration performs a full re-install of Claude Code hooks: old hook entries referencing `memory-nexus` are removed and new entries referencing the `memory` binary are written to `~/.claude/settings.json`.

If stale `memory-nexus` references persist after migration, `memory install` will print a warning. To resolve:

```bash
memory uninstall
memory install
```

## What Changed

| Item | Before (v1.x) | After (v2.0+) |
|------|----------------|----------------|
| Package name | `memory-nexus` | `@chude/memory` |
| Binary name | `memory-nexus` | `memory` |
| Config path | `~/.memory-nexus/config.json` | `~/.config/memory/config.json` |
| Data path | `~/.memory-nexus/` | `~/.local/share/memory/` |
| Database path | `~/.memory-nexus/memory.db` | `~/.local/share/memory/memory.db` |
| Log path | `~/.memory-nexus/logs/` | `~/.local/share/memory/logs/` |
| Hook path | `~/.memory-nexus/hooks/` | `~/.local/share/memory/hooks/` |
| Error class | `MemoryNexusError` | `MemoryError` |

## Rollback

If migration fails, data remains at `~/.memory-nexus/` unchanged. An error message provides the specific failure reason and manual migration steps. You can continue using the v1.x `memory-nexus` package until migration issues are resolved.
