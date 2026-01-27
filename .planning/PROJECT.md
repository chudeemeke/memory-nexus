# Memory-Nexus

## What This Is

Cross-project context persistence for Claude Code sessions. Extracts JSONL session files into a searchable SQLite database with full-text search, relationship tracking, and graph-like traversal capabilities.

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## What This Is Not

- Not a cloud service - fully local, no network access
- Not a replacement for Claude's context window - a complement to it
- Not limited to MVP scope - building the full vision with relationships and hooks

## Problem Statement

Claude Code sessions are:
- Per-directory (context doesn't transfer between projects)
- Deleted after 30 days (configurable but still ephemeral)
- Not searchable across projects
- Invisible to work in other directories

This creates context silos. Patterns learned in project A are forgotten when working on project B.

## Solution

Extract session JSONL files into SQLite + FTS5 database accessible via CLI commands:
- `aidev memory sync` - Extract sessions to database
- `aidev memory search "query"` - Full-text search across all sessions
- `aidev memory context <project>` - Get project context
- `aidev memory related <id>` - Find related sessions via topic/entity links
- `aidev memory stats` - Database statistics

Both Claude and humans use the same commands. No special formatting needed.

## Technical Approach

**Database:** SQLite + FTS5 for embedded full-text search
- Zero configuration, single portable file
- FTS5 with porter tokenizer for natural language search
- Links table for graph-like relationship traversal
- Schema designed to accommodate future vector embeddings

**Pipeline Architecture:**
1. Discovery - Find and decode session directories
2. Extraction - Parse JSONL, extract messages and metadata
3. Storage - Persist to SQLite with FTS5 indexing
4. Query - Execute full-text and relational queries

**Integration:** Direct `aidev memory` subcommand (not standalone)

**Sync Triggers:**
- Automatic via Claude Code SessionStop hook
- Manual via `aidev memory sync`
- Both available, automatic by default

## Constraints

- **Local only** - No network access, no external APIs
- **TypeScript/JavaScript** - Matches aidev ecosystem
- **bun** - Package manager per WoW standards
- **95%+ coverage at EACH metric** - Statements, branches, functions, lines individually
- **Hexagonal architecture** - Domain-Application-Infrastructure-Presentation layers
- **TDD** - Tests before implementation

## Requirements

### Validated

(None yet - no implementation code exists)

### Active

**Discovery:**
- [ ] Locate Claude Code session directories at `~/.claude/projects/`
- [ ] Decode encoded directory names (C--Users-Destiny-Projects-wow-system)
- [ ] Map sessions to human-readable project names

**Extraction:**
- [ ] Parse JSONL files line-by-line (streaming for large files)
- [ ] Extract messages by type: user, assistant, system
- [ ] Extract tool uses with inputs and outputs
- [ ] Extract file modifications from snapshots
- [ ] Normalize timestamps to ISO 8601
- [ ] Track extraction progress for incremental updates
- [ ] Handle malformed JSON lines gracefully (skip and log)

**Storage:**
- [ ] Sessions table with metadata, project mapping, message counts
- [ ] Messages FTS5 virtual table with porter tokenizer
- [ ] Messages_meta table for non-FTS queries
- [ ] Tool_uses table for structured queries
- [ ] File_modifications table for file tracking
- [ ] Links table for graph-like relationship traversal
- [ ] Topics table for extracted concepts
- [ ] Extraction_state table for incremental sync
- [ ] Schema accommodates future embedding column (nullable)

**Query:**
- [ ] Full-text search across all sessions
- [ ] Project-filtered search
- [ ] Role-filtered search (user, assistant, all)
- [ ] Find related sessions via shared topics/entities
- [ ] Rank results by relevance (BM25)
- [ ] Format results with snippets and highlights

**CLI:**
- [ ] `aidev memory sync` - Full sync with options (--project, --session, --force, --quiet, --verbose)
- [ ] `aidev memory search <query>` - Full-text search with options (--project, --limit, --role, --json)
- [ ] `aidev memory context <project>` - Project context with options (--days, --format)
- [ ] `aidev memory related <id>` - Find related items
- [ ] `aidev memory stats` - Database statistics
- [ ] Human-friendly default output, --json for structured output

**Hooks:**
- [ ] Claude Code SessionStop hook for automatic sync
- [ ] Incremental sync (only new content since last sync)
- [ ] Quiet mode for non-blocking hook execution

**Relationships:**
- [ ] Link sessions to topics
- [ ] Link messages to entities (projects, files, concepts)
- [ ] Cross-session relationship discovery
- [ ] Weighted relationships for ranking

### Out of Scope

- Vector embeddings - Deferred to v2, but schema accommodates
- Web UI - CLI-only for v1
- MCP server integration - May add later
- Cross-machine sync - Local only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite + FTS5 | Embedded, no server, full-text search built-in, portable | Confirmed |
| Direct aidev integration | Consistent with user's existing tooling, not standalone | Confirmed |
| Relationships as core | Cross-session context is a primary use case | Confirmed |
| Both auto + manual sync | Flexibility for different workflows | Confirmed |
| Design for embeddings | Future-proofs schema without adding complexity now | Confirmed |
| Both output formats | Human-friendly default, --json for scripts/automation | Confirmed |
| TypeScript | Type safety, matches aidev ecosystem | Confirmed |
| better-sqlite3 | Synchronous API, better performance, FTS5 support | Confirmed |

## Open Questions

These need research before implementation:

1. **Session encoding** - How exactly does Claude Code encode directory paths? (Initial hypothesis: forward slashes and colons replaced with hyphens)
2. **Session boundaries** - How to reliably detect session start/end in JSONL?
3. **Incremental sync edge cases** - What if file is truncated? What if events are out of order?
4. **Subagent sessions** - How do agent-*.jsonl files relate to main sessions?

## Source Data Reference

**Location:** `~/.claude/projects/<encoded-dir>/<session-id>.jsonl`

**Event Types:**
- system - Session metadata, hook outputs
- user - User messages, tool results
- assistant - Claude responses, tool uses, thinking blocks
- file-history-snapshot - File modification tracking
- summary - Session summaries

## Related Projects

| Project | Relationship |
|---------|--------------|
| ai-dev-environment | Integration target (aidev memory subcommand) |
| wow-system | Where this idea originated |
| get-stuff-done | Development methodology |

## Quality Standards

Per WoW (Ways of Working):
- TDD: RED-GREEN-REFACTOR
- Coverage: 95%+ at EACH metric (statements, branches, functions, lines)
- Architecture: Hexagonal
- SOLID principles
- Git author: Chude <chude@emeke.org>
- No emojis in commits/docs
- No AI attribution

---

*Last updated: 2026-01-27 after initialization*
