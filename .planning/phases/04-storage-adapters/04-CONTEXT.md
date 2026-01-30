# Phase 4 Context: Storage Adapters

**Phase Goal:** Implement infrastructure adapters that persist domain entities to SQLite with full-text search indexing.

**Status:** Discussion complete
**Created:** 2026-01-28

---

## Decisions

### 1. Batch Write Behavior

| Decision | Choice |
|----------|--------|
| Default batch size | 100 messages (~1MB max per batch) |
| Configurability | Hardcoded default only (YAGNI) |
| Progress signaling | Optional callback: `onProgress?: (progress: { inserted: number, total: number }) => void` |
| Partial failure | Skip failed message, continue batch, log error |
| Failure logging | Message ID + error reason (e.g., "Skipped msg-123: UNIQUE constraint") |
| Return value | `{ inserted: number, skipped: number, errors: Array<{ id: string, reason: string }> }` |

**Rationale:** 100 messages balances memory safety with transaction overhead. Callback allows CLI layer to show progress without coupling infrastructure to UI concerns. Skipping failures keeps extraction moving while preserving visibility into issues.

### 2. Transaction Boundaries

| Decision | Choice |
|----------|--------|
| State update granularity | Per-session (entire session completes or not) |
| Atomicity | Same transaction for data + state |
| Multi-session sync | Separate transaction per session |
| State failure handling | Rollback data insertion (automatic via same transaction) |

**Rationale:** Per-session transactions provide clean recovery semantics. If extraction fails, the session state stays "not extracted" and will be retried. One session's failure doesn't affect others.

**Implementation note:** Use SQLite's `BEGIN IMMEDIATE` for write transactions to avoid SQLITE_BUSY on concurrent access.

### 3. Error Recovery Strategy

| Decision | Choice |
|----------|--------|
| File read error | Skip session, log error, continue sync |
| Malformed JSONL line | Skip line, log with line number, continue |
| Error surfacing | Return result object with errors array |
| Auto-retry | Yes - incomplete sessions retry on next sync |

**Rationale:** Resilient extraction that doesn't stop on first error. Application layer receives structured error information and decides how to present it. Since extraction_state only marks complete on success, failed sessions naturally retry.

**Error result structure:**
```typescript
interface ExtractionResult {
  success: boolean;
  sessionsProcessed: number;
  messagesInserted: number;
  errors: Array<{
    sessionId?: string;
    file?: string;
    line?: number;
    error: string;
  }>;
}
```

### 4. Duplicate Handling

| Decision | Choice |
|----------|--------|
| Message identity | Session ID + UUID from JSONL event |
| On duplicate | Skip and log as duplicate |
| Force behavior | Delete existing, re-extract fresh |
| Other entities | Same rules (UUID identity, skip on duplicate) |

**Rationale:** UUID-based identity is authoritative and stable. Skip-and-log provides idempotency with visibility. Force mode provides clean slate when needed (file corruption, schema changes, etc.).

**Implementation note:** Use `INSERT OR IGNORE` for normal inserts. For --force, delete all session data before re-extraction within the same transaction.

---

## Constraints from Previous Phases

### From Phase 2 (Schema)
- FTS5 virtual table exists: `messages_fts`
- Must use MATCH operator, never = for FTS queries
- WAL mode enabled, checkpoint after bulk operations
- extraction_state table tracks sync progress

### From Phase 3 (Parsing)
- Events arrive as `AsyncIterable<ParsedEvent>`
- Event types: user, assistant, tool_use, tool_result, summary, system
- Timestamps already normalized to ISO 8601
- Malformed lines already filtered (parser handles gracefully)

---

## Out of Scope

The following are NOT part of Phase 4:
- CLI command implementation (Phase 5)
- Search query parsing (Phase 6)
- Incremental sync detection by mtime (Phase 5 responsibility)
- Progress display/formatting (CLI layer concern)

---

## Open Questions for Research

1. **bun:sqlite transaction API** - Verify BEGIN IMMEDIATE syntax and transaction helper patterns
2. **FTS5 INSERT** - Confirm content table triggers update FTS index automatically
3. **WAL checkpoint timing** - When exactly to call PRAGMA wal_checkpoint

---

## Deferred Ideas

None captured during discussion.
