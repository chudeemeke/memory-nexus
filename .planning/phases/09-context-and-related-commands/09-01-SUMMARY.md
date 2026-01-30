---
phase: "09"
plan: "01"
title: "Link Repository Implementation"
subsystem: "infrastructure"
tags: ["sqlite", "repository", "graph-traversal", "recursive-cte"]
dependency-graph:
  requires: ["02-02"]
  provides: ["link-repository", "graph-traversal"]
  affects: ["09-02", "09-03", "09-04"]
tech-stack:
  added: []
  patterns: ["WITH RECURSIVE CTE", "cycle prevention", "weight decay"]
key-files:
  created:
    - src/infrastructure/database/repositories/link-repository.ts
    - src/infrastructure/database/repositories/link-repository.test.ts
  modified:
    - src/infrastructure/database/repositories/index.ts
    - src/infrastructure/database/index.ts
decisions:
  - id: cte-cycle-prevention
    choice: "Path string with NOT LIKE check"
    rationale: "Simple, effective cycle detection without complex state tracking"
  - id: related-link-type
    choice: "Separate RelatedLink type for hop info"
    rationale: "Preserves ILinkRepository interface while enabling hop tracking"
  - id: weight-decay
    choice: "Multiplicative decay through path"
    rationale: "Natural relevance decay: 0.8 * 0.9 = 0.72 for 2-hop"
metrics:
  tests-added: 27
  coverage-functions: 100%
  coverage-lines: 100%
  duration: "5 minutes"
  completed: 2026-01-30
---

# Phase 9 Plan 1: Link Repository Implementation Summary

**SqliteLinkRepository with WITH RECURSIVE CTE for multi-hop graph traversal**

## What Was Built

### SqliteLinkRepository (link-repository.ts)

Implements ILinkRepository interface with full graph traversal capability:

1. **Basic CRUD Operations**
   - `save(link)` - INSERT OR REPLACE for upsert behavior
   - `saveMany(links)` - Batch insert with transaction
   - `findBySource(type, id)` - Find links from entity
   - `findByTarget(type, id)` - Find links to entity

2. **Graph Traversal with Recursive CTE**
   - `findRelated(entityType, entityId, maxHops)` - Returns Link[]
   - `findRelatedWithHops(entityType, entityId, maxHops)` - Returns RelatedLink[]

### Key Implementation Details

**WITH RECURSIVE CTE Pattern:**
```sql
WITH RECURSIVE related(...) AS (
  -- Base case: 1-hop direct connections
  SELECT ... FROM links WHERE source_type = ? AND source_id = ?

  UNION ALL

  -- Recursive case: N+1 hops
  SELECT ... FROM links l
  JOIN related r ON l.source_type = r.target_type AND l.source_id = r.target_id
  WHERE r.hop < $maxHops
    AND r.path NOT LIKE '%' || l.target_type || ':' || l.target_id || '%'
)
```

**Cycle Prevention:**
- Path tracking: `source:id->target:id->...`
- NOT LIKE check prevents revisiting nodes in current traversal path

**Weight Decay:**
- Multiplicative: `l.weight * r.weight` at each hop
- Example: 0.8 (hop 1) * 0.9 (hop 2) = 0.72 final weight

**Result Ordering:**
- Primary: hop count ascending (closer = more relevant)
- Secondary: weight descending (stronger = more relevant)

## Test Coverage

27 tests covering:

| Category | Tests |
|----------|-------|
| save() | 4 |
| saveMany() | 4 |
| findBySource() | 3 |
| findByTarget() | 3 |
| findRelated (graph traversal) | 6 |
| findRelatedWithHops (extended) | 3 |
| Link validation | 4 |

**Coverage:** 100% functions, 100% lines for link-repository.ts

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d6991c0 | feat | Implement SqliteLinkRepository with basic CRUD |
| 4afcbf3 | chore | Export SqliteLinkRepository from index files |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

### 1. RelatedLink Type for Hop Information

**Decision:** Create separate `RelatedLink` interface rather than modifying `Link` entity.

```typescript
export interface RelatedLink {
  link: Link;
  hop: number;
}
```

**Rationale:**
- Preserves Link immutability
- ILinkRepository.findRelated() returns Link[] per interface
- findRelatedWithHops() provides extended info when needed
- No interface changes required

### 2. Path-Based Cycle Prevention

**Decision:** Use path string with NOT LIKE check.

```sql
AND r.path NOT LIKE '%' || l.target_type || ':' || l.target_id || '%'
```

**Rationale:**
- Simple to implement
- Effective for graphs with reasonable depth (maxHops typically 2-3)
- String matching is efficient in SQLite
- Alternative (visited set) would require more complex state management

### 3. Multiplicative Weight Decay

**Decision:** Decay weight by multiplication through path.

**Rationale:**
- Natural interpretation: 80% relevance * 90% relevance = 72% relevance
- Encourages shorter paths (higher final weights)
- Simple to compute inline in SQL

## Files Created

| File | Purpose |
|------|---------|
| link-repository.ts | SqliteLinkRepository implementation |
| link-repository.test.ts | 27 unit/integration tests |

## Files Modified

| File | Change |
|------|--------|
| repositories/index.ts | Export SqliteLinkRepository, RelatedLink |
| database/index.ts | Re-export through database barrel |

## Next Phase Readiness

### Provides for 09-02:
- SqliteLinkRepository for persisting topic links
- RelatedLink type for context aggregation

### Provides for 09-03:
- findRelated() for "related" command implementation
- Graph traversal with configurable hop depth

### No Blockers

All requirements satisfied for subsequent plans.
