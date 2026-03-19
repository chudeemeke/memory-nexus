# Phase 28: Friction Universalization - Research

**Researched:** 2026-03-19
**Domain:** Schema migration, CLI extension, dashboard visualization, file ingestion
**Confidence:** HIGH

## Summary

Phase 28 upgrades the existing Phase 24 friction system from memory-specific to universal tool tracking. The core changes are: (1) add a `tool` column as the primary filtering dimension, (2) generalize categories from a fixed enum to any non-empty string, (3) add `tags` and `last_reviewed_at` columns, (4) implement auto-ingest of the `~/.claude/friction.jsonl` fallback file, (5) add pattern detection for recurring friction, and (6) de-brand the dashboard.

This is entirely a composition/extension phase -- every component has a 1:1 existing analog in the Phase 24 friction system. No new external libraries are needed. The schema migration uses SQLite's `ALTER TABLE ADD COLUMN` pattern already established in the codebase (see `EMBEDDING_STATE_ADD_MODEL_NAME` in schema.ts). The category generalization requires removing the SQL CHECK constraint, which SQLite does not support via ALTER TABLE -- the correct approach is to recreate the table with the new schema and migrate data.

**Primary recommendation:** Follow the existing codebase patterns exactly. Modify across all 4 hexagonal layers (domain entity, repository port, infrastructure adapter, presentation CLI/dashboard). Use the CONTEXT.md architecture layer mapping as the task guide.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Add `tool` column (CRITICAL):** `tool TEXT NOT NULL` on `friction_log` table. Default existing entries to `'memory'`. `tool` = which tool broke, `source_project` = where friction was encountered. Both always populated.

2. **Generalize categories:** Remove the SQL CHECK constraint on `category`. Validate in application layer (FrictionEntry.create()) instead. Accept any non-empty string. Keep existing 6 as documented examples but don't enforce them.

3. **Add `tags` column:** `tags TEXT` column (JSON array, nullable). Stores cross-cutting concerns like `["timeout", "windows", "subprocess"]`.

4. **Add `last_reviewed_at` column:** `last_reviewed_at TEXT` (ISO timestamp, nullable). Updated when friction is displayed via `memory friction list` for a specific tool.

5. **Repository changes:** Add `tool?: string` and `sourceProject?: string` to findAll filter options. Add `markReviewed(tool, reviewedAt)` method. Add `findPatterns(threshold)` method returning `FrictionPattern[]`.

6. **Auto-ingest fallback file:** On any `memory friction *` invocation, check for `~/.claude/friction.jsonl`. Read, map, log via normal path, delete. Runs before the requested command executes.

7. **Dashboard de-branding and By Tool chart:** Title becomes "Friction Dashboard". Add "By Tool" donut chart. Pattern alerts section. Terminal dashboard: add tool breakdown row.

8. **CLI flag additions:** `memory friction log` gets `--tool <name>` flag. `memory friction list` gets `--tool <name>` filter. `memory friction dashboard` gets `--tool <name>` filter.

9. **Seen/unseen indicators:** Mark entries as reviewed on `memory friction list --tool <tool>`. Show "NEW" indicator on entries where `last_reviewed_at` is null or older than entry's `logged_at`. Summary: "3 open items for aidev (1 high, 2 medium) -- 2 new since last review".

10. **Pattern detection:** 3+ open entries sharing same tool+category triggers "pattern detected" alert in dashboard.

11. **Architecture layer mapping:** FrictionEntry (domain, MODIFY), IFrictionRepository (domain ports, MODIFY), FrictionService (application, MODIFY), SqliteFrictionRepository (infrastructure, MODIFY), schema.ts (infrastructure, MODIFY), friction CLI (presentation, MODIFY), friction-dashboard formatters (presentation, MODIFY).

### Claude's Discretion

None specified -- all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

None specified.
</user_constraints>

## Standard Stack

### Core

No new libraries required. This phase modifies existing code using existing dependencies.

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| bun:sqlite | built-in | Database operations, schema migration | Yes |
| commander | v14 | CLI command/option definitions | Yes |
| chart.js | (current) | HTML dashboard charts (By Tool donut) | Yes |
| node:fs | built-in | File I/O for friction.jsonl auto-ingest | Yes |
| node:path | built-in | Path operations | Yes |

### Supporting

None needed.

### Alternatives Considered

None -- all decisions are locked in CONTEXT.md.

## Architecture Patterns

### Recommended Change Structure

Every change follows the existing hexagonal layer pattern:

```
src/
├── domain/
│   ├── entities/friction-entry.ts        # Add tool, tags, lastReviewedAt properties
│   └── ports/repositories.ts             # Extend IFrictionRepository, FrictionStats
├── application/
│   └── services/friction-service.ts      # Add auto-ingest, tool param, pattern detection
├── infrastructure/
│   └── database/
│       ├── schema.ts                     # Schema migration (table recreation)
│       └── repositories/friction-repository.ts  # New queries, tool filter, markReviewed
└── presentation/
    └── cli/
        ├── commands/friction.ts           # --tool flag, seen/unseen indicators
        └── formatters/friction-dashboard.ts  # De-brand, By Tool chart, patterns
```

### Pattern 1: Schema Migration via Table Recreation

**What:** SQLite does not support `ALTER TABLE DROP CONSTRAINT` or `ALTER TABLE MODIFY COLUMN`. Removing the category CHECK constraint requires recreating the table.

**When to use:** When modifying CHECK constraints or column types in SQLite.

**Approach:**
```sql
-- 1. Create new table with desired schema
CREATE TABLE friction_log_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category TEXT NOT NULL DEFAULT 'cli',  -- CHECK removed
    tool TEXT NOT NULL DEFAULT 'memory',   -- NEW
    tags TEXT,                             -- NEW (JSON array)
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont-fix')),
    context TEXT,
    source_project TEXT,
    logged_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT,
    last_reviewed_at TEXT                  -- NEW
);

-- 2. Copy data
INSERT INTO friction_log_new SELECT *, 'memory', NULL, NULL FROM friction_log;
-- (column ordering requires explicit column list in real implementation)

-- 3. Drop old, rename new
DROP TABLE friction_log;
ALTER TABLE friction_log_new RENAME TO friction_log;

-- 4. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_friction_status ON friction_log(status);
CREATE INDEX IF NOT EXISTS idx_friction_severity ON friction_log(severity);
CREATE INDEX IF NOT EXISTS idx_friction_category ON friction_log(category);
CREATE INDEX IF NOT EXISTS idx_friction_tool ON friction_log(tool);  -- NEW
```

**Why not ALTER TABLE ADD COLUMN only:** The `tool` and `tags` columns could use ALTER TABLE ADD COLUMN, but removing the category CHECK constraint cannot. Since we need table recreation anyway, do all changes in one migration.

**Precedent:** The codebase already has `EMBEDDING_STATE_ADD_MODEL_NAME` for simple column additions. This is the first table recreation migration, but the pattern is standard SQLite practice.

### Pattern 2: Category Generalization (Domain Entity)

**What:** Change FrictionCategory from a union type to `string`, validate non-empty in `create()`.

**Current code:**
```typescript
// CURRENT: Fixed union type
export type FrictionCategory = "search" | "sync" | "cli" | "context" | "integration" | "ux";

// Category validation in create()
if (!VALID_CATEGORIES.includes(params.category)) {
    throw new Error(`Invalid category: "${params.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`);
}
```

**New code:**
```typescript
// NEW: Accept any non-empty string
// FrictionCategory type becomes string (kept as type alias for documentation)
export type FrictionCategory = string;

// Validation changes to non-empty check
if (!params.category || params.category.trim() === "") {
    throw new Error("Category cannot be empty");
}
```

**Impact on FrictionStats:** The `byCategory: Record<FrictionCategory, number>` currently uses a fixed Record with all 6 categories pre-populated to 0. With dynamic categories, this becomes `Record<string, number>` populated from actual database values only. The dashboard formatter must iterate over whatever keys exist, not hardcode the 6 original categories.

### Pattern 3: Auto-Ingest as Service Hook

**What:** Before any friction command executes, check for and import `~/.claude/friction.jsonl`.

**Where:** In the application service layer (FrictionService), not in CLI or infrastructure. The service is the natural orchestrator for this cross-cutting concern.

**Approach:**
```typescript
// FrictionService gets a new method
async ingestFallbackFile(fallbackPath: string): Promise<number> {
    // Check if file exists
    // Read each JSON line
    // Map fields to FrictionEntry.create() params
    // Log each via repository.save()
    // Delete the file
    // Return count of ingested entries
}
```

**Called from:** `executeFrictionCommand()` in the CLI layer, before dispatching to the action handler. This ensures it runs on every friction command invocation.

**File format (from ~/.claude/rules/tool-friction.md):**
```json
{"tool":"aidev","severity":"high","description":"what happened","project":"get-stuff-done","context":"details","date":"2026-03-08"}
```

Note the field mapping: `tool` -> `tool` (new), `project` -> `sourceProject`, `date` -> `loggedAt` (parse YYYY-MM-DD to Date), `category` -> `category` (default to "cli" if missing since fallback format may not include it).

### Pattern 4: Seen/Unseen Tracking via lastReviewedAt

**What:** Track when friction for a specific tool was last reviewed. Show "NEW" indicator on entries logged after last review.

**Mechanism:**
1. `IFrictionRepository.markReviewed(tool: string, reviewedAt: Date)` -- UPDATE last_reviewed_at for all open entries matching tool
2. When `memory friction list --tool aidev` runs, after displaying results, call `markReviewed("aidev", new Date())`
3. The "NEW" indicator is computed at display time: entry is "new" if `last_reviewed_at` is null OR `last_reviewed_at < logged_at`

**Design consideration:** `last_reviewed_at` is per-entry, not per-tool. This is correct because an entry might be logged AFTER the tool was last reviewed -- only that entry should be "new", not older entries that were already seen.

### Pattern 5: Pattern Detection Query

**What:** Group open entries by tool+category, return groups meeting the threshold (default 3).

**SQL:**
```sql
SELECT tool, category, COUNT(*) as count
FROM friction_log
WHERE status = 'open'
GROUP BY tool, category
HAVING COUNT(*) >= ?
ORDER BY count DESC
```

**Domain type:**
```typescript
interface FrictionPattern {
    tool: string;
    category: string;
    count: number;
    entries: FrictionEntry[];
}
```

**Called by:** Dashboard command, to surface "Pattern detected: 3+ open entries for aidev/cli".

### Anti-Patterns to Avoid

- **Don't add a separate migration tracking table.** The existing codebase uses inline migration logic in `createSchema()` (see `EMBEDDING_STATE_ADD_MODEL_NAME` check via `PRAGMA table_info`). Follow this pattern -- check if `tool` column exists, if not, run the migration.
- **Don't validate categories at the SQL level.** The whole point is to remove the CHECK constraint so different tools can use different category vocabularies.
- **Don't make auto-ingest async/background.** The fallback file will have at most ~50 entries. Synchronous ingest before command execution is correct and fast.
- **Don't modify the FrictionEntry constructor signature.** Add `tool`, `tags`, and `lastReviewedAt` as optional fields in `FrictionEntryParams`. The entity stays immutable with private constructor + static `create()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON line parsing | Custom parser | `line.split('\n').filter(Boolean).map(JSON.parse)` | Standard pattern, no edge cases |
| Date parsing for YYYY-MM-DD | Regex + manual Date construction | `new Date(dateString + 'T00:00:00Z')` | Unambiguous ISO format |
| Chart.js donut chart | Custom SVG/canvas | Chart.js `type: 'doughnut'` (already used for category chart) | Existing pattern in friction-dashboard.ts |

## Common Pitfalls

### Pitfall 1: SQLite Table Recreation Data Loss

**What goes wrong:** Recreating a table without proper column ordering in the INSERT...SELECT causes data to land in wrong columns.

**Why it happens:** The `INSERT INTO new_table SELECT * FROM old_table` relies on column order matching. When new columns are added in the middle, the * expansion doesn't account for them.

**How to avoid:** Use explicit column lists in both the INSERT and SELECT. Map old columns by name, provide defaults for new columns.

```sql
-- CORRECT: Explicit column mapping
INSERT INTO friction_log_new (id, description, severity, category, status, context, source_project, logged_at, resolved_at, resolution, tool, tags, last_reviewed_at)
SELECT id, description, severity, category, status, context, source_project, logged_at, resolved_at, resolution, 'memory', NULL, NULL
FROM friction_log;
```

**Warning signs:** Test data appearing in wrong columns after migration.

### Pitfall 2: FrictionStats Type Breakage

**What goes wrong:** Changing `FrictionCategory` from a union to `string` breaks `Record<FrictionCategory, number>` in FrictionStats -- it becomes `Record<string, number>` which loses the guarantee of all 6 keys being present.

**Why it happens:** The dashboard and tests rely on specific keys being present (e.g., `stats.byCategory.search`).

**How to avoid:** The `byCategory` field in FrictionStats should become `Record<string, number>` populated from actual DB data. Dashboard formatters iterate over `Object.keys(stats.byCategory)` instead of hardcoded category lists. Tests update to reflect dynamic categories.

**Warning signs:** Dashboard showing empty or missing categories.

### Pitfall 3: Auto-Ingest File Locking on Windows

**What goes wrong:** Reading and then deleting `friction.jsonl` can fail on Windows if another process has the file open.

**Why it happens:** Windows file locks are mandatory. If a Claude Code session is writing to the file while memory CLI is reading it, the delete will fail.

**How to avoid:** Read the file, process entries, then attempt delete. If delete fails, log a warning but don't crash. The entries are already ingested -- duplicates will be caught on next run if the file persists. Alternatively, use a rename-then-delete pattern.

**Warning signs:** "EPERM" or "EBUSY" errors when deleting the file.

### Pitfall 4: Missing tool Value During Ingest

**What goes wrong:** Fallback file entries missing the `tool` field cause FrictionEntry.create() to throw.

**Why it happens:** The `~/.claude/friction.jsonl` format predates the `tool` field. Older entries or entries written without tool context may omit it.

**How to avoid:** Default `tool` to `'unknown'` if missing from the JSON line. Log a warning that the entry is missing tool context.

### Pitfall 5: CHECK Constraint on Existing Databases

**What goes wrong:** The migration needs to handle databases created with the old schema (which has the category CHECK constraint) and databases created fresh with the new schema.

**Why it happens:** `createSchema()` is called on every database initialization. The FRICTION_LOG_TABLE constant will have the new schema (no CHECK on category). But existing databases already have the old table with the CHECK.

**How to avoid:** The migration logic in `createSchema()` must detect whether the friction_log table exists AND whether it has the old CHECK constraint. If it does, run the table recreation migration. If it doesn't (fresh DB), the new schema is applied directly.

**Detection approach:** `PRAGMA table_info(friction_log)` to check if `tool` column exists. If it doesn't, the table needs migration.

## Code Examples

### FrictionEntry with tool field

```typescript
interface FrictionEntryParams {
    id?: number;
    description: string;
    severity: FrictionSeverity;
    category: string;          // Changed from FrictionCategory union to string
    tool: string;              // NEW: required
    tags?: string[];           // NEW: optional
    status: FrictionStatus;
    context?: string;
    sourceProject?: string;
    loggedAt: Date;
    resolvedAt?: Date;
    resolution?: string;
    lastReviewedAt?: Date;     // NEW: optional
}
```

### FrictionRow with new columns

```typescript
interface FrictionRow {
    id: number;
    description: string;
    severity: string;
    category: string;
    tool: string;              // NEW
    tags: string | null;       // NEW (JSON array string)
    status: string;
    context: string | null;
    source_project: string | null;
    logged_at: string;
    resolved_at: string | null;
    resolution: string | null;
    last_reviewed_at: string | null;  // NEW
}
```

### Auto-ingest in executeFrictionCommand

```typescript
// In friction.ts executeFrictionCommand(), before switch(options.action):
const fallbackPath = join(homedir(), '.claude', 'friction.jsonl');
await ingestFallbackFile(service, fallbackPath);
```

### Pattern detection query result

```typescript
// FrictionPattern interface (new in domain/ports/repositories.ts)
interface FrictionPattern {
    tool: string;
    category: string;
    count: number;
    entries: FrictionEntry[];
}
```

### Dashboard "By Tool" chart addition

```html
<!-- New canvas element in HTML template -->
<div class="chart-container">
    <canvas id="byToolChart"></canvas>
</div>

<!-- Chart.js initialization -->
new Chart(document.getElementById('byToolChart'), {
    type: 'doughnut',
    data: {
        labels: Object.keys(stats.byTool),
        datasets: [{
            data: Object.values(stats.byTool),
            backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff', '#ff9f40', '#c9cbcf']
        }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'By Tool' } } }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed FrictionCategory union | Dynamic string category | Phase 28 | Dashboard and stats adapt to any category |
| No tool tracking | tool as first-class column | Phase 28 | Cross-tool friction queries enabled |
| Manual friction.jsonl import | Auto-ingest on command invocation | Phase 28 | Zero-friction fallback file handling |
| Memory-branded dashboard | Universal "Friction Dashboard" | Phase 28 | Tool-agnostic presentation |

## Open Questions

1. **Should `tool` be required or optional in FrictionEntry.create()?**
   - What we know: CONTEXT.md says `tool TEXT NOT NULL DEFAULT 'memory'`. The entity constructor currently has no tool field.
   - What's clear: Making it required at the entity level forces callers to always provide it. The SQL default handles existing rows.
   - Recommendation: Make `tool` required in `FrictionEntryParams` (no default at entity level). The FrictionService.log() method provides the default `'memory'` if the CLI caller doesn't pass `--tool`. This is consistent with how severity defaults to 'medium' in the service, not the entity.

2. **FrictionStats.byCategory type change**
   - What we know: Currently `Record<FrictionCategory, number>` with all 6 keys pre-populated. With dynamic categories, this becomes `Record<string, number>`.
   - What's clear: The dashboard formatter and tests must change to iterate dynamically.
   - Recommendation: Change to `Record<string, number>`. The repository populates from actual DB data only (no pre-population). Tests update accordingly. A new `byTool: Record<string, number>` field is added to FrictionStats for the dashboard.

3. **Transaction safety for auto-ingest**
   - What we know: Ingesting 50 entries individually is fine, but if one fails mid-way, some are saved and some are not. The file gets deleted regardless.
   - Recommendation: Wrap the ingest in a try/catch per entry. Log warnings for entries that fail (malformed JSON, missing fields). Only delete the file after all entries are processed (regardless of individual failures). This is consistent with the sync pipeline's fault-tolerant approach.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/domain/entities/friction-entry.ts` -- current entity shape, validation
- Codebase analysis: `src/domain/ports/repositories.ts` -- current IFrictionRepository interface
- Codebase analysis: `src/application/services/friction-service.ts` -- current service business rules
- Codebase analysis: `src/infrastructure/database/schema.ts` -- current FRICTION_LOG_TABLE DDL, migration pattern
- Codebase analysis: `src/infrastructure/database/repositories/friction-repository.ts` -- current SQL queries, FrictionRow shape
- Codebase analysis: `src/presentation/cli/commands/friction.ts` -- current CLI structure, executeFrictionCommand
- Codebase analysis: `src/presentation/cli/formatters/friction-dashboard.ts` -- current dashboard formatters
- Codebase analysis: `src/infrastructure/database/connection.ts` -- createSchema invocation pattern
- CONTEXT.md: Phase 28 discussion decisions, architecture layer mapping

### Secondary (MEDIUM confidence)
- SQLite documentation: ALTER TABLE limitations (no DROP CONSTRAINT support) -- well-known SQLite behavior
- `~/.claude/rules/tool-friction.md`: fallback file schema (JSON fields: tool, severity, description, project, context, date)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing patterns
- Architecture: HIGH - 1:1 analogs for every change in existing Phase 24 code
- Pitfalls: HIGH - migration patterns well understood, codebase thoroughly analyzed

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- all internal patterns, no external API changes)
