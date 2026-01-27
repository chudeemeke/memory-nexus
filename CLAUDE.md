# Memory-Nexus

Cross-project context persistence for Claude Code sessions.

## Quick Summary

**Problem:** Claude Code sessions are per-directory and deleted after 30 days. Context does not transfer between projects. Knowledge gained in one project is invisible to work in another.

**Solution:** Extract session JSONL files into a searchable SQLite database accessible from any project via CLI commands.

**Status:** Documentation complete. Implementation deferred until after WoW v8.0.

## AI-First Design

**CRITICAL:** This tool is designed for Claude to use, not just humans.

### How It Works

Memory-nexus creates a well-structured SQLite database. Both Claude and humans query it using the same CLI commands:

```bash
# These work identically whether Claude or human runs them
aidev memory search "authentication patterns"
aidev memory context wow-system
aidev memory related <session-id>
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

### Future Enhancement: Vector Embeddings (Phase 4)

Semantic similarity search can be added later without major refactoring. Not needed for MVP.

## Documentation

Read these in order to understand the full context:

1. **[docs/01-VISION.md](docs/01-VISION.md)** - Problem statement and vision
2. **[docs/02-RESEARCH.md](docs/02-RESEARCH.md)** - Technical research findings
3. **[docs/03-DECISION-JOURNEY.md](docs/03-DECISION-JOURNEY.md)** - How we arrived at current design
4. **[docs/04-ARCHITECTURE.md](docs/04-ARCHITECTURE.md)** - Technical design and data model
5. **[docs/05-IMPLEMENTATION.md](docs/05-IMPLEMENTATION.md)** - Build plan and phases

## Project Structure

```
memory-nexus/
├── CLAUDE.md           # This file - project guidance
├── docs/
│   ├── SCRATCHPAD.md   # Documentation coordination
│   ├── 01-VISION.md    # Problem and vision
│   ├── 02-RESEARCH.md  # Technical research
│   ├── 03-DECISION-JOURNEY.md  # Design decisions
│   ├── 04-ARCHITECTURE.md      # Technical design
│   └── 05-IMPLEMENTATION.md    # Build plan
├── src/                # Implementation (future)
└── tests/              # Test suites (future)
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
| Database | SQLite + FTS5 | Embedded, no server, full-text search built-in |
| Trigger | Hook + manual CLI | Automatic extraction with manual fallback |
| Integration | aidev subcommand | Consistent with user's existing tooling |
| Scope | MVP first | Avoid over-engineering, validate core value |
| Timing | After WoW v8.0 | GSD-Lite methodology validated first |

## Session Storage Reference

Understanding Claude Code's session storage is critical for this project:

- **Location:** `~/.claude/projects/<encoded-dir>/*.jsonl`
- **Format:** Newline-delimited JSON (one event per line)
- **Retention:** 30 days (configurable in Claude Code settings)
- **Encoding:** Directory path is encoded (possibly base64 or hash)
- **Limitation:** Sessions are NOT portable between project directories

## Planned Commands

```bash
# Sync all sessions to database
aidev memory sync

# Full-text search across all sessions
aidev memory search "query"

# Get context for specific project
aidev memory context <project>

# List recent sessions
aidev memory list

# Show session details
aidev memory show <session-id>
```

## Development Methodology

When building this project, use **GSD-Lite** (manual 4-phase process):

### Phase 1: DISCUSS
- Clarify requirements before planning
- Ask questions to eliminate ambiguity
- Confirm scope and constraints

### Phase 2: PLAN
- Create atomic task plans
- Use backward reasoning from goal
- Identify dependencies

### Phase 3: EXECUTE
- One task at a time
- Commit after each completed task
- No skipping ahead

### Phase 4: VERIFY
- Test against success conditions
- Validate assumptions
- Document learnings

**Reference:** ~/Projects/get-stuff-done/docs/GSD-LITE-MANUAL.md

## When to Start Implementation

**After WoW v8.0 is complete.**

Rationale:
1. GSD-Lite methodology will be validated on WoW v8.0 first
2. No delays to the primary project (wow-system)
3. Build with a proven approach rather than experimental

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

Claude Code hooks can trigger extraction:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "SessionEnd",
      "command": "aidev memory sync --session $SESSION_ID"
    }]
  }
}
```

## Open Questions

These should be resolved during implementation:

1. **Encoding:** How exactly does Claude Code encode directory paths?
2. **Session boundaries:** How to detect session start/end in JSONL?
3. **Incremental sync:** How to avoid re-processing already-synced sessions?
4. **Conflict resolution:** What if same session is synced from different machines?

## Success Criteria

MVP is complete when:
- [ ] Can sync all sessions from ~/.claude/projects/ to SQLite
- [ ] Can search across all sessions with full-text search
- [ ] Can retrieve context for a specific project
- [ ] Integration with aidev CLI works
- [ ] Hook-based automatic sync works

## History

- **Origin:** Idea emerged during WoW v8.0 planning session
- **MCP Attempt:** Previous approach using MCP server (abandoned)
- **Current:** Documentation-first approach, defer implementation
- **Next:** Build after WoW v8.0 validates GSD methodology
