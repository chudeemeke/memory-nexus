# Phase 24: Friction System - Research

**Researched:** 2026-03-08
**Domain:** Domain entity + repository + CLI commands + visual dashboard (internal composition phase)
**Confidence:** HIGH

## Summary

Phase 24 adds a self-contained friction logging subsystem: a new domain entity (FrictionEntry), a repository port + SQLite adapter, an application service, CLI commands nested under `memory friction`, and two dashboard outputs (rich terminal + self-contained HTML with Chart.js). Every component has a direct analog in the existing codebase.

This is an internal composition phase. The building blocks are well-established project patterns: entity with private constructor + static create(), repository port in domain/ports/repositories.ts, SQLite adapter with prepared statements, Commander.js command registration, and strategy-pattern formatters. The only net-new pattern is Commander subcommand nesting (`memory friction log|list|resolve|wont-fix|dashboard`) and Chart.js HTML generation. Both are straightforward.

**Primary recommendation:** Follow existing codebase patterns exactly. Every new file has a 1:1 analog. The friction system is architecturally identical to the MemoryFile subsystem added in Phase 23, but simpler (no FTS5, no sync integration).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Scope is tool-specific friction only (not general development friction)
- Categories: search, sync, cli, context, integration, ux
- Severity levels: low, medium, high, critical
- Status lifecycle: open -> resolved | wont-fix
- Schema: friction_log table with indexes on status, severity, category
- IFrictionRepository port interface (locked per CONTEXT.md spec)
- FrictionStats interface (locked per CONTEXT.md spec)
- CLI commands: `memory friction log`, `memory friction list`, `memory friction resolve`, `memory friction wont-fix`, `memory friction dashboard`
- Dashboard: CLI stats matching Claude Code /stats aesthetic + static HTML with Chart.js
- HTML dashboard at ~/.memory/dashboard.html (dark theme, #1a1a2e background)
- Chart.js embedded inline (no CDN dependency)
- Update ~/.claude/rules/memory.md with friction logging protocol
- Architecture layer mapping per CONTEXT.md table

### Claude's Discretion
- Internal implementation details of FrictionService (validation, error handling)
- Dashboard layout details within the aesthetic constraints
- Chart color palette specifics beyond the stated amber/orange/green/red
- Test file organization and test helper patterns
- How to handle the `--source` flag (project name resolution)
- Error codes for friction-specific errors

### Deferred Ideas (OUT OF SCOPE)
- Integration with Phase 25 (smart context surfacing open friction) -- Phase 25 will consume the IFrictionRepository, not Phase 24's concern
- Friction auto-detection (analyzing command failures automatically)
- Friction trends alerting or notifications
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | (Bun built-in) | Persistence for friction_log table | Already used for all other tables |
| Commander.js | ^14.0.2 | CLI subcommand nesting (`memory friction <sub>`) | Already the CLI framework |
| Chart.js | 4.x UMD | HTML dashboard charts (line, doughnut, bar) | Specified in CONTEXT.md. UMD build (~200KB minified) embeds inline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | No new dependencies needed | All tools already available |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chart.js UMD inline | CDN link | CDN breaks offline/portability. CONTEXT.md explicitly requires inline embedding |
| Commander subcommand nesting | Flat commands (`memory friction-log`) | Nesting matches the CONTEXT.md CLI spec and reads better |

**Installation:**
```bash
# No new packages needed. Chart.js UMD is fetched once at build/generation time
# and embedded as a string literal in the HTML template generator.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  domain/
    entities/
      friction-entry.ts              # FrictionEntry entity (analog: memory-file.ts)
      friction-entry.test.ts
      index.ts                       # Update: export FrictionEntry + types
    ports/
      repositories.ts                # Update: add IFrictionRepository + FrictionStats
      index.ts                       # Update: export new interfaces
  application/
    services/
      friction-service.ts            # FrictionService (log, list, resolve, stats)
      friction-service.test.ts
      index.ts                       # Update: export FrictionService
  infrastructure/
    database/
      schema.ts                      # Update: add FRICTION_LOG_TABLE
      repositories/
        friction-repository.ts       # SqliteFrictionRepository
        friction-repository.test.ts
        index.ts                     # Update: export new repo
      index.ts                       # Update: export new repo + schema
  presentation/
    cli/
      commands/
        friction.ts                  # All friction subcommands + executeFrictionCommand
        friction.test.ts
        index.ts                     # Update: export friction command + types
      formatters/
        friction-dashboard.ts        # CLI dashboard formatter + HTML generator
        friction-dashboard.test.ts
        index.ts                     # Update: export dashboard formatter
      index.ts                       # Update: register friction command
  index.ts                           # Update: export executeFrictionCommand + types
```

### Pattern 1: Entity with Immutable Construction
**What:** Private constructor, static create() factory, validation on creation.
**When to use:** All domain entities.
**Example (from existing memory-file.ts, adapted):**
```typescript
export class FrictionEntry {
  private readonly _id?: number;
  private readonly _description: string;
  // ... all fields readonly

  private constructor(params: FrictionEntryParams) { /* assign */ }

  static create(params: FrictionEntryParams): FrictionEntry {
    // Validate description non-empty
    // Validate severity in VALID_SEVERITIES
    // Validate category in VALID_CATEGORIES
    // Validate status in VALID_STATUSES
    // Validate resolvedAt only present when status !== "open"
    // Validate resolution only present when resolvedAt present
    return new FrictionEntry(params);
  }

  // Getters only, defensive Date copies
}
```

### Pattern 2: Commander Subcommand Nesting
**What:** A parent Command with nested subcommands via addCommand().
**When to use:** When a command has multiple sub-operations (log, list, resolve, dashboard).
**Example:**
```typescript
export function createFrictionCommand(): Command {
  const friction = new Command("friction")
    .description("Friction logging for memory tool improvement");

  friction.addCommand(createFrictionLogCommand());
  friction.addCommand(createFrictionListCommand());
  friction.addCommand(createFrictionResolveCommand());
  friction.addCommand(createFrictionWontFixCommand());
  friction.addCommand(createFrictionDashboardCommand());

  return friction;
}
```
In `presentation/cli/index.ts`, register with `program.addCommand(createFrictionCommand());`.

### Pattern 3: Repository with Prepared Statements
**What:** SqliteFrictionRepository following SqliteMemoryFileRepository pattern.
**When to use:** All database operations.
**Key aspects:**
- Constructor takes `Database` (from bun:sqlite)
- Row interface for type-safe query results
- toEntity() private method for row-to-domain conversion
- Async methods wrapping synchronous bun:sqlite calls
- Transactions for multi-row operations

### Pattern 4: Application Service with Injected Repository
**What:** FrictionService receives IFrictionRepository via constructor.
**When to use:** Orchestrating business logic between domain and infrastructure.
**Key aspects:**
- Constructor injection of repository port
- Methods: log(), list(), resolve(), wontFix(), getStats(), getWeeklyTrends()
- Returns domain entities, not infrastructure types
- No direct database access

### Pattern 5: Programmatic API via executeFrictionCommand
**What:** An executeXxxCommand function that handles DB init/teardown and returns CommandResult.
**When to use:** All CLI commands (established pattern).
**Key aspects:**
- Never calls process.exit() (returns { exitCode: number })
- Initializes DB, creates repo, creates service, delegates, closes DB
- Error wrapping in MemoryError for consistent formatting
- JSON output mode support

### Anti-Patterns to Avoid
- **Don't skip the service layer:** Even though friction is simple, the command should not directly call the repository. The service enforces validation and business rules.
- **Don't add FTS5 to friction_log:** The table is small (hundreds of entries, not millions). Simple LIKE queries or indexed column filters are sufficient. FTS5 overhead is not justified.
- **Don't use process.exit() in command handlers:** Return CommandResult per established pattern.
- **Don't make FrictionEntry mutable:** Status transitions (open -> resolved) create new entities, not mutate existing ones. However, the repository's resolve() method updates in place (SQL UPDATE) -- the entity itself stays immutable per construction.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Manual argv parsing | Commander.js | Already the project standard |
| Date formatting | Custom date functions | Date.toISOString() + Intl.DateTimeFormat | Used throughout codebase |
| Color output | Raw ANSI codes | Existing color.ts utilities (bold, green, red, yellow, cyan, dim) | Already handles NO_COLOR, TTY detection |
| Chart rendering | Custom SVG/Canvas | Chart.js UMD | Specified in CONTEXT.md, battle-tested |
| HTML templating | Template engine | Template literal string | Single file generation, no recurring rendering |
| Mean time calculation | Custom averaging | SQL AVG() with julianday() | Database handles date arithmetic correctly |

**Key insight:** This phase introduces zero new external patterns. Every component maps to an existing analog. The only "new" thing is Commander subcommand nesting and Chart.js HTML generation, both of which are one-time setup patterns.

## Common Pitfalls

### Pitfall 1: Commander Subcommand Option Inheritance
**What goes wrong:** Options defined on the parent `friction` command don't propagate to subcommands.
**Why it happens:** Commander.js does not inherit options from parent to child by default.
**How to avoid:** Define shared options (like `--json`) on each subcommand individually, not on the parent. Or use `opts()` on the parent from within child action handlers.
**Warning signs:** `--json` flag works on `memory stats` but not on `memory friction list --json`.

### Pitfall 2: Chart.js UMD Inline Size
**What goes wrong:** Embedding the full Chart.js UMD (~200KB minified) in every generated HTML file creates large files.
**Why it happens:** The UMD bundle includes all chart types and plugins.
**How to avoid:** This is acceptable -- the file is generated on demand, not stored in the package. 200KB of JS in a self-contained HTML is reasonable. Do NOT try to tree-shake the UMD build -- use the full bundle as-is.
**Warning signs:** Trying to create a custom Chart.js build for a CLI-generated HTML file is over-engineering.

### Pitfall 3: Schema Migration for Existing Databases
**What goes wrong:** Adding FRICTION_LOG_TABLE to SCHEMA_SQL works for new databases but existing databases already have all other tables created via `IF NOT EXISTS`. The new table gets created on first run.
**Why it happens:** The `createSchema()` function runs all SCHEMA_SQL statements with `IF NOT EXISTS`, so it's safe to add new tables to the array.
**How to avoid:** Simply append FRICTION_LOG_TABLE to the SCHEMA_SQL array. Existing tables are skipped, new table is created. This is the same approach used for memory_files in Phase 23.
**Warning signs:** None -- the existing pattern handles this correctly.

### Pitfall 4: Date Arithmetic in SQLite for MTTR
**What goes wrong:** Calculating "mean time to resolve" (days between loggedAt and resolvedAt) using string comparison on ISO dates.
**Why it happens:** SQLite stores dates as TEXT in ISO 8601 format.
**How to avoid:** Use `julianday(resolved_at) - julianday(logged_at)` in SQL for precise day-fractional arithmetic. SQLite's julianday() understands ISO 8601 strings.
**Warning signs:** MTTR values that are integers only (no fractional days) suggest string-based calculation.

### Pitfall 5: Barrel Export Chain Gaps
**What goes wrong:** New types (FrictionEntry, IFrictionRepository, FrictionStats) not reachable from `@chude/memory` import.
**Why it happens:** Missing exports at any level of the barrel chain: entity -> entities/index.ts -> domain/index.ts -> src/index.ts.
**How to avoid:** Trace the full export chain for every new public type. Update every barrel file in the chain.
**Warning signs:** TypeScript compiles fine internally but `import { FrictionEntry } from '@chude/memory'` fails for consumers.

### Pitfall 6: HTML Dashboard File Location
**What goes wrong:** Writing to ~/.memory/dashboard.html but the directory might not exist.
**Why it happens:** ~/.memory/ is only created by the agent write protocol or sync command. A fresh install may not have it.
**How to avoid:** Create ~/.memory/ directory (mkdirSync recursive) before writing the HTML file. Use getMemoryDir() from the existing infrastructure.
**Warning signs:** ENOENT errors on first `memory friction dashboard --html` run.

## Code Examples

### Entity Creation Pattern (verified from memory-file.ts)
```typescript
// Follow the exact MemoryFile pattern:
type FrictionSeverity = "low" | "medium" | "high" | "critical";
type FrictionCategory = "search" | "sync" | "cli" | "context" | "integration" | "ux";
type FrictionStatus = "open" | "resolved" | "wont-fix";

const VALID_SEVERITIES: readonly FrictionSeverity[] = ["low", "medium", "high", "critical"];
const VALID_CATEGORIES: readonly FrictionCategory[] = ["search", "sync", "cli", "context", "integration", "ux"];
const VALID_STATUSES: readonly FrictionStatus[] = ["open", "resolved", "wont-fix"];

export class FrictionEntry {
  private constructor(params: FrictionEntryParams) { ... }

  static create(params: FrictionEntryParams): FrictionEntry {
    if (!params.description || params.description.trim() === "") {
      throw new Error("Description cannot be empty");
    }
    if (!VALID_SEVERITIES.includes(params.severity)) {
      throw new Error(`Invalid severity: "${params.severity}"`);
    }
    // ... validate category, status
    return new FrictionEntry(params);
  }

  // Defensive Date copies in getters
  get loggedAt(): Date { return new Date(this._loggedAt.getTime()); }
}
```

### Schema Addition Pattern (verified from schema.ts)
```typescript
export const FRICTION_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS friction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT NOT NULL DEFAULT 'cli' CHECK (category IN ('search', 'sync', 'cli', 'context', 'integration', 'ux')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont-fix')),
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
);
CREATE INDEX IF NOT EXISTS idx_friction_status ON friction_log(status);
CREATE INDEX IF NOT EXISTS idx_friction_severity ON friction_log(severity);
CREATE INDEX IF NOT EXISTS idx_friction_category ON friction_log(category);
`;

// Add to SCHEMA_SQL array (after MEMORY_FILES_FTS_TRIGGERS)
```

### Repository Pattern (verified from memory-file-repository.ts)
```typescript
interface FrictionRow {
  id: number;
  description: string;
  severity: FrictionSeverity;
  category: FrictionCategory;
  status: FrictionStatus;
  context: string | null;
  source_project: string | null;
  logged_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export class SqliteFrictionRepository implements IFrictionRepository {
  private readonly db: Database;

  constructor(db: Database) { this.db = db; }

  async save(entry: FrictionEntry): Promise<FrictionEntry> {
    const result = this.db.prepare(`
      INSERT INTO friction_log (description, severity, category, status, context, source_project, logged_at, resolved_at, resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.description, entry.severity, entry.category, entry.status,
      entry.context ?? null, entry.sourceProject ?? null,
      entry.loggedAt.toISOString(),
      entry.resolvedAt?.toISOString() ?? null,
      entry.resolution ?? null
    );
    // Return entity with id assigned
    return FrictionEntry.create({ ...entryParams, id: Number(result.lastInsertRowid) });
  }

  // getStats() uses SQL aggregation:
  // SELECT COUNT(*) as total,
  //        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
  //        AVG(CASE WHEN resolved_at IS NOT NULL
  //            THEN julianday(resolved_at) - julianday(logged_at) END) as avg_resolve_days
  // FROM friction_log
}
```

### Commander Nesting Pattern (verified from Commander.js docs)
```typescript
// In friction.ts:
export function createFrictionCommand(): Command {
  const friction = new Command("friction")
    .description("Log and track friction with memory tool");

  // Log subcommand
  friction.addCommand(
    new Command("log")
      .description("Log a friction entry")
      .argument("<description>", "What went wrong")
      .option("--severity <level>", "low|medium|high|critical", "medium")
      .option("--category <cat>", "search|sync|cli|context|integration|ux", "cli")
      .option("--source <project>", "Source project name")
      .option("--context <ctx>", "Additional context")
      .option("--json", "Output as JSON")
      .action(async (description, opts) => { ... })
  );

  // ... similar for list, resolve, wont-fix, dashboard
  return friction;
}

// In presentation/cli/index.ts:
program.addCommand(createFrictionCommand());
```

### HTML Dashboard Generation Pattern
```typescript
// In friction-dashboard.ts:
// The Chart.js UMD source is stored as a const string (fetched once, bundled)
// or read from node_modules at generation time.

export function generateFrictionHtml(stats: FrictionStats, trends: WeeklyTrend[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Memory Friction Dashboard</title>
  <style>
    body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui; }
    /* ... dark theme styles */
  </style>
  <script>${CHART_JS_UMD_SOURCE}</script>
</head>
<body>
  <h1>Friction Dashboard</h1>
  <!-- charts render into canvas elements -->
  <canvas id="overTimeChart"></canvas>
  <canvas id="byCategoryChart"></canvas>
  <canvas id="bySeverityChart"></canvas>
  <canvas id="resolutionTrendChart"></canvas>
  <!-- open items table -->
  <table id="openItems">...</table>
  <script>
    const stats = ${JSON.stringify(stats)};
    const trends = ${JSON.stringify(trends)};
    // Create Chart instances...
  </script>
</body>
</html>`;
}
```

### Opening HTML in Default Browser
```typescript
import { exec } from "node:child_process";
import { platform } from "node:os";

function openInBrowser(filePath: string): void {
  const cmd = platform() === "win32" ? "start" :
              platform() === "darwin" ? "open" : "xdg-open";
  exec(`${cmd} "${filePath}"`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat CLI commands | Commander subcommand nesting | Commander 7+ | `memory friction log` reads naturally |
| Chart.js 2.x | Chart.js 4.x | 2023 | Tree-shakable ESM, but UMD still available for inline embedding |

**Deprecated/outdated:**
- Chart.js 2.x syntax (different API for chart creation) -- use Chart.js 4.x registration pattern
- Commander `.command('sub').action()` inline -- use `.addCommand()` for separately defined commands (project convention)

## Open Questions

1. **Chart.js UMD source bundling strategy**
   - What we know: Chart.js 4.5.0 UMD is ~200KB minified. Must be embedded inline.
   - What's unclear: Whether to (a) download at build time and store as string const, (b) read from node_modules/chart.js/dist/ at generation time, or (c) fetch from CDN at generation time with fallback.
   - Recommendation: Option (b) -- read from `node_modules/chart.js/dist/chart.umd.js` at generation time. Chart.js is not currently a dependency, so it would need to be added. Alternative: option (c) -- fetch from CDN once at dashboard generation time, cache locally in ~/.memory/. Either works; option (b) is simpler but adds a dependency.

2. **Weekly trends SQL query granularity**
   - What we know: `getWeeklyTrends(weeks)` returns an array of week objects.
   - What's unclear: Whether "week" means ISO week (Monday start) or rolling 7-day windows.
   - Recommendation: Use ISO week (`strftime('%Y-W%W', logged_at)`) for consistent grouping. Simpler SQL, predictable boundaries.

## Sources

### Primary (HIGH confidence)
- Codebase: src/domain/entities/memory-file.ts (entity pattern)
- Codebase: src/domain/ports/repositories.ts (port interface pattern)
- Codebase: src/infrastructure/database/repositories/memory-file-repository.ts (repository pattern)
- Codebase: src/infrastructure/database/schema.ts (schema addition pattern)
- Codebase: src/presentation/cli/commands/stats.ts (command + execute pattern)
- Codebase: src/presentation/cli/index.ts (command registration pattern)
- Codebase: src/index.ts (barrel export chain)
- Codebase: src/presentation/cli/formatters/stats-formatter.ts (formatter strategy pattern)
- Codebase: src/presentation/cli/formatters/color.ts (color utilities)

### Secondary (MEDIUM confidence)
- [Commander.js npm docs](https://www.npmjs.com/package/commander) - subcommand nesting with addCommand()
- [Chart.js integration docs](https://www.chartjs.org/docs/latest/getting-started/integration.html) - UMD build for inline embedding
- [Chart.js inline discussion](https://github.com/chartjs/Chart.js/discussions/11219) - self-contained HTML embedding pattern

### Tertiary (LOW confidence)
- Chart.js UMD file size (~200KB minified) -- approximate from training data, verify at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies except Chart.js; all patterns exist in codebase
- Architecture: HIGH - every component has a 1:1 analog in the existing codebase
- Pitfalls: HIGH - identified from direct codebase analysis and prior phase experience

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (30 days -- stable internal patterns, no fast-moving external deps)
