# Phase 21: Architecture Boundary Cleanup - Research

**Researched:** 2026-03-01
**Domain:** Hexagonal architecture boundary enforcement (port/adapter pattern for EmbeddingRepository)
**Confidence:** HIGH

## Summary

Phase 21 addresses BOUNDARY-01 from the milestone audit: `EmbeddingService` (application layer) imports two infrastructure types directly -- `EmbeddingRepository` and `EmbeddingConfigData`. This violates hexagonal architecture's dependency rule, where application code must depend only on domain ports, never on infrastructure implementations.

The fix is mechanical: define an `IEmbeddingRepository` port interface in `domain/ports/`, make `EmbeddingRepository` implement it, and update `EmbeddingService` to import only the domain port. The same treatment applies to the `EmbeddingConfigData` type reference. Every other repository in the codebase already follows this pattern (ISessionRepository, IMessageRepository, IToolUseRepository, ILinkRepository, IExtractionStateRepository, IEntityRepository), so this phase aligns the embedding repository with the established convention.

**Primary recommendation:** Extract an `IEmbeddingRepository` interface in `domain/ports/` containing all methods EmbeddingService calls, plus a lightweight `EmbeddingConfigData` type alias in the domain layer. Update imports in `embedding-service.ts` and its test file. Make infrastructure `EmbeddingRepository` implement the port. No behavioral changes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-03 | All new infrastructure adapters follow existing port/adapter patterns | Defining IEmbeddingRepository port and having EmbeddingRepository implement it completes the port/adapter alignment. EmbeddingService will import only from domain layer. |
</phase_requirements>

## Standard Stack

No new dependencies. This is a pure refactoring phase using existing TypeScript and project conventions.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.5+ | Type system | Already in project |
| bun:test | built-in | Test runner | Already in project |

## Architecture Patterns

### Existing Port/Adapter Pattern (REPLICATE THIS)

Every repository in the project follows the same pattern:

```
domain/ports/repositories.ts   -- defines IXxxRepository interface
infrastructure/.../xxx-repository.ts -- class SqliteXxxRepository implements IXxxRepository
application/services/xxx-service.ts -- imports IXxxRepository from domain, never infrastructure
```

**Evidence (6 repositories following this pattern):**
- `ISessionRepository` -> `SqliteSessionRepository`
- `IMessageRepository` -> `SqliteMessageRepository`
- `IToolUseRepository` -> `SqliteToolUseRepository`
- `ILinkRepository` -> `SqliteLinkRepository`
- `IExtractionStateRepository` -> `SqliteExtractionStateRepository`
- `IEntityRepository` -> `SqliteEntityRepository`

**The anomaly (EmbeddingRepository):**
- `EmbeddingRepository` is a plain class with NO `implements` clause
- `EmbeddingService` imports the class type directly from infrastructure
- `EmbeddingService` also imports `EmbeddingConfigData` from infrastructure

### Recommended Project Structure Changes

```
src/
  domain/
    ports/
      repositories.ts        # ADD: IEmbeddingRepository interface
      index.ts                # ADD: re-export IEmbeddingRepository
  application/
    services/
      embedding-service.ts    # CHANGE: import IEmbeddingRepository from domain, not infrastructure
      embedding-service.test.ts # CHANGE: update import paths
  infrastructure/
    database/
      repositories/
        embedding-repository.ts  # CHANGE: add "implements IEmbeddingRepository"
```

### Pattern: Interface Extraction from Concrete Class

The `IEmbeddingRepository` interface should contain exactly the methods that `EmbeddingService` calls. Looking at the EmbeddingService code, these are:

```typescript
// Methods called by EmbeddingService:
findUnembedded(limit: number): UnembeddedMessage[]
storeBatch(items: EmbeddingBatchItem[], modelHash: string, modelName: string): void
getStoredModelHash(): string | null
getStoredModelName(): string | null
clearAllEmbeddings(): void
getEmbeddedCount(): number
getTotalMessageCount(): number
```

The remaining methods on `EmbeddingRepository` (`vectorKnnSearch`, `getStoredEmbeddingDimensions`, `recreateVecTable`) are NOT called by `EmbeddingService`. They are called by `HybridSearchService` and the sync command directly. The interface should be MINIMAL -- include only what the domain port contract requires, not the full infrastructure class surface.

**Decision point:** Define a narrow `IEmbeddingRepository` for EmbeddingService only, or a comprehensive one covering all consumers?

**Recommendation: Narrow interface for now.** Only the 7 methods above. This follows ISP (Interface Segregation Principle). HybridSearchService lives in infrastructure and can import the concrete class directly (infrastructure-to-infrastructure is legal in hexagonal architecture). The sync command is presentation-layer wiring code that legitimately knows about infrastructure. Expanding the interface later is additive and non-breaking.

### EmbeddingConfigData Type Location

`EmbeddingConfigData` is a plain data interface defined in `infrastructure/hooks/config-manager.ts`. The `EmbeddingService` imports it for the `computeModelHash` function signature and the constructor `config` parameter.

**Options:**

1. **Move the interface to domain** -- Violates the principle that config-manager owns its own types
2. **Define a parallel type in domain** -- Duplication, sync risk
3. **Define a minimal type alias in domain** -- Just the fields EmbeddingService needs: `{ provider: string; model: string; dimensions: number; batchSize: number }`

**Recommendation: Option 3.** Define `EmbeddingServiceConfig` (or similar) in the domain ports layer with just the 4 fields EmbeddingService needs. The infrastructure config-manager type is broader (includes `enabled`, `apiKey`, `baseUrl`). The domain type is minimal and stable. The presentation layer passes `config.embedding` which structurally satisfies both.

### Supporting Types (UnembeddedMessage, EmbeddingBatchItem)

These two interfaces are currently defined alongside `EmbeddingRepository` in infrastructure:

```typescript
interface UnembeddedMessage { rowid: number; content: string; }
interface EmbeddingBatchItem { rowid: number; embedding: Float32Array; }
```

They are used in the `IEmbeddingRepository` method signatures, so they MUST live in the domain layer alongside the port interface. They contain only primitives and `Float32Array` -- zero external dependencies, safe for the domain layer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interface extraction | Manual method-by-method copying | TypeScript's structural typing verifies correctness at compile time | Compiler catches any method signature mismatch between interface and implementation |

## Common Pitfalls

### Pitfall 1: Breaking the Export Chain
**What goes wrong:** New types defined in `domain/ports/` but not re-exported through barrel files, causing import failures or missing public API types.
**Why it happens:** The barrel chain is 3 levels deep: `domain/ports/repositories.ts` -> `domain/ports/index.ts` -> `domain/index.ts` -> `src/index.ts`.
**How to avoid:** After defining `IEmbeddingRepository` in `repositories.ts`, verify it appears in `domain/ports/index.ts` exports. Since `domain/index.ts` already does `export * from "./ports/index.js"`, and `src/index.ts` does `export * from "./domain/index.js"`, the chain should propagate. But verify.
**Warning signs:** TypeScript compile succeeds but consumers cannot import the type by name.

### Pitfall 2: Method Signature Drift
**What goes wrong:** The `IEmbeddingRepository` interface has method signatures that don't exactly match the concrete `EmbeddingRepository` class, causing TypeScript errors.
**Why it happens:** Copy-paste errors, or the concrete class has slightly different parameter/return types.
**How to avoid:** Add `implements IEmbeddingRepository` to the class IMMEDIATELY after defining the interface. TypeScript will report any mismatch at compile time.
**Warning signs:** `tsc` errors on the `implements` clause.

### Pitfall 3: Over-Broad Interface
**What goes wrong:** Including all EmbeddingRepository methods in the port interface, including infrastructure-specific ones like `vectorKnnSearch` and `recreateVecTable`.
**Why it happens:** Temptation to make the interface "complete."
**How to avoid:** Only include methods that the application layer calls. Infrastructure callers (HybridSearchService, sync command) can import the concrete class directly.
**Warning signs:** Domain port interface referencing `VectorSearchRow` or other infrastructure-specific types.

### Pitfall 4: Forgetting to Update Tests
**What goes wrong:** `embedding-service.test.ts` still imports from infrastructure after the production code is fixed.
**Why it happens:** Tests are often forgotten during refactoring.
**How to avoid:** Update test imports in the same commit. The mock factory function `createMockRepository()` should use `IEmbeddingRepository` as the type, not the concrete class.

### Pitfall 5: Sync Async Mismatch
**What goes wrong:** Defining port methods as `Promise<T>` when the concrete implementation is synchronous, or vice versa.
**Why it happens:** All other repository ports use `Promise<T>` (async), but `EmbeddingRepository` methods are synchronous (they use bun:sqlite's synchronous API).
**How to avoid:** The port interface should match the actual contract. EmbeddingRepository methods are synchronous. The interface should reflect that. Using `T` (not `Promise<T>`) is correct here.
**Note:** The existing ports in `repositories.ts` are ALL async (`Promise<T>`). The EmbeddingRepository is the only synchronous one. This is intentional -- it was built for Phase 14+ where synchronous sqlite-vec operations were preferred for performance. The port interface should be synchronous to match.

## Code Examples

### IEmbeddingRepository Port Definition

```typescript
// Source: pattern extracted from existing domain/ports/repositories.ts + EmbeddingService usage

/**
 * An unembedded message ready for embedding.
 */
export interface UnembeddedMessage {
    /** The integer rowid from messages_meta */
    rowid: number;
    /** The message content text to embed */
    content: string;
}

/**
 * A single item in an embedding batch for storage.
 */
export interface EmbeddingBatchItem {
    /** The integer rowid matching messages_meta.rowid */
    rowid: number;
    /** The embedding vector */
    embedding: Float32Array;
}

/**
 * Repository port for embedding data access.
 *
 * Methods are synchronous (matching bun:sqlite's synchronous API).
 * Implemented by infrastructure EmbeddingRepository.
 */
export interface IEmbeddingRepository {
    findUnembedded(limit: number): UnembeddedMessage[];
    storeBatch(items: EmbeddingBatchItem[], modelHash: string, modelName: string): void;
    getStoredModelHash(): string | null;
    getStoredModelName(): string | null;
    clearAllEmbeddings(): void;
    getEmbeddedCount(): number;
    getTotalMessageCount(): number;
}
```

### EmbeddingServiceConfig Domain Type

```typescript
// Source: fields extracted from EmbeddingConfigData used by EmbeddingService

/**
 * Configuration needed by EmbeddingService.
 *
 * Minimal subset of the infrastructure EmbeddingConfigData.
 * The presentation layer passes config.embedding which structurally
 * satisfies this interface.
 */
export interface EmbeddingServiceConfig {
    /** Provider identifier */
    provider: string;
    /** Model identifier */
    model: string;
    /** Number of dimensions in embedding vectors */
    dimensions: number;
    /** Number of messages to embed per batch */
    batchSize: number;
}
```

### Updated EmbeddingService Imports

```typescript
// BEFORE (violates boundary):
import type { EmbeddingRepository, EmbeddingBatchItem } from "../../infrastructure/database/repositories/embedding-repository.js";
import type { EmbeddingConfigData } from "../../infrastructure/hooks/config-manager.js";

// AFTER (domain-only imports):
import type { IEmbeddingRepository, EmbeddingBatchItem } from "../../domain/ports/repositories.js";
import type { EmbeddingServiceConfig } from "../../domain/ports/repositories.js";
```

### Updated Infrastructure Class

```typescript
// BEFORE:
export class EmbeddingRepository {
    constructor(private readonly db: Database) {}
    // ...methods
}

// AFTER:
import type { IEmbeddingRepository, UnembeddedMessage, EmbeddingBatchItem } from "../../../domain/ports/repositories.js";

export class EmbeddingRepository implements IEmbeddingRepository {
    constructor(private readonly db: Database) {}
    // ...same methods, now type-checked against the port
}
```

## Scope Boundary

### In Scope
1. Define `IEmbeddingRepository` port in `domain/ports/repositories.ts`
2. Move `UnembeddedMessage` and `EmbeddingBatchItem` types to domain
3. Define `EmbeddingServiceConfig` in domain ports
4. Update `EmbeddingService` imports to use domain ports only
5. Update `embedding-service.test.ts` imports
6. Add `implements IEmbeddingRepository` to infrastructure class
7. Update barrel exports (`domain/ports/index.ts`)
8. Verify no application-to-infrastructure imports remain

### Out of Scope
- HybridSearchService refactoring (infrastructure-to-infrastructure is legal)
- Sync command refactoring (presentation-to-infrastructure wiring is legal)
- Moving `EmbeddingConfigData` itself (it stays in config-manager)
- Changing any runtime behavior
- Adding new tests beyond updating imports in existing tests

## Verification Strategy

After completion, the following audit confirms success:

```bash
# 1. No application-to-infrastructure imports
grep -rn "from.*infrastructure" src/application/ --include="*.ts" | grep -v ".test.ts"
# Should return 0 lines

# 2. EmbeddingRepository implements the port
grep "implements IEmbeddingRepository" src/infrastructure/database/repositories/embedding-repository.ts
# Should return 1 line

# 3. All tests pass
bun test
# Should pass with same count as before (no behavioral changes)

# 4. TypeScript compiles cleanly
bunx tsc --noEmit
# Should have no errors
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Concrete class imports across layers | Port interfaces in domain | Phase 14 (partially) | EmbeddingRepository was the only holdout from the port pattern |

## Open Questions

None. The path is clear and mechanical. All patterns exist in the codebase; this phase replicates them.

## Sources

### Primary (HIGH confidence)
- `src/application/services/embedding-service.ts` -- The file with boundary violations (lines 16-17)
- `src/infrastructure/database/repositories/embedding-repository.ts` -- The concrete class missing a port
- `src/domain/ports/repositories.ts` -- Existing port pattern to replicate
- `.planning/v2.0-MILESTONE-AUDIT.md` -- BOUNDARY-01 finding (lines 108, 128)

### Secondary (HIGH confidence)
- `src/infrastructure/database/repositories/session-repository.ts` -- Reference implementation of the port/adapter pattern
- `src/infrastructure/hooks/config-manager.ts` -- Source of EmbeddingConfigData definition

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, pure refactoring
- Architecture: HIGH - Pattern exists 6 times in the codebase, exact template to follow
- Pitfalls: HIGH - Known failure modes from Phase 20 barrel export experience

**Research date:** 2026-03-01
**Valid until:** Indefinite (patterns are project-internal, not library-dependent)
