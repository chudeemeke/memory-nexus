# Phase 20: Public API Type Exports - Research

**Researched:** 2026-03-01
**Domain:** TypeScript barrel exports, public API surface design
**Confidence:** HIGH

## Summary

Phase 20 is a gap closure phase. The integration checker identified two missing export groups from the public API surface established in Phase 18. These types are defined in `src/domain/ports/services.ts` but not reachable from `src/index.ts` because `domain/ports/index.ts` only exports `ISearchService` and `SearchOptions` from `services.ts` -- the five other types in that file (`SearchMode`, `HybridSearchOptions`, `IStatsService`, `StatsResult`, `ProjectStats`) are omitted.

The fix is a mechanical two-file change: add five type names to the export list in `src/domain/ports/index.ts`, and optionally add them explicitly to `src/index.ts` for documentation clarity. No new files, no new logic, no behavior changes. The phase also requires documentation of the newly-exported types in the README API reference, and tests that verify the types are importable from the public entry point.

The `nyquist_validation` key is absent from `.planning/config.json` (the key does not exist), so the Validation Architecture section is omitted per the research protocol.

**Primary recommendation:** Add five type exports to `src/domain/ports/index.ts` (two lines of changes), add import verification tests to `tests/integration/programmatic-api.test.ts`, and extend the README Programmatic API section with the new types.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTEG-01 | Export stable programmatic API surface (execute*Command functions with typed options and return values) - **strengthened** to include domain search types | Adding `SearchMode`, `HybridSearchOptions`, `IStatsService`, `StatsResult`, `ProjectStats` to the domain ports barrel completes the API surface gap identified by the integration checker. The execute*Command functions already use these types internally; exposing them lets consumers write strongly-typed search code without repeating inline type definitions. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.5+ | `export type { ... }` syntax for type-only re-exports | Type-only exports are tree-shakeable and do not create circular runtime dependencies |
| bun:test | bundled | Unit and integration tests | Project standard; all existing tests use it |

### Supporting

No new libraries needed. This phase is entirely within existing TypeScript source and test infrastructure.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `export type { ... }` in barrel | `export { ... }` without `type` keyword | `export type` is preferred for interfaces/types (zero runtime cost); `export` also works but is semantically imprecise for type-only items |
| Adding to `domain/ports/index.ts` | Adding directly to `src/index.ts` | Both work. Adding to `domain/ports/index.ts` is the principled path because it keeps the domain barrel complete; `src/index.ts` then inherits via `export * from "./domain/index.js"` once the domain re-exports ports |

**Installation:** No new packages required.

## Architecture Patterns

### Current Export Chain (before fix)

```
src/index.ts
  export * from "./domain/index.js"         <- domain/index.ts
    export * from "./entities/index.js"
    export * from "./value-objects/index.js"
    export * from "./services/index.js"
    export * from "./errors/index.js"
    -- domain/ports/ NOT re-exported from domain/index.ts --

  export * from "./application/index.js"
  export { execute*Command } from ...       <- explicit
  export type { ...options... }             <- explicit
```

**Gap:** `domain/index.ts` does not include `export * from "./ports/index.js"`. The domain ports ARE separately exported via `export * from "./domain/index.js"` in `src/index.ts`? No - reading `domain/index.ts` confirms it only re-exports `entities`, `value-objects`, `services`, `errors`. Ports are NOT re-exported from `domain/index.ts`.

However, `src/index.ts` does NOT have an explicit `export * from "./domain/ports/index.js"` either. The domain ports that ARE currently reachable (`ISearchService`, `SearchOptions`, `IEmbeddingProvider`, `DownloadProgress`, `EmbeddingModelInfo`, `ISessionRepository`, etc.) reach consumers because `domain/index.ts` would need to export them -- but actually it does NOT explicitly include ports. The existing ports tests (`ports.test.ts`) import directly from `./index.js` within the ports directory, not from the public surface.

This means the currently-exported port types (those visible to consumers via `@chude/memory`) are ONLY those explicitly named in `src/index.ts`. Currently `src/index.ts` uses `export * from "./domain/index.js"` which expands to entities, value-objects, services, errors -- but not ports. The ports barrel (`domain/ports/index.ts`) is referenced only in internal imports, not in the public chain.

### Corrected Understanding of What Is Missing

**Currently MISSING from public surface (`src/index.ts`):**
- `SearchMode` (type alias in `domain/ports/services.ts`)
- `HybridSearchOptions` (interface in `domain/ports/services.ts`)
- `IStatsService` (interface in `domain/ports/services.ts`)
- `StatsResult` (interface in `domain/ports/services.ts`)
- `ProjectStats` (interface in `domain/ports/services.ts`)

**Currently ALSO MISSING (but not flagged by MISSING-01/MISSING-02):**
All other port interfaces (`ISearchService`, `SearchOptions`, `IEmbeddingProvider`, etc.) are also missing from the public surface if `domain/ports/index.ts` is not included in the export chain. The integration checker specifically calls out the five above because they are the ones needed by aidev consumers for typed search operations and stats result processing.

### Recommended Fix Structure

**Option A (Minimal - addresses only the five flagged types):**

Add to `src/index.ts`:
```typescript
// Domain search and stats types for typed consumer use
export type {
  SearchMode,
  HybridSearchOptions,
  IStatsService,
  StatsResult,
  ProjectStats,
} from "./domain/ports/services.js";
```

**Option B (Complete - expose full domain ports barrel):**

Add to `domain/index.ts`:
```typescript
export * from "./ports/index.js";
```

Then add to `domain/ports/index.ts` (the currently missing five plus any desired):
```typescript
export type { SearchMode, HybridSearchOptions, IStatsService, StatsResult, ProjectStats } from "./services.js";
```

**Recommendation: Option B** -- The domain barrel (`domain/index.ts`) should include the ports barrel. This is more architecturally complete: consumers get the full domain vocabulary including all port interfaces, and the planner gets the two-file fix in the right place. The integration checker already confirmed `domain/ports/index.ts` is incomplete; fixing it at the barrel level is cleaner than patching `src/index.ts` with individual imports from deep paths.

### Anti-Patterns to Avoid

- **Adding direct `import from "domain/ports/services.js"` in `src/index.ts`:** Works but bypasses the barrel hierarchy, making `src/index.ts` responsible for internal path knowledge it shouldn't need.
- **Exporting concrete infrastructure types:** Phase 20 is about domain port types only. Do NOT export `EmbeddingRepository`, `HybridSearchService`, or other infrastructure/application concretions through the public API.
- **Accidentally re-exporting duplicate names:** `SearchOptions` is already exported from `domain/ports/index.ts`. When adding `SearchMode` and `HybridSearchOptions`, check for name collisions with existing exports from `domain/index.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type re-export | Custom type wrapper | Native `export type { ... }` | TypeScript supports type re-exports with zero overhead |
| Export verification test | Complex reflection | TypeScript `import type` + runtime `expect(typeof X)` | Type-only imports verify the export chain at compile time; the existing ports test pattern (`ports.test.ts`) shows the idiom |

**Key insight:** This phase has no non-trivial implementation. The real risk is (a) accidentally introducing duplicate export names, and (b) missing the test additions that confirm the types are importable from `@chude/memory` (not just from internal paths).

## Common Pitfalls

### Pitfall 1: Stopping at `domain/ports/index.ts` without propagating to `domain/index.ts`

**What goes wrong:** Adding `SearchMode` etc. to `domain/ports/index.ts` does not make them visible from `@chude/memory` unless `domain/index.ts` also re-exports the ports barrel.
**Why it happens:** The fix looks local but the export chain has a gap one level up.
**How to avoid:** After adding to `domain/ports/index.ts`, trace the chain upward: `domain/ports/index.ts` -> `domain/index.ts` -> `src/index.ts`. Either add `export * from "./ports/index.js"` to `domain/index.ts`, or add explicit re-exports in `src/index.ts`.
**Warning signs:** Test file imports from `../../src/index.js` but TypeScript reports "Module '@chude/memory' has no exported member 'SearchMode'".

### Pitfall 2: Duplicate export name conflict

**What goes wrong:** `SearchOptions` is already exported from `domain/ports/index.ts`. If `domain/index.ts` starts re-exporting ports via `export *`, and `domain/index.ts` also re-exports `services` which might have overlapping names, a "Duplicate identifier" error occurs.
**Why it happens:** `export *` from two sources that share a name causes a compile error in strict mode.
**How to avoid:** Audit the names currently exported by `domain/index.ts` (entities, value-objects, services, errors) against the names in `domain/ports/index.ts`. The domain `services/index.ts` exports `ContentExtractor`, `PathDecoder`, `QueryParser`, `ParsedQuery`, `QueryFilters` -- no conflict with port names. The value objects and entities use different names. Safe to proceed.
**Warning signs:** TypeScript error "Module './ports/index.js' has already exported a member named 'X'".

### Pitfall 3: Test verifies internal import path instead of public API

**What goes wrong:** Test imports `from "../../src/domain/ports/services.js"` instead of `from "../../src/index.js"`. This passes even if the public export is still broken.
**Why it happens:** The existing `ports.test.ts` imports from the internal path (it is a domain unit test). Copying that pattern for the integration test defeats the purpose.
**How to avoid:** The integration verification test MUST import from `"../../src/index.js"` (or from the package name in a fully-built context). The existing `programmatic-api.test.ts` already does this correctly for command types.

### Pitfall 4: Forgetting dist/index.d.ts needs rebuild

**What goes wrong:** Source changes are correct but consumer TypeScript sees old `dist/index.d.ts` declarations that don't include the new types.
**Why it happens:** `dist/` is a build artifact; source changes don't automatically propagate.
**How to avoid:** Run `bun run build` after implementing. The smoke test in `tests/integration/api-consumption.test.ts` verifies dist artifacts; consider adding a type check on the new exports there.

## Code Examples

Verified patterns from existing codebase:

### Pattern 1: Type-only barrel re-export (from `domain/ports/index.ts`)

```typescript
// Source: src/domain/ports/index.ts (current pattern for existing types)
export type { ISearchService, SearchOptions } from "./services.js";

// ADD these lines:
export type { SearchMode, HybridSearchOptions, IStatsService, StatsResult, ProjectStats } from "./services.js";
```

### Pattern 2: Domain barrel including ports (add to `domain/index.ts`)

```typescript
// Source: src/domain/index.ts
export * from "./entities/index.js";
export * from "./value-objects/index.js";
export * from "./services/index.js";
export * from "./errors/index.js";
export * from "./ports/index.js";   // ADD this line
```

### Pattern 3: Consumer usage that this phase enables

```typescript
// After Phase 20, consumers can write:
import {
  executeSearchCommand,
  type SearchCommandOptions,
  type SearchMode,
  type HybridSearchOptions,
  type IStatsService,
  type StatsResult,
  type ProjectStats,
} from "@chude/memory";

// Explicitly type search mode
const mode: SearchMode = "hybrid";
const options: HybridSearchOptions = { mode, limit: 10 };

// Type-check stats result
function displayStats(result: StatsResult): void {
  result.projectBreakdown.forEach((p: ProjectStats) => {
    console.log(`${p.projectName}: ${p.sessionCount} sessions`);
  });
}
```

### Pattern 4: Integration test verifying export from public surface

```typescript
// Source: tests/integration/programmatic-api.test.ts (extend existing describe block)
// Pattern from existing test -- imports from src/index.js (not internal path)
import type {
  SearchMode,
  HybridSearchOptions,
  IStatsService,
  StatsResult,
  ProjectStats,
} from "../../src/index.js";

// Structural verification test (same pattern as ports.test.ts)
describe("Public API type exports", () => {
  it("SearchMode union covers all valid modes", () => {
    const modes: SearchMode[] = ["auto", "fts", "vector", "hybrid"];
    expect(modes).toHaveLength(4);
  });

  it("HybridSearchOptions extends SearchOptions", () => {
    const opts: HybridSearchOptions = { mode: "fts", limit: 5 };
    expect(opts.mode).toBe("fts");
    expect(opts.limit).toBe(5);
  });

  it("StatsResult shape matches domain definition", () => {
    const result: StatsResult = {
      totalSessions: 0,
      totalMessages: 0,
      totalToolUses: 0,
      databaseSizeBytes: 0,
      projectBreakdown: [],
    };
    expect(result.projectBreakdown).toHaveLength(0);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All port types in single file | Separate files by concern (repositories.ts, services.ts, sources.ts, embedding.ts, types.ts) | Phase 02 (v1.0) | Better SRP but requires barrel completeness discipline |
| Manual export list in src/index.ts | Barrel hierarchy (domain -> ports -> services) | Phase 18 | Scales better but requires every barrel to be complete |

## Open Questions

1. **Should ALL domain port interfaces become public?**
   - What we know: The integration checker flagged `SearchMode`, `HybridSearchOptions`, `IStatsService`, `StatsResult`, `ProjectStats` specifically. The other ports (`ISearchService`, `IEmbeddingProvider`, `ISessionRepository`, etc.) are also currently not on the public surface.
   - What's unclear: Whether aidev needs the repository and embedding interfaces, or just the search/stats types.
   - Recommendation: Export ALL domain ports via the complete barrel fix (Option B). This is cleaner, avoids future gap closure phases for other port types, and has zero runtime cost. The planner should decide whether to scope to the five flagged types or do the complete barrel fix.

2. **Should `SearchCommandOptions.mode` field type be `SearchMode` instead of `string`?**
   - What we know: `SearchCommandOptions.mode` is currently typed as `string` (Commander parses all options as strings). The `resolveSearchMode()` function casts it to `SearchMode`.
   - What's unclear: Whether Phase 20 should strengthen this type (narrowing `mode?: string` to `mode?: SearchMode`).
   - Recommendation: Out of scope for Phase 20. Type strengthening is a separate concern; the phase goal is adding missing exports, not changing existing interface shapes.

## Sources

### Primary (HIGH confidence)

- Direct codebase read: `src/domain/ports/services.ts` - confirmed definition of all five missing types
- Direct codebase read: `src/domain/ports/index.ts` - confirmed current exports (missing five types)
- Direct codebase read: `src/domain/index.ts` - confirmed ports NOT included in domain barrel
- Direct codebase read: `src/index.ts` - confirmed public entry point does not explicitly export port types from services.ts beyond what domain barrel provides
- Direct codebase read: `.planning/memory/gsd-integration-checker.md` - confirmed integration checker findings (MISSING-01, MISSING-02)

### Secondary (MEDIUM confidence)

- Phase 18 SUMMARY files - context on what was intentionally left out vs. accidentally omitted

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries; pure TypeScript export mechanics
- Architecture: HIGH - gap closure only; export chain fully mapped from source
- Pitfalls: HIGH - all pitfalls derived from reading actual code, not theory

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain; export structure unlikely to change)
