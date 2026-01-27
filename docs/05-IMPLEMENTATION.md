# Implementation Plan

This document details the phased implementation approach for memory-nexus, including technical specifications, code structure, and success criteria.

## Executive Summary

Memory-nexus will be built as a standalone CLI tool that integrates with the existing aidev framework. Implementation follows GSD-Lite methodology with clear phases, each delivering incremental value.

**Timeline:** 10-14 days total (after WoW v8.0 completion)
**Approach:** Incremental delivery with working software at each phase
**Integration:** aidev subcommand (`aidev memory <action>`)

---

## Database Approach

**SQLite + FTS5 + Relationship Tables** (Medium complexity)

This gives us:
- Relational queries (standard SQL)
- Full-text search (FTS5)
- Graph-like traversal (links table)

Without requiring:
- External graph database (Neo4j)
- Vector embeddings (can add in Phase 4 if needed)

---

## Implementation Phases

### Phase 1: MVP (Estimated: 3-5 days with GSD-Lite)

**Goal:** Basic extraction + search working

**Tasks:**
- [ ] JSONL parser (read session files)
- [ ] SQLite database creation with schema
- [ ] FTS5 message indexing
- [ ] Basic CLI: `aidev memory sync`
- [ ] Basic CLI: `aidev memory search "query"`
- [ ] Basic entity extraction (project names, file paths mentioned)
- [ ] Create links between sessions and projects

**Success Criteria:**
- Can sync all sessions to database
- Can search across all conversations
- Returns relevant results with context
- Zero data loss during extraction
- Search returns results in < 500ms for typical queries
- Sessions linked to mentioned projects

**Deliverables:**
```
src/parser/jsonl-parser.js    # Session file parsing
src/parser/entity-extractor.js # Extract projects, files from content
src/db/schema.sql             # Database schema
src/db/database.js            # SQLite operations
src/db/links.js               # Relationship management
src/search/search.js          # FTS5 query execution
src/cli/memory-command.js     # CLI entry point
tests/parser.test.js          # Parser tests
tests/database.test.js        # Database tests
tests/entity-extractor.test.js # Entity extraction tests
```

---

### Phase 2: Enhanced Search (Estimated: 2-3 days)

**Goal:** Better search UX and filtering

**Tasks:**
- [ ] Project filtering: `--project wow-system`
- [ ] Date filtering: `--since 2026-01-01`
- [ ] Role filtering: `--role user` or `--role assistant`
- [ ] Context display: Show surrounding messages
- [ ] Result ranking improvements
- [ ] Pagination: `--limit 20 --offset 0`
- [ ] `aidev memory related <id>` - Find related sessions/topics
- [ ] Topic extraction and linking
- [ ] Cross-project relationship queries

**Success Criteria:**
- Filters work correctly and can be combined
- Context shows 2 messages before/after match
- Results sorted by relevance with date as secondary
- Large result sets paginate cleanly
- Related command returns meaningful connections

**Deliverables:**
```
src/search/filters.js         # Filter implementation
src/search/ranking.js         # Result ranking logic
src/search/related.js         # Related content queries
src/parser/topic-extractor.js # Topic extraction from content
src/cli/search-options.js     # CLI option parsing
src/cli/related-command.js    # Related subcommand
tests/filters.test.js         # Filter tests
tests/ranking.test.js         # Ranking tests
tests/related.test.js         # Related query tests
tests/topic-extractor.test.js # Topic extraction tests
```

---

### Phase 3: Automation (Estimated: 2-3 days)

**Goal:** Automatic extraction without manual sync

**Tasks:**
- [ ] Claude Code hook for post-session extraction
- [ ] Incremental sync (only new content)
- [ ] Background processing (non-blocking)
- [ ] Notification on sync complete
- [ ] Session change detection (file mtime tracking)

**Success Criteria:**
- Sessions auto-extracted after Claude Code exits
- Only new/changed sessions processed
- No impact on Claude Code performance
- User notified when new content available

**Deliverables:**
```
hooks/post-session-sync.sh    # Claude Code hook
src/sync/incremental.js       # Incremental sync logic
src/sync/watcher.js           # File change detection
config/memory-nexus.json      # Configuration file
tests/incremental.test.js     # Incremental sync tests
```

---

### Phase 4: Advanced Features (Future - Defer Until Needed)

**Goal:** Enhanced capabilities for power users

**Tasks:**
- [ ] Semantic search with embeddings (optional)
- [ ] Topic clustering and tagging
- [ ] Export to markdown (`aidev memory export`)
- [ ] Web UI for browsing (Electron or local server)
- [ ] Statistics and analytics
- [ ] Cross-conversation threading

**Success Criteria:**
- Deferred - define when Phase 3 complete

---

## Technology Choices

| Component | Choice | Reason |
|-----------|--------|--------|
| Database | SQLite | Embedded, no server, portable, ACID-compliant |
| Search | FTS5 | Built into SQLite, fast BM25 ranking, good enough |
| Language | Node.js | Matches aidev patterns, good SQLite bindings |
| CLI Framework | Commander.js | Already used in aidev ecosystem |
| SQLite Binding | better-sqlite3 | Synchronous API, better performance than sqlite3 |

### Why SQLite + FTS5?

**Alternatives Considered:**

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| PostgreSQL | Powerful FTS | Requires server setup | Rejected - overkill |
| Elasticsearch | Best search | Complex, resource heavy | Rejected - overkill |
| SQLite + FTS5 | Simple, portable, fast | Limited ranking | **Selected** |
| Plain files + grep | Simplest | Slow at scale | Rejected - too slow |
| Vector DB (Pinecone) | Semantic search | External dependency, cost | Deferred to Phase 4 |

**FTS5 is sufficient because:**
1. Conversations are already well-structured text
2. Keyword search handles 90%+ of use cases
3. BM25 ranking provides good relevance
4. No external dependencies or costs
5. Can add embeddings later if needed

---

## File Structure (Proposed)

```
~/Projects/memory-nexus/
├── docs/
│   ├── SCRATCHPAD.md
│   ├── 01-VISION.md
│   ├── 02-RESEARCH.md
│   ├── 03-DECISION-JOURNEY.md
│   ├── 04-ARCHITECTURE.md
│   └── 05-IMPLEMENTATION.md
├── src/
│   ├── parser/
│   │   ├── jsonl-parser.js       # Parse session JSONL files
│   │   ├── event-extractor.js    # Extract relevant events
│   │   ├── entity-extractor.js   # Extract projects, files, topics
│   │   ├── topic-extractor.js    # Extract topics from content
│   │   └── path-decoder.js       # Decode encoded directory paths
│   ├── db/
│   │   ├── schema.sql            # Database schema (FTS5)
│   │   ├── database.js           # SQLite operations
│   │   ├── links.js              # Relationship management
│   │   ├── migrations/           # Schema migrations
│   │   │   └── 001-initial.sql
│   │   └── indexes.js            # Index management
│   ├── search/
│   │   ├── search.js             # FTS5 query execution
│   │   ├── filters.js            # Query filters
│   │   ├── ranking.js            # Result ranking
│   │   ├── related.js            # Related content queries
│   │   └── formatter.js          # Output formatting
│   ├── sync/
│   │   ├── full-sync.js          # Full database sync
│   │   ├── incremental.js        # Incremental sync
│   │   └── watcher.js            # File change detection
│   └── cli/
│       ├── memory-command.js     # Main CLI entry
│       ├── sync-command.js       # Sync subcommand
│       ├── search-command.js     # Search subcommand
│       ├── related-command.js    # Related subcommand
│       └── stats-command.js      # Statistics subcommand
├── hooks/
│   └── post-session-sync.sh      # Claude Code hook
├── config/
│   └── memory-nexus.json         # Default configuration
├── tests/
│   ├── fixtures/
│   │   ├── sample-session.jsonl
│   │   └── sample-events.json
│   ├── parser.test.js
│   ├── entity-extractor.test.js
│   ├── topic-extractor.test.js
│   ├── database.test.js
│   ├── links.test.js
│   ├── search.test.js
│   ├── related.test.js
│   └── sync.test.js
├── bin/
│   └── memory-nexus              # CLI entry point (symlink or script)
├── data/                         # Default data directory
│   └── .gitkeep
├── package.json
├── CLAUDE.md
├── README.md
└── VERSION
```

---

## Database Schema

### Core Tables

```sql
-- schema.sql

-- Sessions table (one per JSONL file)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,           -- Original session UUID
    project_path TEXT NOT NULL,                -- Decoded project path
    project_name TEXT,                         -- Extracted project name
    started_at DATETIME,
    ended_at DATETIME,
    message_count INTEGER DEFAULT 0,
    file_path TEXT NOT NULL,                   -- Source JSONL path
    file_mtime INTEGER,                        -- For incremental sync
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table (one per conversation turn)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    message_uuid TEXT,                         -- Original message UUID if present
    role TEXT NOT NULL,                        -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,                     -- Full message content
    timestamp DATETIME,
    turn_number INTEGER,                       -- Position in conversation
    parent_message_id INTEGER,                 -- For threading (optional)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Relationship table for graph-like queries
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,                 -- 'session', 'message', 'topic', 'project'
    source_id TEXT NOT NULL,                   -- ID of the source entity
    target_type TEXT NOT NULL,                 -- 'session', 'message', 'topic', 'project', 'file'
    target_id TEXT NOT NULL,                   -- ID of the target entity
    relationship TEXT NOT NULL,                -- 'mentions', 'related_to', 'part_of', 'references'
    weight REAL DEFAULT 1.0,                   -- Relationship strength (for ranking)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Topics table for extracted topics/concepts
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,                 -- Topic name (normalized)
    display_name TEXT,                         -- Human-readable name
    occurrence_count INTEGER DEFAULT 1,        -- How often this topic appears
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    role,
    project_name,
    content=messages,
    content_rowid=id,
    tokenize='porter unicode61'                -- Stemming + unicode support
);

-- Triggers to keep FTS index synchronized
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content, role, project_name)
    SELECT NEW.id, NEW.content, NEW.role,
           (SELECT project_name FROM sessions WHERE id = NEW.session_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, role, project_name)
    VALUES('delete', OLD.id, OLD.content, OLD.role,
           (SELECT project_name FROM sessions WHERE id = OLD.session_id));
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, role, project_name)
    VALUES('delete', OLD.id, OLD.content, OLD.role,
           (SELECT project_name FROM sessions WHERE id = OLD.session_id));
    INSERT INTO messages_fts(rowid, content, role, project_name)
    SELECT NEW.id, NEW.content, NEW.role,
           (SELECT project_name FROM sessions WHERE id = NEW.session_id);
END;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_links_relationship ON links(relationship);
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);

-- Metadata table for sync state
CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Code Examples

### JSONL Parser

```javascript
// src/parser/jsonl-parser.js
const fs = require('fs');
const readline = require('readline');

/**
 * Parse a Claude Code session JSONL file
 * @param {string} filePath - Path to JSONL file
 * @returns {AsyncGenerator<Object>} Parsed events
 */
async function* parseSessionFile(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineNumber = 0;
    for await (const line of rl) {
        lineNumber++;
        if (!line.trim()) continue;

        try {
            const event = JSON.parse(line);
            yield { ...event, _lineNumber: lineNumber };
        } catch (error) {
            console.warn(`Parse error at line ${lineNumber}: ${error.message}`);
        }
    }
}

/**
 * Extract messages from session events
 * @param {AsyncGenerator<Object>} events - Parsed JSONL events
 * @returns {Array<Object>} Extracted messages
 */
async function extractMessages(events) {
    const messages = [];
    let turnNumber = 0;

    for await (const event of events) {
        if (event.type === 'user' || event.type === 'assistant') {
            turnNumber++;
            messages.push({
                role: event.type,
                content: extractContent(event),
                timestamp: event.timestamp || null,
                turnNumber,
                uuid: event.uuid || null
            });
        }
    }

    return messages;
}

/**
 * Extract text content from various event formats
 */
function extractContent(event) {
    // Handle different content structures
    if (typeof event.content === 'string') {
        return event.content;
    }
    if (Array.isArray(event.content)) {
        return event.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');
    }
    if (event.message?.content) {
        return extractContent({ content: event.message.content });
    }
    return JSON.stringify(event);
}

module.exports = { parseSessionFile, extractMessages, extractContent };
```

### Search Implementation

```javascript
// src/search/search.js
const Database = require('better-sqlite3');

class SearchEngine {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
    }

    /**
     * Search messages using FTS5
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Array<Object>} Search results with context
     */
    search(query, options = {}) {
        const {
            project = null,
            role = null,
            since = null,
            until = null,
            limit = 20,
            offset = 0,
            contextLines = 2
        } = options;

        // Build FTS5 query with filters
        let sql = `
            SELECT
                m.id,
                m.content,
                m.role,
                m.timestamp,
                m.turn_number,
                s.project_name,
                s.session_id,
                s.started_at as session_date,
                bm25(messages_fts) as rank,
                highlight(messages_fts, 0, '<mark>', '</mark>') as highlighted
            FROM messages_fts
            JOIN messages m ON messages_fts.rowid = m.id
            JOIN sessions s ON m.session_id = s.id
            WHERE messages_fts MATCH ?
        `;

        const params = [this.buildFtsQuery(query)];

        if (project) {
            sql += ` AND s.project_name = ?`;
            params.push(project);
        }
        if (role) {
            sql += ` AND m.role = ?`;
            params.push(role);
        }
        if (since) {
            sql += ` AND m.timestamp >= ?`;
            params.push(since);
        }
        if (until) {
            sql += ` AND m.timestamp <= ?`;
            params.push(until);
        }

        sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const results = this.db.prepare(sql).all(...params);

        // Add context if requested
        if (contextLines > 0) {
            return results.map(r => ({
                ...r,
                context: this.getContext(r.session_id, r.turn_number, contextLines)
            }));
        }

        return results;
    }

    /**
     * Build FTS5 query string
     * Handles phrase queries, boolean operators, etc.
     */
    buildFtsQuery(query) {
        // If already quoted, use as-is (phrase search)
        if (query.startsWith('"') && query.endsWith('"')) {
            return query;
        }
        // Otherwise, use prefix matching for better recall
        return query.split(/\s+/)
            .map(term => `"${term}"*`)
            .join(' ');
    }

    /**
     * Get surrounding messages for context
     */
    getContext(sessionId, turnNumber, lines) {
        const sql = `
            SELECT role, content, turn_number
            FROM messages
            WHERE session_id = ?
              AND turn_number BETWEEN ? AND ?
            ORDER BY turn_number
        `;
        return this.db.prepare(sql).all(
            sessionId,
            turnNumber - lines,
            turnNumber + lines
        );
    }

    /**
     * Find related sessions/topics by ID
     * @param {string} id - Session or message ID
     * @param {string} type - 'session' or 'message'
     * @returns {Array<Object>} Related items
     */
    findRelated(id, type = 'session') {
        // Find directly linked items
        const directLinks = this.db.prepare(`
            SELECT
                l.target_type,
                l.target_id,
                l.relationship,
                l.weight
            FROM links l
            WHERE l.source_type = ? AND l.source_id = ?
            ORDER BY l.weight DESC
            LIMIT 20
        `).all(type, id);

        // Find items linked to the same targets (2-hop connections)
        const indirectLinks = this.db.prepare(`
            SELECT
                l2.source_type,
                l2.source_id,
                l1.relationship,
                COUNT(*) as shared_links,
                SUM(l1.weight * l2.weight) as combined_weight
            FROM links l1
            JOIN links l2 ON l1.target_type = l2.target_type
                         AND l1.target_id = l2.target_id
            WHERE l1.source_type = ? AND l1.source_id = ?
              AND NOT (l2.source_type = ? AND l2.source_id = ?)
            GROUP BY l2.source_type, l2.source_id
            ORDER BY combined_weight DESC
            LIMIT 20
        `).all(type, id, type, id);

        return { directLinks, indirectLinks };
    }

    /**
     * Get search statistics
     */
    getStats() {
        return {
            totalSessions: this.db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
            totalMessages: this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
            totalLinks: this.db.prepare('SELECT COUNT(*) as count FROM links').get().count,
            totalTopics: this.db.prepare('SELECT COUNT(*) as count FROM topics').get().count,
            projectCount: this.db.prepare('SELECT COUNT(DISTINCT project_name) as count FROM sessions').get().count,
            oldestSession: this.db.prepare('SELECT MIN(started_at) as date FROM sessions').get().date,
            newestSession: this.db.prepare('SELECT MAX(started_at) as date FROM sessions').get().date
        };
    }

    close() {
        this.db.close();
    }
}

module.exports = SearchEngine;
```

### CLI Integration

```javascript
// src/cli/memory-command.js
const { Command } = require('commander');
const chalk = require('chalk');
const SearchEngine = require('../search/search');
const { syncAll, syncIncremental } = require('../sync/full-sync');

const program = new Command();

program
    .name('memory')
    .description('Search and manage Claude Code conversation history')
    .version('0.1.0');

program
    .command('sync')
    .description('Synchronize session files to database')
    .option('-f, --full', 'Force full resync (ignore incremental)')
    .option('-v, --verbose', 'Show detailed progress')
    .action(async (options) => {
        console.log(chalk.cyan('Syncing Claude Code sessions...'));

        const stats = options.full
            ? await syncAll({ verbose: options.verbose })
            : await syncIncremental({ verbose: options.verbose });

        console.log(chalk.green(`Synced ${stats.newSessions} new sessions`));
        console.log(chalk.green(`Indexed ${stats.newMessages} new messages`));
        console.log(chalk.green(`Created ${stats.newLinks} new links`));
    });

program
    .command('search <query>')
    .description('Search across all conversations')
    .option('-p, --project <name>', 'Filter by project name')
    .option('-r, --role <role>', 'Filter by role (user/assistant)')
    .option('--since <date>', 'Filter messages after date (YYYY-MM-DD)')
    .option('--until <date>', 'Filter messages before date')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .option('-c, --context <n>', 'Context lines around match', '2')
    .option('--no-highlight', 'Disable highlighting')
    .action((query, options) => {
        const engine = new SearchEngine(getDbPath());

        const results = engine.search(query, {
            project: options.project,
            role: options.role,
            since: options.since,
            until: options.until,
            limit: parseInt(options.limit),
            contextLines: parseInt(options.context)
        });

        if (results.length === 0) {
            console.log(chalk.yellow('No results found.'));
            return;
        }

        console.log(chalk.cyan(`Found ${results.length} results:\n`));

        results.forEach((result, i) => {
            console.log(chalk.dim(`--- Result ${i + 1} ---`));
            console.log(chalk.blue(`Project: ${result.project_name}`));
            console.log(chalk.dim(`Date: ${result.session_date}`));
            console.log(chalk.dim(`Role: ${result.role}`));
            console.log('');
            console.log(options.highlight !== false
                ? formatHighlight(result.highlighted)
                : result.content.substring(0, 500));
            console.log('');
        });

        engine.close();
    });

program
    .command('related <id>')
    .description('Find related sessions/topics')
    .option('-t, --type <type>', 'Entity type (session/message)', 'session')
    .action((id, options) => {
        const engine = new SearchEngine(getDbPath());
        const related = engine.findRelated(id, options.type);

        console.log(chalk.cyan(`Related to ${options.type} ${id}:\n`));

        if (related.directLinks.length > 0) {
            console.log(chalk.blue('Direct Links:'));
            related.directLinks.forEach(link => {
                console.log(`  ${link.relationship} -> ${link.target_type}:${link.target_id} (weight: ${link.weight})`);
            });
        }

        if (related.indirectLinks.length > 0) {
            console.log(chalk.blue('\nIndirect Links (shared connections):'));
            related.indirectLinks.forEach(link => {
                console.log(`  ${link.source_type}:${link.source_id} (${link.shared_links} shared, weight: ${link.combined_weight.toFixed(2)})`);
            });
        }

        engine.close();
    });

program
    .command('stats')
    .description('Show database statistics')
    .action(() => {
        const engine = new SearchEngine(getDbPath());
        const stats = engine.getStats();

        console.log(chalk.cyan('Memory Nexus Statistics\n'));
        console.log(`Total Sessions:  ${chalk.green(stats.totalSessions)}`);
        console.log(`Total Messages:  ${chalk.green(stats.totalMessages)}`);
        console.log(`Total Links:     ${chalk.green(stats.totalLinks)}`);
        console.log(`Total Topics:    ${chalk.green(stats.totalTopics)}`);
        console.log(`Projects:        ${chalk.green(stats.projectCount)}`);
        console.log(`Date Range:      ${stats.oldestSession} to ${stats.newestSession}`);

        engine.close();
    });

function getDbPath() {
    return process.env.MEMORY_NEXUS_DB ||
           `${process.env.HOME}/.memory-nexus/memory.db`;
}

function formatHighlight(text) {
    return text
        .replace(/<mark>/g, chalk.bgYellow.black(''))
        .replace(/<\/mark>/g, chalk.reset(''));
}

module.exports = program;
```

---

## Dependencies

### Production Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "commander": "^11.0.0",
    "chalk": "^5.0.0",
    "glob": "^10.0.0",
    "date-fns": "^2.30.0"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "eslint": "^8.0.0"
  }
}
```

### Dependency Rationale

| Package | Version | Purpose |
|---------|---------|---------|
| better-sqlite3 | ^9.0.0 | Synchronous SQLite with FTS5 support |
| commander | ^11.0.0 | CLI argument parsing (matches aidev) |
| chalk | ^5.0.0 | Terminal colors (matches aidev) |
| glob | ^10.0.0 | File pattern matching for session discovery |
| date-fns | ^2.30.0 | Date parsing and formatting |

---

## Testing Strategy

### Test Pyramid

```
        E2E Tests (10%)
       /              \
   Integration Tests (30%)
  /                        \
 Unit Tests (60%)
```

### Test Coverage Targets

- Statements: 95%+
- Branches: 95%+
- Functions: 95%+
- Lines: 95%+

### Test Examples

```javascript
// tests/parser.test.js
describe('JSONL Parser', () => {
    test('should parse valid JSONL file', async () => {
        const events = [];
        for await (const event of parseSessionFile('fixtures/sample.jsonl')) {
            events.push(event);
        }
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]).toHaveProperty('type');
    });

    test('should handle malformed JSON gracefully', async () => {
        const events = [];
        for await (const event of parseSessionFile('fixtures/malformed.jsonl')) {
            events.push(event);
        }
        // Should skip bad lines, not throw
        expect(events.length).toBe(2); // Only valid lines
    });

    test('should extract message content correctly', () => {
        const event = { type: 'assistant', content: 'Hello world' };
        expect(extractContent(event)).toBe('Hello world');
    });

    test('should handle array content blocks', () => {
        const event = {
            type: 'assistant',
            content: [
                { type: 'text', text: 'Part 1' },
                { type: 'text', text: 'Part 2' }
            ]
        };
        expect(extractContent(event)).toBe('Part 1\nPart 2');
    });
});

// tests/search.test.js
describe('Search Engine', () => {
    let engine;

    beforeAll(() => {
        engine = new SearchEngine(':memory:');
        // Seed test data
        seedTestData(engine.db);
    });

    afterAll(() => {
        engine.close();
    });

    test('should find exact phrase matches', () => {
        const results = engine.search('"hello world"');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].content).toContain('hello world');
    });

    test('should filter by project', () => {
        const results = engine.search('test', { project: 'wow-system' });
        results.forEach(r => {
            expect(r.project_name).toBe('wow-system');
        });
    });

    test('should respect date range filters', () => {
        const results = engine.search('*', {
            since: '2026-01-01',
            until: '2026-01-31'
        });
        results.forEach(r => {
            const date = new Date(r.timestamp);
            expect(date.getFullYear()).toBe(2026);
            expect(date.getMonth()).toBe(0); // January
        });
    });
});

// tests/links.test.js
describe('Relationship Links', () => {
    let engine;

    beforeAll(() => {
        engine = new SearchEngine(':memory:');
        seedTestDataWithLinks(engine.db);
    });

    afterAll(() => {
        engine.close();
    });

    test('should find direct links', () => {
        const related = engine.findRelated('session-1', 'session');
        expect(related.directLinks.length).toBeGreaterThan(0);
    });

    test('should find indirect links through shared connections', () => {
        const related = engine.findRelated('session-1', 'session');
        expect(related.indirectLinks.length).toBeGreaterThan(0);
    });

    test('should rank by weight', () => {
        const related = engine.findRelated('session-1', 'session');
        for (let i = 1; i < related.directLinks.length; i++) {
            expect(related.directLinks[i - 1].weight).toBeGreaterThanOrEqual(
                related.directLinks[i].weight
            );
        }
    });
});
```

---

## Configuration

### Default Configuration File

```json
// config/memory-nexus.json
{
    "database": {
        "path": "~/.memory-nexus/memory.db",
        "walMode": true
    },
    "sessions": {
        "sourcePath": "~/.claude/projects",
        "retentionDays": null
    },
    "sync": {
        "autoSync": false,
        "syncOnExit": true,
        "incrementalDefault": true,
        "extractEntities": true,
        "extractTopics": true
    },
    "search": {
        "defaultLimit": 20,
        "defaultContext": 2,
        "highlightEnabled": true
    },
    "links": {
        "minWeight": 0.1,
        "maxIndirectHops": 2
    },
    "logging": {
        "level": "info",
        "file": "~/.memory-nexus/logs/memory-nexus.log"
    }
}
```

---

## When to Build

**AFTER WoW v8.0 using validated GSD methodology**

This ensures:

1. **GSD-Lite is validated on real work first** - WoW v8.0 implementation proves the methodology works
2. **WoW v8.0 is not delayed** - Memory-nexus does not block critical WoW work
3. **Memory-nexus built with proven methodology** - Apply lessons learned from WoW
4. **Learnings from WoW inform memory-nexus design** - Any methodology adjustments are incorporated

### Build Sequence

```
WoW v8.0 Implementation (GSD-Lite validation)
          |
          v
Memory-Nexus Phase 1 (MVP)
          |
          v
Memory-Nexus Phase 2 (Enhanced Search)
          |
          v
Memory-Nexus Phase 3 (Automation)
          |
          v
Memory-Nexus Phase 4 (Future - as needed)
```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| JSONL format changes | Low | High | Version detection, graceful degradation |
| Large session files | Medium | Medium | Streaming parser, chunked processing |
| FTS5 not sufficient | Low | Medium | Deferred embeddings in Phase 4 |
| SQLite locks on concurrent access | Medium | Low | WAL mode, read-only for search |
| Encoded path decoding fails | Low | High | Fallback to raw path, manual mapping |

---

## Success Metrics

### Phase 1 Success

- [ ] Can sync 100+ sessions without errors
- [ ] Search returns results in < 500ms
- [ ] Zero data loss during extraction
- [ ] All tests passing (95%+ coverage)
- [ ] Sessions linked to mentioned projects

### Phase 2 Success

- [ ] Filters work correctly in combination
- [ ] Context display is useful
- [ ] Search relevance is acceptable (spot-check 10 queries)
- [ ] Related command returns meaningful connections
- [ ] Cross-project queries work

### Phase 3 Success

- [ ] Auto-sync happens without user intervention
- [ ] No duplicate messages on repeated sync
- [ ] Claude Code startup not noticeably slower

### Overall Success

- [ ] User can find "that conversation from last week" reliably
- [ ] Cross-project context is accessible
- [ ] Memory-nexus is actually used in daily workflow
