# Technical Research: Claude Code Session Storage

This document captures research findings about Claude Code's session storage mechanism, JSONL format, and the technical foundation for the Memory-Nexus extraction approach.

---

## Session Storage Location

### Directory Structure

Claude Code stores session history in a project-specific directory:

```
~/.claude/projects/<encoded-directory-name>/
├── [session-uuid].jsonl          # Full conversation history
├── [summary-uuid].jsonl          # Compressed summaries
└── ...
```

### Directory Name Encoding

The working directory path is encoded to create a filesystem-safe folder name:

```
Working Directory:     /home/user/Projects/my-app
Encoded Name:         L2hvbWUvdXNlci9Qcm9qZWN0cy9teS1hcHA=  (base64-like)
Full Session Path:    ~/.claude/projects/L2hvbWUvdXNlci9Qcm9qZWN0cy9teS1hcHA=/
```

**Note:** The exact encoding algorithm may vary. Investigation suggests URL-safe base64 or a similar scheme that handles special characters in paths (spaces, slashes).

### Session File Naming

Each session creates a new JSONL file with a UUID-based name:

```
a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl
```

Sessions are immutable once created - new conversations append to the same file until the session ends.

---

## JSONL Format Specification

### Format Overview

JSONL (JSON Lines) is a newline-delimited JSON format:

- One complete JSON object per line
- No commas between lines
- Each line is independently parseable
- Efficient for streaming and append operations

### Event Types

Session files contain several event types:

#### Message Events

```json
{"type":"message","role":"user","content":"Explain hexagonal architecture","timestamp":"2025-01-25T10:30:00.000Z"}
{"type":"message","role":"assistant","content":"Hexagonal architecture, also known as...","timestamp":"2025-01-25T10:30:15.000Z","tokens":{"input":1234,"output":567}}
```

#### Tool Use Events

```json
{"type":"tool_use","tool":"Bash","input":{"command":"npm test","description":"Run tests"},"timestamp":"2025-01-25T10:31:00.000Z"}
{"type":"tool_result","tool":"Bash","output":"All 42 tests passed","exit_code":0,"timestamp":"2025-01-25T10:31:05.000Z"}
```

#### Metadata Events

```json
{"type":"metadata","key":"session_start","value":{"cwd":"/home/user/Projects/my-app","model":"claude-sonnet-4-20250514"},"timestamp":"2025-01-25T10:29:00.000Z"}
```

### Common Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type: message, tool_use, tool_result, metadata |
| `timestamp` | ISO 8601 | When the event occurred |
| `role` | string | For messages: user, assistant, system |
| `content` | string | Message text or structured content |
| `tool` | string | For tool events: Bash, Read, Write, Edit, etc. |
| `tokens` | object | Token counts for assistant messages |

### Example Session Extract

```json
{"type":"metadata","key":"session_start","value":{"cwd":"/home/user/Projects/wow-system","model":"claude-sonnet-4-20250514"},"timestamp":"2025-01-25T09:00:00.000Z"}
{"type":"message","role":"user","content":"Run the test suite","timestamp":"2025-01-25T09:00:05.000Z"}
{"type":"message","role":"assistant","content":"I'll run the test suite for you.","timestamp":"2025-01-25T09:00:08.000Z","tokens":{"input":50,"output":15}}
{"type":"tool_use","tool":"Bash","input":{"command":"bash tests/run-all.sh"},"timestamp":"2025-01-25T09:00:10.000Z"}
{"type":"tool_result","tool":"Bash","output":"283 tests passed, 0 failed","exit_code":0,"timestamp":"2025-01-25T09:00:45.000Z"}
{"type":"message","role":"assistant","content":"All 283 tests passed successfully.","timestamp":"2025-01-25T09:00:47.000Z","tokens":{"input":100,"output":12}}
```

---

## Session Lifecycle

### Creation

Sessions are created when:
1. Claude Code starts in a directory
2. User begins a new conversation
3. `--resume` or `--continue` flags are NOT used

### Directory Binding

**Critical limitation:** Sessions are bound to their creation directory.

```bash
# Session created in ~/Projects/app-a
cd ~/Projects/app-a
claude

# This session CANNOT be resumed from app-b
cd ~/Projects/app-b
claude --resume  # Will NOT find app-a sessions
```

### Retention Policy

Default retention: **30 days** (configurable in `~/.claude/settings.json`)

```json
{
  "sessionRetentionDays": 30
}
```

After expiration, session files are automatically deleted by Claude Code.

### Resume Behavior

| Command | Behavior |
|---------|----------|
| `claude` | New session in current directory |
| `claude --resume` | Resume most recent session IN CURRENT DIRECTORY |
| `claude --continue` | Resume and continue last conversation IN CURRENT DIRECTORY |

**Key insight:** Resume functionality is strictly directory-scoped. There is no native way to access sessions from other directories.

---

## Cross-Project Limitations

### What DOES Work

**Additional working directories** (in settings.json or CLAUDE.md):
- File read/write access across directories
- Glob and Grep searches across directories
- Tool execution in other directories

### What DOES NOT Work

| Feature | Cross-Project Support |
|---------|----------------------|
| Session resume | NO - directory-bound |
| Context loading | NO - only current dir |
| CLAUDE.md auto-load | NO - only current dir |
| Session file portability | NO - paths are encoded |

### Example: Additional Working Directories

```json
// settings.json
{
  "additionalWorkingDirectories": [
    "~/Projects/shared-lib",
    "~/Projects/common-utils"
  ]
}
```

This grants **file access** only, NOT context awareness. Sessions from `shared-lib` remain inaccessible when working in a different project.

### Community Feedback

GitHub issue #12259 requests improved cross-project context support. As of this research (January 2025), this remains unimplemented. Memory-Nexus addresses this gap.

---

## SQLite + FTS5 Technical Approach

### Why SQLite?

| Feature | Benefit |
|---------|---------|
| Embedded database | No server process required |
| Single file storage | Easy backup, portable |
| Zero configuration | Works out of the box |
| Mature and stable | Decades of production use |
| Excellent performance | Handles millions of rows |

### Why FTS5?

FTS5 (Full-Text Search version 5) is SQLite's built-in search extension:

```sql
-- Create a full-text search table
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    tokenize='porter unicode61'
);

-- Search with relevance ranking
SELECT * FROM messages_fts
WHERE messages_fts MATCH 'hexagonal architecture'
ORDER BY rank;
```

**Key FTS5 features:**
- Boolean operators: `AND`, `OR`, `NOT`
- Phrase search: `"exact phrase"`
- Prefix matching: `arch*`
- Relevance ranking (BM25 algorithm)
- Snippet extraction for search results

### Proposed Schema

```sql
-- Core sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    project_name TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    last_message_at DATETIME,
    message_count INTEGER DEFAULT 0,
    model TEXT
);

-- Messages with foreign key to session
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- user, assistant, system
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    tokens_input INTEGER,
    tokens_output INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Tool usage tracking
CREATE TABLE tool_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_json TEXT,
    output_text TEXT,
    exit_code INTEGER,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content='messages',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Indexes for common queries
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_tool_uses_session ON tool_uses(session_id);

-- Relationship table for graph-like queries
-- Enables multi-linking between any entities
CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,  -- 'message', 'session', 'topic', 'entity', 'project'
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship TEXT NOT NULL, -- 'mentions', 'related_to', 'continues', 'references', 'discusses'
    weight REAL DEFAULT 1.0,    -- relevance/strength score
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id, target_type, target_id, relationship)
);

CREATE INDEX idx_links_source ON links(source_type, source_id);
CREATE INDEX idx_links_target ON links(target_type, target_id);
CREATE INDEX idx_links_relationship ON links(relationship);
```

### Why Relationship Tables?

This approach gives graph-like traversal capabilities without requiring a separate graph database:

| Need | Solution |
|------|----------|
| "Find related sessions" | Query links table |
| "What topics span projects?" | JOIN through links |
| "Trace conversation threads" | Recursive CTE on links |

**Complexity:** Medium (SQLite only, no external dependencies)
**Capability:** Relational + Full-text + Graph-like traversal

### Query Examples

**Search across all projects:**
```sql
SELECT
    s.project_name,
    m.role,
    snippet(messages_fts, 0, '>>>', '<<<', '...', 64) as excerpt,
    m.timestamp
FROM messages_fts
JOIN messages m ON messages_fts.rowid = m.id
JOIN sessions s ON m.session_id = s.id
WHERE messages_fts MATCH 'TDD workflow'
ORDER BY rank
LIMIT 20;
```

**Find sessions by project:**
```sql
SELECT * FROM sessions
WHERE project_path LIKE '%wow-system%'
ORDER BY last_message_at DESC;
```

**Get full conversation:**
```sql
SELECT role, content, timestamp
FROM messages
WHERE session_id = 'abc-123'
ORDER BY timestamp;
```

**Tool usage statistics:**
```sql
SELECT tool_name, COUNT(*) as uses
FROM tool_uses
GROUP BY tool_name
ORDER BY uses DESC;
```

---

## Implementation Considerations

### JSONL Parsing

```python
# Python example for parsing JSONL
import json

def parse_session_file(filepath):
    events = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))
    return events
```

```typescript
// TypeScript/Bun example
import { readFileSync } from 'fs';

function parseSessionFile(filepath: string): object[] {
    const content = readFileSync(filepath, 'utf-8');
    return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
}
```

### Directory Discovery

```bash
# Find all session directories
ls -la ~/.claude/projects/

# Decode directory name (if base64)
echo "L2hvbWUvdXNlci9Qcm9qZWN0cy9teS1hcHA=" | base64 -d
# Output: /home/user/Projects/my-app
```

### Incremental Extraction

To avoid re-processing, track last extraction:

```sql
CREATE TABLE extraction_log (
    session_file TEXT PRIMARY KEY,
    last_extracted_at DATETIME,
    last_line_count INTEGER
);
```

Compare line counts to detect new content.

---

## Research Sources

1. Claude Code session storage observation (direct filesystem inspection)
2. Claude Code documentation (claude.ai/docs)
3. GitHub issue #12259 (cross-project context request)
4. SQLite FTS5 documentation (sqlite.org/fts5.html)
5. JSONL specification (jsonlines.org)

---

## Open Questions

- [ ] Exact encoding algorithm for directory names
- [ ] Session file format versioning (does format change between Claude versions?)
- [ ] Summary file structure and when they're generated
- [ ] Token count precision and billing implications
- [ ] Rate of JSONL format changes in Claude Code updates

---

*Document Status: COMPLETE*
*Last Updated: 2025-01-25*
*Author: Agent 3 (Research)*
