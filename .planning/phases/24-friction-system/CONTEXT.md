# Phase 24: Friction System — Discussion Context

**Source:** Brainstorming session 2026-03-07 (design doc: docs/plans/2026-03-07-knowledge-layer-friction-design.md)
**Phase goal:** Build the complete friction logging system: domain entity, repository, CLI commands, and dashboard (CLI + HTML).

## What This Phase Builds

A self-improving feedback loop where Claude logs tool-specific friction (memory commands that fail, unhelpful output, missing features, workarounds needed) into a queryable database with lifecycle management and visual dashboards.

## Scope: Tool-Specific Friction Only

Only log friction related to memory itself — not general development friction. Claude already knows when memory falls short because it's the primary consumer. Categories:

| Category | Examples |
|----------|---------|
| search | Queries that fail, irrelevant results, missing content |
| sync | Slow sync, missed sessions, parsing errors |
| cli | Bad UX, missing flags, confusing output |
| context | Useless briefings, missing information, wrong project |
| integration | Hook failures, aidev issues, API problems |
| ux | General usability friction |

## Data Model

### FrictionEntry Domain Entity

```typescript
// src/domain/entities/friction-entry.ts
type FrictionSeverity = "low" | "medium" | "high" | "critical";
type FrictionCategory = "search" | "sync" | "cli" | "context" | "integration" | "ux";
type FrictionStatus = "open" | "resolved" | "wont-fix";

interface FrictionEntryParams {
  id?: number;
  description: string;
  severity: FrictionSeverity;
  category: FrictionCategory;
  status: FrictionStatus;
  context?: string;          // what project/session/task was happening
  sourceProject?: string;    // which project logged this
  loggedAt: Date;
  resolvedAt?: Date;
  resolution?: string;       // how it was fixed
}
```

Follow the existing Entity pattern: immutable class with private constructor, static `create()` factory, validation in factory, `withId()` for post-persistence.

### SQLite Table

```sql
CREATE TABLE friction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'cli',
    status TEXT NOT NULL DEFAULT 'open',
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
);
CREATE INDEX idx_friction_status ON friction_log(status);
CREATE INDEX idx_friction_severity ON friction_log(severity);
CREATE INDEX idx_friction_category ON friction_log(category);
```

### IFrictionRepository Port

```typescript
interface FrictionStats {
  total: number;
  open: number;
  resolved: number;
  wontFix: number;
  bySeverity: Record<FrictionSeverity, number>;
  byCategory: Record<FrictionCategory, number>;
  meanTimeToResolve: number | null;  // days, null if no resolved items
  oldestOpen: { id: number; description: string; daysOpen: number } | null;
}

interface IFrictionRepository {
  save(entry: FrictionEntry): Promise<FrictionEntry>;
  findById(id: number): Promise<FrictionEntry | null>;
  findOpen(): Promise<FrictionEntry[]>;
  findAll(options?: { status?: FrictionStatus; category?: FrictionCategory; limit?: number }): Promise<FrictionEntry[]>;
  resolve(id: number, resolution: string): Promise<void>;
  updateStatus(id: number, status: FrictionStatus): Promise<void>;
  getStats(): Promise<FrictionStats>;
  getWeeklyTrends(weeks: number): Promise<Array<{ week: string; newCount: number; resolvedCount: number }>>;
}
```

## CLI Commands

```bash
# Log friction
memory friction log "search fails on hyphens" --severity high --category search
memory friction log "context command returns useless stats" --severity medium --category context --source kanbanflow

# List open items (default)
memory friction list
memory friction list --all           # include resolved + wont-fix
memory friction list --category search
memory friction list --severity critical

# Resolve an item
memory friction resolve 42 --resolution "FTS5 sanitization added in Phase 23"

# Mark as won't fix
memory friction wont-fix 42 --resolution "By design"

# Dashboard
memory friction dashboard            # CLI stats (rich terminal)
memory friction dashboard --html     # generate + open HTML report
```

## Dashboard Design

### CLI Dashboard (memory friction dashboard)

Rich terminal rendering matching Claude Code's /stats aesthetic:
- GitHub-style heatmap showing friction activity over time (days x weeks)
- Tab navigation: Overview | By Category | Trends
- Key stats grid: open/resolved/won't-fix counts, severity breakdown, MTTR, oldest open
- Horizontal bar charts for category distribution
- Time period cycling: All time | Last 30 days | Last 7 days
- Keyboard shortcuts: r to cycle dates, q to quit, ctrl+s to copy

### HTML Dashboard (memory friction dashboard --html)

Self-contained HTML file at ~/.memory/dashboard.html. Chart.js embedded inline (no CDN dependency). Dark theme (#1a1a2e background).

Charts:
- **Friction Over Time** — line chart: new (red), resolved (green), cumulative open (amber)
- **By Category** — doughnut chart with counts
- **By Severity** — horizontal stacked bar per category
- **Resolution Trend** — grouped bar chart, weekly new vs resolved
- **Open Items Table** — sortable HTML table of all unresolved friction

Color palette: dark background, amber/orange accent for friction, green for resolved, red for critical.

## Rules File Updates

Part of this phase — update ~/.claude/rules/memory.md with friction logging protocol:

```markdown
## Friction Logging
When you encounter friction with the memory tool (commands that fail,
output that's unhelpful, missing features, workarounds needed), log it:
  memory friction log "<description>" --severity <low|medium|high|critical> --category <search|sync|cli|context|integration|ux>
```

Also update ~/.claude/CLAUDE.md Quick Reference table with memory --help reference.

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| FrictionEntry entity | Domain | src/domain/entities/friction-entry.ts |
| FrictionSeverity, FrictionCategory, FrictionStatus | Domain | src/domain/entities/friction-entry.ts |
| IFrictionRepository | Domain Port | src/domain/ports/repositories.ts |
| FrictionStats | Domain Port | src/domain/ports/repositories.ts |
| SqliteFrictionRepository | Infrastructure | src/infrastructure/database/repositories/friction-repository.ts |
| friction_log schema | Infrastructure | src/infrastructure/database/schema.ts |
| FrictionService | Application | src/application/services/friction-service.ts |
| friction CLI commands | Presentation | src/presentation/cli/commands/friction.ts |
| HTML dashboard generator | Presentation | src/presentation/cli/formatters/friction-dashboard.ts |
| Programmatic API | Public | src/index.ts (executeFrictionCommand) |

## Dependencies

- Depends on: Phase 23 (schema infrastructure, ~/.memory/ directory exists)
- Blocks: Phase 25 (smart context surfaces open friction in briefings)

## Testing Strategy

- Unit tests for FrictionEntry (validation, immutability, status transitions)
- Unit tests for FrictionService (log, list, resolve, stats)
- Integration tests for SqliteFrictionRepository (CRUD, filtering, stats queries)
- CLI tests for friction commands (argument parsing, output formatting)
- HTML dashboard generation test (valid HTML, Chart.js present, data correct)
- Programmatic API test (executeFrictionCommand returns typed results)
