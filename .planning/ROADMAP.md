# Roadmap: memory-nexus

## Overview

Cross-project context persistence for Claude Code sessions. The roadmap follows hexagonal architecture build order: Domain first, then Ports, then Infrastructure adapters, then Application use cases, then Presentation CLI. Each phase delivers a coherent, verifiable capability that builds toward the full vision of searchable, unified session memory.

**Depth:** Comprehensive (12 phases)
**Total Requirements:** 85 v1 requirements
**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project.

---

## Phases

### Phase 1: Project Setup and Domain Entities

**Goal:** Establish project foundation and pure domain layer with zero external dependencies.

**Dependencies:** None (foundation phase)

**Requirements:**
- SETUP-01: Project scaffolding with Bun, TypeScript 5.5+, hexagonal architecture folder structure
- SETUP-04: CLI entry point with Commander.js v14 and extra-typings
- DOM-01: Session entity with ID, project path, timestamps, message counts
- DOM-02: Message entity with role, content, timestamp, session reference
- DOM-03: ToolUse entity with name, inputs, outputs, session reference
- DOM-04: Link entity with source, target, relationship type, weight
- DOM-05: ExtractionState entity for incremental sync tracking
- DOM-06: ProjectPath value object with encoding/decoding
- DOM-07: SearchQuery value object with query, filters, options
- DOM-08: SearchResult value object with ranking, snippets, highlights
- DOM-10: PathDecoder domain service for encoded directory path decoding
- DOM-11: ContentExtractor domain service for text extraction from events
- DOM-12: QueryParser domain service for search query parsing

**Success Criteria:**
1. User can run `bun test` and all domain entity unit tests pass
2. Domain layer has zero imports from external packages (pure TypeScript only)
3. All value objects are immutable and validate on construction
4. PathDecoder correctly handles encoded directory names from ~/.claude/projects/
5. Project structure matches hexagonal architecture: src/domain/, src/application/, src/infrastructure/, src/presentation/

---

### Phase 2: Database Schema and Ports

**Goal:** Define port interfaces and implement database schema with FTS5 full-text search capability.

**Dependencies:** Phase 1 (domain entities must exist)

**Requirements:**
- SETUP-02: Configure bun:sqlite with FTS5, WAL mode, and proper pragmas
- SETUP-03: Database schema with sessions, messages_fts, messages_meta, tool_uses, links, topics, extraction_state tables
- DOM-09: Port interfaces: ISessionRepository, IMessageRepository, ISearchService, ISessionSource, IEventParser

**Success Criteria:**
1. User can run schema creation and database file is created at expected location
2. FTS5 virtual table is created and accepts MATCH queries
3. WAL mode is enabled and verified with PRAGMA journal_mode
4. All port interfaces are defined with complete type signatures
5. Schema supports incremental sync via extraction_state table

**Plans:** 4 plans

Plans:
- [x] 02-01-PLAN.md - Define port interfaces for hexagonal architecture
- [x] 02-02-PLAN.md - Define SQLite schema with FTS5 full-text search
- [x] 02-03-PLAN.md - Database initialization with WAL mode and pragmas
- [x] 02-04-PLAN.md - Integration tests for FTS5 search verification

---

### Phase 3: JSONL Parsing and Extraction

**Goal:** Implement streaming JSONL parser that handles large session files without memory exhaustion.

**Dependencies:** Phase 1 (domain entities for parsed output)

**Requirements:**
- PARSE-01: Streaming JSONL parser using readline.createInterface (never load entire file)
- PARSE-02: Event classification by type: system, user, assistant, file-history-snapshot, summary
- PARSE-03: Message extraction from user and assistant events
- PARSE-04: Tool use extraction from assistant events
- PARSE-05: Thinking block extraction from assistant events
- PARSE-06: Summary extraction from summary events
- PARSE-07: Timestamp normalization to ISO 8601
- PARSE-08: Graceful handling of malformed JSON lines (skip and log with line number)
- PARSE-09: Session discovery: locate all JSONL files in ~/.claude/projects/
- PARSE-10: Encoded path decoding (or treat as opaque identifier)

**Success Criteria:**
1. User can parse a 10,000+ line session file without memory spike (verified via process.memoryUsage())
2. Parser correctly yields all event types with proper classification
3. Malformed JSON lines are logged with line numbers but do not crash parser
4. Session discovery finds all JSONL files across all project directories
5. Timestamps are normalized to ISO 8601 format regardless of source format

---

### Phase 4: Storage Adapters (bun:sqlite + FTS5)

**Goal:** Implement infrastructure adapters that persist domain entities to SQLite with full-text search indexing.

**Dependencies:** Phase 2 (schema), Phase 3 (parsed events to store)

**Requirements:**
- STOR-01: SqliteSessionRepository implementing ISessionRepository
- STOR-02: SqliteMessageRepository implementing IMessageRepository with FTS5
- STOR-03: Fts5SearchService implementing ISearchService with BM25 ranking
- STOR-04: FileSystemSessionSource implementing ISessionSource
- STOR-05: JsonlEventParser implementing IEventParser
- STOR-06: Batch database writes with configurable batch size
- STOR-07: Transaction-based extraction state updates (only update after commit)
- STOR-08: WAL checkpoint after bulk operations

**Success Criteria:**
1. User can insert 1000 messages in under 5 seconds via batch writes
2. FTS5 queries use MATCH operator (verified via EXPLAIN QUERY PLAN showing ":M1")
3. Interrupted extraction does not corrupt incremental state (transaction safety test)
4. WAL checkpoint reduces WAL file size after bulk operations
5. All repository implementations pass port interface contracts

**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md - SqliteSessionRepository and SqliteExtractionStateRepository
- [x] 04-02-PLAN.md - SqliteMessageRepository with batch writes and FTS5 integration
- [x] 04-03-PLAN.md - SqliteToolUseRepository
- [x] 04-04-PLAN.md - Fts5SearchService with BM25 and integration tests

---

### Phase 5: Basic Sync Command

**Goal:** Implement the sync command that extracts sessions from filesystem to database.

**Dependencies:** Phase 4 (storage adapters must work)

**Requirements:**
- SYNC-01: Manual sync command: aidev memory sync
- SYNC-02: Incremental sync: only process new/changed content based on mtime and size
- SYNC-03: Sync progress indicator during extraction
- SYNC-04: Force re-sync option: --force to rebuild from scratch
- SYNC-05: Project-specific sync option: --project <name>
- SYNC-06: Session-specific sync option: --session <id>
- SYNC-07: Quiet mode for hooks: --quiet
- SYNC-08: Verbose mode for debugging: --verbose

**Success Criteria:**
1. User can run `aidev memory sync` and all sessions are extracted to database
2. Running sync twice skips unchanged sessions (incremental behavior verified)
3. Progress indicator shows extraction progress during sync
4. `--force` option re-extracts all sessions regardless of state
5. `--project` option syncs only sessions from specified project

**Plans:** 4 plans

Plans:
- [x] 05-01-PLAN.md - ExtractionState file metadata extension (fileMtime, fileSize)
- [x] 05-02-PLAN.md - SyncService application layer with incremental sync detection
- [x] 05-03-PLAN.md - CLI sync command with progress reporting
- [x] 05-04-PLAN.md - Integration tests and final verification

---

### Phase 6: Search Command with FTS5

**Goal:** Implement full-text search across all sessions with relevance ranking.

**Dependencies:** Phase 5 (data must exist in database)

**Requirements:**
- SRCH-01: Full-text search: aidev memory search <query>
- SRCH-02: FTS5 MATCH operator (never = operator) for full-text queries
- SRCH-03: BM25 relevance ranking for results
- SRCH-04: Result snippets with surrounding context
- SRCH-05: Result limiting: --limit N (default 10)
- SRCH-06: Case sensitivity control: --ignore-case / --case-sensitive

**Success Criteria:**
1. User can search for "authentication" and find matching messages across all projects
2. Results are ranked by relevance (BM25) with most relevant first
3. Each result shows snippet with matched text highlighted (context visible)
4. `--limit 5` returns exactly 5 results
5. Query performance remains under 100ms with 1000+ sessions in database

**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md - Search command implementation with result formatting
- [x] 06-02-PLAN.md - Case sensitivity control and integration tests

---

### Phase 7: Filtering and Output Formatting

**Goal:** Add filtering options and standardize output formatting across all commands.

**Dependencies:** Phase 6 (search command to add filters to)

**Requirements:**
- SRCH-07: Project filter: --project <name>
- SRCH-08: Time range filters: --since, --before, --days
- SRCH-09: Role filter: --role user/assistant/all
- OUT-01: Human-readable default output with clear structure
- OUT-02: JSON output flag: --json for programmatic consumption
- OUT-03: Quiet mode: --quiet for suppressed output
- OUT-04: Verbose mode: --verbose for detailed progress/debugging
- OUT-05: Consistent structure across all commands
- OUT-06: Context-sized results (fits within Claude's context window)

**Success Criteria:**
1. User can search with `--project wow-system` and only see results from that project
2. User can search with `--days 7` and only see results from last 7 days
3. User can search with `--role assistant` and only see Claude's responses
4. `--json` flag outputs valid JSON that can be piped to jq
5. Output formatting is consistent: all commands use same structure

**Plans:** 4 plans

Plans:
- [x] 07-01-PLAN.md - Date parser and timestamp formatter
- [x] 07-02-PLAN.md - Search filter options
- [x] 07-03-PLAN.md - Output formatter and color utilities
- [x] 07-04-PLAN.md - Apply formatting to search and sync commands

---

### Phase 8: Stats and List Commands

**Goal:** Implement statistics overview and session listing for discovery.

**Dependencies:** Phase 5 (data must exist in database)

**Requirements:**
- STAT-01: Stats command: aidev memory stats
- STAT-02: Total counts: sessions, messages, tool uses
- STAT-03: Per-project breakdown
- STAT-04: Database size information
- NAV-01: List sessions: aidev memory list
- NAV-03: Session filtering by project
- NAV-04: Session filtering by date range

**Success Criteria:**
1. User can run `aidev memory stats` and see session/message counts
2. Stats show per-project breakdown (e.g., "wow-system: 15 sessions, 2340 messages")
3. User can run `aidev memory list` and see recent sessions
4. `--project` filter limits listed sessions to specific project
5. `--days` filter limits listed sessions to recent time window

**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md - Stats service and command with per-project breakdown
- [x] 08-02-PLAN.md - List command with project and date filtering

---

### Phase 9: Context and Related Commands

**Goal:** Implement cross-project context retrieval and relationship-based navigation.

**Dependencies:** Phase 6 (search), Phase 4 (link repository)

**Requirements:**
- CTX-01: Context command: aidev memory context <project>
- CTX-02: Aggregate project context from recent sessions
- CTX-03: Days filter: --days N to limit recency
- CTX-04: Format option: --format brief/detailed
- REL-01: Related command: aidev memory related <id>
- REL-02: Find sessions sharing common topics/entities
- REL-03: SqliteLinkRepository implementing ILinkRepository
- REL-04: Direct and indirect (2-hop) relationship queries
- REL-05: Weight-based relationship ranking

**Success Criteria:**
1. User can run `aidev memory context wow-system` and see aggregated context
2. Context command shows decisions, patterns, and key topics from recent sessions
3. User can run `aidev memory related session-123` and see related sessions
4. Related sessions are ranked by relationship strength (weight)
5. 2-hop relationships surface sessions sharing common topics

---

### Phase 10: Hook Integration and Incremental Sync

**Goal:** Implement automatic sync via Claude Code hooks for zero-friction operation.

**Dependencies:** Phase 5 (sync command must work)

**Requirements:**
- HOOK-01: Claude Code SessionStop hook triggers automatic sync
- HOOK-02: Session-specific sync (only sync the ended session)
- HOOK-03: Background/non-blocking execution
- HOOK-04: Graceful failure handling (don't block user)
- HOOK-05: Hook configuration documentation

**Success Criteria:**
1. After Claude Code session ends, hook automatically syncs that session
2. Hook runs in background and does not block terminal
3. Hook failures are logged but do not display error to user
4. Documentation explains how to configure hook in Claude Code settings
5. User can disable hook without breaking manual sync

---

### Phase 11: Session Navigation (Show, Search)

**Goal:** Implement detailed session viewing and in-list search capabilities.

**Dependencies:** Phase 8 (list command)

**Requirements:**
- NAV-02: Session detail: aidev memory show <session-id>
- NAV-05: Session search within list picker
- EXTR-01: Tool use tracking: query "what tools did Claude use?"
- EXTR-02: File modification tracking from tool uses
- EXTR-03: Topic/entity extraction from content
- EXTR-04: Session summary extraction and indexing

**Success Criteria:**
1. User can run `aidev memory show session-123` and see full session content
2. Show command displays messages, tool uses, and file modifications
3. User can query tool uses: "what files were edited in this session?"
4. Topic extraction identifies key concepts discussed in sessions
5. Session summaries are indexed and searchable

---

### Phase 12: Polish, Error Handling, Edge Cases

**Goal:** Harden the tool for production use with comprehensive error handling and test coverage.

**Dependencies:** All previous phases

**Requirements:**
- ERR-01: Graceful degradation on malformed files
- ERR-02: Clear error messages with file paths and line numbers
- ERR-03: Exit codes: 0 success, 1 user error, 2+ internal error
- ERR-04: Signal handling (Ctrl+C) with proper cleanup
- ERR-05: Database connection error handling
- QUAL-01: 95%+ test coverage at EACH metric (statements, branches, functions, lines)
- QUAL-02: Unit tests for all domain entities and services
- QUAL-03: Integration tests for streaming parser with 10,000+ line files
- QUAL-04: Integration tests for interrupted sync recovery
- QUAL-05: Integration tests for concurrent CLI commands

**Success Criteria:**
1. Ctrl+C during sync properly closes database connection
2. Malformed session files are skipped with clear error message
3. All exit codes follow convention (0=success, 1=user error, 2+=internal)
4. Test coverage meets 95% at EACH metric (not just overall)
5. Concurrent sync and search commands do not deadlock

---

## Progress

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Project Setup and Domain Entities | Complete | 100% |
| 2 | Database Schema and Ports | Complete | 100% |
| 3 | JSONL Parsing and Extraction | Complete | 100% |
| 4 | Storage Adapters | Complete | 100% |
| 5 | Basic Sync Command | Complete | 100% |
| 6 | Search Command with FTS5 | Complete | 100% |
| 7 | Filtering and Output Formatting | Complete | 100% |
| 8 | Stats and List Commands | Complete | 100% |
| 9 | Context and Related Commands | Not Started | 0% |
| 10 | Hook Integration | Not Started | 0% |
| 11 | Session Navigation | Not Started | 0% |
| 12 | Polish and Error Handling | Not Started | 0% |

---

## Dependency Graph

```
Phase 1 (Domain Entities)
    |
    +---> Phase 2 (Schema + Ports)
    |         |
    +---> Phase 3 (JSONL Parsing)
              |
              +---> Phase 4 (Storage Adapters)
                        |
                        +---> Phase 5 (Sync Command)
                              |
                              +---> Phase 6 (Search Command)
                              |         |
                              |         +---> Phase 7 (Filtering + Output)
                              |
                              +---> Phase 8 (Stats + List)
                              |         |
                              |         +---> Phase 11 (Session Navigation)
                              |
                              +---> Phase 9 (Context + Related)
                              |
                              +---> Phase 10 (Hook Integration)
                                        |
                                        +---> Phase 12 (Polish)
```

---

## Risk Mitigation

| Risk | Phase | Mitigation |
|------|-------|------------|
| Memory exhaustion on large JSONL files | Phase 3 | Use streaming parser from day one; test with 10K+ line files |
| FTS5 performance degradation | Phase 6 | Use MATCH (not =); run ANALYZE after data load |
| Incremental sync corruption | Phase 4 | Transaction-based state; test interrupted sync recovery |
| Claude Code format changes | Phase 3 | Version-aware parsing; store raw events for reprocessing |
| WAL checkpoint starvation | Phase 4 | Checkpoint after bulk operations; close connections between operations |

---

## Research Flags

**Needs deep research during planning:**
- Phase 3: JSONL event structure reverse-engineering (no official Claude Code docs)
- Phase 10: Claude Code hook integration mechanism (SessionStop parameters)

**Standard patterns (skip research):**
- Phase 6: FTS5 query syntax (well-documented in SQLite docs)
- Phase 5: Commander.js CLI patterns (standard library)

---

*Last updated: 2026-01-30 (Phase 8 complete)*
