# Cross-Environment Portability Pitfalls

**Context:** @chude/memory migration from Windows native (Git Bash + Bun) to WSL2 (Bun)
**Researched:** 2026-04-02
**Confidence:** HIGH (verified against source code, official SQLite docs, and bun:sqlite issue tracker)

## Executive Summary

Migrating the memory database from Windows-native Bun to WSL2 Bun is feasible but requires deliberate handling of seven distinct portability concerns. The SQLite database file itself is fully portable (endianness, page size are platform-independent). The real risks are: WAL/SHM sidecar files that must NOT be copied, path-dependent data stored in the database that will point to wrong locations, sqlite-vec requiring a different native binary, and Claude Code itself producing different encoded directory names on WSL2.

The most impactful pitfall is that **existing session data in the database will reference Windows paths** while new WSL2 sessions will use Linux paths. This creates a split-brain scenario where `memory context <project>` may not find all sessions for a project. The recommended mitigation is a one-time migration script in the v4.0 portability phase.

## Pitfall 1: WAL and SHM Sidecar Files

**Severity:** CRITICAL
**What goes wrong:** Copying `.db-wal` and `.db-shm` files alongside the main database causes corruption or stale state on the destination machine.
**Confidence:** HIGH (verified with SQLite official documentation)

### Root Cause

SQLite WAL mode creates two sidecar files:
- `.db-wal` (Write-Ahead Log): Contains uncommitted transactions
- `.db-shm` (Shared Memory): Contains a memory-mapped index for coordinating concurrent readers

The SHM file uses **native byte order** of the host machine (not the portable big-endian format used by the main database). While x86 Windows and x86 WSL2 share the same endianness (little-endian), the SHM file contains memory-mapped regions with process-local state that is meaningless on another machine.

More critically, the WAL file may contain transactions that were committed but not yet checkpointed into the main database. Copying only the `.db` file without the `.db-wal` file means **losing those transactions**.

### Current Code Protection

The codebase already handles this correctly in `closeDatabase()` (connection.ts:252-266):
```typescript
export function closeDatabase(db: Database): void {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    db.exec("PRAGMA journal_mode = DELETE;");
    db.close();
}
```

This checkpoints all WAL data into the main file and switches to DELETE mode, which removes the WAL/SHM files. The migration module (`migration.ts:165-172`) also has `cleanupDatabaseSidecars()` that deletes stale `-wal` and `-shm` files.

### Migration Protocol

1. Run `memory sync` to finalize any pending extractions
2. Close the database properly (the CLI does this on exit via `closeDatabase()`)
3. Copy **only** `memory.db` -- never copy `.db-wal` or `.db-shm`
4. If WAL/SHM files exist at the destination, delete them before opening the database
5. `initializeDatabase()` will re-enable WAL mode on first open in WSL2

### Windows-Specific Complication

Bun on Windows has a known bug (oven-sh/bun#25964) where WAL mode holds file locks beyond `close()`. The main `.db` file remains locked by the process even after calling `db.close()`. This does not affect data integrity during migration (the checkpoint happens before close), but it means you may need to wait for the Bun process to fully terminate before copying the file.

**Risk assessment:** LOW if migration protocol is followed. The existing codebase already does WAL checkpointing on close.

### Sources
- [SQLite WAL Documentation](https://sqlite.org/wal.html)
- [SQLite WAL Format](https://sqlite.org/walformat.html)
- [Bun #25964: SQLite WAL lock on Windows](https://github.com/oven-sh/bun/issues/25964)


## Pitfall 2: Path Encoding Divergence Between Environments

**Severity:** CRITICAL
**What goes wrong:** Claude Code encodes project directory paths differently on Windows vs WSL2. The encoded directory names under `~/.claude/projects/` will differ, causing the database to contain mixed Windows and Linux path data.
**Confidence:** HIGH (verified in source code: `ProjectPath` value object, `PathDecoder` service)

### How Claude Code Encodes Paths

From the `ProjectPath` value object (project-path.ts:116-126), Claude Code encodes paths by replacing separators with dashes:

| Character | Encoded As | Example |
|-----------|-----------|---------|
| `:\` (Windows drive) | `--` (double dash) | `C:\` becomes `C--` |
| `\` (backslash) | `-` | path separators |
| `/` (forward slash) | `-` | path separators |
| ` ` (space) | `-` | folder names with spaces |
| `-` (hyphen) | `-` | unchanged, but lossy |

### Windows vs WSL2 Examples

The same physical project produces different encoded paths:

| Environment | Physical Path | Encoded |
|-------------|---------------|---------|
| Windows Git Bash | `C:\Users\Destiny\Projects\memory-nexus` | `C--Users-Destiny-Projects-memory-nexus` |
| WSL2 | `/home/chude/Projects/memory-nexus` | `-home-chude-Projects-memory-nexus` |
| WSL2 via /mnt/c | `/mnt/c/Users/Destiny/Projects/memory-nexus` | `-mnt-c-Users-Destiny-Projects-memory-nexus` |

### Impact on Database

The database stores three path columns per session (schema.ts:16-18):
- `project_path_encoded` -- the encoded form (used as lookup key)
- `project_path_decoded` -- the decoded form (used for display)
- `project_name` -- the last path segment (used for `memory context`)

After migration, **all existing sessions will have Windows-encoded paths**. New sessions synced from WSL2 will have Linux-encoded paths. Running `memory context memory-nexus` will work (it matches on `project_name`, not encoded path), but session lookups by encoded path will fail to correlate old and new sessions.

### Impact on Extraction State

The `extraction_state` table uses `session_path` (the full filesystem path to the JSONL file) as a unique key for incremental sync. After migration to WSL2:

- Old extraction state entries point to Windows paths: `C:\Users\Destiny\.claude\projects\C--Users-...`
- New JSONL files live at Linux paths: `/home/chude/.claude/projects/-home-chude-...`

Incremental sync will treat all WSL2 sessions as brand new (no matching extraction state), which is actually the correct behavior since the session files themselves are different (different machine, different Claude Code install).

### Mitigation

**Option A (recommended): Do nothing special.** The `project_name` field is what `memory context` and `memory search --project` actually use. Old Windows sessions and new WSL2 sessions will both be searchable. The encoded/decoded path columns are informational -- they record where the session came from, which is historically accurate.

**Option B (if correlation is needed): Add a migration step** that creates canonical project aliases in a new table, mapping different encoded paths to the same logical project.

### Sources
- Source code: `src/domain/value-objects/project-path.ts`
- Source code: `src/domain/services/path-decoder.ts`
- Source code: `src/infrastructure/database/schema.ts`


## Pitfall 3: os.homedir() Returns Different Paths

**Severity:** HIGH
**What goes wrong:** `os.homedir()` returns `C:\Users\Destiny` on Windows Git Bash but `/home/chude` (or whatever the WSL user is) on WSL2. This affects every path the tool resolves.
**Confidence:** HIGH (Node.js documented behavior; Bun follows the same convention)

### Affected Path Resolution

The `paths.ts` module (infrastructure/paths.ts:59-69, 82-93) uses `homedir()` to resolve all data paths:

| Path | Windows Git Bash | WSL2 |
|------|-----------------|------|
| Config | `C:\Users\Destiny\.config\memory` | `/home/chude/.config/memory` |
| Database | `C:\Users\Destiny\.local\share\memory\memory.db` | `/home/chude/.local/share/memory/memory.db` |
| Logs | `C:\Users\Destiny\.local\share\memory\logs` | `/home/chude/.local/share/memory/logs` |
| Hooks | `C:\Users\Destiny\.local\share\memory\hooks` | `/home/chude/.local/share/memory/hooks` |
| Claude dir | `C:\Users\Destiny\.claude\projects` | `/home/chude/.claude/projects` |
| Legacy | `C:\Users\Destiny\.memory-nexus` | `/home/chude/.memory-nexus` |

### Impact

This is actually **desired behavior** -- each environment resolves to its own local paths. The migration concern is ensuring:

1. The database file is placed at the correct WSL2 path (`~/.local/share/memory/memory.db`)
2. The config file is copied to the correct WSL2 path (`~/.config/memory/config.json`)
3. The hook script is rebuilt for the WSL2 environment (different binary path)

### Mitigation

1. After copying `memory.db` to the WSL2 XDG data path, run `memory install` to set up hooks
2. If custom config exists, copy `config.json` to the WSL2 XDG config path
3. The tool will resolve all other paths correctly via `homedir()` on WSL2

### Sources
- [Node.js os.homedir() documentation](https://nodejs.org/api/os.html)
- Source code: `src/infrastructure/paths.ts`


## Pitfall 4: XDG Base Directory Behavior on Windows

**Severity:** MEDIUM
**What goes wrong:** XDG Base Directory paths (`~/.config/`, `~/.local/share/`) are a Unix convention. On Windows, these directories exist but are non-standard.
**Confidence:** HIGH (verified in source code and XDG specification)

### Current Implementation

The `paths.ts` module respects XDG env vars with fallbacks:
1. `$XDG_CONFIG_HOME/memory` if set
2. `~/.config/memory` otherwise
3. `$XDG_DATA_HOME/memory` if set
4. `~/.local/share/memory` otherwise

### Windows Git Bash Behavior

On Windows via Git Bash, `XDG_CONFIG_HOME` and `XDG_DATA_HOME` are typically NOT set. The fallback `~/.config/memory` resolves to `C:\Users\Destiny\.config\memory`. This path is valid on Windows (NTFS supports dots in folder names) but non-standard.

### WSL2 Behavior

On WSL2, the same fallback resolves to `/home/chude/.config/memory` -- the standard XDG location on Linux. If the user has set `XDG_CONFIG_HOME` or `XDG_DATA_HOME` in their WSL2 shell profile, those take precedence.

### Risk Assessment

LOW. The code handles both environments correctly. The only risk is if someone has set XDG vars in their Windows Git Bash environment but not in WSL2 (or vice versa), which would cause the database to be looked for in a different location. This is unlikely.

### Sources
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/basedir-spec-latest.html)
- Source code: `src/infrastructure/paths.ts`


## Pitfall 5: sqlite-vec Native Binary Mismatch

**Severity:** HIGH
**What goes wrong:** sqlite-vec uses platform-specific native binaries (`.dll` on Windows, `.so` on Linux). The Windows binary will not work on WSL2.
**Confidence:** HIGH (verified by reading the sqlite-vec npm package source code in node_modules)

### How sqlite-vec Loads

The `sqlite-vec` npm package (v0.1.6) uses optional dependencies for platform-specific binaries:

```json
{
  "optionalDependencies": {
    "sqlite-vec-linux-arm64": "0.1.6",
    "sqlite-vec-windows-x64": "0.1.6",
    "sqlite-vec-darwin-x64": "0.1.6",
    "sqlite-vec-linux-x64": "0.1.6",
    "sqlite-vec-darwin-arm64": "0.1.6"
  }
}
```

At runtime, `index.cjs` detects `process.platform` and `process.arch`, then loads the matching native extension:

```javascript
function platformPackageName(platform, arch) {
  const os = platform === "win32" ? "windows" : platform;
  return `sqlite-vec-${os}-${arch}`;
}
// Looks for: node_modules/sqlite-vec-windows-x64/vec0.dll (Windows)
// Looks for: node_modules/sqlite-vec-linux-x64/vec0.so (WSL2)
```

### Impact

- On Windows, `bun install` downloads `sqlite-vec-windows-x64` containing `vec0.dll`
- On WSL2, `bun install` downloads `sqlite-vec-linux-x64` containing `vec0.so`
- If you copy `node_modules/` from Windows to WSL2, the `.dll` will fail to load
- The `connection.ts:59-69` `loadSqliteVecExtension()` function handles this gracefully -- it catches the error and returns `false`, disabling vector search

### The Database File Is Fine

The vec0 virtual table data stored inside the SQLite database is platform-independent. The `.dll`/`.so` is only needed at runtime to interpret vec0 tables. After `bun install` on WSL2 installs the Linux binary, the existing database with vec0 data will work.

### Mitigation

1. Run `bun install` on WSL2 to get the correct `sqlite-vec-linux-x64` binary
2. The existing database file with embedded vec0 data will work immediately
3. If sqlite-vec fails to load, the tool degrades gracefully to FTS5-only search

### Risk Assessment

LOW. The code already handles sqlite-vec load failure gracefully. A fresh `bun install` on WSL2 resolves this automatically.

### Sources
- Source code: `node_modules/sqlite-vec/index.cjs` (platform detection logic)
- Source code: `node_modules/sqlite-vec/package.json` (optional dependencies)
- Source code: `src/infrastructure/database/connection.ts:59-69` (graceful fallback)
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)


## Pitfall 6: File Path Separators in Stored Data

**Severity:** MEDIUM
**What goes wrong:** The database stores paths from JSONL event data that use Windows backslashes. These paths will not resolve on WSL2.
**Confidence:** HIGH (verified in architecture docs showing JSONL event format)

### Affected Data

Several tables store filesystem paths extracted from session JSONL data:

| Table | Column | Example Value (Windows) |
|-------|--------|------------------------|
| `sessions` | `project_path_decoded` | `C:\Users\Destiny\Projects\memory-nexus` |
| `extraction_state` | `session_path` | `C:\Users\Destiny\.claude\projects\C--Users-...\abc.jsonl` |
| `tool_uses` | `input_json` | `{"file_path": "C:\\Users\\Destiny\\..."}` (from Read/Write tool uses) |
| `memory_files` | `file_path` | `C:\Users\Destiny\.memory\daily\...` |

### Impact

- `project_path_decoded`: Informational only. Used for display, not for file operations. Old sessions will show Windows paths -- this is historically accurate and acceptable.
- `extraction_state.session_path`: Used for incremental sync. Old entries will never match new WSL2 paths, so incremental sync will treat WSL2 sessions as new. This is correct behavior.
- `tool_uses.input_json`: Stores raw tool input. Historical data, not used for file operations. No impact.
- `memory_files.file_path`: Used to check if a file has been indexed. After migration, memory files on WSL2 will have different paths, so all will be re-indexed. This is correct.

### Mitigation

No code changes needed. The path data is historical record (where things were when they happened). New data synced on WSL2 will use Linux paths. The tool uses `project_name` (which is path-independent) for most user-facing operations.

### The Hook Script Path Concern

The `settings-manager.ts:243` builds the hook command using the hook script's absolute path:
```typescript
const command = `bun run "${hookScriptPath.replace(/\\/g, "/")}"`;
```

After migration, `memory install` must be re-run on WSL2 to register the correct path. The old Windows hook path in `~/.claude/settings.json` will not work.


## Pitfall 7: Symlink vs Junction Behavior

**Severity:** LOW
**What goes wrong:** The `ProjectNameResolver` uses `statSync` and `readdirSync` to walk filesystem directories. Windows junctions and Unix symlinks behave differently.
**Confidence:** MEDIUM (based on Node.js documentation and known junction behaviors)

### Current Code

The `ProjectNameResolver` (project-name-resolver.ts) walks from the root directory, matching encoded path segments against actual directory names. It uses:

- `readdirSync(dir, { withFileTypes: true })` to list directories
- `statSync(path).isDirectory()` to probe hidden directories (like iCloudDrive)

### Behavioral Differences

| Behavior | Windows Junction | Unix Symlink |
|----------|-----------------|--------------|
| `readdirSync` | Returns junction name | Returns symlink name |
| `statSync` | Follows junction (returns target stats) | Follows symlink (returns target stats) |
| `isDirectory()` | Returns true for directory junctions | Returns true for directory symlinks |
| Points to files? | No (junctions are directory-only) | Yes (symlinks can point to files) |
| Requires admin? | No (since Windows 10 1703) | No |
| Absolute path only? | Yes (junctions store absolute target) | No (relative paths work) |

### Impact

The user's environment uses a Windows junction `C:\Projects` pointing to the iCloud project directory. On WSL2, a Unix symlink `~/Projects` serves the same purpose. Both `readdirSync` and `statSync` transparently follow both junction and symlink targets, so the `ProjectNameResolver` will work correctly in both environments.

### Risk Assessment

LOW. The Node.js/Bun filesystem APIs abstract away junction vs symlink differences for the operations used by this codebase. The one edge case is if a junction target is on a different drive letter (valid on Windows, no equivalent on Linux), but this is not relevant to the migration scenario.

### Sources
- [Node.js fs API documentation](https://nodejs.org/api/fs.html)
- Source code: `src/infrastructure/sources/project-name-resolver.ts`


## Pitfall 8: SQLite Database File Portability

**Severity:** NONE (non-issue, but worth documenting)
**What goes wrong:** Nothing. SQLite database files are fully portable.
**Confidence:** HIGH (SQLite official documentation)

### Why This Is Not a Problem

The SQLite file format is explicitly designed for cross-platform portability:

- **Endianness:** All multibyte fields in the database file use big-endian format regardless of host architecture. Both Windows x86-64 and Linux x86-64 are little-endian, but even if they differed, SQLite handles the conversion.
- **Page size:** Stored in the database header. The page size chosen when the database was created (typically 4096 bytes) is preserved and used on any platform.
- **Integer sizes:** SQLite uses variable-length integers (varints) that are architecture-independent.
- **Text encoding:** UTF-8 is the default and is platform-independent.
- **FTS5 data:** The FTS5 index data is stored within the regular SQLite B-tree pages using the same portable format.
- **vec0 data:** Vector embedding data stored by sqlite-vec uses the same portable SQLite storage format.

A database created by Bun's SQLite on Windows can be opened by Bun's SQLite on Linux without any conversion.

### Sources
- [SQLite File Format](https://sqlite.org/fileformat.html)
- [SQLite Cross-Platform Features](https://sqlite.org/different.html)


## Migration Checklist

Based on the pitfalls above, here is the step-by-step migration protocol:

### Pre-Migration (on Windows)

1. Run `memory sync` to extract all pending sessions
2. Close any running `memory` processes (let Bun release WAL locks)
3. Verify the database is clean: check that `memory.db-wal` is 0 bytes or absent
4. If WAL file has data, open and close the database with `memory status` (forces checkpoint)

### Copy Phase

5. Copy **only** `memory.db` from `C:\Users\Destiny\.local\share\memory\` to WSL2
6. Place at `~/.local/share/memory/memory.db` on WSL2
7. DO NOT copy `memory.db-wal` or `memory.db-shm`
8. Optionally copy `config.json` from `C:\Users\Destiny\.config\memory\` to `~/.config/memory/`

### Post-Migration (on WSL2)

9. Run `bun install` in the project directory to get Linux-native `sqlite-vec-linux-x64`
10. Run `memory doctor` to verify database integrity
11. Run `memory install` to register hooks in `~/.claude/settings.json`
12. Run `memory sync` to index any existing WSL2 Claude Code sessions
13. Verify with `memory search "test query"` and `memory context <project-name>`

### Verification

14. Old Windows sessions should appear in search results (historical data preserved)
15. New WSL2 sessions should sync correctly (new extraction state entries)
16. `memory context <project>` should find sessions from both environments (uses `project_name`, not encoded path)


## Summary Risk Matrix

| Pitfall | Severity | Likelihood | Mitigation Complexity | Existing Protection |
|---------|----------|------------|----------------------|-------------------|
| WAL/SHM sidecar files | CRITICAL | HIGH (if not aware) | LOW (just don't copy them) | YES (closeDatabase checkpoints) |
| Path encoding divergence | CRITICAL | CERTAIN | LOW (project_name bridges the gap) | PARTIAL (project_name works, encoded path does not) |
| os.homedir() difference | HIGH | CERTAIN | LOW (expected, just place files correctly) | YES (XDG fallback works) |
| sqlite-vec native binary | HIGH | CERTAIN | LOW (bun install resolves) | YES (graceful degradation) |
| File path separators in data | MEDIUM | CERTAIN | NONE (historical data, not used for file ops) | YES (project_name is path-independent) |
| XDG path resolution | MEDIUM | LOW | NONE | YES (correct fallback logic) |
| Symlink vs junction | LOW | LOW | NONE | YES (Node.js APIs abstract this) |
| SQLite file portability | NONE | N/A | N/A | N/A (non-issue) |


## Recommendations for v4.0 Portability Phase

### Must Do

1. **Document the migration protocol** as a user-facing guide (the checklist above)
2. **Add `memory migrate --from-windows`** command that:
   - Verifies the source database has no WAL/SHM files
   - Runs integrity check after placement
   - Re-installs hooks for the current environment
   - Prints a summary of sessions by project_name

### Should Do

3. **Add `memory doctor --portability`** check that detects mixed-environment data:
   - Count sessions with Windows-style vs Unix-style encoded paths
   - Flag if extraction_state has entries pointing to non-existent paths
   - Report sqlite-vec availability

### Nice to Have

4. **Project alias table** for correlating the same logical project across different encoded paths:
   ```sql
   CREATE TABLE project_aliases (
       canonical_name TEXT NOT NULL,
       encoded_path TEXT NOT NULL UNIQUE,
       environment TEXT, -- 'windows', 'wsl2', 'linux', 'macos'
       PRIMARY KEY (canonical_name, encoded_path)
   );
   ```
   This would let `memory context memory-nexus` explicitly merge sessions from `C--Users-...` and `-home-chude-...` encoded paths.

5. **Environment metadata in sessions table**: Add an `environment` column recording the platform where the session was created. Useful for filtering and display.
