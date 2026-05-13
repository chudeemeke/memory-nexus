# @chude/memory

Cross-project context persistence for Claude Code sessions.

## Problem

Claude Code sessions are per-directory and deleted after 30 days. Context does not transfer between projects. Knowledge gained in one project is invisible to work in another.

## Solution

Extract session JSONL files into a searchable SQLite database accessible from any project via the `memory` CLI.

## Installation

```bash
bun add -g @chude/memory
```

## Setup

Install Claude Code hooks for automatic session sync:

```bash
memory install
```

Verify installation:

```bash
memory doctor
```

## Usage

```bash
# Sync sessions to database
memory sync

# Search across all sessions
memory search "authentication patterns"

# Get context for a specific project
memory context wow-system

# List recent sessions
memory list

# Show session details
memory show <session-id>

# Find related sessions
memory related <session-id>

# Browse sessions interactively
memory browse
```

## How It Works

1. Claude Code stores sessions as JSONL files in `~/.claude/projects/`
2. `memory sync` extracts messages, topics, and entities into a SQLite database with FTS5
3. Claude Code hooks trigger background sync automatically on session end
4. `memory search` and `memory context` query the database from any project directory

## Data Paths

| Purpose | Path | Override |
|---------|------|----------|
| Config | `~/.config/memory/config.json` | `XDG_CONFIG_HOME` |
| Database | `~/.local/share/memory/memory.db` | `XDG_DATA_HOME` |
| Logs | `~/.local/share/memory/logs/` | `XDG_DATA_HOME` |
| Memory files | `~/.memory/` | `MEMORY_HOME` |

Tool-managed paths follow the XDG Base Directory Specification. Override with `XDG_CONFIG_HOME` and `XDG_DATA_HOME`.

The memory-files directory holds agent-written markdown (decisions, learnings, daily logs, per-project notes). Override with `MEMORY_HOME` for sandboxed runs, container/CI workflows, or multi-instance setups. `MEMORY_HOME` follows the `GNUPGHOME` / `JAVA_HOME` tradition: the value is the exact directory path, not a base directory under which a subdirectory is appended. Empty string is ignored; no `~` expansion.

## AI-First Design

This tool is designed for Claude to use via the Bash tool:

```bash
# Claude runs these commands to access cross-project knowledge
memory context <project-name>
memory search "query" --limit 5
```

Standard CLI output works for both humans and AI agents.

## Programmatic API

Install as a dependency:

```bash
bun add @chude/memory
```

Import and call execute functions:

```typescript
import {
  executeSyncCommand,
  executeSearchCommand,
  executeContextCommand,
  type CommandResult,
  type SyncCommandOptions,
  type SearchCommandOptions,
  type SearchMode,
} from "@chude/memory";

// Sync sessions to database
const syncResult = await executeSyncCommand({ quiet: true });
// syncResult: { exitCode: 0 }

// Search sessions
const searchResult = await executeSearchCommand("authentication patterns", {
  limit: "5",
  json: true,
});

// Get project context
const contextResult = await executeContextCommand("my-project", {
  json: true,
  days: 7,
});
```

### Exported Functions

| Function | Parameters | Returns |
|----------|------------|---------|
| `executeSyncCommand` | `options: SyncCommandOptions` | `Promise<CommandResult>` |
| `executeSearchCommand` | `query: string, options: SearchCommandOptions` | `Promise<CommandResult>` |
| `executeListCommand` | `options: ListCommandOptions` | `Promise<CommandResult>` |
| `executeStatsCommand` | `options: StatsCommandOptions` | `Promise<CommandResult>` |
| `executeContextCommand` | `project: string, options: ContextCommandOptions` | `Promise<CommandResult>` |
| `executeRelatedCommand` | `sessionId: string, options: RelatedCommandOptions` | `Promise<CommandResult>` |
| `executeShowCommand` | `sessionId: string, options: ShowCommandOptions` | `Promise<CommandResult>` |
| `executeBrowseCommand` | `options: BrowseCommandOptions` | `Promise<CommandResult>` |
| `executeInstallCommand` | `options: InstallOptions` | `Promise<CommandResult>` |
| `executeUninstallCommand` | `options: UninstallOptions` | `Promise<CommandResult>` |
| `executeStatusCommand` | `options: StatusOptions` | `Promise<CommandResult>` |
| `executeDoctorCommand` | `options: DoctorOptions` | `Promise<CommandResult>` |
| `executePurgeCommand` | `options: PurgeCommandOptions` | `Promise<CommandResult>` |
| `executeExportCommand` | `outputPath: string, options: ExportOptions` | `Promise<CommandResult>` |
| `executeImportCommand` | `inputPath: string, options: ImportOptions` | `Promise<CommandResult>` |
| `executeCompletionCommand` | `shell: string` | `CommandResult` |

### CommandResult

```typescript
interface CommandResult {
  exitCode: number; // 0 = success, 1 = error/not found
}
```

All functions handle their own database initialization and teardown. They never call `process.exit()`.

### Domain Types

The following domain types are exported for TypeScript consumers who need typed search and stats operations:

| Type | Description |
|------|-------------|
| `SearchMode` | Union type: `"auto" \| "fts" \| "vector" \| "hybrid"`. Controls search strategy. |
| `HybridSearchOptions` | Extends `SearchOptions` with `mode` and `noDecay` fields for hybrid search. |
| `IStatsService` | Port interface for database statistics queries. |
| `StatsResult` | Return type from `IStatsService.getStats()`: session/message/tool-use totals, database size, and per-project breakdown. |
| `ProjectStats` | Per-project statistics: `projectName`, `sessionCount`, `messageCount`. |

```typescript
import type {
  SearchMode,
  HybridSearchOptions,
  IStatsService,
  StatsResult,
  ProjectStats,
} from "@chude/memory";

// Typed search options
const opts: HybridSearchOptions = {
  mode: "hybrid" satisfies SearchMode,
  limit: 10,
};

// Typed stats result
function processStats(stats: StatsResult): void {
  console.log(`${stats.totalSessions} sessions, ${stats.totalMessages} messages`);
  stats.projectBreakdown.forEach((p: ProjectStats) => {
    console.log(`  ${p.projectName}: ${p.messageCount} messages`);
  });
}
```

## Previously Published As

This package was previously published as `memory-nexus`. The old package name now installs a deprecation stub. See [MIGRATION.md](MIGRATION.md) for upgrade instructions.

## Development

### Running tests on Windows

The full-suite run `bun test` crashes on Windows 11 with Bun 1.3.5 due to an upstream Bun runtime integer overflow at ~6.8GB peak memory pressure. The signature is `panic(main thread): integer overflow` with a `KERNEL32.DLL` -> `ntdll.dll` stack — Bun internals, not project code. Tracked at `docs/inbox/2026-05-11-memory-nexus-bun-windows-full-suite-crash.md`.

Workaround: run the suite by subdirectory.

```bash
bun test src/infrastructure/
bun test src/presentation/
bun test src/application src/domain
bun test tests/helpers tests/generators tests/infrastructure tests/integration tests/smoke
```

Or run a single file directly:

```bash
bun test src/path/to/file.test.ts
```

Linux and macOS contributors run the full suite normally — this is a Windows-specific Bun bug.

## License

MIT
