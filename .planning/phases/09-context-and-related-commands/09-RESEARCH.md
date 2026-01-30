# Phase 9: Context and Related Commands - Research

**Researched:** 2026-01-30
**Domain:** Project context aggregation, graph-based relationship traversal with SQLite
**Confidence:** HIGH

## Summary

This phase implements two distinct but related commands: `context` for aggregating project-wide information from recent sessions, and `related` for finding sessions connected through shared topics/entities using graph traversal. The project already has robust infrastructure from Phases 5-8 that this phase extends directly.

Key findings:
1. **Context command:** Aggregates recent messages, tool uses, and session metadata for a specific project. Uses existing session repository filtering plus message aggregation with GROUP BY. The "--days N" filter pattern is already established in search.ts.
2. **Related command:** SQLite's WITH RECURSIVE CTE enables efficient multi-hop graph traversal on the existing links table. Direct (1-hop) relationships are simple JOINs; 2-hop relationships require recursive CTEs with depth tracking.
3. **SqliteLinkRepository:** Must implement ILinkRepository port (already defined). The findRelated() method is the core challenge, requiring recursive SQL for 2-hop traversal with cycle prevention and weight-based ranking.

**Primary recommendation:** Build SqliteLinkRepository first (REL-03) since both commands depend on relationship data. Context command focuses on aggregation queries on existing tables. Related command uses recursive CTEs for graph traversal. Follow established formatter and command handler patterns.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in | Database queries + WITH RECURSIVE | Already in use; native recursive CTE support |
| commander | ^14.0.2 | CLI framework | Already in use; established option patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrono-node | ^2.9.0 | Date parsing | Already integrated for --days filter |
| Intl.NumberFormat | Built-in | Number formatting | Display counts consistently |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WITH RECURSIVE | Application-level BFS | SQL is faster, avoids N+1 queries |
| Weight normalization | Raw weights | Normalized 0-100% is more intuitive |
| Brief/detailed formats | Single format | Flexibility for different use cases |

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
│       └── repositories.ts      # ILinkRepository already defined
├── infrastructure/
│   └── database/
│       └── repositories/
│           └── link-repository.ts  # New: SqliteLinkRepository
├── presentation/
│   └── cli/
│       ├── commands/
│       │   ├── context.ts          # New: context command handler
│       │   └── related.ts          # New: related command handler
│       └── formatters/
│           ├── context-formatter.ts # New: context-specific formatting
│           └── related-formatter.ts # New: related-specific formatting
```

### Pattern 1: SqliteLinkRepository with Recursive CTE
**What:** Repository implementing graph traversal for relationship queries
**When to use:** Finding related entities within N hops
**Example:**
```typescript
// Source: SQLite WITH clause documentation
class SqliteLinkRepository implements ILinkRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async findBySource(sourceType: EntityType, sourceId: string): Promise<Link[]> {
    const stmt = this.db.prepare(`
      SELECT source_type, source_id, target_type, target_id, relationship, weight
      FROM links
      WHERE source_type = $sourceType AND source_id = $sourceId
    `);
    const rows = stmt.all({ $sourceType: sourceType, $sourceId: sourceId });
    return rows.map(this.rowToLink);
  }

  async findRelated(
    entityType: EntityType,
    entityId: string,
    maxHops: number = 2
  ): Promise<Link[]> {
    // Use WITH RECURSIVE for multi-hop traversal
    const stmt = this.db.prepare(`
      WITH RECURSIVE related(
        source_type, source_id, target_type, target_id,
        relationship, weight, hop, path
      ) AS (
        -- Base case: direct connections (1-hop)
        SELECT
          source_type, source_id, target_type, target_id,
          relationship, weight, 1 as hop,
          source_type || ':' || source_id || '->' || target_type || ':' || target_id as path
        FROM links
        WHERE source_type = $entityType AND source_id = $entityId

        UNION ALL

        -- Recursive case: next level of connections
        SELECT
          l.source_type, l.source_id, l.target_type, l.target_id,
          l.relationship, l.weight * r.weight, r.hop + 1,
          r.path || '->' || l.target_type || ':' || l.target_id
        FROM links l
        JOIN related r ON l.source_type = r.target_type AND l.source_id = r.target_id
        WHERE r.hop < $maxHops
          -- Prevent cycles: don't revisit nodes in current path
          AND r.path NOT LIKE '%' || l.target_type || ':' || l.target_id || '%'
      )
      SELECT DISTINCT source_type, source_id, target_type, target_id, relationship, weight, hop
      FROM related
      ORDER BY hop ASC, weight DESC
    `);

    const rows = stmt.all({
      $entityType: entityType,
      $entityId: entityId,
      $maxHops: maxHops,
    });

    return rows.map((row) => this.rowToLinkWithHop(row));
  }

  private rowToLink(row: LinkRow): Link {
    return Link.create({
      sourceType: row.source_type as EntityType,
      sourceId: row.source_id,
      targetType: row.target_type as EntityType,
      targetId: row.target_id,
      relationship: row.relationship as LinkType,
      weight: row.weight,
    });
  }
}
```

### Pattern 2: Context Aggregation Service
**What:** Service aggregating project context from recent sessions
**When to use:** Building project overview from multiple sessions
**Example:**
```typescript
// Source: Existing stats-service.ts and search-service.ts patterns
interface ProjectContext {
  projectName: string;
  sessionCount: number;
  totalMessages: number;
  recentTopics: string[];
  recentToolUses: Array<{ name: string; count: number }>;
  lastActivity: Date;
  summarySnippets: string[];
}

interface ContextOptions {
  days?: number;
  format?: "brief" | "detailed";
}

async function getProjectContext(
  projectPath: ProjectPath,
  options: ContextOptions
): Promise<ProjectContext> {
  // Calculate date filter from --days
  const sinceDate = options.days
    ? new Date(Date.now() - (options.days - 1) * 24 * 60 * 60 * 1000)
    : undefined;

  // Aggregate session data
  const sessionsQuery = `
    SELECT
      COUNT(*) as sessionCount,
      MAX(start_time) as lastActivity
    FROM sessions
    WHERE project_path_encoded = $projectPath
    ${sinceDate ? "AND start_time >= $sinceDate" : ""}
  `;

  // Aggregate messages per role
  const messagesQuery = `
    SELECT role, COUNT(*) as count
    FROM messages_meta m
    JOIN sessions s ON m.session_id = s.id
    WHERE s.project_path_encoded = $projectPath
    ${sinceDate ? "AND m.timestamp >= $sinceDate" : ""}
    GROUP BY role
  `;

  // Top tool uses
  const toolsQuery = `
    SELECT name, COUNT(*) as count
    FROM tool_uses t
    JOIN sessions s ON t.session_id = s.id
    WHERE s.project_path_encoded = $projectPath
    ${sinceDate ? "AND t.timestamp >= $sinceDate" : ""}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 10
  `;

  // Topics from links table
  const topicsQuery = `
    SELECT DISTINCT l.target_id as topic
    FROM links l
    JOIN sessions s ON l.source_type = 'session' AND l.source_id = s.id
    WHERE s.project_path_encoded = $projectPath
      AND l.target_type = 'topic'
    ORDER BY l.weight DESC
    LIMIT 10
  `;

  // Execute queries and aggregate
  // ...
}
```

### Pattern 3: Brief vs Detailed Format
**What:** Two output formats for context command
**When to use:** CTX-04 requirement - different verbosity levels
**Example:**
```typescript
// Source: Existing list-formatter.ts pattern
interface ContextFormatter {
  formatContext(context: ProjectContext, options?: ContextFormatOptions): string;
  formatError(error: Error): string;
  formatEmpty(projectName: string): string;
}

class BriefContextFormatter implements ContextFormatter {
  formatContext(context: ProjectContext): string {
    // Compact summary: counts and recent activity only
    return [
      `${context.projectName} Context`,
      `Sessions: ${context.sessionCount} | Messages: ${context.totalMessages}`,
      `Last active: ${formatRelativeTime(context.lastActivity)}`,
      `Topics: ${context.recentTopics.slice(0, 5).join(", ") || "none"}`,
    ].join("\n");
  }
}

class DetailedContextFormatter implements ContextFormatter {
  formatContext(context: ProjectContext): string {
    // Full breakdown with tool uses, message excerpts
    let output = `${context.projectName} Context\n`;
    output += "=".repeat(40) + "\n\n";

    output += `Sessions: ${context.sessionCount}\n`;
    output += `Messages: ${context.totalMessages}\n`;
    output += `Last active: ${formatTimestamp(context.lastActivity)}\n\n`;

    if (context.recentTopics.length > 0) {
      output += "Topics:\n";
      for (const topic of context.recentTopics) {
        output += `  - ${topic}\n`;
      }
      output += "\n";
    }

    if (context.recentToolUses.length > 0) {
      output += "Tool Usage:\n";
      for (const tool of context.recentToolUses) {
        output += `  - ${tool.name}: ${tool.count} times\n`;
      }
      output += "\n";
    }

    return output;
  }
}
```

### Pattern 4: Related Command with Weight Ranking
**What:** Finding and ranking related sessions by relationship weight
**When to use:** REL-05 requirement - weight-based relationship ranking
**Example:**
```typescript
// Source: Existing search.ts command pattern + ILinkRepository
async function executeRelatedCommand(
  id: string,
  options: RelatedCommandOptions
): Promise<void> {
  const { db } = initializeDatabase({ path: getDefaultDbPath() });

  try {
    const linkRepo = new SqliteLinkRepository(db);
    const sessionRepo = new SqliteSessionRepository(db);

    // Determine entity type from ID format or explicit option
    const entityType = options.type ?? inferEntityType(id);

    // Find related entities (1-hop and 2-hop)
    const links = await linkRepo.findRelated(entityType, id, 2);

    // Group by target session and sum weights
    const sessionWeights = new Map<string, { weight: number; hops: number }>();
    for (const link of links) {
      if (link.targetType === "session") {
        const existing = sessionWeights.get(link.targetId);
        if (!existing || link.weight > existing.weight) {
          sessionWeights.set(link.targetId, {
            weight: link.weight,
            hops: link.hop ?? 1,
          });
        }
      }
    }

    // Sort by weight descending
    const sortedSessions = Array.from(sessionWeights.entries())
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, options.limit ?? 10);

    // Fetch full session details
    const sessions = await Promise.all(
      sortedSessions.map(async ([sessionId, meta]) => {
        const session = await sessionRepo.findById(sessionId);
        return { session, weight: meta.weight, hops: meta.hops };
      })
    );

    // Format and output
    const formatter = createRelatedFormatter(outputMode, useColor);
    console.log(formatter.formatRelated(sessions, { sourceId: id }));
  } finally {
    closeDatabase(db);
  }
}
```

### Anti-Patterns to Avoid
- **Application-level graph traversal:** Use SQL WITH RECURSIVE instead of fetching nodes and traversing in JS
- **N+1 queries for session details:** Batch fetch related sessions after grouping link results
- **Unbounded recursive CTE:** Always include maxHops limit and cycle prevention
- **Weight multiplication overflow:** Weights are 0-1; multiplication naturally bounds the result
- **Ignoring hop distance in ranking:** Closer relationships (fewer hops) should rank higher when weights are equal

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph traversal | BFS in JavaScript | WITH RECURSIVE CTE | Single query, SQL optimizer handles efficiently |
| Cycle detection | Path array checking | SQL LIKE on path string | Built into recursive CTE pattern |
| Date range calculation | Manual Date math | Existing --days pattern from search.ts | Already tested, handles edge cases |
| Output formatting | Custom string building | Existing formatter strategy pattern | Consistent, tested, supports all modes |
| Weight normalization | Custom scaling | Weight already 0-1 in schema | Domain entity validates range |

**Key insight:** The heavy lifting for this phase is SQL query design, not JavaScript logic. The recursive CTE handles graph traversal complexity; the command handlers wire existing patterns together.

## Common Pitfalls

### Pitfall 1: Infinite Recursion in CTE
**What goes wrong:** Recursive CTE runs forever on cyclic graph
**Why it happens:** Links can form cycles (A -> B -> C -> A)
**How to avoid:** Use path tracking with LIKE check: `WHERE path NOT LIKE '%' || target_id || '%'`
**Warning signs:** Query hangs, high CPU, eventually crashes

### Pitfall 2: Weight Decay on Multi-Hop
**What goes wrong:** 2-hop relationships have same weight as 1-hop
**Why it happens:** Not multiplying weights through the path
**How to avoid:** Multiply `l.weight * r.weight` in recursive SELECT
**Warning signs:** 2-hop results rank equal to 1-hop results

### Pitfall 3: Duplicate Results from Multiple Paths
**What goes wrong:** Same session appears multiple times via different paths
**Why it happens:** Recursive CTE finds all paths, not distinct endpoints
**How to avoid:** Use SELECT DISTINCT or group by target_id and take max weight
**Warning signs:** Related list shows same session multiple times

### Pitfall 4: Empty Context When Links Not Populated
**What goes wrong:** Context command shows no topics/relationships
**Why it happens:** Links table may not have data until EXTR phase (Phase 11)
**How to avoid:** Handle gracefully - show "no topics extracted yet" message
**Warning signs:** Context works for sessions but topics are always empty

### Pitfall 5: Project Path Matching Issues
**What goes wrong:** Context command finds no sessions for project
**Why it happens:** Using project_name instead of project_path_encoded for lookup
**How to avoid:** Use ProjectPath.fromDecoded() then match on .encoded for DB queries
**Warning signs:** "No sessions found" when sessions clearly exist

### Pitfall 6: Days Filter Off-By-One
**What goes wrong:** --days 1 excludes today's sessions
**Why it happens:** Calculating sinceDate as exactly 24h ago instead of start of today minus (N-1) days
**How to avoid:** Follow existing pattern from search.ts: start of today - (days-1) * 24h
**Warning signs:** Today's sessions missing with --days 1

## Code Examples

Verified patterns from official sources:

### SQLite Recursive CTE for 2-Hop Graph Traversal
```sql
-- Source: https://sqlite.org/lang_with.html
WITH RECURSIVE related(
  target_type, target_id, weight, hop, path
) AS (
  -- Anchor: direct connections from source entity
  SELECT
    target_type, target_id, weight, 1 as hop,
    target_type || ':' || target_id as path
  FROM links
  WHERE source_type = 'session' AND source_id = $sessionId

  UNION ALL

  -- Recursive: next level connections
  SELECT
    l.target_type, l.target_id,
    l.weight * r.weight,  -- Weight decay through path
    r.hop + 1,
    r.path || '->' || l.target_type || ':' || l.target_id
  FROM links l
  JOIN related r ON l.source_type = r.target_type AND l.source_id = r.target_id
  WHERE r.hop < 2
    AND r.path NOT LIKE '%' || l.target_type || ':' || l.target_id || '%'
)
SELECT DISTINCT target_type, target_id, MAX(weight) as weight, MIN(hop) as hop
FROM related
GROUP BY target_type, target_id
ORDER BY hop ASC, weight DESC;
```

### Context Aggregation Queries
```sql
-- Source: Existing stats-service.ts patterns
-- Session and message counts for project
SELECT
  COUNT(DISTINCT s.id) as sessionCount,
  COUNT(m.id) as messageCount,
  MAX(s.start_time) as lastActivity
FROM sessions s
LEFT JOIN messages_meta m ON m.session_id = s.id
WHERE s.project_path_encoded = $projectPath
  AND s.start_time >= $sinceDate;

-- Tool usage breakdown
SELECT name, COUNT(*) as count
FROM tool_uses t
JOIN sessions s ON t.session_id = s.id
WHERE s.project_path_encoded = $projectPath
  AND t.timestamp >= $sinceDate
GROUP BY name
ORDER BY count DESC
LIMIT 10;

-- Topics from links
SELECT DISTINCT l.target_id as topic, SUM(l.weight) as totalWeight
FROM links l
JOIN sessions s ON l.source_type = 'session' AND l.source_id = s.id
WHERE s.project_path_encoded = $projectPath
  AND l.target_type = 'topic'
GROUP BY l.target_id
ORDER BY totalWeight DESC
LIMIT 10;
```

### Days Filter Calculation (Existing Pattern)
```typescript
// Source: Existing search.ts implementation
if (options.days) {
  // --days N = today + past N-1 days
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  sinceDate = new Date(startOfToday.getTime() - (options.days - 1) * 24 * 60 * 60 * 1000);
}
```

### Commander.js Command with Format Option
```typescript
// Source: Existing list.ts pattern
.addOption(
  new Option("--format <type>", "Output format")
    .choices(["brief", "detailed"])
    .default("brief")
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application BFS | WITH RECURSIVE CTE | SQLite 3.8.3+ (2014) | Single query, better performance |
| Multiple queries for aggregates | GROUP BY with subqueries | Standard practice | One round-trip |
| Hardcoded format strings | Formatter strategy pattern | Phase 7 | Consistent output modes |

**Deprecated/outdated:**
- None for this phase - using standard SQLite recursive CTEs and established codebase patterns

## Open Questions

Things that couldn't be fully resolved:

1. **Link data population timing**
   - What we know: ILinkRepository is defined; links table exists
   - What's unclear: Phase 11 (EXTR) populates topic links; current phases may have empty links
   - Recommendation: Handle empty links gracefully; document dependency on Phase 11 for full functionality

2. **Entity type inference for related command**
   - What we know: ID format varies (session UUIDs vs message UUIDs vs topic names)
   - What's unclear: Whether to require explicit --type or infer from ID format
   - Recommendation: Add optional --type flag; default to "session" for UUID-like IDs

3. **Context format - what to include in "detailed"**
   - What we know: Brief shows counts; detailed should show more
   - What's unclear: Exactly what additional detail is most useful
   - Recommendation: Start with tool usage + topics + recent message snippets; iterate based on usage

4. **Related command - handling sessions with no links**
   - What we know: Some sessions may have no extracted relationships yet
   - What's unclear: Whether to show "no related sessions" or suggest running extraction
   - Recommendation: Show helpful message with suggestion to run sync/extract if links table is empty

## Sources

### Primary (HIGH confidence)
- [SQLite WITH Clause Documentation](https://sqlite.org/lang_with.html) - Recursive CTE syntax and graph traversal examples
- [SQLite Built-in Aggregate Functions](https://sqlite.org/lang_aggfunc.html) - COUNT, GROUP BY patterns
- Existing codebase: repositories.ts, search.ts, stats.ts, list-formatter.ts, output-formatter.ts

### Secondary (MEDIUM confidence)
- [SQLite Recursive Queries for Graph Traversal](https://runebook.dev/en/articles/sqlite/lang_with/rcex3) - Additional CTE examples
- [GeeksforGeeks SQLite Hierarchical Recursive Query](https://www.geeksforgeeks.org/sqlite/how-to-create-a-sqlite-hierarchical-recursive-query/) - Depth tracking patterns

### Tertiary (LOW confidence)
- None - all patterns verified against official SQLite documentation or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Extends existing patterns from Phases 5-8
- SqliteLinkRepository: HIGH - WITH RECURSIVE is official SQLite feature, well documented
- Pitfalls: MEDIUM - Based on SQLite documentation + general graph traversal knowledge

**Research date:** 2026-01-30
**Valid until:** ~90 days (stable patterns, no external dependencies)
