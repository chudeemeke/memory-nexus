# CLI Surface Design Patterns for Developer Tools

**Domain:** CLI UX for data + intelligence tools
**Researched:** 2026-04-02
**Overall confidence:** HIGH (patterns verified across 10+ production CLIs)

## Executive Summary

Modern developer CLIs converge on a set of structural patterns for managing complexity. The research covers `gh`, `docker`, `kubectl`, `cargo`, `nix`, `brew`, `ollama`, `just`, `sgpt`, `aider`, and GitHub Copilot CLI, plus the clig.dev and Nix CLI guidelines. The findings directly address the problems identified in `@chude/memory`'s current 18-command surface.

The central insight: **the number of commands is not the problem -- the lack of grouping is.** Docker had 40+ commands at the top level and solved it not by removing commands but by organizing them into noun-based management groups. `gh` has 31 commands and remains discoverable because it categorizes them into CORE, ACTIONS, and ADDITIONAL sections in help output.

For `@chude/memory`, the research recommends: (1) introduce labeled help categories via Commander.js group support, (2) collapse overlapping commands where semantics genuinely duplicate, (3) use `--format` flags for progressive disclosure rather than separate commands, (4) separate "data retrieval" from "intelligence" at the naming level.

## 1. Command Count: What the Industry Does

### Empirical Survey

| Tool | Top-Level Commands | Subcommand Groups | Strategy |
|------|-------------------|-------------------|----------|
| `gh` | 31 | 3 labeled categories | Core / Actions / Additional in help |
| `docker` | 40+ (legacy) -> 15 groups | noun-based management commands | `docker container`, `docker image`, etc. |
| `kubectl` | ~40 | 7 semantic categories | Basic, Deploy, Cluster, Troubleshoot, Advanced, Settings, Other |
| `cargo` | ~20 built-in | flat (extensible via `cargo-*`) | Extensions live outside core |
| `nix` | ~15 groups | 3-tier priority system | Main / Infrequent / Utility |
| `brew` | ~30 | informal categories in docs | flat in practice, categorized in cheatsheets |
| `ollama` | 11 | flat | small enough to stay flat |
| `just` | 3 built-in | flat (user-defined recipes) | minimal core, delegate complexity |
| `ripgrep` | 1 | flags only | single-purpose tool |
| `sgpt` | 1 | mode flags (-s, -c, --chat) | modes via flags, not subcommands |

### Thresholds from the Evidence

- **Under 8 commands:** Flat is fine. No grouping needed. (ollama, just)
- **8-12 commands:** Grouping starts to help. Cobra documentation recommends introducing groups at 8-10 subcommands.
- **12+ commands:** Grouping is essential. Every tool above 12 that succeeds uses some form of categorization.
- **No hard upper limit exists.** `kubectl` has 40+ and works because grouping is good. `git` has 150+ and fails because plumbing leaks into porcelain.

**Confidence:** HIGH. These counts come from official documentation and help output of each tool.

### Implication for @chude/memory

18 top-level commands is in the "grouping essential" range but is not excessive. The problem is not count -- it is that `help` output presents them as an undifferentiated list.

## 2. Grouping Patterns

### Pattern A: Noun-Based Management Groups (Docker Model)

Commands organized by the object they operate on.

```
docker container ls/run/stop/rm
docker image pull/push/build/rm
docker network create/ls/rm
docker volume create/ls/rm
```

**When to use:** Tools with distinct object types where the same verbs apply across objects (ls, rm, create).

**Verdict for memory:** Poor fit. `memory` does not have multiple parallel object types needing the same CRUD verbs. Sessions, messages, and friction are too different in their operations to benefit from `memory session ls` vs `memory friction ls`.

### Pattern B: Labeled Categories in Help (gh Model)

Commands stay top-level but help output groups them under labeled headers.

```
CORE COMMANDS
  search     Search session content
  context    Get project context briefing
  show       Show session details

QUERY COMMANDS
  list       List recent sessions
  related    Find related sessions
  stats      Database statistics

MANAGEMENT
  sync       Sync sessions to database
  install    Install Claude Code hooks
  uninstall  Remove hooks
  ...
```

**When to use:** Tools where commands are conceptually related but not identical in their object model. Commands remain top-level for quick access.

**Verdict for memory:** Strong fit. This is what `gh` does with 31 commands. Commander.js supports `addHelpGroup()` (or manual help text override) for this pattern. Commands keep their short invocation (`memory search`) while help output becomes scannable.

### Pattern C: Two-Level Noun-Verb (Nix Model)

Commands namespaced under a noun, with verb subcommands.

```
nix store copy/ls/gc
nix profile install/remove/list
nix flake init/update/check
```

**When to use:** Large surface areas (15+ object types) where namespace collision would occur without grouping. Nix explicitly chose this to unify 10+ legacy commands (`nix-build`, `nix-shell`, etc.).

**Verdict for memory:** Overkill for 18 commands. Adds typing overhead (`memory hook install` vs `memory install`) without proportional discoverability benefit.

### Pattern D: Subcommand for One Domain (Friction Model)

One domain uses subcommands, the rest stay flat.

```
memory friction log
memory friction list
memory friction resolve
memory friction dashboard
memory search "query"        # top-level
memory sync                  # top-level
```

**Verdict for memory:** Already in use for `friction`. This is correct -- friction has enough subcommands (5-6) to justify a namespace. The pattern should not expand to other domains unless they similarly warrant 4+ verbs.

### Recommendation

**Use Pattern B (labeled help categories) as the primary organization.** Keep commands top-level for short invocation. Add labeled groups to help output. This matches the tool's scale (18 commands) and its usage pattern (AI agents type full commands, not exploring help menus).

## 3. Data Retrieval vs. Intelligence Commands

### The Naming Problem

Most developer tools deal only in data retrieval. `git log` returns data. `docker ps` returns data. `kubectl get` returns data. They do not synthesize, interpret, or generate intelligence from data.

`@chude/memory` sits at the boundary: `search` returns raw fragments (data), but `context` aspires to return an intelligent briefing (intelligence). This distinction is emerging in AI-augmented tools:

| Tool | Data Command | Intelligence Command | Naming Pattern |
|------|-------------|---------------------|----------------|
| `gh copilot` | (none) | `suggest`, `explain` | Verb implies synthesis |
| `sgpt` | (none) | default mode, `-s`, `-c` | Modes via flags |
| `elasticsearch` | `_search` | `_analyze`, aggregations | Endpoint verb differs |
| `kubectl` | `get`, `describe` | `explain` | `explain` = intelligence |
| `git` | `log`, `diff` | `bisect`, `blame` | Verb implies analysis |

### Emerging Pattern: Verb Signals Intent

- **Retrieval verbs:** `list`, `show`, `get`, `search`, `find` -- return stored data, possibly filtered
- **Intelligence verbs:** `explain`, `suggest`, `analyze`, `summarize`, `brief` -- process data into insight
- **Hybrid verbs:** `context`, `describe` -- ambiguous, can go either way

The problem with `memory context` is that its name is a retrieval verb ("get context") but its intended behavior is intelligence ("synthesize a briefing"). This creates UX confusion.

### Recommendation

If `context` is being rewired to produce intelligent briefings, its name should signal that. Options:

| Option | Invocation | Signal |
|--------|-----------|--------|
| Keep `context` | `memory context wow-system` | Weak signal. Users expect data dump. |
| Rename to `brief` | `memory brief wow-system` | Strong signal. Implies synthesis. |
| Rename to `recap` | `memory recap wow-system` | Strong signal. Implies summary of history. |
| Add `--mode` flag | `memory context --smart` | Progressive disclosure. Default = data, flag = intelligence. |

I recommend `context` with `--format ai` (already implemented) as the intelligence mode, but making `--format ai` the DEFAULT when no format is specified, and renaming the old behavior to `--format raw` or exposing it through `stats`. This avoids a breaking rename while shifting the default toward the intelligence use case.

## 4. Progressive Disclosure Patterns

### The Three Levels

Every tool studied implements progressive disclosure at 3 levels:

1. **Zero-config default:** Command works with no flags. `memory search "auth"` returns results with sensible defaults.
2. **Flag-based refinement:** `--limit 5 --project wow-system --format json` narrows scope.
3. **Expert mode:** `--verbose`, `--debug`, environment variables, config files.

### Specific Patterns

#### Pattern: Format Flag for Output Modes

Nearly universal. Used by `gh`, `kubectl`, `docker`, `nix`, `brew`.

```bash
memory search "auth"              # default human-readable
memory search "auth" --json       # structured output
memory search "auth" --format ai  # AI-optimized output
```

This is better than separate commands (`memory search` vs `memory search-json` vs `memory search-ai`).

#### Pattern: Quiet/Verbose Spectrum

```bash
memory sync --quiet     # exit code only
memory sync             # normal output
memory sync --verbose   # detailed progress
```

#### Pattern: Defaults That Match the Primary User

**This is critical for `@chude/memory`'s dual-user design (human + AI agent).**

If the primary user is Claude (AI agent), defaults should optimize for machine consumption:
- Default output should be structured and information-dense
- `--json` or `--format ai` should be the DEFAULT, not a flag
- Human-readable formatting should be the opt-in (`--pretty`, `--human`)

If the primary user is human, defaults should optimize for scannability:
- Default output should be colorized, truncated, formatted
- `--json` should be the opt-in

**Decision needed:** Who is the primary user? The CLAUDE.md says "designed for Claude to use, not just humans." If that is literal, default output should be AI-optimized.

#### Pattern: Mutually Exclusive Modes via Single Flag

From the user's own `cli-standards.md`:

```bash
# CORRECT: structural mutual exclusivity
--format=brief
--format=detailed
--format=json
--format=ai

# WRONG: separate boolean flags
--json --ai --brief   # what if both?
```

This is already partially implemented in `context` with `--format brief|detailed|ai`. Extend to all query commands.

## 5. Command Overlap and Deduplication

### Current Overlap Analysis

| Capability | Commands That Provide It | Redundancy |
|-----------|------------------------|-----------|
| "What happened in project X?" | `context`, `list --project X`, `stats --project X` | High |
| "Show me session details" | `show`, `browse` (dispatches to show) | Low (browse adds picker) |
| "What's in the database?" | `stats`, `status`, `doctor` | Medium |
| "Find relevant content" | `search`, `context` (when using smart mode) | Medium |

### Deduplication Recommendations

1. **`stats` vs `status`:** These serve different purposes. `stats` = database content metrics. `status` = system health (hooks installed, embedding status). Keep both but ensure help text makes the distinction clear.

2. **`status` vs `doctor`:** `status` is a quick check. `doctor` is a deep diagnostic with repair suggestions. This is the `brew` pattern (`brew --version` vs `brew doctor`). Keep both.

3. **`context` vs `list` vs `stats`:** `context` should become the intelligence command (briefing). `list` should remain the data command (show sessions). `stats` should remain the metrics command (counts, sizes). The overlap is in `context`'s current behavior returning metadata that duplicates what `list` and `stats` already provide.

4. **`browse` vs `show`:** `browse` is an interactive picker that dispatches to `show`, `search`, `context`, or `related`. This is a UI wrapper, not a data command. Keep it separate.

## 6. Recommended Help Output Structure

Based on the `gh` model (Pattern B), adapted for `@chude/memory`:

```
Usage: memory [command] [options]

Query Commands:
  search       Full-text search across sessions
  context      Project context briefing
  show         Show session details
  list         List recent sessions
  related      Find related sessions
  browse       Interactive session browser

Data Commands:
  sync         Sync sessions to database
  backfill     Generate daily logs from history
  export       Export database backup
  import       Import database backup
  purge        Remove old sessions

System Commands:
  install      Install Claude Code hooks
  uninstall    Remove Claude Code hooks
  status       Check system health
  doctor       Deep diagnostic with repair
  completion   Shell completion setup

Tool Feedback:
  friction     Friction tracking (log, list, resolve, dashboard)

Run 'memory <command> --help' for details on a specific command.
```

### Category Naming Rationale

- **Query Commands:** Things that read data and return it. The primary workflow.
- **Data Commands:** Things that write, move, or modify the database. Less frequent.
- **System Commands:** Infrastructure setup and health. One-time or occasional.
- **Tool Feedback:** Friction is a meta-concern about the tool itself, not session data.

### Why Not Deeper Nesting?

A two-level structure (`memory data sync`, `memory query search`) would add typing overhead for zero discoverability benefit. The labeled-categories-in-help pattern gives the same cognitive benefit without changing invocation syntax. AI agents already know the commands -- they need short invocations, not menus.

## 7. AI-Specific CLI Patterns

### How AI Tools Structure Their Surfaces

| Tool | Surface | Pattern |
|------|---------|---------|
| `ollama` | 11 commands, flat | Simple enough to stay flat. `run`, `pull`, `ls`, `rm`, `ps` |
| `sgpt` | 1 command + mode flags | `-s` (shell), `-c` (code), `--chat` (conversation) |
| `gh copilot` | 2 subcommands | `suggest` and `explain` -- both intelligence commands |
| `aider` | 1 command + config | Launches interactive session. All config via flags/file. |
| `claude` (Claude Code) | 1 command + flags | `-p` for non-interactive, flags for model selection |

### Key Observation

AI-specific CLIs tend to be **simpler, not more complex** than their data-management counterparts. They optimize for a single interaction mode (usually conversational or single-shot) and push complexity into flags rather than subcommands.

`@chude/memory` is not an AI tool -- it is a data tool that AI agents consume. Its CLI surface should follow data tool patterns (like `gh`, `docker`) not AI tool patterns (like `ollama`, `sgpt`).

### AI-Agent Consumption Patterns

When Claude invokes `memory` commands via the Bash tool, it:
1. Knows exactly which command to run (no discovery needed)
2. Constructs the full invocation including flags
3. Parses the output (prefers structured or predictable formats)
4. Does not browse help text

This means:
- **Labeled help categories help humans, not AI.** Still worth doing -- humans maintain the tool.
- **Consistent `--json` and `--format ai` flags across all commands help AI.** This is more impactful than restructuring commands.
- **Short command names help AI.** `memory search` beats `memory query search`.

## 8. Composability Patterns

### Unix Composability in Query Tools

```bash
# Pipe search results to jq
memory search "auth" --json | jq '.[] | .session_id'

# Pipe list to further processing
memory list --json --limit 100 | jq '.[] | select(.project == "wow-system")'

# Combine with other tools
memory search "error" --json | jq -r '.[].session_id' | xargs -I{} memory show {}
```

### Requirements for Composability

1. **Structured output via `--json`** on every query command
2. **Exit codes:** 0 = results found, 1 = no results or error
3. **stderr for status messages** (progress, hints, warnings)
4. **stdout for data only** (results, content)
5. **`-` for stdin** where applicable (e.g., `memory import -`)

### Current Gaps

Verify that all query commands (`search`, `context`, `list`, `stats`, `show`, `related`) support `--json` consistently. Any command missing `--json` breaks composability.

## 9. Naming Conventions Summary

### Verb Selection Guide

| User Intent | Recommended Verb | Alternatives Considered | Why |
|------------|-----------------|------------------------|-----|
| Find content | `search` | `find`, `query`, `grep` | `search` is standard for full-text. `find` implies path. `grep` implies regex. |
| Get project briefing | `context` | `brief`, `recap`, `summarize` | `context` is established. Rename is risky. Use `--format` to signal intelligence mode. |
| Show one thing | `show` | `view`, `inspect`, `get` | `show` matches `gh pr show`. `inspect` is Docker-specific. |
| List many things | `list` | `ls` | `list` is more readable. `ls` is terser. Either works. |
| Find connections | `related` | `links`, `connections`, `graph` | `related` is self-documenting. |
| Import data | `import` | `load`, `restore` | `import` pairs with `export`. |
| Export data | `export` | `dump`, `backup` | `export` pairs with `import`. |
| Health check | `doctor` | `check`, `diagnose`, `verify` | `doctor` is established (`brew doctor`). |
| Quick status | `status` | `info`, `health` | `status` matches `git status`. |
| Ingest data | `sync` | `ingest`, `extract`, `pull` | `sync` implies bidirectional but is established. |

### Naming Anti-Patterns to Avoid

- **Ambiguous pairs:** `update` vs `upgrade` (clig.dev explicitly warns against this)
- **Same verb, different scope:** Two commands named `list` with different defaults
- **Nouns as commands:** `memory sessions` (is this list? show? create?)
- **Abbreviations without expansion:** `memory ctx` (saves 4 characters, loses clarity)

## 10. Concrete Recommendations for @chude/memory

### Priority 1: Add Labeled Help Categories

Implement labeled groups in Commander.js help output. This is the highest-impact, lowest-risk change. No command names change. No invocations break.

### Priority 2: Standardize --format and --json Across All Query Commands

Every command that returns data should support:
- `--format brief|detailed|ai` (where applicable)
- `--json` (structured output)
- `--quiet` (minimal output, exit code carries result)

### Priority 3: Resolve context Overlap

Define `context` as the intelligence command. Its default output should be an AI-optimized briefing. Move the old metadata-dump behavior to `--format raw` or accept that `list` and `stats` already cover it.

### Priority 4: Assess stats vs status Naming

These serve different purposes but the names are confusable. Consider:
- `stats` -> keep (database content metrics)
- `status` -> keep (system health)
- Add a one-line description that makes the difference obvious in help output

### Priority 5: Do NOT Rename or Restructure Without Cause

The current command names are well-chosen. `search`, `show`, `list`, `sync`, `install`, `doctor` -- these follow industry conventions. Resist the urge to reorganize for aesthetics. The labeled help categories solve discoverability without breaking existing invocations.

## Sources

### Primary Sources (CLI Guidelines)
- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/)
- [Nix CLI Guidelines](https://nix.dev/manual/nix/2.32/development/cli-guideline.html)
- [Microsoft .NET CLI Design Guidance](https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance)

### Tool Documentation
- [gh CLI Manual](https://cli.github.com/manual/gh)
- [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/)
- [kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
- [Cargo Commands](https://doc.rust-lang.org/cargo/commands/index.html)
- [Ollama CLI Reference](https://docs.ollama.com/cli)
- [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)

### CLI Framework References
- [Cobra Command Groups](https://cobra.dev/docs/how-to-guides/working-with-commands/)
- [Cobra Help Group Commit](https://github.com/spf13/cobra/commit/2169adb5749372c64cdd303864ae8a444da6350f)

### Design Pattern References
- [UX Patterns for CLI Tools (Lucas F. Costa)](https://www.lucasfcosta.com/blog/ux-patterns-cli-tools)
- [Docker 1.13 Management Commands](https://www.couchbase.com/blog/docker-1-13-management-commands/)
- [Git Plumbing and Porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Atlassian: 10 Design Principles for Delightful CLIs](https://www.atlassian.com/blog/it-teams/10-design-principles-for-delightful-clis)
- [Thoughtworks: CLI Design Guidelines](https://www.thoughtworks.com/en-us/insights/blog/engineering-effectiveness/elevate-developer-experiences-cli-design-guidelines)

### AI Tool References
- [SGPT (shell-gpt)](https://github.com/TheR1D/shell_gpt)
- [Aider](https://aider.chat/)
