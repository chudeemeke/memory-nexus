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

# Audit durable memory surfaces for suspected secrets
memory audit-secrets

# Query durable friction signals for first-party tooling
memory friction list --tool aidev --since 2026-06-01 --count --min 3

# Create and verify a full local backup before risky changes
memory backup create --json
memory backup verify <backup-id> --json

# Restore only after a dry-run has passed
memory restore <backup-id> --dry-run --json
memory restore <backup-id> --confirm

# Check upgrade readiness and projection replay safety
memory doctor --upgrade
memory migrate --dry-run --json
memory migrate --confirm
memory projections rebuild --verify

# Propose and review an audited supersedence through canonical events
memory dream propose-supersedence --project memory-nexus --target <fact-uuid> --replacement "Updated fact" --reason "Supersedes stale guidance"
memory dream approve <dream-id>
memory dream apply <dream-id> --confirm
```

Machine consumers should use `memory friction list --json`; see [Friction Query Contract](docs/reference/friction-query-contract.md) for the versioned envelope, filter semantics, privacy behavior, and exit codes.

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
| Legacy memory files | `~/.memory/` | `MEMORY_HOME` |

Tool-managed paths follow the XDG Base Directory Specification. Override with `XDG_CONFIG_HOME` and `XDG_DATA_HOME`.

Legacy memory files are retained for compatibility with pre-v4 markdown sidecars. They are not read or written by default. To index them during sync, use `memory sync --include-memory-files`, set `MEMORY_LEGACY_MEMORY_FILES=1`, or set `legacyMemoryFiles.enabled=true` in config. To generate legacy daily logs with `memory backfill`, pass `--write-memory-files` or use the same env/config opt-in. `MEMORY_HOME` follows the `GNUPGHOME` / `JAVA_HOME` tradition: the value is the exact directory path, not a base directory under which a subdirectory is appended. Empty string is ignored; no `~` expansion.

## Local Backup, Restore, And Upgrade Safety

`memory export` and `memory import` are JSON interchange commands for older database-shaped data. They are not full v5 backups. Newer v5 surfaces include SQLite projection tables and canonical event logs, so use `memory backup` before risky local operations:

```bash
memory backup create --json
memory backup verify <backup-id> --json
```

`memory restore` is a local-state restore command. It verifies the backup first, supports a non-mutating dry-run, and requires explicit confirmation before it overwrites database, config, or event-log files. Sparse backups restore only the components present in their manifest; omitted database, config, or event-log components are left untouched and reported as warnings instead of being deleted.

```bash
memory restore <backup-id> --dry-run --json
memory restore <backup-id> --confirm
```

Upgrade and portability work should follow the same safe path:

```bash
memory doctor --upgrade
memory migrate --dry-run --json
memory migrate --confirm
memory projections rebuild --verify
memory projections rebuild --confirm
```

## Secret Handling

Remote provider credentials should come from environment injection, not plaintext config files. `embedding.apiKey` is retained only as deprecated compatibility input.

Use `apiKeyEnv` when a provider needs a runtime key:

```json
{
  "embedding": {
    "provider": "openai",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

Use `apiKeyRef` only as opaque metadata for an external secret manager:

```json
{
  "embedding": {
    "provider": "openai",
    "apiKeyRef": "authkey://memory/openai-api-key"
  }
}
```

`memory` never resolves `apiKeyRef` to a raw secret and never calls `authkey get`. If you use authkey, inject secrets into the child process:

```bash
authkey run --env memory -- memory sync --embed
authkey run --env memory -- memory extract memory-nexus
```

Known secret patterns in newly synced transcript content, tool inputs/results, extraction payloads, embeddings, and CLI JSON exports are redacted before storage or provider egress. Raw JSON exports require explicit opt-in:

```bash
memory export backup.json --include-sensitive
```

Run a read-only scan of the database and event logs before publishing, syncing to a remote, or reviewing older data:

```bash
memory audit-secrets
memory audit-secrets --json
```

Remediation is explicit. Database redaction rewrites mutable stored fields and rebuilds FTS indexes; event-log quarantine moves raw logs aside and writes sanitized active replacements:

```bash
memory audit-secrets --redact-db --quarantine-events --report audit-report.json
```

## Provider Support

Provider support is explicit and registry-backed. Built-in embedding providers are `local`, `openai`, `ollama`, and `openai-compatible`. Built-in extraction providers are `claude-cli`, `anthropic`, `openai`, `ollama`, and `openai-compatible`.

Use `openai-compatible` for gateways or providers that expose OpenAI-compatible APIs:

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "baseUrl": "https://gateway.example.com/v1",
    "apiKeyEnv": "MEMORY_GATEWAY_API_KEY"
  }
}
```

`LLM_PROVIDER` selects the extraction provider. `LLM_MODEL` overrides the extraction model without changing embedding configuration.

Remote provider egress is deny-by-default until the config grants consent and the target provider or host is allowlisted. Local providers do not require egress consent.

```json
{
  "providerEgress": {
    "consent": "granted",
    "allowedHosts": ["api.openai.com", "api.anthropic.com"],
    "allowedProviders": ["openai", "anthropic", "claude-cli"]
  }
}
```

`memory status` and `memory doctor` report provider egress readiness without printing secrets. The experimental Git remote-sync path also runs an event-log secret preflight before any push and blocks remote sync until active logs are clean or quarantined.

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
  executeBackupCreateCommand,
  executeBackupVerifyCommand,
  executeRestoreCommand,
  executeMigrateCommand,
  executeProjectionsRebuildCommand,
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
| `executeAuditSecretsCommand` | `options: AuditSecretsOptions` | `Promise<CommandResult>` |
| `executePurgeCommand` | `options: PurgeCommandOptions` | `Promise<CommandResult>` |
| `executeExportCommand` | `outputPath: string, options: ExportOptions` | `Promise<CommandResult>` |
| `executeImportCommand` | `inputPath: string, options: ImportOptions` | `Promise<CommandResult>` |
| `executeBackupCreateCommand` | `outputDir?: string, opts?: LocalBackupCommandOptions, options?: LocalBackupCliOptions` | `Promise<CommandResult>` |
| `executeBackupVerifyCommand` | `backupDir: string, opts?: LocalBackupCommandOptions, options?: LocalBackupCliOptions` | `Promise<CommandResult>` |
| `executeRestoreCommand` | `backupDir: string, opts?: LocalBackupCommandOptions, options?: LocalBackupCliOptions` | `Promise<CommandResult>` |
| `executeMigrateCommand` | `options: MigrateCommandOptions` | `Promise<CommandResult>` |
| `executeProjectionsRebuildCommand` | `opts?: ProjectionCommandOptions, options?: ProjectionCliOptions` | `Promise<CommandResult>` |
| `executeCompletionCommand` | `shell: string` | `CommandResult` |

### CommandResult

```typescript
interface CommandResult {
  exitCode: number; // 0 = success, 1 = error/not found/findings, 2 = operational/remediation failure where used
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

### Quality gates

```bash
bun run typecheck
bun run build
bun test --timeout 15000
bun run test:isolation
bun run test:coverage
bun audit
gitleaks detect --no-banner --redact --source .
```

`bun run quality` runs the release gate sequence. `bun run test:coverage` uses an Istanbul-backed Bun harness and is intentionally strict: statements, branches, functions, and lines must each be available and at least 95%. Missing metrics fail the gate.

### Published package smoke

After publishing, verify registry metadata plus npm and Bun global installs:

```bash
bun run verify:published @chude/memory@4.0.2
```

On Windows, Bun global install creates `memory.exe` in `bun pm bin -g`. Do not assume an npm-style `memory.cmd` shim exists.

### Running tests on Windows

Current 2026-05-28 verification has `bun test --timeout 15000` passing on Windows 11 with Bun 1.3.5. A previous full-suite run crashed with Bun's `panic(main thread): integer overflow` signature at ~6.8GB peak memory pressure; keep the subdirectory workaround available if that upstream runtime crash returns.

Fallback workaround: run the suite by subdirectory.

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

Linux and macOS contributors should run the full suite normally.

## License

MIT
