---
phase: 07
plan: 05
subsystem: search-infrastructure
tags: [search, filter, project-filter, substring-match]
requires:
  - "07-02: Search filter options"
provides:
  - "Case-insensitive substring project filter"
  - "User-friendly --project option"
affects:
  - "UAT verification"
  - "Any consumer of SearchOptions.projectFilter"
tech-stack:
  patterns:
    - "LIKE clause for substring matching"
    - "LOWER() for case-insensitive comparison"
key-files:
  modified:
    - src/domain/ports/services.ts
    - src/infrastructure/database/services/search-service.ts
    - src/infrastructure/database/services/search-service.test.ts
    - src/domain/ports/ports.test.ts
    - src/presentation/cli/commands/search.ts
    - src/presentation/cli/commands/search.test.ts
    - src/infrastructure/database/integration.test.ts
decisions:
  - id: string-over-projectpath
    choice: "Change projectFilter from ProjectPath to string"
    rationale: "Users expect to filter by project name ('wow-system'), not filesystem path"
  - id: like-query-pattern
    choice: "Use LOWER(project_name) LIKE LOWER(?) with wildcards"
    rationale: "Matches session-repository.ts pattern, enables substring and case-insensitive matching"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-03"
---

# Phase 07 Plan 05: Project Filter Gap Closure Summary

Case-insensitive substring matching for --project filter using project_name column

## One-liner

Changed projectFilter from ProjectPath to string, using LIKE query on project_name for user-friendly filtering

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Change SearchOptions.projectFilter to string | 1a10897 | services.ts, search-service.ts, tests |
| 2 | Update search command to pass string projectFilter | bba0c8b | search.ts, search.test.ts, integration.test.ts |

## Technical Details

### Problem
The original implementation expected users to provide full filesystem paths for project filtering:
```typescript
// Old - required full path
--project "C:\Users\Test\wow-system"
```

This was impractical because:
1. Users don't know the full path
2. Project names are more intuitive
3. Substring matching provides flexibility

### Solution
Changed to substring matching on project_name:
```typescript
// New - accepts partial names
--project "system"     // matches wow-system, memory-nexus-system, etc.
--project "wow"        // matches wow-system, wow-v2, etc.
```

### Implementation

**SearchOptions type change:**
```typescript
// Before
projectFilter?: ProjectPath;

// After
projectFilter?: string;
```

**SQL query change:**
```typescript
// Before
whereClauses.push("s.project_path_encoded = ?");
params.push(options.projectFilter.encoded);

// After
whereClauses.push("LOWER(s.project_name) LIKE LOWER(?)");
params.push(`%${options.projectFilter}%`);
```

**CLI command change:**
```typescript
// Before
projectFilter: options.project ? ProjectPath.fromDecoded(options.project) : undefined,

// After
projectFilter: options.project,
```

## Tests Added

1. **Test 33** in search-service.test.ts - Verifies case-insensitive substring matching
2. **Project filter substring test** in search.test.ts - Integration test for partial name matching
3. Updated **Test 29** in integration.test.ts - Uses string instead of ProjectPath

## Verification

- All 1551 tests pass
- Project filter matches by substring (e.g., "system" matches "wow-system")
- Filter is case-insensitive ("SYSTEM" matches "wow-system")

## Deviations from Plan

None - plan executed exactly as written.

## Files Modified

| File | Changes |
|------|---------|
| `src/domain/ports/services.ts` | Changed projectFilter type from ProjectPath to string, removed import |
| `src/infrastructure/database/services/search-service.ts` | Updated buildSearchQuery to use LIKE on project_name |
| `src/infrastructure/database/services/search-service.test.ts` | Updated tests, added Test 33 for substring matching |
| `src/domain/ports/ports.test.ts` | Updated mock to use string projectFilter |
| `src/presentation/cli/commands/search.ts` | Removed ProjectPath import, pass string directly |
| `src/presentation/cli/commands/search.test.ts` | Added substring matching integration test |
| `src/infrastructure/database/integration.test.ts` | Updated Test 29 to use string projectFilter |

## UAT Impact

This fix addresses a gap found in UAT verification where `--project wow-system` was returning no results because:
1. The implementation expected an exact match on `project_path_encoded`
2. User input wasn't being converted to the correct encoded path format

Now users can use intuitive partial project names and get expected results.
