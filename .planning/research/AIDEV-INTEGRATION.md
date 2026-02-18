# Integration Research: memory-nexus into aidev

**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct source code analysis of both codebases)

---

## 1. Codebase Analysis

### aidev (ai-dev-environment) v4.10.1

**Language:** Hybrid bash + TypeScript

**Architecture:**

| Layer | Language | Purpose | Location |
|-------|----------|---------|----------|
| Entry point | Bash | `bin/aidev` resolves to `src/cli/aidev.sh` | `bin/aidev` |
| Main CLI | Bash | 3500+ line dispatcher with 20+ subcommands | `src/cli/aidev.sh` |
| Shell functions | Bash | Aliases, navigation, plugins, config | `src/functions/*.sh`, `src/core/*.sh` |
| Scripts | Bash | Release, validate, fix, install utilities | `scripts/*.sh` |
| TypeScript CLI | TypeScript/Bun | Agent system, clean, version commands | `cli/src/` |
| Config | JSON | Aliases, command registry, plugins | `config/*.json` |

**Critical finding:** aidev already has a full hexagonal TypeScript CLI inside `cli/` with:
- `cli/src/domain/` -- Entities, ports, services
- `cli/src/application/` -- Commands, queries, agent orchestration
- `cli/src/infrastructure/` -- DI container, SQLite (bun:sqlite), adapters, hooks
- `cli/src/presentation/` -- Commands, router, parser
- `cli/src/shared/` -- Errors, types, utilities

**The TypeScript CLI is a separate package** (`@chude/aidev-cli`, `cli/package.json`) with its own `bun.lock` and `node_modules`. It is NOT currently dispatched from the bash CLI. The bash dispatcher does not reference `cli/dist` at all -- the TS CLI appears to run as an independent binary (`#!/usr/bin/env bun`).

**Command routing pattern (bash):**
- `aidev.sh` has a giant `case` statement dispatching to `cmd_*` functions
- Functions either run inline logic, source other `.sh` files, or call `scripts/*.sh`
- `cmd_memory` currently just forwards to `cmd_server start/test/logs memory` (MCP server management)

**Command routing pattern (TypeScript):**
- `Container.create()` -> `Router` -> `CommandRegistry` -> `BaseCommand` implementations
- Commands implement `ICommand` interface with `meta` and `execute(context)`
- `COMMAND_MANIFEST` array lists all registered commands
- Subcommand routing via internal `switch` (see `AgentCommand`)

**Distribution:**
- npm package: `@chude/ai-dev-environment`
- Installed to `~/.ai-dev-env/` (symlink in dev mode, copy in user mode)
- `bin/aidev` is the PATH entry point

**Dependencies (root):** `@anthropic-ai/claude-code` only
**Dependencies (cli/):** `@anthropic-ai/sdk`, `hono`, `picomatch`

### memory-nexus v0.1.2

**Language:** TypeScript/Bun

**Architecture:** Clean hexagonal, textbook implementation:

| Layer | Files | Purpose |
|-------|-------|---------|
| Domain | Entities, value objects, ports, domain services, errors | Pure business logic, zero dependencies |
| Application | SyncService, ExportService, LlmExtractor, PatternExtractor, RecoveryService | Use cases orchestrating domain logic |
| Infrastructure | SQLite repos, JSONL parsers, session sources, hooks, signals | Adapters implementing domain ports |
| Presentation | CLI commands (commander.js), formatters, parsers, pickers | User-facing interface |

**Key characteristics:**
- Uses `bun:sqlite` directly (same as aidev's TS CLI)
- Uses `commander` for CLI (aidev's TS CLI uses custom parser)
- 16 CLI commands: sync, search, list, stats, context, show, browse, related, install, uninstall, status, doctor, purge, export, import, completion
- Domain layer is well-isolated -- `src/index.ts` only exports domain + application layers
- Infrastructure imports `bun:sqlite` in 34 files -- deeply coupled to Bun runtime
- Published as `memory-nexus` npm package, entry point `dist/presentation/cli/index.js`

**Dependencies:** `@anthropic-ai/claude-code`, `commander`, `chrono-node`, `cli-progress`, `fuzzy`, `@inquirer/search`, `@inquirer/select`

---

## 2. Integration Options Evaluated

### Option A: Monorepo Merge

**Description:** Move memory-nexus source code directly into aidev's `cli/src/` directory tree, converting it into a set of domain entities, application services, and commands within the existing TS CLI architecture.

**What this looks like:**
```
ai-dev-environment/
  cli/
    src/
      domain/
        entities/
          agent/          # existing agent entities
          memory/         # NEW: session, message, tool-use, entity, link, etc.
        ports/
          agent/          # existing agent ports
          memory/         # NEW: ISessionRepository, IMessageRepository, etc.
        services/
          CleanupService.ts  # existing
          memory/         # NEW: content-extractor, path-decoder, query-parser
      application/
        agent/            # existing
        memory/           # NEW: sync-service, export-service, llm-extractor
      infrastructure/
        db/
          SqliteConnection.ts  # existing, would be shared
          migrations/
            agent.ts      # existing
            memory.ts     # NEW
          repositories/
            memory/       # NEW: session-repo, message-repo, etc.
        parsers/
          memory/         # NEW: jsonl-parser, event-classifier
        sources/
          memory/         # NEW: session-source, project-name-resolver
      presentation/
        commands/
          agent/          # existing
          memory/         # NEW: sync, search, context, etc.
          Command.ts      # existing base class
```

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | GOOD | SRP preserved via namespace separation. ISP respected through granular ports. |
| Hexagonal | GOOD | Fits naturally -- memory domain has no external deps. Infrastructure adapters plug into existing patterns. |
| Cohesion | MIXED | memory-nexus is a coherent domain. Merging it into aidev dilutes aidev's identity. But they share infra (bun:sqlite, CLI patterns). |
| Coupling | TIGHT | Changes to shared infrastructure (DI container, CLI router) affect both domains. |
| Extensibility | LOW | Adding future "domains" follows same pattern but grows the monolith. |
| DX | GOOD | Single repo to work in, single build, single test suite. |
| Distribution | SIMPLE | One `npm install -g`, everything works. |
| Maintenance | HIGH BURDEN | memory-nexus has 100+ source files. Merging doubles the TS CLI size. Releases coupled. |

**Major concerns:**
1. memory-nexus uses `commander` while aidev TS CLI has custom arg parser -- would need to rewrite all 16 commands
2. memory-nexus uses direct `bun:sqlite` while aidev has `SqliteConnection` wrapper -- need to reconcile
3. Two SQLite databases (agent DB vs memory DB) or merge into one?
4. memory-nexus has its own error hierarchy (`MemoryNexusError`, `ErrorCode`) vs aidev's `AppError`
5. Version coupling -- memory-nexus bug fix requires aidev release

### Option B: npm Dependency

**Description:** Keep memory-nexus as a separate npm package. aidev declares it as a dependency and exposes it as a subcommand.

**Two sub-variants:**

**B1: Thin CLI wrapper (pass-through)**
```bash
# In aidev.sh cmd_memory():
cmd_memory() {
    # Forward all args to memory-nexus CLI
    bun "$(npm root -g)/memory-nexus/dist/presentation/cli/index.js" "$@"
}
```

**B2: Library import (deep integration)**
```typescript
// In aidev's TS CLI MemoryCommand:
import { executeSearchCommand, executeSyncCommand } from "memory-nexus/commands";

class MemoryCommand extends BaseCommand {
  async execute(context) {
    switch(context.args.subcommand) {
      case "search": return executeSyncCommand(...);
      // etc
    }
  }
}
```

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | EXCELLENT | Complete separation of concerns. Each package has single responsibility. |
| Hexagonal | EXCELLENT | memory-nexus IS an adapter from aidev's perspective. |
| Cohesion | EXCELLENT | Each codebase stays focused. |
| Coupling | LOW (B1) / MEDIUM (B2) | B1 is pure process delegation. B2 imports programmatic API. |
| Extensibility | EXCELLENT | New tools follow same pattern (add dependency, wire command). |
| DX | MODERATE | Two repos to maintain. But clear ownership boundaries. |
| Distribution | MODERATE | Need both packages installed. Could auto-install as peer dep. |
| Maintenance | LOW BURDEN | Independent releases, independent test suites. |

**Concerns:**
1. B1 (thin wrapper) is what the user explicitly said they DON'T want ("not just a thin wrapper")
2. B2 requires memory-nexus to export a clean programmatic API -- it currently does (`src/index.ts` exports domain + application)
3. Version compatibility between packages needs management
4. memory-nexus already exports `execute*Command` functions from each CLI command -- these can be called programmatically

### Option C: Plugin/Subcommand Discovery

**Description:** aidev discovers `aidev-memory` (or `aidev-*`) binaries in PATH and delegates to them.

**How it works:**
```bash
# In aidev.sh, unknown command handler:
if command -v "aidev-$command" &>/dev/null; then
    exec "aidev-$command" "$@"
fi
```

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | EXCELLENT | Maximum separation. |
| Hexagonal | EXCELLENT | Each plugin is independent. |
| Cohesion | EXCELLENT | Each tool owns its domain completely. |
| Coupling | MINIMAL | Only shared contract is "be a CLI binary." |
| Extensibility | EXCELLENT | Add new tools by just installing binaries. |
| DX | POOR | Separate installs, separate configs, no shared DI. No integrated help. |
| Distribution | POOR | User must install each tool separately. |
| Maintenance | VARIES | Independent but fragmented. |

**This is the git/docker model.** Works well at scale but overkill here. The user wants FULL integration, not loose coupling.

### Option D: TypeScript Migration of aidev

**Description:** Gradually rewrite aidev's bash CLI in TypeScript, making memory-nexus one of several domains within a unified TS application.

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | EXCELLENT (long-term) | Full OOP design possible. |
| Hexagonal | EXCELLENT | Already demonstrated in `cli/src/`. |
| Cohesion | GOOD | Unified codebase. |
| Coupling | VARIES | Depends on implementation. |
| Extensibility | EXCELLENT | Type-safe, testable. |
| DX | POOR (migration period) | Two systems running in parallel for months. |
| Distribution | COMPLEX | Must maintain bash compatibility during migration. |
| Maintenance | HIGH (during), LOW (after) | The migration itself is enormous (3500+ lines of bash). |

**Impractical for the near term.** The bash CLI has 20+ commands, shell aliases, go-* navigation, plugin system, etc. Much of it is inherently shell-oriented and cannot be usefully ported to TypeScript (shell aliases, .bashrc sourcing, environment setup).

### Option E: Hybrid Approach (RECOMMENDED)

**Description:** aidev stays bash for shell-oriented features. TypeScript CLI (`cli/`) handles complex features. memory-nexus is added as an npm dependency and integrated through the TS CLI layer.

**How it works:**

1. Add `memory-nexus` as a dependency of `cli/package.json`
2. Create a `MemoryCommand` (or `MemoryCommandGroup`) in `cli/src/presentation/commands/memory/`
3. The `MemoryCommand` imports memory-nexus's application services and domain types
4. Wire it into `COMMAND_MANIFEST` so the TS CLI router handles it
5. In the bash dispatcher, `cmd_memory` delegates to the TS CLI:

```bash
cmd_memory() {
    # Delegate to TypeScript CLI for full memory functionality
    bun "$AIDEV_ROOT/cli/dist/index.js" memory "$@"
}
```

**The actual integration point looks like:**

```typescript
// cli/src/presentation/commands/memory/MemoryCommand.ts
import {
  executeSyncCommand,
  executeSearchCommand,
  executeContextCommand,
  executeListCommand,
  // ... other execute functions
} from "memory-nexus/presentation/cli/commands";

export class MemoryCommand extends BaseCommand {
  readonly meta: CommandMeta = {
    name: "memory",
    description: "Cross-project context persistence for Claude Code sessions",
    category: "memory",
    // ...
  };

  async execute(context: CommandContext): Promise<CommandResult> {
    const subcommand = context.args.subcommand || this.getArg(context, 0);
    switch (subcommand) {
      case "sync":  return this.handleSync(context);
      case "search": return this.handleSearch(context);
      case "context": return this.handleContext(context);
      // ...
    }
  }

  private async handleSearch(context: CommandContext): Promise<CommandResult> {
    const query = context.args.args[0];
    const options = {
      limit: this.getFlag(context, "limit", "10"),
      project: this.getFlag(context, "project", undefined),
      json: this.getFlag(context, "json", false),
    };
    const result = await executeSearchCommand(query, options);
    return { exitCode: result.exitCode };
  }
}
```

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | EXCELLENT | Each codebase maintains SRP. memory-nexus domain stays pure. |
| Hexagonal | EXCELLENT | memory-nexus is an adapter/library from aidev's perspective. Domain boundaries preserved. |
| Cohesion | EXCELLENT | Shell stays shell. TypeScript stays TypeScript. Each domain is cohesive. |
| Coupling | LOW-MEDIUM | Coupled through programmatic API, not source merger. API changes are versioned. |
| Extensibility | EXCELLENT | Same pattern for future tools. CLI becomes a composition of domain packages. |
| DX | GOOD | Single `aidev memory` entry point. memory-nexus also works standalone for dev. |
| Distribution | GOOD | memory-nexus bundled as dependency. Single `npm install -g` for end users. |
| Maintenance | LOW | Independent testing and development. Versioned dependency. |

### Option F: Workspace/Monorepo with Shared Core

**Description:** Convert ai-dev-environment into a monorepo (Bun workspaces) with shared packages.

```
ai-dev-environment/
  packages/
    core/         # Shared types, DI, utilities
    cli-bash/     # Bash CLI (current src/)
    cli-ts/       # TypeScript CLI (current cli/)
    memory/       # memory-nexus
    agent/        # Agent system (extracted from cli-ts)
```

**Assessment:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| SOLID | EXCELLENT | Maximum modularity. |
| Hexagonal | EXCELLENT | Each package has clean boundaries. |
| Cohesion | EXCELLENT | Domain-per-package. |
| Coupling | LOW | Shared core is small and stable. |
| Extensibility | EXCELLENT | Add packages for new domains. |
| DX | POOR | Major restructuring needed. Bun workspaces are immature. |
| Distribution | COMPLEX | Need to figure out how to publish a bash+TS monorepo as single npm package. |
| Maintenance | HIGH INITIAL | Significant refactoring cost for uncertain benefit. |

**Over-engineered for current scale.** Interesting future direction but the cost/benefit does not justify it now with only 2 TypeScript domains (agent, memory).

---

## 3. Recommendation

### Primary: Option E -- Hybrid Integration via npm Dependency

This is the clear winner because:

1. **It follows the pattern already established.** The agent system already lives in `cli/src/` as a TS-based feature within aidev. Memory follows the same pattern.

2. **It respects both architectures.** memory-nexus keeps its hexagonal design, domain isolation, and independent testability. aidev keeps its bash shell features and delegates complex features to TS.

3. **It is the least disruptive path.** No rewriting of memory-nexus commands. No merging of codebases. No infrastructure reconciliation. The `execute*Command` functions already exist as the integration surface.

4. **It provides FULL integration.** Users run `aidev memory search "query"` and get the complete memory-nexus experience. Not a thin wrapper -- the full programmatic API is called.

5. **Independent evolution.** memory-nexus can be versioned, tested, and released independently. aidev pins a compatible version.

### Secondary: Consider Option A (monorepo merge) ONLY if

- memory-nexus needs to share the same SQLite database as the agent system
- The two domains (agent sessions and memory sessions) need cross-queries
- Distribution as a single binary becomes critical

This would be a future migration from E to A, not a starting point.

---

## 4. Detailed Integration Plan

### Phase 1: Expose Programmatic API from memory-nexus

memory-nexus currently exports from `src/index.ts`:
```typescript
export * from "./domain/index.js";
export * from "./application/index.js";
```

This needs to ALSO export the `execute*Command` functions (or better, pure application-layer use cases that don't depend on `commander`):

```typescript
// src/api.ts (new file)
export { SyncService, type SyncOptions, type SyncResult } from "./application/services/sync-service.js";
export { Fts5SearchService } from "./infrastructure/database/services/search-service.js";
export { ContextService } from "./infrastructure/database/services/context-service.js";
export { StatsService } from "./infrastructure/database/services/stats-service.js";
export { initializeDatabase, closeDatabase, getDefaultDbPath } from "./infrastructure/database/index.js";
// ... etc
```

**Alternative:** The `execute*Command` functions already handle DB init/teardown and return `{ exitCode }`. These can be imported directly with minimal wrapping.

### Phase 2: Add memory-nexus as aidev Dependency

```bash
cd cli/
bun add memory-nexus
```

### Phase 3: Create MemoryCommand in aidev's TS CLI

Create `cli/src/presentation/commands/memory/MemoryCommand.ts` following the `AgentCommand` pattern:
- Group command with subcommand routing
- Delegates to memory-nexus's `execute*Command` functions
- Registers in `COMMAND_MANIFEST`

### Phase 4: Wire Bash Dispatcher

Update `cmd_memory()` in `aidev.sh`:

```bash
cmd_memory() {
    bun "$AIDEV_ROOT/cli/dist/index.js" memory "$@"
}
```

This replaces the current `cmd_server start memory` forwarding.

### Phase 5: Update Help and Registry

Add memory commands to `config/command-registry.json` so `aidev help` shows them.

---

## 5. Technical Considerations

### Shared Runtime: bun:sqlite

Both codebases use `bun:sqlite`. This is a strength -- no runtime incompatibility. However:
- memory-nexus manages its own database (`~/.local/share/memory-nexus/memory.db`)
- aidev agent manages a separate database
- These SHOULD remain separate databases. Different schemas, different lifecycles, different data.

### Commander vs Custom Parser

memory-nexus uses `commander`. aidev's TS CLI uses a custom `ArgParser`. For the integration:
- Do NOT rewrite memory-nexus commands to use aidev's parser
- Instead, call the `execute*Command` functions directly, which accept parsed options objects
- aidev's `MemoryCommand` translates from its `ParsedArgs` to memory-nexus's option types

### Error Handling

memory-nexus uses `MemoryNexusError` with `ErrorCode`. aidev uses `AppError`. For the integration:
- Catch `MemoryNexusError` in `MemoryCommand` and translate to `CommandResult`
- The `execute*Command` functions already return `{ exitCode }` -- errors are handled internally

### Build Pipeline

Current: `bun build src/presentation/cli/index.ts --outdir dist/presentation/cli --target node`
After integration: memory-nexus remains independently buildable. aidev's `cli/` build just needs memory-nexus as a resolved dependency.

### Standalone Mode

After integration, `memory-nexus` should still work standalone:
```bash
memory-nexus search "query"   # Still works
aidev memory search "query"   # Also works, delegates to same logic
```

This is important for backward compatibility and for development/testing.

---

## 6. Risks and Mitigations

### Risk: memory-nexus CLI dependency bloat in aidev

memory-nexus brings `commander`, `chrono-node`, `cli-progress`, `fuzzy`, `@inquirer/search`, `@inquirer/select`. These are unused by aidev.

**Mitigation:** If calling `execute*Command` functions, these deps ARE used. If calling application services directly, they are not needed. Consider splitting memory-nexus into `memory-nexus` (core) and `memory-nexus-cli` (presentation) packages eventually. For now, the dep size is modest and acceptable.

### Risk: Breaking changes in memory-nexus API

**Mitigation:** Semantic versioning. aidev pins a compatible version range. Integration tests in aidev verify the wiring works.

### Risk: Two versions of @anthropic-ai/claude-code

Both packages depend on this. Bun/npm deduplication handles this, but version conflicts could cause issues.

**Mitigation:** Keep versions aligned. Use `peerDependencies` if needed.

### Risk: bash CLI dispatcher becomes stale

As more commands move to TS CLI, the bash dispatcher accumulates dead `cmd_*` functions.

**Mitigation:** Accept this as tech debt. The bash CLI is the shell-integration layer (aliases, env vars, go-* commands). TS CLI handles complex features. Clean separation by feature type, not technology.

---

## 7. What This Means for memory-nexus Development

### Before Integration

1. Ensure `execute*Command` functions are stable and well-typed
2. Export a clean programmatic API (application services + infrastructure factories)
3. Verify the package works when installed as a dependency (not just standalone)
4. Add integration tests that call `execute*` functions programmatically

### During Integration

1. Do NOT change memory-nexus's internal architecture
2. Create adapter layer in aidev's TS CLI only
3. Test the full flow: `aidev memory <cmd>` -> bash -> bun -> TS CLI -> memory-nexus

### After Integration

1. Update CLAUDE.md and docs to reflect new `aidev memory` commands
2. Consider deprecating standalone `memory-nexus` binary (or keep for dev use)
3. Monitor for version drift between packages

---

## 8. Comparison Matrix

| Criterion | A (Merge) | B1 (Thin) | B2 (Lib) | C (Plugin) | D (Migrate) | E (Hybrid) | F (Mono) |
|-----------|-----------|-----------|----------|------------|-------------|------------|----------|
| SOLID | Good | Poor | Excellent | Excellent | Excellent | Excellent | Excellent |
| Hexagonal | Good | N/A | Excellent | Excellent | Excellent | Excellent | Excellent |
| Cohesion | Mixed | Poor | Excellent | Excellent | Good | Excellent | Excellent |
| Coupling | Tight | Loose | Low-Med | Minimal | Varies | Low-Med | Low |
| Extensibility | Low | Low | Excellent | Excellent | Excellent | Excellent | Excellent |
| DX | Good | Poor | Good | Poor | Poor | Good | Poor |
| Distribution | Simple | Complex | Good | Poor | Complex | Good | Complex |
| Effort | High | Low | Medium | Low | Very High | Medium | Very High |
| User wants? | Partial | No | Yes | No | Overkill | Yes | Overkill |

**E (Hybrid) wins on the weighted combination that matters: user intent (FULL integration), WoW compliance, and implementation cost.**

---

## Sources

All findings are from direct source code analysis of:
- `/c/Users/Destiny/iCloudDrive/Documents/AI Tools/Anthropic Solution/Projects/ai-dev-environment/` (aidev)
- `/c/Users/Destiny/iCloudDrive/Documents/AI Tools/Anthropic Solution/Projects/memory-nexus/` (memory-nexus)

No web searches were needed -- both codebases are local and available for inspection.
