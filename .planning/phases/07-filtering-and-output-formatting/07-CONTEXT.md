# Phase 7: Filtering and Output Formatting - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add filtering options to search and list commands, and standardize output formatting across all memory-nexus commands. This includes project/time/role filters, verbose/quiet modes, and consistent output structure.

New commands (list, stats, show) are NOT in scope — those are Phase 8 and Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Filter Syntax & Behavior

**Project filter (--project, -p)**
- Exact match only ("wow-system" matches "wow-system", not "wow-system-v2")
- Uses decoded project name, not encoded directory path
- Available on: search, (future: list, stats)

**Time filters (--since, --before, --days)**
- Flexible date parsing: accept ISO dates ("2026-01-15"), relative ("yesterday", "2 weeks ago")
- --days includes today (--days 7 = today + past 6 days)
- --since/--before and --days are mutually exclusive by industry convention; if genuinely ambiguous, allow combination (intersection logic)
- Fail fast on invalid date values with clear error and format examples

**Role filter (--role)**
- Values: user, assistant, all (default: all)
- Comma-separated for multiple: --role user,assistant
- Industry standard pattern (matches ripgrep --type syntax)

**Session filter (--session, -s)**
- Filter results to specific session by ID
- Useful for targeted retrieval within a known session

**Filter combination**
- AND logic: --project wow --days 7 --role assistant = must match ALL conditions
- No explicit --and/--or operators

**No matches behavior**
- Suggestion mode: "No results. Did you mean: wow-system? (3 sessions)"
- Help user discover correct filter values

**Filter scope per command**
- Per-command relevance, not universal
- search: all filters (project, time, role, session, limit)
- sync: project, session, force, quiet, verbose
- (future) list: project, days
- (future) stats: project

### Output Structure

**Result grouping**
- Flat list by BM25 relevance score — most relevant first
- No grouping by session or project in default view

**Content truncation**
- Smart snippet centered on matched text
- ~100 chars around match with ... ellipsis on both sides
- Apple/Anthropic pattern: show context around the relevant content

**Result metadata (essential only)**
- Score (as percentage), session ID (truncated to 8 chars), timestamp, project name
- Full metadata available in --json output

**Context-size limit**
- Default ~50K characters to fit comfortably in Claude's context
- Not configurable in this phase (YAGNI)

**JSON output (--json, -j)**
- Comprehensive: includes all available fields
- Programmatic consumers want full data
- Structure: array of result objects with sessionId, messageId, content, snippet, score, timestamp, project, role

### Verbose/Quiet Modes

**--verbose, -v**
- Shows query execution details: filters applied, sessions scanned, time taken, FTS5 query
- Shows full content instead of snippets
- Both insights combined

**--quiet, -q**
- Suppresses headers and decoration only
- Results still output (for piping)
- No banners, separators, or summary lines

**Mode conflict**
- --verbose and --quiet are mutually exclusive
- Error if both specified

**Default mode**
- Sensible defaults, no config file
- Normal output by default, flags override per-command

### Cross-Command Consistency

**Unified short flags**
- -q (quiet), -v (verbose), -j (json), -l (limit), -p (project), -s (session)
- Same meaning across all commands

**Error format**
- Structured prefix: "Error: <message>"
- Optional hint on next line
- stderr for errors, stdout for results

**Output header**
- Minimal context line: command, active filters, result count
- Then results

**Timestamp display**
- Relative + absolute: "2 days ago (2026-01-27 14:30)"
- Quick scan + precision available

**Summary line**
- Yes, at end of output: "Found 15 results (showing 10)"
- Sync: "Synced 5 sessions (3 new, 2 updated)"

**Color output**
- Auto-detect TTY: colors in terminal, plain when piped
- Standard Unix behavior

**Exit codes**
- 0 = success
- 1 = user error (bad arguments, invalid filter)
- 2 = runtime error (database, file system)
- 3+ = specific errors (reserved)

**Help text**
- POSIX standard format
- Usage: command [options] <args>
- Description, then Options list

**Version flag**
- -V, --version at root command level
- Standard POSIX convention

**Dry run**
- --dry-run for sync --force
- Show what would be done without doing it

**Shell completion**
- memory completion bash/zsh/fish outputs completion script
- Via Commander.js built-in support

### Claude's Discretion

- Exact flexible date parsing library choice (dayjs, date-fns, or built-in)
- Snippet extraction algorithm details
- Completion script implementation details
- Specific error message wording

</decisions>

<specifics>
## Specific Ideas

**Design philosophy basis:**
- Apple Human Interface Guidelines: progressive disclosure, sensible defaults, consistency
- Anthropic patterns from Claude Code: --quiet for hooks, --json for programmatic use
- Unix conventions: auto-detect TTY, exit codes, POSIX help format

**Reference patterns:**
- ripgrep: comma-separated --type values, auto-color
- git: short/long flag consistency, structured errors
- Claude Code: --quiet suppresses decoration, --json for full data

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

Note: list/stats/show commands mentioned as filter targets are Phase 8 and Phase 11.

</deferred>

---

*Phase: 07-filtering-and-output-formatting*
*Context gathered: 2026-01-29*
