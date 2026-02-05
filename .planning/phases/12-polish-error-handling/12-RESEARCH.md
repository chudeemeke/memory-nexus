# Phase 12: Polish, Error Handling, Edge Cases - Research

**Researched:** 2026-02-05
**Domain:** Production hardening - Error handling, signal management, test coverage, CLI utilities
**Confidence:** HIGH

## Summary

This phase hardens memory-nexus for production use. Research focused on six key areas: signal handling for graceful shutdown, error presentation patterns, log rotation for error logging, shell completion generation, mutation testing, and database health checks.

The existing codebase already has solid foundations: Commander.js CLI with color utilities, a config manager (`~/.memory-nexus/config.json`), and a log writer with date-based rotation. Phase 12 builds on these patterns to add comprehensive error handling, Ctrl+C management, shell completions, and quality validation tools.

Bun provides native signal handling via `process.on()` that works identically to Node.js. For mutation testing, Stryker does not officially support Bun's test runner - the recommended path is using Vitest as the test runner with Stryker. Shell completions are best achieved with `@gutenye/commander-completion-carapace` which integrates cleanly with Commander.js.

**Primary recommendation:** Layer error handling infrastructure first (error codes, formatters, signal handlers), then add CLI utilities (doctor, export, completion), then validate with mutation testing.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.2 | CLI framework | Already used, has error handling hooks |
| bun:sqlite | native | Database | Already used, has integrity_check PRAGMA |
| node:fs | native | File operations | Log rotation, export/import |
| node:os | native | System info | Home directory, signal handling |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @gutenye/commander-completion-carapace | ^1.0.9 | Shell completions | Multi-shell support (Bash/Zsh/Fish), Commander.js native |
| rotating-file-stream | ^3.2.x | Size-based log rotation | TypeScript types, handles 10MB threshold requirement |
| @stryker-mutator/core | ^9.x | Mutation testing framework | Industry standard for JS/TS |
| @stryker-mutator/vitest-runner | ^9.x | Test runner integration | Required since Stryker lacks Bun support |
| vitest | ^3.x | Test runner for Stryker | Only for mutation testing (Bun for regular tests) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rotating-file-stream | Manual rotation | Simple implementation exists in log-writer.ts - enhance vs replace |
| @stryker-mutator | No mutation testing | 80%+ requirement in CONTEXT.md makes this mandatory |
| Vitest for Stryker | Wait for Bun support | Bun support not documented; Vitest is reliable path |

**Installation:**
```bash
bun add @gutenye/commander-completion-carapace rotating-file-stream
bun add -d @stryker-mutator/core @stryker-mutator/vitest-runner vitest @stryker-mutator/typescript-checker
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── domain/
│   └── errors/                    # Error code definitions
│       ├── error-codes.ts         # Enum/const error codes
│       └── domain-error.ts        # Base error class
├── infrastructure/
│   ├── errors/                    # Error infrastructure
│   │   ├── error-handler.ts       # Global error handling
│   │   └── error-logger.ts        # Error log rotation
│   ├── signals/                   # Signal handling
│   │   ├── signal-handler.ts      # SIGINT/SIGTERM handling
│   │   └── checkpoint-manager.ts  # Sync progress checkpointing
│   └── database/
│       └── health-checker.ts      # DB integrity, permission checks
├── presentation/
│   └── cli/
│       ├── commands/
│       │   ├── doctor.ts          # Health check command
│       │   ├── export.ts          # Backup export command
│       │   ├── import.ts          # Restore from export
│       │   ├── purge.ts           # Data cleanup command
│       │   └── completion.ts      # Shell completion command
│       └── formatters/
│           └── error-formatter.ts # Error message formatting
└── application/
    └── services/
        └── export-service.ts      # Export/import logic
```

### Pattern 1: Structured Error Codes
**What:** Stable error codes for programmatic handling per CONTEXT.md decision.
**When to use:** All error conditions that could be caught programmatically.
**Example:**
```typescript
// Source: CONTEXT.md decisions
export const ErrorCode = {
  // Database errors
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  DB_CORRUPTED: "DB_CORRUPTED",
  DB_LOCKED: "DB_LOCKED",

  // Session errors
  INVALID_SESSION_ID: "INVALID_SESSION_ID",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",

  // File errors
  SOURCE_INACCESSIBLE: "SOURCE_INACCESSIBLE",
  DISK_FULL: "DISK_FULL",

  // Parse errors
  INVALID_JSON: "INVALID_JSON",
  UNKNOWN_FORMAT: "UNKNOWN_FORMAT",
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export class MemoryNexusError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MemoryNexusError";
  }

  toJSON(): { error: { code: string; message: string; context?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.context && { context: this.context }),
      },
    };
  }
}
```

### Pattern 2: Signal Handler with User Prompts
**What:** Ctrl+C handling with 3-option prompt per CONTEXT.md decision.
**When to use:** All long-running operations (sync, export, purge).
**Example:**
```typescript
// Source: Bun signal handling docs + CONTEXT.md decisions
import { createInterface } from "node:readline";

interface SignalHandlerState {
  isShuttingDown: boolean;
  interruptCount: number;
  activeOperation: string | null;
  checkpoint: SyncCheckpoint | null;
}

const state: SignalHandlerState = {
  isShuttingDown: false,
  interruptCount: 0,
  activeOperation: null,
  checkpoint: null,
};

export function setupSignalHandlers(cleanup: () => Promise<void>): void {
  const handleSignal = async () => {
    state.interruptCount++;

    // Second Ctrl+C = immediate exit (force kill)
    if (state.interruptCount >= 2) {
      console.error("\nForce exiting...");
      process.exit(130);
    }

    // First Ctrl+C = prompt user
    if (!state.isShuttingDown) {
      state.isShuttingDown = true;

      // Use readline for prompt (works in Bun)
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log("\n\nInterrupt received. Choose action:");
      console.log("  1) Abort immediately");
      console.log("  2) Abort after current session");
      console.log("  3) Cancel abort (continue)");

      rl.question("Choice [1-3]: ", async (answer) => {
        rl.close();

        switch (answer) {
          case "1":
            await cleanup();
            process.exit(130);
          case "2":
            // Set flag for graceful shutdown after current
            state.isShuttingDown = true;
            // Continue - loop will check flag
            break;
          case "3":
            state.isShuttingDown = false;
            state.interruptCount = 0;
            break;
        }
      });
    }
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

export function shouldAbort(): boolean {
  return state.isShuttingDown;
}
```

### Pattern 3: Database Health Check
**What:** SQLite integrity verification per CONTEXT.md doctor command.
**When to use:** `memory doctor` command and startup checks.
**Example:**
```typescript
// Source: SQLite PRAGMA documentation
export interface HealthCheckResult {
  database: {
    exists: boolean;
    readable: boolean;
    writable: boolean;
    integrity: "ok" | "corrupted" | "unknown";
    size: number;
  };
  permissions: {
    configDir: boolean;
    logsDir: boolean;
    sourceDir: boolean;
  };
  hooks: {
    installed: boolean;
    enabled: boolean;
    lastRun: Date | null;
  };
  config: {
    valid: boolean;
    issues: string[];
  };
}

export function checkDatabaseIntegrity(db: Database): "ok" | "corrupted" {
  try {
    const result = db.query<{ integrity_check: string }, []>(
      "PRAGMA integrity_check(1);"
    ).get();
    return result?.integrity_check === "ok" ? "ok" : "corrupted";
  } catch {
    return "corrupted";
  }
}

export function checkQuickIntegrity(db: Database): "ok" | "corrupted" {
  // Quick check is faster - use for startup
  try {
    const result = db.query<{ quick_check: string }, []>(
      "PRAGMA quick_check(1);"
    ).get();
    return result?.quick_check === "ok" ? "ok" : "corrupted";
  } catch {
    return "corrupted";
  }
}
```

### Pattern 4: Size-Based Log Rotation
**What:** Rotate error logs at 10MB threshold per CONTEXT.md decision.
**When to use:** Error logging to `~/.memory-nexus/logs/errors.log`.
**Example:**
```typescript
// Source: rotating-file-stream documentation
import rfs from "rotating-file-stream";
import { join } from "node:path";
import { homedir } from "node:os";

const errorLogStream = rfs.createStream("errors.log", {
  path: join(homedir(), ".memory-nexus", "logs"),
  size: "10M",           // Rotate at 10MB per CONTEXT.md
  compress: false,       // Keep readable for debugging
  maxFiles: 5,           // Keep 5 rotated files
});

export function logError(entry: ErrorLogEntry): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  errorLogStream.write(line + "\n");
}
```

### Anti-Patterns to Avoid
- **Swallowing errors silently:** Always log errors even if continuing operation
- **Inconsistent exit codes:** Use 0 for success, 1 for failure consistently
- **Stack traces in normal output:** Only show with --verbose flag
- **Blocking on integrity checks:** Use quick_check for startup, full check for doctor

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Size-based log rotation | Custom file size checks | rotating-file-stream | Edge cases with concurrent writes, atomic rotation |
| Shell completions | Write completion scripts | @gutenye/commander-completion-carapace | Multi-shell support, automatic updates with CLI changes |
| Mutation testing | Custom test analysis | Stryker | Comprehensive mutant generation, reporting |
| Database busy handling | Simple retry loop | SQLite busy_timeout PRAGMA | Native handling, proper backoff |
| Error formatting | Console.log with colors | Existing color.ts + new formatter | Project already has color utilities |

**Key insight:** The project already has robust foundations (color.ts, config-manager.ts, log-writer.ts). Extend these rather than replacing them.

## Common Pitfalls

### Pitfall 1: Signal Handler Race Conditions
**What goes wrong:** Multiple SIGINT handlers, cleanup running twice, state corruption.
**Why it happens:** Not tracking shutdown state, multiple registrations.
**How to avoid:**
- Track `isShuttingDown` state
- Count interrupts for force-kill
- Remove handlers after first invocation if needed
**Warning signs:** "Already shutting down" errors, double-cleanup logs.

### Pitfall 2: Database Locked in WAL Mode
**What goes wrong:** SQLITE_BUSY errors during concurrent operations.
**Why it happens:** WAL allows readers but only one writer; busy_timeout not set.
**How to avoid:**
- Set `PRAGMA busy_timeout = 5000;` on connection (5 seconds per research)
- Use BEGIN IMMEDIATE for writes
- Queue operations if busy after timeout
**Warning signs:** Intermittent "database is locked" errors under load.

### Pitfall 3: Exit Without Cleanup
**What goes wrong:** Orphaned temp files, unclosed database connections, corrupted checkpoint.
**Why it happens:** Calling process.exit() directly, unhandled promise rejections.
**How to avoid:**
- Always close database with `closeDatabase()` before exit
- Save checkpoint state on every session completion
- Register unhandledRejection handler
**Warning signs:** .wal and .shm files left after clean exit.

### Pitfall 4: Verbose Stack Traces in Production
**What goes wrong:** Users see cryptic stack traces instead of helpful messages.
**Why it happens:** Throwing raw errors, not formatting for output mode.
**How to avoid:**
- Check --verbose flag before including stack
- Format errors with context (file path, suggestion)
- Differentiate human vs JSON output
**Warning signs:** User complaints about confusing error output.

### Pitfall 5: Mutation Testing False Positives
**What goes wrong:** Stryker reports surviving mutants in dead code or edge cases.
**Why it happens:** Test coverage != mutation coverage.
**How to avoid:**
- Use `// Stryker disable` comments for intentionally untested code
- Focus mutation testing on domain layer (99% target)
- Review surviving mutants before adding tests
**Warning signs:** 100% coverage but 60% mutation score.

## Code Examples

Verified patterns from official sources:

### Commander.js Error Display with Help
```typescript
// Source: Commander.js documentation
import { Command } from "commander";

const program = new Command();

program
  .configureOutput({
    outputError: (str, write) => {
      // Red color for errors in TTY
      if (process.stderr.isTTY) {
        write(`\x1b[31m${str}\x1b[0m`);
      } else {
        write(str);
      }
    },
  })
  .showHelpAfterError("(add --help for usage information)")
  .exitOverride((err) => {
    // Custom handling - log to error file
    if (err.code !== "commander.help") {
      logError({ code: "CLI_ERROR", message: err.message });
    }
    throw err;
  });
```

### Bun Signal Handling
```typescript
// Source: https://bun.sh/guides/process/os-signals
process.on("SIGINT", () => {
  console.log("Received SIGINT");
  // Perform cleanup
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM");
  // Same handling as SIGINT per CONTEXT.md
});

// Also handle clean exit
process.on("beforeExit", (code) => {
  console.log(`Process exiting with code ${code}`);
});
```

### SQLite Busy Timeout
```typescript
// Source: SQLite documentation
import { Database } from "bun:sqlite";

function initializeDatabaseWithRetry(path: string): Database {
  const db = new Database(path);

  // Set busy timeout to 5 seconds
  db.exec("PRAGMA busy_timeout = 5000;");

  // Other pragmas...
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  return db;
}
```

### Export to JSON Format
```typescript
// Source: Best practices research
export interface ExportData {
  version: string;
  exportedAt: string;
  sessions: SessionExport[];
  messages: MessageExport[];
  toolUses: ToolUseExport[];
}

export function exportToJson(db: Database, outputPath: string): void {
  const data: ExportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    sessions: [],
    messages: [],
    toolUses: [],
  };

  // Stream to file to handle large datasets
  const file = Bun.file(outputPath);
  const writer = file.writer();

  // Write header
  writer.write('{"version":"1.0","exportedAt":"' + data.exportedAt + '","sessions":[');

  // Stream sessions
  const sessions = db.query("SELECT * FROM sessions").all();
  sessions.forEach((s, i) => {
    if (i > 0) writer.write(",");
    writer.write(JSON.stringify(s));
  });

  // Continue with other tables...
  writer.write("]}\n");
  writer.end();
}
```

### Stryker Configuration for Vitest
```javascript
// Source: Stryker documentation - stryker.config.js
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  reporters: ["html", "clear-text", "progress"],
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  concurrency: 4,
  mutate: [
    "src/domain/**/*.ts",
    "!src/**/*.test.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 80,  // Fail if below 80%
  },
};
```

### Shell Completion Setup
```typescript
// Source: commander-completion-carapace GitHub
import { program, enableCompletion } from "@gutenye/commander-completion-carapace";

// Enable completion on the program
program.enableCompletion();

// Add completion command
program
  .command("completion <shell>")
  .description("Generate shell completion script")
  .action(async (shell) => {
    await program.installCompletion(shell);
  });

// Completions for existing commands
program
  .command("search <query>")
  .option("--project <path>")
  .completion({
    positionalany: ["$files"],  // Complete with files
  });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Date-based log rotation | Size-based + date rotation | Always was best practice | More predictable disk usage |
| Simple retry loops | SQLite busy_timeout PRAGMA | SQLite feature | Native handling, less code |
| Manual completion scripts | Carapace-based generation | 2024+ | Multi-shell support, auto-updates |
| Jest for mutation testing | Vitest runner for Stryker | StrykerJS 7.0 (2023) | Better TypeScript support |

**Deprecated/outdated:**
- Winston for simple file logging: Overkill for single-file append; rotating-file-stream is simpler
- Custom completion script generation: Carapace handles edge cases better
- Bun-only mutation testing: Not supported; use Vitest bridge

## Open Questions

Things that couldn't be fully resolved:

1. **Stryker + Bun Native**
   - What we know: Stryker supports Vitest, Jest, Mocha - no Bun runner documented
   - What's unclear: Whether Bun will be supported soon
   - Recommendation: Use Vitest for mutation testing only; keep Bun for regular tests

2. **Interactive Prompt in Non-TTY**
   - What we know: Ctrl+C prompt requires readline input
   - What's unclear: Behavior when stdin is not TTY (piped input)
   - Recommendation: Skip prompt if !process.stdin.isTTY, default to graceful shutdown

3. **Per-Layer Coverage Thresholds**
   - What we know: Bun coverage thresholds are global, not per-directory
   - What's unclear: If Bun will add per-path thresholds
   - Recommendation: Use Stryker mutate patterns to target domain layer separately

## Sources

### Primary (HIGH confidence)
- Bun signal handling: https://bun.sh/guides/process/os-signals - Official Bun documentation
- SQLite PRAGMA: https://www.sqlite.org/pragma.html - Integrity check, busy_timeout
- Bun coverage: https://bun.com/guides/test/coverage-threshold - Threshold configuration
- Stryker Vitest Runner: https://stryker-mutator.io/docs/stryker-js/vitest-runner/ - Official docs

### Secondary (MEDIUM confidence)
- Commander.js error handling: https://github.com/tj/commander.js/issues/782 - Community patterns
- rotating-file-stream: https://github.com/iccicci/rotating-file-stream - TypeScript support confirmed
- commander-completion-carapace: https://github.com/gutenye/commander-completion-carapace - Multi-shell support

### Tertiary (LOW confidence)
- SQLite concurrent access patterns: Community blog posts - verify with testing
- Mutation testing 80% threshold: CONTEXT.md requirement - validate achievability

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation verified, existing project patterns
- Architecture: HIGH - Based on existing project structure and CONTEXT.md decisions
- Pitfalls: MEDIUM - Combination of documentation and community experience
- Code examples: HIGH - From official documentation or verified patterns

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable domain, no fast-moving dependencies)
