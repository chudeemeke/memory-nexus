# State: memory-nexus

## Project Reference

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Phase 3 Complete - Ready for Phase 4

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5, Commander.js v14, Zod v4

## Current Position

**Milestone:** v1 - Full Vision Implementation
**Phase:** 3 - JSONL Parsing and Extraction (Complete)
**Plan:** 03-04 complete (all 4 plans done)
**Status:** Phase 3 Complete

```
[████████████                            ] 30%
Phase 3 complete (4/4 plans) | 462 tests passing
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
- [ ] Plan Phase 4 - Content Extraction Pipeline
- [ ] Execute Phase 4 plans

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

## Session Continuity

### Last Session

**Date:** 2026-01-28
**Completed:** 03-04 Timestamp Normalization and Integration Tests
**Next:** Plan and execute Phase 4 (Content Extraction Pipeline)

### Context for Next Session

1. Phase 3 is complete. All JSONL parsing infrastructure is in place:
   - FileSystemSessionSource discovers sessions
   - JsonlEventParser streams JSONL lines
   - classifyEvent routes to ParsedEvent types
   - extractToolUseEvents/extractToolResultEvents for tool data
   - normalizeTimestamp ensures consistent ISO 8601 format
2. Full parsing pipeline verified with 25 integration tests
3. Memory-efficient: 10K line files processed with < 50MB memory increase
4. JSONL schema documented in .planning/research/JSONL-EVENT-SCHEMA.md
5. Ready for Phase 4: Transform ParsedEvent to domain Message entities

### Files Modified This Session

- src/infrastructure/parsers/timestamp.ts (created)
- src/infrastructure/parsers/timestamp.test.ts (created)
- src/infrastructure/parsers/event-classifier.ts (modified - added normalizeTimestamp)
- src/infrastructure/parsers/event-classifier.test.ts (modified - added 7 tests)
- src/infrastructure/parsers/index.ts (modified - added export)
- src/infrastructure/parsers/integration.test.ts (created)
- src/infrastructure/sources/integration.test.ts (created)
- tests/fixtures/valid-session.jsonl (created)
- tests/fixtures/with-tools.jsonl (created)
- tests/fixtures/malformed.jsonl (created)
- tests/fixtures/empty.jsonl (created)
- tests/generators/large-session.ts (created)
- .planning/phases/03-jsonl-parsing-and-extraction/03-04-SUMMARY.md (created)
- .planning/STATE.md (updated)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases Completed | 3 / 12 |
| Plans Completed | 12 / ? |
| Requirements Completed | 30 / 85 |
| Test Coverage | 97.98% functions, 99.26% lines |
| Total Tests | 462 |

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

---

*Last updated: 2026-01-28*
