# Phase 32: CLI Surface - Research

**Researched:** 2026-05-14
**Domain:** Commander.js v14 help customization + uniform CLI output contracts (--json, --format)
**Confidence:** HIGH (Commander.js docs verified via Context7; codebase patterns grep-verified; audit constraints quoted verbatim)

## Summary

Phase 32 adds three uniform surface properties to the memory CLI: **(1) labeled help groups** organizing commands into Query / Data / System / Feedback categories, **(2) a uniform `--json` flag** producing valid JSON to stdout on six query commands, and **(3) a uniform `--format brief|ai` flag** producing condensed or AI-optimized output where applicable. All three exist as scaffolding in the codebase today — but inconsistently. The Phase 32 job is **normalization**, not greenfield design.

The work composes with Phase 32.5 (Surface Consolidation, audit A-prime) which immediately follows and will unify the six query commands behind a single query primitive. **Phase 32's `--json` and `--format` design MUST produce a shared envelope shape that Phase 32.5 can route**, not per-command bespoke shapes. The audit (§21) is load-bearing on this: read surfaces must be accessible via one primitive with shape flags. Phase 32 lays the groundwork for that envelope; Phase 32.5 unifies the routing.

Commander.js v14 (verified via Context7: 14.0.3 published 2026-05-12, engines `node >= 20`) ships native `.commandsGroup()`, `.optionsGroup()`, and `.helpGroup()` — added in v14.0.0 (2025-05-18). CLI-01 maps directly to `.commandsGroup()`. No custom `helpInformation()` override needed; no community helper needed.

**Primary recommendation:** Use Commander.js v14's native `.commandsGroup()` for CLI-01. Define a single `QueryResultEnvelope<T>` shape for CLI-02. Normalize `--format` choices to `brief | ai` across the six query commands for CLI-03, preserving today's "default" mode as the no-flag baseline. Keep text output as the default; `--json` is opt-in (backward compat preserved). Design the envelope as Phase 32.5-ready (carry `kind` and `scope` fields).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Help group registration | Presentation (CLI) | — | Commander.js API surface; no domain/application concern |
| `--json` flag plumbing | Presentation (CLI) | — | Output format is presentation; data shape is domain-stable |
| `--json` envelope shape | Presentation (CLI) | Domain (types) | Envelope wraps domain values; envelope itself lives in presentation |
| `--format brief\|ai` formatter selection | Presentation (CLI Formatters) | — | Formatters already in `src/presentation/cli/formatters/`; choice is presentation-only |
| JSON schema for validation tests | Tests + Presentation | — | Schema is the contract between CLI and consumers; tests assert it |

Phase 32 is **entirely presentation-layer**. Domain and application layers are untouched.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 (current ^14.0.2) | CLI parsing, help generation, group registration | Already in use across every CLI command; v14 introduced `.commandsGroup()` natively |
| bun:test | bundled with bun 1.x | Test runner | Existing project test framework; introspects Command instances directly |

**Verified versions:**
- `commander` latest = **14.0.3** (published 2026-05-12, npm `time.modified` confirmed; engines `{ node: '>=20' }`). Project has `^14.0.2` in package.json — semver caret resolves to 14.0.3 on `bun install`. [VERIFIED: npm registry, 2026-05-14]
- `.commandsGroup()`, `.optionsGroup()`, `.helpGroup()` introduced in **commander v14.0.0** (2025-05-18). [VERIFIED: Context7 + commander.js CHANGELOG]

### Supporting (already in codebase — no new deps)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `formatters/output-formatter.ts` | Search results formatter (JSON envelope already exists for search) | Use as the canonical envelope template |
| `formatters/list-formatter.ts` | List formatter with default/json/quiet/verbose modes | Pattern to replicate per-command |
| `formatters/error-formatter.ts` | `formatErrorJson()` returns `{ error: { code, message } }` shape | Already canonical for JSON-mode errors |
| `formatters/ai-formatter.ts` | `formatForAi(text)` — strips ANSI, normalizes whitespace | Already canonical for `--format ai` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Commander v14 `.commandsGroup()` | Custom `helpInformation()` override | Override is brittle, re-implements wrapping/sorting; v14 native is the canonical Commander pattern — use it. Rejected. |
| Per-command JSON envelopes (status quo) | Single `QueryResultEnvelope<T>` shared type | Per-command shapes are what we have today (inconsistency). Phase 32.5 needs a shared shape. Adopt shared. |
| Global `--json` option (`program.option('--json')`) | Per-command `--json` option | Commander does NOT inherit parent options on subcommands (verified in friction/index.ts:3 comment). Per-command remains canonical; abstract via a helper to avoid duplication. |
| `program.configureHelp({ sortSubcommands: true })` | Manual command-order discipline | Sorted alphabetically defeats the GROUP order semantic (Query first, etc.). Do NOT enable `sortSubcommands` — let `.commandsGroup()` ordering speak. |

**Installation:**
No new dependencies. Existing `commander: ^14.0.2` already supports all needed APIs.

## Architecture Patterns

### System Architecture Diagram

```
                        memory <command> [args] [flags]
                                    |
                                    v
                        +-----------------------+
                        | program (Command)     |
                        |  .commandsGroup(...)  |   <-- CLI-01: groups assignment
                        +-----------------------+
                                    |
                                    | dispatches to
                                    v
            +-----------+   +-----------+   +-----------+
            | search    |   | context   |   | stats     |    ... (6 query commands)
            | (Command) |   | (Command) |   | (Command) |
            +-----------+   +-----------+   +-----------+
                  |               |               |
                  | parse flags: --json, --format brief|ai
                  v
            executeXxxCommand(args, options)
                  |
                  | fetch data from infra/application layer
                  v
            +-------------------------------+
            | output dispatcher (presentation) |
            |  if options.json -> JSON envelope |
            |  else if --format ai -> formatForAi(text) |
            |  else if --format brief -> brief formatter |
            |  else -> default text formatter |
            +-------------------------------+
                  |
                  v
              stdout (data) / stderr (errors in text mode)
```

**Trace primary case:** `memory search "x" --json` → `program.parse()` dispatches to search Command → `executeSearchCommand("x", { json: true })` → results fetched → `JsonOutputFormatter.formatResults()` produces `QueryResultEnvelope` → `console.log(envelope)`. Error path: caught → `formatErrorJson(error)` → `console.log({ error: ... })` (per industry best practice: in JSON mode, errors also go to stdout so consumers parse one stream).

### Recommended Project Structure

```
src/presentation/cli/
├── index.ts                      # Register groups + commands (single source of truth for help layout)
├── commands/
│   ├── search.ts                 # adds --json, --format brief|ai (currently has --json, --format default|ai)
│   ├── context.ts                # normalize --format from brief|detailed|ai to brief|ai (detailed becomes alias or removed)
│   ├── show.ts                   # add brief mode (currently default|ai)
│   ├── list.ts                   # add brief mode
│   ├── related.ts                # normalize --format (brief|detailed|ai -> brief|ai)
│   ├── stats.ts                  # add brief mode OR document N/A (see "applicability" below)
│   └── ...                       # other commands unchanged
└── formatters/
    ├── envelope.ts               # NEW: shared QueryResultEnvelope<T> type + helpers
    ├── output-formatter.ts       # search formatter (already has JSON envelope — promote pattern)
    ├── list-formatter.ts         # extend for brief mode
    ├── show-formatter.ts         # extend for brief mode
    ├── stats-formatter.ts        # extend for brief mode OR document non-applicability
    ├── related-formatter.ts      # extend for brief mode (already has brief)
    ├── context-formatter.ts      # extend for brief mode (already has brief)
    └── ai-formatter.ts           # unchanged — formatForAi() already canonical
```

### Pattern 1: Help groups via .commandsGroup()

**What:** Native Commander.js v14 API. Inserts group heading lines into auto-generated help output.
**When to use:** Always for CLI-01; the only sanctioned approach.

```typescript
// Source: Commander.js Readme (verified via Context7) [CITED: github.com/tj/commander.js/blob/master/Readme.md]
import { Command } from "commander";

const program = new Command()
  .name("memory")
  .description("Cross-project context persistence for Claude Code sessions");

program
  .commandsGroup("Query Commands:")
  .addCommand(createSearchCommand())
  .addCommand(createContextCommand())
  .addCommand(createShowCommand())
  .addCommand(createListCommand())
  .addCommand(createRelatedCommand())
  .addCommand(createStatsCommand())

  .commandsGroup("Data Commands:")
  .addCommand(createSyncCommand())
  .addCommand(createBackfillCommand())
  .addCommand(createExportCommand())
  .addCommand(createImportCommand())
  .addCommand(createPurgeCommand())

  .commandsGroup("System Commands:")
  .addCommand(createInstallCommand())
  .addCommand(createUninstallCommand())
  .addCommand(createStatusCommand())
  .addCommand(createDoctorCommand())
  .addCommand(createCompletionCommand())

  .commandsGroup("Feedback Commands:")
  .addCommand(createFrictionCommand());

// Note: `browse` placement TBD — see "Open Questions" below
```

The grouping is purely a help-output concern. Command resolution is unaffected. Order within a group is the order of `.addCommand()` calls.

### Pattern 2: QueryResultEnvelope (CLI-02 + Phase 32.5-ready)

**What:** Single typed envelope wrapping every query command's JSON output.
**When to use:** Every `--json` emission across the 6 query commands.

```typescript
// src/presentation/cli/formatters/envelope.ts (NEW in Phase 32)

/**
 * Uniform JSON envelope for all query commands.
 *
 * Phase 32.5-ready: kind + scope fields enable Phase 32.5's unified query
 * primitive to route results through a single envelope shape regardless
 * of which underlying read surface was invoked.
 */
export interface QueryResultEnvelope<T = unknown> {
  /** Schema version. Bump on breaking shape changes. Initial: "1". */
  schema_version: string;
  /** Command that produced this output. Phase 32.5 may use this to dispatch back to per-kind formatters during migration. */
  command: "search" | "context" | "show" | "list" | "related" | "stats";
  /** Result kind. Phase 32.5 unified-primitive flag (--kind) will set this; in Phase 32, derived from command name. */
  kind: "message" | "session" | "context" | "related" | "stats";
  /** Optional scope qualifier (project, global). Phase 32.5 introduces --scope. */
  scope?: string;
  /** Per-command metadata (timing, mode, etc.). Optional, additive. */
  meta?: Record<string, unknown>;
  /** Result payload. Always an array for list-like commands; object for stats/single-record commands. */
  data: T;
}

/** Error variant — same shape with `error` instead of `data`. */
export interface QueryErrorEnvelope {
  schema_version: string;
  command: string;
  error: {
    code: string;
    message: string;
    context?: Record<string, unknown>;
  };
}
```

Why these fields:
- `schema_version` — explicit contract version. Consumers can `assert envelope.schema_version === "1"`.
- `command` + `kind` — Phase 32.5's unified primitive will accept `--kind <message|session|...>`. Carrying `kind` today means Phase 32.5 just reads the field instead of computing it.
- `scope` — Phase 32.5 introduces `--scope <project|global>`. Reserve the field now (optional).
- `meta` — additive, per-command. Search uses `{ mode, mode_reason, embedding_coverage, ... }`. List uses `{ filters_applied, count }`. Etc.
- `data` — the payload. The shape inside `data` stays per-command (a list of messages is different from a list of sessions); the OUTER shape is uniform.

### Pattern 3: --format brief|ai (CLI-03)

**What:** Standardized format choice on every query command where applicable.
**When to use:** Always when adding `--format` to a query command.

```typescript
import { Option } from "commander";

// Canonical pattern across all 6 query commands
.addOption(
  new Option("--format <type>", "Output format")
    .choices(["brief", "ai"])
    .default("brief")  // OR omit default — text default is implicit when flag absent
)
```

**Semantics (proposed, ratified in Open Questions):**
- **no flag (default text):** Current behavior — human-readable, full formatting with colors when TTY.
- **`--format brief`:** Single-line summary per record. For search: `<sessionId> [score%] <snippet 80 chars>`. For list: `<sessionId> <project> <messages> <last-active>`. For show: header line only (no full thread). For stats: top-line counters only.
- **`--format ai`:** Apply `formatForAi(text)` — strips ANSI, normalizes whitespace. Optimized for Claude consumption via Bash. Already implemented as `ai-formatter.ts:formatForAi()`.
- **Precedence with `--json`:** `--json` always wins. If both are present, emit JSON; treat `--format` as no-op in JSON mode (or warn, see Open Questions). Industry pattern (gh, kubectl): one machine format wins.

### Pattern 4: --json flag pattern (CLI-02)

**What:** Per-command `--json` flag (NOT global — Commander v14 does not inherit parent options to subcommands; verified in `friction/index.ts:3` comment).
**When to use:** All 6 query commands.

```typescript
.option("--json", "Output results as JSON")
```

In the action handler:

```typescript
if (options.json) {
  const envelope: QueryResultEnvelope<SearchResultItem[]> = {
    schema_version: "1",
    command: "search",
    kind: "message",
    meta: { query, mode: searchMeta.mode, /* ... */ },
    data: results,
  };
  console.log(JSON.stringify(envelope, null, 2));
  return { exitCode: 0 };
}
// else text path
```

**Errors in JSON mode:** Emit to stdout (NOT stderr) so consumers parse one stream. Industry-verified pattern (gh, kubectl, modern CLIs). The existing `formatErrorJson()` in `error-formatter.ts:162-175` already does this — `console.log(formatErrorJson(error))` in search.ts:376. Wrap in `QueryErrorEnvelope` shape for uniformity:

```typescript
if (options.json) {
  const envelope: QueryErrorEnvelope = {
    schema_version: "1",
    command: "search",
    error: { code: nexusError.code, message: nexusError.message, context: nexusError.context },
  };
  console.log(JSON.stringify(envelope, null, 2));
} else {
  console.error(formatError(nexusError));  // stderr in text mode
}
```

### Anti-Patterns to Avoid

- **Per-command bespoke JSON shapes.** Search currently emits `{ meta, results }`; list emits plain `[...]`. Phase 32.5 cannot unify routing if shapes diverge. Use `QueryResultEnvelope` everywhere.
- **Custom `helpInformation()` override for grouping.** Re-implements line wrapping, term width handling. Commander v14 native is the canonical path.
- **Routing `console.error(...)` for errors when `--json` is set.** Breaks `cmd --json | jq ...`. Errors go to stdout in JSON mode (envelope-wrapped), to stderr in text mode (formatted).
- **Calling `formatForAi()` ON the JSON output.** `--format ai` should be a no-op when `--json` is present, or `--json` should silently override. Do NOT pipe JSON through ANSI stripping.
- **Inconsistent `--format` choice lists.** Today: context/related = `brief|detailed|ai`; search/list/show/stats = `default|ai`. Phase 32 normalizes to a SINGLE choice list per audit codex finding #2 ("scope unchanged but consistent flags").
- **Enabling `program.configureHelp({ sortSubcommands: true })`.** Defeats group ordering; lists everything alphabetically inside groups but kills the group-first-then-internal-order semantic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Group help headings | Custom `helpInformation()` override | `.commandsGroup()` (Commander v14 native) | Native handles wrapping, term width, list rendering; community has zero adoption of custom alternatives |
| ANSI stripping for AI output | Regex you write | `formatForAi()` in `ai-formatter.ts` | Already battle-tested; covers SGR/CSI/OSC/charset escape sequences |
| JSON envelope serialization | Manual `JSON.stringify` with custom indentation | `JSON.stringify(envelope, null, 2)` directly | Standard; the search command already does this |
| Error → JSON formatting | New code per command | `formatErrorJson()` in `error-formatter.ts` | Already canonical; just wrap in envelope shape |
| Output mode dispatch | New `if/else` ladder per command | Existing formatter strategy pattern in `output-formatter.ts:createOutputFormatter()` | Already in use; extend the existing factory instead of paralleling |

**Key insight:** Phase 32 is **90% normalization, 10% new code**. The infrastructure exists. The job is to make 6 commands speak the same dialect.

## Runtime State Inventory

> Not applicable. Phase 32 is presentation-layer code changes only. No stored data, no live service config, no OS state, no secrets, no build artifacts that carry the changes externally.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by review of phase scope (CLI surface only) | — |
| Live service config | None — Commander.js is library-internal | — |
| OS-registered state | None — no hooks, tasks, or registrations touched | — |
| Secrets/env vars | None — no new env vars; existing `MEMORY_HOME` etc. unaffected | — |
| Build artifacts | None — `package.json` bin entry unchanged | — |

## Common Pitfalls

### Pitfall 1: Commander v14 global options NOT inherited by subcommands

**What goes wrong:** Naively, `program.option("--json", ...)` looks like it should make `--json` available on every subcommand. It does not. Subcommands have their own option namespace.
**Why it happens:** Commander's design separates parent and child option scopes. Friction subcommand already hit this — verbatim comment in `friction/index.ts:3`: *"Each subcommand defines --json independently (Commander.js does not inherit parent options)."*
**How to avoid:** Define `--json` per-command. Abstract the option-attachment via a helper if duplication grows:

```typescript
// helper in src/presentation/cli/options.ts
export function addQueryOutputOptions(cmd: Command): Command {
  return cmd
    .option("--json", "Output results as JSON")
    .addOption(
      new Option("--format <type>", "Output format")
        .choices(["brief", "ai"])
        .default("brief")
    );
}
```

**Warning signs:** Tests that pass `--json` at the program level but it's "missing" from `options` in the action callback.

### Pitfall 2: `--format default` exists today but is the implicit no-flag state

**What goes wrong:** Existing commands (search/list/show/stats) have `.choices(["default", "ai"]).default("default")`. The string literal `"default"` becomes a magic value scattered across formatters. After normalization to `brief|ai`, the no-flag state is no longer named — it's `undefined`. Code paths that check `options.format === "default"` silently break.
**Why it happens:** Confusion between the no-flag state (formatter chooses normal output) and a `--format default` explicit value.
**How to avoid:** Either (a) keep `default` as an allowed choice for backward compat (`choices: ["default", "brief", "ai"]` with no `.default()` set, so `undefined === default`), OR (b) explicit migration: remove `--format default` and update every `options.format === "default"` check to `!options.format || options.format === "brief"`.
**Warning signs:** Existing tests asserting `argChoices.toContain("default")`. Plan must include test migration.

### Pitfall 3: JSON output that's actually NDJSON or includes log lines

**What goes wrong:** Some commands emit info to `console.error` AND then `console.log` JSON. Consumers piping `cmd --json | jq` work fine (stderr is discarded). But `cmd --json > out.json` captures BOTH if not redirected, AND if any code path uses `console.log(...)` for a non-JSON line, the output becomes invalid JSON.
**Why it happens:** Mixed-mode emission (helpful TTY messaging like "Tip: run 'memory sync --embed'" in search.ts:359 — already correctly emits to `console.error`).
**How to avoid:** Audit each command. In `--json` mode, the contract is: stdout contains EXACTLY ONE JSON document. All advisory/progress messages go to stderr.
**Warning signs:** Tests that capture stdout and try to `JSON.parse` it should be load-bearing.

### Pitfall 4: `brief` for stats has no clear semantic

**What goes wrong:** `stats` doesn't have records to summarize; it's already a small dashboard. `--format brief` is meaningless unless defined.
**Why it happens:** The CLI-03 requirement says "where applicable" — `stats` may be N/A. But the test for CLI-03 must distinguish between "command supports format brief" and "command explicitly does not."
**How to avoid:** Document explicit applicability. Option A: `stats --format brief` = top-line counters only (e.g., `123 sessions, 45,678 messages, 12 projects`). Option B: `stats` doesn't accept `--format brief` and the command's `--format` option excludes it from `.choices()`. Pick A for uniformity. The brief output is just a stripped-down formatter.
**Warning signs:** Plan that adds `--format brief` to stats without saying what brief means.

### Pitfall 5: Bun's `command.options` introspection requires Command class shape

**What goes wrong:** Existing tests check `command.options.find((o) => o.long === "--json")`. This is Commander.js internal property; works because tests use the same Commander module. If a major version upgrade changes the field, tests break silently (they'd all pass `.toBeUndefined()`).
**Why it happens:** Tests rely on undocumented Commander internals.
**How to avoid:** Acceptable for now (existing pattern, stable in v14). Plan should add at least one black-box test per command: spawn the CLI as a subprocess, capture stdout, assert JSON shape. This proves the contract end-to-end.
**Warning signs:** All tests passing while users report `--json` doesn't work.

## Code Examples

### Example 1: Register grouped commands in index.ts

```typescript
// src/presentation/cli/index.ts (after Phase 32)
// Source: Commander.js Readme (verified via Context7) [CITED: github.com/tj/commander.js/blob/master/Readme.md#help-groups]

import { Command } from "commander";
import pkg from "../../../package.json";
import { isMigrationPending, migrateFromLegacy } from "../../infrastructure/migration.js";
import {
  createSyncCommand, createSearchCommand, createListCommand,
  createStatsCommand, createContextCommand, createRelatedCommand,
  createShowCommand, createBrowseCommand, createInstallCommand,
  createUninstallCommand, createStatusCommand, createDoctorCommand,
  createPurgeCommand, createCompletionCommand, createExportCommand,
  createImportCommand, createFrictionCommand, createBackfillCommand,
} from "./commands/index.js";

const program = new Command();

program
  .name("memory")
  .description("Cross-project context persistence for Claude Code sessions")
  .version(pkg.version);

// Query commands (CLI-02/CLI-03 apply to these six)
program.commandsGroup("Query Commands:");
program.addCommand(createSearchCommand());
program.addCommand(createContextCommand());
program.addCommand(createShowCommand());
program.addCommand(createListCommand());
program.addCommand(createRelatedCommand());
program.addCommand(createStatsCommand());

// Data commands
program.commandsGroup("Data Commands:");
program.addCommand(createSyncCommand());
program.addCommand(createBackfillCommand());
program.addCommand(createExportCommand());
program.addCommand(createImportCommand());
program.addCommand(createPurgeCommand());

// System commands
program.commandsGroup("System Commands:");
program.addCommand(createInstallCommand());
program.addCommand(createUninstallCommand());
program.addCommand(createStatusCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createCompletionCommand());
program.addCommand(createBrowseCommand());  // tentative — see Open Questions

// Feedback commands
program.commandsGroup("Feedback Commands:");
program.addCommand(createFrictionCommand());

export { program };

if (import.meta.main) {
  if (isMigrationPending()) migrateFromLegacy();
  program.parse();
}
```

### Example 2: Uniform JSON envelope emission in a command

```typescript
// Excerpt — refactored search.ts action path
import type { QueryResultEnvelope, QueryErrorEnvelope } from "../formatters/envelope.js";

// ... after fetching results ...

if (options.json) {
  const envelope: QueryResultEnvelope<SearchResultJson[]> = {
    schema_version: "1",
    command: "search",
    kind: "message",
    meta: {
      query,
      mode: searchMeta?.mode,
      mode_reason: searchMeta?.modeReason,
      total_results: results.length,
      embedding_coverage: searchMeta?.embeddingCoverage,
      degraded: searchMeta?.degraded,
      timing_ms: Math.round(endTime - startTime),
    },
    data: results.map(toJsonShape),
  };
  console.log(JSON.stringify(envelope, null, 2));
  return { exitCode: 0 };
}

// text path (default + --format brief|ai)
let output = formatter.formatResults(results, formatOptions);
if (options.format === "ai") output = formatForAi(output);
console.log(output);
return { exitCode: 0 };
```

### Example 3: Test asserting group registration (CLI-01)

```typescript
// tests/presentation/cli/help-groups.test.ts (NEW)
import { describe, expect, it } from "bun:test";
import { program } from "../../../src/presentation/cli/index.js";

describe("CLI help groups (CLI-01)", () => {
  it("emits help with Query / Data / System / Feedback group headings", () => {
    const helpText = program.helpInformation();
    expect(helpText).toContain("Query Commands:");
    expect(helpText).toContain("Data Commands:");
    expect(helpText).toContain("System Commands:");
    expect(helpText).toContain("Feedback Commands:");
  });

  it("places search under Query Commands", () => {
    const helpText = program.helpInformation();
    const queryIdx = helpText.indexOf("Query Commands:");
    const searchIdx = helpText.indexOf("search");
    const dataIdx = helpText.indexOf("Data Commands:");
    expect(searchIdx).toBeGreaterThan(queryIdx);
    expect(searchIdx).toBeLessThan(dataIdx);
  });

  it("places sync under Data Commands", () => {
    const helpText = program.helpInformation();
    const dataIdx = helpText.indexOf("Data Commands:");
    const syncIdx = helpText.indexOf("sync");
    const systemIdx = helpText.indexOf("System Commands:");
    expect(syncIdx).toBeGreaterThan(dataIdx);
    expect(syncIdx).toBeLessThan(systemIdx);
  });

  // Snapshot test for total help output
  it("matches expected help output snapshot", () => {
    expect(program.helpInformation()).toMatchSnapshot();
  });
});
```

### Example 4: Test asserting --json envelope shape (CLI-02)

```typescript
// tests/presentation/cli/commands/search.json.test.ts (NEW)
import { describe, expect, it } from "bun:test";
import { executeSearchCommand } from "../../../../src/presentation/cli/commands/search.js";

describe("search --json envelope (CLI-02)", () => {
  it("emits valid JSON to stdout", async () => {
    const capturedStdout: string[] = [];
    const log = console.log;
    console.log = (s: string) => capturedStdout.push(s);
    try {
      await executeSearchCommand("test", { json: true, limit: "5", dbPath: TEST_DB });
    } finally {
      console.log = log;
    }
    const output = capturedStdout.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed).toBeTypeOf("object");
  });

  it("envelope has required fields: schema_version, command, kind, data", async () => {
    const env = await captureJson(() =>
      executeSearchCommand("anything", { json: true, dbPath: TEST_DB })
    );
    expect(env.schema_version).toBe("1");
    expect(env.command).toBe("search");
    expect(env.kind).toBe("message");
    expect(Array.isArray(env.data)).toBe(true);
  });

  it("emits envelope-shaped error on failure (DB unavailable)", async () => {
    const env = await captureJson(() =>
      executeSearchCommand("x", { json: true, dbPath: "/non/existent/path.db" })
    );
    expect(env.error).toBeDefined();
    expect(env.error.code).toBeDefined();
    expect(env.error.message).toBeDefined();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom `helpInformation()` override for grouping | Native `.commandsGroup()` | Commander v14.0.0 (2025-05-18) | Use native; custom is unnecessary |
| Per-command JSON shapes (status quo in this codebase) | Single envelope with `kind`/`scope` | Phase 32 (this phase) | Enables Phase 32.5 unification |
| `--format default` as explicit value | Implicit text default; `--format` only for non-default modes | Phase 32 normalization | Removes magic string; aligns with industry CLIs |
| Errors to stderr always | Errors to stderr in text mode, stdout-as-JSON-envelope in `--json` mode | Phase 32 normalization | Consumers parse one stream when `--json` is set |

**Deprecated/outdated:**
- `--format detailed` choice on context/related — folded into `--format brief` (with `--verbose` as the existing toggle for detailed output). Verify migration in plan.
- Commander.js v13 and earlier (`addHelpCommand` → `helpCommand`) — N/A here since project is on v14.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `brief` is preferable to `detailed` as the named non-default format choice | Pattern 3, Open Q3 | If users have scripts depending on `--format detailed`, breaks them. Mitigation: keep `detailed` as alias OR plan a deprecation cycle. |
| A2 | `--json` always wins over `--format` when both are present | Pattern 3, Open Q4 | If a consumer expects `--json --format ai` to produce ANSI-stripped JSON-ish text, surprised. Mitigation: emit stderr warning. |
| A3 | `browse` belongs in System Commands (not Query Commands) since it's an interactive launcher | Example 1, Open Q1 | If discoverability of `browse` as a query-style entry suffers, users miss it. Mitigation: cross-reference in docs/help text. |
| A4 | `stats --format brief` semantically means "top-line counters only" (Option A) rather than removed (Option B) | Pitfall 4, Open Q5 | Plan picks the wrong option, requires rework. |
| A5 | Tests can `import { program }` from `index.ts` and call `.helpInformation()` without triggering `program.parse()` | Example 3 | If `import.meta.main` check fires during test load, tests crash. Mitigation: verify the export shape; refactor if needed. |

**If this table is empty:** N/A — these are reasonable defaults that the planner / discuss-phase should ratify before execution.

## Open Questions

1. **Where does `browse` belong?**
   - What we know: `browse` is interactive (launches a picker UI); calls into search/show/context/related (browse.ts:17-19). It is TTY-gated.
   - What's unclear: Is browse a Query Command (semantically: explore content) or a System Command (operationally: a launcher)?
   - Recommendation: System Commands (it's a launcher, not a queryable surface). Document in help text.

2. **Should `--json` be a no-op or override `--format`?**
   - What we know: Industry pattern (gh, kubectl) is "one machine format wins."
   - What's unclear: Silent override or stderr warning?
   - Recommendation: `--json` silently overrides `--format`. Document in `--help` text on each command.

3. **Keep `--format detailed` (context, related) as alias or remove?**
   - What we know: It currently exists on context and related; not on search/list/show/stats.
   - What's unclear: Whether any docs/users depend on it.
   - Recommendation: Keep as alias for one minor version (`brief|detailed|ai` where `detailed` maps to brief — temporarily); plan a Phase 32.5 or later removal with CHANGELOG entry. Strict normalization is `brief|ai`.

4. **`--format` default value: explicit or implicit?**
   - What we know: Current pattern is `.default("default")` or `.default("brief")`.
   - What's unclear: After normalization, is no flag = brief, or no flag = full text and brief is a flag-only mode?
   - Recommendation: No flag = current full text (no formatter post-processing). `--format brief` = strip to single-line. `--format ai` = `formatForAi(text)`. Don't set `.default()` — `undefined` means "default text."

5. **`stats --format brief`: implement or exclude?**
   - What we know: `stats` has no record list to summarize.
   - What's unclear: Does CLI-03 "where applicable" mean stats can opt out?
   - Recommendation: Implement (Option A from Pitfall 4) — `stats --format brief` returns one-line `<count> sessions, <count> messages, <count> projects`. Consistent surface > one-off exclusion.

6. **`schema_version` in envelope: hard-coded "1" or pull from package.json?**
   - What we know: Envelope schema is independent of package version.
   - What's unclear: Bump policy.
   - Recommendation: Hard-code "1" as a constant in `envelope.ts`. Bump only on breaking shape changes. Document the bump policy in envelope.ts top comment.

7. **Should `friction` Feedback Commands also adopt `--format brief|ai` and the envelope?**
   - What we know: Phase 32 requirements (CLI-01/02/03) target query commands. `friction` is its own group.
   - What's unclear: Whether normalizing friction's `--format` (currently `default|ai`) is in or out of scope.
   - Recommendation: OUT of Phase 32 scope; friction sub-surface is its own arc (post-Phase-30 internal coherence per audit §14.A). Document in plan as deferred.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 20 | Commander v14 engines | ✓ (project uses Bun, which supports Node 20+ APIs) | Bun 1.x | — |
| Commander.js v14 | All CLI commands | ✓ (in package.json `^14.0.2`, resolves to 14.0.3) | 14.0.3 | — |
| bun:test | Test framework | ✓ | bundled | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> Phase 32 is presentation-layer; validation strategy emphasizes contract tests (help output, JSON shape, format mode) rather than infrastructure setup.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (bundled with Bun 1.x) |
| Config file | `bunfig.toml` (coverage thresholds at 95% per metric) |
| Quick run command | `bun test src/presentation/cli` |
| Full suite command | `bun test` |
| Coverage command | `bun test --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | `memory --help` includes "Query Commands:" heading | unit (Command introspection) | `bun test src/presentation/cli/index.test.ts -t "Query Commands"` | ❌ Wave 0 (new file) |
| CLI-01 | `memory --help` includes "Data Commands:" heading | unit | same file | ❌ Wave 0 |
| CLI-01 | `memory --help` includes "System Commands:" heading | unit | same file | ❌ Wave 0 |
| CLI-01 | `memory --help` includes "Feedback Commands:" heading | unit | same file | ❌ Wave 0 |
| CLI-01 | `search` appears between "Query Commands:" and "Data Commands:" headings | unit | same file | ❌ Wave 0 |
| CLI-01 | `sync` appears between "Data Commands:" and "System Commands:" headings | unit | same file | ❌ Wave 0 |
| CLI-01 | `friction` appears under "Feedback Commands:" | unit | same file | ❌ Wave 0 |
| CLI-01 | Help snapshot stability (regression guard) | snapshot | same file | ❌ Wave 0 |
| CLI-02 | `search --json` emits valid JSON to stdout | integration (capture stdout, JSON.parse) | `bun test tests/presentation/cli/commands/search.json.test.ts` | ❌ Wave 0 (extend search.test.ts OR new file) |
| CLI-02 | `search --json` envelope has `schema_version`, `command`, `kind`, `data` fields | integration | same file | ❌ Wave 0 |
| CLI-02 | `context --json` envelope has uniform shape | integration | `tests/presentation/cli/commands/context.json.test.ts` | ❌ Wave 0 |
| CLI-02 | `show --json` envelope has uniform shape | integration | `tests/presentation/cli/commands/show.json.test.ts` | ❌ Wave 0 |
| CLI-02 | `list --json` envelope has uniform shape | integration | `tests/presentation/cli/commands/list.json.test.ts` | ❌ Wave 0 |
| CLI-02 | `related --json` envelope has uniform shape | integration | `tests/presentation/cli/commands/related.json.test.ts` | ❌ Wave 0 |
| CLI-02 | `stats --json` envelope has uniform shape | integration | `tests/presentation/cli/commands/stats.json.test.ts` | ❌ Wave 0 |
| CLI-02 | Error path: JSON envelope with `error.code`, `error.message` on stdout when `--json` set | integration | each `.json.test.ts` | ❌ Wave 0 |
| CLI-02 | Error path: human-readable to stderr when `--json` NOT set | integration | each `.json.test.ts` | ❌ Wave 0 |
| CLI-02 | Empty result: envelope with `data: []` and exitCode 0 (not error) | integration | each `.json.test.ts` | ❌ Wave 0 |
| CLI-03 | `search --format brief` emits single-line-per-record | unit (formatter test) | `bun test src/presentation/cli/formatters/output-formatter.test.ts` | ✅ existing (extend) |
| CLI-03 | `search --format ai` strips ANSI (validates `formatForAi` chain) | unit | `bun test src/presentation/cli/formatters/ai-formatter.test.ts` | ✅ existing (extend) |
| CLI-03 | Every query command (`search`, `context`, `show`, `list`, `related`, `stats`) has `--format` option with `brief` choice | unit | per-command `.test.ts` (extend existing) | ✅ existing (extend) |
| CLI-03 | `--json --format ai` together: `--json` wins, no `formatForAi()` applied | integration | each `.json.test.ts` | ❌ Wave 0 |
| CLI-03 | Inapplicable case: `stats --format brief` returns top-line summary (not error) | integration | `stats.json.test.ts` + `stats.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test src/presentation/cli` (fast — ~5s, covers all CLI files)
- **Per wave merge:** `bun test` (full suite, ~30s) + `bun test:isolation` (gate at 0 violations)
- **Phase gate:** Full suite green; coverage at 95%+ each metric; isolation gate at 0; `/gsd-verify-work` runs

### Wave 0 Gaps

The following test files don't exist yet and must be created in Wave 0 of execution:

- [ ] `tests/presentation/cli/help-groups.test.ts` (or `src/presentation/cli/help-groups.test.ts`) — covers CLI-01 group headings, command-to-group placement, help snapshot
- [ ] `tests/presentation/cli/commands/search.json.test.ts` — covers CLI-02 envelope shape + error path for search
- [ ] `tests/presentation/cli/commands/context.json.test.ts` — same for context
- [ ] `tests/presentation/cli/commands/show.json.test.ts` — same for show
- [ ] `tests/presentation/cli/commands/list.json.test.ts` — same for list
- [ ] `tests/presentation/cli/commands/related.json.test.ts` — same for related
- [ ] `tests/presentation/cli/commands/stats.json.test.ts` — same for stats
- [ ] `src/presentation/cli/formatters/envelope.ts` + `envelope.test.ts` — type definitions + helpers + tests
- [ ] Extensions to existing per-command `.test.ts` files for `--format brief` option introspection

No framework install needed; bun:test is bundled.

### Edge Cases Per Requirement

**CLI-01 edge cases:**
- Empty group (no commands assigned) — should the group heading appear? Commander v14 does not render empty groups (verified pattern). Test: `.commandsGroup("Empty:")` with no subsequent `.addCommand()` does not appear in `helpInformation()`.
- Command with no group assignment — falls under default "Commands:" heading. Verify test: all 19 commands are assigned to one of 4 groups; no command leaks to default.
- Group order stability — order of `.commandsGroup()` calls determines display order. Test: snapshot ensures Query before Data before System before Feedback.

**CLI-02 edge cases:**
- Empty results — envelope `data: []` (or `data: {}` for stats), exitCode 0.
- DB error before any results — envelope shape switches to `{ schema_version, command, error: { code, message } }`, exitCode 1, written to stdout.
- Very large result set — `JSON.stringify(envelope, null, 2)` works; existing CONTEXT_BUDGET (50K char) handling preserved or removed (decide in plan).
- Special characters in snippets — JSON.stringify handles escaping; verify no double-escaping.

**CLI-03 edge cases:**
- `--format brief` on stats — top-line counters as described in Pitfall 4 Option A. Test: brief output is fewer than N lines (e.g., 3).
- `--format ai` on every command — `formatForAi(text)` post-processing. Test: output contains no ANSI codes (regex match).
- `--format brief` + `--quiet` — quiet wins or brief wins? Recommendation: quiet ≥ brief (quiet is the more aggressive trim). Document precedence.
- `--format <invalid>` — Commander rejects with `error: option '--format <type>' argument '<invalid>' is invalid. Allowed choices are brief, ai.` (Commander default behavior; no custom handling needed).

## Security Domain

> Phase 32 is presentation-layer flag plumbing. Surface area is limited.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (CLI is local; no auth) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Commander's `.choices()` validates `--format` values; argument types are typed via Commander Option |
| V6 Cryptography | no | — |

### Known Threat Patterns for {CLI tool, local-only}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted query string injected into JSON output (e.g., to break downstream parser) | Tampering | `JSON.stringify()` correctly escapes — no manual string concatenation; already canonical via search.ts |
| Error context leaking sensitive paths in JSON envelope | Information Disclosure | `formatErrorJson()` already serializes `error.context`; verify no env-var paths or secrets leak. Audit per existing `MemoryError.context` shape (typically holds path/file info — acceptable for local tool) |
| Snapshot test capturing user-specific output (e.g., username in dbPath) | Information Disclosure | Snapshots must use TEST_DB path and stable fixtures; never snapshot system-dependent output |

## Sources

### Primary (HIGH confidence)
- **Context7: `/tj/commander.js`** — Help Groups Configuration, `.commandsGroup()`, `.optionsGroup()`, `.helpGroup()`, `.configureHelp()` documentation [VERIFIED: Context7 query, 2026-05-14]
- **npm registry: `commander`** — version 14.0.3, engines `{ node: '>=20' }`, time.modified 2026-05-12 [VERIFIED: `npm view commander`]
- **Commander.js CHANGELOG v14.0.0** — `commandsGroup`/`optionsGroup`/`helpGroup` introduced 2025-05-18 [CITED: github.com/tj/commander.js/blob/master/CHANGELOG.md]
- **Codebase grep:** existing `--format`, `--json` patterns, formatter shapes (search.ts:140-159, context.ts:83, friction/index.ts:26, output-formatter.ts:217-304) [VERIFIED: this session]
- **Audit doc §21 (LOCKED 2026-05-13):** Phase 32.5 acceptance criteria — unified query primitive with shape flags `--scope`, `--kind`, `--mode` [CITED: docs/audits/2026-05-11-architecture-first-principles-audit.md:776-781]
- **REQUIREMENTS.md:** CLI-01, CLI-02, CLI-03 verbatim definitions [CITED: .planning/REQUIREMENTS.md:30-32]

### Secondary (MEDIUM confidence)
- **CLI Style Guide (Heroku Dev Center)** — stdout/stderr conventions, `--json` flag patterns [CITED: devcenter.heroku.com/articles/cli-style-guide]
- **clig.dev** — Command Line Interface Guidelines for machine-readable output [CITED: clig.dev]
- **GitHub CLI `--json` behavior** — array-of-objects envelope for list-style output; field selection [CITED: cli.github.com/manual/gh_help_formatting]
- **kubectl `-o json`** — `{ kind, apiVersion, metadata, items[] }` envelope pattern [CITED: kubernetes.io/docs/reference/kubectl/jsonpath/]

### Tertiary (LOW confidence)
- None. All findings cross-verified against primary or secondary sources.

## Project Constraints (from CLAUDE.md)

- **TDD workflow** RED-GREEN-REFACTOR (`rules/tdd-workflow.md`) — tests first
- **Coverage** ≥ 95% at EACH metric individually (statements, branches, functions, lines) — bunfig.toml enforces; CI gates
- **Hexagonal architecture** — Phase 32 is pure presentation; no domain or application layer changes
- **SOLID** — Open/closed: envelope.ts is a new file (no modification of existing types); Single Responsibility: each formatter still handles one mode
- **Git author** `Chude <chude@emeke.org>` — no AI attribution, no emojis
- **AI-First design** — `--json` and `--format ai` are load-bearing for Claude consuming output via Bash
- **bun over npm** — `bun test`, `bun add`; bunfig.toml is source of truth for test config
- **No documentation .md files unless asked** — RESEARCH.md and PLAN.md are explicitly requested by the GSD workflow
- **AskUserQuestion tool** — N/A for research phase; planner may use during discuss-phase

## Phase 32.5 Convergence Notes (load-bearing)

Per audit §21 (Phase 32.5 acceptance), the unified query primitive will accept `--scope`, `--kind`, `--mode` flags and route the 5 read surfaces (search/context/related/list/show) through one entry point. Phase 32 prepares for this by:

1. **Envelope `kind` field** — Phase 32.5 will set this from a CLI flag; Phase 32 sets it from the command name. No type change needed.
2. **Envelope `scope` field reserved** — Phase 32 leaves it `undefined` when no project filter; Phase 32.5 populates it.
3. **Envelope `meta` is per-command** — Phase 32.5 will normalize across the unified primitive. Phase 32 collects what each surface emits today; Phase 32.5 reconciles.
4. **`--format brief|ai` unified across the 6 commands** — Phase 32.5 may add a third `shape` mode if the unified primitive needs richer differentiation; brief/ai is the floor.

**What Phase 32 MUST NOT do:** Move to a "single command with kind flag" architecture (that's Phase 32.5's job). Phase 32 stays surgical — 6 commands stay 6 commands, just with consistent flags and envelope.

## Metadata

**Confidence breakdown:**
- Standard stack (Commander.js v14): HIGH — Context7 + npm registry + CHANGELOG verified
- Architecture patterns: HIGH — codebase patterns grep-confirmed
- Pitfalls: HIGH — derived from existing code (friction comment about parent-option inheritance, existing format inconsistencies)
- Phase 32.5 convergence: HIGH — audit §21 quoted verbatim
- Open questions: MEDIUM — these are real design choices requiring user/planner ratification
- Test plan: HIGH — bun:test patterns confirmed in existing test files

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (~30 days; Commander.js v14 is stable, npm version unlikely to break; if v15 ships before then, re-verify `.commandsGroup` API)

## Sources Verified This Session

- [Commander.js Help Groups](https://github.com/tj/commander.js/blob/master/Readme.md) — `.commandsGroup()`, `.optionsGroup()`, `.helpGroup()` API
- [Commander.js v14.0.0 CHANGELOG](https://github.com/tj/commander.js/blob/master/CHANGELOG.md) — feature introduction date 2025-05-18, Node 20+ requirement
- [GitHub CLI JSON output formatting](https://cli.github.com/manual/gh_help_formatting) — array-of-objects envelope
- [Kubectl JSONPath / `-o json`](https://kubernetes.io/docs/reference/kubectl/jsonpath/) — kind/apiVersion/items envelope pattern
- [Heroku CLI Style Guide](https://devcenter.heroku.com/articles/cli-style-guide) — `--json` and `--terse` flag conventions
- [clig.dev — Command Line Interface Guidelines](https://clig.dev/) — stdout/stderr separation; machine-readable output

## RESEARCH COMPLETE
