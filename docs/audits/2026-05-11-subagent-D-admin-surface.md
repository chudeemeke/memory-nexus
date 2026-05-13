# Subagent D — Admin Surface Audit

**Scope:** `memory install/uninstall/doctor/status/stats`
**Lens:** Stage 0 T1-T8 + C1-C3 (esp. C3 not another fragmented surface)

## 1. Inventory

| Command | File | Help (verbatim) |
|---|---|---|
| `install` | `commands/install.ts` | "Install Claude Code hooks for automatic session sync" |
| `uninstall` | `commands/uninstall.ts` | "Remove Claude Code hooks for automatic session sync" |
| `doctor` | `commands/doctor.ts` | "Check system health and diagnose issues" |
| `status` | `commands/status.ts` | "Show hook installation status and configuration" |
| `stats` | `commands/stats.ts` | "Show database statistics" |

Health logic in `infrastructure/database/health-checker.ts` (doctor only); hook install in `infrastructure/hooks/settings-manager.ts` (all five).

## 2. Per-command verdict

- **install/uninstall** — Designed. Idempotent (install.ts:78-82; uninstall.ts:70-73). Reversible via `--restore` (uninstall.ts:75-79). Side effects bounded to `~/.claude/settings.json` + hook script. Stale-marker check (install.ts:123-157) is accreted-but-handled migration debt for legacy `memory-nexus` name.
- **doctor** — Substantive. SQLite `PRAGMA integrity_check` (doctor.ts:104 enum `"ok"|"corrupted"|"unknown"`), directory writability, FTS5, sqlite-vec version, embedding readiness + reason, vector-coverage percent (doctor.ts:230-236), config validation, qmd detection (doctor.ts:242-247), migration status (doctor.ts:417-424). Tiered exits 0/1/2 = healthy/degraded/broken (doctor.ts:296-310). `--fix` actually mkdirs (doctor.ts:319-358). NOT stub-existence.
- **status** — Hook install, six config flags, last sync, pending sessions, embedding background PID/progress (status.ts:262-277). Live state. **[inference]** Local run failed in worktree (likely background-embedder import path); source surface is well-formed.
- **stats** — DB metrics. Verified run: 2,953 sessions / 318,119 messages / 1.2 GB / 10-project breakdown. Output appends a duplicated hooks section.

## 3. Overlap analysis (load-bearing for C3)

**Hook status** computed by ALL THREE (`checkHooksInstalled`): doctor via health-checker.ts:251, status.ts:150, stats.ts:178.

**Pending-session count** computed by BOTH status.ts:165-179 AND stats.ts:181-194 — same `discoverSessions()` + extraction-state loop, duplicated verbatim.

**Auto-sync flag** appears in status (status.ts:251), stats (HooksSummary.autoSync), and doctor (doctor.ts:189-190).

Verified by running `stats`: output includes its own "Hooks: Installed: no / Auto-sync: enabled / Pending sessions: 10" section AND the same "Run 'aidev memory install'" recommendation as status.ts:281 and doctor.ts:354. Three commands, one recommendation, three implementations.

doctor uniquely: integrity, permissions, embedding-reason, qmd, migration. status uniquely: embedding background PID. stats uniquely: per-project counts. Each ALSO carries duplicated hook-summary bolted on.

## 4. install/uninstall

Idempotent + reversible (citations §2). One-command setup. No DB writes. Friction-low for C1.

## 5. C1 + C3

**C1:** SATISFIED. One command (`memory install`); capture then automatic.

**C3:** VIOLATED INTERNALLY. The admin surface is itself fragmented — three commands answer "system OK?" with overlapping output and hook-status is implemented three times. A user/agent facing three commands with overlapping output IS the worry the user voiced, in miniature. Remedy: consolidation (one canonical health surface with detail flags), not federation.

## 6. Would you build this differently?

**Yes [context-dependent — medium].** From scratch:

- **One** `memory health` (subsumes doctor + status) with `--db`, `--hooks`, `--embedding`, `--config`, `--all`. Tiered exits preserved.
- **One** `memory stats` for data-shape ("what's stored?") — keep separate from health ("is it OK?").
- **install/uninstall** retained — writes, distinct from inspection.

Net: 4 commands; `gatherHooksSummary` / pending-session loop / install-recommendation live in one place.

**[local-confidence-high]** duplication is real (Grep + line citations).
**[context-dependent-medium]** consolidation is the right call — Stage 2 may show "doctor" is tool-conventional worth preserving alongside `status` as aliases over one implementation.

The admin surface looks accreted around feature-area growth: each new subsystem (hooks → sync → embeddings → sqlite-vec) added itself to whichever command was most convenient rather than to a canonical health surface designed for the purpose.
