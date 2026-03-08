# Phase 23: Foundation — Discussion Context

**Source:** Brainstorming session 2026-03-07 (design doc: docs/plans/2026-03-07-knowledge-layer-friction-design.md)
**Phase goal:** Establish the agent write protocol, global ~/.memory/ directory structure, memory file indexing in sync, and FTS5 search reliability fixes.

## What This Phase Builds

Four foundational capabilities that all subsequent phases depend on:

1. **Agent write protocol** — conventions for how Claude writes durable memory during sessions
2. **~/.memory/ directory** — global memory directory with encoded-path project subdirectories
3. **Memory file indexing** — extend sync to discover and index ~/.memory/**/*.md files
4. **FTS5 search reliability** — sanitize special characters before FTS5 queries

## Agent Write Protocol

### Directory Structure

```
~/.memory/
  config.json                                      # tool configuration
  DECISIONS.md                                     # cross-project decisions
  LEARNINGS.md                                     # cross-project learnings
  USER-PREFS.md                                    # user interaction patterns
  daily/
    2026-03-07.md                                  # daily session log
  projects/
    C--Users-Destiny-Projects-kanbanflow/           # encoded path (mirrors ~/.claude/projects/)
      DECISIONS.md                                 # project-specific decisions
      LEARNINGS.md                                 # project-specific learnings
    C--Users-Destiny-Projects-memory-nexus/
      DECISIONS.md
      LEARNINGS.md
```

### Key Design Decisions

- **Encoded paths** for project subdirectories — mirrors `~/.claude/projects/<encoded>/` convention. ProjectNameResolver already maps these to display names.
- **Global curated files** at ~/.memory/ root — cross-project decisions, learnings, user prefs. Never decay.
- **Daily logs** in ~/.memory/daily/ — temporal, subject to decay (implemented in Phase 25).
- **Per-project subdirectories** — project-specific decisions and learnings that don't belong in global files.

### Daily Log Format

```markdown
# 2026-03-07

## Session: <session-id> (HH:MM - HH:MM)

### Topic
Brief description of what was worked on

### Decisions
- [decision summary]

### Outcomes
- [what was completed]

### Unresolved
- [items still pending]

### Learnings
- [insights gained]

### Key Files
- [important files touched]
```

### Curated File Formats

DECISIONS.md:
```markdown
# Decisions

## [YYYY-MM-DD] Decision title
- **Chose:** What was chosen
- **Over:** What was rejected
- **Because:** Rationale
- **Status:** active | superseded
- **Session:** <session-id>
```

LEARNINGS.md:
```markdown
# Learnings

## Learning title
- **Context:** When/where this was learned
- **Wrong approach:** What didn't work
- **Why wrong:** Root cause
- **Correct approach:** What to do instead
- **Applies to:** This project | cross-project
- **Date:** YYYY-MM-DD
```

### Write Timing

Claude writes to memory files at natural breakpoints:
- After a significant decision is made
- After a task is completed
- After a learning moment (error correction, user pushback)
- Before /clear when the user signals session end
- When prompted by the pre-compaction hook (Phase 26)

## Memory File Indexing

### What Sync Needs To Do (New)

`memory sync` currently:
1. Discovers ~/.claude/projects/<encoded>/*.jsonl
2. Parses JSONL files
3. Stores sessions, messages, tool_uses in SQLite

New behavior — also:
4. Discover ~/.memory/**/*.md files (daily logs + curated files + project files)
5. Parse markdown into structured entries
6. Store in a new `memory_files` table for search and context retrieval
7. Index content in FTS5 for full-text search alongside session messages

### Schema Addition

```sql
CREATE TABLE memory_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,          -- relative to ~/.memory/
    file_type TEXT NOT NULL,                  -- 'daily_log' | 'decisions' | 'learnings' | 'user_prefs'
    project_encoded TEXT,                     -- NULL for global files
    content TEXT NOT NULL,                    -- full markdown content
    content_hash TEXT NOT NULL,               -- SHA-256 for change detection
    last_indexed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_memory_files_type ON memory_files(file_type);
CREATE INDEX idx_memory_files_project ON memory_files(project_encoded);
```

FTS5 for memory files (separate from messages FTS):
```sql
CREATE VIRTUAL TABLE memory_files_fts USING fts5(
    content,
    content=memory_files,
    content_rowid=id,
    tokenize='porter unicode61'
);
```

### Discovery Logic

- Scan ~/.memory/ recursively for *.md files
- Compute content hash (SHA-256)
- Skip files where hash matches last indexed version (incremental)
- Parse file_type from path: daily/ = daily_log, DECISIONS.md = decisions, LEARNINGS.md = learnings, USER-PREFS.md = user_prefs
- Extract project_encoded from path: projects/<encoded>/DECISIONS.md -> <encoded>

## FTS5 Search Reliability

### Problem

Characters that FTS5 treats as operators cause syntax errors:
- Periods: "Opus 4.6" -> FTS5 syntax error
- Hyphens: "SYNC-09" -> "no such column" error
- Colons, parentheses, brackets also problematic

### Solution

Sanitize queries before passing to FTS5. The porter unicode61 tokenizer already strips these characters during indexing, so queries need the same treatment:

```typescript
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators that would cause syntax errors
  // Keep alphanumeric, spaces, and FTS5 operators (AND, OR, NOT, NEAR)
  const sanitized = query
    .replace(/[.:\-()[\]{}^*"~]/g, ' ')  // replace special chars with spaces
    .replace(/\s+/g, ' ')                   // collapse multiple spaces
    .trim();

  // If the sanitized query is empty or just whitespace, return original
  // alphanumeric parts joined with implicit AND
  return sanitized || query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
}
```

### Where to Apply

- `SearchService.search()` — sanitize user query before FTS5 MATCH
- `HybridSearchService.hybridSearch()` — sanitize before FTS5 leg
- `SessionRepository.searchSummaries()` — sanitize before sessions_fts MATCH
- Any new FTS5 queries for memory_files_fts

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| Memory directory config | Infrastructure | src/infrastructure/paths.ts (extend getMemoryDir()) |
| MemoryFile entity | Domain | src/domain/entities/memory-file.ts (new) |
| IMemoryFileRepository | Domain Port | src/domain/ports/repositories.ts (extend) |
| SqliteMemoryFileRepository | Infrastructure | src/infrastructure/database/repositories/ (new) |
| memory_files schema | Infrastructure | src/infrastructure/database/schema.ts (extend) |
| File discovery | Infrastructure | src/infrastructure/sources/ (new scanner) |
| FTS5 sanitizer | Application | src/application/services/ (utility) |
| Sync integration | Application | src/application/services/sync-service.ts (extend) |

## Dependencies

- Depends on: v2.0 complete (all infrastructure in place)
- Blocks: Phase 24 (friction system uses same DB), Phase 25 (smart context reads memory files), Phase 28 (backfill writes daily logs)

## Files Likely Modified

### New Files
- src/domain/entities/memory-file.ts
- src/domain/entities/memory-file.test.ts
- src/infrastructure/database/repositories/memory-file-repository.ts
- src/infrastructure/database/repositories/memory-file-repository.test.ts
- src/infrastructure/sources/memory-file-scanner.ts
- src/infrastructure/sources/memory-file-scanner.test.ts
- src/application/services/fts-sanitizer.ts
- src/application/services/fts-sanitizer.test.ts

### Modified Files
- src/infrastructure/database/schema.ts — add memory_files + memory_files_fts tables
- src/infrastructure/paths.ts — add getMemoryDir() function
- src/domain/ports/repositories.ts — add IMemoryFileRepository
- src/domain/ports/index.ts — re-export new types
- src/application/services/sync-service.ts — integrate memory file indexing
- src/infrastructure/database/services/search-service.ts — apply FTS5 sanitization
- src/infrastructure/database/services/hybrid-search-service.ts — apply FTS5 sanitization
- src/presentation/cli/commands/sync.ts — wire up memory file scanning

## Testing Strategy

- Unit tests for MemoryFile entity (validation, immutability)
- Unit tests for FTS5 sanitizer (edge cases: periods, hyphens, colons, mixed)
- Unit tests for memory file scanner (discovery, hash comparison, incremental)
- Integration tests for memory_files repository (CRUD, FTS5 search)
- Integration test for sync with memory files (end-to-end)
- Existing search tests should still pass (regression)

## Open Questions for Planning

1. Should memory_files FTS be a separate virtual table or merged with messages_fts?
   Recommendation: separate — different content types, different decay rules.

2. Should the ~/.memory/ directory be created automatically on first `memory sync`, or require `memory init`?
   Recommendation: auto-create on sync if not exists. No init command needed.

3. Should memory file content be stored in the memory_files table (duplicating disk content) or just indexed with a path reference?
   Recommendation: store content — enables search without disk access, consistent with how messages are stored.
