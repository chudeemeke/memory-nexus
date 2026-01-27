# Phase 1: Project Setup and Domain Entities

## Goal

Establish project foundation and pure domain layer with zero external dependencies.

## Requirements Covered

| ID | Requirement |
|----|-------------|
| SETUP-01 | Project scaffolding with Bun, TypeScript 5.5+, hexagonal architecture folder structure |
| SETUP-04 | CLI entry point with Commander.js v14 and extra-typings |
| DOM-01 | Session entity with ID, project path, timestamps, message counts |
| DOM-02 | Message entity with role, content, timestamp, session reference |
| DOM-03 | ToolUse entity with name, inputs, outputs, session reference |
| DOM-04 | Link entity with source, target, relationship type, weight |
| DOM-05 | ExtractionState entity for incremental sync tracking |
| DOM-06 | ProjectPath value object with encoding/decoding |
| DOM-07 | SearchQuery value object with query, filters, options |
| DOM-08 | SearchResult value object with ranking, snippets, highlights |
| DOM-10 | PathDecoder domain service for encoded directory path decoding |
| DOM-11 | ContentExtractor domain service for text extraction from events |
| DOM-12 | QueryParser domain service for search query parsing |

## Success Criteria

1. User can run `bun test` and all domain entity unit tests pass
2. Domain layer has zero imports from external packages (pure TypeScript only)
3. All value objects are immutable and validate on construction
4. PathDecoder correctly handles encoded directory names from ~/.claude/projects/
5. Project structure matches hexagonal architecture: src/domain/, src/application/, src/infrastructure/, src/presentation/

## Tasks

### Wave 1: Project Scaffolding (SETUP-01)

#### Task 1.1: Initialize Bun project

**Objective:** Create package.json with correct metadata and TypeScript configuration.

**TDD Cycle:**
- RED: N/A (scaffolding)
- GREEN: Project initializes, `bun --version` works
- REFACTOR: Verify package.json has correct fields

**Acceptance:**
- [ ] package.json exists with name "memory-nexus"
- [ ] TypeScript 5.5+ configured in tsconfig.json
- [ ] bun.lock created (not package-lock.json)
- [ ] .gitignore includes node_modules, dist, *.db

**Files:**
- package.json
- tsconfig.json
- .gitignore

---

#### Task 1.2: Create hexagonal architecture folder structure

**Objective:** Establish the 4-layer folder structure with index.ts barrel exports.

**TDD Cycle:**
- RED: N/A (scaffolding)
- GREEN: All folders exist with placeholder exports
- REFACTOR: Ensure consistent barrel export pattern

**Acceptance:**
- [ ] src/domain/ exists with index.ts
- [ ] src/application/ exists with index.ts
- [ ] src/infrastructure/ exists with index.ts
- [ ] src/presentation/ exists with index.ts
- [ ] Each layer has entities/, services/, ports/ subdirectories as needed

**Files:**
- src/domain/index.ts
- src/domain/entities/index.ts
- src/domain/value-objects/index.ts
- src/domain/services/index.ts
- src/application/index.ts
- src/infrastructure/index.ts
- src/presentation/index.ts

---

#### Task 1.3: Configure test runner

**Objective:** Set up Bun test runner with coverage reporting.

**TDD Cycle:**
- RED: Write a trivial test that should pass
- GREEN: `bun test` runs and passes
- REFACTOR: Configure coverage thresholds

**Acceptance:**
- [ ] `bun test` command works
- [ ] Coverage reporting enabled
- [ ] Coverage thresholds set to 95% for all metrics
- [ ] Test files use .test.ts extension

**Files:**
- bunfig.toml (or test config in package.json)
- src/domain/entities/session.test.ts (placeholder)

---

### Wave 2: Value Objects (DOM-06, DOM-07, DOM-08)

#### Task 2.1: ProjectPath value object

**Objective:** Immutable value object representing encoded/decoded project paths.

**TDD Cycle:**
- RED: Test encoding "C:\Users\Destiny\Projects\foo" produces "C--Users-Destiny-Projects-foo"
- RED: Test decoding "C--Users-Destiny-Projects-foo" produces "C:\Users\Destiny\Projects\foo"
- RED: Test immutability (no setters, readonly properties)
- RED: Test validation rejects empty paths
- GREEN: Implement ProjectPath class
- REFACTOR: Extract constants, improve naming

**Acceptance:**
- [ ] Encodes Windows paths (backslash to double-dash)
- [ ] Encodes Unix paths (forward-slash to single-dash)
- [ ] Decodes back to original path format
- [ ] Immutable (readonly properties)
- [ ] Throws on empty/invalid paths
- [ ] Handles edge cases: root paths, trailing slashes

**Files:**
- src/domain/value-objects/project-path.ts
- src/domain/value-objects/project-path.test.ts

---

#### Task 2.2: SearchQuery value object

**Objective:** Immutable value object representing a parsed search query with filters.

**TDD Cycle:**
- RED: Test query text extraction
- RED: Test filter parsing (project, date range, role)
- RED: Test immutability
- RED: Test validation (empty query rejected)
- GREEN: Implement SearchQuery class
- REFACTOR: Extract filter types

**Acceptance:**
- [ ] Stores query text
- [ ] Stores optional project filter
- [ ] Stores optional date range (since, before)
- [ ] Stores optional role filter (user/assistant/all)
- [ ] Stores optional limit
- [ ] Immutable (readonly properties)
- [ ] Validates query is non-empty

**Files:**
- src/domain/value-objects/search-query.ts
- src/domain/value-objects/search-query.test.ts

---

#### Task 2.3: SearchResult value object

**Objective:** Immutable value object representing a single search result with ranking.

**TDD Cycle:**
- RED: Test stores message reference, rank, snippet
- RED: Test highlight positions
- RED: Test immutability
- GREEN: Implement SearchResult class
- REFACTOR: Consider snippet length limits

**Acceptance:**
- [ ] Stores message ID reference
- [ ] Stores session ID reference
- [ ] Stores project name
- [ ] Stores BM25 rank score
- [ ] Stores snippet text with context
- [ ] Stores highlight positions (start, end pairs)
- [ ] Immutable (readonly properties)

**Files:**
- src/domain/value-objects/search-result.ts
- src/domain/value-objects/search-result.test.ts

---

### Wave 3: Domain Entities (DOM-01 through DOM-05)

#### Task 3.1: Session entity

**Objective:** Entity representing a Claude Code session.

**TDD Cycle:**
- RED: Test creation with required fields
- RED: Test ID generation/assignment
- RED: Test timestamp handling
- RED: Test message count tracking
- GREEN: Implement Session class
- REFACTOR: Consider factory method for creation

**Acceptance:**
- [ ] Has unique ID (UUID or source session ID)
- [ ] Has project path (ProjectPath value object)
- [ ] Has start timestamp
- [ ] Has end timestamp (nullable for ongoing)
- [ ] Has message count
- [ ] Has tool use count
- [ ] Has source file path (JSONL location)
- [ ] Has extraction timestamp

**Files:**
- src/domain/entities/session.ts
- src/domain/entities/session.test.ts

---

#### Task 3.2: Message entity

**Objective:** Entity representing a single message in a session.

**TDD Cycle:**
- RED: Test creation with role, content, timestamp
- RED: Test role validation (user/assistant/system)
- RED: Test session reference
- RED: Test parentUuid for threading
- GREEN: Implement Message class
- REFACTOR: Consider role as enum/union type

**Acceptance:**
- [ ] Has unique ID
- [ ] Has session ID reference
- [ ] Has role (user/assistant/system)
- [ ] Has content (string)
- [ ] Has timestamp
- [ ] Has parentUuid (nullable, for conversation threading)
- [ ] Has isSidechain flag (for subagent messages)

**Files:**
- src/domain/entities/message.ts
- src/domain/entities/message.test.ts

---

#### Task 3.3: ToolUse entity

**Objective:** Entity representing a tool invocation.

**TDD Cycle:**
- RED: Test creation with tool name, inputs
- RED: Test output storage
- RED: Test session/message references
- GREEN: Implement ToolUse class
- REFACTOR: Consider input/output as JSON

**Acceptance:**
- [ ] Has unique ID
- [ ] Has session ID reference
- [ ] Has message ID reference (which assistant message invoked it)
- [ ] Has tool name (Read, Write, Edit, Bash, etc.)
- [ ] Has inputs (JSON object)
- [ ] Has output (string or structured)
- [ ] Has timestamp
- [ ] Has duration (if available)

**Files:**
- src/domain/entities/tool-use.ts
- src/domain/entities/tool-use.test.ts

---

#### Task 3.4: Link entity

**Objective:** Entity representing relationships between entities for graph-like queries.

**TDD Cycle:**
- RED: Test creation with source, target, relationship
- RED: Test weight scoring
- RED: Test relationship types
- GREEN: Implement Link class
- REFACTOR: Consider relationship as enum

**Acceptance:**
- [ ] Has source type (message/session/topic)
- [ ] Has source ID
- [ ] Has target type (message/session/topic)
- [ ] Has target ID
- [ ] Has relationship type (replies_to, belongs_to, mentions, related_to)
- [ ] Has weight (0.0 to 1.0)
- [ ] Has timestamp (when link was created)

**Files:**
- src/domain/entities/link.ts
- src/domain/entities/link.test.ts

---

#### Task 3.5: ExtractionState entity

**Objective:** Entity tracking incremental sync state per session file.

**TDD Cycle:**
- RED: Test creation with file path, mtime, size
- RED: Test last extracted position
- RED: Test comparison for change detection
- GREEN: Implement ExtractionState class
- REFACTOR: Consider value object vs entity distinction

**Acceptance:**
- [ ] Has source file path
- [ ] Has file mtime (modification time)
- [ ] Has file size (bytes)
- [ ] Has last extracted timestamp
- [ ] Has last extracted line number (for resumption)
- [ ] Has session ID (if already extracted)
- [ ] Can compare with current file state to detect changes

**Files:**
- src/domain/entities/extraction-state.ts
- src/domain/entities/extraction-state.test.ts

---

### Wave 4: Domain Services (DOM-10, DOM-11, DOM-12)

#### Task 4.1: PathDecoder domain service

**Objective:** Service that decodes encoded directory paths from ~/.claude/projects/.

**TDD Cycle:**
- RED: Test decoding "C--Users-Destiny-Projects-foo" -> "C:\Users\Destiny\Projects\foo"
- RED: Test decoding "-home-user-projects-bar" -> "/home/user/projects/bar"
- RED: Test extracting project name from full path
- RED: Test handling edge cases (root, trailing slashes)
- GREEN: Implement PathDecoder
- REFACTOR: Inject platform detection if needed

**Acceptance:**
- [ ] Decodes Windows-style encoded paths
- [ ] Decodes Unix-style encoded paths
- [ ] Extracts project name (last path segment)
- [ ] Handles edge cases gracefully
- [ ] Pure function (no side effects)
- [ ] Zero external dependencies

**Files:**
- src/domain/services/path-decoder.ts
- src/domain/services/path-decoder.test.ts

---

#### Task 4.2: ContentExtractor domain service

**Objective:** Service that extracts searchable text from JSONL events.

**TDD Cycle:**
- RED: Test extracting text from user message event
- RED: Test extracting text from assistant message event
- RED: Test extracting text from thinking blocks
- RED: Test ignoring non-text content (base64, progress)
- RED: Test handling nested content arrays
- GREEN: Implement ContentExtractor
- REFACTOR: Consider visitor pattern for extensibility

**Acceptance:**
- [ ] Extracts text from user messages
- [ ] Extracts text from assistant messages
- [ ] Extracts text from thinking blocks (if included)
- [ ] Extracts tool names and inputs (searchable)
- [ ] Ignores base64, progress, file-history-snapshot
- [ ] Returns normalized text (trimmed, deduplicated whitespace)
- [ ] Zero external dependencies

**Files:**
- src/domain/services/content-extractor.ts
- src/domain/services/content-extractor.test.ts

---

#### Task 4.3: QueryParser domain service

**Objective:** Service that parses search query strings into SearchQuery value objects.

**TDD Cycle:**
- RED: Test parsing simple query "authentication"
- RED: Test parsing query with project filter "auth project:wow-system"
- RED: Test parsing query with date filter "auth since:2026-01-01"
- RED: Test parsing query with role filter "auth role:assistant"
- RED: Test parsing query with multiple filters
- GREEN: Implement QueryParser
- REFACTOR: Consider regex vs tokenizer approach

**Acceptance:**
- [ ] Parses simple text queries
- [ ] Parses project: filter
- [ ] Parses since: and before: date filters
- [ ] Parses role: filter (user/assistant/all)
- [ ] Parses limit: filter
- [ ] Returns SearchQuery value object
- [ ] Handles quoted strings for exact match
- [ ] Zero external dependencies

**Files:**
- src/domain/services/query-parser.ts
- src/domain/services/query-parser.test.ts

---

### Wave 5: CLI Entry Point (SETUP-04)

#### Task 5.1: Install Commander.js with extra-typings

**Objective:** Add CLI framework dependency.

**TDD Cycle:**
- RED: N/A (dependency installation)
- GREEN: Import works, types available
- REFACTOR: Verify extra-typings provides full type coverage

**Acceptance:**
- [ ] commander@14 in dependencies
- [ ] @commander-js/extra-typings in devDependencies
- [ ] Types resolve correctly

**Files:**
- package.json

---

#### Task 5.2: Create CLI entry point

**Objective:** Set up main CLI program with version and help.

**TDD Cycle:**
- RED: Test --version outputs package version
- RED: Test --help outputs command list
- GREEN: Implement basic CLI structure
- REFACTOR: Extract command registration

**Acceptance:**
- [ ] Entry point at src/presentation/cli.ts
- [ ] Executable via `bun run src/presentation/cli.ts`
- [ ] --version shows package version
- [ ] --help shows available commands
- [ ] Placeholder for memory subcommand group
- [ ] Proper exit codes (0 for success)

**Files:**
- src/presentation/cli.ts
- src/presentation/cli.test.ts
- package.json (add bin entry)

---

### Wave 6: Integration and Verification

#### Task 6.1: Verify zero external dependencies in domain layer

**Objective:** Ensure domain layer purity.

**TDD Cycle:**
- RED: Write test that scans domain imports
- GREEN: All imports are relative or built-in only
- REFACTOR: Document allowed imports

**Acceptance:**
- [ ] No imports from node_modules in src/domain/**
- [ ] Only TypeScript built-ins allowed
- [ ] Test verifies this constraint automatically

**Files:**
- tests/architecture/domain-purity.test.ts

---

#### Task 6.2: Run full test suite with coverage

**Objective:** Verify all tests pass and coverage meets thresholds.

**TDD Cycle:**
- RED: N/A (verification)
- GREEN: All tests pass, coverage >= 95% at each metric
- REFACTOR: Add missing tests if coverage gaps

**Acceptance:**
- [ ] `bun test` passes all tests
- [ ] Statements coverage >= 95%
- [ ] Branches coverage >= 95%
- [ ] Functions coverage >= 95%
- [ ] Lines coverage >= 95%

**Files:**
- (all test files)

---

## Execution Order

```
Wave 1: Project Scaffolding
  Task 1.1 -> Task 1.2 -> Task 1.3

Wave 2: Value Objects (parallel after Wave 1)
  Task 2.1, Task 2.2, Task 2.3 (can run in parallel)

Wave 3: Domain Entities (after Wave 2 for ProjectPath dependency)
  Task 3.1 -> Task 3.2 -> Task 3.3 -> Task 3.4 -> Task 3.5

Wave 4: Domain Services (after Wave 2, Wave 3)
  Task 4.1 (uses ProjectPath)
  Task 4.2 (uses Message, ToolUse)
  Task 4.3 (uses SearchQuery)

Wave 5: CLI Entry Point (after Wave 1)
  Task 5.1 -> Task 5.2

Wave 6: Integration (after all previous waves)
  Task 6.1 -> Task 6.2
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Path encoding complexity | Test with real session directories from ~/.claude/projects/ |
| TypeScript strict mode issues | Enable strict mode from start, fix as we go |
| Coverage gaps in branches | Write explicit tests for all conditional paths |

## Estimated Effort

| Wave | Tasks | Complexity |
|------|-------|------------|
| Wave 1 | 3 | Low (scaffolding) |
| Wave 2 | 3 | Medium (value objects) |
| Wave 3 | 5 | Medium (entities) |
| Wave 4 | 3 | Medium-High (services with logic) |
| Wave 5 | 2 | Low (CLI setup) |
| Wave 6 | 2 | Low (verification) |

---

*Created: 2026-01-27*
