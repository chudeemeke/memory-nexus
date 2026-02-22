# Phase 13: Package Rename - Research

**Researched:** 2026-02-22
**Domain:** npm package renaming, path migration, CLI binary naming, deprecation mechanics
**Confidence:** HIGH

## Summary

Phase 13 involves three interrelated changes: (1) renaming the npm package from `memory-nexus` to `@chude/memory`, (2) changing the CLI binary from `memory-nexus` to `memory`, and (3) migrating all user-facing data paths from `~/.memory-nexus/` to XDG-style paths (`~/.config/memory/`, `~/.local/share/memory/`). A deprecation stub replaces the old package on npm.

The codebase is well-structured for this change. Path definitions are centralized in a small number of infrastructure modules (config-manager, log-writer, settings-manager, hook-runner, connection, checkpoint-manager). The hardcoded `".memory-nexus"` string appears in exactly 6 source files and their tests. The `MemoryNexusError` class name and `MEMORY_NEXUS_MARKER` constant also require renaming. The completion scripts, CLI entry point, and user-facing commands (install, uninstall, status, doctor) contain string references to the old name.

**Primary recommendation:** Extract all path definitions into a single `paths.ts` module that respects XDG conventions, implement migration as a standalone module that runs before any other operation, then do a systematic sweep of all string references. The error class rename (`MemoryNexusError` to `MemoryError`) and type rename (`MemoryNexusConfig` to `MemoryConfig`) are mechanical but touch many files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Auto-migrate silently on first run: detect old `memory-nexus` paths, move data to new `memory` paths, print a one-line notice
- Move (rename) files, not copy: relocate to new paths directly, old paths disappear
- On migration failure: roll back any partial moves, fall back to old paths, print error with manual migration steps
- `memory doctor` reports migration status as a health check (legacy paths detected, migration complete, etc.)
- `bun add memory-nexus` installs a stub that prints "memory-nexus is now @chude/memory" on any command and exits. No functionality.
- Clean break: no `memory-nexus` binary alias in the new package. Only `memory` exists.
- Mark old `memory-nexus` package with `npm deprecate` on the registry
- Stub published once and left forever. One version, never updated.
- All user-facing text says `memory`. No references to the old `memory-nexus` name anywhere in help, errors, or output.
- CLI output uses `memory`, not `@chude/memory`. Package scope is an install detail, not a user-facing identity.
- Config and data paths: `~/.config/memory/config.json` (was `~/.memory-nexus/`). Same file structure, new directory name.
- README presents `@chude/memory` as a fresh product. Separate `MIGRATION.md` for existing users.
- Migration does a full re-install: removes old hooks, runs `memory install` to write fresh hooks with new binary name.
- `memory install` detects and warns if stale `memory-nexus` hook references still exist.

### Claude's Discretion
- Exact migration rollback implementation details
- Order of migration operations (DB first vs config first vs hooks first)
- MIGRATION.md content structure and depth
- Deprecation stub implementation details (postinstall message vs bin entry)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Critical Discrepancy: Path Convention Change

**The CONTEXT.md says:** "Config and data paths: `~/.config/memory/config.json` (was `~/.config/memory-nexus/`)"

**Actual current state:** The codebase uses `~/.memory-nexus/` (hidden directory in HOME), NOT `~/.config/memory-nexus/`. The CONTEXT.md's "(was `~/.config/memory-nexus/`)" description of the old path is incorrect.

**However, the intent is clear and confirmed by the roadmap success criteria:**
- Success criterion 2 explicitly names `~/.config/memory/` and `~/.local/share/memory/` as target paths
- PROV-03 in requirements references `~/.config/memory/config.json`

**What this means for implementation:** This is not just a `s/memory-nexus/memory/` find-and-replace on paths. It is a migration from a flat `~/.memory-nexus/` directory to XDG-style separated paths:

| Current Path | New Path | XDG Category |
|-------------|----------|--------------|
| `~/.memory-nexus/config.json` | `~/.config/memory/config.json` | Config |
| `~/.memory-nexus/memory.db` | `~/.local/share/memory/memory.db` | Data |
| `~/.memory-nexus/logs/` | `~/.local/share/memory/logs/` | Data (logs) |
| `~/.memory-nexus/hooks/sync-hook.js` | `~/.local/share/memory/hooks/sync-hook.js` | Data (runtime) |
| `~/.memory-nexus/backups/` | `~/.local/share/memory/backups/` | Data |
| `~/.memory-nexus/sync-checkpoint.json` | `~/.local/share/memory/sync-checkpoint.json` | Data |

**Confidence:** HIGH -- verified against roadmap success criteria and REQUIREMENTS.md PROV-03.

## Inventory: All "memory-nexus" References

### Source Files (production code requiring changes)

| File | References | Change Type |
|------|-----------|-------------|
| `package.json` | `"name": "memory-nexus"`, `"bin": { "memory-nexus": ... }` | Package identity |
| `src/index.ts` | Comment: "memory-nexus" | Comment text |
| `src/domain/errors/memory-nexus-error.ts` | Class `MemoryNexusError`, `this.name = "MemoryNexusError"` | Class rename |
| `src/domain/errors/index.ts` | Re-exports from `memory-nexus-error.js` | Import path |
| `src/infrastructure/hooks/config-manager.ts` | `".memory-nexus"` path, `MemoryNexusConfig` type, comments | Path + type rename |
| `src/infrastructure/hooks/log-writer.ts` | `".memory-nexus"` path, comments | Path rename |
| `src/infrastructure/hooks/hook-runner.ts` | `".memory-nexus"` path, `MEMORY_NEXUS_HOOK` env var, comments | Path + env var |
| `src/infrastructure/hooks/settings-manager.ts` | `MEMORY_NEXUS_MARKER = "memory-nexus"`, `".memory-nexus"` paths, comments | Marker + paths |
| `src/infrastructure/hooks/sync-hook-script.ts` | Comment: `~/.memory-nexus/hooks/` | Comment path |
| `src/infrastructure/hooks/index.ts` | `MemoryNexusConfig` type re-export | Type rename |
| `src/infrastructure/database/connection.ts` | `".memory-nexus"` path, `MemoryNexusError` import, FTS5 error message | Path + error class |
| `src/infrastructure/database/index.ts` | Comment: "memory-nexus" | Comment text |
| `src/infrastructure/database/health-checker.ts` | `MemoryNexusConfig` import, path comments | Type + comments |
| `src/infrastructure/signals/checkpoint-manager.ts` | `".memory-nexus"` path, comments | Path rename |
| `src/presentation/cli/index.ts` | Comment: "Memory-Nexus CLI" | Comment text |
| `src/presentation/cli/commands/completion.ts` | `"# memory-nexus bash/zsh/fish completion"` comments | Comment text |
| `src/presentation/cli/commands/doctor.ts` | `"rm ~/.memory-nexus/memory.db"` user-facing string | User message |
| `src/presentation/cli/commands/install.ts` | `"memory-nexus status"`, `"memory-nexus uninstall"` user-facing strings | User messages |
| `src/presentation/cli/commands/status.ts` | `"Memory-Nexus Status"`, `"memory-nexus install"`, `"memory-nexus sync"` user-facing strings, `MemoryNexusConfig` type | User messages + type |
| `src/presentation/cli/commands/uninstall.ts` | `"memory-nexus sync"` user-facing string | User message |
| `src/presentation/cli/commands/index.ts` | Comment: "memory-nexus CLI" | Comment text |
| `src/presentation/cli/formatters/error-formatter.ts` | `"~/.memory-nexus/logs"` user-facing string, `MemoryNexusError` imports | User message + class |
| `src/presentation/cli/db-startup.ts` | `MemoryNexusError` imports | Class reference |
| All files importing `MemoryNexusError` or `MemoryNexusConfig` | Transitive references | Import updates |

### Source Files (test code requiring changes)

Every `.test.ts` file that tests the above modules will need corresponding updates. Key patterns:
- `".memory-nexus"` in test path construction (config-manager, log-writer, settings-manager, hook-runner, checkpoint-manager, connection, status, install, uninstall tests)
- `"memory-nexus"` as test data for project names in session tests (these are test DATA, not the tool's identity -- many should remain as-is)
- `MemoryNexusError` imports in error tests

### Environment Variables

| Current | New | Location |
|---------|-----|----------|
| `MEMORY_NEXUS_HOOK` | `MEMORY_HOOK` | hook-runner.ts (spawn env), hook-runner.ts (detection) |

### Documentation Files

All `.md` files in `docs/` and `.planning/` reference `memory-nexus` extensively. Per CONTEXT.md, user-facing docs should say `memory`, and a MIGRATION.md covers upgrade.

### External Files (not in this repo)

| File | Reference | Action |
|------|-----------|--------|
| `~/.claude/rules/memory-nexus.md` | `memory-nexus` in rule file name and content | Rename file, update content (RENAME-05) |
| `~/.claude/CLAUDE.md` | `memory-nexus` in memory table | Update reference (RENAME-05) |
| `~/.claude/projects/*/MEMORY.md` | `memory-nexus` in session memory | Update references (RENAME-05) |

## Architecture Patterns

### Recommended: Centralized Path Module

Create `src/infrastructure/paths.ts` as the single source of truth for ALL paths:

```typescript
// src/infrastructure/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "memory";

/** XDG config directory: ~/.config/memory/ */
export function getConfigDir(): string {
    return join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        APP_NAME
    );
}

/** XDG data directory: ~/.local/share/memory/ */
export function getDataDir(): string {
    return join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
        APP_NAME
    );
}

/** Legacy directory: ~/.memory-nexus/ */
export function getLegacyDir(): string {
    return join(homedir(), ".memory-nexus");
}

// Derived paths
export function getConfigPath(): string {
    return join(getConfigDir(), "config.json");
}

export function getDbPath(): string {
    return join(getDataDir(), "memory.db");
}

export function getLogDir(): string {
    return join(getDataDir(), "logs");
}

export function getHookDir(): string {
    return join(getDataDir(), "hooks");
}

export function getBackupDir(): string {
    return join(getDataDir(), "backups");
}

export function getCheckpointPath(): string {
    return join(getDataDir(), "sync-checkpoint.json");
}
```

**Why:** Current paths are scattered across 6 files. Centralizing makes migration, testing, and future changes trivial. Each existing module (config-manager, log-writer, etc.) delegates to this module.

### Recommended: Migration Module

Create `src/infrastructure/migration.ts`:

```typescript
// src/infrastructure/migration.ts

interface MigrationResult {
    migrated: boolean;
    itemsMoved: string[];
    errors: string[];
}

/**
 * Check if legacy paths exist and migrate to new XDG paths.
 *
 * Order: DB first (most valuable), config second, logs/hooks/backups last.
 * Rollback: on any failure, move everything back.
 */
export async function migrateFromLegacy(): Promise<MigrationResult> { ... }

/**
 * Check migration status for doctor command.
 */
export function getMigrationStatus(): {
    legacyExists: boolean;
    newExists: boolean;
    status: "not-needed" | "pending" | "complete" | "partial";
} { ... }
```

### Recommended: Migration Operation Order

1. **Database first** (most valuable data, single file move)
2. **Config second** (small file, needed for subsequent operations)
3. **Checkpoint file** (small, transient)
4. **Logs directory** (less critical, can be regenerated)
5. **Hooks directory** (will be re-installed anyway)
6. **Backups directory** (safety net, least critical)
7. **Re-install hooks** (writes fresh hooks with new binary name)
8. **Remove empty legacy directory** (cleanup)

On failure at any step: reverse all completed moves, leave legacy directory intact.

### Recommended: File Rename Strategy for Error Class

The `MemoryNexusError` class rename is a judgment call:

**Option A: Rename to `MemoryError`**
- Pros: Clean, matches new identity
- Cons: Touches every file that imports it (30+ files), potential git blame disruption

**Option B: Keep `MemoryNexusError` internally, only rename user-facing strings**
- Pros: Minimal diff, no import churn
- Cons: Internal name doesn't match product identity

**Recommendation: Option A (rename to `MemoryError`).** The rename is mechanical (find-and-replace), and internal consistency matters. The `MemoryNexusConfig` type should also become `MemoryConfig`. The file `memory-nexus-error.ts` becomes `memory-error.ts`.

### Anti-Patterns to Avoid

- **Partial rename:** Leaving some internal references as `memory-nexus` creates confusion. Do a complete sweep.
- **Forgetting test data:** Many test files use `"memory-nexus"` as PROJECT NAME test data (e.g., sessions for a project called "memory-nexus"). These should NOT be renamed -- they are test data representing the project directory name, not the tool's identity.
- **Breaking the hook marker:** The `MEMORY_NEXUS_MARKER` constant in settings-manager.ts is used to DETECT and FILTER existing hooks. The migration needs to: (1) use the old marker to find and remove old hooks, (2) use a new marker for new hooks. During migration, both markers must be understood.
- **Atomic rename across filesystems:** `fs.renameSync()` fails across filesystem boundaries (EXDEV error). On some systems, `~/.memory-nexus/` and `~/.config/memory/` could be on different mounts. Use copy-then-delete as fallback.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-device file move | Custom copy+delete | `fs.renameSync` with EXDEV fallback to `fs.cpSync` + `fs.rmSync` | Node.js `renameSync` wraps C `rename(2)` which fails across devices |
| XDG path resolution | Hardcoded `~/.config` | Respect `XDG_CONFIG_HOME` and `XDG_DATA_HOME` env vars with fallbacks | Users may have custom XDG paths |
| npm deprecation | Manual registry API calls | `npm deprecate memory-nexus "message"` CLI command | Standard npm tooling handles auth and registry protocol |

## Common Pitfalls

### Pitfall 1: Test Data vs Tool Identity
**What goes wrong:** Renaming `"memory-nexus"` strings in test data that represent PROJECT DIRECTORY NAMES, not the tool's identity. For example, `ProjectPath.fromDecoded("C:\\Users\\Test\\Projects\\memory-nexus")` -- this is a path to a project CALLED "memory-nexus", not a reference to the tool.
**Why it happens:** Blind find-and-replace.
**How to avoid:** Categorize each reference: is it (a) the tool's identity/branding, (b) a file system path for the tool's data, (c) test data that happens to use "memory-nexus" as a project name? Only change (a) and (b).
**Warning signs:** Test assertions about project name resolution start failing after rename.

### Pitfall 2: Hook Marker Transition
**What goes wrong:** Changing the `MEMORY_NEXUS_MARKER` to `"memory"` before migration handles old hooks, making it impossible to detect and remove old hooks.
**Why it happens:** Renaming the marker as part of the general rename sweep.
**How to avoid:** The migration module must: (1) detect hooks containing old marker `"memory-nexus"`, (2) remove them, (3) install new hooks with new marker `"memory"`. The settings-manager should understand BOTH markers during the transition.
**Warning signs:** Old hooks persist in settings.json after migration.

### Pitfall 3: EXDEV on Directory Move
**What goes wrong:** `fs.renameSync("~/.memory-nexus/memory.db", "~/.local/share/memory/memory.db")` throws EXDEV if HOME and XDG_DATA_HOME are on different filesystems.
**Why it happens:** Docker, NFS mounts, or explicit XDG overrides pointing to different volumes.
**How to avoid:** Wrap `renameSync` with EXDEV fallback: catch the error, fall back to `cpSync` + `rmSync` (or `copyFileSync` + `unlinkSync` for files).
**Warning signs:** Migration fails on CI or containerized environments.

### Pitfall 4: Race Condition with Background Sync
**What goes wrong:** User upgrades package while a background sync process (spawned by old hook) is still running. The old process writes to `~/.memory-nexus/` after migration moved files away.
**Why it happens:** Hook processes are detached and survive package upgrade.
**How to avoid:** Per CONTEXT.md decision: "Not handled. Sync takes seconds, overlap window is near-zero. If it breaks, user re-syncs." Document this as a known edge case, do not over-engineer.
**Warning signs:** Stale `~/.memory-nexus/` directory reappears after migration.

### Pitfall 5: Scoped Package Binary Name
**What goes wrong:** npm infers binary name from scoped package name as `@chude/memory`, making it impossible to invoke without the scope.
**Why it happens:** Using string form of `bin` field instead of object form.
**How to avoid:** Always use object form in package.json: `"bin": { "memory": "dist/presentation/cli/index.js" }`. This explicitly sets the binary name regardless of package scope.
**Warning signs:** `which memory` returns nothing after global install.

### Pitfall 6: Windows Path Separator in Hook Commands
**What goes wrong:** Hook commands in settings.json use backslashes on Windows, breaking JSON or shell execution.
**Why it happens:** `path.join()` produces backslashes on Windows.
**How to avoid:** The existing code already handles this: `hookScriptPath.replace(/\\/g, "/")` in settings-manager.ts. Ensure the new paths module does the same.
**Warning signs:** Hooks fail on Windows with "file not found" errors.

## Code Examples

### package.json Changes

```json
{
  "name": "@chude/memory",
  "version": "2.0.0",
  "bin": {
    "memory": "dist/presentation/cli/index.js"
  }
}
```

### Deprecation Stub (separate package)

```json
{
  "name": "memory-nexus",
  "version": "0.2.0",
  "description": "DEPRECATED: Use @chude/memory instead",
  "bin": {
    "memory-nexus": "index.js"
  }
}
```

```javascript
#!/usr/bin/env node
// index.js
console.error("memory-nexus is now @chude/memory");
console.error("");
console.error("  Install: bun add -g @chude/memory");
console.error("  Usage:   memory <command>");
console.error("");
console.error("See: https://www.npmjs.com/package/@chude/memory");
process.exit(1);
```

### Migration Rollback Pattern

```typescript
interface MoveRecord {
    from: string;
    to: string;
}

async function migrateWithRollback(
    moves: Array<{ from: string; to: string }>
): Promise<{ success: boolean; completed: MoveRecord[] }> {
    const completed: MoveRecord[] = [];

    for (const move of moves) {
        try {
            ensureDir(dirname(move.to));
            moveFileOrDir(move.from, move.to); // renameSync with EXDEV fallback
            completed.push(move);
        } catch (error) {
            // Rollback all completed moves
            for (const done of completed.reverse()) {
                try {
                    moveFileOrDir(done.to, done.from);
                } catch {
                    // Rollback failed -- print manual steps
                }
            }
            return { success: false, completed: [] };
        }
    }

    return { success: true, completed };
}
```

### XDG-Aware Path Resolution

```typescript
export function getConfigDir(): string {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) return join(xdgConfig, "memory");
    return join(homedir(), ".config", "memory");
}

export function getDataDir(): string {
    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgData) return join(xdgData, "memory");
    return join(homedir(), ".local", "share", "memory");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `~/.memory-nexus/` (flat) | `~/.config/memory/` + `~/.local/share/memory/` (XDG) | Phase 13 | Config/data separation, follows Linux standards |
| `memory-nexus` binary | `memory` binary | Phase 13 | Shorter, cleaner CLI invocation |
| `memory-nexus` package | `@chude/memory` scoped package | Phase 13 | Namespace protection, professional branding |
| `MemoryNexusError` class | `MemoryError` class | Phase 13 | Internal consistency with new name |
| `MEMORY_NEXUS_HOOK` env | `MEMORY_HOOK` env | Phase 13 | Consistent naming |

## Windows Considerations

The XDG Base Directory Specification is a Linux/freedesktop standard. On Windows (this project's primary dev environment):

- `$HOME/.config/` and `$HOME/.local/share/` are unconventional but workable
- The project already uses `homedir()` from Node.js `os` module
- On Windows, `homedir()` returns `C:\Users\<username>` (not `C:\Users\<username>\iCloudDrive\...`)
- Path separators: `path.join()` uses backslashes on Windows; hook commands need forward slashes (already handled)
- The current codebase runs on Windows (MINGW64) and already handles Windows paths correctly

**Recommendation:** Use XDG conventions consistently. On Windows, `~/.config/memory/` becomes `C:\Users\<username>\.config\memory\` which is fine. Do NOT use Windows-specific paths like `%APPDATA%` -- keep it simple and cross-platform.

## Open Questions

1. **npm Organization Setup**
   - What we know: The package will be `@chude/memory` (scoped under `@chude`)
   - What's unclear: Does the `@chude` npm org/user exist? Is it configured?
   - Recommendation: Verify `npm whoami` and check npm org setup before attempting publish. This is a pre-requisite, not a code change.

2. **Version Number for New Package**
   - What we know: Current version is `0.1.2`. v2.0 milestone starts with Phase 13.
   - What's unclear: Should `@chude/memory` start at `2.0.0` or `0.1.3`?
   - Recommendation: Start at `2.0.0` since this is the v2.0 milestone and represents a breaking change (new package name, new paths). The deprecation stub for `memory-nexus` should be `0.2.0` (next minor of old package).

3. **Deprecation Stub: bin vs postinstall**
   - What we know: CONTEXT says "any command" prints message and exits
   - Options: (a) `bin` entry pointing to script that prints message, (b) `postinstall` script that prints on install
   - Recommendation: Use `bin` entry (option a). This means `memory-nexus` command itself prints the deprecation message, matching the CONTEXT decision "prints on any command and exits." A `postinstall` message would only show during install, not during command invocation.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: all 6 path-defining source files read and catalogued
- package.json: current package identity and bin field verified
- CONTEXT.md, REQUIREMENTS.md, ROADMAP.md: user decisions and success criteria verified
- XDG Base Directory Specification: https://specifications.freedesktop.org/basedir/basedir-spec-latest.html

### Secondary (MEDIUM confidence)
- npm bin field for scoped packages: training data + search results confirm object form `"bin": { "name": "path" }` works correctly for scoped packages
- npm deprecate mechanics: `npm deprecate <pkg> "<message>"` confirmed via npm docs
- Node.js `fs.renameSync` EXDEV limitation: confirmed via Node.js GitHub issues and documentation

### Tertiary (LOW confidence)
- None. All claims verified against source code or official documentation.

## Metadata

**Confidence breakdown:**
- Codebase inventory: HIGH -- read every source file, catalogued every reference
- Path migration design: HIGH -- XDG spec is stable, cross-referenced with roadmap success criteria
- Deprecation mechanics: HIGH -- npm deprecate is well-documented standard tooling
- Migration rollback: MEDIUM -- rollback pattern is standard but edge cases (EXDEV, permissions) need testing
- Windows XDG compatibility: MEDIUM -- XDG on Windows is unconventional but the project already handles Windows paths

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable domain, no fast-moving dependencies)
