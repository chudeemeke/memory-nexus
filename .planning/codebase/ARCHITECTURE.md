# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Pipeline Architecture with CLI Interface

**Key Characteristics:**
- Four-phase data pipeline: Discovery -> Extraction -> Storage -> Query
- SQLite + FTS5 for embedded full-text search
- Relationship tables for graph-like traversal without external graph database
- CLI-first interface integrating with `aidev` command framework
- Hook-based automation for session sync

## Layers

**Discovery Layer:**
- Purpose: Locate and decode Claude Code session files
- Location: `src/discovery/` (planned)
- Contains: Session finder, path decoder, project mapper
- Depends on: Filesystem access to `~/.claude/projects/`
- Used by: Extraction layer

**Extraction Layer:**
- Purpose: Parse JSONL files, extract messages and metadata
- Location: `src/core/` and `src/parser/` (planned)
- Contains: JSONL parser, event classifier, normalizer, entity extractor, topic extractor
- Depends on: Discovery layer output, filesystem I/O
- Used by: Storage layer

**Storage Layer:**
- Purpose: Persist extracted data to SQLite with FTS5 indexing
- Location: `src/db/` (planned)
- Contains: Database operations, schema management, link management, FTS5 triggers
- Depends on: Extraction layer output, better-sqlite3
- Used by: Query layer

**Query Layer:**
- Purpose: Execute full-text and relational queries
- Location: `src/search/` (planned)
- Contains: FTS5 query builder, result formatter, context builder, related content finder
- Depends on: Storage layer (SQLite database)
- Used by: CLI layer

**CLI Layer (Presentation):**
- Purpose: User interface via `aidev memory` subcommands
- Location: `src/cli/` (planned)
- Contains: Command handlers for sync, search, context, stats, related
- Depends on: Query layer, Commander.js
- Used by: End users and Claude Code hooks

## Data Model

**Core Entities:**

| Entity | Table | Purpose |
|--------|-------|---------|
| Session | `sessions` | Metadata for each Claude Code session |
| Message | `messages` + `messages_fts` | Conversation content with full-text indexing |
| Tool Use | `tool_uses` | Structured tool invocation tracking |
| File Modification | `file_modifications` | Files changed during sessions |
| Link | `links` | Relationships between any entities |
| Topic | `topics` | Extracted topics/concepts |
| Extraction State | `extraction_state` | Incremental sync tracking |

**Relationship Model (links table):**
```sql
CREATE TABLE links (
    source_type TEXT,  -- 'message', 'session', 'topic', 'project'
    source_id TEXT,
    target_type TEXT,
    target_id TEXT,
    relationship TEXT, -- 'mentions', 'related_to', 'continues', 'references'
    weight REAL        -- Relationship strength for ranking
);
```

This enables graph-like queries without a dedicated graph database:
- Find related sessions via shared topics
- Trace conversation continuations
- Cross-project relationship discovery

**FTS5 Configuration:**
- Tokenizer: `porter unicode61` (stemming + Unicode support)
- Indexed fields: message content, role, project name
- Sync mechanism: SQLite triggers for automatic index updates

## Data Flow

**Sync Flow (Discovery -> Storage):**

```
1. Session Finder (glob ~/.claude/projects/*/*.jsonl)
            |
            v
2. Path Decoder (decode encoded directory names)
            |
            v
3. Project Mapper (map to human-readable project names)
            |
            v
4. JSONL Parser (stream lines, parse JSON events)
            |
            v
5. Event Classifier (identify type: message, tool_use, metadata)
            |
            v
6. Normalizer (standardize timestamps, extract content)
            |
            v
7. Entity/Topic Extractor (extract projects, files, concepts)
            |
            v
8. Database Writer (upsert sessions, messages, tool_uses, links)
```

**Query Flow:**

```
1. CLI Input (aidev memory search "query")
            |
            v
2. Query Builder (construct FTS5 MATCH clause + filters)
            |
            v
3. FTS5 Search (SQLite full-text query with BM25 ranking)
            |
            v
4. Result Formatter (highlight matches, add context)
            |
            v
5. CLI Output (formatted results to terminal)
```

**State Management:**
- Database file: `~/.config/memory-nexus/sessions.db` or `~/.memory-nexus/memory.db`
- Incremental sync state: `extraction_state` table tracks last processed line/byte per file
- Configuration: `~/.config/memory-nexus/config.json`

## Entry Points

**CLI Entry (`src/cli/memory-command.js`):**
- Location: `src/cli/memory-command.js` (planned)
- Triggers: User runs `aidev memory <command>`
- Responsibilities: Parse arguments, dispatch to appropriate handler, format output

**Hook Entry (`hooks/post-session-sync.sh`):**
- Location: `hooks/post-session-sync.sh` (planned)
- Triggers: Claude Code SessionStop hook
- Responsibilities: Invoke incremental sync for completed session

**Planned Commands:**
- `aidev memory sync` - Extract sessions to database
- `aidev memory search <query>` - Full-text search
- `aidev memory context <project>` - Get project context
- `aidev memory related <id>` - Find related items
- `aidev memory stats` - Database statistics

## Error Handling

**Strategy:** Graceful degradation with comprehensive logging

**Patterns:**
- Skip malformed JSON lines, log warning, continue extraction
- Handle missing fields with sensible defaults
- Continue if single session extraction fails (don't abort entire sync)
- Report summary at end: X succeeded, Y failed, Z warnings

**Error Types:**
```typescript
enum ExtractionError {
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    PARSE_ERROR = 'PARSE_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    PERMISSION_DENIED = 'PERMISSION_DENIED'
}
```

## Cross-Cutting Concerns

**Logging:**
- Framework: Console-based (matches aidev patterns)
- Levels: info, warn, error
- Log file: `~/.memory-nexus/logs/memory-nexus.log` (configurable)

**Validation:**
- JSON line validation during parsing
- Schema validation for event types
- Timestamp normalization to ISO 8601

**Security:**
- Database stored with user-only permissions (600)
- Fully local tool - no network access
- Optional credential scrubbing during extraction
- Configurable directory exclusion patterns

## Trigger Mechanisms

**Automatic (Claude Code Hook):**
```json
{
  "hooks": {
    "SessionStop": [{
      "matcher": "",
      "command": "aidev memory sync --session $CLAUDE_SESSION_ID --quiet"
    }]
  }
}
```

**Manual:**
- `aidev memory sync` - Full sync of all sessions
- `aidev memory sync --project <name>` - Project-specific sync
- `aidev memory sync --force` - Force re-extraction

**Scheduled (Optional):**
- Cron job for background extraction: `0 * * * * aidev memory sync --quiet`

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | SQLite + FTS5 | Embedded, no server, portable, full-text search built-in |
| Search | FTS5 with BM25 | Good enough relevance ranking, zero external dependencies |
| Language | Node.js | Matches aidev patterns, good SQLite bindings |
| SQLite Binding | better-sqlite3 | Synchronous API, better performance |
| CLI Framework | Commander.js | Already used in aidev ecosystem |
| Relationship Model | Links table | Graph-like traversal without graph database complexity |

## Future Considerations

**Phase 4 Enhancements (Deferred):**
- Vector embeddings for semantic search (sqlite-vss extension)
- Topic clustering and automatic tagging
- Web UI for browsing
- Cross-conversation threading

**Migration Path:**
- Version detection in extractor for format changes
- Adapter pattern for JSONL format variations
- Schema migrations table for database changes

---

*Architecture analysis: 2026-01-27*
