# Phase 28: Friction Universalization -- Discussion Context

**Source:** Real-world friction encountered during GSD v0.3.0 milestone completion (2026-03-08). 10 entries logged in ~/.claude/friction.jsonl. Design discussion in memory-nexus session (2026-03-09).
**Phase goal:** Upgrade the Phase 24 friction system from memory-specific to universal tool tracking.

## What This Phase Builds

The friction system (Phase 24) works for memory-specific logging. This phase makes it the universal friction tracking backbone for every tool in ~/Projects/. The user's vision: Claude is a real-world tester for every tool they build. Friction gets logged during use, surfaced when returning to the tool's project, and patterns trigger redesign.

## Schema Changes

### 1. Add `tool` column (CRITICAL)

Currently `source_project` conflates two things: where friction occurred vs which tool had friction. When Claude uses `aidev release` while working in get-stuff-done, there's no way to query "all aidev friction."

**Change:** Add `tool TEXT NOT NULL` column to `friction_log` table. This is the primary filtering dimension.

- `tool` = which tool broke (e.g., "aidev", "memory", "gsd")
- `source_project` = where the friction was encountered (e.g., "get-stuff-done")
- Both fields are always populated

**Migration:** ALTER TABLE friction_log ADD COLUMN tool TEXT NOT NULL DEFAULT 'memory'. Existing entries default to 'memory' since they were all memory friction.

### 2. Generalize categories

Currently: `CHECK (category IN ('search', 'sync', 'cli', 'context', 'integration', 'ux'))` in SQL schema.

**Change:** Remove the CHECK constraint. Validate in the application layer (FrictionEntry.create()) instead. Accept any non-empty string. Keep the existing 6 as documented examples but don't enforce them.

**Why app-layer validation:** Different tools have different friction categories. A SQL CHECK can't anticipate categories for tools that don't exist yet. The domain entity is the right place for validation -- it can accept any category while still rejecting empty strings.

### 3. Add `tags` column for pattern detection

**Change:** Add `tags TEXT` column (JSON array, nullable). Stores cross-cutting concerns like `["timeout", "windows", "subprocess"]`.

Tags enable:
- Querying friction by cross-cutting concern rather than just tool+category
- Pattern detection: "5 entries tagged 'timeout' across 3 tools"
- Future: auto-suggest tags based on description content

### 4. Add `last_reviewed_at` column for seen/unseen tracking

**Change:** Add `last_reviewed_at TEXT` column (ISO timestamp, nullable). Updated when friction is displayed via `memory friction list` for a specific tool.

Enables: "3 open items for aidev (1 high, 2 medium) -- 2 new since last review"

## Repository Changes

### 5. Add tool/source filtering to findAll

Currently `IFrictionRepository.findAll()` accepts `status` and `category` but not `tool` or `source_project`.

**Change:** Add `tool?: string` and `sourceProject?: string` to the filter options.

### 6. Add markReviewed method

**Change:** Add `markReviewed(tool: string, reviewedAt: Date): Promise<void>` to IFrictionRepository. Updates `last_reviewed_at` for all open entries matching the tool.

### 7. Add pattern detection query

**Change:** Add `findPatterns(threshold: number): Promise<FrictionPattern[]>` to IFrictionRepository. Returns tool+category combinations with `threshold` or more open entries.

```typescript
interface FrictionPattern {
  tool: string;
  category: string;
  count: number;
  entries: FrictionEntry[];
}
```

## Service Changes

### 8. Auto-ingest fallback file

On any `memory friction *` command invocation, FrictionService checks for `~/.claude/friction.jsonl`. If present:
1. Read each JSON line
2. Map fields to FrictionEntry.create() parameters (tool, severity, category, description, sourceProject, context)
3. Log each entry via the normal path
4. Delete the file

This runs before the requested command executes. The user never thinks about it.

### 9. Pattern detection in service layer

FrictionService.detectPatterns() queries for tool+category combinations with 3+ open entries and returns them as alerts. Called by the dashboard command.

## Presentation Changes

### 10. Dashboard de-branding and By Tool chart

- HTML title: "Friction Dashboard" (not "Memory Friction Dashboard")
- Add "By Tool" donut chart alongside existing severity/category/status charts
- Pattern alerts section: "Pattern detected: 3+ open entries for aidev/cli"
- Terminal dashboard: add tool breakdown row

### 11. CLI flag additions

- `memory friction log` gets `--tool <name>` flag (required for universal use)
- `memory friction list` gets `--tool <name>` filter
- `memory friction dashboard` gets `--tool <name>` filter (scoped view)

### 12. Seen/unseen indicators in list output

When displaying friction via `memory friction list --tool aidev`:
1. Mark entries as reviewed (update last_reviewed_at)
2. Show "NEW" indicator on entries where last_reviewed_at is null or older than the entry's logged_at
3. Summary line: "3 open items for aidev (1 high, 2 medium) -- 2 new since last review"

## Fallback File Schema Alignment

The fallback file (~/.claude/friction.jsonl) already uses fields that map to the new schema:

| Fallback field | DB column | Notes |
|---------------|-----------|-------|
| tool | tool | Direct match (new column) |
| severity | severity | Direct match |
| category | category | Direct match |
| description | description | Direct match |
| source_project | source_project | Direct match |
| context | context | Direct match |
| date | logged_at | Convert YYYY-MM-DD to ISO timestamp |

No field mapping friction during import.

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| FrictionEntry (add tool, tags, last_reviewed_at) | Domain | src/domain/entities/friction-entry.ts (MODIFY) |
| IFrictionRepository (add tool filter, markReviewed, findPatterns) | Domain | src/domain/ports/repositories.ts (MODIFY) |
| FrictionService (add auto-ingest, pattern detection) | Application | src/application/services/friction-service.ts (MODIFY) |
| SqliteFrictionRepository (schema migration, new queries) | Infrastructure | src/infrastructure/database/repositories/friction-repository.ts (MODIFY) |
| Schema migration (tool column, tags column, last_reviewed_at, drop CHECK) | Infrastructure | src/infrastructure/database/schema.ts (MODIFY) |
| Friction CLI commands (--tool flag, seen/unseen) | Presentation | src/presentation/cli/commands/friction.ts (MODIFY) |
| Dashboard formatters (de-brand, By Tool chart, patterns) | Presentation | src/presentation/cli/formatters/friction-dashboard.ts (MODIFY) |

## Dependencies

- Depends on: Phase 24 (friction system exists to upgrade)
- Independent of: Phase 25 (intelligence), Phase 26 (hooks), Phase 27 (qmd)
- Can run in parallel with Phases 25-27

## Testing Strategy

- Unit tests for FrictionEntry with tool field, tags, validation
- Unit tests for pattern detection logic (threshold, grouping)
- Integration tests for schema migration (existing data preserved, tool defaults to 'memory')
- Integration tests for auto-ingest (reads fallback file, imports, deletes)
- Integration tests for tool filtering (list --tool, dashboard --tool)
- Integration tests for seen/unseen tracking (markReviewed, NEW indicators)
- Regression tests for all existing friction functionality
