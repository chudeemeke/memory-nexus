# Pitfalls Research

**Domain:** Claude Code session extraction and search system (memory-nexus)
**Researched:** 2026-01-27
**Confidence:** HIGH (verified against official SQLite docs, better-sqlite3 issues, and project architecture)

## Critical Pitfalls

Issues that can sink the project or require significant rework.

### 1. Memory Exhaustion on Large JSONL Files

- **What goes wrong:** Using `readFileSync` or loading entire JSONL files into memory crashes Node.js when session files exceed available heap space. Claude Code sessions can grow to 10,000+ lines, and multiple large files processed sequentially can exhaust memory.

- **Warning signs:**
  - "JavaScript heap out of memory" errors during sync
  - Process hangs on specific large files
  - Memory usage spikes visible in system monitor

- **Prevention:**
  - Use streaming parsers exclusively - never `JSON.parse(fs.readFileSync(...))`
  - Use `readline.createInterface` with `fs.createReadStream` for line-by-line processing
  - Consider [stream-json](https://github.com/uhop/stream-json) library for robust JSONL streaming (v1.9.1 as of research date)
  - Process one session file at a time, not in parallel
  - Implement backpressure when writing to database

- **Phase relevance:** Phase 1 (Core Extraction) - must be built correctly from the start

- **Sources:** [stream-json GitHub](https://github.com/uhop/stream-json), [Processing big files in Node.js](https://czyzykowski.com/posts/big-files-in-node.html)

### 2. FTS5 Using `=` Instead of `MATCH`

- **What goes wrong:** Using the `=` operator with FTS5 virtual tables causes a full table scan instead of using the FTS5 index. Query times degrade from milliseconds to seconds as data grows. SQLite silently allows this but reports "INDEX 0" (linear scan) instead of "INDEX 0:M1" (full-text query).

- **Warning signs:**
  - Search queries slow down as database grows
  - `EXPLAIN QUERY PLAN` shows "INDEX 0:" without ":M1" suffix
  - Queries that worked fine with 100 sessions become unusable at 1000

- **Prevention:**
  - Always use `MATCH` operator for FTS5 queries, never `=`
  - Wrap FTS5 queries in a dedicated query builder that enforces correct syntax
  - Add integration tests that verify query plans include ":M1"
  - Document correct query patterns in codebase

- **Phase relevance:** Phase 2 (Search Interface) - critical for query implementation

- **Sources:** [SQLite Forum - FTS5 tables, = vs MATCH](https://sqlite.org/forum/forumpost/3f540bb224)

### 3. Incremental Sync State Corruption

- **What goes wrong:** If extraction fails mid-file (crash, power loss, Ctrl+C), the incremental state points to a byte offset in the middle of a JSON line. Next sync attempts to parse partial JSON, fails, and either skips data or corrupts the database.

- **Warning signs:**
  - "Unexpected token" JSON parse errors on resumed syncs
  - Same session shows different message counts across syncs
  - "SyntaxError: Unexpected end of JSON input"

- **Prevention:**
  - Use transactions: wrap each session extraction in a database transaction
  - Only update extraction state AFTER transaction commits
  - Track line numbers, not byte offsets (line boundaries are unambiguous)
  - Implement recovery: on parse error, re-extract entire session file from scratch
  - Store file mtime + size as part of state - if changed, re-extract from beginning

- **Phase relevance:** Phase 1 (Core Extraction) - foundational for incremental sync

- **Sources:** [Idempotency in Data Pipelines](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines), [ETL Incremental Loading](https://airbyte.com/data-engineering-resources/etl-incremental-loading)

### 4. Claude Code Format Version Drift

- **What goes wrong:** Claude Code updates may change the JSONL structure without notice. New event types, renamed fields, or restructured content blocks silently fail to extract, causing incomplete data or crashes.

- **Warning signs:**
  - Suddenly seeing many "unknown event type" warnings after Claude Code update
  - Sessions missing expected data (no tool uses, no thinking blocks)
  - Extraction succeeds but search returns incomplete results

- **Prevention:**
  - Extract and store the `version` field from JSONL events
  - Implement adapter pattern: one parser per known version, with fallback
  - Log unknown event types with full payload (don't silently skip)
  - Store raw JSONL line in a `raw_events` table for later reprocessing
  - Monitor Claude Code release notes for format changes

- **Phase relevance:** Phase 1 (Core Extraction) - design for format evolution from the start

- **Sources:** [Event Versioning Patterns](https://event-driven.io/en/how_to_do_event_versioning/), Project architecture docs reference this as an open question

### 5. WAL Mode Checkpoint Starvation

- **What goes wrong:** In WAL mode, if the CLI keeps the database open for reads while a sync process writes, the WAL file grows unboundedly. Eventually, disk fills up or performance degrades severely.

- **Warning signs:**
  - `sessions.db-wal` file growing to hundreds of MB
  - Database operations slowing down over time
  - Disk space warnings

- **Prevention:**
  - Enable WAL mode: `PRAGMA journal_mode=WAL`
  - Set busy timeout: `PRAGMA busy_timeout=5000`
  - Manually checkpoint after bulk operations: `PRAGMA wal_checkpoint(TRUNCATE)`
  - Close database connections when not in use (don't keep long-lived connections)
  - CLI commands should open/close connections per operation

- **Phase relevance:** Phase 2 (Search Interface) and Phase 3 (CLI Integration) - affects multi-process access patterns

- **Sources:** [SQLite WAL Mode](https://sqlite.org/wal.html), [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)

## Common Mistakes

Issues that cause pain but are recoverable.

### 1. FTS5 Triggers with RETURNING Clause

- **What goes wrong:** In better-sqlite3, triggers that insert into FTS5 tables fail when the triggering statement uses `RETURNING`. Results in "SqliteError: cannot commit - no transaction is active".

- **Warning signs:**
  - Intermittent transaction failures during inserts
  - Error specifically mentions "no transaction is active"

- **Prevention:**
  - Avoid `RETURNING` clause in statements that have FTS5 triggers
  - Or: manage FTS5 inserts manually instead of via triggers
  - Test FTS5 trigger behavior with your exact insert patterns

- **Sources:** [better-sqlite3 issue #654](https://github.com/WiseLibs/better-sqlite3/issues/654)

### 2. Forgetting to Run ANALYZE

- **What goes wrong:** SQLite query planner makes poor decisions on join order and index usage because it has no statistics. Queries that should be fast are slow. Running ANALYZE on an empty database is useless - it needs representative data.

- **Warning signs:**
  - JOINs between FTS5 and regular tables are slow
  - `EXPLAIN QUERY PLAN` shows unexpected full table scans

- **Prevention:**
  - Run `ANALYZE` after initial data load (not before)
  - Run `PRAGMA optimize` at application shutdown
  - Re-run ANALYZE periodically as data grows (weekly or after significant imports)

- **Sources:** [SQLite Forum - Performance Analysis](https://sqlite.org/forum/info/47429810bd2232ebe0c1096c4910b43f6313b9d92bca6eab8496d59d3f585e4c)

### 3. Blocking Transactions During Network-Free Operations

- **What goes wrong:** Opening a write transaction, then doing slow operations (file I/O, heavy computation) before committing blocks all other writes. For a CLI tool, this might not seem critical, but hook-triggered syncs can conflict with manual CLI commands.

- **Warning signs:**
  - "database is locked" errors during concurrent operations
  - Commands hang waiting for locks

- **Prevention:**
  - Parse JSONL file first, collect all data in memory, THEN start transaction and batch insert
  - Keep transactions as short as possible
  - Use `BEGIN IMMEDIATE` to fail fast instead of waiting

- **Sources:** [SQLite Concurrent Writes](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)

### 4. Silent Data Loss from Malformed JSONL Lines

- **What goes wrong:** A single corrupted line (incomplete write, disk error) can cause the parser to either crash or silently skip data. If errors aren't logged, you won't know data is missing.

- **Warning signs:**
  - Message counts don't match between source files and database
  - Sessions missing content visible in raw JSONL

- **Prevention:**
  - Wrap every `JSON.parse()` in try-catch
  - Log failed lines with line number and content (truncated for logging)
  - Store error count per session extraction
  - Consider [jsonrepair](https://www.npmjs.com/package/jsonrepair) for recoverable corruption
  - Report summary: "Extracted 1523 events, 2 malformed lines skipped"

- **Sources:** [jsonrepair GitHub](https://github.com/josdejong/jsonrepair)

### 5. Path Encoding Assumptions

- **What goes wrong:** Assuming Claude Code uses a specific encoding (base64, URL-safe, etc.) for directory names. If the encoding changes or varies, session discovery fails.

- **Warning signs:**
  - Some session directories aren't discovered
  - Decoding produces invalid paths

- **Prevention:**
  - Don't decode path names - treat encoded names as opaque identifiers
  - Extract the actual project path from JSONL content (`cwd` field in events)
  - Store both encoded name and decoded path
  - Test with real session directories, not synthesized test data

- **Sources:** Project docs note this as an open question; [bricoleur blog on Claude sessions](http://www.bricoleur.org/2025/05/understanding-claude-code-sessions.html?m=1)

## SQLite/FTS5 Specific Gotchas

| Gotcha | Mitigation |
|--------|------------|
| FTS5 UNINDEXED columns can't have regular B-tree indexes | Use external content tables if you need both FTS and regular indexes on same data |
| JOINs between FTS5 virtual tables and regular tables are slow | Run ANALYZE; consider denormalizing frequently-joined data into FTS5 table |
| FTS5 module might not be compiled in | Verify with `SELECT sqlite_version(); SELECT * FROM pragma_compile_options();` - look for "FTS5" |
| Default tokenizer doesn't stem words | Use `tokenize='porter'` for English stemming ("running" matches "run") |
| Phrase search requires double quotes | `MATCH '"exact phrase"'` not `MATCH 'exact phrase'` (latter is OR search) |
| `optimize` command can take a long time | Run during maintenance windows, or use `merge` for incremental optimization |
| Integrity check may report false positives with external content tables | Expected if content table has extra rows; document this behavior |

## JSONL Parsing Specific Gotchas

| Gotcha | Mitigation |
|--------|------------|
| Lines can be arbitrarily long (assistant responses with code) | Don't assume line length limits; use streaming without buffering entire line |
| Empty lines between events | Filter blank lines before parsing: `if (!line.trim()) continue;` |
| Unicode BOM at file start | Strip BOM if present: `content.replace(/^\uFEFF/, '')` |
| Timestamps may vary in precision | Normalize all timestamps to ISO 8601 during extraction |
| Event types are not documented | Handle unknown types gracefully; log but don't fail |
| Content can contain newlines (in `content` field, properly escaped) | This is valid JSON - newlines are `\n` in strings, not literal line breaks |
| Tool results can be huge (file contents, command output) | Consider truncating for storage or storing separately |

## CLI Tool Specific Gotchas

| Gotcha | Mitigation |
|--------|------------|
| Exit codes have meaning | Use 0 for success, 1 for user error, 2+ for internal errors; 124 max |
| Async errors swallowed in non-interactive mode | Ensure all promises have catch handlers; use process-level error handler |
| TTY detection for output formatting | Check `process.stdout.isTTY` before using colors/formatting |
| Signals not handled (Ctrl+C) | Register SIGINT/SIGTERM handlers for cleanup (close db, etc.) |
| Long operations with no progress feedback | Add `--verbose` flag; show progress bar for sync operations |
| Configuration file errors unclear | Validate config on load; provide clear error messages with file path |
| Paths with spaces break on Windows | Always quote paths; use cross-platform path handling |

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Phase 1 | JSONL Parsing | Memory exhaustion on large files | Use streaming parser from day one |
| Phase 1 | Incremental Sync | State corruption on interrupted sync | Transaction-based state updates |
| Phase 1 | Schema Design | FTS5 external content sync issues | Test trigger behavior early; consider manual FTS updates |
| Phase 2 | Query Builder | Using `=` instead of `MATCH` | Dedicated FTS query builder with correct syntax |
| Phase 2 | Performance | Slow JOINs without ANALYZE | Run ANALYZE after test data load |
| Phase 3 | CLI Commands | Database lock contention | Short transactions, WAL mode, busy timeout |
| Phase 3 | Hook Integration | Concurrent sync conflicts | Implement locking or queue mechanism |
| Phase 4 | Format Evolution | Claude Code update breaks parser | Version-aware parsing, raw event storage |

## Testing Recommendations

Based on identified pitfalls, these tests are critical:

### Unit Tests
- [ ] Parser handles empty lines gracefully
- [ ] Parser handles malformed JSON without crashing
- [ ] Parser handles unknown event types without crashing
- [ ] FTS5 query builder always uses MATCH, never =

### Integration Tests
- [ ] Extraction of 10,000+ line session file completes without memory spike
- [ ] Interrupted extraction (kill -9 during sync) recovers cleanly
- [ ] Concurrent CLI commands don't deadlock
- [ ] WAL checkpoint prevents unbounded growth

### Property-Based Tests
- [ ] Any valid JSONL line produces valid database entry or logged error
- [ ] Incremental sync produces same result as full re-sync

---

*Document Status: COMPLETE*
*Confidence: HIGH - based on official documentation, GitHub issues, and project architecture review*
