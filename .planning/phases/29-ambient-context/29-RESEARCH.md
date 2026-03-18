# Phase 29: Ambient Context - Research

**Researched:** 2026-03-18
**Domain:** Claude Code auto memory integration, file generation, marker-based content merging
**Confidence:** HIGH

## Summary

Phase 29 generates memory CLI context into Claude Code's auto memory directory so cross-project awareness is ambient at session start. The phase produces two artifacts per project: a `context.md` file fully owned by the CLI, and a demarcated summary block inserted into the project's MEMORY.md.

All building blocks exist in the codebase. SmartContextService (Phase 25) provides structured context with budget allocation and AI-formatted output. The sync hook infrastructure handles post-sync triggers. The ProjectPath value object encodes/decodes paths matching Claude Code's convention. The config-manager supports deep-merge of new config fields. This is a composition phase -- no external libraries needed, no new infrastructure patterns.

**Primary recommendation:** Build an AmbientContextService in the application layer that composes SmartContextService output into two files. Wire it into the sync command (after memory file sync, before embedding). The `memory install` command does not need modification -- context generation runs inside the sync process, which the hook already triggers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Delivery mechanism: Auto memory directory, not hooks (MEMORY.md is persistent system prompt, never compressed)
- Two-file approach: `context.md` (full CLI ownership, complete overwrite) and MEMORY.md (shared, marker-based insert/update)
- context.md naming (mirrors `memory context` command name)
- MEMORY.md block format: `<!-- memory-cli:start -->` / `<!-- memory-cli:end -->` HTML comment markers
- Insert at end of MEMORY.md (user content takes priority in 200-line cap)
- Never touch content outside markers
- Friction inclusion as summary line in MEMORY.md block
- Regeneration wired into sync hook (after session sync completes)
- Agent story is a prompt pattern (documented, not coded)
- Architecture layers: IAmbientContextWriter (domain port), AmbientContextService (application), AutoMemoryWriter (infrastructure), sync integration (infrastructure), install update (presentation)

### Claude's Discretion
- None explicitly stated -- all decisions are locked

### Deferred Ideas (OUT OF SCOPE)
- Agent-specific hooks (sub-agents don't inherit session hooks)
- Phase 28 integration (friction universalization is independent)
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | built-in | Database queries via SmartContextService | Already in use throughout |
| node:fs | built-in | File read/write for context.md and MEMORY.md | Standard filesystem ops |
| node:path | built-in | Path resolution for auto memory directory | Cross-platform path joins |
| node:os | built-in | homedir() for ~/.claude/ resolution | Already in paths.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SmartContextService | internal | Structured context with budget allocation | context.md generation |
| AiContextFormatter | internal | formatSmartContext() for AI-optimized output | context.md content formatting |
| ProjectPath | internal | Encode cwd to Claude Code directory name | Auto memory dir resolution |
| config-manager | internal | loadConfig/saveConfig with deep-merge | ambient_context config |

### Alternatives Considered
None -- this is purely internal composition of existing components.

## Architecture Patterns

### Recommended Project Structure
```
src/
  domain/
    ports/
      services.ts          # Add IAmbientContextWriter interface
  application/
    services/
      ambient-context-service.ts      # NEW: orchestrates context generation
      ambient-context-service.test.ts # NEW: unit tests
  infrastructure/
    hooks/
      auto-memory-writer.ts           # NEW: filesystem operations
      auto-memory-writer.test.ts      # NEW: unit tests
      config-manager.ts               # MODIFY: add ambientContext config
  presentation/
    cli/
      commands/
        sync.ts                       # MODIFY: call ambient context after memory file sync
```

### Pattern 1: Application Service Composition
**What:** AmbientContextService takes SmartContextService + IAmbientContextWriter as constructor dependencies
**When to use:** When orchestrating existing services into new output

```typescript
// Application layer -- zero infrastructure imports
export class AmbientContextService {
    constructor(
        private readonly smartContext: SmartContextService,
        private readonly contextWriter: IAmbientContextWriter,
        private readonly formatter: { formatSmartContext(result: SmartContextResult): string },
    ) {}

    async generateAmbientContext(options: AmbientContextOptions): Promise<AmbientContextResult> {
        // 1. Get structured context from SmartContextService
        const result = await this.smartContext.getContext({
            projectFilter: options.projectName,
            budget: options.budget,
            crossProject: true,
        });
        if (!result) return { success: false, reason: 'project-not-found' };

        // 2. Format for context.md (full AI output)
        const contextContent = this.formatter.formatSmartContext(result);

        // 3. Build summary for MEMORY.md block
        const summary = this.buildSummary(result);

        // 4. Write both files
        await this.contextWriter.writeContextFile(options.autoMemoryDir, contextContent);
        await this.contextWriter.updateMemoryBlock(options.autoMemoryDir, summary);

        return { success: true, contextTokens: result.totalTokensEstimate };
    }
}
```

### Pattern 2: Marker-Based Content Merge
**What:** Find `<!-- memory-cli:start -->` and `<!-- memory-cli:end -->` markers in MEMORY.md, replace content between them. If markers absent, append block at end.
**When to use:** Updating shared files without corrupting user content

```typescript
// Infrastructure layer
function mergeMemoryBlock(existingContent: string, newBlock: string): string {
    const START = '<!-- memory-cli:start -->';
    const END = '<!-- memory-cli:end -->';
    const startIdx = existingContent.indexOf(START);
    const endIdx = existingContent.indexOf(END);

    if (startIdx !== -1 && endIdx !== -1) {
        // Replace between markers
        return existingContent.slice(0, startIdx) +
               START + '\n' + newBlock + '\n' + END +
               existingContent.slice(endIdx + END.length);
    }

    // Append at end
    const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
    return existingContent + separator + START + '\n' + newBlock + '\n' + END + '\n';
}
```

### Pattern 3: Auto Memory Directory Resolution
**What:** Resolve cwd to Claude Code's `~/.claude/projects/<encoded>/memory/` path
**When to use:** Finding where to write context.md and MEMORY.md

```typescript
// Use existing ProjectPath value object
import { ProjectPath } from '../../domain/value-objects/project-path.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveAutoMemoryDir(cwd: string): string {
    const encoded = ProjectPath.fromDecoded(cwd).encoded;
    return join(homedir(), '.claude', 'projects', encoded, 'memory');
}
```

### Anti-Patterns to Avoid
- **Modifying install command:** Context generation runs inside sync, not as a separate hook. The sync hook already triggers sync, which now includes context generation. Do NOT add a second hook entry.
- **Direct infrastructure imports in application layer:** AmbientContextService must use ports (IAmbientContextWriter), not concrete AutoMemoryWriter.
- **Hardcoding budget:** Make the token budget configurable via config.json, with a sensible default (800 tokens).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured context | Custom context aggregation | SmartContextService.getContext() | Already composes decisions, learnings, friction, daily logs with budget allocation |
| AI-formatted output | Custom markdown generator | AiContextFormatter.formatSmartContext() | Already produces clean, token-efficient markdown |
| Path encoding | Manual string replacement | ProjectPath.fromDecoded(cwd).encoded | Already handles Windows drives, spaces, slashes |
| Config deep-merge | Manual object merge | loadConfig() pattern in config-manager.ts | Already handles partial configs with defaults |
| Token estimation | Manual char counting | estimateTokens() from ai-formatter.ts | Already used throughout codebase |

**Key insight:** Every piece of this phase exists in the codebase. The value is in the wiring, not in new logic.

## Common Pitfalls

### Pitfall 1: Case-Insensitive Path Matching
**What goes wrong:** The encoded path from ProjectPath.fromDecoded() preserves case (e.g., `C--Users`), but Claude Code sometimes creates directories with lowercase drive letters (e.g., `c--Users`). On case-insensitive filesystems (Windows), `existsSync` finds either, but on case-sensitive filesystems the directory would not match.
**Why it happens:** Claude Code encodes the path as given by the OS, which can vary in case for the drive letter.
**How to avoid:** When resolving the auto memory directory, check both the encoded path and the case-insensitive variant. Or use `readdirSync` on `~/.claude/projects/` and find the matching directory via case-insensitive comparison. Alternatively, since this tool runs on Windows (where the filesystem is case-insensitive), the simpler approach is to just use `ProjectPath.fromDecoded(cwd).encoded` directly -- the OS will resolve the right directory.
**Warning signs:** Tests on Linux CI fail even though they pass locally on Windows.

### Pitfall 2: MEMORY.md Corruption on Concurrent Writes
**What goes wrong:** If two sync processes run simultaneously (rare but possible), both could read MEMORY.md, modify it, and write back, losing one set of changes.
**Why it happens:** File locking is not used for MEMORY.md writes.
**How to avoid:** The sync hook spawns a detached process, so concurrent execution is unlikely but possible. Accept this risk -- the worst case is a stale summary block that gets corrected on the next sync. Not worth adding file locking complexity.
**Warning signs:** MEMORY.md loses user content unexpectedly.

### Pitfall 3: Auto Memory Directory Not Existing
**What goes wrong:** If Claude Code has never been used in a project directory (or sessions were deleted), `~/.claude/projects/<encoded>/memory/` won't exist.
**Why it happens:** Claude Code creates the directory lazily on first session.
**How to avoid:** Use `mkdirSync(dir, { recursive: true })` before writing. This is safe even if the directory already exists.
**Warning signs:** ENOENT errors during context generation.

### Pitfall 4: MEMORY.md 200-Line Cap
**What goes wrong:** Claude Code only loads the first 200 lines of MEMORY.md into the system prompt. If the file grows beyond 200 lines, the CLI's block at the end gets cut off.
**Why it happens:** The CLI block is appended at the end. User content grows above it.
**How to avoid:** Keep the CLI block short (under 10 lines as specified in CONTEXT.md). The block is just a pointer -- detailed content goes in context.md.
**Warning signs:** CLI block content not appearing in Claude's system prompt in long MEMORY.md files.

### Pitfall 5: SmartContextService Returns Null
**What goes wrong:** If the project has no sessions in the database, SmartContextService.getContext() returns null. Ambient context generation silently fails.
**Why it happens:** New projects, or projects whose sessions haven't been synced yet.
**How to avoid:** Handle null gracefully -- skip context generation, log at debug level. Don't create empty files.
**Warning signs:** context.md missing for some projects after sync.

### Pitfall 6: CWD Resolution in Hook Context
**What goes wrong:** The sync hook receives `cwd` from Claude Code's HookInput. But the background sync process (spawned by hook-runner) does NOT pass CWD through -- it runs `aidev memory sync --session <id>`.
**Why it happens:** The sync command syncs ALL discovered sessions, not just the one that triggered the hook. The session's project path is stored in the sessions table.
**How to avoid:** Context generation should run for the project that triggered the sync. Two approaches: (a) pass `cwd` through to the sync command via an environment variable, or (b) after sync completes, determine the current project from cwd and generate context for it. Approach (b) is simpler -- the sync command already runs in the project directory.
**Warning signs:** Context generated for wrong project, or not generated at all.

## Code Examples

### Auto Memory Directory Structure (Verified from Filesystem)
```
~/.claude/projects/C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus/
  memory/
    MEMORY.md          # Auto-loaded into system prompt (200-line cap)
    context.md         # NEW: full memory CLI context (CLI-owned)
    competitor-research.md  # Existing user/Claude topic files
```

### Claude Code Path Encoding (Verified from ProjectPath.ts + Filesystem)
```
Input:    C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus
Encoded:  C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus

Rules:
  :\ -> --     (drive letter + colon + backslash -> double dash)
  \  -> -      (other backslashes -> single dash)
  /  -> -      (forward slashes -> single dash)
     -> -      (spaces -> single dash)
  -  -> -      (hyphens -> single dash, LOSSY)
```

### MEMORY.md Block Format (from CONTEXT.md)
```markdown
<!-- memory-cli:start -->
## Cross-Project Context
Run `memory context <project>` for full briefing. See [context.md](context.md) for latest snapshot.
- 3 active decisions from kanbanflow, 2 from wow-system
- Open friction: 2 high (aidev), 1 medium (memory)
- Last synced: 2026-03-18
<!-- memory-cli:end -->
```

### Config Extension Pattern (from config-manager.ts)
```typescript
// Add to MemoryConfig interface
export interface MemoryConfig {
    // ... existing fields ...
    /** Ambient context generation settings */
    ambientContext: AmbientContextConfigData;
}

export interface AmbientContextConfigData {
    /** Whether ambient context generation is enabled */
    enabled: boolean;
    /** Token budget for context.md (default: 800) */
    budget: number;
}

export const DEFAULT_AMBIENT_CONTEXT_CONFIG: AmbientContextConfigData = {
    enabled: true,
    budget: 800,
};

// In DEFAULT_CONFIG:
export const DEFAULT_CONFIG: MemoryConfig = {
    // ... existing ...
    ambientContext: DEFAULT_AMBIENT_CONTEXT_CONFIG,
};

// In loadConfig(), add deep-merge:
return {
    ...DEFAULT_CONFIG,
    ...loaded,
    // ... existing merges ...
    ambientContext: {
        ...DEFAULT_AMBIENT_CONTEXT_CONFIG,
        ...(loaded.ambientContext ?? {}),
    },
};
```

### Sync Integration Point (from sync.ts)
```typescript
// In executeSyncCommand(), after memory file sync and before embedding:

// Memory file sync (after session extraction)
const memoryResult = await runMemoryFileSync(db, options);

// NEW: Ambient context generation (after memory files are indexed)
if (!options.dryRun) {
    await runAmbientContextGeneration(db, options);
}

// Embedding pass (existing)
if (options.embed && !options.dryRun) { ... }
```

### Domain Port Interface
```typescript
// In src/domain/ports/services.ts or as separate file
export interface IAmbientContextWriter {
    /**
     * Write context.md to the auto memory directory (complete overwrite).
     */
    writeContextFile(autoMemoryDir: string, content: string): Promise<void>;

    /**
     * Update the CLI-owned block in MEMORY.md using marker-based merge.
     * Creates the file if it doesn't exist. Never touches content outside markers.
     */
    updateMemoryBlock(autoMemoryDir: string, blockContent: string): Promise<void>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Query-based: `memory context <project>` | Query-based + ambient via auto memory | Phase 29 | Claude has context without explicit query |
| All commands require explicit invocation | Summary in system prompt, detail on demand | Phase 29 | Three-tier awareness model |

## Open Questions

1. **CWD Propagation Through Hook Chain**
   - What we know: Hook receives `cwd` from Claude Code. Hook spawns `aidev memory sync --session <id>`. Sync runs in an unspecified cwd.
   - What's unclear: Whether the detached sync process inherits the hook's cwd, or defaults to the system root.
   - Recommendation: Pass CWD explicitly. The simplest approach: in the sync command, use `process.cwd()` to determine the current project directory. The hook spawns the background sync from the project directory, so cwd should be inherited. Verify with a test. If not inherited, add `--cwd <path>` flag or MEMORY_CWD env var.

2. **Which Projects Get Context Generated**
   - What we know: The sync command can sync all sessions across all projects. Context generation should target the current project.
   - What's unclear: Whether to generate context for ALL synced projects or just the current one.
   - Recommendation: Generate for the current project only (determined by cwd). Cross-project context is already included in SmartContextService output when `crossProject: true`. Generating for all projects on every sync would be slow and unnecessary.

## Sources

### Primary (HIGH confidence)
- `src/application/services/smart-context-service.ts` -- SmartContextService API, IProjectResolver interface, SmartContextResult type
- `src/domain/value-objects/project-path.ts` -- encoding rules, verified against filesystem
- `src/infrastructure/hooks/sync-hook-script.ts` -- hook input structure (HookInput with cwd field)
- `src/infrastructure/hooks/config-manager.ts` -- MemoryConfig interface, deep-merge pattern, DEFAULT_CONFIG
- `src/infrastructure/hooks/settings-manager.ts` -- hook installation/detection, no modification needed
- `src/presentation/cli/commands/sync.ts` -- sync pipeline (session sync -> memory file sync -> embedding), integration point
- `src/presentation/cli/formatters/context-formatter.ts` -- AiContextFormatter.formatSmartContext()
- `src/presentation/cli/commands/install.ts` -- install command (no changes needed)
- `~/.claude/projects/` filesystem -- verified encoding pattern, `memory/` subdirectory structure, MEMORY.md content

### Secondary (MEDIUM confidence)
- CONTEXT.md design discussion -- architecture layers, MEMORY.md block format, regeneration trigger

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components exist and are verified in codebase
- Architecture: HIGH -- follows established hexagonal patterns with 1:1 analogs for every new component
- Pitfalls: HIGH -- path encoding verified against filesystem, MEMORY.md format verified against real file

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- all dependencies are internal, no external version risk)
