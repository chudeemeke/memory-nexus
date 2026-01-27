# Features Research

**Project:** memory-nexus
**Domain:** CLI-based session extraction and search tool
**Researched:** 2026-01-27
**Confidence:** MEDIUM (based on WebSearch and existing tool patterns, verified against official documentation where possible)

## Executive Summary

Session/log extraction and search tools share common patterns across the industry. The table stakes are well-established from tools like ripgrep, fzf, and log management platforms. For memory-nexus specifically, the unique value proposition lies in cross-project context unification and AI-first design, which distinguishes it from generic log search tools.

---

## Table Stakes

Features users expect from any session/log search tool. Missing these means the product feels incomplete or unusable.

### Core Search

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Full-text search | Medium | Search across all content with relevance ranking | Industry standard - ripgrep, fzf, and all log tools provide this |
| Result snippets | Low | Show matching text with surrounding context | Users need to see WHERE the match occurred, not just that it exists |
| Result limiting | Low | `--limit N` to control result count | Essential for large datasets; default should be reasonable (10-20) |
| Result ordering | Low | Sort by relevance, date, or other criteria | Time-based often most useful for sessions |
| Case sensitivity control | Low | `--ignore-case` / `--case-sensitive` flags | Standard grep/rg pattern that users expect |

### Output Formatting

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Human-readable default | Low | Formatted output with colors and structure | "CLIs are for humans before machines" - Heroku CLI style guide |
| JSON output flag | Low | `--json` for programmatic consumption | Essential for scripting, piping to jq, automation |
| Quiet mode | Low | `--quiet` for suppressed output in hooks | Required for non-blocking background sync |
| Verbose mode | Low | `--verbose` for detailed progress/debugging | Users need visibility into what's happening |

### Data Sync

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Manual sync command | Low | `sync` to trigger extraction on demand | Users must be able to control when data updates |
| Incremental sync | Medium | Only process new/changed content | Full sync is too slow; incremental is industry standard for ETL |
| Sync progress indicator | Low | Show progress during extraction | Users need feedback during potentially long operations |
| Force re-sync | Low | `--force` to rebuild from scratch | Recovery mechanism when incremental state is corrupted |

### Filtering

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Project filter | Low | `--project <name>` to scope search | Core use case - search within specific project context |
| Time range filter | Low | `--since`, `--before`, `--days` for date bounds | Sessions are temporal; time scoping is essential |
| Role filter | Low | `--role user/assistant` for message type | Different use cases require filtering by speaker |

### Basic Statistics

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Stats command | Low | Show database statistics (sessions, messages, etc.) | Users need to verify tool is working correctly |
| Per-project breakdown | Low | Stats filtered by project | Understand distribution of data across projects |

---

## Differentiators

Features that make memory-nexus unique in its domain. These provide competitive advantage and address unmet needs.

### Cross-Project Context (Core Value)

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Unified index | Medium | Single database for all projects | Main problem being solved - no other tool does this for Claude Code |
| Cross-project search | Low | Search results span all projects | Enables "bring context from project A to project B" |
| Context command | Medium | `aidev memory context <project>` for project summaries | Quick context retrieval is unique value |
| Related sessions | Medium | Find sessions sharing topics/entities | Graph-like traversal between sessions |

### AI-First Design

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Bash-tool compatible | Low | Output works well when Claude calls via Bash | Primary consumer is Claude, not humans |
| Consistent structure | Low | Predictable output format for AI parsing | Reduces context needed to explain output to Claude |
| Context-sized results | Low | Output fits within Claude's context window | Prevent truncation when AI consumes results |

### Intelligent Extraction

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Tool use tracking | Medium | Structured queries on tool invocations | "What files did Claude edit?" is a common question |
| File modification history | Medium | Track files modified per session | Audit trail for AI-assisted changes |
| Session summary extraction | Low | Extract Claude's auto-generated summaries | Summaries provide quick session overview |
| Thinking block indexing | Medium | Search Claude's reasoning separately | Debug AI behavior, understand decision process |

### Automatic Sync

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Hook-based extraction | Medium | Claude Code SessionStop hook triggers sync | Zero-friction - just works without user action |
| Session-specific sync | Low | Sync just the ended session (not all) | Fast, targeted update after each conversation |
| Background execution | Low | Hook runs non-blocking | User shouldn't wait for sync to complete |

### Retention Control

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| Permanent archive | Low | No automatic deletion (unlike Claude Code's 30-day) | Solving the data loss problem |
| User-controlled retention | Low | Optional `--retention-days` for cleanup | Some users may want to limit storage |

### Session Navigation (Inspired by Claude Code)

| Feature | Complexity | Description | Rationale |
|---------|------------|-------------|-----------|
| List sessions | Low | `list` command showing recent sessions | Gemini CLI's `/resume` picker concept |
| Session detail | Low | `show <session-id>` for full session | Deep dive into specific conversation |
| Session search | Low | Search within session picker | fzf-style fuzzy finding in session list |

---

## Anti-Features

Features to deliberately NOT build. Either out of scope, actively harmful, or premature optimization.

### Avoid: Over-Engineering

| Anti-Feature | Why Not |
|--------------|---------|
| Vector/semantic search (MVP) | Adds complexity (embedding model, sqlite-vss); FTS5 covers 80% of use cases. Can add in Phase 4 if needed. |
| Real-time streaming | Claude Code sessions are batch files, not streams. Over-engineering for the source data format. |
| Machine learning anomaly detection | Log management platforms have this; irrelevant for session search. |
| Dashboards/visualization | CLI tool, not a web app. ASCII tables are sufficient. |
| Multi-user/shared memory | Out of scope - personal productivity tool. Adds auth complexity. |

### Avoid: Scope Creep

| Anti-Feature | Why Not |
|--------------|---------|
| Cloud sync/backup | Local-first tool. iCloud/Dropbox/git handles backup. |
| Memory editing/annotation | Read-only extraction. Don't modify source data. |
| MCP server (MVP) | CLI is simpler and works today. MCP can be added later if needed. |
| Session replay | Interactive playback adds complexity; read-only search is sufficient. |
| Diff between sessions | Complex feature with limited use cases. |

### Avoid: Security Risks

| Anti-Feature | Why Not |
|--------------|---------|
| Network access | Fully local tool. No phone-home, no remote DB. |
| Automatic credential extraction | Risk of exposing secrets. Optional scrubbing is safer. |
| Unprotected database | Must set proper file permissions (600). |

### Avoid: Poor UX Patterns

| Anti-Feature | Why Not |
|--------------|---------|
| Mandatory configuration | Should work with zero config; sensible defaults. |
| Blocking sync in hooks | Hook must be non-blocking; user shouldn't wait. |
| Invisible failures | Must report errors clearly, not silently fail. |
| Default verbose output | Default should be clean; verbose opt-in. |
| Emoji in output | WoW standards prohibit emoji; professional text only. |

---

## Feature Dependencies

Understanding dependencies helps sequence implementation correctly.

```
Database Schema
    |
    +---> Message Storage ---> FTS5 Index ---> Search Command
    |
    +---> Session Storage ---> List Command
    |                     |
    |                     +---> Stats Command
    |
    +---> Extraction State ---> Incremental Sync

JSONL Parsing
    |
    +---> Event Classification
          |
          +---> Message Extraction ---> Messages Table
          |
          +---> Tool Use Extraction ---> Tool Uses Table
          |
          +---> Summary Extraction ---> Sessions Table

Hook Integration
    |
    +---> Depends on: sync command working
    |
    +---> Depends on: quiet mode implemented

Context Command
    |
    +---> Depends on: Search working
    |
    +---> Depends on: Project filtering working

Related Sessions
    |
    +---> Depends on: Links table
    |
    +---> Depends on: Topic/entity extraction
```

### Dependency Matrix

| Feature | Depends On |
|---------|------------|
| `search` command | Database schema, FTS5 index, message extraction |
| `list` command | Session extraction |
| `stats` command | Session and message extraction |
| `context` command | Search working, project filtering |
| `related` command | Links table, topic extraction |
| Incremental sync | Extraction state table |
| Hook-based sync | Sync command, quiet mode |
| JSON output | All commands (cross-cutting) |
| Project filtering | Encoded path decoding |

---

## Complexity Assessment

### Quick Wins (Low Complexity, High Value)

Ship these first - immediate user value with minimal effort:

- `sync` command with full extraction (no incremental yet)
- Basic `search` command with FTS5
- `list` command for session overview
- `stats` command
- `--json` output flag
- `--project` filter
- `--limit` flag
- Human-readable default output

### Medium Effort (Required for Production)

Necessary for reliable daily use:

- Incremental sync (track extraction state)
- Streaming JSONL parser (handle large files)
- Tool use extraction and indexing
- File modification tracking
- Thinking block extraction
- `context` command
- `--since`/`--before` time filters
- Error handling and graceful degradation
- Hook-based automatic sync

### Significant Investment (Defer to Phase 2+)

Valuable but not MVP-blocking:

- Related sessions via links table
- Topic/entity extraction
- Session search/fuzzy finder
- Credential scrubbing
- Export formats (markdown, HTML)
- Advanced query syntax
- Session forking concept

### Out of Scope (Phase 4 or Never)

Don't build unless explicitly validated:

- Vector embeddings / semantic search
- MCP server integration
- Multi-user support
- Cloud sync
- Visualization dashboards

---

## Industry Patterns Reference

### From ripgrep
- Smart defaults (recursive, respects .gitignore)
- Color highlighting for matches
- Context lines (`-C`, `-A`, `-B`)
- Smart case sensitivity
- Type filtering (`--type js`)

### From fzf
- Interactive fuzzy finding
- Multi-selection mode
- Preview panes
- Keyboard navigation

### From Claude Code Session Management
- `--continue` (most recent)
- `--resume` (picker with search)
- Session forking
- Per-project session isolation (what we're solving)

### From Gemini CLI
- Automatic session saving
- Session browser with `/resume`
- Project-specific history
- Complete state capture

### From Log Management Tools
- Full-text search (Elasticsearch, Splunk SPL)
- Structured queries (SQL-like)
- Time-based filtering
- Aggregations and counts
- Retention policies

---

## MVP Feature Set Recommendation

Based on this research, the MVP should include:

**Must Have:**
1. JSONL extraction to SQLite
2. FTS5 full-text search
3. `sync` command (manual trigger)
4. `search` command (basic)
5. `list` command (session overview)
6. `stats` command
7. `--json` output flag
8. `--project` filter
9. `--limit` flag
10. Human-readable default output

**Should Have (for daily use):**
1. Incremental sync
2. Hook-based automatic sync
3. `context` command
4. Time-based filtering
5. Tool use indexing

**Nice to Have (Phase 2):**
1. Related sessions
2. Session detail view
3. Interactive fuzzy finder
4. Export formats

---

## Sources

- [Better Stack Log Monitoring Tools](https://betterstack.com/community/comparisons/log-monitoring-tools/)
- [Gemini CLI Session Management](https://developers.googleblog.com/pick-up-exactly-where-you-left-off-with-session-management-in-gemini-cli/)
- [ripgrep GitHub](https://github.com/BurntSushi/ripgrep)
- [SQLite FTS5 Documentation](https://sqlite.org/fts5.html)
- [Heroku CLI Style Guide](https://devcenter.heroku.com/articles/cli-style-guide)
- [CLI UX Patterns](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html)
- [Command Line Interface Guidelines](https://clig.dev/)
- [Airbyte Incremental Loading](https://airbyte.com/data-engineering-resources/etl-incremental-loading)
- [Feature Comparison: ack, ag, git-grep, grep, ripgrep](https://beyondgrep.com/feature-comparison/)
- [Claude Code Session Workflows](https://code.claude.com/docs/en/common-workflows)
