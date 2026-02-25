# @chude/memory

Cross-project context persistence for Claude Code sessions.

## Quick Summary

**Problem:** Claude Code sessions are per-directory and deleted after 30 days. Context does not transfer between projects. Knowledge gained in one project is invisible to work in another.

**Solution:** Extract session JSONL files into a searchable SQLite database accessible from any project via the `memory` CLI.

**Package:** `@chude/memory` (binary: `memory`)
**Install:** `bun add -g @chude/memory`

## AI-First Design

**CRITICAL:** This tool is designed for Claude to use, not just humans.

### How It Works

Memory creates a well-structured SQLite database. Both Claude and humans query it using the same CLI commands:

```bash
# These work identically whether Claude or human runs them
memory search "authentication patterns"
memory context wow-system
memory related <session-id>
```

Claude uses the Bash tool to run these commands. No special formatting needed - good database design + standard CLI = works for everyone.

### Database Design (Medium Complexity)

SQLite + FTS5 + Relationship Tables:
- **Relational queries** - Standard SQL
- **Full-text search** - FTS5 extension
- **Graph-like traversal** - Link tables for multi-relationships

```sql
-- The "links" table enables graph-like queries
CREATE TABLE links (
    source_type TEXT,  -- 'message', 'session', 'topic'
    source_id TEXT,
    target_type TEXT,
    target_id TEXT,
    relationship TEXT, -- 'mentions', 'related_to', 'continues'
    weight REAL
);
```

### When Claude Should Query Memory

- Starting work on unfamiliar project area
- User references "what we discussed before"
- Looking for patterns across projects
- Retrieving decisions/rationale from past sessions

### Future Enhancement: Vector Embeddings

Semantic similarity search via embedding infrastructure. Phases 14-16 add sqlite-vec, embedding pipeline, and hybrid BM25+cosine search.

## Documentation

Read these in order to understand the full context:

1. **[docs/01-VISION.md](docs/01-VISION.md)** - Problem statement and vision
2. **[docs/02-RESEARCH.md](docs/02-RESEARCH.md)** - Technical research findings
3. **[docs/03-DECISION-JOURNEY.md](docs/03-DECISION-JOURNEY.md)** - How we arrived at current design
4. **[docs/04-ARCHITECTURE.md](docs/04-ARCHITECTURE.md)** - Technical design and data model
5. **[docs/05-IMPLEMENTATION.md](docs/05-IMPLEMENTATION.md)** - Build plan and phases

## Project Structure

```
memory/
├── CLAUDE.md               # This file - project guidance
├── MIGRATION.md            # Upgrade guide from memory-nexus to @chude/memory
├── deprecation-stub/       # Stub package published as "memory-nexus" on npm
├── docs/
│   ├── SCRATCHPAD.md       # Documentation coordination
│   ├── 01-VISION.md        # Problem and vision
│   ├── 02-RESEARCH.md      # Technical research
│   ├── 03-DECISION-JOURNEY.md  # Design decisions
│   ├── 04-ARCHITECTURE.md      # Technical design
│   └── 05-IMPLEMENTATION.md    # Build plan
├── src/                    # Implementation
│   ├── domain/             # Domain layer (zero external deps)
│   ├── application/        # Application services
│   ├── infrastructure/     # Database, hooks, filesystem
│   └── presentation/       # CLI commands
└── tests/                  # Test suites
```

## Related Projects

| Project | Path | Relationship |
|---------|------|--------------|
| MCP Attempt | ~/Projects/mcp-nexus/servers/memory-nexus | Predecessor using MCP approach (different design) |
| aidev | ~/Projects/ai-dev-environment | CLI integration target (`aidev memory` subcommand) |
| wow-system | ~/Projects/wow-system | Where this idea originated during v8.0 planning |
| get-stuff-done | ~/Projects/get-stuff-done | GSD methodology for implementation |

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package name | @chude/memory, binary: memory | Matches aidev subcommand; old name deprecated |
| Database | SQLite + FTS5 | Embedded, no server, full-text search built-in |
| Paths | XDG Base Directory Specification | ~/.config/memory (config), ~/.local/share/memory (data) |
| Trigger | Hook + manual CLI | Automatic extraction with manual fallback |
| Integration | aidev subcommand | Consistent with user's existing tooling |
| Migration | Automatic on first run | Detects ~/.memory-nexus/ and migrates to XDG paths |

## Session Storage Reference

Understanding Claude Code's session storage is critical for this project:

- **Location:** `~/.claude/projects/<encoded-dir>/*.jsonl`
- **Format:** Newline-delimited JSON (one event per line)
- **Retention:** 30 days (configurable in Claude Code settings)
- **Encoding:** Directory path is encoded (possibly base64 or hash)
- **Limitation:** Sessions are NOT portable between project directories

## Commands

```bash
# Sync all sessions to database
memory sync

# Full-text search across all sessions
memory search "query"

# Get context for specific project
memory context <project>

# List recent sessions
memory list

# Show session details
memory show <session-id>

# Install/uninstall Claude Code hooks
memory install
memory uninstall

# Check installation health
memory doctor
memory status
```

## Data Paths

| Purpose | Path |
|---------|------|
| Config | `~/.config/memory/config.json` |
| Database | `~/.local/share/memory/memory.db` |
| Logs | `~/.local/share/memory/logs/` |
| Hooks | `~/.local/share/memory/hooks/` |
| Backups | `~/.local/share/memory/backups/` |
| Legacy (migration source) | `~/.memory-nexus/` |

## Quality Standards

This project follows the user's Ways of Working (WoW) standards:

- **TDD:** Write tests before implementation
- **Coverage:** 95%+ at EACH metric (statements, branches, functions, lines)
- **Architecture:** Hexagonal (Domain-Application-Infrastructure-Presentation)
- **SOLID:** Apply principles to all design decisions
- **Git Author:** Chude <chude@emeke.org>
- **No Emojis:** Never in commits, docs, or code
- **No AI Attribution:** Never include "Generated with Claude" etc.

## Technical Context

### SQLite FTS5

Full-text search extension for SQLite:
```sql
-- Create virtual table with FTS5
CREATE VIRTUAL TABLE sessions_fts USING fts5(
    content,
    project,
    timestamp
);

-- Search with ranking
SELECT * FROM sessions_fts WHERE sessions_fts MATCH 'query'
ORDER BY rank;
```

### JSONL Parsing

Each line is independent JSON:
```python
with open(session_file) as f:
    for line in f:
        event = json.loads(line)
        # Process event
```

### Hook Integration

Claude Code hooks trigger automatic sync:
```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "bun run ~/.local/share/memory/hooks/sync-hook.js",
        "timeout": 5
      }]
    }]
  }
}
```

## History

- **Origin:** Idea emerged during WoW v8.0 planning session
- **MCP Attempt:** Previous approach using MCP server (abandoned)
- **v1.0:** Shipped as memory-nexus with full CLI, sync, search, and hooks
- **v2.0:** Renamed to @chude/memory, XDG paths, embedding infrastructure planned
