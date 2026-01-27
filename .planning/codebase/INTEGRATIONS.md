# External Integrations

**Analysis Date:** 2026-01-27

## File System

**Claude Code Session Storage:**
- Location: `~/.claude/projects/<encoded-dir>/*.jsonl`
- Format: JSONL (JSON Lines) - one JSON object per line
- Encoding: Directory paths encoded (forward slashes and colons replaced with hyphens)
- Example: `C:/Users/Destiny/Projects/wow-system` becomes `C--Users-Destiny-Projects-wow-system`

**Session File Naming:**
- UUID format: `b0a283ef-ea70-4509-a791-4f65831c3174.jsonl` (main sessions)
- Agent format: `agent-a60ceb4.jsonl` (subagent sessions)

**Memory-Nexus Database:**
- Default: `~/.memory-nexus/memory.db`
- Configurable via `MEMORY_NEXUS_DB` environment variable
- Logs: `~/.memory-nexus/logs/memory-nexus.log`

**Configuration:**
- `~/.config/memory-nexus/config.json` - User configuration

## CLI Integration

**aidev Subcommand:**
- Integrates as `aidev memory <action>`
- Commands:
  - `aidev memory sync` - Extract sessions to database
  - `aidev memory search "query"` - Full-text search
  - `aidev memory context <project>` - Get project context
  - `aidev memory related <id>` - Find related sessions/topics
  - `aidev memory stats` - Database statistics

**Integration Pattern:**
```javascript
// Registers with ai-dev-environment CLI framework
aidev.registerSubcommand('memory', {
  description: 'Claude Code session memory management',
  subcommands: { sync, search, context, related, stats }
});
```

## Hooks/Triggers

**Claude Code SessionStop Hook:**
- Location: `~/.claude/settings.json`
- Trigger: Runs after each Claude Code session ends
- Purpose: Automatic session extraction

```json
{
  "hooks": {
    "SessionStop": [
      {
        "matcher": "",
        "command": "aidev memory sync --session $CLAUDE_SESSION_ID --quiet"
      }
    ]
  }
}
```

**Hook Environment Variables:**
- `$CLAUDE_SESSION_ID` - Current session UUID
- `$CLAUDE_CWD` - Session working directory

**Manual Sync:**
- `aidev memory sync` - Full extraction
- `aidev memory sync --session <id>` - Single session
- `aidev memory sync --project <name>` - Project filter
- `aidev memory sync --force` - Ignore incremental state

**Scheduled Sync (Optional):**
```bash
# Cron example: hourly background sync
0 * * * * aidev memory sync --quiet --log /tmp/memory-nexus-sync.log
```

## Data Sources

**JSONL Event Types Consumed:**
1. `system` - Session metadata (version, cwd, git branch)
2. `user` - User messages and tool results
3. `assistant` - Assistant responses (text, thinking, tool use)
4. `file-history-snapshot` - File modification tracking
5. `summary` - Session summaries

**Extracted Data:**
- Messages (user, assistant, system)
- Tool uses (Bash, Read, Write, Edit, Glob, Grep)
- File modifications
- Session metadata (timestamps, models, git branches)

## Future Integrations

**Phase 4 (Deferred):**
- Vector embeddings for semantic search
  - Requires embedding model (OpenAI API or local)
  - sqlite-vss extension for vector storage
- MCP server exposure for Claude Code direct access
- Web UI for browsing (Electron or local server)

**Not Planned:**
- Cloud sync/backup
- Multi-user/shared memory
- External authentication

## Security Considerations

**Data Sensitivity:**
- Session data may contain code snippets, file paths, credentials
- Database stored with user-only permissions (600)
- Fully local tool - no network access

**Optional Credential Scrubbing:**
- Patterns detected: API keys, tokens, secrets, private keys
- Scrubbed during extraction if enabled
- Configurable exclusion patterns

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| ai-dev-environment | `~/Projects/ai-dev-environment` | CLI integration target (`aidev memory` subcommand) |
| wow-system | `~/Projects/wow-system` | Source of WoW standards; build memory-nexus after v8.0 |
| get-stuff-done | `~/Projects/get-stuff-done` | GSD-Lite methodology for implementation |
| mcp-nexus | `~/Projects/mcp-nexus/servers/memory-nexus` | Predecessor MCP approach (abandoned) |

---

*Integration audit: 2026-01-27*
