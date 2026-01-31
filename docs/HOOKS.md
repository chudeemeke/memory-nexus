# Hook Integration Guide

Memory-nexus can automatically sync Claude Code sessions using the hook system. When a session ends or context is compacted, hooks trigger a background sync that persists your conversation to the searchable database.

## Quick Start

```bash
# Install hooks (one-time setup)
aidev memory install

# Check status
aidev memory status

# Uninstall if needed
aidev memory uninstall
```

## How It Works

### Hook Events

Memory-nexus uses two Claude Code hook events:

1. **SessionEnd** - Triggers when:
   - User exits Claude Code
   - Session is cleared
   - User logs out
   - Other session termination events

2. **PreCompact** - Triggers when:
   - Context window reaches capacity
   - Automatic compaction occurs (configurable via `syncOnCompaction`)

Both events provide the session ID, enabling targeted sync of just the affected session.

### Background Execution

Hooks spawn a detached background process that:
- Runs independently of Claude Code
- Continues even if Claude Code exits
- Logs activity to `~/.memory-nexus/logs/sync.log`
- Never blocks the terminal or Claude Code
- Always exits with code 0 (to prevent blocking)

### What Gets Synced

Each sync extracts:
- User messages
- Assistant responses (excluding thinking blocks)
- Tool uses (name, inputs, outputs)
- Session metadata (project, timestamps)

## Configuration

Configuration is stored in `~/.memory-nexus/config.json`:

```json
{
  "autoSync": true,
  "recoveryOnStartup": true,
  "syncOnCompaction": true,
  "timeout": 5000,
  "logLevel": "info",
  "logRetentionDays": 7,
  "showFailures": false
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoSync` | boolean | true | Enable automatic hook-based sync |
| `recoveryOnStartup` | boolean | true | Scan for unsaved sessions on first command |
| `syncOnCompaction` | boolean | true | Sync when context is compacted (PreCompact event) |
| `timeout` | number | 5000 | Sync timeout in milliseconds |
| `logLevel` | string | "info" | Logging level (debug/info/warn/error) |
| `logRetentionDays` | number | 7 | Days before log rotation |
| `showFailures` | boolean | false | Show failure notifications to user |

### Editing Configuration

Edit the config file directly:

```bash
# View current config
cat ~/.memory-nexus/config.json

# Edit with your preferred editor
code ~/.memory-nexus/config.json
```

Changes apply on the next hook trigger (no restart needed).

**Note:** If the config file doesn't exist, memory-nexus uses the defaults shown above.

## Installation Details

### What `install` Does

1. Backs up existing `~/.claude/settings.json` to `~/.memory-nexus/backups/`
2. Copies hook script to `~/.memory-nexus/hooks/sync-hook.js`
3. Adds SessionEnd and PreCompact hooks to Claude Code settings
4. Validates installation

The installation is idempotent - running it multiple times won't duplicate hooks.

### Manual Installation

If automatic installation fails, you can manually add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [{
          "type": "command",
          "command": "bun run \"~/.memory-nexus/hooks/sync-hook.js\"",
          "timeout": 5
        }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [{
          "type": "command",
          "command": "bun run \"~/.memory-nexus/hooks/sync-hook.js\"",
          "timeout": 5
        }]
      }
    ]
  }
}
```

**Note:** The PreCompact hook uses `"matcher": "auto"` to only trigger on automatic compaction, not manual.

### Uninstallation

```bash
# Remove hooks (preserves database and config)
aidev memory uninstall

# Restore original settings from backup
aidev memory uninstall --restore
```

The uninstall command:
- Removes only memory-nexus hooks from settings.json
- Preserves any other hooks you may have configured
- Leaves your database and config intact

## Troubleshooting

### Check Status

```bash
aidev memory status
```

Shows:
- Hook installation state (SessionEnd, PreCompact)
- Hook script file exists
- Configuration values
- Last sync time
- Pending sessions count

The `stats` command also includes a hooks section:

```bash
aidev memory stats
```

### View Logs

```bash
# Recent log entries
tail -f ~/.memory-nexus/logs/sync.log

# Search for errors
grep '"level":"error"' ~/.memory-nexus/logs/sync.log
```

Log format (JSON lines):
```json
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"Triggered sync for session abc123","sessionId":"abc123","hookEvent":"SessionEnd"}
```

Log entries include:
- `timestamp`: ISO 8601 format
- `level`: debug, info, warn, or error
- `message`: Human-readable description
- `sessionId`: Session identifier (when applicable)
- `hookEvent`: SessionEnd or PreCompact
- `durationMs`: Operation duration (when applicable)
- `error`: Error details (when applicable)

### Common Issues

#### Hooks Not Triggering

1. Check hooks are installed: `aidev memory status`
2. Verify `autoSync: true` in config
3. Check Claude Code recognizes hooks: restart Claude Code
4. Check logs for errors: `tail ~/.memory-nexus/logs/sync.log`

#### PreCompact Not Triggering

1. Verify `syncOnCompaction: true` in config
2. PreCompact only fires on automatic compaction, not manual
3. The hook uses `"matcher": "auto"` to filter

#### Sync Failing

1. Check log file for errors
2. Verify database is accessible: `aidev memory stats`
3. Try manual sync: `aidev memory sync`
4. Check disk space

#### Settings.json Corrupted

1. Restore from backup:
   ```bash
   aidev memory uninstall --restore
   ```
2. Or manually restore:
   ```bash
   cp ~/.memory-nexus/backups/settings.json.backup ~/.claude/settings.json
   ```

#### Bun Not Found

The hook script requires Bun. If you see "bun: command not found":

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### Recovery

If hooks were disabled or failed, sessions may not have been synced. Use recovery:

```bash
# See pending sessions count
aidev memory status

# View stats (includes pending sessions)
aidev memory stats

# Sync all pending sessions
aidev memory sync
```

The `recoveryOnStartup` config option automatically scans for missed sessions on the first command.

## Disabling Auto-Sync

To disable automatic sync while keeping hooks installed:

```json
// ~/.memory-nexus/config.json
{
  "autoSync": false
}
```

Or uninstall hooks entirely:

```bash
aidev memory uninstall
```

Manual sync remains available:

```bash
aidev memory sync
```

## File Locations

| Path | Purpose |
|------|---------|
| `~/.memory-nexus/config.json` | User configuration |
| `~/.memory-nexus/hooks/sync-hook.js` | Hook script entry point |
| `~/.memory-nexus/logs/sync.log` | Sync activity log |
| `~/.memory-nexus/backups/settings.json.backup` | Settings backup from install |
| `~/.claude/settings.json` | Claude Code settings (modified by install) |
| `~/.memory-nexus/memory-nexus.sqlite` | Session database |

## Security Considerations

- Hook script runs with user permissions
- No data leaves your machine
- Database is local SQLite
- Logs contain session IDs (not message content)
- Backup files may contain previous Claude Code settings

## Architecture Overview

The hook system follows a simple flow:

```
Claude Code Hook Event
       |
       v
sync-hook.js (stdin reads JSON)
       |
       v
Check config (autoSync, syncOnCompaction)
       |
       v
Spawn detached background process
       |
       v
aidev memory sync --session <id> --quiet
       |
       v
Session extracted and stored in SQLite
```

Key design decisions:
- **Detached process**: Parent (Claude Code) can exit without waiting
- **Always exit 0**: Never block Claude Code even on errors
- **JSON line logs**: Machine-parseable for monitoring
- **Idempotent install**: Safe to run multiple times
- **Config hot-reload**: Changes apply without restart
