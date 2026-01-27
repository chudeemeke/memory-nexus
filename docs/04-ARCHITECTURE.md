# Architecture

Technical architecture for memory-nexus, the Claude Code session extraction and search system.

## System Overview

```
+---------------------------------------------------------------+
|                   Claude Code Sessions                         |
|         ~/.claude/projects/<encoded-dir>/*.jsonl               |
|                                                                |
|  Session files contain JSONL events:                           |
|  - user messages, assistant responses                          |
|  - tool uses (Bash, Read, Write, Edit, Glob, Grep)            |
|  - thinking blocks, file history snapshots                     |
|  - session metadata (timestamps, UUIDs, version info)          |
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
|                    Extraction Engine                           |
|                                                                |
|  - Discover session directories by encoded path pattern        |
|  - Parse JSONL files line-by-line (streaming for large files)  |
|  - Extract messages by type: user, assistant, system           |
|  - Extract tool uses with input/output                         |
|  - Normalize timestamps to ISO 8601                            |
|  - Track extraction progress for incremental updates           |
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
|                    SQLite Database                             |
|                                                                |
|  Core Tables:                                                  |
|  - sessions: metadata, project mapping, message counts         |
|  - messages: FTS5 full-text search on content                  |
|  - tool_uses: structured queries on tool name, inputs          |
|                                                                |
|  Indexes:                                                      |
|  - FTS5 porter tokenizer for natural language search           |
|  - B-tree indexes on session_id, timestamp, project_path       |
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
|                      Query Interface                           |
|                                                                |
|  CLI Commands (via aidev memory):                              |
|  - aidev memory search "query"    # Full-text search           |
|  - aidev memory context <project> # Get project context        |
|  - aidev memory sync              # Manual extraction          |
|  - aidev memory stats             # Database statistics        |
|                                                                |
|  Hook Integration:                                             |
|  - Claude Code SessionStop hook for automatic extraction       |
|  - Incremental updates (only new content since last sync)      |
+---------------------------------------------------------------+
```

## Source Data Format

### Session File Location

Claude Code stores session data in:
```
~/.claude/projects/<encoded-directory>/<session-id>.jsonl
```

**Directory Encoding Pattern:**
- Forward slashes replaced with hyphens
- Colons replaced with hyphens
- Example: `C:/Users/Destiny/Projects/wow-system` becomes `C--Users-Destiny-Projects-wow-system`

**Session ID Formats:**
- UUID format: `b0a283ef-ea70-4509-a791-4f65831c3174.jsonl` (main sessions)
- Agent format: `agent-a60ceb4.jsonl` (subagent sessions)

### JSONL Event Types

Each line in a JSONL file is a self-contained JSON event. Key event types:

#### 1. System Events
```json
{
  "type": "system",
  "content": "SessionStart:startup [/path/to/hook.sh] completed successfully",
  "level": "info",
  "timestamp": "2025-12-29T12:56:58.382Z",
  "uuid": "b74b5ba2-7e31-48c1-96f1-df612b60aa33",
  "sessionId": "b0a283ef-ea70-4509-a791-4f65831c3174",
  "version": "1.0.67",
  "cwd": "C:\\Users\\Destiny\\Projects\\wow-system",
  "gitBranch": "main"
}
```

#### 2. User Messages
```json
{
  "type": "user",
  "parentUuid": "previous-uuid",
  "message": {
    "role": "user",
    "content": "Here's my question about..."
  },
  "uuid": "a01e503a-ab49-4a5f-960b-38397086e7fb",
  "timestamp": "2025-12-29T12:58:00.000Z",
  "sessionId": "b0a283ef-ea70-4509-a791-4f65831c3174"
}
```

#### 3. Assistant Messages (with Thinking)
```json
{
  "type": "assistant",
  "parentUuid": "user-uuid",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-5-20251101",
    "content": [
      {
        "type": "thinking",
        "thinking": "Let me analyze this problem...",
        "signature": "..."
      },
      {
        "type": "text",
        "text": "Based on my analysis..."
      }
    ],
    "usage": {
      "input_tokens": 1000,
      "output_tokens": 500,
      "cache_read_input_tokens": 50000
    }
  },
  "uuid": "fa6e64c1-84fe-4c50-abdc-38ce3294b856",
  "timestamp": "2025-12-29T13:00:12.665Z",
  "requestId": "req_011CWb2789RBhRbDa1pExHwY"
}
```

#### 4. Tool Use Events
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01SuEaVB36UBDzkdBs52pSo6",
        "name": "Bash",
        "input": {
          "command": "ls -la",
          "description": "List directory contents"
        }
      }
    ]
  },
  "uuid": "ec119515-61c7-4ac9-a212-0fd8222a5e44",
  "timestamp": "2025-12-29T13:00:18.145Z"
}
```

#### 5. Tool Results
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_01SuEaVB36UBDzkdBs52pSo6",
        "type": "tool_result",
        "content": "total 64\ndrwxr-xr-x 12 user staff 384 Dec 29 12:00 .\n...",
        "is_error": false
      }
    ]
  },
  "toolUseResult": {
    "stdout": "total 64\n...",
    "stderr": "",
    "interrupted": false,
    "isImage": false
  },
  "uuid": "59153a3d-679a-4350-94bd-3df8b2f7e527",
  "timestamp": "2025-12-29T13:00:20.000Z"
}
```

#### 6. File History Snapshots
```json
{
  "type": "file-history-snapshot",
  "messageId": "3dbc5a44-c2ac-4c17-9d11-a7608a8d291d",
  "snapshot": {
    "trackedFileBackups": {
      "src/main.ts": {
        "backupFileName": "f5ae92e170b442dd@v2",
        "version": 2,
        "backupTime": "2025-12-30T21:30:45.187Z"
      }
    },
    "timestamp": "2025-12-30T21:30:45.182Z"
  }
}
```

#### 7. Summary Events
```json
{
  "type": "summary",
  "summary": "Claude Code WSL2/Windows Path Config Fix",
  "leafUuid": "15f67a07-bc63-40cb-9887-cab52262fd68"
}
```

## Database Schema

### Core Tables

```sql
-- Sessions metadata
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- UUID session identifier
    project_path TEXT NOT NULL,       -- Original directory path
    project_name TEXT,                -- Extracted project name
    encoded_path TEXT,                -- Claude's encoded directory name
    created_at DATETIME,              -- First message timestamp
    last_message_at DATETIME,         -- Most recent message timestamp
    message_count INTEGER DEFAULT 0,  -- Total messages in session
    tool_use_count INTEGER DEFAULT 0, -- Total tool uses
    claude_version TEXT,              -- Claude Code version used
    model TEXT,                       -- Primary model used
    summary TEXT,                     -- Session summary if available
    git_branch TEXT,                  -- Git branch at session start
    last_sync_at DATETIME,            -- Last extraction timestamp
    last_sync_line INTEGER DEFAULT 0  -- Last processed line number
);

CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_created ON sessions(created_at);
CREATE INDEX idx_sessions_last_message ON sessions(last_message_at);

-- Messages with full-text search
CREATE VIRTUAL TABLE messages USING fts5(
    session_id,
    role,           -- user, assistant, system
    content,        -- Searchable text content
    thinking,       -- Thinking block content (separate for filtering)
    timestamp,
    tokenize='porter'
);

-- Messages metadata (separate for non-FTS queries)
CREATE TABLE messages_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    uuid TEXT UNIQUE,                 -- Message UUID from JSONL
    parent_uuid TEXT,                 -- Parent message UUID (conversation tree)
    role TEXT NOT NULL,               -- user, assistant, system
    timestamp DATETIME NOT NULL,
    model TEXT,                       -- Model used (assistant messages)
    request_id TEXT,                  -- API request ID
    input_tokens INTEGER,             -- Token usage
    output_tokens INTEGER,
    cache_tokens INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_messages_session ON messages_meta(session_id);
CREATE INDEX idx_messages_timestamp ON messages_meta(timestamp);
CREATE INDEX idx_messages_parent ON messages_meta(parent_uuid);

-- Tool uses (structured queries)
CREATE TABLE tool_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_uuid TEXT,                -- Parent message UUID
    tool_id TEXT,                     -- Tool use ID (toolu_...)
    tool_name TEXT NOT NULL,          -- Bash, Read, Write, Edit, Glob, Grep, etc.
    input_json TEXT,                  -- Full input as JSON
    output_text TEXT,                 -- Tool result (stdout)
    error_text TEXT,                  -- Tool error (stderr)
    is_error BOOLEAN DEFAULT FALSE,   -- Was this an error?
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_tool_uses_session ON tool_uses(session_id);
CREATE INDEX idx_tool_uses_tool ON tool_uses(tool_name);
CREATE INDEX idx_tool_uses_timestamp ON tool_uses(timestamp);

-- File modifications tracking
CREATE TABLE file_modifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    backup_file TEXT,                 -- Backup filename from snapshot
    version INTEGER,
    modified_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_file_mods_session ON file_modifications(session_id);
CREATE INDEX idx_file_mods_path ON file_modifications(file_path);

-- Extraction state (for incremental sync)
CREATE TABLE extraction_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_file TEXT UNIQUE,         -- Full path to JSONL file
    last_line INTEGER DEFAULT 0,      -- Last processed line number
    last_byte INTEGER DEFAULT 0,      -- Last processed byte offset
    file_size INTEGER,                -- File size at last sync
    file_mtime DATETIME,              -- File mtime at last sync
    last_sync_at DATETIME
);
```

### FTS5 Search Examples

```sql
-- Basic full-text search
SELECT session_id, role, snippet(messages, 2, '<b>', '</b>', '...', 20) as match
FROM messages
WHERE messages MATCH 'authentication error'
ORDER BY rank;

-- Search with project filter (join with sessions)
SELECT m.session_id, m.role, m.content, s.project_name
FROM messages m
JOIN sessions s ON m.session_id = s.id
WHERE messages MATCH 'hexagonal architecture'
  AND s.project_name = 'wow-system';

-- Search only user questions
SELECT content FROM messages
WHERE messages MATCH 'how to' AND role = 'user';

-- Search assistant thinking (for debugging/insight)
SELECT thinking FROM messages
WHERE messages MATCH 'security' AND thinking IS NOT NULL;
```

## Component Architecture

### Module Structure

```
memory-nexus/
|-- src/
|   |-- core/
|   |   |-- extractor.ts          # JSONL parsing and extraction
|   |   |-- normalizer.ts         # Data normalization
|   |   |-- database.ts           # SQLite operations
|   |   +-- incremental.ts        # Incremental sync logic
|   |
|   |-- discovery/
|   |   |-- session-finder.ts     # Find session directories
|   |   |-- path-decoder.ts       # Decode encoded paths
|   |   +-- project-mapper.ts     # Map sessions to projects
|   |
|   |-- search/
|   |   |-- fts-query.ts          # FTS5 query builder
|   |   |-- result-formatter.ts   # Format search results
|   |   +-- context-builder.ts    # Build project context
|   |
|   |-- cli/
|   |   |-- commands/
|   |   |   |-- sync.ts           # aidev memory sync
|   |   |   |-- search.ts         # aidev memory search
|   |   |   |-- context.ts        # aidev memory context
|   |   |   +-- stats.ts          # aidev memory stats
|   |   +-- index.ts              # CLI entry point
|   |
|   +-- hooks/
|       +-- session-stop.ts       # Claude Code hook handler
|
|-- tests/
|   |-- unit/
|   |   |-- extractor.test.ts
|   |   |-- normalizer.test.ts
|   |   +-- fts-query.test.ts
|   |
|   +-- integration/
|       |-- database.test.ts
|       +-- full-sync.test.ts
|
+-- config/
    +-- memory-nexus.json         # Configuration file
```

### Data Flow

```
1. DISCOVERY PHASE
   +----------------+     +------------------+     +----------------+
   | Session Finder |---->| Path Decoder     |---->| Project Mapper |
   | (glob *.jsonl) |     | (decode encoded) |     | (map to name)  |
   +----------------+     +------------------+     +----------------+
                                                          |
                                                          v
2. EXTRACTION PHASE
   +----------------+     +------------------+     +----------------+
   | JSONL Parser   |---->| Event Classifier |---->| Normalizer     |
   | (stream lines) |     | (type detection) |     | (timestamps)   |
   +----------------+     +------------------+     +----------------+
                                                          |
                                                          v
3. STORAGE PHASE
   +----------------+     +------------------+     +----------------+
   | Session Writer |---->| Message Writer   |---->| Tool Use Writer|
   | (upsert meta)  |     | (FTS5 insert)    |     | (structured)   |
   +----------------+     +------------------+     +----------------+
                                                          |
                                                          v
4. QUERY PHASE
   +----------------+     +------------------+     +----------------+
   | Query Builder  |---->| FTS5 Search      |---->| Result Formatter|
   | (parse input)  |     | (SQLite)         |     | (output)       |
   +----------------+     +------------------+     +----------------+
```

## Trigger Mechanisms

### 1. Claude Code Hook (Automatic)

Using Claude Code's `SessionStop` hook:

```json
// ~/.claude/settings.json
{
  "hooks": {
    "SessionStop": [
      {
        "matcher": "",
        "command": "aidev memory sync --session $CLAUDE_SESSION_ID --quiet"
      }
    ]
  }
}
```

**Hook Environment Variables:**
- `$CLAUDE_SESSION_ID` - Current session UUID
- `$CLAUDE_CWD` - Session working directory

**Hook Behavior:**
- Runs after each Claude Code session ends
- Extracts only the completed session (fast, incremental)
- Quiet mode suppresses output (non-blocking)

### 2. Manual Commands

```bash
# Full sync - extract all sessions
aidev memory sync

# Sync specific project only
aidev memory sync --project wow-system

# Sync with verbose output
aidev memory sync --verbose

# Force re-extraction (ignore incremental state)
aidev memory sync --force

# Sync specific session
aidev memory sync --session b0a283ef-ea70-4509-a791-4f65831c3174
```

### 3. Scheduled Sync (Optional)

For users who want background extraction:

```bash
# Cron job example (every hour)
0 * * * * aidev memory sync --quiet --log /tmp/memory-nexus-sync.log
```

## Integration with aidev

### Command Registration

memory-nexus registers as a subcommand of `aidev`:

```typescript
// In ai-dev-environment CLI framework
aidev.registerSubcommand('memory', {
  description: 'Claude Code session memory management',
  subcommands: {
    sync: {
      description: 'Sync Claude Code sessions to database',
      options: {
        project: { type: 'string', description: 'Filter by project name' },
        session: { type: 'string', description: 'Sync specific session' },
        force: { type: 'boolean', description: 'Force re-extraction' },
        quiet: { type: 'boolean', description: 'Suppress output' },
        verbose: { type: 'boolean', description: 'Verbose output' }
      }
    },
    search: {
      description: 'Search session content',
      args: ['<query>'],
      options: {
        project: { type: 'string', description: 'Filter by project' },
        limit: { type: 'number', default: 10, description: 'Max results' },
        role: { type: 'string', choices: ['user', 'assistant', 'all'] }
      }
    },
    context: {
      description: 'Get context for a project',
      args: ['<project>'],
      options: {
        days: { type: 'number', default: 30, description: 'Days of history' },
        format: { type: 'string', choices: ['markdown', 'json', 'plain'] }
      }
    },
    stats: {
      description: 'Show database statistics',
      options: {
        project: { type: 'string', description: 'Filter by project' }
      }
    }
  }
});
```

### Configuration

```json
// ~/.config/memory-nexus/config.json
{
  "database": {
    "path": "~/.config/memory-nexus/sessions.db"
  },
  "extraction": {
    "sessionDir": "~/.claude/projects",
    "maxFileSize": "100MB",
    "excludePatterns": ["**/subagents/**"]
  },
  "search": {
    "defaultLimit": 10,
    "snippetLength": 200
  },
  "sync": {
    "autoSyncOnSessionEnd": true,
    "retentionDays": 90
  }
}
```

## Performance Considerations

### Large File Handling

Session files can grow large (10,000+ lines). Strategies:

1. **Streaming Parser**: Read line-by-line, not entire file
2. **Incremental Sync**: Track last processed line/byte, resume from there
3. **Batch Inserts**: Buffer writes, commit in batches of 1000

```typescript
// Incremental extraction pseudocode
async function extractIncremental(sessionFile: string, db: Database) {
  const state = await db.getExtractionState(sessionFile);
  const fileStats = await fs.stat(sessionFile);

  // Skip if file unchanged
  if (state && state.fileSize === fileStats.size && state.fileMtime === fileStats.mtime) {
    return { extracted: 0, skipped: true };
  }

  // Resume from last position
  const startLine = state?.lastLine ?? 0;
  const stream = createReadStream(sessionFile, { start: state?.lastByte ?? 0 });

  let lineNumber = startLine;
  let bytesRead = state?.lastByte ?? 0;

  for await (const line of readline.createInterface({ input: stream })) {
    await processEvent(JSON.parse(line), db);
    lineNumber++;
    bytesRead += Buffer.byteLength(line) + 1; // +1 for newline
  }

  await db.updateExtractionState(sessionFile, lineNumber, bytesRead, fileStats);
  return { extracted: lineNumber - startLine, skipped: false };
}
```

### FTS5 Optimization

```sql
-- Optimize FTS5 index after bulk inserts
INSERT INTO messages(messages) VALUES('optimize');

-- Rebuild if needed (after deletions)
INSERT INTO messages(messages) VALUES('rebuild');
```

### Query Performance

```sql
-- Use covering indexes for common queries
CREATE INDEX idx_sessions_project_date
ON sessions(project_path, last_message_at DESC);

-- Partial indexes for active projects
CREATE INDEX idx_recent_sessions
ON sessions(last_message_at DESC)
WHERE last_message_at > datetime('now', '-30 days');
```

## Security Considerations

### Data Sensitivity

Session data may contain:
- Code snippets (potentially sensitive)
- File paths (reveal directory structure)
- API keys or credentials (in tool outputs)
- Personal information in conversations

**Mitigations:**
1. Database stored with user-only permissions (600)
2. No network access - fully local tool
3. Optional credential scrubbing during extraction
4. Exclude sensitive directories from extraction

### Credential Scrubbing (Optional)

```typescript
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?([^"'\s]+)/gi,
  /(?:sk-|pk-|ghp_|gho_)[a-zA-Z0-9]{20,}/g,
  /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/g
];

function scrubSensitive(content: string): string {
  let scrubbed = content;
  for (const pattern of SENSITIVE_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}
```

## Error Handling

### Extraction Errors

```typescript
enum ExtractionError {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PARSE_ERROR = 'PARSE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED'
}

interface ExtractionResult {
  success: boolean;
  sessionId: string;
  messagesExtracted: number;
  toolUsesExtracted: number;
  errors: Array<{
    type: ExtractionError;
    line?: number;
    message: string;
  }>;
}
```

### Graceful Degradation

- Skip malformed JSON lines, log warning, continue
- Handle missing fields with defaults
- Continue extraction if single session fails
- Report summary at end (X succeeded, Y failed)

## Consumer Interface

### Design Principle

The SQLite database is the single source of truth. CLI commands query it. Both Claude and humans use the same commands - no special formatting needed.

```
SQLite Database (Structured Data)
        │
        ▼
   CLI Commands (aidev memory *)
        │
        ├── Claude (via Bash tool)
        └── Human (via terminal)

Same query → Same result
```

### Database Design: SQLite + FTS5 + Relationship Tables

**Complexity:** Medium
**Capability:** Relational + Full-text search + Graph-like traversal

```sql
-- Core tables
CREATE TABLE sessions (...);
CREATE TABLE messages (...);
CREATE VIRTUAL TABLE messages_fts USING fts5(content);

-- Relationship table (enables graph-like queries)
CREATE TABLE links (
    source_type TEXT,  -- 'message', 'session', 'topic', 'entity'
    source_id TEXT,
    target_type TEXT,
    target_id TEXT,
    relationship TEXT, -- 'mentions', 'related_to', 'continues', 'references'
    weight REAL
);

-- Example: Find all topics related to a session
SELECT DISTINCT t.* FROM topics t
JOIN links l ON l.target_type = 'topic' AND l.target_id = t.id
WHERE l.source_type = 'session' AND l.source_id = ?;

-- Example: Find sessions that share topics with current session
SELECT s2.* FROM sessions s2
JOIN links l1 ON l1.source_type = 'session' AND l1.source_id = ?
JOIN links l2 ON l2.target_id = l1.target_id AND l2.source_type = 'session'
WHERE l2.source_id = s2.id AND s2.id != ?;
```

### CLI Commands

```bash
aidev memory sync              # Extract sessions to database
aidev memory search "query"    # Full-text search
aidev memory context <project> # Get context for project
aidev memory related <id>      # Find related sessions/topics
aidev memory search "q" --json # JSON output (standard CLI option)
```

### Future: Vector Embeddings (Phase 4)

Semantic similarity search can be added later:
- Requires embedding model (OpenAI API or local)
- sqlite-vss extension for vector storage
- Not needed for MVP - FTS5 + relationships covers 80% of use cases

## Future Considerations

### Potential Enhancements

1. **Vector Embeddings**: Add semantic search via local embeddings
2. **Cross-Session Links**: Track conversation continuations across sessions
3. **Analytics Dashboard**: Visualize usage patterns, common queries
4. **Export Formats**: Export to markdown, HTML for sharing
5. **MCP Integration**: Expose as MCP server for Claude Code access

### Migration Path

If Claude Code changes session format:
1. Version detection in extractor
2. Adapter pattern for format variations
3. Schema migrations for database changes
