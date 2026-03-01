---
phase: 21-architecture-boundary-cleanup
plan: 01
subsystem: architecture
tags: [hexagonal, ports, dependency-inversion, ISP, embedding]

# Dependency graph
requires:
  - phase: 14-embedding-infrastructure
    provides: EmbeddingRepository class, IEmbeddingProvider port pattern
  - phase: 15-embedding-pipeline
    provides: EmbeddingService class with infrastructure imports
provides:
  - IEmbeddingRepository domain port interface with 7 synchronous methods
  - EmbeddingServiceConfig domain type (minimal subset of EmbeddingConfigData)
  - UnembeddedMessage and EmbeddingBatchItem types moved to domain layer
  - Clean application-to-domain dependency in EmbeddingService
affects: [embedding-pipeline, hybrid-search, api-stabilization]

# Tech tracking
tech-stack:
  added: []
  patterns: [synchronous-port-interface, ISP-for-repository-ports, type-re-export-for-backward-compatibility]

key-files:
  created: []
  modified:
    - src/domain/ports/repositories.ts
    - src/domain/ports/index.ts
    - src/application/services/embedding-service.ts
    - src/application/services/embedding-service.test.ts
    - src/infrastructure/database/repositories/embedding-repository.ts

key-decisions:
  - "IEmbeddingRepository methods are synchronous (return T, not Promise<T>) matching bun:sqlite's synchronous API"
  - "ISP applied: vectorKnnSearch, getStoredEmbeddingDimensions, recreateVecTable excluded from port (infrastructure-only)"
  - "EmbeddingServiceConfig is a minimal 4-field subset of EmbeddingConfigData (excludes enabled, apiKey, baseUrl)"
  - "Infrastructure re-exports domain types to maintain backward compatibility for existing consumers"

patterns-established:
  - "Synchronous port pattern: domain ports can be synchronous when the infrastructure adapter uses a synchronous API (bun:sqlite)"
  - "Type migration with re-export: move types to domain, re-export from infrastructure to avoid breaking existing consumers"

requirements-completed: [QUAL-03]

# Metrics
duration: 15min
completed: 2026-03-01
---

# Phase 21 Plan 01: Architecture Boundary Cleanup Summary

**IEmbeddingRepository domain port with 7 synchronous methods, closing the last application-to-infrastructure import violation (BOUNDARY-01)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-01T17:28:39Z
- **Completed:** 2026-03-01T17:44:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Defined IEmbeddingRepository port interface in domain/ports/repositories.ts with 7 synchronous methods
- Defined EmbeddingServiceConfig, UnembeddedMessage, and EmbeddingBatchItem as domain types
- Updated EmbeddingService and its tests to import exclusively from domain layer (zero infrastructure imports)
- Added `implements IEmbeddingRepository` clause to infrastructure EmbeddingRepository class
- All 2604 tests pass with 0 failures (no behavioral regression)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define domain port types** - `09a58e8` (feat)
2. **Task 2: Update imports and add implements clause** - `1c504d5` (refactor)

## Files Created/Modified
- `src/domain/ports/repositories.ts` - Added IEmbeddingRepository, UnembeddedMessage, EmbeddingBatchItem, EmbeddingServiceConfig interfaces
- `src/domain/ports/index.ts` - Added re-exports for all 4 new types
- `src/application/services/embedding-service.ts` - Changed imports from infrastructure to domain ports
- `src/application/services/embedding-service.test.ts` - Changed imports from infrastructure to domain ports, removed enabled field from config
- `src/infrastructure/database/repositories/embedding-repository.ts` - Added implements clause, removed local type definitions, re-exports from domain

## Decisions Made
- IEmbeddingRepository methods are synchronous (not async) because bun:sqlite is synchronous. This breaks the pattern of other repository ports (ISessionRepository, etc.) which are async, but correctly reflects the actual API contract.
- Applied ISP (Interface Segregation Principle): only the 7 methods used by EmbeddingService are in the port. Infrastructure-only methods (vectorKnnSearch, getStoredEmbeddingDimensions, recreateVecTable) are excluded.
- EmbeddingServiceConfig contains only the 4 fields EmbeddingService needs (provider, model, dimensions, batchSize), not the full EmbeddingConfigData (which also has enabled, apiKey, baseUrl).
- Re-exported UnembeddedMessage and EmbeddingBatchItem from infrastructure's embedding-repository.ts to maintain backward compatibility for existing infrastructure-layer consumers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 21 is the last gap closure phase for v2.0 milestone
- All 10/10 v2.0 phases now complete
- v2.0 milestone ready for final sign-off

---
*Phase: 21-architecture-boundary-cleanup*
*Completed: 2026-03-01*
