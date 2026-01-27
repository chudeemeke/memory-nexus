# Phase 2: Database Schema and Ports - Research

**Researched:** 2026-01-27
**Domain:** bun:sqlite with FTS5, port interface patterns (hexagonal architecture)
**Confidence:** HIGH

## Summary

This phase establishes the database schema with FTS5 full-text search and defines the port interfaces that bridge domain and infrastructure layers. Research covered three primary areas: (1) bun:sqlite configuration and FTS5 usage patterns, (2) SQLite FTS5 external content tables with synchronization triggers, and (3) TypeScript port interface patterns for hexagonal architecture.

The key findings are:
- bun:sqlite is 3-6x faster than better-sqlite3 and has FTS5 enabled on Linux (v0.6.12+); Windows support is uncertain and must be verified at runtime
- FTS5 MATCH operator MUST be used instead of = operator for column queries (= on columns causes full table scan)
- External content tables with triggers provide the cleanest schema design for separating FTS index from metadata
- Port interfaces should be async (`Promise<T>`) and use domain entities/value objects exclusively

**Primary recommendation:** Use external content FTS5 tables with trigger-based synchronization, WAL mode with explicit checkpointing, and async port interfaces returning domain types.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in (v1.3.7) | SQLite database access | Native to Bun, 3-6x faster than alternatives, no ABI issues |
| SQLite FTS5 | 3.9.0+ (built-in) | Full-text search | Built into SQLite, no external dependency, BM25 ranking |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun:sqlite constants | Built-in | SQLITE_FCNTL_* constants | WAL persistence control on macOS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bun:sqlite | better-sqlite3 | ABI compatibility issues with Bun runtime; bun:sqlite is faster |
| FTS5 | FTS4 | FTS5 has better ranking (BM25), prefix queries, and is actively maintained |
| External content table | Regular FTS5 table | External content separates concerns, allows metadata columns, saves space |

**Installation:**
```bash
# bun:sqlite is built-in, no installation needed
# FTS5 is compiled into SQLite, no installation needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── domain/
│   └── ports/           # Port interfaces (ISessionRepository, etc.)
├── infrastructure/
│   └── database/        # SQLite adapters implementing ports
│       ├── schema.ts    # Schema creation and migration
│       └── repositories/# Repository implementations
└── application/         # Use cases that depend on ports
```

### Pattern 1: External Content FTS5 Tables
**What:** Separate the FTS5 index from metadata storage using external content tables
**When to use:** When you need both full-text search and additional metadata columns
**Why:** FTS5 virtual tables cannot have PRIMARY KEY, constraints, or additional columns. External content pattern stores metadata in a regular table and indexes text in FTS5.

```sql
-- Source: https://sqlite.org/fts5.html#external_content_tables

-- Metadata table (regular SQLite table)
CREATE TABLE messages_meta (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    timestamp TEXT NOT NULL,
    tool_use_ids TEXT,  -- JSON array of IDs
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- FTS5 index (external content)
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content=messages_meta,
    content_rowid=rowid
);
```

### Pattern 2: Trigger-Based Synchronization
**What:** Use triggers to keep FTS5 index synchronized with the content table
**When to use:** Always with external content tables
**Why:** FTS5 external content tables require manual synchronization

```sql
-- Source: https://simonh.uk/2021/05/11/sqlite-fts5-triggers/

-- DELETE trigger
CREATE TRIGGER messages_ftsd AFTER DELETE ON messages_meta BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES('delete', old.rowid, old.content);
END;

-- INSERT trigger
CREATE TRIGGER messages_ftsi AFTER INSERT ON messages_meta BEGIN
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;

-- UPDATE trigger (delete + insert pattern)
CREATE TRIGGER messages_ftsu AFTER UPDATE ON messages_meta BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content)
  VALUES (new.rowid, new.content);
END;
```

### Pattern 3: Async Port Interfaces
**What:** Define port interfaces with async methods returning Promise types
**When to use:** All repository and service interfaces
**Why:** Database operations are inherently async; TypeScript async functions must return Promise

```typescript
// Source: https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi

// Driven port (repository interface)
export interface ISessionRepository {
  findById(id: string): Promise<Session | null>;
  findByProject(projectPath: ProjectPath): Promise<Session[]>;
  save(session: Session): Promise<void>;
  saveMany(sessions: Session[]): Promise<void>;
}
```

### Anti-Patterns to Avoid

- **Using = operator on FTS5 columns:** Causes full table scan instead of index lookup. Use MATCH exclusively.
- **Storing metadata in FTS5 table:** FTS5 cannot have constraints or additional typed columns. Use external content.
- **Synchronous port interfaces:** bun:sqlite operations are fast but still I/O; maintain async interface for adapter flexibility.
- **Raw SQL in domain layer:** Keep domain pure; SQL belongs in infrastructure adapters only.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom tokenization + indexing | FTS5 virtual table | Decades of optimization, BM25 ranking, prefix queries |
| Relevance ranking | Custom scoring algorithm | FTS5 bm25() function | Statistical model accounts for term frequency, document length |
| Text highlighting | Regex replacement | FTS5 highlight() function | Handles edge cases, configurable markup |
| Snippet extraction | Substring manipulation | FTS5 snippet() function | Context-aware, respects token boundaries |
| Transaction safety | Manual rollback code | SQLite transactions | ACID guarantees, automatic rollback on error |

**Key insight:** SQLite FTS5 provides a complete full-text search engine. Custom implementations will be slower, less accurate, and miss edge cases.

## Common Pitfalls

### Pitfall 1: FTS5 MATCH vs = Operator
**What goes wrong:** Using `=` operator on FTS5 column names causes full table scan instead of index lookup
**Why it happens:** `=` only performs FTS when LHS is the table name, not a column name
**How to avoid:** Always use MATCH operator for FTS5 queries
**Warning signs:** Slow queries (100ms+) that should be instant; EXPLAIN QUERY PLAN shows no FTS index usage

```sql
-- WRONG: = on column causes full scan
SELECT * FROM messages_fts WHERE content = 'authentication';

-- CORRECT: MATCH operator uses FTS index
SELECT * FROM messages_fts WHERE messages_fts MATCH 'authentication';

-- ALSO CORRECT: Table-level = works
SELECT * FROM messages_fts WHERE messages_fts = 'authentication';
```

### Pitfall 2: WAL Checkpoint Starvation
**What goes wrong:** WAL file grows without bound, degrading read performance
**Why it happens:** Concurrent reads prevent checkpoint completion; no explicit checkpointing after bulk operations
**How to avoid:** Checkpoint after bulk operations; use PRAGMA wal_checkpoint(PASSIVE) for non-blocking or (TRUNCATE) when exclusive access available
**Warning signs:** WAL file size growing (check with filesystem), read latency increasing

```typescript
// After bulk insert operations
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
```

### Pitfall 3: External Content Table Desync
**What goes wrong:** FTS index returns results that no longer exist in content table, or misses new content
**Why it happens:** Missing or incorrect triggers; triggers not using 'delete' command pattern
**How to avoid:** Use the exact trigger pattern with INSERT INTO fts(fts, ...) VALUES('delete', ...)
**Warning signs:** Search returns stale results; new content not searchable

### Pitfall 4: FTS5 Not Available at Runtime
**What goes wrong:** "no such module: fts5" error on some platforms
**Why it happens:** FTS5 must be enabled at SQLite compile time; Bun enabled it for Linux in v0.6.12 but Windows status is uncertain
**How to avoid:** Runtime check for FTS5 availability during database initialization
**Warning signs:** Error on first FTS5 table creation

```typescript
// Runtime FTS5 availability check
function checkFts5Support(db: Database): boolean {
  try {
    db.exec("CREATE VIRTUAL TABLE _fts5_test USING fts5(test)");
    db.exec("DROP TABLE _fts5_test");
    return true;
  } catch {
    return false;
  }
}
```

### Pitfall 5: Forgetting WAL Mode Persistence
**What goes wrong:** WAL mode not active after database reopen
**Why it happens:** Assuming WAL mode auto-persists (it actually does, but not verifying)
**How to avoid:** Always verify with PRAGMA journal_mode after opening
**Warning signs:** Slower writes than expected; no .wal file alongside .db file

## Code Examples

Verified patterns from official sources:

### Database Initialization with WAL Mode

```typescript
// Source: https://bun.com/docs/runtime/sqlite

import { Database } from "bun:sqlite";

export function initializeDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL;");

  // Verify WAL mode is active
  const result = db.query("PRAGMA journal_mode;").get() as { journal_mode: string };
  if (result.journal_mode !== "wal") {
    throw new Error(`Failed to enable WAL mode: ${result.journal_mode}`);
  }

  // Recommended pragmas for performance
  db.exec("PRAGMA synchronous=NORMAL;");  // Faster writes, still durable with WAL
  db.exec("PRAGMA cache_size=-64000;");   // 64MB cache
  db.exec("PRAGMA temp_store=MEMORY;");   // Temp tables in memory

  return db;
}
```

### FTS5 Table with BM25 Ranking

```typescript
// Source: https://sqlite.org/fts5.html

// Search with relevance ranking (lower bm25 = more relevant)
const searchQuery = db.prepare(`
  SELECT
    m.id,
    m.session_id,
    m.role,
    m.timestamp,
    snippet(messages_fts, 0, '<mark>', '</mark>', '...', 64) as snippet,
    bm25(messages_fts) as rank
  FROM messages_fts
  JOIN messages_meta m ON messages_fts.rowid = m.rowid
  WHERE messages_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`);

const results = searchQuery.all(query, limit);
```

### Port Interface Definitions

```typescript
// Port interfaces for hexagonal architecture

import type { Session } from "../entities/session.js";
import type { Message } from "../entities/message.js";
import type { ToolUse } from "../entities/tool-use.js";
import type { ExtractionState } from "../entities/extraction-state.js";
import type { ProjectPath } from "../value-objects/project-path.js";
import type { SearchQuery } from "../value-objects/search-query.js";
import type { SearchResult } from "../value-objects/search-result.js";

/**
 * Driven port for session persistence.
 */
export interface ISessionRepository {
  findById(id: string): Promise<Session | null>;
  findByProject(projectPath: ProjectPath): Promise<Session[]>;
  findRecent(limit: number): Promise<Session[]>;
  save(session: Session): Promise<void>;
  saveMany(sessions: Session[]): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * Driven port for message persistence with FTS5 indexing.
 */
export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findBySession(sessionId: string): Promise<Message[]>;
  save(message: Message, sessionId: string): Promise<void>;
  saveMany(messages: Array<{ message: Message; sessionId: string }>): Promise<void>;
}

/**
 * Driven port for full-text search operations.
 */
export interface ISearchService {
  search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  limit?: number;
  projectFilter?: ProjectPath;
  roleFilter?: "user" | "assistant";
  sinceDate?: Date;
  beforeDate?: Date;
}

/**
 * Driven port for session file discovery.
 */
export interface ISessionSource {
  discoverSessions(): Promise<SessionFileInfo[]>;
  getSessionFile(sessionId: string): Promise<string | null>;
}

export interface SessionFileInfo {
  id: string;
  path: string;
  projectPath: ProjectPath;
  modifiedTime: Date;
  size: number;
}

/**
 * Driven port for JSONL event parsing.
 */
export interface IEventParser {
  parse(filePath: string): AsyncIterable<ParsedEvent>;
}

export type ParsedEvent =
  | { type: "user"; data: UserEventData }
  | { type: "assistant"; data: AssistantEventData }
  | { type: "tool_use"; data: ToolUseEventData }
  | { type: "tool_result"; data: ToolResultEventData }
  | { type: "summary"; data: SummaryEventData }
  | { type: "system"; data: SystemEventData }
  | { type: "skipped"; reason: string };

// ... event data interfaces derived from JSONL schema
```

### Prepared Statement with Transaction

```typescript
// Source: https://bun.com/docs/runtime/sqlite

const insertMessage = db.prepare(`
  INSERT INTO messages_meta (id, session_id, role, content, timestamp, tool_use_ids)
  VALUES ($id, $sessionId, $role, $content, $timestamp, $toolUseIds)
`);

const saveMessages = db.transaction((messages: MessageData[]) => {
  for (const msg of messages) {
    insertMessage.run({
      $id: msg.id,
      $sessionId: msg.sessionId,
      $role: msg.role,
      $content: msg.content,
      $timestamp: msg.timestamp.toISOString(),
      $toolUseIds: JSON.stringify(msg.toolUseIds),
    });
  }
  return messages.length;
});

// Usage - atomic batch insert
const insertedCount = saveMessages(messageBatch);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FTS3/FTS4 | FTS5 | SQLite 3.9.0 (2015) | Better ranking, prefix queries, more extensible |
| better-sqlite3 | bun:sqlite | Bun 1.0+ (2023) | 3-6x faster, no ABI issues, native Bun support |
| Manual checkpointing | WAL auto-checkpoint | SQLite 3.7+ | Automatic at 1000 pages, but manual still recommended for bulk |

**Deprecated/outdated:**
- FTS3/FTS4: Use FTS5 instead for new projects
- Synchronous journal mode: Use WAL for concurrent reads
- npm sqlite packages: Use bun:sqlite for Bun projects

## Open Questions

Things that couldn't be fully resolved:

1. **Windows FTS5 Support**
   - What we know: FTS5 enabled on Linux in Bun v0.6.12; macOS uses system SQLite
   - What's unclear: Whether Windows Bun builds have FTS5 enabled
   - Recommendation: Add runtime check; fail gracefully with clear error message

2. **Optimal Batch Size for Bulk Inserts**
   - What we know: Transactions improve bulk insert performance
   - What's unclear: Optimal batch size for bun:sqlite specifically (100? 1000? 10000?)
   - Recommendation: Make configurable; default to 1000; benchmark during Phase 4

3. **Concurrent Access Patterns**
   - What we know: WAL mode supports concurrent readers with single writer
   - What's unclear: How bun:sqlite handles connection pooling across CLI invocations
   - Recommendation: Single connection per command; rely on WAL for read concurrency

## Sources

### Primary (HIGH confidence)
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite) - WAL mode, prepared statements, transactions
- [SQLite FTS5 Extension](https://sqlite.org/fts5.html) - Virtual tables, MATCH syntax, external content, ranking
- [SQLite WAL Mode](https://sqlite.org/wal.html) - Checkpoint modes, performance characteristics

### Secondary (MEDIUM confidence)
- [SQLite Forum: MATCH vs = operator](https://sqlite.org/forum/forumpost/5a170231b5) - Performance difference clarification
- [Bun v0.6.12 Release Notes](https://github.com/oven-sh/bun/discussions/3468) - FTS5 Linux enablement
- [FTS5 Triggers Pattern](https://simonh.uk/2021/05/11/sqlite-fts5-triggers/) - External content synchronization

### Tertiary (LOW confidence)
- [WebSearch] Windows FTS5 support in Bun - Not definitively confirmed, requires runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - bun:sqlite and FTS5 are well-documented, official sources available
- Architecture: HIGH - Hexagonal patterns well-established, external content FTS5 pattern documented
- Pitfalls: HIGH - FTS5 MATCH requirement confirmed by SQLite forum, WAL checkpointing in official docs

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable technology)
