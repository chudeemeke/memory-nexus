# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**
- JavaScript (Node.js) - Core implementation language

**Secondary:**
- SQL - Database schema and queries (SQLite dialect with FTS5)
- Bash - Hook scripts for Claude Code integration

## Runtime

**Environment:**
- Node.js (version not specified, modern LTS assumed)

**Package Manager:**
- bun - Per user's WoW standards (bun over npm)
- Lockfile: `bun.lock` (required per user conventions)

## Frameworks

**Core:**
- None - Standalone CLI tool, no framework

**Testing:**
- Jest ^29.0.0 - Test runner and assertions

**Build/Dev:**
- ESLint ^8.0.0 - Code linting

## Database

**Primary:**
- SQLite - Embedded relational database
  - FTS5 extension for full-text search
  - WAL mode for concurrent read performance
  - No server process required

**Why SQLite:**
- Zero configuration
- Single portable file
- Built-in full-text search (FTS5)
- ACID-compliant
- Handles millions of rows

## Key Dependencies (Planned)

**Critical:**
- `better-sqlite3` ^9.0.0 - Synchronous SQLite bindings with FTS5 support
- `commander` ^11.0.0 - CLI argument parsing (matches aidev ecosystem)

**Infrastructure:**
- `chalk` ^5.0.0 - Terminal colors for CLI output
- `glob` ^10.0.0 - File pattern matching for session discovery
- `date-fns` ^2.30.0 - Date parsing and formatting

**Development:**
- `jest` ^29.0.0 - Testing framework
- `@types/better-sqlite3` ^7.0.0 - TypeScript types
- `eslint` ^8.0.0 - Code linting

## Configuration

**Environment:**
- `MEMORY_NEXUS_DB` - Override default database path
- Default database: `~/.memory-nexus/memory.db`

**Build:**
- `package.json` - Package manifest
- `config/memory-nexus.json` - Runtime configuration

## Platform Requirements

**Development:**
- Node.js LTS
- bun package manager
- SQLite with FTS5 support (included in better-sqlite3)

**Production:**
- Local CLI tool (no server deployment)
- Runs on user's machine
- Cross-platform: Windows (via WSL), macOS, Linux

## Source Data

**Input Format:**
- JSONL (JSON Lines) - Newline-delimited JSON
- Location: `~/.claude/projects/<encoded-dir>/*.jsonl`

**Output Format:**
- SQLite database with FTS5 virtual tables
- CLI text output (markdown, plain, JSON options)

---

*Stack analysis: 2026-01-27*
