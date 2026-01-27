---
phase: 02-database-schema-and-ports
plan: 01
subsystem: domain-ports
tags: [typescript, interfaces, hexagonal, ports]
dependency-graph:
  requires: [phase-01]
  provides: [port-interfaces, event-types, repository-contracts]
  affects: [phase-03, phase-04, phase-05]
tech-stack:
  added: []
  patterns: [hexagonal-architecture, discriminated-unions, async-iterables]
file-tracking:
  key-files:
    created:
      - src/domain/ports/repositories.ts
      - src/domain/ports/services.ts
      - src/domain/ports/sources.ts
      - src/domain/ports/types.ts
      - src/domain/ports/ports.test.ts
    modified:
      - src/domain/ports/index.ts
decisions:
  - name: import-type-syntax
    rationale: Domain purity - port files have no runtime dependencies
  - name: discriminated-union-events
    rationale: Type-safe event handling with switch/case narrowing
  - name: async-iterable-parser
    rationale: Memory-efficient streaming for large JSONL files
metrics:
  duration: 44m
  completed: 2026-01-27
---

# Phase 02 Plan 01: Port Interfaces Summary

Port interfaces for hexagonal architecture - repository contracts, service interfaces, and event parser types.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Define repository port interfaces | 21e342d | repositories.ts |
| 2 | Define service and source port interfaces | 1df77e5 | services.ts, sources.ts, types.ts |
| 3 | Update ports index and add unit tests | 038ee71 | index.ts, ports.test.ts |

## What Was Built

### Repository Interfaces (repositories.ts)

Five repository interfaces defining persistence contracts:

- **ISessionRepository** - Session CRUD with project/recent queries
- **IMessageRepository** - Message persistence with session association
- **IToolUseRepository** - Tool invocation tracking
- **ILinkRepository** - Graph traversal relationships
- **IExtractionStateRepository** - Sync state tracking

All methods return Promise types for async compatibility.

### Service Interfaces (services.ts)

Search service interface with filtering:

- **ISearchService** - Full-text search with FTS5
- **SearchOptions** - Filter by project, role, date range

### Source Interfaces (sources.ts)

External data access contracts:

- **ISessionSource** - Session file discovery
- **IEventParser** - Streaming JSONL parser with AsyncIterable
- **SessionFileInfo** - Discovered session metadata

### Event Types (types.ts)

Discriminated union for JSONL events:

- **ParsedEvent** - Union of 7 event types
- **ContentBlock** - Assistant message content (text or tool_use)
- Event data interfaces for user, assistant, tool_use, tool_result, summary, system

## Key Technical Decisions

### 1. Import Type Syntax

All domain imports use `import type` to ensure port files have no runtime dependencies. This maintains domain purity - ports define contracts without coupling to implementations.

### 2. Discriminated Union for Events

ParsedEvent uses a discriminated union pattern enabling type-safe handling:

```typescript
switch (event.type) {
  case "user":
    // event.data is UserEventData
    break;
  case "tool_use":
    // event.data is ToolUseEventData
    break;
}
```

### 3. AsyncIterable for Parser

IEventParser returns `AsyncIterable<ParsedEvent>` enabling streaming:

```typescript
for await (const event of parser.parse(filePath)) {
  // Process one event at a time
}
```

This prevents memory exhaustion on large session files (10,000+ lines).

## Deviations from Plan

None - plan executed exactly as written.

## Test Coverage

21 new tests added in ports.test.ts:

- Repository interface mock implementations
- Service interface with SearchOptions
- Source interface with SessionFileInfo
- ParsedEvent type narrowing
- ContentBlock union types
- Event data optional fields

Total project tests: 272 passing

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| src/domain/ports/repositories.ts | Created | 5 repository interfaces |
| src/domain/ports/services.ts | Created | ISearchService + SearchOptions |
| src/domain/ports/sources.ts | Created | ISessionSource + IEventParser |
| src/domain/ports/types.ts | Created | ParsedEvent discriminated union |
| src/domain/ports/ports.test.ts | Created | 21 interface tests |
| src/domain/ports/index.ts | Modified | Export all interfaces |

## Verification Results

All success criteria met:

- [x] ISessionRepository defined with all CRUD operations
- [x] IMessageRepository defined with session-scoped queries
- [x] IToolUseRepository defined for tool tracking
- [x] ILinkRepository defined for graph traversal
- [x] IExtractionStateRepository defined for sync state
- [x] ISearchService defined with SearchOptions
- [x] ISessionSource defined for file discovery
- [x] IEventParser defined with AsyncIterable pattern
- [x] All interfaces use Promise return types
- [x] All interfaces reference domain types only (no SQL, no infrastructure)
- [x] 21 tests pass for port interfaces
- [x] TypeScript compiles without errors

## Next Phase Readiness

Phase 2 Plan 2 can proceed - SQLite repository implementations will use these interfaces.

Dependencies satisfied:
- Domain entities from Phase 1
- Value objects from Phase 1
- Port interfaces from this plan

No blockers identified.
