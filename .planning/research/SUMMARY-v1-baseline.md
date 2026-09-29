# Research Summary: memory-nexus

**Date:** 2026-01-27
**Status:** Complete - Ready for Roadmap

## Executive Summary

memory-nexus is a CLI tool that solves Claude Code's session isolation problem by extracting JSONL session files into a unified, searchable SQLite database. The research reveals three critical insights:

1. **Stack clarity emerged**: Bun's built-in SQLite driver (bun:sqlite) is the correct choice, NOT better-sqlite3 which has ABI compatibility issues with Bun. FTS5 full-text search is enabled on Linux, with macOS requiring a workaround.

2. **Architecture is well-defined**: The existing project documentation already specified hexagonal architecture with clear component boundaries. The build order is dependency-driven: Domain layer (pure business logic) → Infrastructure (adapters) → Application (use cases) → Presentation (CLI).

3. **Critical pitfalls identified early**: Five critical issues could sink the project if not handled from day one - memory exhaustion on large files, incorrect FTS5 query syntax, incremental sync state corruption, Claude Code format evolution, and WAL mode checkpoint starvation.

The recommended approach is a phased build starting with streaming JSONL extraction to SQLite, then adding FTS5 search, followed by CLI commands, and finally hook-based automation. The key risk is underestimating streaming parser complexity - this must be implemented correctly in Phase 1 or large session files will crash the tool.

## Key Findings

### From STACK.md

**Core Technologies:**

- **Bun 1.2.x+** - JavaScript/TypeScript runtime with native SQLite support (3-6x faster than better-sqlite3)
- **bun:sqlite** - Built-in SQLite driver with FTS5 enabled on Linux; macOS needs custom SQLite lib
- **Commander.js ^14.0.0 + @commander-js/extra-typings** - CLI framework with strong TypeScript inference
- **Zod ^4.3.5** - Schema validation with 14x faster string parsing (v4)
- **Native Bun streaming** - Use readline.createInterface for JSONL line-by-line processing

**Critical Version Requirements:**

- TypeScript 5.0+ (required by Zod v4 and Commander extra-typings)
- Bun v0.6.12+ on Linux (FTS5 enabled in that release)
- Commander.js and extra-typings must match major.minor versions

**What NOT to use:**

- better-sqlite3 (ABI incompatibility with Bun)
- stream-json (overkill for JSONL - native readline sufficient)
- ORMs like Drizzle/Kysely (FTS5 virtual tables don't work well with ORMs)
- npm (WoW standard requires bun)

### From FEATURES.md

**Must-Have Features (Table Stakes):**

- Full-text search with relevance ranking (FTS5 BM25)
- Result snippets with surrounding context
- Manual sync command with progress indicator
- Incremental sync (only process new/changed content)
- Project filter (`--project <name>`)
- Time range filters (`--since`, `--before`, `--days`)
- Human-readable output with JSON flag (`--json`)
- Stats command (database overview)

**Differentiators (Unique Value):**

- Cross-project context unification (single database for all projects)
- AI-first design (output optimized for Claude to consume via Bash tool)
- Tool use tracking (query "what files did Claude edit?")
- File modification history per session
- Automatic hook-based sync (SessionStop trigger)
- Permanent archive (no 30-day deletion like Claude Code)

**Anti-Features (Deliberately Avoid):**

- Vector/semantic search in MVP (adds complexity; FTS5 covers 80% of use cases)
- Real-time streaming (sessions are batch files)
- Machine learning anomaly detection (irrelevant for session search)
- Dashboards/visualization (CLI tool, not web app)
- Cloud sync/backup (local-first; iCloud/git handles backup)
- Session editing/annotation (read-only extraction)
- MCP server in MVP (CLI simpler; can add later)

### From ARCHITECTURE.md

**Hexagonal Layer Structure:**

1. **Domain Layer** (`src/domain/`) - Pure business logic
   - Entities: Session, Message, ToolUse, Link, Topic, ExtractionState
   - Value Objects: ProjectPath, SessionId, Timestamp, SearchQuery, SearchResult
   - Ports (interfaces): ISessionRepository, IMessageRepository, ISearchService, ISessionSource, IEventParser
   - Domain Services: PathDecoder, ContentExtractor, QueryParser
   - ZERO external dependencies

2. **Infrastructure Layer** (`src/infrastructure/`) - Adapters
   - Database: SqliteSessionRepository, SqliteMessageRepository, Fts5SearchService
   - Filesystem: FileSystemSessionSource, JsonlEventParser
   - Hook integration: ClaudeCodeHookHandler

3. **Application Layer** (`src/application/`) - Use cases
   - Commands: SyncAllSessionsCommand, SyncSessionCommand, ForceSyncCommand
   - Queries: SearchMessagesQuery, GetSessionContextQuery, FindRelatedQuery, GetStatsQuery
   - Orchestration: ExtractionOrchestrator, IncrementalSyncService

4. **Presentation Layer** (`src/presentation/`) - CLI
   - Command handlers: SyncCommandHandler, SearchCommandHandler, ContextCommandHandler
   - Output formatters: SearchResultFormatter, StatsFormatter, ProgressReporter

**Critical Patterns:**

- Streaming JSONL parser (never load entire file)
- Batch database writes (buffer inserts, commit in batches)
- Transaction-based incremental state (only update after commit)
- FTS5 query builder (enforce MATCH operator, never =)

### From PITFALLS.md

**Top 5 Critical Pitfalls:**

1. **Memory exhaustion on large JSONL files** - Session files can exceed 10,000 lines; using readFileSync crashes. Must use streaming parser (readline + createReadStream) from day one.

2. **FTS5 using = instead of MATCH** - Using = operator causes full table scan instead of FTS5 index. Query times degrade from milliseconds to seconds as data grows. Always use MATCH operator.

3. **Incremental sync state corruption** - If extraction crashes mid-file, partial state causes JSON parse errors on resume. Must use transactions and only update state after commit succeeds.

4. **Claude Code format version drift** - JSONL structure may change in Claude Code updates without notice. Must extract version field, implement adapter pattern, store raw events for reprocessing.

5. **WAL mode checkpoint starvation** - If CLI keeps database open during writes, WAL file grows unboundedly. Must close connections between operations and manually checkpoint after bulk operations.

**Common Mistakes:**

- FTS5 triggers fail with RETURNING clause (better-sqlite3 issue)
- Forgetting to run ANALYZE after data load (query planner makes poor decisions)
- Blocking transactions during slow file I/O (causes database locks)
- Silent data loss from malformed JSONL (must log errors with line numbers)
- Path encoding assumptions (treat encoded names as opaque identifiers)

## Implications for Roadmap

### Suggested Phase Structure

The research strongly supports a 4-phase build:

**Phase 1: Core Extraction (Build First)**
- **Rationale:** Domain layer has zero dependencies and establishes contracts for all other layers. Must get streaming parser and incremental sync right from the start.
- **Delivers:** JSONL session files extracted to SQLite with FTS5 index
- **Features from FEATURES.md:** Manual sync command, incremental sync, progress indicator
- **Pitfalls to avoid:** Memory exhaustion (#1), incremental sync corruption (#3)
- **Duration estimate:** 4-5 days
- **Critical success factor:** Streaming parser handles 10,000+ line files without memory spike

**Phase 2: Search Interface (Build Second)**
- **Rationale:** Implements the primary query use case. Infrastructure adapters enable real data flow.
- **Delivers:** Full-text search with filters and result formatting
- **Features from FEATURES.md:** Search command, project filter, time filters, result snippets, JSON output
- **Pitfalls to avoid:** FTS5 = vs MATCH (#2), forgetting to run ANALYZE
- **Duration estimate:** 3-4 days
- **Critical success factor:** Query performance remains fast as database grows

**Phase 3: CLI Integration (Build Third)**
- **Rationale:** Application layer orchestrates domain + infrastructure. Presentation layer provides user interface.
- **Delivers:** Full CLI command suite integrated with aidev
- **Features from FEATURES.md:** Context command, stats command, list sessions, session detail
- **Pitfalls to avoid:** Database lock contention, WAL checkpoint issues (#5)
- **Duration estimate:** 2-3 days
- **Critical success factor:** Concurrent operations don't deadlock

**Phase 4: Automation & Polish (Build Last)**
- **Rationale:** Hook integration depends on all other phases working. Format evolution handling is ongoing maintenance.
- **Delivers:** Zero-friction automatic sync, version-aware parsing
- **Features from FEATURES.md:** Hook-based sync, quiet mode, format version handling
- **Pitfalls to avoid:** Claude Code format drift (#4), concurrent sync conflicts
- **Duration estimate:** 2-3 days
- **Critical success factor:** Hook runs non-blocking and handles failures gracefully

### Research Flags

**Needs deep research during planning:**

- **Phase 1:** JSONL event structure reverse-engineering (no official docs)
  - What event types exist in practice?
  - How is session metadata encoded?
  - What fields contain extractable content?
  - Use `/gsd:research-phase` when starting Phase 1 implementation

- **Phase 4:** Claude Code hook integration mechanism
  - SessionStop hook parameter format
  - How to identify which session just ended
  - Error handling in hook context
  - Use `/gsd:research-phase` when starting Phase 4 implementation

**Standard patterns (skip research):**

- **Phase 2:** FTS5 query syntax (well-documented in SQLite docs)
- **Phase 3:** Commander.js CLI patterns (standard library)
- Database schema design (existing docs already specify)

### Dependency Chain

The research confirms a clear dependency direction:

```
Phase 1 (Core Extraction)
  |
  +---> Domain entities and ports
  |      |
  |      +---> Infrastructure adapters (Database, Filesystem)
  |             |
  |             +---> Phase 2 (Search Interface)
  |                   |
  |                   +---> FTS5 query builder
  |                         |
  |                         +---> Phase 3 (CLI Integration)
  |                               |
  |                               +---> Application use cases
  |                                     |
  |                                     +---> Presentation handlers
  |                                           |
  |                                           +---> Phase 4 (Automation)
  |                                                 |
  |                                                 +---> Hook integration
```

No circular dependencies identified. Clean layer boundaries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | Verified against official Bun docs, npm registry, GitHub discussions. bun:sqlite FTS5 support confirmed for Linux. |
| **Features** | MEDIUM | Based on industry patterns (ripgrep, fzf, log management tools) and existing project vision docs. Table stakes are solid; differentiators need validation during implementation. |
| **Architecture** | HIGH | Existing project docs already specified hexagonal architecture. Component boundaries are clear and follow dependency rules. Build order is unambiguous. |
| **Pitfalls** | HIGH | Critical pitfalls verified against SQLite docs, better-sqlite3 GitHub issues, ETL best practices. Phase-specific warnings mapped to implementation plan. |

### Overall Confidence: HIGH

The research has high confidence because:

1. Stack choices are verified against official documentation
2. Architecture is pre-defined in existing project docs
3. Critical pitfalls are drawn from real-world issues (GitHub issues, SQLite forums)
4. Feature set aligns with well-established CLI tool patterns

### Gaps to Address

1. **macOS FTS5 workaround details** - Exact libsqlite3.dylib path for current Homebrew installations needs testing on macOS system
2. **Windows FTS5 support** - Assumed based on Bun's SQLite build; needs verification on Windows system
3. **JSONL event types** - No official Claude Code docs; will need reverse-engineering during Phase 1
4. **Database location** - Decision needed: `~/.config/memory-nexus/` (XDG standard) vs `~/.memory-nexus/` (simpler)
5. **aidev integration mechanism** - Decision needed: shell function, compiled binary, or npm package

**These gaps are NOT blockers** - they can be resolved during implementation without significant rework. The core architecture and critical pitfalls are well-understood.

## Roadmap Recommendations

Based on combined research, recommend the following for roadmap creation:

### MVP Scope (Phases 1-3)

Include:
- JSONL extraction to SQLite (streaming parser)
- FTS5 full-text search with filters
- Manual sync command
- Search, list, stats, context commands
- JSON output flag
- Incremental sync
- Human-readable default output

Defer to v2:
- Related sessions (links table)
- Interactive fuzzy finder
- Export formats (markdown, HTML)
- Vector/semantic search
- MCP server integration

### Success Criteria for MVP

1. Can sync all sessions from `~/.claude/projects/` to SQLite
2. Can search across all sessions with full-text search
3. Can retrieve context for a specific project
4. Streaming parser handles 10,000+ line files without memory spike
5. Query performance remains fast (< 100ms) with 1000+ sessions
6. Incremental sync correctly resumes after interruption
7. Integration with aidev CLI works seamlessly

### Risk Mitigation Strategy

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory exhaustion on large files | HIGH | HIGH | Use streaming parser from day one; test with real 10K+ line files |
| FTS5 performance degradation | MEDIUM | HIGH | Use MATCH (not =); run ANALYZE after data load; test with 1000+ sessions |
| Incremental sync corruption | MEDIUM | HIGH | Transaction-based state; test interrupted sync recovery |
| Claude Code format changes | LOW | MEDIUM | Version-aware parsing; store raw events; monitor release notes |
| macOS FTS5 not working | LOW | MEDIUM | Document Homebrew workaround; test on macOS early |

### Implementation Approach

Use GSD-Lite methodology:

1. **DISCUSS Phase:** Clarify JSONL structure in Phase 1; defer format details until implementation
2. **PLAN Phase:** Create atomic task plans for each component; identify test scenarios
3. **EXECUTE Phase:** Build in order (Domain → Infrastructure → Application → Presentation)
4. **VERIFY Phase:** Test critical pitfall scenarios (large files, concurrent access, interrupted sync)

### Recommended First Actions

When roadmap is approved:

1. Create Phase 1 task plan (Domain entities + streaming parser + database schema)
2. Set up project structure with hexagonal architecture folders
3. Configure bun project with TypeScript 5.5, Commander 14, Zod 4.3.5
4. Write streaming parser with 10,000+ line test case
5. Implement transaction-based incremental sync with interruption test

## Sources (Aggregated)

**Official Documentation:**
- [Bun SQLite Documentation](https://bun.sh/docs/api/sqlite)
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html)
- [SQLite WAL Mode](https://sqlite.org/wal.html)
- [Commander.js npm package](https://www.npmjs.com/package/commander)
- [@commander-js/extra-typings](https://www.npmjs.com/package/@commander-js/extra-typings)

**Technical Resources:**
- [Bun v0.6.12 Release Notes - FTS5 enabled](https://github.com/oven-sh/bun/discussions/3468)
- [better-sqlite3 Bun compatibility discussion](https://github.com/oven-sh/bun/discussions/16049)
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [better-sqlite3 issue #654 - FTS5 triggers with RETURNING](https://github.com/WiseLibs/better-sqlite3/issues/654)
- [stream-json GitHub](https://github.com/uhop/stream-json)
- [jsonrepair GitHub](https://github.com/josdejong/jsonrepair)

**Industry Patterns:**
- [Parsing 1 Billion Rows in Bun](https://www.taekim.dev/writing/parsing-1b-rows-in-bun)
- [Building CLI apps with TypeScript in 2026](https://dev.to/hongminhee/building-cli-apps-with-typescript-in-2026-5c9d)
- [ripgrep GitHub](https://github.com/BurntSushi/ripgrep)
- [Feature Comparison: ack, ag, git-grep, grep, ripgrep](https://beyondgrep.com/feature-comparison/)
- [Heroku CLI Style Guide](https://devcenter.heroku.com/articles/cli-style-guide)
- [CLI UX Patterns](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html)
- [Command Line Interface Guidelines](https://clig.dev/)

**ETL and Data Engineering:**
- [Airbyte Incremental Loading](https://airbyte.com/data-engineering-resources/etl-incremental-loading)
- [Idempotency in Data Pipelines](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [Data Pipeline Architecture: 5 Design Patterns](https://dagster.io/guides/data-pipeline-architecture-5-design-patterns-with-examples)
- [ETL Architecture and Design Patterns](https://www.matillion.com/blog/etl-architecture-design-patterns-modern-data-pipelines)

**Architecture Patterns:**
- [Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Hexagonal vs Clean vs Onion: which one survives in 2026](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f)
- [Event Versioning Patterns](https://event-driven.io/en/how_to_do_event_versioning/)

**SQLite Performance:**
- [SQLite Forum - FTS5 tables, = vs MATCH](https://sqlite.org/forum/forumpost/3f540bb224)
- [SQLite Forum - Performance Analysis](https://sqlite.org/forum/info/47429810bd2232ebe0c1096c4910b43f6313b9d92bca6eab8496d59d3f585e4c)
- [SQLite Concurrent Writes](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)

**Log Management and Search:**
- [Better Stack Log Monitoring Tools](https://betterstack.com/community/comparisons/log-monitoring-tools/)
- [Gemini CLI Session Management](https://developers.googleblog.com/pick-up-exactly-where-you-left-off-with-session-management-in-gemini-cli/)
- [Claude Code Session Workflows](https://code.claude.com/docs/en/common-workflows)

**Project Documentation:**
- `docs/04-ARCHITECTURE.md` - Existing system architecture
- `docs/05-IMPLEMENTATION.md` - Implementation plan with code examples
- `.planning/codebase/ARCHITECTURE.md` - Codebase analysis
- `~/.claude/rules-archive/hexagonal-architecture.md` - Hexagonal architecture requirements

**Other:**
- [Zod v4 release](https://www.infoq.com/news/2025/08/zod-v4-available/)
- [Processing big files in Node.js](https://czyzykowski.com/posts/big-files-in-node.html)
- [bricoleur blog on Claude sessions](http://www.bricoleur.org/2025/05/understanding-claude-code-sessions.html?m=1)

---

**Research Complete:** 2026-01-27
**Ready for:** Roadmap creation
**Next Step:** Define phase requirements and task breakdown
