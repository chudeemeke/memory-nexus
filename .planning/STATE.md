# State: memory-nexus

## Project Reference

**Core Value:** Knowledge gained in one Claude Code project becomes accessible from any other project. No more context silos.

**Current Focus:** Phase 3 - JSONL Parsing and Extraction

**Tech Stack:** Bun, TypeScript 5.5+, bun:sqlite with FTS5, Commander.js v14, Zod v4

## Current Position

**Milestone:** v1 - Full Vision Implementation
**Phase:** 3 - JSONL Parsing and Extraction
**Plan:** 03-03 complete, 03-04 pending (Integration Tests)
**Status:** In Progress

```
[██████████                              ] 25%
Phase 3 in progress (3/4 plans complete) | 403 tests passing
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
- [ ] Execute 03-04 - Timestamp Normalization and Integration Tests

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

## Session Continuity

### Last Session

**Date:** 2026-01-28
**Completed:** 03-03 Event Classification and Extraction
**Next:** Execute 03-04 Timestamp Normalization and Integration Tests

### Context for Next Session

1. Phase 3 has 1 remaining plan for execution:
   - 03-04: Integration Tests (~35 tests)
2. Full parsing pipeline now available:
   - FileSystemSessionSource discovers sessions
   - JsonlEventParser streams JSONL lines
   - classifyEvent routes to ParsedEvent types
   - extractToolUseEvents/extractToolResultEvents for tool data
3. All event types classified (user, assistant, summary, system, skipped)
4. JSONL schema documented in .planning/research/JSONL-EVENT-SCHEMA.md

### Files Modified This Session

- src/infrastructure/parsers/event-classifier.ts (created)
- src/infrastructure/parsers/event-classifier.test.ts (created)
- src/infrastructure/parsers/index.ts (added exports)
- src/infrastructure/parsers/jsonl-parser.ts (integrated classifier)
- src/infrastructure/parsers/jsonl-parser.test.ts (updated for classification)
- .planning/phases/03-jsonl-parsing-and-extraction/03-03-SUMMARY.md (created)
- .planning/STATE.md (updated)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases Completed | 2 / 12 |
| Plans Completed | 8 / ? |
| Requirements Completed | 28 / 85 |
| Test Coverage | 97.72% functions, 99.33% lines |
| Total Tests | 403 |

## Phase 2 Summary

| Plan | Description | Tests |
|------|-------------|-------|
| 02-01 | Port Interfaces | 21 |
| 02-02 | SQLite Schema | 42 |
| 02-03 | Database Connection | 14 |
| 02-04 | FTS5 Integration | 21 |
| **Total** | | **98** |

## Phase 3 Progress

| Plan | Description | Tests | Status |
|------|-------------|-------|--------|
| 03-01 | Session Discovery | 14 | Complete |
| 03-02 | Streaming JSONL Parser | 17 | Complete |
| 03-03 | Event Classification | 65 | Complete |
| 03-04 | Integration Tests | ~35 | Pending |
| **Total** | | **~131** | |

---

*Last updated: 2026-01-28*
