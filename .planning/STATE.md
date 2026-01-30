# State: memory-nexus

## Project Reference

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Phase 8 - Context Command

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5, Commander.js v14, cli-progress@3.12.0, chrono-node

## Current Position

**Milestone:** v1 - Full Vision Implementation
**Phase:** 8 - Stats and List Commands (IN PROGRESS)
**Plan:** 1 of 2 complete (08-01)
**Status:** Phase 8 in progress, 08-01 complete

```
[███████████████████████████             ] 65%
7.5 of 12 phases complete | 988 tests passing | Plan 08-01 complete
```

## Accumulated Context

### Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| bun:sqlite over better-sqlite3 | ABI compatibility issues with Bun; bun:sqlite is 3-6x faster | 2026-01-27 |
| Hexagonal architecture | User's WoW standard; clear layer separation | 2026-01-27 |
| Streaming JSONL parser | Session files can exceed 10,000 lines; memory exhaustion risk | 2026-01-27 |
| 12-phase comprehensive depth | Full vision delivery; not MVP-first approach | 2026-01-27 |
| FTS5 MATCH only | = operator causes full table scan; must enforce MATCH | 2026-01-27 |
| import type for ports | Domain purity - port files have no runtime dependencies | 2026-01-27 |
| AsyncIterable parser | Memory-efficient streaming for large JSONL files (10K+ lines) | 2026-01-27 |
| BM25 ranking default | Lower (more negative) scores indicate better relevance | 2026-01-27 |
| readline.createInterface | Node's built-in streaming for JSONL parsing | 2026-01-28 |
| Filter thinking blocks | Signature-protected content should not be extracted | 2026-01-28 |
| 1e12 timestamp threshold | Distinguishes Unix seconds vs milliseconds automatically | 2026-01-28 |
| Existence check for batch inserts | FTS5 triggers interfere with changes count; use SELECT before INSERT | 2026-01-28 |
| Batch size 100 hardcoded | Per CONTEXT.md decision; YAGNI on configurability | 2026-01-28 |
| BM25 score normalization | (maxScore - score) / range maps to 0-1; single result = 1.0 | 2026-01-28 |
| Snippet highlighting | <mark> tags for HTML standard highlighting | 2026-01-28 |
| WAL TRUNCATE for bulk ops | Complete WAL reset after bulk operations | 2026-01-28 |
| File metadata in ExtractionState | fileMtime/fileSize enable incremental sync detection | 2026-01-28 |
| Per-session transaction boundary | Atomic saves ensure consistency; error isolation across sessions | 2026-01-28 |
| extractEntities inline | Entity extraction within SyncService for simplicity vs separate helper | 2026-01-28 |
| TTY detection pattern | createProgressReporter() factory selects implementation based on stdout.isTTY | 2026-01-28 |
| Progress start on first session | Start progress bar when current=1 rather than on discovering phase | 2026-01-28 |
| Parser gracefully skips malformed lines | All sessions processed even with invalid JSONL content | 2026-01-28 |
| ANSI bold for match highlighting | Convert <mark> tags to \x1b[1m/\x1b[0m for terminal output | 2026-01-28 |
| Score as percentage | (score * 100).toFixed(0) for human-readable relevance display | 2026-01-28 |
| Post-filter for case sensitivity | FTS5 is inherently case-insensitive; post-filter with 2x fetch limit | 2026-01-29 |
| Option.conflicts() for mutual exclusivity | Commander.js v14 native support for verbose/quiet conflict | 2026-01-29 |
| OutputFormatter strategy pattern | Centralized formatting with default/json/verbose/quiet modes | 2026-01-29 |
| TTY detection for ANSI colors | shouldUseColor() checks stdout.isTTY and NO_COLOR/FORCE_COLOR env vars | 2026-01-29 |
| performance.now() for timing | Higher precision than Date.now() for verbose execution details | 2026-01-29 |
| roleFilter array support | Single role uses =, array uses IN clause for multi-role search | 2026-01-29 |
| sessionFilter direct equality | m.session_id = ? for exact session matching | 2026-01-29 |
| --days inclusive calculation | Today minus (N-1) days for a full N-day window | 2026-01-29 |
| argParser for --days validation | Commander.js argParser validates at parse time | 2026-01-29 |
| Subquery totals pattern | Single query with subqueries for session/message/tool counts | 2026-01-30 |
| Table-valued PRAGMA | pragma_page_count() * pragma_page_size() for database size | 2026-01-30 |
| Intl.NumberFormat | en-US locale for consistent thousands separator formatting | 2026-01-30 |
| Binary bytes thresholds | 1024 boundaries for B/KB/MB/GB formatting | 2026-01-30 |

### Blockers

None currently.

### TODOs

- [x] Create Phase 1 task plan - See .planning/phases/phase-01/PLAN.md
- [x] Research JSONL event structure - See .planning/research/JSONL-EVENT-SCHEMA.md
- [x] Execute Phase 1 - See .planning/phases/phase-01/SUMMARY.md
- [x] Verify Windows FTS5 support in Bun - Verified during 02-02 execution (42 tests pass)
- [x] Complete 02-01 Port Interfaces - 21 tests pass
- [x] Complete 02-02 SQLite Schema - 42 tests pass
- [x] Complete 02-03 Database Connection - 14 tests pass
- [x] Complete 02-04 FTS5 Integration Tests - 21 tests pass
- [x] Complete Phase 2 - All 4 plans complete
- [x] Plan Phase 3 - JSONL Parsing and Extraction (4 plans created)
- [x] Execute 03-01 - Session Discovery Implementation (14 tests)
- [x] Execute 03-02 - Streaming JSONL Parser Implementation (17 tests)
- [x] Execute 03-03 - Event Classification and Extraction (65 tests)
- [x] Execute 03-04 - Timestamp Normalization and Integration Tests (59 tests)
- [x] Plan Phase 4 - Storage Adapters (4 plans created)
- [x] Execute 04-01 - Session and Extraction State Repositories (45 tests)
- [x] Execute 04-02 - Message Repository with Batch Support (24 tests)
- [x] Execute 04-03 - Tool Use Repository (30 tests)
- [x] Execute 04-04 - Search Service and Integration Tests (36 tests)
- [x] Plan Phase 5 - Basic Sync Command (4 plans created)
- [x] Execute 05-01 - ExtractionState file metadata extension (20 tests)
- [x] Execute 05-02 - SyncService application layer (22 tests)
- [x] Execute 05-03 - CLI sync command with progress (49 tests)
- [x] Execute 05-04 - Integration tests and verification (28 tests)
- [x] Execute 06-01 - Search Command Implementation (28 tests)
- [x] Execute 06-02 - Case Sensitivity Options (14 tests)
- [x] Plan Phase 7 - Filtering and Output Formatting (4 plans created)
- [x] Execute 07-01 - Date parser and timestamp formatter (34 tests)
- [x] Execute 07-02 - Search filter options (27 tests)
- [x] Execute 07-03 - Output formatter and color utilities (38 tests)
- [x] Execute 07-04 - Apply formatting to search and sync commands (10 tests)
- [x] Plan Phase 8 - Stats and List Commands (2 plans created)
- [x] Execute 08-01 - Stats Command Implementation (75 tests)
- [ ] Execute 08-02 - List Command Implementation

### Learnings

- Claude Code encodes directory paths (format: C--Users-Destiny-Projects-wow-system)
- Session files can grow to 10,000+ lines (10MB+)
- FTS5 MATCH vs = operator is a critical pitfall
- WAL mode requires checkpointing after bulk operations
- bun:sqlite has FTS5 enabled on Linux since v0.6.12; macOS may need workaround
- 20 distinct event types in JSONL files (see JSONL-EVENT-SCHEMA.md)
- Primary extraction targets: user, assistant, tool_use, tool_result, summary
- Skip: progress events, base64, file-history-snapshot (no semantic value)
- Subagent sessions stored in `<session-uuid>/subagents/` directories
- Events linked via parentUuid field for conversation threading
- BM25 returns negative scores; lower = more relevant
- Snippet extraction works on content up to 10KB+
- Bulk insert of 1000 messages with triggers < 5 seconds
- Real session discovery verified: 831 sessions found on dev machine
- readline.createInterface with crlfDelay: Infinity handles cross-platform line endings
- Thinking blocks are signature-protected; filter from assistant content
- Tool result IDs generated as `result-${toolUseId}` for linking
- Unix timestamp detection: values > 1e12 are milliseconds, <= 1e12 are seconds
- Windows path encoding uses backslashes in decoded form (C:\Users\...)
- Memory increase for 10K line file parsing: < 50MB with streaming
- FTS5 triggers cause cumulative changes count within transactions (bun:sqlite)
- Existence check workaround: SELECT id before INSERT OR IGNORE for accurate counting
- 1000 message batch insert: 163ms (well under 5s requirement)
- BM25 normalization handles single-result edge case (returns 1.0)
- WAL TRUNCATE mode fully resets WAL file after bulk ops
- Full pipeline integration validates repository+search interoperability
- ExtractionState defensive copy pattern: fileMtime getter returns new Date to preserve immutability
- SyncService orchestrates full workflow: discover -> filter -> extract -> persist
- Application service pattern: domain-agnostic orchestration with dependency injection
- Per-session transaction with db.transaction().immediate() for atomicity
- Error state saved separately when extraction fails (does not affect other sessions)
- Commander.js parse() with { from: "user" } expects just user args, not node/script prefix
- cli-progress SingleBar works well with custom format strings and UTF-8 bar characters
- Smoke test discovered 870 sessions on dev machine (up from 831 earlier)
- Integration tests should use temporary directories for isolation
- CLI smoke tests can verify command structure without running actual operations
- messageRepo.save() parameter order is (message, sessionId), not (sessionId, message)
- FTS5 case sensitivity requires post-filter approach (unicode61 tokenizer is case-insensitive)
- Fetch 2x limit when case-sensitive to account for filtering losses
- Performance test: search 1000 messages under 100ms with FTS5
- Commander.js Option.conflicts() provides clean mutual exclusivity for CLI flags
- Strategy pattern for OutputFormatter enables clean output mode switching
- FormatOptions with ExecutionDetails enables verbose timing/filter display
- ANSI color detection respects NO_COLOR and FORCE_COLOR environment variables
- roleFilter array uses SQL IN clause for efficient multi-role queries
- parseDate from chrono-node handles natural language dates ("yesterday", "2 weeks ago")
- Commander.js argParser enables validation at parse time with custom error messages

## Session Continuity

### Last Session

**Date:** 2026-01-30
**Completed:** 08-01 Stats Command Implementation
**Next:** Execute 08-02 - List Command Implementation

### Context for Next Session

1. Phase 8 in progress - 08-01 complete, 08-02 pending
2. 988 tests passing (75 new tests from 08-01)
3. Stats command working: `memory stats` with --json, --verbose, --quiet, --projects options
4. StatsFormatter strategy pattern for output mode selection
5. SqliteStatsService uses efficient subquery pattern for totals
6. Ready to execute 08-02 - List Command Implementation

### Files Modified This Session

- src/domain/ports/services.ts (added IStatsService, StatsResult, ProjectStats)
- src/infrastructure/database/services/stats-service.ts (created)
- src/infrastructure/database/services/stats-service.test.ts (created, 16 tests)
- src/infrastructure/database/services/index.ts (export SqliteStatsService)
- src/infrastructure/database/index.ts (export SqliteStatsService)
- src/presentation/cli/formatters/stats-formatter.ts (created)
- src/presentation/cli/formatters/stats-formatter.test.ts (created, 34 tests)
- src/presentation/cli/formatters/index.ts (export stats-formatter)
- src/presentation/cli/commands/stats.ts (created)
- src/presentation/cli/commands/stats.test.ts (created, 25 tests)
- src/presentation/cli/commands/index.ts (export createStatsCommand)
- .planning/phases/08-stats-and-list-commands/08-01-SUMMARY.md (created)
- .planning/STATE.md (updated)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases Completed | 7.5 / 12 |
| Plans Completed | 27 (phases 1-7, 08-01) |
| Requirements Completed | 68 / 85 |
| Test Coverage | 95%+ functions, 96%+ lines |
| Total Tests | 988 |

## Phase 2 Summary

| Plan | Description | Tests |
|------|-------------|-------|
| 02-01 | Port Interfaces | 21 |
| 02-02 | SQLite Schema | 42 |
| 02-03 | Database Connection | 14 |
| 02-04 | FTS5 Integration | 21 |
| **Total** | | **98** |

## Phase 3 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 03-01 | Session Discovery | 14 | Complete |
| 03-02 | Streaming JSONL Parser | 17 | Complete |
| 03-03 | Event Classification | 65 | Complete |
| 03-04 | Integration Tests | 59 | Complete |
| **Total** | | **155** | **Complete** |

## Phase 4 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 04-01 | Session & Extraction State Repos | 45 | Complete |
| 04-02 | Message Repository | 24 | Complete |
| 04-03 | Tool Use Repository | 30 | Complete |
| 04-04 | Search Service & Integration | 36 | Complete |
| **Total** | | **135** | **Complete** |

## Phase 5 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 05-01 | ExtractionState File Metadata | 20 | Complete |
| 05-02 | SyncService Application Layer | 22 | Complete |
| 05-03 | CLI Sync Command | 49 | Complete |
| 05-04 | Integration Tests | 28 | Complete |
| **Total** | | **119** | **Complete** |

## Phase 6 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 06-01 | Search Command Implementation | 28 | Complete |
| 06-02 | Case Sensitivity Options | 14 | Complete |
| **Total** | | **42** | **Complete** |

## Phase 7 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 07-01 | Date Parser and Timestamp Formatter | 34 | Complete |
| 07-02 | Search Filter Options | 27 | Complete |
| 07-03 | Output Formatter and Color Utilities | 38 | Complete |
| 07-04 | Apply Formatting to Commands | 10 | Complete |
| **Total** | | **109** | **Complete** |

## Phase 8 Summary

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 08-01 | Stats Command Implementation | 75 | Complete |
| 08-02 | List Command Implementation | - | Pending |
| **Total** | | **75+** | **In Progress** |

---

*Last updated: 2026-01-30*
