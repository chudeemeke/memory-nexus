# Phase 23: Foundation - Research

**Researched:** 2026-03-08
**Domain:** SQLite schema extension, filesystem scanning, FTS5 query sanitization, markdown file conventions
**Confidence:** HIGH

## Summary

Phase 23 establishes four foundational capabilities for v3.0: (1) the agent write protocol defining how Claude writes durable memory during sessions, (2) the `~/.memory/` global directory with encoded-path project subdirectories, (3) memory file indexing in the sync pipeline, and (4) FTS5 search reliability by sanitizing special characters in queries.

All four capabilities build on existing codebase patterns. No new external libraries are needed. The `memory_files` table and `memory_files_fts` virtual table extend the existing schema. The file scanner follows the same `ISessionSource` pattern used for JSONL discovery. The FTS5 sanitizer is a pure function applied at the application/service boundary. The directory structure conventions are documentation-only (no runtime enforcement in this phase).

**Primary recommendation:** Implement as four parallel workstreams mapped to the existing hexagonal architecture. Maximize reuse of existing patterns (entity classes, repository adapters, sync service composition, schema migration).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Directory structure:** `~/.memory/` root with `config.json`, `DECISIONS.md`, `LEARNINGS.md`, `USER-PREFS.md`, `daily/` subdirectory, and `projects/<encoded-path>/` subdirectories. Encoded paths mirror `~/.claude/projects/` convention.
- **Daily log format:** Markdown with `# YYYY-MM-DD`, session headers, topic/decisions/outcomes/unresolved/learnings/key-files sections.
- **Curated file formats:** DECISIONS.md uses date-prefixed entries with Chose/Over/Because/Status/Session fields. LEARNINGS.md uses entries with Context/Wrong approach/Why wrong/Correct approach/Applies to/Date fields.
- **Write timing:** Claude writes at natural breakpoints (after decisions, task completions, learning moments, before /clear, when prompted by pre-compaction hook).
- **Schema addition:** `memory_files` table with `id`, `file_path`, `file_type`, `project_encoded`, `content`, `content_hash`, `last_indexed_at`, `created_at`. Separate `memory_files_fts` FTS5 virtual table.
- **File type classification:** daily/ = daily_log, DECISIONS.md = decisions, LEARNINGS.md = learnings, USER-PREFS.md = user_prefs.
- **FTS5 sanitization approach:** Replace special characters (periods, hyphens, colons, parentheses, brackets) with spaces before MATCH. Apply in SearchService, HybridSearchService, and any new FTS5 queries.
- **Architecture layer mapping:** MemoryFile entity in domain, IMemoryFileRepository port in domain, SqliteMemoryFileRepository in infrastructure, file discovery in infrastructure/sources, FTS5 sanitizer in application/services, sync integration in application/services.
- **Content storage:** Store full markdown content in memory_files table (not just path reference).
- **Incremental indexing:** Use SHA-256 content hash for change detection. Skip files where hash matches.

### Claude's Discretion
- None explicitly listed. All major decisions are locked in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)
- Temporal decay for daily logs (Phase 25)
- Smart context rewrite using memory files (Phase 25)
- Pre-compaction flush hook (Phase 26)
- Backfill via Agent SDK (Phase 26)
- qmd integration (Phase 27)
- Friction logging (Phase 24)
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | (bundled) | SQLite database with FTS5 | Already in use; all schema/repository patterns established |
| node:crypto | (bundled) | SHA-256 hashing for content change detection | Built-in, zero dependencies |
| node:fs/promises | (bundled) | Recursive file discovery in ~/.memory/ | Already used by FileSystemSessionSource |
| node:path | (bundled) | Path manipulation | Already used throughout codebase |

### Supporting
No new external dependencies required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 content hash | File mtime comparison | SHA-256 is more reliable for detecting actual content changes; mtime can change without content changing (e.g., touch). The existing extraction state uses mtime+size, but memory files are human-edited markdown where content hash is more appropriate. |
| Separate memory_files_fts table | Merging into existing messages_fts | Separate table is correct -- different content types, different decay rules (Phase 25), different search semantics. CONTEXT.md locks this decision. |
| Storing content in DB | Path-only reference with disk read at search time | Storing content enables search without disk access and is consistent with how messages_meta stores message content. CONTEXT.md locks this decision. |

## Architecture Patterns

### Recommended Project Structure
```
src/
  domain/
    entities/
      memory-file.ts               # MemoryFile entity (immutable, validated)
      memory-file.test.ts
    ports/
      repositories.ts              # Add IMemoryFileRepository interface
  application/
    services/
      fts-sanitizer.ts             # sanitizeFtsQuery() pure function
      fts-sanitizer.test.ts
      sync-service.ts              # Extend to integrate memory file indexing
  infrastructure/
    database/
      schema.ts                    # Add MEMORY_FILES_TABLE, MEMORY_FILES_FTS_TABLE
      repositories/
        memory-file-repository.ts  # SqliteMemoryFileRepository
        memory-file-repository.test.ts
    sources/
      memory-file-scanner.ts       # MemoryFileScanner (discover, hash, classify)
      memory-file-scanner.test.ts
    paths.ts                       # Add getMemoryDir() function
```

### Pattern 1: Domain Entity (MemoryFile)
**What:** Immutable domain entity following the existing Entity/Session/Message pattern.
**When to use:** Always, for representing memory files in the domain layer.
**Example:**
```typescript
// Follow the existing Entity pattern: private constructor, static create(), validation
export type MemoryFileType = "daily_log" | "decisions" | "learnings" | "user_prefs";

interface MemoryFileParams {
  id?: number;
  filePath: string;        // relative to ~/.memory/
  fileType: MemoryFileType;
  projectEncoded?: string; // null for global files
  content: string;
  contentHash: string;
  lastIndexedAt: Date;
  createdAt?: Date;
}

export class MemoryFile {
  private constructor(params: MemoryFileParams) { /* ... */ }
  static create(params: MemoryFileParams): MemoryFile { /* validation */ }
  // Immutable getters, no setters
}
```

### Pattern 2: Repository Port (IMemoryFileRepository)
**What:** Interface in domain ports, implemented by SQLite adapter in infrastructure.
**When to use:** Always, for database access to memory_files.
**Example:**
```typescript
// Add to src/domain/ports/repositories.ts
export interface IMemoryFileRepository {
  findByPath(filePath: string): Promise<MemoryFile | null>;
  findByType(fileType: MemoryFileType): Promise<MemoryFile[]>;
  findByProject(projectEncoded: string): Promise<MemoryFile[]>;
  save(file: MemoryFile): Promise<void>;
  saveMany(files: MemoryFile[]): Promise<void>;
  searchContent(query: string, limit?: number): Promise<MemoryFile[]>;
}
```

### Pattern 3: File Scanner (Infrastructure Source)
**What:** Infrastructure adapter that discovers ~/.memory/ files, computes hashes, and classifies file types.
**When to use:** Called by SyncService during the sync workflow.
**Example:**
```typescript
// Follow FileSystemSessionSource pattern
export interface MemoryFileInfo {
  filePath: string;       // relative to ~/.memory/
  absolutePath: string;   // full path for reading
  fileType: MemoryFileType;
  projectEncoded?: string;
  contentHash: string;
  content: string;
}

export interface IMemoryFileScanner {
  discoverFiles(): Promise<MemoryFileInfo[]>;
}
```

### Pattern 4: FTS5 Query Sanitization
**What:** Pure function that strips FTS5 operator characters from user queries before MATCH.
**When to use:** Applied in Fts5SearchService, HybridSearchService, and memory_files_fts queries.
**Example:**
```typescript
// Application layer utility -- no infrastructure dependencies
export function sanitizeFtsQuery(query: string): string {
  return query
    .replace(/[.:\-()[\]{}^*"~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
}
```

### Pattern 5: Schema Migration
**What:** Add new tables to SCHEMA_SQL array with IF NOT EXISTS, following the existing ordering pattern.
**When to use:** For memory_files and memory_files_fts tables.
**Example:**
```typescript
// Add after EMBEDDING_STATE_TABLE in SCHEMA_SQL:
export const MEMORY_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS memory_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('daily_log', 'decisions', 'learnings', 'user_prefs')),
    project_encoded TEXT,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_indexed_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memory_files_type ON memory_files(file_type);
CREATE INDEX IF NOT EXISTS idx_memory_files_project ON memory_files(project_encoded);
`;

export const MEMORY_FILES_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_files_fts USING fts5(
    content,
    content=memory_files,
    content_rowid=id,
    tokenize='porter unicode61'
);
`;
```

### Anti-Patterns to Avoid
- **DO NOT merge memory_files_fts with messages_fts.** Different content types, different decay rules, different search semantics. They need separate virtual tables.
- **DO NOT create the ~/.memory/ directory structure in this phase.** This phase indexes files that exist; the write protocol is a convention for Claude to follow, not a runtime enforcement. The directory auto-creates on first `memory sync` only if it does not exist AND there are no files to index (graceful no-op).
- **DO NOT add FTS5 triggers for memory_files_fts.** Unlike messages_meta (which uses INSERT/UPDATE/DELETE triggers), memory files are inserted/updated in batch during sync. Use explicit FTS5 content sync commands (INSERT INTO memory_files_fts(memory_files_fts) VALUES('rebuild')) after batch operations, or manual INSERT/DELETE in the repository.
- **DO NOT make SyncService depend on IMemoryFileRepository directly.** SyncService currently takes repositories via constructor DI. Follow the same pattern -- add IMemoryFileRepository and IMemoryFileScanner as optional constructor dependencies, or compose a separate MemoryFileSyncService that the CLI command orchestrates alongside the existing SyncService.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash function | `crypto.createHash('sha256')` from node:crypto | Standard, proven, handles binary content correctly |
| Recursive directory scanning | Custom walker | `readdir` with manual recursion (same as FileSystemSessionSource) | Already proven pattern in codebase; no need for glob libraries |
| FTS5 external content sync | Manual trigger management | FTS5 'rebuild' command or manual INSERT/DELETE pairs | FTS5 has built-in content sync commands for external content tables |

**Key insight:** Every component in this phase has an existing analog in the codebase. MemoryFile follows Entity. SqliteMemoryFileRepository follows SqliteSessionRepository. MemoryFileScanner follows FileSystemSessionSource. FTS5 sanitization is a pure utility function. No novel patterns needed.

## Common Pitfalls

### Pitfall 1: FTS5 External Content Table Sync
**What goes wrong:** External content FTS5 tables (content=memory_files) require manual synchronization. If you INSERT into memory_files without also inserting into memory_files_fts, search returns stale results. If you DELETE from memory_files without corresponding FTS5 delete, you get phantom results.
**Why it happens:** External content FTS5 tables do NOT auto-sync like regular FTS5 tables. The content= syntax means FTS5 does not store its own copy; it references the content table. But the index still needs explicit updates.
**How to avoid:** Two options: (1) Use triggers like messages_fts (the existing pattern), or (2) perform manual FTS5 operations in the repository's save/delete methods. Option 1 is safer and matches the existing codebase convention. Add INSERT/DELETE/UPDATE triggers on memory_files that sync to memory_files_fts, identical to the messages_fts triggers pattern.
**Warning signs:** Search returns no results for content that exists in memory_files table.

### Pitfall 2: FTS5 Sanitizer Over-Stripping
**What goes wrong:** Stripping ALL special characters can destroy meaningful FTS5 operators like AND, OR, NOT, NEAR that users might intentionally use.
**Why it happens:** The sanitizer regex is too aggressive.
**How to avoid:** Only strip characters that FTS5 treats as syntax operators (`.`, `:`, `-`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `*`, `"`, `~`). Preserve alphanumeric characters, spaces, and FTS5 keyword operators (AND, OR, NOT are uppercase words, not special chars). The CONTEXT.md sanitizer function already handles this correctly.
**Warning signs:** Queries like "authentication AND security" lose the AND operator.

### Pitfall 3: Path Encoding Mismatch
**What goes wrong:** The encoded path used for ~/.memory/projects/ subdirectories does not match the encoding used by ~/.claude/projects/.
**Why it happens:** The encoding algorithm (spaces and hyphens to dashes) is undocumented and was reverse-engineered for ProjectNameResolver.
**How to avoid:** Reuse the same encoding. The ProjectPath.fromDecoded() method and ProjectNameResolver already handle this. When creating or looking up project subdirectories in ~/.memory/projects/, use the same encoded form that appears in ~/.claude/projects/ directory names. The CONTEXT.md explicitly states these mirror each other.
**Warning signs:** Project-specific memory files are not found because the subdirectory encoding differs from session storage encoding.

### Pitfall 4: Content Hash Instability
**What goes wrong:** The same file content produces different SHA-256 hashes on different platforms due to line ending differences (CRLF vs LF).
**Why it happens:** Windows Git may convert line endings to CRLF, while the hash was computed with LF content.
**How to avoid:** Hash the raw file content as-is (Buffer), not a string with normalized line endings. The hash is only compared against itself (same machine, same file), so consistency matters more than cross-platform reproducibility. Since ~/.memory/ files live outside Git (global directory), line ending conversion is not a concern. But if paranoid, normalize to LF before hashing.
**Warning signs:** Every sync re-indexes all files even when content has not changed.

### Pitfall 5: Empty ~/.memory/ Directory
**What goes wrong:** `memory sync` fails or errors when ~/.memory/ does not exist yet (fresh install, before any Claude session writes memory files).
**Why it happens:** The scanner tries to readdir on a nonexistent directory.
**How to avoid:** The scanner should return an empty array when ~/.memory/ does not exist, not throw an error. This is exactly how FileSystemSessionSource handles a missing ~/.claude/projects/ directory -- graceful empty return. Do NOT auto-create the directory structure; let it be created when Claude first writes to it (Phase 26 hooks or manual use).
**Warning signs:** `memory sync` errors on fresh installs.

### Pitfall 6: SyncService Constructor Inflation
**What goes wrong:** Adding IMemoryFileRepository and IMemoryFileScanner to SyncService's constructor makes it have 11+ dependencies, violating single responsibility.
**Why it happens:** Trying to keep all sync logic in one service.
**How to avoid:** Consider composing a separate MemoryFileSyncService that handles memory file discovery and indexing independently. The CLI sync command can call both services sequentially. This keeps SyncService focused on JSONL session extraction and MemoryFileSyncService focused on ~/.memory/ file indexing.
**Warning signs:** SyncService constructor taking more than 10 parameters.

## Code Examples

### SHA-256 Content Hashing
```typescript
// Using node:crypto (already available, no import needed beyond standard library)
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// Or from a file buffer:
async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  return computeContentHash(content);
}
```

### File Type Classification from Path
```typescript
// Determine MemoryFileType from relative path within ~/.memory/
function classifyFileType(relativePath: string): MemoryFileType {
  if (relativePath.startsWith("daily/")) return "daily_log";
  if (relativePath.endsWith("DECISIONS.md")) return "decisions";
  if (relativePath.endsWith("LEARNINGS.md")) return "learnings";
  if (relativePath.endsWith("USER-PREFS.md")) return "user_prefs";
  // Default for unrecognized .md files -- could be a custom curated file
  return "learnings"; // or throw, depending on design choice
}

// Extract project_encoded from path like "projects/C--Users-Destiny-Projects-foo/DECISIONS.md"
function extractProjectEncoded(relativePath: string): string | undefined {
  const match = relativePath.match(/^projects\/([^/]+)\//);
  return match?.[1] ?? undefined;
}
```

### FTS5 Content Sync Triggers
```typescript
// Follows the exact pattern of FTS_TRIGGERS for messages_fts
export const MEMORY_FILES_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS memory_files_fts_insert AFTER INSERT ON memory_files BEGIN
    INSERT INTO memory_files_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_files_fts_delete AFTER DELETE ON memory_files BEGIN
    INSERT INTO memory_files_fts(memory_files_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_files_fts_update AFTER UPDATE ON memory_files BEGIN
    INSERT INTO memory_files_fts(memory_files_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO memory_files_fts(rowid, content) VALUES (new.id, new.content);
END;
`;
```

### Applying FTS5 Sanitization in Existing Services
```typescript
// In Fts5SearchService.search():
async search(query: SearchQuery, options?: SearchOptions): Promise<SearchResult[]> {
  const limit = options?.limit ?? 20;
  const queryValue = sanitizeFtsQuery(query.value);  // <-- add this
  const { sql, params } = this.buildSearchQuery(queryValue, limit, options);
  // ... rest unchanged
}

// In buildSearchQuery, the queryValue is already sanitized before reaching MATCH
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No memory persistence | JSONL sessions only | v1.0 (2026-02) | Sessions searchable but ephemeral |
| No FTS5 sanitization | Raw query to MATCH | v1.0 (2026-02) | Queries with periods/hyphens cause FTS5 errors |
| FTS5-only search | Hybrid FTS5 + sqlite-vec | v2.0 (2026-03) | Semantic search available, but FTS5 still the baseline |

**No deprecated approaches to worry about.** This phase adds new capabilities, not replacing old ones.

## Open Questions

1. **Should unrecognized .md files in ~/.memory/ be indexed?**
   - What we know: CONTEXT.md defines four file types (daily_log, decisions, learnings, user_prefs). But users might create custom .md files in ~/.memory/ (e.g., PATTERNS.md, CONVENTIONS.md).
   - What's unclear: Whether these should be indexed with a generic type or ignored.
   - Recommendation: Index them as a fifth type (e.g., "custom" or "other"). The scanner should never silently skip .md files in ~/.memory/ -- that would confuse users who create files expecting them to be searchable. Alternatively, raise this with the user during planning since CONTEXT.md is silent on this.

2. **Should the sync command report memory file indexing results separately?**
   - What we know: Current SyncResult tracks sessionsProcessed, messagesInserted, etc. Memory file indexing is a different operation.
   - What's unclear: Whether to extend SyncResult or report separately.
   - Recommendation: Extend SyncResult with memoryFilesIndexed and memoryFilesSkipped fields, or create a separate MemoryFileSyncResult. The latter is cleaner if using a separate MemoryFileSyncService.

3. **FTS5 triggers vs manual FTS5 sync for memory_files?**
   - What we know: messages_fts uses triggers (automatic, established pattern). Memory files are batch-inserted during sync.
   - What's unclear: Whether triggers add overhead for batch inserts.
   - Recommendation: Use triggers. The batch size is tiny (tens of files vs thousands of messages). Triggers maintain consistency automatically and match the established pattern. The overhead is negligible.

## Validation Architecture

> Skipped: workflow.nyquist_validation is not enabled in .planning/config.json

## Sources

### Primary (HIGH confidence)
- **Existing codebase** - Schema, entities, repositories, sources, services are the primary reference for all patterns
- **CONTEXT.md** - All design decisions are locked by the user's brainstorming session
- **SQLite FTS5 documentation** - External content tables, tokenizer, MATCH operator behavior

### Secondary (MEDIUM confidence)
- **SQLite FTS5 query syntax** - Behavior of special characters as operators confirmed by codebase integration tests (integration.test.ts has 50+ FTS5 MATCH test cases)

### Tertiary (LOW confidence)
- None. All findings are verifiable from the codebase and CONTEXT.md.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; all capabilities use existing bun:sqlite and Node.js builtins
- Architecture: HIGH - Every component has a direct analog in the existing codebase (Entity, Repository, Source, Service)
- Pitfalls: HIGH - All pitfalls derive from observed codebase patterns (FTS5 triggers, path encoding, directory scanning)

**Research date:** 2026-03-08
**Valid until:** 2026-04-07 (stable domain; no external library versioning concerns)
