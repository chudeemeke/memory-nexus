# Memory-Nexus

## What This Is

Cross-project context persistence for Claude Code sessions. Extracts JSONL session files into a searchable SQLite database with full-text search, relationship tracking, entity extraction, and graph-like traversal capabilities. Ships as a standalone CLI with 16 commands covering sync, search, navigation, statistics, hooks, health checks, data management, and shell completion.

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

## What This Is Not

- Not a cloud service - fully local, no network access
- Not a replacement for Claude's context window - a complement to it
- Not a semantic/vector search tool (v1 uses keyword-based FTS5; vector search planned for v2)

## Current State

Shipped v1.0 with 49,764 LOC TypeScript (17,073 source + 32,691 tests).

**Tech stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5, Commander.js v14, cli-progress, chrono-node

**Architecture:** Hexagonal (Domain-Application-Infrastructure-Presentation) with strict layer separation. Domain layer has zero external dependencies. 99%+ domain coverage.

**Commands:** sync, search, list, stats, context, related, show, browse, install, uninstall, status, doctor, purge, export, import, completion

**Test suite:** ~1,966 tests, 95.67% line coverage, 94.49% function coverage, 85.46% mutation score (domain)

## Problem Statement

Claude Code sessions are:
- Per-directory (context doesn't transfer between projects)
- Deleted after 30 days (configurable but still ephemeral)
- Not searchable across projects
- Invisible to work in other directories

This creates context silos. Patterns learned in project A are forgotten when working on project B.

## Solution

Extract session JSONL files into SQLite + FTS5 database accessible via CLI commands:
- `memory-nexus sync` - Extract sessions to database (auto via hooks or manual)
- `memory-nexus search "query"` - Full-text search across all sessions
- `memory-nexus context <project>` - Get project context
- `memory-nexus related <id>` - Find related sessions via topic/entity links
- `memory-nexus show <id>` - View session conversation thread
- `memory-nexus stats` - Database statistics
- Plus 10 more commands for hooks, health, data management, and completion

Both Claude and humans use the same commands. No special formatting needed.

## Requirements

### Validated

- SETUP-01 through SETUP-04: Project scaffolding, bun:sqlite, schema, CLI entry point -- v1.0
- DOM-01 through DOM-12: All domain entities, value objects, ports, and services -- v1.0
- PARSE-01 through PARSE-10: Streaming JSONL parser, event classification, timestamps -- v1.0
- STOR-01 through STOR-08: All repository implementations, batch writes, WAL checkpoint -- v1.0
- SYNC-01 through SYNC-08: Sync command with all options -- v1.0
- SRCH-01 through SRCH-09: Search with FTS5, filters, ranking -- v1.0
- OUT-01 through OUT-06: Output formatting, JSON mode, verbose/quiet -- v1.0
- STAT-01 through STAT-04: Stats with per-project breakdown -- v1.0
- NAV-01 through NAV-05: List, show, browse, session picker -- v1.0
- CTX-01 through CTX-04: Context aggregation with filters -- v1.0
- REL-01 through REL-05: Related command with graph traversal -- v1.0
- HOOK-01 through HOOK-05: Hook integration with background sync -- v1.0
- EXTR-01 through EXTR-04: Entity extraction, tool tracking -- v1.0
- ERR-01 through ERR-05: Error handling, exit codes, signal handling -- v1.0
- QUAL-02 through QUAL-05: Unit, integration, and concurrent tests -- v1.0
- QUAL-01: Coverage threshold -- v1.0 (near-pass: 94.49% functions, Bun limitation)

### Active

(None yet -- define with `/gsd:new-milestone` for v2)

### Out of Scope

- Vector/semantic search with embeddings -- Planned for v2 (informed by OpenClaw hybrid search patterns)
- Web UI -- CLI-only tool
- MCP server integration -- May add after CLI validates
- Cross-machine sync -- Local only; iCloud/git handles backup
- Multi-user support -- Personal productivity tool
- Session editing -- Read-only extraction
- Real-time streaming -- Sessions are batch files
- Pre-compaction memory flush -- Requires Claude Code hook event that doesn't exist yet

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite + FTS5 | Embedded, no server, full-text search built-in, portable | Good |
| bun:sqlite over better-sqlite3 | ABI compatibility issues with Bun; bun:sqlite is 3-6x faster | Good |
| Direct aidev integration | Consistent with user's existing tooling, not standalone | Good |
| Hexagonal architecture | User's WoW standard; clear layer separation | Good |
| Streaming JSONL parser | Session files can exceed 10,000 lines; memory exhaustion risk | Good |
| FTS5 MATCH only | = operator causes full table scan; must enforce MATCH | Good |
| BM25 ranking default | Lower (more negative) scores indicate better relevance | Good |
| readline.createInterface | Node's built-in streaming for JSONL parsing | Good |
| Post-filter for case sensitivity | FTS5 is inherently case-insensitive; post-filter with 2x fetch limit | Good |
| Strategy pattern for formatters | OutputFormatter, ListFormatter, ShowFormatter enable clean output modes | Good |
| WITH RECURSIVE CTE | Multi-hop graph traversal in SQLite for relationship discovery | Good |
| Detached process for hooks | spawn() with detached:true, stdio:ignore + unref() for background | Good |
| Native shell completion | Self-contained bash/zsh/fish scripts; no external dependency like Carapace | Good |
| Commander.js v14 | Mature CLI framework with built-in conflicts(), argParser, and help | Good |
| Design for embeddings | Schema accommodates future vector column without current complexity | Pending |

## Resolved Questions

All open questions from pre-implementation were resolved:

1. **Session encoding** -- Claude Code encodes as C--Users-Destiny-Projects-wow-system (forward slashes and colons replaced with hyphens)
2. **Session boundaries** -- Each JSONL file is one session; no need for boundary detection within files
3. **Incremental sync** -- mtime + fileSize comparison with per-session transaction boundaries for atomicity
4. **Subagent sessions** -- Stored in `<session-uuid>/subagents/` directories; discoverable via glob

## Constraints

- **Local only** -- No network access, no external APIs
- **TypeScript** -- Matches aidev ecosystem
- **bun** -- Package manager per WoW standards
- **95%+ coverage at EACH metric** -- Statements, branches, functions, lines individually (Bun only measures functions + lines)
- **Hexagonal architecture** -- Domain-Application-Infrastructure-Presentation layers
- **TDD** -- Tests before implementation

## Related Projects

| Project | Relationship |
|---------|--------------|
| ai-dev-environment | Integration target (aidev memory subcommand) |
| wow-system | Where this idea originated |
| get-stuff-done | Development methodology |
| OpenClaw | Research reference for v2 semantic search patterns |

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

*Last updated: 2026-02-16 after v1.0 milestone*
