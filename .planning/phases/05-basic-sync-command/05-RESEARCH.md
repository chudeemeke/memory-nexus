# Phase 5: Basic Sync Command - Research

**Researched:** 2026-01-28
**Domain:** CLI orchestration, Commander.js, progress indicators
**Confidence:** HIGH

## Summary

Phase 5 implements the sync command that orchestrates session discovery, JSONL parsing, and storage adapters into a cohesive CLI command. The foundational infrastructure is complete from prior phases: FileSystemSessionSource discovers sessions, JsonlEventParser streams events, and repositories persist data with transaction safety.

The research confirms three key technical approaches:
1. **Commander.js v14** - Already in codebase, provides subcommand pattern with options/arguments
2. **cli-progress** - Single progress bar for extraction progress with customizable format
3. **Incremental sync** - Compare file mtime/size against ExtractionState records

**Primary recommendation:** Build a SyncService application layer service that coordinates components, with CLI as thin presentation layer that handles options parsing and progress display.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.2 | CLI framework | Already in project, full TypeScript support, subcommand pattern |
| cli-progress | 3.12.0 | Progress bars | Feature-rich, SingleBar for session progress, customizable format |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/cli-progress | - | TypeScript types | Always with cli-progress |
| ansi-colors | latest | Color output (optional) | Verbose mode, highlighting |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cli-progress | ora (spinner) | Spinners lack progress %; use for indeterminate operations |
| cli-progress | console.log | No visual feedback; acceptable for --quiet mode |
| Commander options | yargs | Commander already in project; switching adds complexity |

**Installation:**
```bash
bun add cli-progress
bun add -d @types/cli-progress
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── application/
│   └── services/
│       └── sync-service.ts       # Orchestrates sync workflow
├── presentation/
│   └── cli/
│       ├── index.ts              # Commander program (existing)
│       └── commands/
│           └── sync.ts           # Sync command handler
```

### Pattern 1: Application Service Orchestration

**What:** SyncService coordinates domain operations without UI concerns. CLI is a thin wrapper.

**When to use:** All CLI commands that involve multiple domain operations.

**Example:**
```typescript
// Source: Hexagonal architecture application layer
export class SyncService {
  constructor(
    private readonly sessionSource: ISessionSource,
    private readonly eventParser: IEventParser,
    private readonly sessionRepo: ISessionRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly extractionStateRepo: IExtractionStateRepository,
    private readonly db: Database
  ) {}

  async sync(options: SyncOptions): Promise<SyncResult> {
    const sessions = await this.sessionSource.discoverSessions();
    const toProcess = await this.filterSessionsToProcess(sessions, options);

    for (const session of toProcess) {
      await this.extractSession(session, options.onProgress);
    }

    return { processed: toProcess.length, ... };
  }
}
```

### Pattern 2: CLI Command Thin Wrapper

**What:** CLI command parses options, creates dependencies, delegates to service.

**When to use:** All CLI commands.

**Example:**
```typescript
// Source: Commander.js best practices
import { Command } from "commander";
import cliProgress from "cli-progress";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync sessions from ~/.claude/projects/ to database")
    .option("--force", "Re-extract all sessions regardless of state")
    .option("--project <path>", "Sync only sessions from specific project")
    .option("--session <id>", "Sync a specific session only")
    .option("--quiet", "Suppress progress output")
    .option("--verbose", "Show detailed progress")
    .action(async (options) => {
      const syncService = createSyncService();  // DI setup

      let progressBar: cliProgress.SingleBar | null = null;
      if (!options.quiet) {
        progressBar = new cliProgress.SingleBar({
          format: "Syncing [{bar}] {percentage}% | {value}/{total} sessions",
        });
      }

      const result = await syncService.sync({
        force: options.force,
        projectFilter: options.project,
        sessionFilter: options.session,
        onProgress: progressBar ? (p) => progressBar.update(p.current) : undefined,
      });

      progressBar?.stop();
      console.log(`Synced ${result.processed} sessions`);
    });
}
```

### Pattern 3: Incremental Sync Detection

**What:** Compare file mtime/size against stored ExtractionState to skip unchanged sessions.

**When to use:** Default behavior (not --force).

**Example:**
```typescript
// Source: Prior phase decisions (CONTEXT.md)
async filterSessionsToProcess(
  sessions: SessionFileInfo[],
  options: SyncOptions
): Promise<SessionFileInfo[]> {
  if (options.force) {
    return sessions;  // Process all
  }

  const toProcess: SessionFileInfo[] = [];

  for (const session of sessions) {
    const state = await this.extractionStateRepo.findBySessionPath(session.path);

    if (!state || state.status !== "complete") {
      toProcess.push(session);  // Never extracted or incomplete
      continue;
    }

    // Check if file changed (mtime/size comparison)
    // Note: Schema has file_mtime/file_size columns, currently NULL
    // Phase 5 will populate these
    if (this.fileChanged(session, state)) {
      toProcess.push(session);
    }
  }

  return toProcess;
}
```

### Pattern 4: Per-Session Transaction Boundary

**What:** Each session is extracted in its own transaction. Failure of one doesn't affect others.

**When to use:** All multi-session sync operations.

**Example:**
```typescript
// Source: Phase 4 research (04-RESEARCH.md)
async extractSession(
  session: SessionFileInfo,
  onProgress?: (p: Progress) => void
): Promise<ExtractionResult> {
  // Create pending state
  const state = ExtractionState.create({
    id: crypto.randomUUID(),
    sessionPath: session.path,
    startedAt: new Date(),
    status: "pending",
  });

  try {
    // Single transaction for all session data
    const commitSession = this.db.transaction(() => {
      // 1. Save session entity
      this.sessionRepo.save(sessionEntity);

      // 2. Save all messages in batches
      this.messageRepo.saveMany(messages);

      // 3. Update extraction state to complete
      const completedState = state
        .startProcessing()
        .incrementMessages(messages.length)
        .complete(new Date());
      this.extractionStateRepo.save(completedState);
    });

    commitSession.immediate();  // BEGIN IMMEDIATE

    return { success: true, messagesExtracted: messages.length };
  } catch (error) {
    // Save error state (separate transaction)
    const errorState = state.fail(error.message);
    await this.extractionStateRepo.save(errorState);

    return { success: false, error: error.message };
  }
}
```

### Anti-Patterns to Avoid

- **Fat CLI commands:** Put business logic in application services, not command handlers
- **Global progress state:** Pass progress callback, don't use global singleton
- **Swallowing errors silently:** In --quiet mode, still track errors in result object
- **Blocking on single session:** Process multiple sessions, report errors at end
- **Ignoring CTRL+C:** Handle process signals for clean shutdown

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Manual process.argv parsing | Commander.js | Handles edge cases, generates help |
| Progress bars | console.log with \r | cli-progress | Handles TTY detection, bar rendering |
| File stat comparison | Manual fs.stat calls | SessionFileInfo has modifiedTime/size | Already available from discovery |
| Transaction coordination | Manual BEGIN/COMMIT | db.transaction().immediate() | Auto-rollback on exception |
| Incremental state | Custom tracking | ExtractionState entity + repository | Already implemented in Phase 4 |

**Key insight:** Phase 5 is orchestration, not implementation. Components already exist; this phase wires them together.

## Common Pitfalls

### Pitfall 1: Progress Bar in Non-TTY Environment

**What goes wrong:** Progress bar throws or displays garbage in CI/pipes.

**Why it happens:** cli-progress renders escape codes; non-TTY environments don't interpret them.

**How to avoid:** Check `process.stdout.isTTY` before creating progress bar; use plain logging in non-TTY.

**Warning signs:** Garbled output when piping to file, crashes in CI.

```typescript
const isInteractive = process.stdout.isTTY && !options.quiet;
if (isInteractive) {
  progressBar = new cliProgress.SingleBar({ ... });
}
```

### Pitfall 2: Incomplete ExtractionState Population

**What goes wrong:** File mtime/size columns remain NULL, incremental sync always re-extracts.

**Why it happens:** Phase 4 repository sets these to NULL; Phase 5 must populate them.

**How to avoid:** Update ExtractionState with file metadata from SessionFileInfo.

**Warning signs:** Sync takes same time every run even without --force.

### Pitfall 3: Memory Growth During Multi-Session Sync

**What goes wrong:** Memory climbs with each session, eventually OOM.

**Why it happens:** Collecting all events before batching, or holding references to processed data.

**How to avoid:** Process sessions sequentially, use streaming parser, batch writes.

**Warning signs:** Memory usage correlates with session count, not individual session size.

### Pitfall 4: Silent Filter Failures

**What goes wrong:** --project filter finds no sessions, user thinks sync worked.

**Why it happens:** Filter returns empty array, loop processes nothing, reports success.

**How to avoid:** Report filter match count; warn if zero matches with non-empty filter.

**Warning signs:** "Synced 0 sessions" with no warning when filter specified.

### Pitfall 5: Double-Processing on Rapid Sync

**What goes wrong:** Running sync twice quickly processes same session twice.

**Why it happens:** First sync still processing when second starts; state not yet committed.

**How to avoid:** Mark state as "in_progress" before extraction, check at filter time.

**Warning signs:** Duplicate message errors on rapid sequential syncs.

## Code Examples

### Commander.js Subcommand with Options

```typescript
// Source: https://github.com/tj/commander.js
import { Command } from "commander";

const program = new Command();

program
  .command("sync")
  .description("Sync sessions to database")
  .option("-f, --force", "Force re-extraction of all sessions")
  .option("-p, --project <path>", "Filter by project path (partial match)")
  .option("-s, --session <id>", "Sync specific session by ID")
  .option("-q, --quiet", "Suppress progress output (for hooks)")
  .option("-v, --verbose", "Show detailed extraction progress")
  .action(async (options) => {
    // options.force: boolean | undefined
    // options.project: string | undefined
    // options.session: string | undefined
    // options.quiet: boolean | undefined
    // options.verbose: boolean | undefined
  });

program.parse();
```

### cli-progress SingleBar Usage

```typescript
// Source: https://github.com/npkgz/cli-progress
import cliProgress from "cli-progress";

// Create bar with custom format
const bar = new cliProgress.SingleBar({
  format: "Syncing |{bar}| {percentage}% | {value}/{total} sessions | ETA: {eta}s",
  barCompleteChar: "\u2588",
  barIncompleteChar: "\u2591",
  hideCursor: true,
});

// Start with total count
bar.start(totalSessions, 0);

// Update after each session
for (const session of sessions) {
  await processSession(session);
  bar.increment();
}

// Stop when done (restores cursor)
bar.stop();
```

### TTY Detection for Progress

```typescript
// Source: Node.js process documentation
function createProgressReporter(options: { quiet?: boolean }): ProgressReporter {
  // Respect quiet flag
  if (options.quiet) {
    return { update: () => {}, stop: () => {}, start: () => {} };
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    // Non-interactive: use simple logging
    return {
      start: (total: number) => console.log(`Processing ${total} sessions...`),
      update: () => {},  // Don't spam non-TTY
      stop: () => console.log("Done."),
    };
  }

  // Interactive: use progress bar
  const bar = new cliProgress.SingleBar({ ... });
  return {
    start: (total: number) => bar.start(total, 0),
    update: (current: number) => bar.update(current),
    stop: () => bar.stop(),
  };
}
```

### Incremental Sync Logic

```typescript
// Source: Phase 4 patterns + incremental sync requirements
interface FileMetadata {
  mtime: Date;
  size: number;
}

function needsReextraction(
  session: SessionFileInfo,
  existingState: ExtractionState | null,
  force: boolean
): boolean {
  // Force flag overrides everything
  if (force) return true;

  // No existing state = never extracted
  if (!existingState) return true;

  // Incomplete/error state = needs retry
  if (existingState.status !== "complete") return true;

  // Compare file metadata (mtime + size)
  // Note: Need to extend ExtractionState to store these
  const storedMtime = existingState.fileMtime;  // New property needed
  const storedSize = existingState.fileSize;    // New property needed

  if (!storedMtime || !storedSize) return true;  // No metadata = re-extract

  // File changed if mtime OR size differs
  return (
    session.modifiedTime.getTime() !== storedMtime.getTime() ||
    session.size !== storedSize
  );
}
```

### SyncResult Type

```typescript
// Source: CONTEXT.md error recovery decisions
interface SyncResult {
  success: boolean;
  sessionsDiscovered: number;
  sessionsProcessed: number;
  sessionsSkipped: number;  // Already up-to-date
  messagesInserted: number;
  errors: Array<{
    sessionId?: string;
    sessionPath?: string;
    error: string;
  }>;
  durationMs: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate progress libraries | cli-progress handles all | 2023+ | Single dependency |
| Custom CLI parsing | Commander.js v14 | Ongoing | Full TypeScript, subcommands |
| process.stdout.write | cli-progress hideCursor | Ongoing | Better UX, no cursor flicker |

**Deprecated/outdated:**
- Manual \r-based progress: Use cli-progress instead
- commander.js v6 API: v14 uses different import style

## Open Questions

All questions resolved:

1. **How to detect file changes for incremental sync?**
   - Resolved: Compare mtime + size from SessionFileInfo against stored ExtractionState
   - Need to add fileMtime/fileSize properties to ExtractionState (schema has columns)

2. **Progress bar in non-TTY?**
   - Resolved: Check process.stdout.isTTY, fall back to simple logging

3. **How to handle --project partial matching?**
   - Resolved: Filter SessionFileInfo[] by projectPath containing filter string

## Sources

### Primary (HIGH confidence)
- [Commander.js GitHub](https://github.com/tj/commander.js) - Subcommand pattern, options API
- [cli-progress npm](https://www.npmjs.com/package/cli-progress) - SingleBar usage, TTY handling
- Existing codebase (Phase 4) - Repository interfaces, transaction patterns

### Secondary (MEDIUM confidence)
- [Better Stack Commander.js Guide](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/) - Best practices
- [cli-progress Guide](https://generalistprogrammer.com/tutorials/cli-progress-npm-package-guide) - Format customization

### Tertiary (LOW confidence)
- None - all findings verified with official documentation or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Commander.js already in project, cli-progress well-documented
- Architecture: HIGH - Application service pattern established, hexagonal architecture clear
- Pitfalls: HIGH - Based on prior phase experience and documented patterns

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (stable APIs, 30 days reasonable)
