# Phase 26: Hooks + Backfill - Research

**Researched:** 2026-03-08
**Domain:** Claude Code hooks infrastructure, Agent SDK (claude -p), daily log backfill
**Confidence:** HIGH

## Summary

This phase has two distinct components: (1) making the PreCompact hook output a memory flush reminder, and (2) building a backfill command that generates daily log entries from historical sessions via `claude -p`.

The hook infrastructure is already complete. The `installHooks()` function in settings-manager.ts already installs both SessionEnd and PreCompact hooks. The `uninstallHooks()` function already removes both. The `checkHooksInstalled()` function already checks for both. The install/uninstall CLI commands already handle both. The doctor command already requires both for "installed" status. The sync-hook-script already reads `hook_event_name` from stdin and checks `config.syncOnCompaction` for PreCompact. The gap is that PreCompact currently triggers the same background sync as SessionEnd, but does NOT output a flush reminder message to stdout. The hook needs to print the reminder to stdout (which Claude reads as the hook's output) before spawning the sync.

The backfill component needs a new service, repository, schema migration, and CLI command. The Agent SDK (`@anthropic-ai/claude-code`) is a CLI binary, not a programmatic library -- it has no `main` or `exports` field in package.json, only a `bin` entry. The backfill must shell out to `claude -p` (print mode) to generate summaries, not import a library function. The CONTEXT.md's pseudocode showing `agentSdk.complete(prompt)` needs to be implemented as `spawn("claude", ["-p", prompt])` instead.

**Primary recommendation:** Split into two parallel tracks: (1) modify sync-hook-script.ts to output a flush reminder on PreCompact before spawning sync, (2) build backfill command as a new domain entity + service + repository + CLI command that shells out to `claude -p` for summary generation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. **PreCompact hook outputs reminder message** -- "echo 'Session nearing compaction. Write important context to ~/.memory/ files now.'"
2. **`memory install` installs both SessionEnd and PreCompact hooks** -- already implemented in settings-manager.ts
3. **`memory uninstall` removes both hooks** -- already implemented
4. **Backfill uses `claude -p` (Agent SDK print mode)** -- not a programmatic library import; shells out to CLI
5. **Backfill generates daily log entries** -- writes to ~/.memory/daily/<date>.md, appends if date already has entries
6. **backfill_state table tracks which sessions are done** -- schema: session_id TEXT PK, backfilled_at TEXT, daily_log_path TEXT, success BOOLEAN, error_message TEXT
7. **Backfill is idempotent** -- tracks state, skips already-processed sessions
8. **--dry-run shows session count and estimated cost** -- requires explicit confirmation before processing
9. **Batch processing with progress bar** -- uses cli-progress (already a dependency), default batch 50
10. **Each session processed independently** -- failure on one does not block others
11. **OAuth status confirmed safe** -- Thariq (Anthropic) confirmed Agent SDK + Max subscription usage is fine for solo developers
12. **Extract user messages + assistant text only** -- skip tool outputs, thinking blocks; cap ~4000 tokens input per session
13. **Daily logs only for backfill** -- not DECISIONS.md or LEARNINGS.md

### Claude's Discretion
1. Should backfill use the SDK programmatically or shell out? -- Research finding: must shell out (`claude -p`), package has no programmatic exports
2. How much session content to send to LLM? -- Follow CONTEXT.md recommendation: user messages + assistant text, cap ~4000 tokens
3. Should backfill generate per-project curated files? -- Follow CONTEXT.md: daily logs only

### Deferred Ideas (OUT OF SCOPE)
- None specified in CONTEXT.md
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | built-in | backfill_state table, session queries | Already used throughout project |
| commander | ^14.0.2 | CLI command registration | Already the CLI framework |
| cli-progress | ^3.12.0 | Backfill progress bar | Already a dependency |
| @anthropic-ai/claude-code | ^2.1.58 | CLI binary for summary generation (`claude -p`) | Already a dependency (used as CLI, not library) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | spawn `claude -p` for summary generation | Every backfill session processing |
| node:fs | built-in | Write daily log markdown files to ~/.memory/daily/ | Output generation |
| crypto | built-in | SHA-256 content hash for daily log files | Sync integration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `claude -p` (shell out) | Anthropic API directly | Would need separate API key, billing; Max subscription covers `claude -p` at no extra cost |
| `claude -p` per session | Batching multiple sessions per prompt | Risk of lower quality summaries; per-session keeps output focused and error isolation clean |

**Installation:** No new dependencies needed. All packages are already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
src/
  domain/
    entities/
      backfill-state.ts           # NEW: BackfillState entity
    ports/
      repositories.ts             # EXTEND: IBackfillStateRepository
  application/
    services/
      backfill-service.ts         # NEW: BackfillService
  infrastructure/
    database/
      schema.ts                   # EXTEND: BACKFILL_STATE_TABLE
      repositories/
        backfill-state-repository.ts  # NEW: SqliteBackfillStateRepository
    hooks/
      sync-hook-script.ts         # MODIFY: add flush reminder output for PreCompact
  presentation/
    cli/
      commands/
        backfill.ts               # NEW: backfill CLI command
```

### Pattern 1: Hook Output for PreCompact Reminder

**What:** When the sync-hook-script detects a PreCompact event, it writes a flush reminder to stdout before spawning the background sync.

**When to use:** PreCompact hooks only. SessionEnd continues to do background sync silently.

**Implementation detail:** Claude Code reads hook stdout as the hook's output message. The hook writes to stdout, which Claude presents to the user. The hook script already reads `hook_event_name` from the stdin JSON. The change is adding a `console.log()` before the sync spawn when event is PreCompact.

```typescript
// In sync-hook-script.ts main():
if (hookInput.hook_event_name === "PreCompact") {
    // Output reminder to stdout -- Claude reads this
    console.log(
        "MEMORY FLUSH: Session nearing compaction. " +
        "Write important context (decisions, unresolved items, learnings) " +
        "to ~/.memory/ files before context is compressed."
    );
}
```

### Pattern 2: BackfillService with External Process

**What:** Application service that orchestrates session selection, content extraction, LLM summarization via `claude -p`, and file writing.

**When to use:** The `memory backfill` command.

**Key design decisions:**
- BackfillService lives in application layer, depends on domain ports only
- The LLM invocation is abstracted behind a port (ISummaryGenerator) so tests can mock it
- File writing uses the existing ~/.memory/ convention from Phase 23
- Progress reporting via callback pattern (same as MemoryFileSyncService)

```typescript
// Domain port for summary generation
interface ISummaryGenerator {
    generateSummary(content: string, sessionId: string, startTime: string, endTime: string): Promise<string>;
}

// Infrastructure adapter shells out to claude -p
class ClaudeSummaryGenerator implements ISummaryGenerator {
    async generateSummary(content: string, sessionId: string, startTime: string, endTime: string): Promise<string> {
        // spawn("claude", ["-p", "--output-format", "text", prompt])
    }
}
```

### Pattern 3: Idempotent Backfill via State Table

**What:** The backfill_state table records which sessions have been processed, enabling resume after interruption and preventing duplicate processing.

**When to use:** Every backfill run queries this table to determine which sessions remain.

```sql
CREATE TABLE IF NOT EXISTS backfill_state (
    session_id TEXT PRIMARY KEY,
    backfilled_at TEXT NOT NULL,
    daily_log_path TEXT NOT NULL,
    success INTEGER DEFAULT 1,
    error_message TEXT
);
```

**Note:** Uses INTEGER for success (SQLite has no native BOOLEAN), matching the pattern used elsewhere in the codebase.

### Anti-Patterns to Avoid
- **Importing @anthropic-ai/claude-code as a library:** The package has no programmatic exports. It only provides a CLI binary. Any `import` from it will either fail or trigger the nested session detection guard.
- **Running claude -p inside a Claude Code session:** The SDK detects the `CLAUDECODE` environment variable and refuses to launch. The backfill command must unset this variable when spawning the child process.
- **Writing all daily logs at once then tracking state:** Must track state per-session as each is processed, not at the end. A crash mid-batch would lose all progress otherwise.
- **Sending full JSONL content to LLM:** JSONL events include tool outputs, thinking blocks, and metadata that dramatically inflate token count. Extract only user messages and assistant text content.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom terminal progress | cli-progress (already dep) | Handles terminal width, ETA, formatting |
| Content hashing | Custom hash function | crypto.createHash("sha256") (built-in) | Standard, matches existing contentHash pattern |
| Daily log file management | Custom file writer | Reuse patterns from MemoryFileScanner/MemoryFileSyncService | Same directory structure, same conventions |
| Session content extraction | New JSONL parser | Existing JSONL parsing infrastructure in src/infrastructure/parsing/ | Already handles event classification, role filtering |

**Key insight:** The backfill command reads from the existing sessions/messages tables (already populated by sync), not from raw JSONL files. The content extraction step queries the database, not the filesystem.

## Common Pitfalls

### Pitfall 1: CLAUDECODE Environment Variable
**What goes wrong:** Spawning `claude -p` from within a `memory backfill` session (which is itself inside Claude Code) triggers the nested session detection guard. The process exits with "Claude Code cannot be launched inside another Claude Code session."
**Why it happens:** The `CLAUDECODE` env var is set in the parent process and inherited by child processes.
**How to avoid:** Strip `CLAUDECODE` from the child process environment when spawning `claude -p`. The existing `spawnBackgroundSync` in hook-runner.ts already demonstrates the pattern of customizing child env: `env: { ...process.env, MEMORY_HOOK: "1" }`. Do the same but with `delete env.CLAUDECODE`.
**Warning signs:** "Cannot be launched inside another Claude Code session" error during backfill.

### Pitfall 2: Token Limit on Session Content
**What goes wrong:** Sending raw session content to `claude -p` exceeds the context window or produces expensive API calls.
**Why it happens:** Some sessions have hundreds of messages with tool outputs producing 100KB+ of text.
**How to avoid:** Extract only user messages + assistant text responses. Skip tool_use, tool_result, and thinking blocks. Truncate to ~4000 tokens (~16000 characters) per session. Include a truncation notice in the prompt when content is clipped.
**Warning signs:** Backfill taking excessive time per session, or cost estimates significantly higher than ~$0.001/session.

### Pitfall 3: Concurrent File Writes to Same Daily Log
**What goes wrong:** Multiple sessions from the same date write to the same `~/.memory/daily/2026-03-07.md` file. Without coordination, writes can interleave or overwrite.
**Why it happens:** Backfill processes sessions in chronological order, and multiple sessions happen on the same day.
**How to avoid:** Process sessions sequentially (not in parallel). Append to the daily log file using `appendFileSync` with the complete section for that session. Each session's entry is a self-contained markdown section.
**Warning signs:** Garbled daily log entries, missing session summaries.

### Pitfall 4: Schema Migration Ordering
**What goes wrong:** The backfill_state table is created after existing schema tables but the `createSchema` function runs all SCHEMA_SQL entries. If the new table is simply appended to SCHEMA_SQL, it works. But if it references tables not yet created, it fails.
**Why it happens:** SCHEMA_SQL is an ordered array. Dependencies must be earlier in the array.
**How to avoid:** backfill_state has no foreign keys to other tables (session_id is TEXT, not a FK constraint), so it can be appended at the end of SCHEMA_SQL with no ordering issues. Alternatively, create it in the same pattern as embedding_state (separate from SCHEMA_SQL, created conditionally).
**Warning signs:** "no such table: backfill_state" errors on first run.

### Pitfall 5: Hook Script Output Handling
**What goes wrong:** The PreCompact hook outputs the reminder message, but Claude Code doesn't display it because the output format is wrong or the hook exits before output is flushed.
**Why it happens:** The hook script uses `process.exit(0)` which may not flush stdout.
**How to avoid:** Write to stdout synchronously before calling `process.exit(0)`. Node.js `console.log()` on stdout is synchronous in Bun. Verify by testing the hook script manually with a mock PreCompact event on stdin.
**Warning signs:** No reminder appearing before compaction despite hook being installed.

## Code Examples

### PreCompact Flush Reminder (Hook Script Modification)

```typescript
// In sync-hook-script.ts main(), after reading hookInput and before spawning sync:
// Source: existing sync-hook-script.ts pattern at line 131

if (hookInput.hook_event_name === "PreCompact") {
    // Output reminder to stdout -- Claude Code reads hook stdout
    console.log(
        "MEMORY FLUSH: Session nearing compaction. " +
        "Write important context (decisions, unresolved items, learnings) " +
        "to ~/.memory/ files before context is compressed."
    );

    // Check if sync-on-compaction is enabled (existing behavior)
    if (!config.syncOnCompaction) {
        process.exit(0);
    }
}
```

### Backfill Service - Session Selection

```typescript
// Source: pattern from SyncService + MemoryFileSyncService

interface BackfillProgress {
    current: number;
    total: number;
    sessionId: string;
    action: "processing" | "skipped" | "error";
}

interface BackfillResult {
    sessionsProcessed: number;
    sessionsSkipped: number;
    sessionsFailed: number;
    dailyLogsCreated: number;
    dailyLogsUpdated: number;
    errors: Array<{ sessionId: string; error: string }>;
}

// Query for unprocessed sessions:
const unprocessed = db.prepare(`
    SELECT s.id, s.project_name, s.start_time, s.end_time, s.message_count
    FROM sessions s
    LEFT JOIN backfill_state bs ON s.id = bs.session_id
    WHERE bs.session_id IS NULL
    ORDER BY s.start_time ASC
    LIMIT ?
`).all(batchSize);
```

### Claude -p Invocation for Summary Generation

```typescript
// Source: existing hook-runner.ts spawn pattern

import { spawn } from "node:child_process";

async function generateSummary(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.CLAUDECODE;  // Prevent nested session detection

        const child = spawn("claude", ["-p", "--output-format", "text"], {
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });

        child.on("close", (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(`claude -p exited with code ${code}: ${stderr}`));
            }
        });

        // Write prompt to stdin
        child.stdin.write(prompt);
        child.stdin.end();
    });
}
```

### Backfill State Entity

```typescript
// Source: pattern from ExtractionState entity

interface BackfillStateParams {
    sessionId: string;
    backfilledAt: Date;
    dailyLogPath: string;
    success: boolean;
    errorMessage?: string;
}

class BackfillState {
    static create(params: BackfillStateParams): BackfillState { /* validation */ }
    // Getters for all fields
}
```

### Daily Log Entry Format

```markdown
## Session: abc123 (2026-03-07 14:30 - 15:45)
**Project:** memory-nexus

### Topic
Implemented backfill command for historical session processing

### Decisions
- Used claude -p for summary generation instead of direct API calls
- Chose sequential processing over parallel for file safety

### Outcomes
- Created backfill-service.ts with batch processing
- Added backfill_state schema migration

### Unresolved
- Cost estimation accuracy needs real-world validation

### Learnings
- Agent SDK is CLI-only, not a programmatic library

### Key Files
- src/application/services/backfill-service.ts
- src/presentation/cli/commands/backfill.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Import @anthropic-ai/claude-code as library | Shell out to `claude -p` | Current (no library API exists) | All backfill LLM calls go through CLI |
| Both hooks do same thing (sync) | PreCompact outputs reminder, then syncs | This phase | User gets context-save warning before compaction |
| No backfill capability | `memory backfill` generates daily logs | This phase | 500+ historical sessions become searchable as memory files |

**Deprecated/outdated:**
- The pseudocode in CONTEXT.md showing `agentSdk.complete(prompt)` -- the SDK has no such programmatic API. Use `claude -p` instead.

## Open Questions

1. **What is the actual CLAUDECODE environment variable name?**
   - What we know: The `@anthropic-ai/claude-code` CLI checks for it and refuses to launch inside another session
   - What's unclear: The exact variable name (CLAUDECODE, CLAUDE_CODE, or similar)
   - Recommendation: Grep the minified CLI source for the variable name, or test empirically by running `env | grep -i claude` inside a Claude Code session. Strip all Claude-related env vars when spawning `claude -p` for backfill.

2. **Does `claude -p` work with Max subscription or require API key?**
   - What we know: Thariq confirmed Max subscription usage is fine. The user's regular `claude` CLI uses Max subscription.
   - What's unclear: Whether `claude -p` uses the same authentication as interactive mode
   - Recommendation: It should work with the same auth. Test with a simple `echo "hi" | claude -p` before building the full backfill pipeline. If it requires an API key, the backfill command should detect this and provide clear instructions.

3. **Should the PreCompact reminder go to stdout or stderr?**
   - What we know: Claude Code reads hook stdout. The current hook writes status to the log file, not to stdout/stderr.
   - What's unclear: Whether Claude Code uses stdout or stderr for hook output display
   - Recommendation: Use stdout (console.log). If Claude Code shows stderr instead, adjust. The current hook exits 0 with no stdout output -- adding stdout output is the intended change.

## Sources

### Primary (HIGH confidence)
- `src/infrastructure/hooks/settings-manager.ts` -- existing hook install/uninstall already handles both SessionEnd and PreCompact
- `src/infrastructure/hooks/sync-hook-script.ts` -- existing hook script already distinguishes PreCompact from SessionEnd
- `src/infrastructure/hooks/config-manager.ts` -- `syncOnCompaction` config already exists
- `src/infrastructure/database/schema.ts` -- existing schema patterns for new tables
- `src/application/services/memory-file-sync-service.ts` -- pattern for daily log file writing
- `src/domain/entities/memory-file.ts` -- MemoryFile entity for daily log indexing
- `src/infrastructure/hooks/hook-runner.ts` -- pattern for spawning external processes
- `node_modules/@anthropic-ai/claude-code/package.json` -- confirms no `main`/`exports`, only `bin`
- `src/infrastructure/database/health-checker.ts` -- already requires both hooks for "installed" status (line 262)

### Secondary (MEDIUM confidence)
- `claude --help` output -- confirms `-p`/`--print` mode for non-interactive usage
- CONTEXT.md backfill design -- session selection, content extraction, cost estimation approach

### Tertiary (LOW confidence)
- CLAUDECODE environment variable name -- observed from runtime error message, not official documentation
- `claude -p` authentication with Max subscription -- assumed same auth as interactive mode, not verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies needed
- Architecture: HIGH - every component has a 1:1 analog in existing codebase (BackfillState->ExtractionState, BackfillService->MemoryFileSyncService, backfill_state->extraction_state)
- Pitfalls: HIGH - CLAUDECODE env var issue verified empirically; other pitfalls derived from direct code reading

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- all dependencies already pinned, no fast-moving external APIs)
