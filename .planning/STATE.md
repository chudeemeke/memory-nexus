# State: memory-nexus

## Project Reference

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Phase 5 Planning Complete - Ready for Execution

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5, Commander.js v14, Zod v4

## Current Position

**Milestone:** v1 - Full Vision Implementation
**Phase:** 5 - Basic Sync Command (planning complete)
**Plan:** 00 of 4 executed
**Status:** Phase 5 Planning Complete

```
[████████████████████████                ] 60%
Phase 5 planning complete | 591 tests passing | 4 plans ready
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
- [ ] Execute 05-01 - ExtractionState file metadata extension
- [ ] Execute 05-02 - SyncService application layer
- [ ] Execute 05-03 - CLI sync command with progress
- [ ] Execute 05-04 - Integration tests and verification

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

## Session Continuity

### Last Session

**Date:** 2026-01-28
**Completed:** Phase 5 Planning (4 plans created)
**Next:** Execute Phase 5 - Basic Sync Command

### Context for Next Session

1. Phase 5 planning complete - 4 plans ready for execution
2. Plan structure:
   - 05-01: ExtractionState file metadata (fileMtime, fileSize) - Wave 1
   - 05-02: SyncService application layer - Wave 2
   - 05-03: CLI sync command with progress - Wave 3
   - 05-04: Integration tests - Wave 4
3. Key insight: ExtractionState entity needs fileMtime/fileSize for incremental sync
4. Dependencies: cli-progress library needed for progress bars
5. 591 tests passing across all phases
6. Ready for execution via /gsd:execute-phase

### Files Modified This Session

- .planning/phases/05-basic-sync-command/05-01-PLAN.md (created)
- .planning/phases/05-basic-sync-command/05-02-PLAN.md (created)
- .planning/phases/05-basic-sync-command/05-03-PLAN.md (created)
- .planning/phases/05-basic-sync-command/05-04-PLAN.md (created)
- .planning/ROADMAP.md (updated - Phase 5 plans)
- .planning/STATE.md (updated)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases Completed | 4 / 12 |
| Plans Completed | 16 / ? |
| Requirements Completed | 38 / 85 |
| Test Coverage | 100% functions, 99%+ lines |
| Total Tests | 591 |

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

---

*Last updated: 2026-01-28*
