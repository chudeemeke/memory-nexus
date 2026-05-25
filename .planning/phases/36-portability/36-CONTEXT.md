# Phase 36 Context: Database & Hook Portability

This document outlines the architectural requirements and design decisions for implementing **Phase 36: Portability** in `memory-nexus`. It details cross-environment database migration (such as migrating codebases from native Windows to WSL/Linux), diagnostics for environment mismatches, and hooks re-establishment.

---

## 1. The Portability Challenge

Developer agents and users frequently work in cross-environment configurations—for example, editing code in Windows but compiling and running terminal processes inside a WSL (Windows Subsystem for Linux) container, or transitioning entire developer sessions to a new Linux machine.

This introduces three critical environmental mismatches:

1. **Path Formatting Slashes (`\` vs `/`):** 
   - Windows databases store paths utilizing backslashes (e.g. `C:\Users\Destiny\Projects\memory-nexus`).
   - WSL and Linux systems utilize forward slashes (e.g. `/home/destiny/Projects/memory-nexus`).
   - When the database is opened in a new environment, session paths and resolved project scopes must degrade gracefully, and diagnostics should identify path mismatches.

2. **SQLite WAL (Write-Ahead Logging) Sidecars:**
   - SQLite databases running in WAL mode rely on `.db-wal` (write-ahead log) and `.db-shm` (shared memory) sidecar files.
   - If the main `.db` file is moved or copied between platforms while WAL changes are uncheckpointed (uncommitted from WAL to the main database file), those changes will be lost or corrupted.
   - We must perform a hard WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) before cross-environment migration to flush all uncommitted updates into the primary single database file, making it safe to transfer.

3. **Git Hooks Environment Mismatch:**
   - Git hooks are shell/executable scripts written to `.git/hooks/post-commit` (or similar) inside watched projects.
   - Git hooks created in Windows reference the Windows `memory` executable path and path patterns.
   - If the project is checked out or executed inside WSL/Linux, those Windows hook paths will fail. Re-running environment-specific hook installations resolves this.

---

## 2. Key Architectural Components

### A. The `migrate` Command (`memory migrate --from-windows`)
A dedicated command to prepare a database for platform transitions:
* **WAL Checkpointing:** Executes `PRAGMA wal_checkpoint(TRUNCATE)` to commit and truncate sidecar logs.
* **Integrity Validation:** Executes `PRAGMA integrity_check` to ensure the database file is structurally sound and free from page corruptions.
* **Hook Re-establishment:** Cleans up legacy hooks and registers WSL/Unix-compliant hook scripts in the new environment context.
* **Session Summarization:** Queries session tables to print a clean summary of session metrics grouped by project, confirming that all transferred data is intact.

### B. Health Portability Check (`memory doctor --portability`)
Extends the diagnostics engine inside `doctor`:
* **Path Dialect Scan:** Analyzes session records to detect mixed path slashes (Windows backslashes vs Unix slashes) or absolute drive letters.
* **Orphaned Paths Scan:** Checks if database-stored workspace paths actually exist on the current filesystem, reporting any disconnected project states.
* **Vector Vector Engine Verification:** Validates that the fast vector search extension (`sqlite-vec`) is natively available in the target environment.

---

## 3. Implementation Steps

1. **New command registration:** Create `src/presentation/cli/commands/migrate.ts` and export/register it in `commands/index.ts` and `cli/index.ts`.
2. **Add --portability option to doctor command:** Modify `doctor.ts` to support the `--portability` option and implement portability checks.
3. **Write robust unit/integration tests:** Standard vitest coverages (statements, branches, functions, lines $\ge 95\%$) for both the new `migrate` command and the updated portability diagnostics inside `doctor`.
4. **Draft user-facing migration documentation:** Provide step-by-step instructions.
