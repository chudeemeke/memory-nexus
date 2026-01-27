# Requirements: memory-nexus

## v1 Requirements

### Setup (SETUP)

| ID | Requirement | Priority |
|----|-------------|----------|
| SETUP-01 | Project scaffolding with Bun, TypeScript 5.5+, hexagonal architecture folder structure | Required |
| SETUP-02 | Configure bun:sqlite with FTS5, WAL mode, and proper pragmas | Required |
| SETUP-03 | Database schema with sessions, messages_fts, messages_meta, tool_uses, links, topics, extraction_state tables | Required |
| SETUP-04 | CLI entry point with Commander.js v14 and extra-typings | Required |

### Domain Layer (DOM)

| ID | Requirement | Priority |
|----|-------------|----------|
| DOM-01 | Session entity with ID, project path, timestamps, message counts | Required |
| DOM-02 | Message entity with role, content, timestamp, session reference | Required |
| DOM-03 | ToolUse entity with name, inputs, outputs, session reference | Required |
| DOM-04 | Link entity with source, target, relationship type, weight | Required |
| DOM-05 | ExtractionState entity for incremental sync tracking | Required |
| DOM-06 | ProjectPath value object with encoding/decoding | Required |
| DOM-07 | SearchQuery value object with query, filters, options | Required |
| DOM-08 | SearchResult value object with ranking, snippets, highlights | Required |
| DOM-09 | Port interfaces: ISessionRepository, IMessageRepository, ISearchService, ISessionSource, IEventParser | Required |
| DOM-10 | PathDecoder domain service for encoded directory path decoding | Required |
| DOM-11 | ContentExtractor domain service for text extraction from events | Required |
| DOM-12 | QueryParser domain service for search query parsing | Required |

### JSONL Parsing (PARSE)

| ID | Requirement | Priority |
|----|-------------|----------|
| PARSE-01 | Streaming JSONL parser using readline.createInterface (never load entire file) | Required |
| PARSE-02 | Event classification by type: system, user, assistant, file-history-snapshot, summary | Required |
| PARSE-03 | Message extraction from user and assistant events | Required |
| PARSE-04 | Tool use extraction from assistant events | Required |
| PARSE-05 | Thinking block extraction from assistant events | Required |
| PARSE-06 | Summary extraction from summary events | Required |
| PARSE-07 | Timestamp normalization to ISO 8601 | Required |
| PARSE-08 | Graceful handling of malformed JSON lines (skip and log with line number) | Required |
| PARSE-09 | Session discovery: locate all JSONL files in ~/.claude/projects/ | Required |
| PARSE-10 | Encoded path decoding (or treat as opaque identifier) | Required |

### Storage Adapters (STOR)

| ID | Requirement | Priority |
|----|-------------|----------|
| STOR-01 | SqliteSessionRepository implementing ISessionRepository | Required |
| STOR-02 | SqliteMessageRepository implementing IMessageRepository with FTS5 | Required |
| STOR-03 | Fts5SearchService implementing ISearchService with BM25 ranking | Required |
| STOR-04 | FileSystemSessionSource implementing ISessionSource | Required |
| STOR-05 | JsonlEventParser implementing IEventParser | Required |
| STOR-06 | Batch database writes with configurable batch size | Required |
| STOR-07 | Transaction-based extraction state updates (only update after commit) | Required |
| STOR-08 | WAL checkpoint after bulk operations | Required |

### Sync Command (SYNC)

| ID | Requirement | Priority |
|----|-------------|----------|
| SYNC-01 | Manual sync command: aidev memory sync | Required |
| SYNC-02 | Incremental sync: only process new/changed content based on mtime and size | Required |
| SYNC-03 | Sync progress indicator during extraction | Required |
| SYNC-04 | Force re-sync option: --force to rebuild from scratch | Required |
| SYNC-05 | Project-specific sync option: --project <name> | Required |
| SYNC-06 | Session-specific sync option: --session <id> | Required |
| SYNC-07 | Quiet mode for hooks: --quiet | Required |
| SYNC-08 | Verbose mode for debugging: --verbose | Required |

### Search Command (SRCH)

| ID | Requirement | Priority |
|----|-------------|----------|
| SRCH-01 | Full-text search: aidev memory search <query> | Required |
| SRCH-02 | FTS5 MATCH operator (never = operator) for full-text queries | Required |
| SRCH-03 | BM25 relevance ranking for results | Required |
| SRCH-04 | Result snippets with surrounding context | Required |
| SRCH-05 | Result limiting: --limit N (default 10) | Required |
| SRCH-06 | Case sensitivity control: --ignore-case / --case-sensitive | Required |
| SRCH-07 | Project filter: --project <name> | Required |
| SRCH-08 | Time range filters: --since, --before, --days | Required |
| SRCH-09 | Role filter: --role user/assistant/all | Required |

### Output Formatting (OUT)

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-01 | Human-readable default output with clear structure | Required |
| OUT-02 | JSON output flag: --json for programmatic consumption | Required |
| OUT-03 | Quiet mode: --quiet for suppressed output | Required |
| OUT-04 | Verbose mode: --verbose for detailed progress/debugging | Required |
| OUT-05 | Consistent structure across all commands | Required |
| OUT-06 | Context-sized results (fits within Claude's context window) | Required |

### Statistics Command (STAT)

| ID | Requirement | Priority |
|----|-------------|----------|
| STAT-01 | Stats command: aidev memory stats | Required |
| STAT-02 | Total counts: sessions, messages, tool uses | Required |
| STAT-03 | Per-project breakdown | Required |
| STAT-04 | Database size information | Required |

### Session Navigation (NAV)

| ID | Requirement | Priority |
|----|-------------|----------|
| NAV-01 | List sessions: aidev memory list | Required |
| NAV-02 | Session detail: aidev memory show <session-id> | Required |
| NAV-03 | Session filtering by project | Required |
| NAV-04 | Session filtering by date range | Required |
| NAV-05 | Session search within list picker | Required |

### Context Command (CTX)

| ID | Requirement | Priority |
|----|-------------|----------|
| CTX-01 | Context command: aidev memory context <project> | Required |
| CTX-02 | Aggregate project context from recent sessions | Required |
| CTX-03 | Days filter: --days N to limit recency | Required |
| CTX-04 | Format option: --format brief/detailed | Required |

### Related Command (REL)

| ID | Requirement | Priority |
|----|-------------|----------|
| REL-01 | Related command: aidev memory related <id> | Required |
| REL-02 | Find sessions sharing common topics/entities | Required |
| REL-03 | SqliteLinkRepository implementing ILinkRepository | Required |
| REL-04 | Direct and indirect (2-hop) relationship queries | Required |
| REL-05 | Weight-based relationship ranking | Required |

### Hook Integration (HOOK)

| ID | Requirement | Priority |
|----|-------------|----------|
| HOOK-01 | Claude Code SessionStop hook triggers automatic sync | Required |
| HOOK-02 | Session-specific sync (only sync the ended session) | Required |
| HOOK-03 | Background/non-blocking execution | Required |
| HOOK-04 | Graceful failure handling (don't block user) | Required |
| HOOK-05 | Hook configuration documentation | Required |

### Intelligent Extraction (EXTR)

| ID | Requirement | Priority |
|----|-------------|----------|
| EXTR-01 | Tool use tracking: query "what tools did Claude use?" | Required |
| EXTR-02 | File modification tracking from tool uses | Required |
| EXTR-03 | Topic/entity extraction from content | Required |
| EXTR-04 | Session summary extraction and indexing | Required |

### Error Handling (ERR)

| ID | Requirement | Priority |
|----|-------------|----------|
| ERR-01 | Graceful degradation on malformed files | Required |
| ERR-02 | Clear error messages with file paths and line numbers | Required |
| ERR-03 | Exit codes: 0 success, 1 user error, 2+ internal error | Required |
| ERR-04 | Signal handling (Ctrl+C) with proper cleanup | Required |
| ERR-05 | Database connection error handling | Required |

### Quality (QUAL)

| ID | Requirement | Priority |
|----|-------------|----------|
| QUAL-01 | 95%+ test coverage at EACH metric (statements, branches, functions, lines) | Required |
| QUAL-02 | Unit tests for all domain entities and services | Required |
| QUAL-03 | Integration tests for streaming parser with 10,000+ line files | Required |
| QUAL-04 | Integration tests for interrupted sync recovery | Required |
| QUAL-05 | Integration tests for concurrent CLI commands | Required |

---

## v2 (Deferred)

| ID | Requirement | Notes |
|----|-------------|-------|
| V2-01 | Vector/semantic search with embeddings | Phase 4 future |
| V2-02 | MCP server integration | After CLI validates |
| V2-03 | Interactive fuzzy finder (fzf-style) | Nice to have |
| V2-04 | Export formats (markdown, HTML) | Nice to have |
| V2-05 | Advanced query syntax (boolean operators) | Nice to have |

---

## Out of Scope

| Item | Rationale |
|------|-----------|
| Cloud sync | Local-only tool; iCloud/git handles backup |
| Multi-user support | Personal productivity tool |
| Web UI | CLI-only for v1 |
| Session editing | Read-only extraction |
| Real-time streaming | Sessions are batch files |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Pending |
| SETUP-02 | Phase 1 | Pending |
| SETUP-03 | Phase 2 | Pending |
| SETUP-04 | Phase 1 | Pending |
| DOM-01 | Phase 1 | Pending |
| DOM-02 | Phase 1 | Pending |
| DOM-03 | Phase 1 | Pending |
| DOM-04 | Phase 1 | Pending |
| DOM-05 | Phase 1 | Pending |
| DOM-06 | Phase 1 | Pending |
| DOM-07 | Phase 1 | Pending |
| DOM-08 | Phase 1 | Pending |
| DOM-09 | Phase 2 | Pending |
| DOM-10 | Phase 1 | Pending |
| DOM-11 | Phase 1 | Pending |
| DOM-12 | Phase 1 | Pending |
| PARSE-01 | Phase 3 | Pending |
| PARSE-02 | Phase 3 | Pending |
| PARSE-03 | Phase 3 | Pending |
| PARSE-04 | Phase 3 | Pending |
| PARSE-05 | Phase 3 | Pending |
| PARSE-06 | Phase 3 | Pending |
| PARSE-07 | Phase 3 | Pending |
| PARSE-08 | Phase 3 | Pending |
| PARSE-09 | Phase 3 | Pending |
| PARSE-10 | Phase 3 | Pending |
| STOR-01 | Phase 4 | Pending |
| STOR-02 | Phase 4 | Pending |
| STOR-03 | Phase 4 | Pending |
| STOR-04 | Phase 4 | Pending |
| STOR-05 | Phase 4 | Pending |
| STOR-06 | Phase 4 | Pending |
| STOR-07 | Phase 4 | Pending |
| STOR-08 | Phase 4 | Pending |
| SYNC-01 | Phase 5 | Pending |
| SYNC-02 | Phase 5 | Pending |
| SYNC-03 | Phase 5 | Pending |
| SYNC-04 | Phase 5 | Pending |
| SYNC-05 | Phase 5 | Pending |
| SYNC-06 | Phase 5 | Pending |
| SYNC-07 | Phase 5 | Pending |
| SYNC-08 | Phase 5 | Pending |
| SRCH-01 | Phase 6 | Pending |
| SRCH-02 | Phase 6 | Pending |
| SRCH-03 | Phase 6 | Pending |
| SRCH-04 | Phase 6 | Pending |
| SRCH-05 | Phase 6 | Pending |
| SRCH-06 | Phase 6 | Pending |
| SRCH-07 | Phase 7 | Pending |
| SRCH-08 | Phase 7 | Pending |
| SRCH-09 | Phase 7 | Pending |
| OUT-01 | Phase 7 | Pending |
| OUT-02 | Phase 7 | Pending |
| OUT-03 | Phase 7 | Pending |
| OUT-04 | Phase 7 | Pending |
| OUT-05 | Phase 7 | Pending |
| OUT-06 | Phase 7 | Pending |
| STAT-01 | Phase 8 | Pending |
| STAT-02 | Phase 8 | Pending |
| STAT-03 | Phase 8 | Pending |
| STAT-04 | Phase 8 | Pending |
| NAV-01 | Phase 8 | Pending |
| NAV-02 | Phase 11 | Pending |
| NAV-03 | Phase 8 | Pending |
| NAV-04 | Phase 8 | Pending |
| NAV-05 | Phase 11 | Pending |
| CTX-01 | Phase 9 | Pending |
| CTX-02 | Phase 9 | Pending |
| CTX-03 | Phase 9 | Pending |
| CTX-04 | Phase 9 | Pending |
| REL-01 | Phase 9 | Pending |
| REL-02 | Phase 9 | Pending |
| REL-03 | Phase 9 | Pending |
| REL-04 | Phase 9 | Pending |
| REL-05 | Phase 9 | Pending |
| HOOK-01 | Phase 10 | Pending |
| HOOK-02 | Phase 10 | Pending |
| HOOK-03 | Phase 10 | Pending |
| HOOK-04 | Phase 10 | Pending |
| HOOK-05 | Phase 10 | Pending |
| EXTR-01 | Phase 11 | Pending |
| EXTR-02 | Phase 11 | Pending |
| EXTR-03 | Phase 11 | Pending |
| EXTR-04 | Phase 11 | Pending |
| ERR-01 | Phase 12 | Pending |
| ERR-02 | Phase 12 | Pending |
| ERR-03 | Phase 12 | Pending |
| ERR-04 | Phase 12 | Pending |
| ERR-05 | Phase 12 | Pending |
| QUAL-01 | Phase 12 | Pending |
| QUAL-02 | Phase 12 | Pending |
| QUAL-03 | Phase 12 | Pending |
| QUAL-04 | Phase 12 | Pending |
| QUAL-05 | Phase 12 | Pending |

---

*Last updated: 2026-01-27*
