# Memory-Nexus Documentation Scratchpad

## Instructions for Subagents

This file coordinates parallel documentation work. Each agent:
1. READ this file first to understand context
2. WRITE your assigned section in docs/0X-*.md
3. UPDATE the status below when done

## Project Summary (For All Agents)

**What:** Tool to extract Claude Code session JSONL files into searchable SQLite database
**Why:** Enable cross-project context access (sessions are per-directory, deleted after 30 days)
**Trigger:** Claude Code hook + manual aidev command
**Storage:** SQLite with FTS5 full-text search
**Related:** Former MCP attempt at ~/Projects/mcp-nexus/servers/memory-nexus

## Documentation Status

| Doc | Assigned | Status |
|-----|----------|--------|
| 01-VISION.md | Agent 2 | PENDING |
| 02-RESEARCH.md | Agent 3 | PENDING |
| 03-DECISION-JOURNEY.md | Agent 4 | PENDING |
| 04-ARCHITECTURE.md | Agent 5 | COMPLETE |
| 05-IMPLEMENTATION.md | Agent 6 | COMPLETE |
| CLAUDE.md | Agent 7 | PENDING |

## Key Facts (Copy Into Your Section As Needed)

- Session location: ~/.claude/projects/<encoded-dir>/*.jsonl
- Format: JSONL (one JSON event per line)
- Retention: 30 days default
- Cross-project resume: NOT supported
- FTS5: SQLite full-text search extension
- aidev: User's CLI tool framework (~/Projects/ai-dev-environment)
- Defer decision: Build AFTER WoW v8.0 using validated GSD methodology
