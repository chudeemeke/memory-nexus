# Phase 18: API Stabilization and aidev Integration Readiness - Research

**Researched:** 2026-03-01
**Domain:** TypeScript library API design, npm package library distribution, programmatic API testing
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTEG-01 | Export stable programmatic API surface (execute*Command functions with typed options and return values) | API surface already exists in commands/index.ts; need to re-export from src/index.ts and build library entry point |
| INTEG-02 | Verify @chude/memory works correctly when installed as npm dependency (not just standalone) | Build system gap: current build only compiles CLI binary, not library entry point; dist/index.js missing |
| INTEG-03 | Add integration tests calling execute*Command functions programmatically | Pattern exists in tests/integration/; need new suite calling execute* functions with typed options |
| INTEG-04 | Document API surface for aidev MemoryCommand consumption | README lacks API section; JSDoc on execute* functions is sparse; need concise API reference |
</phase_requirements>

---

## Summary

Phase 18 is the final phase of v2.0. It stabilizes the programmatic API surface so aidev can import `@chude/memory` as a library dependency and call its commands programmatically.

The execute*Command pattern is already fully implemented — every command module exports both a `create*Command()` function (for Commander.js) and an `execute*Command()` function (for programmatic use). The integration surface is well-structured. However, three concrete gaps prevent aidev from consuming this package as a library today:

1. **Build gap:** The current build script (`bun build src/presentation/cli/index.ts`) only produces `dist/presentation/cli/index.js` (the CLI binary). There is no `dist/index.js` — the library entry point declared in `package.json` as `"main": "dist/index.js"` does not exist in the published artifact.

2. **Export gap:** `src/index.ts` exports only `domain` and `application` layers. The execute*Command functions live in `src/presentation/cli/commands/index.ts` and are not reachable from the package's public import surface. A consumer cannot `import { executeSyncCommand } from "@chude/memory"` today.

3. **Documentation gap:** The README documents CLI usage only. There is no API reference section. The execute*Command functions lack comprehensive JSDoc on their option types and return values.

**Primary recommendation:** Add a library build step that compiles `src/index.ts` into `dist/index.js` using `tsc` (not `bun build`, since `tsc` preserves `.d.ts` files needed for TypeScript consumers), re-export execute*Command functions from `src/index.ts`, write integration tests that import from the compiled dist, and add an API reference section to the README.

---

## Standard Stack

### Core (already in use, no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:test | built-in | Test framework | Already used across all test suites; no new dependency |
| TypeScript | 5.5+ | Type declarations for API surface | Already in use; `tsc --declaration` emits `.d.ts` files |
| bun build | built-in | CLI binary bundling (existing) | Already used for dist/presentation/cli/index.js |
| tsc | 5.5+ | Library compilation with type declarations | Required for proper `.d.ts` generation; `bun build` does not emit declarations |

### No New Dependencies

Phase 18 requires no new npm packages. All needed tools are already in place.

---

## Architecture Patterns

### Current State: What Exists

```
src/
├── index.ts                    # Exports: domain/* + application/*
│                               # MISSING: execute*Command functions
├── domain/index.ts             # Entities, value objects, ports, errors
├── application/index.ts        # SyncService, EmbeddingService, etc.
└── presentation/
    └── cli/
        ├── commands/
        │   └── index.ts        # Exports: create*Command + execute*Command for all 16 commands
        └── index.ts            # Commander program (not library-safe)

dist/                           # Built artifact (as of Phase 17)
├── presentation/cli/
│   └── index.js               # Bundled CLI binary (bun build output)
└── (no index.js)              # MISSING: library entry point
```

### Target State After Phase 18

```
src/
├── index.ts                    # UPDATED: also exports execute*Command surface
└── (unchanged otherwise)

dist/
├── index.js                   # NEW: compiled library entry (tsc output)
├── index.d.ts                 # NEW: TypeScript declarations
├── domain/                    # NEW: domain layer compiled (tsc output)
├── application/               # NEW: application layer compiled (tsc output)
├── presentation/cli/
│   ├── commands/              # NEW: commands compiled (tsc output, includes execute* types)
│   └── index.js              # EXISTING: CLI binary (bun build output, unchanged)
└── (infrastructure etc.)     # NEW: infrastructure compiled as needed by tsc
```

### Pattern 1: Dual Build (CLI Binary + Library)

**What:** Two separate build steps in `package.json`:
- `build:cli` — `bun build src/presentation/cli/index.ts` (current, produces single bundled binary)
- `build:lib` — `tsc --project tsconfig.lib.json` (new, produces compiled library with declarations)
- `build` — runs both

**Why two tools:**
- `bun build` bundles everything into one file, no `.d.ts` files. Good for CLI binary.
- `tsc` compiles per-file, emits `.d.ts` for each module. Required for library consumers to get TypeScript types.

**Why separate tsconfig:**
The existing `tsconfig.json` excludes `**/*.test.ts`. A `tsconfig.lib.json` can extend it and set `outDir: "dist"` for the library. The main tsconfig keeps `noEmit: true` for type-checking only.

**Pattern (tsconfig.lib.json):**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Note on existing tsconfig.json:** It already has `declaration: true`, `declarationMap: true`, `outDir: "dist"`. The current tsconfig already supports `tsc` compilation. The gap is that the build script uses `bun build` (which ignores `outDir` and `declaration`) rather than `tsc`. A `tsconfig.lib.json` is the cleanest path (separate from IDE tsconfig which has `noEmit: true`).

### Pattern 2: Re-export execute*Command at Package Root

**What:** `src/index.ts` re-exports the execute*Command functions from the presentation layer.

**Important:** The execute*Command functions are safe for library export because they:
- Accept plain option objects (no Commander.js `Command` instances needed)
- Return `Promise<CommandResult>` which is `{ exitCode: number }` — simple and typed
- Handle their own DB initialization and teardown
- Do NOT import `import.meta.main` or `program.parse()` (those are in `index.ts`, not in command files)

**What NOT to export from the library:**
- `program` (the Commander instance from `src/presentation/cli/index.ts`) — it calls `program.parse()` and references `import.meta.main`
- `create*Command()` functions — aidev does not need Commander integration; it calls execute* directly
- Internal infrastructure helpers not needed at library boundary

**Proposed additions to `src/index.ts`:**
```typescript
// Presentation API (programmatic command execution)
export type { CommandResult } from "./presentation/cli/command-result.js";
export {
  executeSyncCommand,
  executeSearchCommand,
  executeListCommand,
  executeStatsCommand,
  executeContextCommand,
  executeRelatedCommand,
  executeShowCommand,
  executeBrowseCommand,
  executeInstallCommand,
  executeUninstallCommand,
  executeStatusCommand,
  executeDoctorCommand,
  executePurgeCommand,
  executeExportCommand,
  executeImportCommand,
  executeCompletionCommand,
} from "./presentation/cli/commands/index.js";

// Key option types (for typed programmatic use)
export type { EmbeddingPassDeps, BackgroundModeDeps } from "./presentation/cli/commands/sync.js";
```

**Note on option interfaces:** The option interfaces (e.g., `SyncCommandOptions`, `SearchCommandOptions`) are currently **private** (not exported). For aidev to call these functions with typed options, these interfaces need to be exported. This is a deliberate API design choice: make option types public as part of the stable API surface.

### Pattern 3: Integration Test Against dist (INTEG-02)

**What:** A new integration test file that imports from the compiled dist, not from source. This verifies the package works as an installed dependency.

**Pattern:**
```typescript
// tests/integration/api-consumption.test.ts
// Imports from dist (simulates library consumer)
import { executeSyncCommand, executeSearchCommand } from "../../dist/index.js";

// OR: uses package name resolution (requires dist to be built first)
// import { executeSyncCommand } from "@chude/memory";  // only if installed in node_modules

describe("programmatic API consumption", () => {
  it("executeSyncCommand returns CommandResult with exitCode", async () => {
    const result = await executeSyncCommand({ dryRun: true, quiet: true });
    expect(result).toHaveProperty("exitCode");
    expect(typeof result.exitCode).toBe("number");
  });
  // ...
});
```

**Recommended approach:** Import from `../../dist/index.js` rather than the package name. This:
- Does not require `bun add @chude/memory` inside the repo
- Tests the actual dist output (what consumers receive)
- Is straightforward to run in CI (`bun run build:lib && bun test tests/integration/api-consumption.test.ts`)
- Verifies INTEG-02: package works when installed as npm dependency (dist must be correct)

**Alternative (simpler, less strict):** Import from `../../src/index.js` and treat it as a programmatic API test. This tests the API contract but not the distribution artifact. Use this as the main test, with a single smoke test verifying dist/index.js exists and is importable.

### Pattern 4: JSDoc and README API Reference

**What:** Each execute*Command function gets JSDoc covering parameters and return type. README gets a concise "Programmatic API" section.

**JSDoc pattern:**
```typescript
/**
 * Execute the search command programmatically.
 *
 * Searches sessions using FTS5 or hybrid semantic search based on
 * configured search mode. Outputs results to stdout.
 *
 * @param query - Search query string (must be non-empty)
 * @param options - Search options
 * @param options.limit - Maximum results (default: "10")
 * @param options.project - Filter by project name substring
 * @param options.mode - Search mode: "auto" | "fts" | "vector" | "hybrid"
 * @param options.json - Output as JSON (suppresses human-readable output)
 * @param options.quiet - Suppress decorative output
 * @returns CommandResult with exitCode 0 (success) or 1 (error/not found)
 */
export async function executeSearchCommand(
  query: string,
  options: SearchCommandOptions
): Promise<CommandResult>
```

**README API reference section (concise):**
```markdown
## Programmatic API

Install as a dependency:
\`\`\`bash
bun add @chude/memory
\`\`\`

Import and call execute functions:
\`\`\`typescript
import { executeSyncCommand, executeSearchCommand, executeContextCommand } from "@chude/memory";

// Sync sessions to database
const syncResult = await executeSyncCommand({ quiet: true });
// syncResult: { exitCode: 0 }

// Search sessions
const searchResult = await executeSearchCommand("authentication patterns", {
  limit: "5",
  json: true,
});
// searchResult: { exitCode: 0 }

// Get project context
const contextResult = await executeContextCommand("my-project", {
  json: true,
  days: 7,
});
\`\`\`

### Exported Functions

| Function | Parameters | Returns |
|----------|------------|---------|
| executeSyncCommand | options: SyncCommandOptions | Promise<CommandResult> |
| executeSearchCommand | query: string, options: SearchCommandOptions | Promise<CommandResult> |
| executeContextCommand | project: string, options: ContextCommandOptions | Promise<CommandResult> |
| ... | ... | ... |

### CommandResult

\`\`\`typescript
interface CommandResult {
  exitCode: number; // 0 = success, 1 = error/not found
}
\`\`\`
```

### Anti-Patterns to Avoid

- **Exporting Commander `program` from `src/index.ts`:** Commander instances are stateful and call `process.exit()`. A library consumer importing `program` would be affected by Commander's global state mutations.
- **Using `bun build` for library compilation:** `bun build` bundles everything into a single file and does not emit `.d.ts` declaration files. TypeScript consumers would have no type information.
- **Using `tsc` for the CLI binary:** `tsc` doesn't tree-shake or bundle. The CLI binary should continue to use `bun build` for its fast startup and single-file distribution.
- **Making option interfaces non-exported:** If option types stay private, callers must use `any` or construct options via type inference. Export option types explicitly.
- **Testing only against source:** Integration tests for INTEG-02 must validate the compiled dist, not just source, to verify the distribution artifact is correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript declarations | Manual `.d.ts` files | `tsc --declaration` | tsc generates accurate, maintained declarations from source |
| Integration test database | Custom fixture setup | Existing `tests/integration/index.ts` `setupTestDatabase()` | Already provides in-memory DB setup, cleanup, and session generation |
| Package import verification | Shell script checking dist | Import in test file | Bun test already exercises import resolution |

**Key insight:** The execute*Command functions already exist and are already testable. Phase 18 is primarily a packaging/export/documentation concern, not new logic.

---

## Common Pitfalls

### Pitfall 1: Missing dist/index.js in Published Package

**What goes wrong:** The `package.json` declares `"main": "dist/index.js"` and `"types": "dist/index.d.ts"` but the build script only produces `dist/presentation/cli/index.js`. Publishing without running `tsc` means library consumers get a `MODULE_NOT_FOUND` error.

**Why it happens:** Two separate build concerns (CLI binary vs library) handled by one script line.

**How to avoid:** Add `build:lib` as a separate npm script using `tsc`. Gate `aidev publish` on `bun run build` which runs both.

**Warning signs:** `ls dist/` after `bun run build` does not show `index.js` at the root level.

### Pitfall 2: execute*Command Functions Calling process.exit()

**What goes wrong:** If any execute*Command function calls `process.exit()`, a library consumer calling it programmatically will have their entire process terminated instead of receiving a return value.

**Why it happens:** Commander.js actions often call `process.exit()` for error paths. The existing pattern in this codebase uses `process.exitCode = result.exitCode` (set the exit code, don't terminate). The execute*Command functions return `Promise<CommandResult>` and do not call `process.exit()` directly.

**How to avoid:** Verify each execute*Command function returns CommandResult without calling `process.exit()`. The current codebase already follows this pattern correctly.

**Warning signs:** `grep -r "process.exit(" src/presentation/cli/commands/` finds matches (excluding Commander's internal calls).

### Pitfall 3: Option Types as Internal Interfaces

**What goes wrong:** SyncCommandOptions, SearchCommandOptions, etc. are currently private (not exported). If they remain private, aidev's MemoryCommand must use `any` or construct options via runtime shape-matching, losing type safety.

**Why it happens:** The original interfaces were designed for internal Commander.js use, not library consumers.

**How to avoid:** Export each `*CommandOptions` interface from its command file and re-export from `src/index.ts`.

**Warning signs:** Planner tries to add execute* to index.ts but notes the option types are not importable.

### Pitfall 4: tsc outDir Collision with bun build Output

**What goes wrong:** `tsc` compiles to `dist/` and overwrites the `dist/presentation/cli/index.js` that `bun build` produced, replacing the bundled binary with an unbundled tsc output that doesn't work as a CLI entry point.

**Why it happens:** Both build steps write to `dist/`.

**How to avoid:** Run `bun run build:lib` (tsc) first, then `bun run build:cli` (bun build). The `bun build` output for `dist/presentation/cli/index.js` will overwrite tsc's version of that file, which is correct — the CLI binary should be the bundled version. The other `dist/` content comes from tsc only.

**Warning signs:** `dist/presentation/cli/index.js` after running both builds should start with `#!/usr/bin/env bun\n// @bun` (bun build output), not with `"use strict";` (tsc output).

### Pitfall 5: Commander.js Global State in Tests

**What goes wrong:** Tests that import from `src/presentation/cli/index.ts` (which creates a Commander `program` instance) can have state bleed between tests because Commander accumulates state.

**Why it happens:** Commander's `program` is a module-level singleton. The existing smoke tests handle this with `program.commands.forEach((cmd) => { cmd._optionValues = {}; })` in `beforeEach`.

**How to avoid:** Integration tests for INTEG-03 should import execute*Command functions directly from `commands/index.ts` or from `dist/index.js`, NOT from `src/presentation/cli/index.ts`. This avoids Commander state entirely.

---

## Code Examples

Verified patterns from direct codebase inspection:

### Current execute*Command Signature Pattern (from sync.ts)

```typescript
// Source: src/presentation/cli/commands/sync.ts
// Pattern used across all 16 command files

export async function executeSyncCommand(options: SyncCommandOptions): Promise<CommandResult> {
  // Handles own DB init/teardown
  // Returns { exitCode: 0 } or { exitCode: 1 }
  // Never calls process.exit()
}
```

### Current exports/index.ts Pattern (from commands/index.ts)

```typescript
// Source: src/presentation/cli/commands/index.ts
// All 16 execute*Command functions are already exported here
export type { CommandResult } from "../command-result.js";
export { createSyncCommand, executeSyncCommand } from "./sync.js";
export { createSearchCommand, executeSearchCommand } from "./search.js";
// ... 14 more
```

### Build Script Target (package.json)

```json
// Source: package.json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "bun build src/presentation/cli/index.ts --outdir dist/presentation/cli --target bun --external onnxruntime-node"
  }
}
// GAP: build only produces dist/presentation/cli/index.js
// MISSING: dist/index.js (library entry point)
```

### Existing Test Infrastructure (tests/integration/index.ts)

```typescript
// Source: tests/integration/index.ts
// Already has full test database setup utilities

export function setupTestDatabase(config?: TestDatabaseConfig, useFile?: boolean): TestDatabase
export function generateTestSessions(options?: TestSessionOptions): { sessions, directory, cleanup }
export function cleanupTestData(...directories: (string | null | undefined)[]): void
```

### Sample Integration Test Pattern (from concurrent-commands.test.ts)

```typescript
// Source: tests/integration/concurrent-commands.test.ts
// Shows how integration tests import from source and use real database

import { SyncService } from "../../src/application/services/sync-service.js";
import { Fts5SearchService } from "../../src/infrastructure/database/services/search-service.js";
import { setupTestDatabase } from "../integration/index.ts";
// Pattern: in-memory DB, real services, real test data
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bun build --target node` | `bun build --target bun` | Phase 15 (tooling rule update) | Must use `--target bun` for CLI binary |
| `memory-nexus` package name | `@chude/memory` | Phase 13 | All imports use new name |
| CLI binary only in dist | Need CLI binary + library in dist | Phase 18 | Dual build step required |
| Private option interfaces | Export option types | Phase 18 | Stable API contract for consumers |

**Deprecated/outdated:**
- `--target node` in bun build: known UTF-8 double-encoding bug (Bun #25767), replaced by `--target bun`
- Single build script producing only CLI binary: insufficient for library distribution

---

## Open Questions

1. **Which option interfaces to export?**
   - What we know: All 16 command files have `interface *CommandOptions` declared locally (not exported). aidev's MemoryCommand needs to call at minimum: sync, search, context, list, stats.
   - What's unclear: Should ALL 16 option interfaces be exported, or only the subset aidev needs?
   - Recommendation: Export all 16. The option interfaces are part of the stable API surface. Exporting all is more consistent and enables future aidev integrations for other commands. Cost is minimal.

2. **Should execute*Command functions be re-exported from a dedicated `src/api.ts` or from `src/index.ts`?**
   - What we know: `src/index.ts` currently exports domain + application layers. The execute* functions are in the presentation layer.
   - What's unclear: Is it architecturally clean to export presentation-layer functions from the domain/application-facing `index.ts`?
   - Recommendation: Export from `src/index.ts` directly. The package's public API is the index.ts, and consumers expect to import from the package root. A separate `src/api.ts` would require consumers to import from `@chude/memory/api`, adding friction. The hexagonal architecture boundary is between packages (aidev vs memory), not between files within memory.

3. **Should `browsCommand` be included in the programmatic API?**
   - What we know: `executeBrowseCommand` exists and is exported from commands/index.ts. However, `browse` is interactive (uses `@inquirer/select`) and will hang in non-TTY environments.
   - What's unclear: Should it be excluded from the library API to avoid confusion?
   - Recommendation: Include it in exports (for completeness and consistency) but document clearly in JSDoc that it requires an interactive TTY. aidev's MemoryCommand simply won't wire a `browse` subcommand if not needed.

---

## Validation Architecture

Nyquist validation not enabled in `.planning/config.json` — section skipped per protocol.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `src/index.ts`, `src/presentation/cli/commands/index.ts`, `src/presentation/cli/commands/sync.ts`, `src/presentation/cli/commands/search.ts`, `src/presentation/cli/commands/context.ts`, `package.json`, `tsconfig.json`
- Direct inspection: `dist/` directory contents (verified `dist/index.js` absent, `dist/presentation/cli/index.js` present)
- Direct inspection: `tests/integration/index.ts`, `tests/smoke/cli-commands.test.ts`, `tests/integration/concurrent-commands.test.ts`
- `.planning/research/AIDEV-INTEGRATION.md` — integration option analysis, Option E selected

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — confirmed Phase 17 complete, 2539 tests passing, loadConfig() provider defaults complete
- `.planning/REQUIREMENTS.md` — INTEG-01 through INTEG-04 requirements as specified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing tools (tsc, bun build, bun:test) fully verified
- Architecture: HIGH — build gap confirmed by direct dist/ inspection; export gap confirmed by src/index.ts inspection
- Pitfalls: HIGH — all identified from direct codebase analysis; process.exit() pattern verified in command files

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable — no external dependencies changing)

---

## Planning Notes

### Recommended Plan Split (2 plans)

**Plan 18-01: Build Infrastructure and API Export**
- Add `build:lib` script using `tsc`
- Update `package.json` `build` to run both `build:lib` and `build:cli`
- Export all `execute*Command` functions and option types from `src/index.ts`
- Export `CommandResult` type from `src/index.ts`
- Verify `dist/index.js` and `dist/index.d.ts` are produced correctly after `bun run build`
- Tests: verify `dist/index.js` imports correctly; verify `dist/index.d.ts` exists

**Plan 18-02: Integration Tests and Documentation**
- Write `tests/integration/api-consumption.test.ts` calling execute* functions with typed options
- Cover: executeSyncCommand (dry-run mode), executeSearchCommand (empty DB), executeListCommand, executeStatsCommand, executeDoctorCommand
- Add JSDoc to execute*Command functions and option type interfaces
- Add "Programmatic API" section to README.md with function table and example usage
- Tests: the api-consumption.test.ts suite itself is the test artifact

### Critical Build Ordering

When both build steps write to `dist/`:
1. Run `tsc --project tsconfig.lib.json` first (compiles all source to dist/)
2. Run `bun build src/presentation/cli/index.ts --outdir dist/presentation/cli --target bun --external onnxruntime-node` second (overwrites dist/presentation/cli/index.js with bundled binary)

Result: `dist/` contains both tsc-compiled library files (with `.d.ts`) AND the bun-bundled CLI binary.
