# Architecture Research

**Project:** memory-nexus (Claude Code Session Extraction and Search)
**Research Date:** 2026-01-27
**Confidence:** HIGH (well-documented existing design + verified patterns)

## Component Overview

| Component | Responsibility | Dependencies |
|-----------|----------------|--------------|
| **Session Discoverer** | Locate JSONL files in `~/.claude/projects/` | Filesystem, glob patterns |
| **Path Decoder** | Decode encoded directory names to project paths | Pure function, no external deps |
| **JSONL Parser** | Stream-parse session files line-by-line | Node.js readline/streams |
| **Event Classifier** | Categorize parsed events by type | Parser output |
| **Content Normalizer** | Standardize timestamps, extract text | Classifier output |
| **Entity Extractor** | Extract projects, files, topics from content | Normalizer output |
| **Database Manager** | SQLite connection, schema, migrations | better-sqlite3 |
| **Session Writer** | Persist session metadata | Database Manager |
| **Message Writer** | Persist messages with FTS5 indexing | Database Manager, Session Writer |
| **Link Manager** | Create/query relationship links | Database Manager |
| **Query Builder** | Construct FTS5 MATCH clauses | None (pure function) |
| **Search Engine** | Execute queries, rank results | Database Manager, Query Builder |
| **Result Formatter** | Format output for CLI display | Search results |
| **Sync Coordinator** | Orchestrate extraction pipeline | All extraction components |
| **CLI Handler** | Parse commands, dispatch to services | All query components |

## Layer Mapping (Hexagonal Architecture)

The project MUST follow hexagonal architecture per user's WoW standards. Here is the recommended mapping:

### Domain Layer (Pure Business Logic)

**Location:** `src/domain/`

**Contains:**
- **Entities:**
  - `Session` - Session metadata with ID, project path, timestamps, message counts
  - `Message` - Conversation turn with role, content, timestamp
  - `ToolUse` - Tool invocation record
  - `Link` - Relationship between entities (source, target, relationship type, weight)
  - `Topic` - Extracted topic/concept
  - `ExtractionState` - Sync tracking state

- **Value Objects:**
  - `ProjectPath` - Validated project path with encoding/decoding
  - `SessionId` - UUID or agent-format session identifier
  - `Timestamp` - ISO 8601 normalized timestamp
  - `SearchQuery` - Parsed search query with filters
  - `SearchResult` - Search match with ranking info

- **Ports (Interfaces):**
  - `ISessionRepository` - Persist/retrieve sessions
  - `IMessageRepository` - Persist/retrieve messages
  - `ILinkRepository` - Manage relationships
  - `ISearchService` - Execute full-text searches
  - `ISessionSource` - Read session files (filesystem abstraction)
  - `IEventParser` - Parse JSONL events

- **Domain Services:**
  - `PathDecoder` - Decode encoded directory paths
  - `ContentExtractor` - Extract text from various event formats
  - `QueryParser` - Parse search query strings into structured queries

**Dependency Rule:** ZERO external dependencies. No SQLite, no fs, no Commander.

### Application Layer (Use Cases)

**Location:** `src/application/`

**Contains:**
- **Commands (Write Operations):**
  - `SyncAllSessionsCommand` - Full sync of all sessions
  - `SyncSessionCommand` - Sync specific session by ID
  - `SyncProjectCommand` - Sync sessions for specific project
  - `ForceSyncCommand` - Re-extract ignoring incremental state

- **Queries (Read Operations):**
  - `SearchMessagesQuery` - Full-text search with filters
  - `GetSessionContextQuery` - Retrieve context for a project
  - `FindRelatedQuery` - Find related sessions/topics
  - `GetStatsQuery` - Database statistics

- **Application Services:**
  - `ExtractionOrchestrator` - Coordinate discovery -> extraction -> storage pipeline
  - `IncrementalSyncService` - Track and apply incremental updates

**Dependency Rule:** Only imports from Domain layer. Uses ports, not implementations.

### Infrastructure Layer (Adapters)

**Location:** `src/infrastructure/`

**Contains:**
- **Database Adapters:**
  - `SqliteSessionRepository` - Implements `ISessionRepository` using better-sqlite3
  - `SqliteMessageRepository` - Implements `IMessageRepository` with FTS5
  - `SqliteLinkRepository` - Implements `ILinkRepository`
  - `Fts5SearchService` - Implements `ISearchService` using FTS5 MATCH

- **Filesystem Adapters:**
  - `FileSystemSessionSource` - Implements `ISessionSource` using fs/glob
  - `JsonlEventParser` - Implements `IEventParser` for JSONL streaming

- **Database Infrastructure:**
  - `DatabaseConnection` - SQLite connection management (WAL mode, pragmas)
  - `SchemaManager` - Schema creation and migrations
  - `FtsIndexManager` - FTS5 trigger and index management

- **Hook Integration:**
  - `ClaudeCodeHookHandler` - Handle SessionStop hook invocations

**Dependency Rule:** Implements Domain ports. Contains all external library usage.

### Presentation Layer (CLI)

**Location:** `src/presentation/` or `src/cli/`

**Contains:**
- **Command Handlers:**
  - `SyncCommandHandler` - `aidev memory sync` command
  - `SearchCommandHandler` - `aidev memory search` command
  - `ContextCommandHandler` - `aidev memory context` command
  - `RelatedCommandHandler` - `aidev memory related` command
  - `StatsCommandHandler` - `aidev memory stats` command

- **Output Formatters:**
  - `SearchResultFormatter` - Format search results with highlighting
  - `StatsFormatter` - Format statistics display
  - `ProgressReporter` - Show sync progress (optional)

- **CLI Framework:**
  - `MemoryCommand` - Commander.js program definition
  - `OptionParser` - Parse and validate CLI options

**Dependency Rule:** Only calls Application layer use cases. Thin layer, no business logic.

### Composition Root

**Location:** `src/main.ts` or `src/index.ts`

**Purpose:** Wire up all dependencies (dependency injection)

```typescript
// Pseudocode - composition root
const dbConnection = new DatabaseConnection(dbPath);
const schemaManager = new SchemaManager(dbConnection);
await schemaManager.ensureSchema();

// Infrastructure adapters
const sessionRepo = new SqliteSessionRepository(dbConnection);
const messageRepo = new SqliteMessageRepository(dbConnection);
const linkRepo = new SqliteLinkRepository(dbConnection);
const searchService = new Fts5SearchService(dbConnection);
const sessionSource = new FileSystemSessionSource(claudeProjectsPath);
const eventParser = new JsonlEventParser();

// Application services
const orchestrator = new ExtractionOrchestrator(
  sessionSource, eventParser, sessionRepo, messageRepo, linkRepo
);
const syncCommand = new SyncAllSessionsCommand(orchestrator);
const searchQuery = new SearchMessagesQuery(searchService);

// Presentation handlers
const syncHandler = new SyncCommandHandler(syncCommand);
const searchHandler = new SearchCommandHandler(searchQuery);

// CLI wiring
const cli = new MemoryCommand(syncHandler, searchHandler, ...);
```

## Data Flow

### Sync Flow (Discovery to Storage)

```
1. CLI receives "aidev memory sync" command
   |
   v
2. SyncCommandHandler calls SyncAllSessionsCommand.execute()
   |
   v
3. ExtractionOrchestrator begins pipeline:
   |
   +---> 3a. ISessionSource.discoverSessions()
   |          - Glob ~/.claude/projects/*/*.jsonl
   |          - Return list of session file paths
   |
   +---> 3b. For each session file:
   |          |
   |          v
   |     3b1. Check ISessionRepository for extraction state
   |          - If unchanged (mtime, size), skip
   |          |
   |          v
   |     3b2. IEventParser.parseStream(filePath)
   |          - Stream JSONL lines
   |          - Yield parsed event objects
   |          |
   |          v
   |     3b3. Domain services classify and normalize events
   |          - PathDecoder.decode(encodedPath)
   |          - ContentExtractor.extractText(event)
   |          - EntityExtractor.extractMentions(content)
   |          |
   |          v
   |     3b4. ISessionRepository.upsert(session)
   |          IMessageRepository.insertBatch(messages)
   |          ILinkRepository.createLinks(relationships)
   |          |
   |          v
   |     3b5. Update extraction state for incremental sync
   |
   v
4. Return extraction summary to CLI
   |
   v
5. SyncCommandHandler formats and displays result
```

### Query Flow (Search)

```
1. CLI receives "aidev memory search 'query' --project wow-system"
   |
   v
2. SearchCommandHandler parses options, creates SearchQuery value object
   |
   v
3. SearchMessagesQuery.execute(searchQuery)
   |
   v
4. ISearchService.search(query, filters)
   |
   +---> 4a. QueryBuilder constructs FTS5 MATCH clause
   |          - Handle phrase queries, boolean operators
   |          - Add project/role/date filters as WHERE clauses
   |
   +---> 4b. Execute SQLite query with BM25 ranking
   |
   +---> 4c. Return SearchResult[] with highlights
   |
   v
5. SearchCommandHandler formats results
   |
   +---> 5a. Highlight matched terms
   +---> 5b. Show context (surrounding messages if requested)
   +---> 5c. Display project/date metadata
   |
   v
6. Output to terminal
```

### Related Query Flow

```
1. CLI receives "aidev memory related session-123"
   |
   v
2. RelatedCommandHandler calls FindRelatedQuery.execute("session-123", "session")
   |
   v
3. ILinkRepository.findDirectLinks(sourceType, sourceId)
   |
   +---> Returns directly linked entities (topics, projects, other sessions)
   |
   v
4. ILinkRepository.findIndirectLinks(sourceType, sourceId)
   |
   +---> 2-hop query: find entities sharing common targets
   |     (e.g., sessions linked to same topics)
   |
   v
5. Rank by weight and return
   |
   v
6. RelatedCommandHandler formats grouped output
```

## Build Order Recommendation

Based on dependency analysis and incremental value delivery:

### Phase 1: Core Domain + Basic Extraction (Build First)

**Why First:** Domain layer has no dependencies, establishes contracts for everything else.

1. **Domain Entities and Value Objects** (Day 1)
   - Session, Message, ToolUse, Link entities
   - ProjectPath, SessionId, Timestamp value objects
   - Pure TypeScript, 100% unit testable

2. **Domain Ports (Interfaces)** (Day 1)
   - ISessionRepository, IMessageRepository, ISearchService, ISessionSource
   - Contracts that Infrastructure will implement

3. **Domain Services** (Day 1-2)
   - PathDecoder - decode encoded directory names
   - ContentExtractor - extract text from event structures
   - Pure functions, easily testable

### Phase 2: Infrastructure Adapters (Build Second)

**Why Second:** Implements ports, enables real data flow.

4. **Database Infrastructure** (Day 2-3)
   - DatabaseConnection with WAL mode
   - SchemaManager with migrations
   - FTS5 table and trigger setup

5. **Repository Implementations** (Day 3-4)
   - SqliteSessionRepository
   - SqliteMessageRepository (with FTS5)
   - SqliteLinkRepository

6. **Filesystem Adapters** (Day 4)
   - FileSystemSessionSource (glob, file stats)
   - JsonlEventParser (streaming readline)

### Phase 3: Application Layer (Build Third)

**Why Third:** Orchestrates domain + infrastructure.

7. **Extraction Orchestrator** (Day 4-5)
   - Pipeline coordination
   - Incremental sync logic

8. **Commands and Queries** (Day 5)
   - SyncAllSessionsCommand
   - SearchMessagesQuery
   - FindRelatedQuery
   - GetStatsQuery

### Phase 4: Presentation Layer (Build Last)

**Why Last:** Depends on all other layers being ready.

9. **CLI Command Handlers** (Day 5-6)
   - SyncCommandHandler
   - SearchCommandHandler
   - StatsCommandHandler

10. **Output Formatters** (Day 6)
    - Search result highlighting
    - Statistics display

11. **Composition Root** (Day 6)
    - Wire up dependency injection
    - CLI entry point

### Phase 5: Automation (After MVP)

12. **Hook Integration** (Day 7+)
    - ClaudeCodeHookHandler
    - Quiet mode for non-interactive sync

## Integration Points

### External Dependencies

| Dependency | Layer | Purpose | Version |
|------------|-------|---------|---------|
| better-sqlite3 | Infrastructure | SQLite database binding | ^9.0.0 |
| Commander.js | Presentation | CLI framework | ^11.0.0 |
| chalk | Presentation | Terminal colors | ^5.0.0 |
| glob | Infrastructure | File pattern matching | ^10.0.0 |

### Internal Integration Points

| Integration | From | To | Interface |
|-------------|------|-----|-----------|
| File Discovery | Infrastructure | Application | ISessionSource |
| Event Parsing | Infrastructure | Application | IEventParser |
| Session Storage | Application | Infrastructure | ISessionRepository |
| Message Storage | Application | Infrastructure | IMessageRepository |
| Search Execution | Application | Infrastructure | ISearchService |
| CLI Commands | Presentation | Application | Command/Query classes |

### External System Integration

| System | Integration Type | Notes |
|--------|------------------|-------|
| Claude Code Sessions | File read | `~/.claude/projects/*/*.jsonl` |
| aidev CLI | Subcommand registration | `aidev memory <command>` |
| Claude Code Hooks | Shell script invocation | SessionStop hook |
| Filesystem | Read-only (sessions), Read-write (database) | User home directory |

## Anti-Patterns to Avoid

Based on hexagonal architecture principles:

### 1. Database Logic in Domain

```typescript
// WRONG: Domain knows about SQLite
class Session {
  async save(db: Database) {
    await db.run('INSERT INTO sessions...');
  }
}

// CORRECT: Domain uses port
class SyncCommand {
  constructor(private sessionRepo: ISessionRepository) {}
  async execute() {
    await this.sessionRepo.save(session);
  }
}
```

### 2. Business Logic in Infrastructure

```typescript
// WRONG: Repository contains business rules
class SqliteSessionRepository {
  async sync(file: string) {
    if (this.isSessionTooOld(file)) return; // Business rule!
    // ...
  }
}

// CORRECT: Business logic in Application layer
class SyncCommand {
  async execute() {
    if (this.shouldSkip(session)) return; // Business rule here
    await this.sessionRepo.save(session);
  }
}
```

### 3. Framework Code in Application

```typescript
// WRONG: Application knows about Commander
class SearchQuery {
  async execute(args: commander.Command) {
    // ...
  }
}

// CORRECT: Application uses domain types
class SearchQuery {
  async execute(query: SearchQuery): Promise<SearchResult[]> {
    // ...
  }
}
```

### 4. CLI Doing Business Logic

```typescript
// WRONG: CLI handler has business logic
function handleSearch(query) {
  if (query.length < 3) throw new Error('Too short'); // Validation belongs in domain
  const results = db.query(...); // Direct DB access
}

// CORRECT: CLI delegates to application
function handleSearch(query) {
  const searchQuery = new SearchMessagesQuery(searchService);
  return searchQuery.execute(new SearchQuery(query, options));
}
```

## Streaming and Performance Considerations

### Large File Handling

Session files can grow to 10,000+ lines. Architecture must support:

1. **Streaming Parser** - Never load entire file into memory
   ```typescript
   interface IEventParser {
     parseStream(filePath: string): AsyncGenerator<ParsedEvent>;
   }
   ```

2. **Batch Database Writes** - Buffer inserts, commit in batches
   ```typescript
   interface IMessageRepository {
     insertBatch(messages: Message[], batchSize?: number): Promise<void>;
   }
   ```

3. **Incremental State** - Track position for resume
   ```typescript
   interface ISessionRepository {
     getExtractionState(sessionFile: string): Promise<ExtractionState | null>;
     updateExtractionState(state: ExtractionState): Promise<void>;
   }
   ```

### Query Performance

1. **FTS5 Optimization** - Run `optimize` after bulk inserts
2. **Covering Indexes** - Index common filter combinations
3. **Result Limits** - Always paginate results

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Hexagonal Layer Mapping | HIGH | Well-documented user standard, clear application |
| Component Boundaries | HIGH | Existing docs define clear responsibilities |
| Data Flow | HIGH | Documented in existing ARCHITECTURE.md |
| Build Order | HIGH | Follows dependency direction (Domain first) |
| Integration Points | HIGH | External deps already chosen in existing docs |
| Streaming Patterns | MEDIUM | Verified with ETL best practices, needs implementation validation |

## Sources

**Project Documentation (Primary):**
- `docs/04-ARCHITECTURE.md` - Existing system architecture
- `docs/05-IMPLEMENTATION.md` - Implementation plan with code examples
- `.planning/codebase/ARCHITECTURE.md` - Codebase analysis

**User Standards:**
- `~/.claude/rules-archive/hexagonal-architecture.md` - Hexagonal architecture requirements

**Industry Patterns:**
- [Hexagonal Architecture and Clean Architecture (with examples)](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Hexagonal vs Clean vs Onion: which one survives in 2026](https://dev.to/dev_tips/hexagonal-vs-clean-vs-onion-which-one-actually-survives-your-app-in-2026-273f)
- [Data Pipeline Architecture: 5 Design Patterns](https://dagster.io/guides/data-pipeline-architecture-5-design-patterns-with-examples)
- [ETL Architecture and Design Patterns](https://www.matillion.com/blog/etl-architecture-design-patterns-modern-data-pipelines)
- [9 Essential Data Pipeline Design Patterns](https://www.montecarlodata.com/blog-data-pipeline-design-patterns/)

---

*Architecture research complete: 2026-01-27*
