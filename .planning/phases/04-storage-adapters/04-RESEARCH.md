# Phase 4: Storage Adapters - Research

**Researched:** 2026-01-28
**Domain:** bun:sqlite, FTS5, Repository Pattern
**Confidence:** HIGH

## Summary

Phase 4 implements infrastructure adapters that persist domain entities (Session, Message, ExtractionState) to SQLite using bun:sqlite. The codebase already has a solid foundation: schema with FTS5 triggers, port interfaces, and database initialization with WAL mode.

The research confirms three key technical points from CONTEXT.md open questions:
1. **bun:sqlite transaction API** - Use `db.transaction()` with `.immediate()` method for BEGIN IMMEDIATE semantics
2. **FTS5 INSERT** - External content tables with triggers (already implemented) automatically update FTS index on INSERT/UPDATE/DELETE
3. **WAL checkpoint timing** - Use PASSIVE during operations, TRUNCATE after bulk operations complete

**Primary recommendation:** Implement repository adapters using prepared statements in transaction functions, with INSERT OR IGNORE for idempotent inserts and per-session transaction boundaries.

## Standard Stack

The stack is locked by prior decisions. No alternatives needed.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in | SQLite database driver | Native Bun, 3-6x faster than better-sqlite3 |
| SQLite FTS5 | Built-in | Full-text search | Integrated with Bun's SQLite, already verified |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | Stack is complete |

### Alternatives Considered

None - bun:sqlite is a locked decision from Phase 2.

**Installation:**
```bash
# No additional packages needed - bun:sqlite is built into Bun
```

## Architecture Patterns

### Recommended Project Structure

```
src/infrastructure/database/
├── connection.ts           # Already exists - DB initialization
├── schema.ts               # Already exists - Schema + FTS triggers
├── repositories/
│   ├── session-repository.ts    # ISessionRepository implementation
│   ├── message-repository.ts    # IMessageRepository implementation
│   └── extraction-state-repository.ts  # IExtractionStateRepository
├── services/
│   └── search-service.ts        # ISearchService implementation
└── integration.test.ts     # Already exists - FTS integration tests
```

### Pattern 1: Transaction Function Pattern

**What:** bun:sqlite transactions are functions returned by `db.transaction()` that auto-rollback on exception and auto-commit on return.

**When to use:** All write operations, especially batch inserts.

**Example:**
```typescript
// Source: https://bun.sh/docs/api/sqlite#transactions
const insertBatch = db.transaction((messages: MessageRow[]) => {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages_meta (id, session_id, role, content, timestamp)
    VALUES ($id, $sessionId, $role, $content, $timestamp)
  `);

  for (const msg of messages) {
    stmt.run(msg);
  }

  return messages.length;
});

// Use .immediate() for BEGIN IMMEDIATE (avoids SQLITE_BUSY)
insertBatch.immediate(messageBatch);
```

### Pattern 2: Repository Adapter Pattern

**What:** Infrastructure classes that implement domain port interfaces, translating between domain entities and database rows.

**When to use:** All repository implementations.

**Example:**
```typescript
// Source: Hexagonal architecture pattern
export class SqliteSessionRepository implements ISessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: Session): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, project_path, started_at, message_count)
      VALUES ($id, $projectPath, $startedAt, $messageCount)
    `);

    stmt.run({
      $id: session.id,
      $projectPath: session.projectPath.encoded,
      $startedAt: session.startedAt.toISOString(),
      $messageCount: session.messageCount,
    });
  }
}
```

### Pattern 3: BM25 Score Normalization

**What:** FTS5's BM25 returns negative scores where more negative = better match. Domain expects 0-1 range.

**When to use:** All search result transformations.

**Example:**
```typescript
// Source: https://sqlite.org/fts5.html#the_bm25_function
// BM25 returns negative values: -10 is better than -1
// Normalize to 0-1 range for SearchResult

const rawResults = db.query(`
  SELECT rowid, content, bm25(messages_fts) as score
  FROM messages_fts
  WHERE messages_fts MATCH $query
  ORDER BY score  -- More negative = better, so ascending
  LIMIT $limit
`).all({ $query: query, $limit: limit });

// Normalize: find min (best) score, scale to 0-1
const minScore = Math.min(...rawResults.map(r => r.score));
const maxScore = Math.max(...rawResults.map(r => r.score));
const range = maxScore - minScore || 1;

const normalized = rawResults.map(r => ({
  ...r,
  score: 1 - ((r.score - minScore) / range)  // Invert: best becomes 1.0
}));
```

### Pattern 4: Batch Insert with Progress Callback

**What:** Chunk large inserts into batches of 100, call progress callback between batches.

**When to use:** saveMany operations with optional progress reporting.

**Example:**
```typescript
// Source: CONTEXT.md decisions
interface BatchOptions {
  onProgress?: (progress: { inserted: number; total: number }) => void;
}

async saveMany(
  messages: Array<{ message: Message; sessionId: string }>,
  options?: BatchOptions
): Promise<{ inserted: number; skipped: number; errors: Array<{ id: string; reason: string }> }> {
  const BATCH_SIZE = 100;
  const result = { inserted: 0, skipped: 0, errors: [] as Array<{ id: string; reason: string }> };

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const insertBatch = this.db.transaction((items: typeof batch) => {
      for (const { message, sessionId } of items) {
        try {
          // INSERT OR IGNORE handles duplicates
          this.insertStmt.run({ /* params */ });
          result.inserted++;
        } catch (err) {
          result.skipped++;
          result.errors.push({
            id: message.id,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    insertBatch.immediate(batch);

    options?.onProgress?.({
      inserted: result.inserted,
      total: messages.length,
    });
  }

  return result;
}
```

### Anti-Patterns to Avoid

- **String concatenation for SQL:** Use prepared statements with named parameters (`$paramName`)
- **Individual inserts in loops:** Always batch within transactions
- **Forgetting `.immediate()`:** Write transactions should use BEGIN IMMEDIATE to avoid SQLITE_BUSY
- **Using `=` for FTS queries:** Always use `MATCH` operator for FTS5 queries
- **Blocking WAL checkpoint:** Use PASSIVE during operations, TRUNCATE only after bulk complete

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom tokenizer/indexer | FTS5 MATCH + BM25 | Handles tokenization, ranking, phrase matching |
| Transaction management | Manual BEGIN/COMMIT/ROLLBACK | `db.transaction()` | Auto-rollback on exception, proper cleanup |
| Duplicate detection | Pre-query existence checks | INSERT OR IGNORE | Atomic, handles race conditions |
| Score ranking | Custom relevance algorithm | BM25 function | Industry-standard TF-IDF variant |
| Text highlighting | Manual substring search | snippet() function | FTS5 built-in with configurable markers |

**Key insight:** bun:sqlite and FTS5 provide all primitives needed. The adapters are thin wrappers around SQL operations with entity translation.

## Common Pitfalls

### Pitfall 1: SQLITE_BUSY on Concurrent Writes

**What goes wrong:** Multiple write operations compete, causing "database is locked" errors.

**Why it happens:** Default BEGIN DEFERRED waits until first write to acquire lock.

**How to avoid:** Use `transaction.immediate()` which acquires write lock at transaction start.

**Warning signs:** Sporadic "SQLITE_BUSY" or "database is locked" errors under load.

### Pitfall 2: FTS Index Desynchronization

**What goes wrong:** FTS5 index doesn't match content table data.

**Why it happens:** External content tables require explicit trigger maintenance.

**How to avoid:** The existing schema already has INSERT/UPDATE/DELETE triggers. Verify triggers exist before bulk operations.

**Warning signs:** Search returns stale or missing results.

### Pitfall 3: BM25 Score Misinterpretation

**What goes wrong:** Lower (more negative) scores treated as worse matches.

**Why it happens:** BM25 returns negative values where more negative = better relevance.

**How to avoid:** Sort ascending for BM25, normalize to 0-1 for domain layer.

**Warning signs:** Best matches appearing at bottom of results.

### Pitfall 4: WAL File Growth

**What goes wrong:** WAL file grows unbounded, consuming disk space.

**Why it happens:** No checkpointing or only PASSIVE checkpoint during continuous writes.

**How to avoid:** Call TRUNCATE checkpoint after bulk operations complete (when no readers).

**Warning signs:** `-wal` file larger than main database file.

### Pitfall 5: Prepared Statement Lifecycle

**What goes wrong:** Memory leaks or "statement finalized" errors.

**Why it happens:** Creating new prepared statements per operation instead of reusing.

**How to avoid:** Create prepared statements once in constructor, reuse for all operations.

**Warning signs:** Growing memory usage, performance degradation over time.

## Code Examples

Verified patterns from official sources:

### Transaction with Immediate Lock

```typescript
// Source: https://bun.sh/docs/api/sqlite#transactions
const db = new Database("memory.db");

// Create transaction function
const saveSession = db.transaction((session: SessionRow) => {
  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, project_path, started_at, message_count)
    VALUES ($id, $projectPath, $startedAt, $messageCount)
  `).run(session);
});

// Execute with BEGIN IMMEDIATE
saveSession.immediate({
  $id: "session-123",
  $projectPath: "encoded-path",
  $startedAt: "2026-01-28T12:00:00Z",
  $messageCount: 42,
});
```

### FTS5 Search with BM25

```typescript
// Source: https://sqlite.org/fts5.html
const searchMessages = db.prepare(`
  SELECT
    m.id,
    m.content,
    m.session_id,
    bm25(messages_fts) as score,
    snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
  FROM messages_fts f
  JOIN messages_meta m ON f.rowid = m.rowid
  WHERE messages_fts MATCH $query
  ORDER BY score  -- Ascending: more negative = better
  LIMIT $limit
`);

const results = searchMessages.all({
  $query: '"authentication" OR "auth*"',  // FTS5 query syntax
  $limit: 20,
});
```

### WAL Checkpoint After Bulk Operation

```typescript
// Source: https://sqlite.org/wal.html
function checkpointAfterBulkInsert(db: Database): void {
  // TRUNCATE mode: blocks until complete, truncates WAL to zero
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
}

function checkpointDuringOperation(db: Database): void {
  // PASSIVE mode: non-blocking, checkpoints what it can
  db.exec("PRAGMA wal_checkpoint(PASSIVE);");
}
```

### Per-Session Transaction Boundary

```typescript
// Source: CONTEXT.md decisions - per-session atomicity
async function extractSession(
  sessionId: string,
  events: AsyncIterable<ParsedEvent>,
  db: Database
): Promise<ExtractionResult> {
  const messages: MessageRow[] = [];

  // Collect all messages from session
  for await (const event of events) {
    if (event.type !== "skipped") {
      messages.push(eventToRow(event, sessionId));
    }
  }

  // Single transaction for session data + extraction state
  const commitSession = db.transaction(() => {
    // Insert all messages
    const insertMsg = db.prepare(`
      INSERT OR IGNORE INTO messages_meta (id, session_id, role, content, timestamp)
      VALUES ($id, $sessionId, $role, $content, $timestamp)
    `);

    for (const msg of messages) {
      insertMsg.run(msg);
    }

    // Update extraction state
    db.prepare(`
      INSERT OR REPLACE INTO extraction_state (session_id, status, extracted_at)
      VALUES ($sessionId, 'complete', $extractedAt)
    `).run({
      $sessionId: sessionId,
      $extractedAt: new Date().toISOString(),
    });
  });

  // Execute with immediate lock
  commitSession.immediate();

  return { success: true, messagesInserted: messages.length };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| better-sqlite3 | bun:sqlite | Bun 1.0 (2023) | 3-6x performance improvement |
| FTS3/FTS4 | FTS5 | SQLite 3.9 (2015) | Better ranking (BM25), column filters |
| Manual triggers | Automatic sync | FTS5 content= | External content requires triggers (our case) |
| DELETE mode journal | WAL mode | SQLite 3.7 (2010) | Concurrent readers, better write perf |

**Deprecated/outdated:**
- FTS3/FTS4: Still work but FTS5 has better features and performance
- better-sqlite3: Works but bun:sqlite is faster and built-in

## Open Questions

All open questions from CONTEXT.md have been resolved:

1. **bun:sqlite transaction API**
   - Resolved: Use `db.transaction()` which returns a function with `.immediate()` method
   - Source: https://bun.sh/docs/api/sqlite#transactions (HIGH confidence)

2. **FTS5 INSERT with triggers**
   - Resolved: External content tables require manual triggers (already implemented in schema.ts)
   - Source: https://sqlite.org/fts5.html (HIGH confidence)

3. **WAL checkpoint timing**
   - Resolved: PASSIVE during operations (non-blocking), TRUNCATE after bulk complete
   - Source: https://sqlite.org/wal.html (HIGH confidence)

## Sources

### Primary (HIGH confidence)
- bun:sqlite documentation - Transaction API, prepared statements, immediate mode
- SQLite FTS5 documentation - BM25, snippet(), external content tables
- SQLite WAL documentation - Checkpoint modes (PASSIVE, TRUNCATE)

### Secondary (MEDIUM confidence)
- Existing codebase patterns (connection.ts, schema.ts, integration.test.ts)

### Tertiary (LOW confidence)
- None - all findings verified with official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - bun:sqlite is locked decision with official docs
- Architecture: HIGH - Repository pattern is well-established, bun:sqlite API verified
- Pitfalls: HIGH - All pitfalls verified with official SQLite/Bun documentation

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (stable APIs, 30 days reasonable)
