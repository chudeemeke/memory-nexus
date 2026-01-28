# Phase 6: Search Command with FTS5 - Research

**Researched:** 2026-01-28
**Domain:** SQLite FTS5 full-text search, Commander.js CLI
**Confidence:** HIGH

## Summary

This phase implements the `aidev memory search <query>` CLI command with full-text search capabilities. The core infrastructure already exists: `Fts5SearchService` handles FTS5 queries with BM25 ranking and snippet extraction, `SearchQuery` and `SearchResult` value objects provide domain abstraction, and the CLI entry point has a placeholder search command.

The main work is connecting existing infrastructure to the CLI layer, adding case sensitivity control, and ensuring result formatting meets user requirements. The FTS5 snippet() function is already configured with `<mark>` tags for highlighting.

**Primary recommendation:** Wire the existing `Fts5SearchService` to the CLI search command with minimal new code. Add case sensitivity via FTS5 query syntax modification rather than tokenizer changes.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in | SQLite with FTS5 | Already in use; 3-6x faster than better-sqlite3 |
| commander | 12.x | CLI framework | Already in use for sync command |
| FTS5 | Built-in SQLite | Full-text search | Already configured with porter unicode61 tokenizer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chalk | 5.x | Terminal colors | Already available; use for result formatting if needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FTS5 | Elasticsearch | FTS5 is embedded, no server needed; Elasticsearch overkill |
| chalk | kleur | chalk already in project, both work similarly |

**Installation:**
No new packages needed. All dependencies already installed.

## Architecture Patterns

### Existing Structure (Already in Place)
```
src/
├── domain/
│   ├── value-objects/
│   │   ├── search-query.ts    # Validates query strings
│   │   └── search-result.ts   # Immutable result objects
│   ├── services/
│   │   └── query-parser.ts    # Parses queries with filters
│   └── ports/
│       └── services.ts        # ISearchService interface
├── infrastructure/
│   └── database/
│       └── services/
│           └── search-service.ts  # Fts5SearchService impl
└── presentation/
    └── cli/
        ├── index.ts           # CLI entry point (placeholder search)
        └── commands/
            └── sync.ts        # Reference pattern
```

### Pattern 1: Command Handler Pattern (from sync.ts)
**What:** Thin CLI handler that creates dependencies and delegates to services
**When to use:** All CLI commands
**Example:**
```typescript
// Source: src/presentation/cli/commands/sync.ts (existing)
export function createSearchCommand(): Command {
  return new Command("search")
    .argument("<query>", "Search query")
    .option("-l, --limit <count>", "Maximum results", "10")
    .option("-p, --project <name>", "Filter by project")
    .option("--case-sensitive", "Enable case-sensitive search")
    .action(async (query, options) => {
      await executeSearchCommand(query, options);
    });
}
```

### Pattern 2: Service Injection Pattern
**What:** CLI creates and injects infrastructure dependencies
**When to use:** Commands that need database access
**Example:**
```typescript
// Source: src/presentation/cli/commands/sync.ts (existing pattern)
const { db } = initializeDatabase({ path: dbPath });
const searchService = new Fts5SearchService(db);
// Use service...
closeDatabase(db);
```

### Anti-Patterns to Avoid
- **Direct SQL in CLI:** Never write SQL in presentation layer; use SearchService
- **Skipping SearchQuery validation:** Always use SearchQuery.from() to validate input
- **Using = operator for FTS5:** MATCH operator is mandatory (= causes full table scan)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query validation | Custom regex | `SearchQuery.from()` | Already handles empty/whitespace |
| BM25 normalization | Custom math | `Fts5SearchService.normalizeBm25Scores()` | Already normalizes to 0-1 range |
| Snippet extraction | String manipulation | FTS5 `snippet()` function | Built-in, optimized, handles edge cases |
| Query parsing | Custom parser | `QueryParser.toFts5Query()` | Already converts terms to FTS5 syntax |
| Highlight markers | Custom HTML | FTS5 snippet with `<mark>` tags | Already configured in service |

**Key insight:** The Fts5SearchService already does 90% of the work. This phase is primarily CLI wiring.

## Common Pitfalls

### Pitfall 1: Using = Instead of MATCH
**What goes wrong:** Query performs full table scan, defeating FTS5 indexing
**Why it happens:** SQL habit; = works syntactically but ignores FTS5 index
**How to avoid:** Always use `messages_fts MATCH ?` syntax (already enforced in SearchService)
**Warning signs:** Queries taking >100ms on small datasets; EXPLAIN QUERY PLAN not showing FTS5

### Pitfall 2: Case Sensitivity Expectations
**What goes wrong:** Users expect case-sensitive search but FTS5 unicode61 tokenizer is case-insensitive by default
**Why it happens:** FTS5 unicode61 tokenizer folds case per Unicode 6.1 standard
**How to avoid:** Document that --case-sensitive uses GLOB post-filter, not native FTS5
**Warning signs:** "Authentication" and "authentication" returning same results despite --case-sensitive flag

### Pitfall 3: Forgetting Limit Default
**What goes wrong:** Returning too many results, slow performance
**Why it happens:** Service default is 20, CLI requirement is 10
**How to avoid:** CLI sets explicit limit (default 10) before calling service
**Warning signs:** More than 10 results returned without --limit flag

### Pitfall 4: Empty Query Handling
**What goes wrong:** Empty or whitespace queries cause errors or return unexpected results
**Why it happens:** FTS5 MATCH with empty string is invalid
**How to avoid:** Validate with `SearchQuery.from()` which throws on empty queries
**Warning signs:** "Query cannot be empty" errors not caught before reaching database

### Pitfall 5: Snippet Truncation Confusion
**What goes wrong:** Users expect full message but get truncated snippet
**Why it happens:** snippet() limited to 32 tokens by design
**How to avoid:** Document that results show snippets; use `aidev memory show <id>` for full message
**Warning signs:** User complaints about "incomplete" results

## Code Examples

Verified patterns from existing codebase and official sources:

### FTS5 snippet() Function
```sql
-- Source: https://www.sqlite.org/fts5.html
-- Syntax: snippet(table, column_index, start_marker, end_marker, ellipsis, max_tokens)
snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32)
```
Parameters:
- `0`: Column index (content column)
- `'<mark>'`: HTML tag before matches
- `'</mark>'`: HTML tag after matches
- `'...'`: Ellipsis for truncation
- `32`: Maximum tokens (words) in snippet

### FTS5 highlight() Function (Alternative)
```sql
-- Source: https://www.sqlite.org/fts5.html
-- Returns full column value with matches highlighted
highlight(messages_fts, 0, '<mark>', '</mark>')
```
Use when: Full message needed instead of truncated snippet

### BM25 Ranking
```sql
-- Source: https://www.sqlite.org/fts5.html
-- Lower values = better match (sort ASC)
SELECT *, bm25(messages_fts) as score
FROM messages_fts
WHERE messages_fts MATCH ?
ORDER BY score  -- ASC (most negative = best)
LIMIT ?
```

### Case Sensitivity Handling
FTS5 unicode61 tokenizer is case-insensitive by default. Options for case-sensitive search:

**Option A: Post-filter with GLOB (Recommended)**
```typescript
// Source: SQLite documentation
// GLOB is case-sensitive by default
const results = await searchService.search(query, { limit: limit * 2 });
return caseSensitive
  ? results.filter(r => r.snippet.includes(query.value))
  : results;
```

**Option B: Trigram tokenizer (Not recommended)**
```sql
-- Would require schema change, not worth it for this feature
CREATE VIRTUAL TABLE ... USING fts5(..., tokenize="trigram case_sensitive 1");
```

### Commander.js Search Command Pattern
```typescript
// Source: https://github.com/tj/commander.js
import { Command } from "commander";

export function createSearchCommand(): Command {
  return new Command("search")
    .argument("<query>", "Search query text")
    .option("-l, --limit <count>", "Maximum results to return", "10")
    .option("-p, --project <name>", "Filter by project name")
    .option("-i, --ignore-case", "Case-insensitive search (default)")
    .option("-c, --case-sensitive", "Case-sensitive search")
    .action(async (query: string, options: SearchCommandOptions) => {
      await executeSearchCommand(query, options);
    });
}
```

### Existing SearchService Usage
```typescript
// Source: src/infrastructure/database/services/search-service.ts
const query = SearchQuery.from("authentication");
const results = await searchService.search(query, {
  limit: 10,
  projectFilter: projectPath,  // Optional
  roleFilter: "user",          // Optional
});

// Results are SearchResult objects with:
// - sessionId: string
// - messageId: string
// - snippet: string (with <mark> tags)
// - score: number (0-1, higher = more relevant)
// - timestamp: Date
```

### Result Formatting for CLI
```typescript
// Recommended output format
function formatResult(result: SearchResult, index: number): string {
  const score = (result.score * 100).toFixed(0);
  const date = result.timestamp.toLocaleDateString();
  const snippet = result.snippet
    .replace(/<mark>/g, '\x1b[1m')   // Bold start
    .replace(/<\/mark>/g, '\x1b[0m'); // Reset

  return `${index + 1}. [${score}%] ${result.sessionId} (${date})\n   ${snippet}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FTS3/FTS4 | FTS5 | SQLite 3.9.0 (2015) | Better ranking, auxiliary functions |
| custom ranking | BM25 built-in | FTS5 default | No custom code needed |
| `=` operator | `MATCH` operator | Always (FTS5) | Critical for performance |

**Deprecated/outdated:**
- FTS3/FTS4: Superseded by FTS5, less features
- External content tables without triggers: FTS5 handles sync automatically

## Open Questions

Things that couldn't be fully resolved:

1. **Case-sensitive search performance**
   - What we know: Post-filtering with GLOB works but may return fewer results than limit
   - What's unclear: Whether to fetch 2x limit and filter, or different approach
   - Recommendation: Fetch 2x limit, filter, cap at actual limit. Document this behavior.

2. **Result formatting for Claude vs human**
   - What we know: Both use same CLI commands
   - What's unclear: Whether terminal colors help Claude, or should detect and disable
   - Recommendation: Use ANSI codes by default; add --no-color flag for piping/scripting

3. **Project filter matching**
   - What we know: SearchOptions uses ProjectPath object
   - What's unclear: Should CLI accept project name or full path?
   - Recommendation: Accept project name, resolve to ProjectPath internally

## Sources

### Primary (HIGH confidence)
- SQLite FTS5 Official Documentation: https://www.sqlite.org/fts5.html
  - snippet() function syntax and parameters
  - highlight() function syntax
  - bm25() ranking algorithm
  - MATCH operator usage
  - Tokenizer case sensitivity behavior
- Existing codebase: `src/infrastructure/database/services/search-service.ts`
  - BM25 normalization implementation
  - Snippet extraction configuration
  - Filter query building
- Commander.js GitHub: https://github.com/tj/commander.js
  - Argument and option syntax
  - Action handler patterns

### Secondary (MEDIUM confidence)
- Bun SQLite Documentation: https://bun.com/docs/runtime/sqlite
  - Prepared statement caching
  - WAL mode configuration

### Tertiary (LOW confidence)
- None - all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already in use
- Architecture: HIGH - patterns established in Phase 5
- Pitfalls: HIGH - verified with official FTS5 documentation
- Case sensitivity: MEDIUM - post-filter approach is workaround, not native

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (30 days - stable domain)
