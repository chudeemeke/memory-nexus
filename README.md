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
```

## How It Works

1. Claude Code stores sessions as JSONL files in `~/.claude/projects/`
2. `memory sync` extracts messages, topics, and entities into a SQLite database with FTS5
3. Claude Code hooks trigger background sync automatically on session end
4. `memory search` and `memory context` query the database from any project directory

## Data Paths

| Purpose | Path |
|---------|------|
| Config | `~/.config/memory/config.json` |
| Database | `~/.local/share/memory/memory.db` |
| Logs | `~/.local/share/memory/logs/` |

Paths follow the XDG Base Directory Specification. Override with `XDG_CONFIG_HOME` and `XDG_DATA_HOME` environment variables.

## AI-First Design

This tool is designed for Claude to use via the Bash tool:

```bash
# Claude runs these commands to access cross-project knowledge
memory context <project-name>
memory search "query" --limit 5
```

Standard CLI output works for both humans and AI agents.

## Previously Published As

This package was previously published as `memory-nexus`. The old package name now installs a deprecation stub. See [MIGRATION.md](MIGRATION.md) for upgrade instructions.

## License

MIT
