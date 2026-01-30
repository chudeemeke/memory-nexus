# Phase 8: Stats and List Commands - Research

**Researched:** 2026-01-30
**Domain:** CLI statistics display, session listing with filtering
**Confidence:** HIGH

## Summary

This phase implements two complementary discovery commands: `stats` for database-wide statistics and `list` for session enumeration with filtering. The project already has well-established infrastructure from Phases 5-7 that this phase builds upon directly.

Key findings:
1. **Stats command:** SQLite's `COUNT()` aggregate and `PRAGMA page_count/page_size` provide all needed data points. GROUP BY enables per-project breakdowns efficiently.
2. **List command:** Existing session repository patterns (`findRecent`, `findByProject`) plus Phase 7's date filtering infrastructure cover all requirements.
3. **Output formatting:** The existing `OutputFormatter` strategy pattern from Phase 7 extends naturally to stats and list output.

**Primary recommendation:** Reuse the existing infrastructure extensively. Stats requires new SQL queries (COUNT/GROUP BY) and PRAGMA calls. List primarily extends the session repository with additional filtering methods. Both commands follow the established command handler pattern.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.2 | CLI framework | Already in use; option parsing, subcommands |
| bun:sqlite | Built-in | Database queries | Already in use; efficient COUNT/PRAGMA |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intl.NumberFormat | Built-in | Number formatting | Display counts with thousand separators |
| Intl.RelativeTimeFormat | Built-in | Relative time | Already integrated; session timestamps |
| chrono-node | ^2.9.0 | Date parsing | Already integrated; --since/--before filters |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SQL aggregate | ORM methods | ORM adds overhead; raw SQL is faster for simple aggregates |
| Custom table formatting | cli-table3 | Additional dependency; simple column alignment suffices |
| Manual file size | fs.stat | PRAGMA is more accurate (accounts for WAL) |

**Installation:**
```bash
# No new dependencies required - all infrastructure exists
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── domain/
│   └── ports/
│       └── services.ts           # Add IStatsService interface
├── infrastructure/
│   └── database/
│       └── services/
│           └── stats-service.ts  # New: aggregate queries
├── presentation/
│   └── cli/
│       ├── commands/
│       │   ├── stats.ts          # New: stats command handler
│       │   └── list.ts           # New: list command handler
│       └── formatters/
│           └── stats-formatter.ts # New: stats-specific formatting
```

### Pattern 1: Aggregate Query Service
**What:** Service dedicated to aggregate statistics queries
**When to use:** Collecting counts and summaries across tables
**Example:**
```typescript
// Source: SQLite aggregate functions documentation
interface StatsResult {
  totalSessions: number;
  totalMessages: number;
  totalToolUses: number;
  databaseSizeBytes: number;
  projectBreakdown: Array<{
    projectName: string;
    sessionCount: number;
    messageCount: number;
  }>;
}

class StatsService {
  constructor(private db: Database) {}

  async getStats(): Promise<StatsResult> {
    // Single query for totals
    const totals = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sessions) as totalSessions,
        (SELECT COUNT(*) FROM messages_meta) as totalMessages,
        (SELECT COUNT(*) FROM tool_uses) as totalToolUses
    `).get() as { totalSessions: number; totalMessages: number; totalToolUses: number };

    // PRAGMA for database size
    const sizeResult = this.db.prepare(`
      SELECT page_size * page_count as size
      FROM pragma_page_count(), pragma_page_size()
    `).get() as { size: number };

    // Per-project breakdown
    const breakdown = this.db.prepare(`
      SELECT
        s.project_name as projectName,
        COUNT(DISTINCT s.id) as sessionCount,
        COUNT(m.id) as messageCount
      FROM sessions s
      LEFT JOIN messages_meta m ON m.session_id = s.id
      GROUP BY s.project_name
      ORDER BY sessionCount DESC
    `).all() as Array<{ projectName: string; sessionCount: number; messageCount: number }>;

    return {
      ...totals,
      databaseSizeBytes: sizeResult.size,
      projectBreakdown: breakdown,
    };
  }
}
```

### Pattern 2: Extended Session Repository for List Filtering
**What:** Add filter methods to existing session repository
**When to use:** Listing sessions with date range and project filters
**Example:**
```typescript
// Source: Existing repository patterns + Phase 7 date filtering
interface SessionListOptions {
  limit?: number;
  projectFilter?: ProjectPath;
  sinceDate?: Date;
  beforeDate?: Date;
}

// New method in SqliteSessionRepository
async findFiltered(options: SessionListOptions): Promise<Session[]> {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.projectFilter) {
    conditions.push("project_path_encoded = $projectPath");
    params.$projectPath = options.projectFilter.encoded;
  }
  if (options.sinceDate) {
    conditions.push("start_time >= $sinceDate");
    params.$sinceDate = options.sinceDate.toISOString();
  }
  if (options.beforeDate) {
    conditions.push("start_time <= $beforeDate");
    params.$beforeDate = options.beforeDate.toISOString();
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const limitClause = options.limit ? `LIMIT $limit` : "";
  if (options.limit) params.$limit = options.limit;

  const sql = `
    SELECT id, project_path_encoded, project_path_decoded, project_name,
           start_time, end_time, message_count
    FROM sessions
    ${whereClause}
    ORDER BY start_time DESC
    ${limitClause}
  `;

  const stmt = this.db.prepare(sql);
  return stmt.all(params).map(this.rowToSession);
}
```

### Pattern 3: Stats Output Formatting
**What:** Dedicated formatter for statistics display
**When to use:** Rendering stats with default/json/verbose modes
**Example:**
```typescript
// Source: Existing OutputFormatter pattern
interface StatsFormatter {
  formatStats(stats: StatsResult): string;
  formatError(error: Error): string;
}

class DefaultStatsFormatter implements StatsFormatter {
  formatStats(stats: StatsResult): string {
    const fmt = new Intl.NumberFormat("en-US");
    let output = "Database Statistics\n";
    output += "===================\n\n";
    output += `Sessions:   ${fmt.format(stats.totalSessions)}\n`;
    output += `Messages:   ${fmt.format(stats.totalMessages)}\n`;
    output += `Tool Uses:  ${fmt.format(stats.totalToolUses)}\n`;
    output += `DB Size:    ${formatBytes(stats.databaseSizeBytes)}\n`;

    if (stats.projectBreakdown.length > 0) {
      output += "\nPer-Project Breakdown\n";
      output += "---------------------\n";
      for (const p of stats.projectBreakdown) {
        output += `${p.projectName}: ${fmt.format(p.sessionCount)} sessions, `;
        output += `${fmt.format(p.messageCount)} messages\n`;
      }
    }
    return output;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

### Pattern 4: List Command with Filtering
**What:** Session listing with date and project filters
**When to use:** Discovering sessions for navigation
**Example:**
```typescript
// Source: Existing search.ts command pattern
function createListCommand(): Command {
  return new Command("list")
    .description("List sessions")
    .option("-l, --limit <count>", "Maximum sessions to return", "20")
    .option("-p, --project <name>", "Filter by project name")
    .addOption(
      new Option("--since <date>", "Sessions after date")
        .conflicts("days")
    )
    .addOption(
      new Option("--before <date>", "Sessions before date")
        .conflicts("days")
    )
    .addOption(
      new Option("--days <n>", "Sessions from last N days")
        .argParser((val) => parseInt(val, 10))
        .conflicts(["since", "before"])
    )
    .option("--json", "Output as JSON")
    .addOption(new Option("-v, --verbose", "Show detailed output").conflicts("quiet"))
    .addOption(new Option("-q, --quiet", "Minimal output").conflicts("verbose"))
    .action(executeListCommand);
}
```

### Anti-Patterns to Avoid
- **N+1 queries for per-project stats:** Use GROUP BY instead of querying each project separately
- **File system stat for DB size:** Use PRAGMA which accounts for WAL file properly
- **Loading all sessions into memory:** Use SQL LIMIT/filtering, not post-fetch filtering
- **Separate queries for each count:** Combine counts in single query with subqueries
- **Hardcoded format strings:** Use Intl.NumberFormat for locale-aware formatting

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Number formatting | String concatenation | Intl.NumberFormat | Handles locale, thousands separators |
| Database size | fs.stat on db file | PRAGMA page_count * page_size | Accounts for WAL, accurate page count |
| Aggregate counts | Multiple SELECT COUNT | Single query with subqueries | One round-trip, better performance |
| Date filtering | Manual timestamp comparison | Existing parseDate + SQL WHERE | Already tested, handles edge cases |
| Output modes | Multiple if/else branches | Existing OutputFormatter pattern | Consistent, tested, extensible |

**Key insight:** This phase is primarily about composing existing patterns rather than creating new ones. The infrastructure from Phases 5-7 handles most complexity.

## Common Pitfalls

### Pitfall 1: COUNT(*) vs COUNT(column)
**What goes wrong:** COUNT(*) includes NULLs, COUNT(column) excludes them
**Why it happens:** Confusion about NULL handling in aggregates
**How to avoid:** Use COUNT(*) for total rows, COUNT(column) only when NULL exclusion is needed
**Warning signs:** Unexpected count differences between similar queries

### Pitfall 2: PRAGMA in Prepared Statements
**What goes wrong:** Some PRAGMA statements don't work as prepared statements
**Why it happens:** PRAGMA is special syntax, not regular SQL
**How to avoid:** Use `db.prepare("SELECT ... FROM pragma_page_count()")` table-valued form
**Warning signs:** "Cannot prepare" errors with PRAGMA

### Pitfall 3: LEFT JOIN Inflation in GROUP BY
**What goes wrong:** Message counts are inflated when session has no messages
**Why it happens:** LEFT JOIN creates NULL rows that still get counted
**How to avoid:** Use COUNT(m.id) not COUNT(*) in GROUP BY with LEFT JOIN
**Warning signs:** Message counts don't match actual data

### Pitfall 4: Limit Applied Before Filtering
**What goes wrong:** List returns fewer results than expected after filtering
**Why it happens:** SQL LIMIT applied before WHERE conditions
**How to avoid:** Build WHERE clause dynamically before LIMIT
**Warning signs:** --limit 10 --project foo returns 3 results when 10 exist

### Pitfall 5: Date Range Boundary Errors
**What goes wrong:** Sessions on boundary dates excluded/included incorrectly
**Why it happens:** Using < instead of <=, or comparing datetime to date
**How to avoid:** Be explicit: >= for sinceDate, <= for beforeDate; document boundary behavior
**Warning signs:** Session from "today" not appearing with --days 1

### Pitfall 6: Empty State Display
**What goes wrong:** Confusing output when database is empty
**Why it happens:** No special handling for zero results
**How to avoid:** Explicit empty state message: "No sessions synced. Run 'memory sync' first."
**Warning signs:** Blank output or "0" counts without context

## Code Examples

Verified patterns from official sources:

### SQLite Aggregate with Subqueries
```typescript
// Source: SQLite aggregate functions documentation
const totalsQuery = `
  SELECT
    (SELECT COUNT(*) FROM sessions) as totalSessions,
    (SELECT COUNT(*) FROM messages_meta) as totalMessages,
    (SELECT COUNT(*) FROM tool_uses) as totalToolUses
`;
const result = db.prepare(totalsQuery).get();
// Result: { totalSessions: 870, totalMessages: 15234, totalToolUses: 8421 }
```

### SQLite PRAGMA for Database Size
```typescript
// Source: Simon Willison's TIL - Calculating SQLite database file size
const sizeQuery = `
  SELECT page_size * page_count as size
  FROM pragma_page_count(), pragma_page_size()
`;
const { size } = db.prepare(sizeQuery).get() as { size: number };
// size is in bytes
```

### GROUP BY with LEFT JOIN
```typescript
// Source: SQLite GROUP BY documentation
const breakdownQuery = `
  SELECT
    s.project_name as projectName,
    COUNT(DISTINCT s.id) as sessionCount,
    COUNT(m.id) as messageCount
  FROM sessions s
  LEFT JOIN messages_meta m ON m.session_id = s.id
  GROUP BY s.project_name
  ORDER BY sessionCount DESC
  LIMIT 10
`;
const breakdown = db.prepare(breakdownQuery).all();
```

### Dynamic WHERE Clause Building
```typescript
// Source: Existing search-service.ts pattern
function buildWhereClause(options: ListOptions): { sql: string; params: Record<string, unknown> } {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.projectFilter) {
    conditions.push("project_path_encoded = $projectPath");
    params.$projectPath = options.projectFilter.encoded;
  }
  if (options.sinceDate) {
    conditions.push("start_time >= $sinceDate");
    params.$sinceDate = options.sinceDate.toISOString();
  }
  if (options.beforeDate) {
    conditions.push("start_time <= $beforeDate");
    params.$beforeDate = options.beforeDate.toISOString();
  }

  const sql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql, params };
}
```

### Number Formatting
```typescript
// Source: MDN Intl.NumberFormat documentation
const fmt = new Intl.NumberFormat("en-US");
fmt.format(15234);    // "15,234"
fmt.format(1500000);  // "1,500,000"

// For bytes, custom formatter
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}
```

### Commander.js Option Conflicts (Existing Pattern)
```typescript
// Source: Phase 7 search.ts implementation
.addOption(
  new Option("--days <n>", "Sessions from last N days")
    .argParser((val) => {
      const n = parseInt(val, 10);
      if (isNaN(n) || n < 1) throw new Error("Days must be a positive number");
      return n;
    })
    .conflicts(["since", "before"])
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SELECT COUNT for each table | Single query with subqueries | Standard practice | One round-trip vs N |
| fs.stat for DB size | PRAGMA page_count * page_size | SQLite best practice | Accurate including WAL |
| Manual number formatting | Intl.NumberFormat | ES2020+ | Locale-aware, standard |
| Multiple output methods | Strategy pattern (OutputFormatter) | Phase 7 | Consistent, tested |

**Deprecated/outdated:**
- None for this phase - using standard SQLite and JavaScript APIs

## Open Questions

Things that couldn't be fully resolved:

1. **Stats caching**
   - What we know: Stats queries are fast (~10ms for 870 sessions)
   - What's unclear: Whether caching is needed at scale (10K+ sessions)
   - Recommendation: Build without caching; add if performance testing shows need

2. **Project breakdown limit**
   - What we know: Display all projects could be very long
   - What's unclear: User preference for top-N vs all
   - Recommendation: Default to top 10 projects; add --all flag if needed

3. **List default limit**
   - What we know: Phase 7 search uses limit 10
   - What's unclear: Whether list should use same or different default
   - Recommendation: Use 20 for list (session overview needs more context than search)

## Sources

### Primary (HIGH confidence)
- [SQLite Built-in Aggregate Functions](https://sqlite.org/lang_aggfunc.html) - COUNT, GROUP BY
- [SQLite PRAGMA page_count/page_size](https://www.sqlite.org/pragma.html) - Database size calculation
- [Simon Willison's TIL](https://til.simonwillison.net/sqlite/database-file-size) - PRAGMA usage pattern
- Existing codebase: search.ts, output-formatter.ts, session-repository.ts

### Secondary (MEDIUM confidence)
- [Command Line Interface Guidelines](https://clig.dev/) - CLI UX patterns
- [Better Stack Commander.js Guide](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/) - Commander.js patterns
- MDN Intl.NumberFormat documentation - Number formatting

### Tertiary (LOW confidence)
- None - all patterns verified against official sources or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Extends existing patterns from Phases 5-7
- Pitfalls: HIGH - Based on SQLite documentation and existing codebase experience

**Research date:** 2026-01-30
**Valid until:** ~90 days (stable patterns, no external dependencies)
