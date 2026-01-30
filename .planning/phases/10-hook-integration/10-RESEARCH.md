# Phase 10: Hook Integration and Incremental Sync - Research

**Researched:** 2026-01-30
**Domain:** Claude Code hooks, Node.js child processes, background sync
**Confidence:** HIGH

## Summary

Phase 10 implements automatic sync via Claude Code hooks for zero-friction operation. The research confirms Claude Code provides `SessionEnd` and `PreCompact` hook events that can trigger memory-nexus sync when sessions end or context is about to be compacted. The `session_id` field is available in hook input JSON, enabling session-specific sync.

The implementation strategy uses Node.js `spawn()` with `detached: true` and `stdio: 'ignore'` plus `unref()` to create background sync processes that survive parent termination. This matches OpenClaw's proven 5-second timeout pattern. Configuration lives in `~/.memory-nexus/config.json` (separate from Claude Code settings), and logs use structured JSON lines format for machine parseability.

**Primary recommendation:** Implement hooks via Claude Code's `SessionEnd` and `PreCompact` events with detached child process spawning. Use `aidev memory install` to safely modify `~/.claude/settings.json` with backup.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:child_process | built-in | Spawn detached background processes | Standard Node.js API, spawn() with detached:true |
| node:fs | built-in | File operations for config/logs | Standard Node.js API, no external deps |
| JSON.parse/stringify | built-in | Config and log file handling | Native, no dependencies needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | 14.0.2 (existing) | CLI commands (install/uninstall/status) | Already in project |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| spawn() detached | Bun.spawn() | spawn() is more portable across Node/Bun runtimes |
| JSON config | YAML/TOML | JSON matches Claude Code's settings.json format |
| Manual log rotation | winston-daily-rotate | Manual is simpler for low-volume use case |

**Installation:**
```bash
# No new dependencies required - all built-in Node.js APIs
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── infrastructure/
│   └── hooks/
│       ├── hook-runner.ts        # Background process spawner
│       ├── config-manager.ts     # Config loading/validation
│       └── log-writer.ts         # Structured JSON log writer
├── presentation/
│   └── cli/
│       └── commands/
│           ├── install.ts        # aidev memory install
│           ├── uninstall.ts      # aidev memory uninstall
│           └── status.ts         # aidev memory status

~/.memory-nexus/
├── config.json               # User configuration
├── logs/
│   └── sync.log              # Structured JSON lines log
└── backups/
    └── settings.json.backup  # Backup of Claude Code settings
```

### Pattern 1: Detached Background Process Spawning

**What:** Spawn sync process that survives parent termination.

**When to use:** Hook execution (SessionEnd, PreCompact triggers).

**Example:**
```typescript
// Source: https://nodejs.org/api/child_process.html
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function spawnBackgroundSync(sessionId: string): void {
  const logPath = join(homedir(), ".memory-nexus", "logs", "sync.log");
  const out = openSync(logPath, "a");
  const err = openSync(logPath, "a");

  const subprocess = spawn(
    "aidev",
    ["memory", "sync", "--session", sessionId, "--quiet"],
    {
      detached: true,
      stdio: ["ignore", out, err],
      env: { ...process.env, MEMORY_NEXUS_HOOK: "1" },
    }
  );

  subprocess.unref();  // Allow parent to exit
}
```

### Pattern 2: Hook Script Entry Point

**What:** Minimal script that reads stdin JSON and spawns background sync.

**When to use:** As the hook command target in settings.json.

**Example:**
```typescript
// Source: https://code.claude.com/docs/en/hooks
// ~/.memory-nexus/hooks/sync-hook.js

import { spawnBackgroundSync } from "./hook-runner.js";
import { loadConfig } from "./config-manager.js";
import { logSync } from "./log-writer.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.autoSync) {
    process.exit(0);  // Auto-sync disabled
  }

  // Read hook input from stdin
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const hookInput = JSON.parse(input);
  const sessionId = hookInput.session_id;

  if (!sessionId) {
    logSync({ level: "warn", message: "No session_id in hook input" });
    process.exit(0);  // Fail gracefully
  }

  spawnBackgroundSync(sessionId);
  logSync({ level: "info", message: `Triggered sync for ${sessionId}` });
  process.exit(0);
}

main().catch((err) => {
  logSync({ level: "error", message: err.message });
  process.exit(0);  // Never block user
});
```

### Pattern 3: Settings.json Hook Installation

**What:** Safely add hooks to Claude Code settings with backup.

**When to use:** `aidev memory install` command.

**Example:**
```typescript
// Source: Claude Code hooks documentation
interface ClaudeSettings {
  hooks?: {
    SessionEnd?: Array<{
      hooks: Array<{ type: string; command: string; timeout?: number }>;
    }>;
    PreCompact?: Array<{
      matcher?: string;
      hooks: Array<{ type: string; command: string; timeout?: number }>;
    }>;
  };
}

export function installHooks(settingsPath: string): void {
  const backupPath = join(homedir(), ".memory-nexus", "backups", "settings.json.backup");

  // Read existing settings
  const existing = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, "utf-8"))
    : {};

  // Backup before modifying
  writeFileSync(backupPath, JSON.stringify(existing, null, 2));

  // Add hooks
  const updated: ClaudeSettings = {
    ...existing,
    hooks: {
      ...existing.hooks,
      SessionEnd: [
        ...(existing.hooks?.SessionEnd ?? []),
        {
          hooks: [{
            type: "command",
            command: `node "${join(homedir(), ".memory-nexus", "hooks", "sync-hook.js")}"`,
            timeout: 5,
          }],
        },
      ],
      PreCompact: [
        ...(existing.hooks?.PreCompact ?? []),
        {
          matcher: "auto",  // Only on auto-compact, not manual
          hooks: [{
            type: "command",
            command: `node "${join(homedir(), ".memory-nexus", "hooks", "sync-hook.js")}"`,
            timeout: 5,
          }],
        },
      ],
    },
  };

  writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
}
```

### Pattern 4: Configuration Schema

**What:** JSON configuration with validation and defaults.

**When to use:** Loading/saving user preferences.

**Example:**
```typescript
// Source: CONTEXT.md decisions
export interface MemoryNexusConfig {
  autoSync: boolean;              // Enable automatic hook-based sync
  recoveryOnStartup: boolean;     // Scan for unsaved sessions on first command
  syncOnCompaction: boolean;      // Trigger sync on PreCompact event
  timeout: number;                // Sync timeout in milliseconds
  logLevel: "debug" | "info" | "warn" | "error";
  logRetentionDays: number;       // Days to keep log files
  showFailures: boolean;          // Show failure notifications to user
}

export const DEFAULT_CONFIG: MemoryNexusConfig = {
  autoSync: true,
  recoveryOnStartup: true,
  syncOnCompaction: true,
  timeout: 5000,
  logLevel: "info",
  logRetentionDays: 7,
  showFailures: false,  // Silent by default
};

export function loadConfig(): MemoryNexusConfig {
  const configPath = join(homedir(), ".memory-nexus", "config.json");

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const loaded = JSON.parse(readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    // Invalid config: fall back to defaults with warning
    logSync({ level: "warn", message: "Invalid config.json, using defaults" });
    return DEFAULT_CONFIG;
  }
}
```

### Pattern 5: Structured JSON Log Writer

**What:** Append-only JSON lines log with automatic rotation.

**When to use:** All hook operations (sync triggers, errors, warnings).

**Example:**
```typescript
// Source: Best practices for Node.js logging
interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  sessionId?: string;
  durationMs?: number;
  error?: string;
}

export function logSync(entry: Omit<LogEntry, "timestamp">): void {
  const logDir = join(homedir(), ".memory-nexus", "logs");
  mkdirSync(logDir, { recursive: true });

  const logPath = join(logDir, "sync.log");
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
}

// Rotation: run periodically or on startup
export function rotateLogsIfNeeded(retentionDays: number): void {
  const logPath = join(homedir(), ".memory-nexus", "logs", "sync.log");

  if (!existsSync(logPath)) return;

  const stats = statSync(logPath);
  const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

  if (ageDays > retentionDays) {
    const archivePath = `${logPath}.${new Date().toISOString().split("T")[0]}`;
    renameSync(logPath, archivePath);
  }
}
```

### Anti-Patterns to Avoid

- **Blocking hooks:** Never wait for sync to complete in hook; spawn detached and exit immediately
- **Modifying settings without backup:** Always backup ~/.claude/settings.json before modification
- **Swallowing errors silently:** Log all failures, even if not shown to user
- **Hardcoded paths:** Use `homedir()` and `join()` for cross-platform compatibility
- **Complex stdin parsing:** Keep hook script minimal; delegate to sync command

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background process | Custom daemon | spawn() + detached + unref() | Standard Node.js pattern |
| JSON parsing | Manual string manipulation | JSON.parse() | Built-in, handles edge cases |
| Path construction | String concatenation | path.join() | Cross-platform compatibility |
| Config validation | Manual checks | Spread with defaults | Simple, type-safe |
| Log rotation | Custom file management | Date-based rename | Simple for low-volume logs |

**Key insight:** Phase 10 is integration, not implementation. The sync command already exists; hooks just trigger it in background.

## Common Pitfalls

### Pitfall 1: Hook Blocking Claude Code Exit

**What goes wrong:** Claude Code waits for hook to complete, slowing session end.

**Why it happens:** Hook script doesn't exit promptly; sync runs in foreground.

**How to avoid:** Spawn sync as detached process, exit hook script immediately (exit code 0).

**Warning signs:** Delay when closing Claude Code sessions.

### Pitfall 2: Missing session_id in Hook Input

**What goes wrong:** Hook fires but can't identify which session to sync.

**Why it happens:** Different hook events have different input schemas.

**How to avoid:** Check `session_id` field exists; fail gracefully with log if missing.

**Warning signs:** "No session_id" warnings in sync.log.

### Pitfall 3: Settings.json Corruption on Install

**What goes wrong:** Invalid JSON in settings.json breaks Claude Code.

**Why it happens:** Concurrent modification or write error during install.

**How to avoid:** Always backup before modify; validate JSON before writing; use atomic write pattern.

**Warning signs:** Claude Code fails to start after install command.

### Pitfall 4: Log File Growth Without Rotation

**What goes wrong:** sync.log grows unbounded, fills disk.

**Why it happens:** No automatic cleanup of old log entries.

**How to avoid:** Implement date-based rotation; check on startup; respect logRetentionDays config.

**Warning signs:** Large sync.log file (check periodically or on status command).

### Pitfall 5: Windows Path Escaping in Hook Command

**What goes wrong:** Hook command fails on Windows due to unescaped backslashes.

**Why it happens:** JSON requires escaped backslashes; Windows paths have many.

**How to avoid:** Use forward slashes in JSON (works on Windows); or double-escape backslashes.

**Warning signs:** "Command not found" errors on Windows.

### Pitfall 6: Hook Timeout Killing Sync

**What goes wrong:** 5-second timeout kills hook, but sync process survives (or doesn't).

**Why it happens:** Confusion between hook timeout and sync operation.

**How to avoid:** Hook script exits immediately after spawning; detached process is independent of hook timeout.

**Warning signs:** Sync appears to work in hook but data not persisted.

## Code Examples

### Claude Code Settings.json Hook Configuration

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/Users/Destiny/.memory-nexus/hooks/sync-hook.js\"",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/Users/Destiny/.memory-nexus/hooks/sync-hook.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Hook Input Schema (SessionEnd)

```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../abc123.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "SessionEnd",
  "reason": "exit"
}
```

### Hook Input Schema (PreCompact)

```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../abc123.jsonl",
  "permission_mode": "default",
  "hook_event_name": "PreCompact",
  "trigger": "auto",
  "custom_instructions": ""
}
```

### Complete Hook Script

```typescript
#!/usr/bin/env node
// ~/.memory-nexus/hooks/sync-hook.js
// Source: Claude Code hooks documentation

import { spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, openSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface HookInput {
  session_id?: string;
  hook_event_name: string;
  reason?: string;
  trigger?: string;
}

interface Config {
  autoSync: boolean;
  syncOnCompaction: boolean;
}

function loadConfig(): Config {
  const configPath = join(homedir(), ".memory-nexus", "config.json");
  const defaults = { autoSync: true, syncOnCompaction: true };

  if (!existsSync(configPath)) return defaults;

  try {
    return { ...defaults, ...JSON.parse(readFileSync(configPath, "utf-8")) };
  } catch {
    return defaults;
  }
}

function log(level: string, message: string): void {
  const logDir = join(homedir(), ".memory-nexus", "logs");
  mkdirSync(logDir, { recursive: true });

  const logPath = join(logDir, "sync.log");
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
  });
  appendFileSync(logPath, entry + "\n");
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Read hook input from stdin
  let input = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const hookInput: HookInput = JSON.parse(input);

  // Check if this hook type is enabled
  if (hookInput.hook_event_name === "PreCompact" && !config.syncOnCompaction) {
    process.exit(0);
  }

  if (!config.autoSync) {
    process.exit(0);
  }

  const sessionId = hookInput.session_id;
  if (!sessionId) {
    log("warn", `No session_id in ${hookInput.hook_event_name} hook input`);
    process.exit(0);
  }

  // Spawn background sync
  const logPath = join(homedir(), ".memory-nexus", "logs", "sync.log");
  const out = openSync(logPath, "a");
  const err = openSync(logPath, "a");

  const subprocess = spawn(
    "aidev",
    ["memory", "sync", "--session", sessionId, "--quiet"],
    {
      detached: true,
      stdio: ["ignore", out, err],
    }
  );

  subprocess.unref();

  log("info", `Spawned sync for session ${sessionId} (${hookInput.hook_event_name})`);
  process.exit(0);
}

main().catch((err) => {
  log("error", `Hook error: ${err.message}`);
  process.exit(0);  // Never block user
});
```

### Status Command Output

```typescript
// aidev memory status command output
export function formatStatus(status: StatusInfo): string {
  const lines: string[] = [];

  lines.push("Memory-Nexus Status");
  lines.push("==================");
  lines.push("");

  // Hooks
  lines.push("Hooks:");
  lines.push(`  SessionEnd: ${status.hooks.sessionEnd ? "installed" : "not installed"}`);
  lines.push(`  PreCompact: ${status.hooks.preCompact ? "installed" : "not installed"}`);
  lines.push("");

  // Configuration
  lines.push("Configuration:");
  lines.push(`  autoSync:          ${status.config.autoSync}`);
  lines.push(`  syncOnCompaction:  ${status.config.syncOnCompaction}`);
  lines.push(`  recoveryOnStartup: ${status.config.recoveryOnStartup}`);
  lines.push(`  timeout:           ${status.config.timeout}ms`);
  lines.push(`  logLevel:          ${status.config.logLevel}`);
  lines.push("");

  // Recent activity
  lines.push("Recent Activity:");
  lines.push(`  Last sync: ${status.lastSync ?? "never"}`);
  lines.push(`  Pending sessions: ${status.pendingSessions}`);

  return lines.join("\n");
}
```

## Claude Code Hook Events Reference

Based on official documentation at https://code.claude.com/docs/en/hooks:

| Hook Event | When It Fires | session_id Available | Relevant for Phase 10 |
|------------|---------------|---------------------|----------------------|
| `SessionEnd` | Session terminates | Yes | Primary trigger |
| `PreCompact` | Before context compaction | Yes | Secondary trigger (flush) |
| `SessionStart` | Session begins/resumes | Yes | Recovery scan trigger |
| `Stop` | Claude finishes responding | Yes | Not needed |

**Hook Input Fields (Common):**
- `session_id`: Unique session identifier
- `transcript_path`: Path to session JSONL file
- `cwd`: Current working directory
- `permission_mode`: Current permission mode
- `hook_event_name`: Which event triggered

**SessionEnd-specific:**
- `reason`: "clear", "logout", "prompt_input_exit", "other"

**PreCompact-specific:**
- `trigger`: "manual" or "auto"
- `custom_instructions`: User instructions for /compact

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PostToolUse SessionEnd matcher | SessionEnd hook event | Claude Code v2.x | Direct session end detection |
| No compaction hook | PreCompact event | Claude Code v2.x | Can sync before context loss |
| IPC channels | Detached stdio | Stable | Simpler, no communication needed |

**Deprecated/outdated:**
- `PostToolUse` with "SessionEnd" matcher: Use `SessionEnd` event directly

## Open Questions

All questions resolved through research:

1. **Exact hook event names?**
   - Resolved: `SessionEnd` and `PreCompact` are the correct events (verified from official docs)

2. **session_id availability?**
   - Resolved: `session_id` is in hook input JSON for both SessionEnd and PreCompact

3. **PreCompact matchers?**
   - Resolved: "manual" and "auto" matchers available; use "auto" to only trigger on automatic compaction

4. **ContextCompaction vs PreCompact?**
   - Resolved: The event is called `PreCompact`, not "ContextCompaction" (CONTEXT.md used placeholder name)

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) - Complete hook event list, input schemas, configuration format
- [Node.js child_process Documentation](https://nodejs.org/api/child_process.html) - spawn() with detached, unref() patterns

### Secondary (MEDIUM confidence)
- [Winston Daily Rotate File](https://github.com/winstonjs/winston-daily-rotate-file) - Log rotation patterns
- [Better Stack Node.js Logging Guide](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/) - Structured logging patterns

### Tertiary (LOW confidence)
- OpenClaw research (.planning/research/OPENCLAW-RESEARCH.md) - 5-second timeout pattern, memory flush concept

## Metadata

**Confidence breakdown:**
- Hook events and configuration: HIGH - Verified from official Claude Code documentation
- Detached process spawning: HIGH - Verified from Node.js official documentation
- Log rotation: MEDIUM - Common pattern, multiple implementations possible
- Recovery scan: LOW - Implementation details to be determined during planning

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (Claude Code hooks API stable, 30 days reasonable)
