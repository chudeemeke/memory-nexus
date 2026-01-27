# Codebase Structure

**Analysis Date:** 2026-01-27

## Directory Layout

### Current State (Documentation Only)

```
memory-nexus/
├── .planning/
│   └── codebase/           # GSD codebase mapping (this file)
├── docs/
│   ├── SCRATCHPAD.md       # Documentation coordination
│   ├── 01-VISION.md        # Problem statement and vision
│   ├── 02-RESEARCH.md      # Technical research findings
│   ├── 03-DECISION-JOURNEY.md  # Design decision history
│   ├── 04-ARCHITECTURE.md  # Technical architecture
│   └── 05-IMPLEMENTATION.md    # Build plan and phases
├── src/
│   └── .gitkeep            # Placeholder for implementation
├── tests/
│   └── .gitkeep            # Placeholder for tests
└── CLAUDE.md               # Project instructions
```

### Planned Structure (From Implementation Plan)

```
memory-nexus/
├── docs/                   # Design documentation
│   ├── SCRATCHPAD.md
│   ├── 01-VISION.md
│   ├── 02-RESEARCH.md
│   ├── 03-DECISION-JOURNEY.md
│   ├── 04-ARCHITECTURE.md
│   └── 05-IMPLEMENTATION.md
├── src/
│   ├── parser/             # JSONL parsing and extraction
│   │   ├── jsonl-parser.js
│   │   ├── event-extractor.js
│   │   ├── entity-extractor.js
│   │   ├── topic-extractor.js
│   │   └── path-decoder.js
│   ├── db/                 # Database operations
│   │   ├── schema.sql
│   │   ├── database.js
│   │   ├── links.js
│   │   ├── indexes.js
│   │   └── migrations/
│   │       └── 001-initial.sql
│   ├── search/             # Query and search logic
│   │   ├── search.js
│   │   ├── filters.js
│   │   ├── ranking.js
│   │   ├── related.js
│   │   └── formatter.js
│   ├── sync/               # Synchronization logic
│   │   ├── full-sync.js
│   │   ├── incremental.js
│   │   └── watcher.js
│   └── cli/                # CLI commands
│       ├── memory-command.js
│       ├── sync-command.js
│       ├── search-command.js
│       ├── related-command.js
│       └── stats-command.js
├── hooks/                  # Claude Code hooks
│   └── post-session-sync.sh
├── config/                 # Default configuration
│   └── memory-nexus.json
├── tests/
│   ├── fixtures/           # Test data
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
├── bin/                    # CLI entry points
│   └── memory-nexus
├── data/                   # Default data directory
│   └── .gitkeep
├── package.json
├── CLAUDE.md
├── README.md
└── VERSION
```

## Directory Purposes

**docs/**
- Purpose: Design documentation and decision records
- Contains: Vision, research, architecture, implementation plans
- Key files: `04-ARCHITECTURE.md` (technical design), `05-IMPLEMENTATION.md` (build plan)

**src/parser/**
- Purpose: JSONL file parsing and data extraction
- Contains: Stream-based parser, event classifiers, entity/topic extractors
- Key files: `jsonl-parser.js` (core parser), `path-decoder.js` (decode encoded directory names)

**src/db/**
- Purpose: SQLite database operations and schema management
- Contains: Database wrapper, schema definitions, FTS5 triggers, link management
- Key files: `schema.sql` (full schema), `database.js` (operations wrapper), `links.js` (relationship management)

**src/search/**
- Purpose: Query building and result formatting
- Contains: FTS5 query construction, filters, ranking, related content finder
- Key files: `search.js` (main search engine), `related.js` (graph-like traversal queries)

**src/sync/**
- Purpose: Session synchronization logic
- Contains: Full sync, incremental sync, file change detection
- Key files: `incremental.js` (delta sync), `watcher.js` (file monitoring)

**src/cli/**
- Purpose: Command-line interface handlers
- Contains: Subcommand implementations for `aidev memory`
- Key files: `memory-command.js` (main entry), individual command files

**hooks/**
- Purpose: Claude Code hook scripts
- Contains: Post-session extraction trigger
- Key files: `post-session-sync.sh` (SessionStop hook)

**config/**
- Purpose: Default configuration templates
- Contains: JSON configuration file
- Key files: `memory-nexus.json` (default settings)

**tests/**
- Purpose: Test suites following TDD
- Contains: Unit tests, integration tests, fixtures
- Key files: Test files mirroring src/ structure

**tests/fixtures/**
- Purpose: Test data for reproducible tests
- Contains: Sample JSONL files, mock events
- Key files: `sample-session.jsonl` (realistic test data)

## Key File Locations

**Entry Points:**
- `src/cli/memory-command.js`: Main CLI entry point
- `bin/memory-nexus`: Executable symlink/script
- `hooks/post-session-sync.sh`: Claude Code hook trigger

**Configuration:**
- `config/memory-nexus.json`: Default configuration
- `~/.config/memory-nexus/config.json`: User configuration (runtime)
- `~/.config/memory-nexus/sessions.db`: Database location (runtime)

**Core Logic:**
- `src/parser/jsonl-parser.js`: JSONL stream parsing
- `src/db/database.js`: SQLite operations wrapper
- `src/search/search.js`: FTS5 query engine
- `src/db/links.js`: Relationship graph operations

**Schema:**
- `src/db/schema.sql`: Complete database schema
- `src/db/migrations/`: Schema migration files

**Testing:**
- `tests/`: All test files
- `tests/fixtures/`: Test data and mocks

## Naming Conventions

**Files:**
- Kebab-case for all source files: `jsonl-parser.js`, `entity-extractor.js`
- Test files mirror source: `parser.test.js`, `database.test.js`
- SQL files: `schema.sql`, `001-initial.sql`
- Shell scripts: `post-session-sync.sh`

**Directories:**
- Lowercase, single word when possible: `parser/`, `db/`, `search/`
- Plural for collections: `tests/`, `fixtures/`, `migrations/`
- Purpose-based naming: `sync/`, `cli/`, `hooks/`

**Exports:**
- Classes: PascalCase (`SearchEngine`, `Database`)
- Functions: camelCase (`parseSessionFile`, `extractMessages`)
- Constants: UPPER_SNAKE_CASE (`EXTRACTION_ERROR`, `SENSITIVE_PATTERNS`)

## Where to Add New Code

**New Parser Feature:**
- Implementation: `src/parser/`
- Tests: `tests/parser.test.js` or new `tests/<feature>.test.js`
- Example: New extractor goes in `src/parser/<name>-extractor.js`

**New CLI Command:**
- Implementation: `src/cli/<command>-command.js`
- Register in: `src/cli/memory-command.js`
- Tests: `tests/<command>.test.js`

**New Database Feature:**
- Schema changes: `src/db/migrations/<nnn>-<name>.sql`
- Operations: `src/db/<feature>.js`
- Tests: `tests/database.test.js` or `tests/<feature>.test.js`

**New Search Capability:**
- Implementation: `src/search/`
- Tests: `tests/search.test.js` or `tests/<feature>.test.js`

**Test Fixtures:**
- Location: `tests/fixtures/`
- Naming: `sample-<type>.jsonl` or `mock-<entity>.json`

## Special Directories

**data/**
- Purpose: Default data directory for database
- Generated: Yes (at runtime)
- Committed: Only `.gitkeep`

**.planning/**
- Purpose: GSD methodology planning documents
- Generated: By GSD commands
- Committed: Yes (documentation)

**node_modules/**
- Purpose: Package dependencies
- Generated: By `bun install`
- Committed: No (in .gitignore)

## External Data Locations

**Source Data (Claude Code Sessions):**
```
~/.claude/projects/<encoded-dir>/*.jsonl
```

**Runtime Database:**
```
~/.config/memory-nexus/sessions.db     # Primary location
~/.memory-nexus/memory.db              # Alternative location
```

**Runtime Configuration:**
```
~/.config/memory-nexus/config.json
```

**Runtime Logs:**
```
~/.memory-nexus/logs/memory-nexus.log
```

---

*Structure analysis: 2026-01-27*
