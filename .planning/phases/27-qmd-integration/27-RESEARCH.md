# Phase 27: qmd Integration - Research

**Researched:** 2026-03-18
**Domain:** External CLI tool delegation, optional dependency detection, CLI extension
**Confidence:** HIGH

## Summary

Phase 27 integrates @tobilu/qmd as an optional companion for markdown file search via `memory search --files`. This is a thin delegation layer -- memory detects whether qmd is installed, shells out to it with JSON output, parses the response, and formats it consistently with memory's own output conventions. No qmd code runs inside memory's process; it is purely a subprocess invocation.

The existing codebase provides exact patterns for every component needed. `ClaudeSummaryGenerator` (infrastructure/llm/) demonstrates external CLI delegation via `spawn`. The `HealthCheckResult` interface in `health-checker.ts` shows how to add optional capability reporting to doctor. The `--format ai` pattern and `formatForAi()` utility show how to apply AI formatting to any output. The `--files` flag is a new presentation-layer concern that short-circuits the normal search flow to delegate to qmd instead.

**Primary recommendation:** Build this as a thin infrastructure adapter (QmdRunner) behind a domain port (IExternalSearchProvider), wired at the presentation layer. Use `spawn` (not `execSync`) with `--json` output from qmd for reliable parsing. Detection uses `execSync('which qmd')` wrapped in try/catch (fast, synchronous check appropriate for doctor and one-off CLI invocations).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- CLI flag: `--files` on the search command delegates to qmd
- qmd invocation: `qmd search "<query>" --path ~/.memory/` with `--json` for parseable output
- Detection: runtime check via `which qmd` (or equivalent), not hard dependency
- Doctor: informational-only qmd status (does NOT affect exit code)
- Architecture: QmdRunner in infrastructure, IExternalSearchProvider port in domain, wiring in presentation
- Results shown separately with "File results:" header, not merged with session search results
- Start simple: no additional qmd flags (--limit, --rerank) in v1

### Claude's Discretion
- Should we pass additional qmd flags (--limit, --rerank)? Recommendation: start simple
- Should qmd results merge with memory search results? Recommendation: shown separately
- Should we provide `memory qmd setup`? Recommendation: no, just document install in --help

### Deferred Ideas (OUT OF SCOPE)
- `memory qmd setup` command for handling installation quirks
- Merging qmd and memory search results into unified ranking
- Additional qmd flags (--limit, --rerank, --full, --min-score)
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:child_process | built-in | `spawn` for qmd subprocess | Existing pattern (ClaudeSummaryGenerator, HookRunner, BackgroundEmbedder) |
| Commander.js | v14 | `--files` option on search command | Already used for all CLI commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tobilu/qmd | 1.1.0 | Markdown file search | Optional runtime dependency -- only invoked when --files is passed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `spawn` (async) | `execSync` (sync) | spawn matches codebase pattern, is non-blocking, and handles streaming output; execSync is simpler but blocks the event loop and is not used anywhere in the codebase for data-returning commands |
| `which qmd` detection | `Bun.which()` | Bun.which is Bun-specific; `which` works in Git Bash/MINGW which is the target platform. However, for Node.js portability, `execSync('which qmd')` is the pragmatic choice |
| Separate port interface | Direct spawn in search.ts | Port interface follows hexagonal pattern (QUAL-03), makes testing straightforward, keeps presentation thin |

**Installation:**
```bash
# qmd is NOT installed as a dependency of memory
# Users install separately:
bun add -g @tobilu/qmd
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  domain/
    ports/
      services.ts            # Add IExternalSearchProvider interface
  infrastructure/
    external/                 # NEW directory
      qmd-runner.ts           # QmdRunner adapter (implements IExternalSearchProvider)
      qmd-runner.test.ts      # Unit tests (mock spawn)
      index.ts                # Barrel export
  presentation/
    cli/
      commands/
        search.ts             # Add --files flag, delegate to QmdRunner
        doctor.ts             # Add qmd availability check (informational)
```

### Pattern 1: External CLI Delegation via Spawn
**What:** Shell out to an external tool, capture JSON output, parse and format.
**When to use:** When integrating with a CLI tool that is not a library dependency.
**Example:**
```typescript
// Source: Existing pattern in infrastructure/llm/claude-summary-generator.ts
import { spawn } from "node:child_process";

export class QmdRunner implements IExternalSearchProvider {
  async search(query: string, path: string): Promise<QmdResult[]> {
    return new Promise((resolve, reject) => {
      const child = spawn("qmd", ["search", query, "--json", "--path", path], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", (err: Error) => {
        reject(new Error(`Failed to spawn qmd: ${err.message}`));
      });
      child.on("close", (code: number | null) => {
        if (code === 0) {
          resolve(JSON.parse(stdout));
        } else {
          reject(new Error(`qmd exited with code ${code}: ${stderr.trim()}`));
        }
      });
    });
  }
}
```

### Pattern 2: Optional Tool Detection (Synchronous)
**What:** Check if an external tool is available in PATH before attempting to use it.
**When to use:** For doctor health check and --files guard.
**Example:**
```typescript
// Use execSync for detection -- fast, synchronous, appropriate for CLI guard checks
import { execSync } from "node:child_process";

export function isQmdAvailable(): boolean {
  try {
    execSync("which qmd", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// For doctor, also capture the path:
export function getQmdInfo(): { available: boolean; path?: string } {
  try {
    const path = execSync("which qmd", { encoding: "utf-8" }).trim();
    return { available: true, path };
  } catch {
    return { available: false };
  }
}
```

### Pattern 3: Short-Circuit Delegation in Search Command
**What:** When --files is specified, skip the normal FTS5/hybrid search and delegate to QmdRunner instead.
**When to use:** When a flag completely changes the execution path (not just a filter).
**Example:**
```typescript
// In search.ts executeSearchCommand():
if (options.files) {
  // Short-circuit: delegate to qmd instead of normal search
  return executeFileSearch(query, options);
}
// ... normal search flow continues
```

### Anti-Patterns to Avoid
- **Don't make qmd a package dependency:** It is optional, detected at runtime. No `bun add @tobilu/qmd`.
- **Don't merge results with session search:** Different data sources, different ranking semantics. Show separately.
- **Don't use spawn for detection:** `spawn` is async and overkill for a boolean check. Use `execSync` for the `which` check (fast, synchronous).
- **Don't catch and ignore qmd errors silently:** If qmd is available but crashes, report the error. Only silence the "not available" case when printing install instructions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown file search | Custom BM25/vector over markdown files | qmd CLI | qmd already does BM25 + vector + LLM reranking; reimplementing is months of work |
| JSON output parsing | Custom text parser for qmd CLI output | qmd --json flag | qmd natively supports JSON output format, structured and stable |
| External tool detection | Custom PATH scanning or file existence check | `which` command via execSync | OS-level tool, handles symlinks, PATH resolution, platform quirks |

**Key insight:** This phase is pure delegation. Memory does not replicate qmd functionality. It detects, invokes, parses, and formats.

## Common Pitfalls

### Pitfall 1: qmd Not Built (dist/ Missing)
**What goes wrong:** qmd binary exists in PATH (wrapper script) but the actual dist/qmd.js is missing. `which qmd` succeeds but invocation fails with MODULE_NOT_FOUND.
**Why it happens:** `bun add -g` from GitHub installs source but does not run the build script. The wrapper script at `~/.bun/bin/qmd` points to dist/qmd.js which doesn't exist.
**How to avoid:** Detection should validate that qmd actually runs, not just that the binary exists in PATH. Consider running `qmd --version` (or a minimal command) as the availability check instead of just `which qmd`. However, CONTEXT.md locks the `which` approach, so handle the spawn ENOENT / MODULE_NOT_FOUND error gracefully in QmdRunner.
**Warning signs:** `which qmd` succeeds but `qmd search` fails with MODULE_NOT_FOUND.

### Pitfall 2: qmd --path Flag vs Collection-Based Indexing
**What goes wrong:** CONTEXT.md specifies `qmd search "<query>" --path ~/.memory/` but qmd v1.1.0 does NOT have a `--path` flag. qmd uses collections (indexed folders) -- you run `qmd collection add` first, then search. The `--path` flag does not exist in the CLI argument parser.
**Why it happens:** The CONTEXT.md described a desired interface, not qmd's actual interface.
**How to avoid:** Memory needs to either: (a) invoke `qmd search <query>` and rely on the user having already set up a qmd collection pointing to ~/.memory/, or (b) use `qmd search <query> --index <name>` where the index was set up pointing to ~/.memory/ files. The actual qmd search accepts positional query, output format flags (--json, --csv, --xml, --files), result limit (-n), min score (--min-score), and collection filter (-c). There is NO --path flag.
**Warning signs:** qmd failing with "Unknown option: --path" or silently ignoring it.

### Pitfall 3: `which` on Windows Native
**What goes wrong:** `which` is a Unix command. On Windows without Git Bash/MINGW, it doesn't exist.
**Why it happens:** Claude Code on this machine runs Git Bash, where `which` works. But if memory is installed on a system using cmd.exe or PowerShell directly, `which qmd` will fail.
**How to avoid:** Use `Bun.which("qmd")` which is cross-platform, or try `which` first and fall back to `where` on Windows. Since this project targets Bun, `Bun.which()` is actually the ideal choice. However, for the detection function that runs in any context, `execSync("which qmd")` with error handling is sufficient for the target user base (Git Bash on Windows, Linux, macOS).
**Warning signs:** Detection always returning false on Windows cmd.exe.

### Pitfall 4: qmd JSON Output Shape Assumptions
**What goes wrong:** Parsing qmd JSON output based on assumed field names, then qmd updates and changes the shape.
**Why it happens:** qmd is a third-party tool under active development. The JSON shape is not a stable API.
**How to avoid:** Type the expected JSON shape explicitly and validate/coerce on parse. Handle missing fields gracefully. The current JSON output shape from qmd search --json is: `[{ docid, score, file, title, context, snippet }]`. The `file` field uses `qmd://` URI format.
**Warning signs:** Undefined fields in parsed results, or crashes on shape changes.

### Pitfall 5: Conflicting --files Flag
**What goes wrong:** Commander.js might have issues with --files as a boolean option if it conflicts with other options.
**Why it happens:** --files already exists as a qmd output format flag. In memory's search command, it means "search files via qmd" -- different semantics but same name.
**How to avoid:** The flag is on memory's search command, not passed to qmd. Memory always passes --json to qmd regardless of what the user passes to memory. No conflict, but document clearly.

## Code Examples

Verified patterns from the codebase:

### QmdRunner Spawn Pattern (Based on ClaudeSummaryGenerator)
```typescript
// Source: src/infrastructure/llm/claude-summary-generator.ts
// Adapted for qmd invocation
import { spawn } from "node:child_process";

export interface QmdSearchResult {
  docid?: string;
  score: number;
  file: string;
  title: string;
  context?: string;
  snippet?: string;
}

export class QmdRunner {
  async search(query: string): Promise<QmdSearchResult[]> {
    return new Promise((resolve, reject) => {
      const child = spawn("qmd", ["search", query, "--json"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err: Error) => {
        reject(new Error(`Failed to spawn qmd: ${err.message}`));
      });

      child.on("close", (code: number | null) => {
        if (code === 0) {
          try {
            const results = JSON.parse(stdout) as QmdSearchResult[];
            resolve(results);
          } catch (parseErr) {
            reject(new Error(`Failed to parse qmd output: ${stdout.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`qmd exited with code ${code}: ${stderr.trim()}`));
        }
      });
    });
  }
}
```

### Doctor qmd Check Pattern (Based on checkSqliteVecAvailability)
```typescript
// Source: src/infrastructure/database/health-checker.ts checkSqliteVecAvailability()
// Adapted for qmd detection
import { execSync } from "node:child_process";

export interface QmdHealth {
  available: boolean;
  path: string | null;
}

export function checkQmdAvailability(): QmdHealth {
  try {
    const path = execSync("which qmd", { encoding: "utf-8" }).trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}
```

### Test Pattern for Mocking Spawn (Based on ClaudeSummaryGenerator Tests)
```typescript
// Source: src/infrastructure/llm/claude-summary-generator.test.ts
import { describe, it, expect, spyOn, afterEach } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";

function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdin = { write: () => true, end: () => {} };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

// Mock spawn, emit JSON on stdout, emit close with code 0
const mockProc = createMockProcess();
const spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(mockProc);

// Simulate qmd returning JSON results
mockProc.stdout.emit("data", Buffer.from(JSON.stringify([
  { score: 0.85, file: "qmd://daily/2026-03-10.md", title: "Daily Log", snippet: "..." }
])));
mockProc.emit("close", 0);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CONTEXT.md proposes `--path ~/.memory/` flag | qmd has NO --path flag; uses collection-based indexing | Discovered during research | Must adapt invocation to use collections or bare search, not --path |
| `which qmd` for detection | Same, but `Bun.which()` is available as cross-platform alternative | Current | Low impact -- `which` works on target platform (Git Bash) |

**Deprecated/outdated:**
- CONTEXT.md `--path` flag assumption: qmd v1.1.0 does not have this flag. qmd searches its indexed collections. The invocation should be `qmd search "<query>" --json` (searches all indexed collections) or `qmd search "<query>" --json -c <collection>` to filter to a specific collection.

## Critical Discovery: qmd --path Does Not Exist

**Confidence: HIGH** (verified by reading qmd v1.1.0 source at `C:/Users/Destiny/node_modules/@tobilu/qmd/src/qmd.ts`)

The CONTEXT.md specifies: `qmd search "<query>" --path ~/.memory/`

However, qmd's actual CLI parser (util.parseArgs at line 2237) accepts these options for search:
- `-n <count>` -- result limit
- `--min-score <score>` -- minimum score threshold
- `--all` -- return all results
- `--full` -- full document body instead of snippet
- `--json` / `--csv` / `--xml` / `--md` / `--files` -- output format
- `-c <name>` / `--collection <name>` -- filter by collection (multiple allowed)
- `--line-numbers` -- add line numbers
- `--index <name>` -- use named index

There is no `--path` flag. qmd operates on pre-indexed collections. To search ~/.memory/ files:
1. User must first run: `qmd collection add --name memory --mask "~/.memory/**/*.md"` (or equivalent)
2. Then: `qmd update` to index the files
3. Then: `qmd search "<query>" --json -c memory`

**Implication for Phase 27:** The delegation command should be `qmd search "<query>" --json` (search all collections) since the user controls what collections qmd indexes. Memory should NOT try to manage qmd's collection setup. The `--files` flag on memory's search command simply means "delegate to qmd" -- what qmd searches is qmd's concern.

Alternatively, if we want to restrict search to memory files only, the user would need to set up a qmd collection first. Memory could check for a "memory" collection and suggest setup if missing, but that's added complexity best deferred.

## Open Questions

1. **qmd Collection Setup**
   - What we know: qmd requires pre-indexed collections. There is no `--path` flag for ad-hoc directory search.
   - What's unclear: Should memory assume a "memory" collection exists, or search all collections, or provide setup instructions?
   - Recommendation: Search all collections by default (`qmd search "<query>" --json`). If the user wants to restrict to memory files, they can set up a "memory" collection. Document this in --help. Don't automate qmd collection management.

2. **qmd Broken Installation Handling**
   - What we know: `which qmd` succeeds even when dist/ is missing (wrapper script exists but points to nonexistent dist/qmd.js).
   - What's unclear: Should detection be "which qmd" (fast but may false-positive) or "qmd --version" (slower but validates functionality)?
   - Recommendation: Use `which qmd` for detection (matches CONTEXT.md). Handle MODULE_NOT_FOUND and other spawn errors gracefully in QmdRunner with a helpful error message that includes "Try rebuilding qmd: cd <path> && bun run build".

3. **Output Formatting for File Results**
   - What we know: qmd JSON output has: docid, score, file (qmd:// URI), title, context, snippet. Memory's formatters work with SearchResult value objects.
   - What's unclear: Should file results use the same output formatter as session results, or a separate formatter?
   - Recommendation: Separate formatter. qmd results have different fields (file path instead of session/project, no message role, different score semantics). A simple console.log with "File results:" header and formatted list is appropriate.

## Sources

### Primary (HIGH confidence)
- qmd source code at `C:/Users/Destiny/node_modules/@tobilu/qmd/src/qmd.ts` -- CLI parser, search function, output format, available flags
- qmd package.json at `C:/Users/Destiny/node_modules/@tobilu/qmd/package.json` -- version 1.1.0, bin entry, build script
- memory-nexus source: `src/infrastructure/llm/claude-summary-generator.ts` -- spawn pattern for external CLI delegation
- memory-nexus source: `src/infrastructure/database/health-checker.ts` -- health check patterns, HealthCheckResult interface
- memory-nexus source: `src/presentation/cli/commands/search.ts` -- search command structure, options, execution flow
- memory-nexus source: `src/presentation/cli/commands/doctor.ts` -- doctor command structure, formatting, exit code logic

### Secondary (MEDIUM confidence)
- CONTEXT.md -- user intent and design decisions (technically accurate on architecture, inaccurate on `--path` flag)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components use existing codebase patterns
- Architecture: HIGH - exact 1:1 analogs exist (ClaudeSummaryGenerator -> QmdRunner, checkSqliteVecAvailability -> checkQmdAvailability)
- Pitfalls: HIGH - verified by reading qmd source (critical --path flag discovery); installation issues documented from real experience

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (qmd is under active development; check for CLI changes if integrating after this date)
