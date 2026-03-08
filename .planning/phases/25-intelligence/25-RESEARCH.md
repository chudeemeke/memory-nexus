# Phase 25: Intelligence - Research

**Researched:** 2026-03-08
**Domain:** Smart context, temporal decay, AI output formatting, cross-project intelligence
**Confidence:** HIGH

## Summary

Phase 25 is a composition phase. Every building block already exists in the codebase: memory file indexing (Phase 23), friction entries (Phase 24), temporal decay function, context service, formatter strategy pattern, and Commander.js flag inheritance. The work is wiring these components together with new application-layer logic (budget allocator, AI formatter, context rewrite) and extending the infrastructure repository with a cross-project query.

No external libraries are needed. The token budget estimation (~4 chars per token) is a known heuristic adequate for English text. The temporal decay formula is already implemented in `src/application/services/temporal-decay.ts` and already applied in HybridSearchService's hybrid path. This phase extends its application to FTS-only search and memory file results, and adds curated-file exemption logic.

**Primary recommendation:** Treat this as four parallel workstreams (smart context rewrite, temporal decay extension, AI-first output mode, cross-project intelligence) with shared infrastructure (the AI formatter utility is used by both the context rewrite and the `--format ai` flag on all commands).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. **Smart context rewrite** reads from memory files (DECISIONS.md, LEARNINGS.md, daily logs) and indexed session data as fallback, producing structured briefings within a `--budget` token limit
2. **Data source priority order:** DECISIONS.md > LEARNINGS.md > daily logs > cross-project decisions > cross-project learnings > open friction entries > indexed session data
3. **Budget allocation:** sections filled in priority order (unresolved, active decisions, recent learnings, open friction, session summaries); each section truncated independently; ~4 chars per token estimation
4. **Temporal decay formula:** `decayedScore = score * e^(-lambda * ageInDays)` with lambda = ln(2)/halfLifeDays, default 30-day half-life
5. **Curated file exemption:** DECISIONS.md, LEARNINGS.md, USER-PREFS.md are exempt from temporal decay at all levels (global and project)
6. **`--format ai`** strips ANSI escape sequences, box-drawing characters, decorative borders/padding; outputs clean markdown-like text
7. **Cross-project learnings** tagged "Applies to: cross-project" in any LEARNINGS.md are surfaced via `--cross-project` flag (opt-in)
8. **Architecture layer mapping:**
   - ContextService rewrite: Application layer (src/application/services/context-service.ts)
   - Budget allocator: Application layer (new file)
   - AI formatter: Presentation layer (new file)
   - --format flag: Presentation layer (root program)
   - Temporal decay extension: Application layer (extend existing)
   - Cross-project query: Infrastructure layer (extend SqliteMemoryFileRepository)

### Claude's Discretion
- Implementation details within the locked architectural boundaries
- Test strategy specifics (unit vs integration splits)
- Internal data structures for the budget allocator
- How to handle edge cases (empty memory directory, no memory files for project)

### Deferred Ideas (OUT OF SCOPE)
- None specified in CONTEXT.md
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in | FTS5 queries for memory_files_fts, friction_log | Already used throughout |
| Commander.js | v14 | CLI framework, flag inheritance | Already used throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All dependencies already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ~4 chars/token heuristic | tiktoken library | Precise token counting but adds 2MB dependency for marginal accuracy gain; heuristic is standard for budget estimation |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  application/services/
    context-service.ts          # NEW: Smart context application service
    budget-allocator.ts         # NEW: Token budget allocation logic
    temporal-decay.ts           # MODIFY: Add curated-file-aware decay variant
  presentation/cli/
    formatters/
      ai-formatter.ts           # NEW: ANSI-stripping, token-efficient formatter
    commands/
      context.ts                # MODIFY: Add --budget, --format ai, --cross-project
      search.ts                 # MODIFY: Add --format ai support
      list.ts                   # MODIFY: Add --format ai support
      show.ts                   # MODIFY: Add --format ai support
      stats.ts                  # MODIFY: Add --format ai support
      friction.ts               # MODIFY: Add --format ai support
      related.ts                # MODIFY: Add --format ai support
  infrastructure/database/
    repositories/
      memory-file-repository.ts # MODIFY: Add cross-project learnings query
    services/
      context-service.ts        # EXISTS: Current infrastructure context service (may be deprecated or composed)
      hybrid-search-service.ts  # MODIFY: Ensure FTS path also applies temporal decay
```

### Pattern 1: Application-Layer Context Service
**What:** New ContextService in the application layer that composes data from MemoryFileRepository, FrictionRepository, and the existing infrastructure SqliteContextService.
**When to use:** When the context command needs to read memory files, friction entries, and session data to produce a structured briefing.
**Design:**
```typescript
// src/application/services/context-service.ts
export interface SmartContextOptions {
  projectFilter: string;
  budget?: number;          // Token budget (default: unlimited)
  days?: number;            // Limit to last N days
  crossProject?: boolean;   // Include cross-project learnings
  format?: 'brief' | 'detailed' | 'ai' | 'json';
}

export interface SmartContextResult {
  projectName: string;
  sections: ContextSection[];      // Ordered by priority
  totalTokensEstimate: number;
  truncated: boolean;
}

export interface ContextSection {
  title: string;
  priority: number;           // 1 = highest
  items: ContextItem[];
  truncated: boolean;
  tokenEstimate: number;
}

export class SmartContextService {
  constructor(
    private readonly memoryFileRepo: IMemoryFileRepository,
    private readonly frictionRepo: IFrictionRepository,
    private readonly legacyContextService: SqliteContextService,
    private readonly projectResolver: /* project name to encoded path */
  ) {}

  async getContext(options: SmartContextOptions): Promise<SmartContextResult>
}
```

**Key:** The application-layer service orchestrates, the infrastructure services provide data. The existing SqliteContextService becomes the fallback for session data when no memory files exist.

### Pattern 2: Budget Allocator (Pure Function)
**What:** Token budget allocation as a pure function operating on sections with priorities.
**When to use:** When `--budget` is set, distributes token budget across sections by priority.
**Design:**
```typescript
// src/application/services/budget-allocator.ts
export interface BudgetSection {
  priority: number;
  content: string;
  tokenEstimate: number;
}

export interface AllocatedSection extends BudgetSection {
  truncatedContent: string;
  allocated: number;
  truncated: boolean;
}

export function allocateBudget(
  sections: BudgetSection[],
  totalBudget: number,
  charsPerToken?: number  // default 4
): AllocatedSection[]
```

This is a pure function with no dependencies -- ideal for unit testing.

### Pattern 3: AI Formatter Utility
**What:** A shared utility that strips ANSI codes and produces clean text.
**When to use:** When `--format ai` is set on any command.
**Design:**
```typescript
// src/presentation/cli/formatters/ai-formatter.ts
export function stripAnsi(text: string): string
export function formatForAi(text: string): string  // strip ANSI + normalize whitespace
```

Each formatter factory (createContextFormatter, createOutputFormatter, createListFormatter, etc.) gains an "ai" mode that delegates to a new AiFormatter class using these utilities. The AiFormatter produces markdown-like output with zero decoration.

### Pattern 4: Commander.js Global --format Flag
**What:** Adding `--format` to the root program so all subcommands inherit it.
**When to use:** Commander.js v14 supports `.passthrough()` for option inheritance but the existing codebase uses per-command options.

**Analysis of two approaches:**

1. **Root-level option** (`program.option('--format <type>')`) -- Commander.js passes root options separately from subcommand options. Subcommands access parent opts via `this.parent?.opts()` or `program.opts()`. This is the CONTEXT.md approach.

2. **Per-command option** -- Each `createXCommand()` adds its own `--format` option. More boilerplate but matches existing pattern exactly.

**Recommendation:** Root-level option for `--format`. Each command checks `program.opts().format` at execution time. This avoids duplicating the flag on every command and matches CONTEXT.md's architecture mapping. However, commands that already have `--format` (context, with choices `brief`/`detailed`) need careful handling: the existing `--format` values remain valid and `ai` is added as a new choice.

### Anti-Patterns to Avoid
- **Coupling AI formatter to specific data shapes:** The AI formatter should be a general text-transformation utility, not tightly bound to context output. Each command's formatter produces the text, then the AI formatter strips decoration.
- **Hardcoding token budget inside the context service:** Budget should be a parameter, not a constant. Unlimited when not specified.
- **Applying temporal decay in the presentation layer:** Decay is a scoring concern, belongs in application/infrastructure layers.
- **Adding cross-project queries to the application service directly:** The repository should expose the query; the service should compose the results.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI stripping | Manual regex for known codes | Well-tested regex pattern from strip-ansi-like approach | ANSI codes have many forms (8-color, 256-color, RGB, cursor movement) |
| Token counting | Precise tokenizer | 4 chars/token heuristic | Good enough for budget estimation; avoids tiktoken dependency |
| Project name resolution | New resolver | Existing SqliteContextService project lookup | Already handles exact match + substring with session count ranking |

**Key insight:** The ANSI stripping regex is the one piece that seems simple but has edge cases. The pattern `/\x1b\[[0-9;]*[a-zA-Z]/g` handles standard SGR codes. Also strip `\x1b\].*?\x07` for OSC sequences. The existing `color.ts` module uses simple ANSI codes (`\x1b[0;31m` style) so a basic regex suffices.

## Common Pitfalls

### Pitfall 1: Context Command Has Two --format Semantics
**What goes wrong:** The existing context command has `--format` with choices `brief` and `detailed`. Phase 25 adds `--format ai` as a global option. If both exist, Commander.js may conflict or the user gets confused.
**Why it happens:** Two different features using the same flag name.
**How to avoid:** Merge the choices: context command's `--format` becomes `brief | detailed | ai | json` (json already exists via `--json`). The global `--format ai` on the root program serves commands that currently lack a `--format` option. For commands that already have `--format` (context), the subcommand-level option takes precedence.
**Warning signs:** Commander.js "conflicting options" error during test.

### Pitfall 2: Temporal Decay Not Applied to FTS-Only Search Path
**What goes wrong:** Currently, temporal decay is only applied inside `HybridSearchService.hybridSearch()` (the hybrid path). The FTS-only search path (`ftsSearch()`) and the vector-only path (`vectorSearch()`) do NOT apply decay. Users searching with `--mode fts` get undecayed results.
**Why it happens:** Temporal decay was added as part of hybrid search fusion, not as a general search concern.
**How to avoid:** Apply temporal decay at the search result level after FTS search completes, not only inside the hybrid fusion path. The `applyTemporalDecay` function works on any `DecayableResult` -- the challenge is mapping FTS results to rowids (needed for timestamp lookup).
**Warning signs:** Search results with `--mode fts` show old content ranked equally to recent content.

### Pitfall 3: Project Name to Encoded Path Resolution
**What goes wrong:** `memory context kanbanflow` needs to find memory files at `~/.memory/projects/C--Users-Destiny-Projects-kanbanflow/DECISIONS.md`. This requires mapping the human-readable project name to the encoded path.
**Why it happens:** Memory files use encoded paths (from Claude Code's `~/.claude/projects/` convention), but the CLI accepts human-readable names.
**How to avoid:** The existing SqliteContextService already resolves project names to encoded paths (it queries `sessions` table with LIKE matching). The new SmartContextService can use the same approach: query `sessions` for the encoded path matching the project name, then use that encoded path to query `memory_files`.
**Warning signs:** Context command returns session data but no memory file data for valid projects.

### Pitfall 4: Budget Allocation Edge Cases
**What goes wrong:** Budget of 0, budget smaller than any single section, empty sections, all sections empty.
**Why it happens:** Pure function needs defensive boundary handling.
**How to avoid:** Budget of 0 or negative = no budget constraint (unlimited). Sections with 0 content are skipped. If budget is smaller than the minimum useful output, return as much as fits with truncation marker.
**Warning signs:** Test failures with edge-case budget values.

### Pitfall 5: Memory Files Not Indexed Yet
**What goes wrong:** User runs `memory context kanbanflow --format ai` but has never run `memory sync` with memory files present. No memory_files rows exist.
**Why it happens:** Phase 23 added the indexing, but it only runs during sync.
**How to avoid:** Graceful fallback to indexed session data (the existing SqliteContextService behavior). The new SmartContextService checks for memory files first; if none found, falls through to session-based context. No error, just less-rich output.
**Warning signs:** Command errors when memory_files table is empty.

### Pitfall 6: Cross-Project Learnings Content Parsing
**What goes wrong:** "Applies to: cross-project" tag needs to be found within LEARNINGS.md content stored in memory_files. Using FTS5 MATCH for this risks false positives.
**Why it happens:** The tag is a convention embedded in markdown content, not a structured field.
**How to avoid:** Use SQL LIKE query on the content column directly: `WHERE file_type = 'learnings' AND content LIKE '%Applies to: cross-project%'`. FTS5 is unnecessary here because we're looking for an exact phrase in a known small result set (typically <50 learnings files total).
**Warning signs:** FTS5 tokenizer splits "cross-project" into two tokens, returning false matches.

## Code Examples

### ANSI Stripping
```typescript
// src/presentation/cli/formatters/ai-formatter.ts
// Standard SGR + OSC stripping regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

export function estimateTokens(text: string, charsPerToken = 4): number {
  return Math.ceil(text.length / charsPerToken);
}
```

### Budget Allocator
```typescript
// src/application/services/budget-allocator.ts
export function allocateBudget(
  sections: BudgetSection[],
  totalBudget: number,
  charsPerToken = 4,
): AllocatedSection[] {
  if (totalBudget <= 0) {
    // No budget constraint: return all sections untruncated
    return sections.map(s => ({
      ...s,
      truncatedContent: s.content,
      allocated: s.tokenEstimate,
      truncated: false,
    }));
  }

  const charBudget = totalBudget * charsPerToken;
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);
  let remaining = charBudget;
  const results: AllocatedSection[] = [];

  for (const section of sorted) {
    if (remaining <= 0) {
      results.push({ ...section, truncatedContent: "", allocated: 0, truncated: true });
      continue;
    }
    const charEstimate = section.content.length;
    if (charEstimate <= remaining) {
      results.push({ ...section, truncatedContent: section.content, allocated: section.tokenEstimate, truncated: false });
      remaining -= charEstimate;
    } else {
      const truncated = section.content.slice(0, remaining);
      results.push({ ...section, truncatedContent: truncated, allocated: Math.ceil(remaining / charsPerToken), truncated: true });
      remaining = 0;
    }
  }

  return results;
}
```

### Cross-Project Learnings Query
```typescript
// Extension to SqliteMemoryFileRepository
async findCrossProjectLearnings(
  excludeProject?: string,
  limit: number = 20,
): Promise<MemoryFile[]> {
  const sql = excludeProject
    ? `SELECT * FROM memory_files
       WHERE file_type = 'learnings'
         AND content LIKE '%Applies to: cross-project%'
         AND (project_encoded IS NULL OR project_encoded != ?)
       ORDER BY last_indexed_at DESC
       LIMIT ?`
    : `SELECT * FROM memory_files
       WHERE file_type = 'learnings'
         AND content LIKE '%Applies to: cross-project%'
       ORDER BY last_indexed_at DESC
       LIMIT ?`;

  const rows = excludeProject
    ? this.db.prepare<MemoryFileRow, [string, number]>(sql).all(excludeProject, limit)
    : this.db.prepare<MemoryFileRow, [number]>(sql).all(limit);

  return rows.map(r => this.toEntity(r));
}
```

### Temporal Decay with Curated Exemption
```typescript
// Extension to temporal-decay.ts or new function
export function applyTemporalDecayWithExemptions<T extends DecayableResult>(
  results: T[],
  timestamps: Map<number, Date>,
  exemptRowids: Set<number>,  // Curated files: DECISIONS.md, LEARNINGS.md, USER-PREFS.md
  halfLifeDays: number = 30,
  now: Date = new Date(),
): Array<T & { decayedScore: number }> {
  const nowMs = now.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;

  const decayed = results.map(r => {
    if (exemptRowids.has(r.rowid)) {
      return { ...r, decayedScore: r.score };
    }
    const timestamp = timestamps.get(r.rowid);
    if (!timestamp) {
      return { ...r, decayedScore: r.score };
    }
    const ageDays = (nowMs - timestamp.getTime()) / msPerDay;
    const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);
    return { ...r, decayedScore: r.score * decayFactor };
  });

  return decayed.sort((a, b) => b.decayedScore - a.decayedScore);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Session metadata only (counts, dates, tools) | Memory file briefings with budget | Phase 25 | Context becomes actionable instead of statistical |
| No temporal decay on FTS search | Decay on all search paths (FTS, hybrid, memory files) | Phase 25 | Recent content naturally surfaces above old content |
| Terminal-decorated output only | `--format ai` strips decoration | Phase 25 | Claude consumes output efficiently (no wasted tokens on ANSI codes) |

**Deprecated/outdated:**
- The existing `SqliteContextService` in infrastructure layer becomes a data provider (session metadata) rather than the primary context service. It is not deleted but composed.

## Open Questions

1. **Token estimation accuracy for non-English content**
   - What we know: ~4 chars/token works for English text
   - What's unclear: Projects with CJK characters or code-heavy content may have different ratios
   - Recommendation: Use 4 as default, allow override via config. Not a blocking concern.

2. **Root-level --format vs per-command --format collision**
   - What we know: Commander.js v14 lets root and subcommand both define `--format`; subcommand wins. Context already has `--format brief|detailed`.
   - What's unclear: Whether Commander.js merges choices or replaces them
   - Recommendation: Add `ai` to the context command's existing `--format` choices rather than using root-level inheritance. For commands without `--format`, add it individually. More boilerplate but avoids Commander.js inheritance edge cases. Verified from codebase: every command already manages its own options independently.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/application/services/temporal-decay.ts` (existing decay implementation)
- Codebase analysis: `src/infrastructure/database/services/context-service.ts` (existing context service)
- Codebase analysis: `src/infrastructure/database/services/hybrid-search-service.ts` (temporal decay integration)
- Codebase analysis: `src/infrastructure/database/repositories/memory-file-repository.ts` (memory file queries)
- Codebase analysis: `src/presentation/cli/formatters/` (formatter strategy pattern)
- Codebase analysis: `src/presentation/cli/index.ts` (root program structure)
- CONTEXT.md: Phase 25 design decisions and architecture mapping

### Secondary (MEDIUM confidence)
- ANSI stripping regex pattern: well-established approach, multiple npm packages (strip-ansi) use equivalent regex

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, everything already in codebase
- Architecture: HIGH - CONTEXT.md specifies layer mapping, verified against existing patterns
- Pitfalls: HIGH - Identified through systematic codebase analysis of join points
- Code examples: HIGH - Based on actual codebase patterns (formatter strategy, temporal decay function, repository queries)

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- all internal composition, no external dependencies to go stale)
