# Phase 7: Filtering and Output Formatting - Research

**Researched:** 2026-01-29
**Domain:** CLI argument parsing, date parsing, output formatting
**Confidence:** HIGH

## Summary

This phase adds filtering capabilities (project, time range, role, session) to the search command and standardizes output formatting across all commands. The project already has a solid foundation with Commander.js v14 and established patterns in the sync and search commands.

Key research areas:
1. **Date parsing:** chrono-node provides natural language parsing ("yesterday", "2 weeks ago")
2. **Relative time display:** Built-in `Intl.RelativeTimeFormat` handles "2 days ago" style output
3. **Commander.js patterns:** `.conflicts()` for mutually exclusive options, `argParser` for custom parsing
4. **Output consistency:** TTY detection pattern already established in progress-reporter.ts

**Primary recommendation:** Use chrono-node for flexible date input parsing, Intl.RelativeTimeFormat for relative time output, and Commander.js's built-in `.conflicts()` method for mutually exclusive options (--verbose vs --quiet).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.2 | CLI framework | Already in use; has `.conflicts()`, `argParser()` features |
| chrono-node | ^2.9.0 | Natural language date parsing | Industry standard; TypeScript support; 5k+ GitHub stars |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intl.RelativeTimeFormat | Built-in | Relative time formatting | Display "2 days ago" style timestamps |
| process.stdout.isTTY | Built-in | TTY detection | Color/decoration decisions |
| process.stdout.hasColors | Built-in | Color capability detection | ANSI color output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrono-node | dayjs | dayjs is smaller (6kb) but no natural language parsing |
| chrono-node | @nrk/simple-date-parse | Smaller (1.3kb) but no "yesterday"/"2 weeks ago" support |
| chrono-node | date-fns | Faster but no natural language parsing |
| commander-completion-carapace | Manual scripts | Carapace requires external dep; manual is more portable |

**Installation:**
```bash
bun add chrono-node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── presentation/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── search.ts       # Extended with filter options
│   │   │   └── sync.ts         # Extended with verbose/quiet
│   │   ├── formatters/
│   │   │   ├── output-formatter.ts    # Unified output formatting
│   │   │   ├── timestamp-formatter.ts # Relative + absolute time
│   │   │   └── snippet-formatter.ts   # Smart snippet extraction
│   │   └── parsers/
│   │       └── date-parser.ts  # chrono-node wrapper with validation
│   └── index.ts
├── domain/
│   └── value-objects/
│       └── search-options.ts   # Extended filter options
└── infrastructure/
    └── database/
        └── services/
            └── search-service.ts  # Extended with filter SQL
```

### Pattern 1: Filter Options Object
**What:** Centralized filter configuration passed through layers
**When to use:** Applying multiple optional filters that combine with AND logic
**Example:**
```typescript
// Source: Existing SearchOptions in domain/ports/services.ts
interface FilterOptions {
  limit?: number;
  projectFilter?: ProjectPath;
  roleFilter?: MessageRole | MessageRole[];  // Extended for multiple
  sinceDate?: Date;
  beforeDate?: Date;
  sessionFilter?: string;
}
```

### Pattern 2: Date Parser Wrapper
**What:** Thin wrapper around chrono-node with error handling
**When to use:** Parsing CLI date arguments with validation
**Example:**
```typescript
// Source: chrono-node documentation
import * as chrono from "chrono-node";

export function parseDate(input: string, referenceDate?: Date): Date {
  const result = chrono.parseDate(input, referenceDate ?? new Date());
  if (!result) {
    throw new Error(`Invalid date format: "${input}". Examples: "yesterday", "2 weeks ago", "2026-01-15"`);
  }
  return result;
}

// Usage:
parseDate("yesterday");        // Returns yesterday's date
parseDate("2 weeks ago");      // Returns date 2 weeks ago
parseDate("2026-01-15");       // Returns ISO date
```

### Pattern 3: Output Mode Strategy
**What:** Different output formatters selected by mode
**When to use:** Supporting --json, --quiet, --verbose modes
**Example:**
```typescript
// Source: Existing progress-reporter.ts pattern
interface OutputFormatter {
  formatResults(results: SearchResult[], options: FormatOptions): string;
  formatError(error: Error): string;
  formatSummary(stats: SearchStats): string;
}

function createOutputFormatter(options: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}): OutputFormatter {
  if (options.json) return new JsonOutputFormatter();
  if (options.quiet) return new QuietOutputFormatter();
  if (options.verbose) return new VerboseOutputFormatter();
  return new DefaultOutputFormatter();
}
```

### Pattern 4: Commander.js Conflicts
**What:** Mutually exclusive options enforced at parse time
**When to use:** Options that cannot be used together
**Example:**
```typescript
// Source: Commander.js examples/options-conflicts.js
import { Command, Option } from "commander";

new Command("search")
  .addOption(
    new Option("-v, --verbose", "Show detailed output")
      .conflicts("quiet")
  )
  .addOption(
    new Option("-q, --quiet", "Suppress decorations")
      .conflicts("verbose")
  )
  .addOption(
    new Option("--days <n>", "Filter by days")
      .conflicts(["since", "before"])
  );
```

### Pattern 5: Relative Time Formatting
**What:** Display relative + absolute timestamps
**When to use:** Human-readable timestamps in results
**Example:**
```typescript
// Source: MDN Intl.RelativeTimeFormat documentation
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return rtf.format(diffMinutes, "minute");
    }
    return rtf.format(diffHours, "hour");
  }
  if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, "day");
  }
  if (Math.abs(diffDays) < 30) {
    return rtf.format(Math.floor(diffDays / 7), "week");
  }
  return rtf.format(Math.floor(diffDays / 30), "month");
}

// Output: "2 days ago", "yesterday", "last week"
```

### Anti-Patterns to Avoid
- **Parsing dates in SQL:** Don't rely on SQLite date parsing; parse in application layer with chrono-node
- **Hardcoded color codes without TTY check:** Always check `process.stdout.isTTY` before ANSI codes
- **Mixing output modes:** Don't mix --json with --verbose; pick one formatter
- **parseInt without explicit radix:** Use `parseInt(val, 10)` or `parseFloat` with Commander argParser

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Natural language dates | Regex-based "yesterday" parser | chrono-node | Handles "2 weeks ago", "last Friday", timezone edge cases |
| Relative time display | Custom "X days ago" formatter | Intl.RelativeTimeFormat | Handles localization, edge cases like "yesterday" vs "1 day ago" |
| Option conflicts | Manual `if (opts.a && opts.b)` checks | Commander.js `.conflicts()` | Cleaner API, better error messages |
| TTY color detection | Environment variable checks | process.stdout.isTTY + hasColors() | Standard Node.js API, handles piped output correctly |
| Date arithmetic | Manual millisecond calculations | chrono-node or built-in Date methods | Avoids DST bugs, leap year issues |

**Key insight:** Date/time handling has many edge cases (timezones, DST, localization). Using established libraries prevents subtle bugs that would only surface in specific conditions.

## Common Pitfalls

### Pitfall 1: Days Filter Off-by-One
**What goes wrong:** `--days 7` excludes today or includes an extra day
**Why it happens:** Unclear boundary definition (midnight calculations, timezone)
**How to avoid:** Define clearly: --days 7 = today + previous 6 days. Set `sinceDate` to start of today minus 6 days.
**Warning signs:** Different results depending on when command is run

### Pitfall 2: Commander parseInt with Default
**What goes wrong:** `parseInt` as argParser with default value causes NaN
**Why it happens:** Commander passes default as second argument (radix) to parseInt
**How to avoid:** Use wrapper: `(val) => parseInt(val, 10)` or use `parseFloat`
**Warning signs:** Random NaN values when combining --limit with defaults

### Pitfall 3: Color Output in Pipes
**What goes wrong:** ANSI escape codes appear as garbage in piped output
**Why it happens:** No TTY detection before emitting escape codes
**How to avoid:** Always check `process.stdout.isTTY` before using color
**Warning signs:** `memory search "query" | grep something` shows escape codes

### Pitfall 4: Filter Combination Explosion
**What goes wrong:** Complex SQL joins become slow or incorrect
**Why it happens:** Adding filters without considering query plan
**How to avoid:** Build SQL dynamically with only needed JOINs; use EXPLAIN QUERY PLAN
**Warning signs:** Search slows dramatically with multiple filters

### Pitfall 5: Context Window Overflow
**What goes wrong:** Output exceeds Claude's context window
**Why it happens:** No limit on total output size, only result count
**How to avoid:** Implement character budget (~50K chars); truncate results when budget exceeded
**Warning signs:** "Context too long" errors when Claude uses search results

### Pitfall 6: chrono-node Reference Date
**What goes wrong:** "yesterday" returns wrong date in different timezones
**Why it happens:** chrono-node uses system locale; reference date not specified
**How to avoid:** Always pass explicit reference date: `chrono.parseDate(input, new Date())`
**Warning signs:** CI tests fail in different timezone than dev machine

## Code Examples

Verified patterns from official sources:

### Date Parsing with chrono-node
```typescript
// Source: chrono-node GitHub documentation
import * as chrono from "chrono-node";

// Basic parsing
chrono.parseDate("yesterday");                    // Date for yesterday
chrono.parseDate("2 weeks ago");                  // Date 2 weeks back
chrono.parseDate("last Friday");                  // Previous Friday
chrono.parseDate("2026-01-15");                   // Specific date

// With reference date (for consistent results)
const referenceDate = new Date("2026-01-29");
chrono.parseDate("yesterday", referenceDate);     // 2026-01-28
chrono.parseDate("next week", referenceDate);     // 2026-02-05
```

### Commander.js Custom Option Parsing
```typescript
// Source: Commander.js documentation and examples
import { Command, Option } from "commander";

const program = new Command()
  .addOption(
    new Option("-l, --limit <count>", "Maximum results")
      .default(10)
      .argParser((val) => {
        const n = parseInt(val, 10);
        if (isNaN(n) || n < 1) {
          throw new Error("Limit must be a positive number");
        }
        return n;
      })
  )
  .addOption(
    new Option("--since <date>", "Filter messages after this date")
      .argParser((val) => {
        const date = chrono.parseDate(val);
        if (!date) throw new Error(`Invalid date: ${val}`);
        return date;
      })
  )
  .addOption(
    new Option("--days <n>", "Filter by recent days")
      .conflicts(["since", "before"])
      .argParser((val) => parseInt(val, 10))
  );
```

### Relative Time Formatting
```typescript
// Source: MDN Web Docs Intl.RelativeTimeFormat
const rtf = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",  // "yesterday" instead of "1 day ago"
  style: "long"     // "2 days ago" not "2d ago"
});

// Helper to auto-select unit
function formatRelative(date: Date, reference = new Date()): string {
  const diffMs = date.getTime() - reference.getTime();
  const absDiffMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (absDiffMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absDiffMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (absDiffMs < week) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  if (absDiffMs < month) {
    return rtf.format(Math.round(diffMs / week), "week");
  }
  return rtf.format(Math.round(diffMs / month), "month");
}
```

### TTY Detection for Color Output
```typescript
// Source: Node.js TTY documentation
function shouldUseColor(): boolean {
  // Explicit disable
  if (process.env.NO_COLOR) return false;

  // Explicit enable
  if (process.env.FORCE_COLOR) return true;

  // Auto-detect
  return process.stdout.isTTY === true;
}

function colorize(text: string, code: string): string {
  if (!shouldUseColor()) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

// ANSI codes
const bold = (text: string) => colorize(text, "1");
const dim = (text: string) => colorize(text, "2");
const green = (text: string) => colorize(text, "32");
const red = (text: string) => colorize(text, "31");
```

### Context-Sized Output Limiting
```typescript
// Source: CONTEXT.md decision - 50K character budget
const CONTEXT_BUDGET = 50_000;

function formatResultsWithBudget(
  results: SearchResult[],
  budget = CONTEXT_BUDGET
): { output: string; truncated: boolean } {
  let output = "";
  let truncated = false;

  for (const result of results) {
    const formatted = formatResult(result);
    if (output.length + formatted.length > budget) {
      truncated = true;
      break;
    }
    output += formatted;
  }

  return { output, truncated };
}
```

### Snippet Extraction with Ellipsis
```typescript
// Source: CONTEXT.md decision - ~100 chars around match
function extractSnippet(
  content: string,
  match: string,
  contextChars = 50
): string {
  const matchIndex = content.toLowerCase().indexOf(match.toLowerCase());
  if (matchIndex === -1) return content.slice(0, 100) + "...";

  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(content.length, matchIndex + match.length + contextChars);

  let snippet = content.slice(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| moment.js for dates | dayjs / date-fns / chrono-node | 2020+ | moment.js deprecated; chrono-node for NL parsing |
| Custom relative time | Intl.RelativeTimeFormat | ES2020 | Built-in API, no dependencies |
| Terminal color libs | Built-in ANSI + TTY detection | Always available | Reduce dependencies |
| Commander v9 conflicts workaround | Commander v10+ `.conflicts()` | 2022 | Native API for mutual exclusion |

**Deprecated/outdated:**
- moment.js: Deprecated, use chrono-node for NL parsing or dayjs/date-fns for manipulation
- Manual TTY color detection: Use `process.stdout.isTTY` and `hasColors()` instead

## Open Questions

Things that couldn't be fully resolved:

1. **chrono-node Bundle Size**
   - What we know: Around 75-80KB minified (estimated from training data)
   - What's unclear: Exact current size for v2.9.0
   - Recommendation: Accept the size; NL date parsing is a core requirement. Verify with `bun build --minify` after installation.

2. **Shell Completion Strategy**
   - What we know: commander-completion-carapace is comprehensive but requires Carapace external dep
   - What's unclear: Whether to implement completion in this phase or defer
   - Recommendation: Defer to Phase 12 or later; basic CLI works without completion

3. **FTS5 Filter Performance at Scale**
   - What we know: FTS5 is fast; project/role filters add JOINs
   - What's unclear: Performance with 10K+ messages and multiple filters
   - Recommendation: Build with dynamic SQL; add performance tests; optimize if needed

## Sources

### Primary (HIGH confidence)
- Commander.js v14 - options-conflicts.js example, README documentation
- MDN Intl.RelativeTimeFormat - Built-in JavaScript API
- Node.js TTY documentation - process.stdout.isTTY, hasColors()

### Secondary (MEDIUM confidence)
- chrono-node GitHub/npm - TypeScript support, API verified but bundle size estimated
- Better Stack Commander.js Guide - argParser patterns
- Various CLI best practice articles - Ellipsis handling, POSIX conventions

### Tertiary (LOW confidence)
- Bundle size estimates for chrono-node (verify after installation)
- Shell completion library ecosystem (deferred from this phase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Commander.js already in use, chrono-node widely adopted
- Architecture: HIGH - Patterns extend existing codebase patterns
- Pitfalls: HIGH - Based on official documentation and established edge cases

**Research date:** 2026-01-29
**Valid until:** ~60 days (stable libraries, well-established patterns)
