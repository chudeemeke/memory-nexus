# Adversarial UX/DX Review — 2026-04-26

**Reviewer angle:** CLI ergonomics, error messages, AI-agent compatibility, peer comparison
**Target:** `@chude/memory` v2.0.0 (formerly `memory-nexus`) — `~/Projects/memory-nexus/`
**Comparison peers:** `gh`, `1Password CLI` (`op`), `bw` (Bitwarden), vector-DB CLIs (`chroma`, `qdrant`)

## Summary

A new user can install and reach a useful query in under 5 minutes — the README walks them from `bun add -g @chude/memory` to `memory search` cleanly, and `memory doctor` provides genuinely good diagnostic output. However, this is a **CLI built for one user, not for AI agents calling it under contract**. The JSON output is not versioned, several "not found" responses go to stdout instead of stderr, the `--quiet` mode has no consistent contract across subcommands, and `--format ai` for `search` produces output identical to the default. For AI-agent integration stability the verdict is: **fragile** — any internal refactor of the JSON shape silently breaks downstream parsers because there is no `schema_version` field anywhere.

## Friction the user has already logged

Mining `memory friction list --tool memory --limit 30` on 2026-04-26 surfaces **26 open entries**. Stripping the test fixtures (e.g., "Test friction entry", "Entry for list test", "JSON friction entry" — these recurred on 2026-04-03 from test runs and should be purged), the genuine complaints are:

| ID  | Sev    | Cat    | Description (the user's own words) |
|-----|--------|--------|------------------------------------|
| 14  | high   | search | "Search broken for unicode" |
| 15  | medium | cli    | "CLI output truncated" |
| 146 | medium | ux     | "No auto-surface of friction when opening tool projects. Claude should proactively show outstanding friction summary when beginning work in any ~/Projects/ tool project." |
| 163 | low    | ux     | "Embedding model download bar shows 0/0 MB when model is cached. Transformers.js fires initiate/done events with loaded:0 total:0 which get mapped to downloading status, triggering an empty progress bar instead of skipping silently." |
| 207 | low    | sync   | "memory sync --embed failed at 281813/287013 messages with UNIQUE constraint on message_embeddings primary key. Recoverable via re-run. Affects search index freshness only, not session persistence." |

The themes are: **search edge cases** (unicode), **output instability** (truncation, empty progress bars), and **embedding sync robustness** (UNIQUE-constraint retries). Note: ID 146 — "no auto-surface of friction" — is itself a meta-finding: the user logged that the system the project ships is not closing the loop on its own friction data. That's a UX scar that hasn't healed.

Also troubling: 18 of 26 entries are stale test-data (created 2026-04-03 but never resolved, never expired). The friction system has no retention policy or test-fixture detection. The user has to read past their own test pollution to find real signal.

## Findings (severity-ranked)

### CRITICAL

#### CRIT-1 — JSON schema is unversioned, breaks AI-agent contract on any internal refactor

**File:** `src/presentation/cli/commands/search.ts` (and every other `--json` path)
**What's wrong:** `memory search "x" --json` returns:
```json
{
  "meta": { "query": "...", "mode": "hybrid", "mode_reason": "...", ... },
  "results": [...]
}
```
There is **no `schema_version` field**. Stats output is a bare `{totalSessions: N, ...}` object with no envelope. List output is a bare array. Friction output is a bare array. Every command's JSON shape is unique and undocumented as a contract.

**Why it matters:** The README markets "AI-First Design" — "This tool is designed for Claude to use via the Bash tool." Claude's grep/jq parsers in session prompts will hard-code paths like `.results[0].sessionId` or `.[0].messageCount`. The next time a developer renames `score` to `relevance` or moves `timing_ms` from `meta` to a sibling field, every agent integration breaks silently with no migration path.

**Peer comparison:**
- `gh api` always returns the GitHub API's documented stable contract; gh CLI's own outputs (`gh pr view --json`) require an explicit `--json field1,field2` selector so callers commit to a contract.
- `op` documents output schemas and bumps the minor version when fields are added (additive only).
- `kubectl get -o json` produces standard Kubernetes API resources — versioned (`apiVersion: v1`).

**Recommended fix:**
1. Wrap every `--json` output in `{"schema_version": "1.0", "data": ...}` envelope.
2. Add `docs/json-schema.md` documenting each command's output shape with examples.
3. Treat schema as semver: additive changes bump minor; rename/remove bumps major and emits a deprecation warning to stderr for one minor.
4. Add `--json-schema` flag to print the schema for the command without executing it (cheap, useful for agents introspecting at startup).

---

#### CRIT-2 — "Not found" results print to stdout, breaking shell composition

**File:** `src/presentation/cli/commands/show.ts:162`, `src/presentation/cli/commands/context.ts:219` (and 280)
**What's wrong:**
```ts
// show.ts:162
console.log(formatter.formatNotFound(sessionId));
return { exitCode: 1 };
```
And from a live test:
```
$ memory show "not-a-real-id" 2>/dev/null
Session not found: not-a-real-id   # <-- stdout!
$ echo $?
1
```
Same pattern in `context.ts` for `outputMode !== "quiet" || message`: in non-JSON mode, the empty-result message goes to stderr correctly there (line 219 uses `console.error`). In JSON mode, the empty result goes to **stdout** (line 217). But for `show`, the not-found message ALWAYS goes to stdout, even in non-JSON mode. Inconsistent.

**Why it matters:** The user's own `cli-standards.md` states: *"stdout = data, stderr = status (composability)."* When an AI agent runs `memory show $id | jq .` and the session isn't found, jq receives "Session not found: not-a-real-id" — invalid JSON — and crashes with a confusing parse error instead of an empty stdin. A simple shell pipeline like `memory show $id || handle_missing` works (because exit code is correct), but `memory show $id > out.json` writes the error message into out.json.

**Peer comparison:** `gh pr view 99999` writes `GraphQL: Could not resolve to a PullRequest...` to stderr and exits 1. `op item get nonexistent` writes the error to stderr. Both leave stdout empty so pipes don't get poisoned.

**Recommended fix:** Replace `console.log` with `console.error` in not-found branches in `show.ts:162`, `context.ts:217`, and audit every other `formatter.formatNotFound`/`formatter.formatEmpty` call site for the same pattern. For `--json` mode, decide: write a structured `{"error": {...}}` to stdout (to keep JSON parseable) OR write nothing to stdout and write to stderr. The current half-and-half behavior is the worst of both worlds.

---

### HIGH

#### HIGH-1 — `--format ai` produces output identical to default for `search` (no actual reformatting for AI consumers)

**File:** `src/presentation/cli/commands/search.ts:347–351` and `formatters/ai-formatter.ts`
**What's wrong:** The `formatForAi` function only strips ANSI codes and collapses blank lines. When stdout is not a TTY (e.g., when Claude is calling memory via Bash), `shouldUseColor()` already returns false, so the default output already has no ANSI codes. Result:
```
$ memory search "x" --format ai | diff - <(memory search "x")
# (no diff)
```
The AI format flag is essentially a placebo for non-TTY callers. Verified live.

**Why it matters:** README claims AI-first design and the help text exposes `--format ai` on most commands. AI agents may pass it expecting a different, more parseable shape. Instead they get the same output with the same `[34%] [User] agent-a091903994...` prefix, the same `*term*` markdown highlighting from FTS5 leaking into search snippets, and the same truncated session IDs.

**Peer comparison:** `op item get x --format=json` actually changes the output. `gh issue list --json fields` actually changes the output. Memory's `--format ai` does nothing observable.

**Recommended fix:** Either (a) make `--format ai` do something — strip the leading rank prefix, expand truncated IDs, remove FTS markdown highlights from snippets, output stable line-prefixed records — or (b) remove the flag and direct AI agents to `--json`.

---

#### HIGH-2 — `--quiet` semantics are inconsistent across commands, and unsupported on `friction list`

**Files:** `src/presentation/cli/commands/friction/index.ts:44–58` (no `--quiet` option), vs `list.ts:88` (has it)
**What's wrong:** Live test:
```
$ memory friction list --quiet
error: unknown option '--quiet'
$ echo $?
0     # <-- ALSO unknown-option errors leave exit code 0
```

The cli-standards file mandates `-q, --quiet` as recommended, and its semantic is "suppress non-essential output." memory implements this differently across commands:
- `list --quiet` → session IDs only (one per line) ✓
- `search --quiet` → "session-id<tab>snippet" on one line, with FTS `*marker*` highlighting still present
- `friction list --quiet` → unsupported, errors out
- `purge --quiet` → outputs the deleted count as a number
- `export --quiet` → outputs the file path
- `import --quiet` → suppresses output except errors
- `browse --quiet` → unsupported (no flag)

There is no shared mental model of what `--quiet` means.

**Peer comparison:** `gh` is consistent: `--quiet`-equivalent is no flag at all (commands print minimal by default), and verbose is opt-in. `kubectl get pods -o name` is a documented "names only" mode. Memory's `--quiet` is six different things.

**Recommended fix:** Document a single `--quiet` contract: "one record per line, machine-parseable, no headers, no decorations." Apply it uniformly: `friction list --quiet` should print one ID per line; `search --quiet` should print `<sessionId>\t<messageId>\t<score>` or similar tab-separated form (no FTS `*marker*` highlighting).

---

#### HIGH-3 — Top-level uses `-V` for `--version`, not `--version` shorthand (Commander.js default)

**File:** `src/presentation/cli/index.ts:38` (`program.version(pkg.version)`)
**What's wrong:** Commander.js's default `-V, --version` capital-V is preserved. `cli-standards.md` mandates `--version`; the closest peer convention (`-v` for verbose, but no short for version) is the dominant one. Live:
```
$ memory --version
2.0.0
$ memory -V
2.0.0
$ memory -v
error: unknown option '-v'
```
`-v` is unhelpfully an error at the top level (no `-v/--verbose` global flag), but the user's own cli-standards.md lists `-v, --verbose` as recommended. The user has trained their own muscle memory: type `tool -v` → expect verbose output. memory says "unknown option."

**Why it matters:** `-v` colliding with `--version` is exactly the gh/git/curl convention battle. The user's standards explicitly say `-v` means verbose, NOT version. The top-level command violates the user's own rule.

**Peer comparison:**
- `gh --version` works; `gh -v` does not (gh resolves it on subcommands as `--verbose` for some commands).
- `op --version` works; `op` has no top-level `-v`.
- `git --version` works; `git -v` is unknown.
- All of them: `--version` is the canonical long form; `-V` is the convention only because of historical Commander.js defaults.

**Recommended fix:**
1. Disable Commander's default `-V` shorthand: `program.version(pkg.version, "--version", "Output version number")` (no short flag).
2. Add a global `-v/--verbose` that propagates to subcommands.
3. Document the choice in CONTRIBUTING.md so future maintainers don't add `-V` back accidentally.

---

#### HIGH-4 — `--limit` flag inconsistency: `related` uses `--limit` (long-only), peers use `-l, --limit`

**File:** `src/presentation/cli/commands/related.ts:64`
**What's wrong:** `list`, `search`, `browse` use `-l, --limit`. `related` uses just `--limit` (no short). `friction list` uses just `--limit`. `stats` uses `--projects` for its own limit-like field (no short).

This breaks shell muscle memory — `memory <any> -l 5` should work universally.

**Peer comparison:** `kubectl get -l` is a label selector; not the same. But `gh pr list -L 5`, `gh issue list -L 5`, `gh repo list -L 5` — uniform short flag across all listing commands. Memory has 4 commands that list things and only 2 share the short flag.

**Recommended fix:** Add `-l` short form to `related.ts` and `friction/index.ts:list`. Audit every other "limit-like" option for consistency.

---

#### HIGH-5 — `--check` flag missing entirely (cli-standards mandates it for status check)

**Files:** all commands
**What's wrong:** `cli-standards.md` recommends `--check` for status checks: "exit 0=ok, 1=action needed". memory has no `--check` anywhere. The closest equivalent is `memory doctor` which prints a long diagnostic report.

Live:
```
$ memory sync --check
error: unknown option '--check'
$ memory list --check
error: unknown option '--check'
```

**Why it matters:** Hooks, CI, and shell scripts often need a fast "is everything OK?" gate. `memory doctor` is not it — it does I/O, prints multi-section output, and computes per-section health. A `memory --check` (or per-command `--check`) returning exit 0/1/2 silently is the right primitive. Without it, scripts must parse `memory doctor` output or assume everything is fine.

**Recommended fix:** Add `memory check` as a top-level fast-path subcommand: zero stdout, exit 0 if doctor would return 0, exit 1 if degraded, exit 2 if broken. Optionally add `--check` to `sync` and `status` for "is sync needed?"-style queries.

---

#### HIGH-6 — Unknown-option errors exit with code 0 in some Commander.js subcommand contexts

**File:** detected behavior in `friction list --quiet`
**What's wrong:** Live:
```
$ memory friction list --quiet
error: unknown option '--quiet'
$ echo $?
0
```
The error text reaches stderr, but exit code is 0. `cli-standards.md` mandates exit code 2 for "Misuse (invalid args)." This is a Commander.js quirk that needs a global error handler to override.

**Why it matters:** Shell scripts use `if memory friction list --quiet; then ...` to gate behavior. Exit 0 on "unknown option" is a footgun: the script proceeds as if the call succeeded, then the missing JSON output silently breaks the next stage.

**Recommended fix:** Set `program.exitOverride()` and a top-level error handler that maps Commander parse errors to exit code 2 explicitly. Also catch `commander.unknownOption` and `commander.missingArgument` codes.

---

### MEDIUM

#### MED-1 — First-run experience: `memory sync` on a fresh install processes 287k messages with no estimate or chunked first-pass

**File:** `src/presentation/cli/commands/sync/index.ts` (no first-run gate)
**What's wrong:** A new user installs memory, runs `memory sync` (per the README), and the tool starts processing all `~/.claude/projects/` JSONL files immediately. The user has 287k messages historically. There is:
- No `Estimated time: ~N minutes` upfront warning.
- No "this is your first sync — would you like to limit to last 30 days for now?" prompt.
- No `--days N` filter on sync to bound the first pass.
- The progress bar shows raw counts (2773 sessions) but no rate (sessions/sec) until cli-progress fills the ETA.

The user's own friction log #207 documents that this exact path crashed at 281,813 / 287,013 messages with a UNIQUE-constraint failure — i.e. the first-run blast zone is real and known.

**Peer comparison:** `op signin` stages credentials gradually. `gh auth login` is interactive and bounded. Vector-DB CLIs like `chroma run` start the daemon and let the user choose collection scope; they don't auto-import everything. None of these would index 200k+ records without showing a confirmation.

**Recommended fix:**
1. Detect first-run (no extraction state in DB) and add a one-time prompt: "Found X sessions across Y projects. Estimated time: Z minutes. Continue? [Y/n]" — bypassable with `-f/--force`.
2. Add `--limit N` and `--since DATE` to `sync` so users can stage their first import.
3. After completion, print "Tip: run `memory sync --embed` to enable semantic search (estimated additional Z minutes for N messages)."

---

#### MED-2 — Error messages dump raw underlying-library errors instead of explaining

**File:** `src/presentation/cli/formatters/error-formatter.ts` (`getSuggestion`)
**What's wrong:** The error formatter is well-structured (suggestion table per error code), but the underlying error message that gets passed to `MemoryError` is often a raw SQLite or filesystem error. Example (from friction #207): "UNIQUE constraint on message_embeddings primary key" — that's the raw SQLite error text. The user has to know SQLite to understand it. No "(Tip: an embedding for this message was already generated; this is recoverable — re-run `memory sync --embed`)" wrapper.

Apple-philosophy: error tells user **what happened, why, and what to do**. memory tells "what" (SQLite error) and sometimes "what to do" (suggestion table) but rarely "why" in a domain-language way.

**Recommended fix:** Audit every `throw new MemoryError(...)` site and ensure the message is in domain language. Map common low-level errors (UNIQUE constraint, EBUSY, ENOENT, EACCES) to friendly explanations at the throw site.

---

#### MED-3 — Help discoverability: 22 top-level subcommands, no grouping

**File:** `src/presentation/cli/index.ts:35–87`
**What's wrong:** `memory --help` lists 22 subcommands flat: sync, search, list, stats, context, show, browse, related, install, uninstall, status, doctor, purge, export, import, completion, friction, backfill, help. They mix:
- **Query** commands (search, list, context, show, related, browse, stats)
- **Sync/data** commands (sync, purge, backfill)
- **Lifecycle** commands (install, uninstall, status, doctor)
- **Backup** commands (export, import)
- **Tooling** (completion, friction)

A new user reading `memory --help` for the first time sees a flat menu with no semantic grouping. No way to know that `friction` has 6 sub-subcommands without drilling in.

**Peer comparison:**
- `gh --help` groups commands into "CORE COMMANDS", "GITHUB ACTIONS COMMANDS", "ADDITIONAL COMMANDS." Visually scannable.
- `op --help` groups by topic (account, document, item, vault).
- `kubectl --help` groups by "Basic Commands", "Deploy Commands", "Cluster Management Commands."

**Recommended fix:** Use Commander's `addHelpText` to inject grouped headings. Group: Query / Manage / Setup / Diagnostics / Backup / Tools.

---

#### MED-4 — `memory friction --json` (parent) does not propagate to subcommands

**File:** `src/presentation/cli/commands/friction/index.ts:23–27`
**What's wrong:** Live:
```
$ memory friction --json log "test description"
error: unknown option '--json'
```
The comment in the source code admits this: *"Each subcommand defines --json independently (Commander.js does not inherit parent options)."* That's a workaround acknowledgment, not a fix. The user has to put flags after the subcommand: `memory friction log "test" --json`.

**Why it matters:** AI agents drafting commands will naturally write `memory friction --json list` because that's how kubectl/gh sometimes work. They get a confusing error.

**Recommended fix:** Use Commander's `passThroughOptions` or `enablePositionalOptions`, or document explicitly in the parent `--help` that flags must come after the subcommand. Even better: add a wrapper that intercepts parent-level `--json` and forwards it.

---

#### MED-5 — `memory list` truncates session IDs to 8 chars in default output, breaks copy-paste-and-show

**File:** `src/presentation/cli/formatters/list-formatter.ts` (default formatter)
**What's wrong:** Live:
```
$ memory list --limit 2
Sessions (2 results):
  agent-a4  conversations  4 minutes ago  0 messages
  agent-aa  conversations  5 minutes ago  0 messages
```
The IDs `agent-a4` and `agent-aa` are not unique within the user's history (with hundreds of agent-* sessions). To use these IDs with `memory show`, the user has to either run `--json` mode or use `--verbose`. The 8-char prefix does support partial matching in `show` (good), but a user copy-pasting `agent-a4` may collide with another session and get the wrong one.

**Peer comparison:**
- `gh pr list` shows full PR numbers (4 digits is usually unambiguous, but PR numbers are integers, not random hex).
- `git log --oneline` defaults to 7 chars BUT git auto-extends if there's collision.
- `kubectl get pods` shows full pod names, never truncated.

**Recommended fix:** Show full session IDs by default (or 12-char prefixes — git's collision-resistant default). For very long agent IDs, truncate the middle (`agent-a48136…185d19421`) so prefix and suffix are both visible and unique.

---

#### MED-6 — `memory search` snippet output leaks FTS5 `*marker*` syntax verbatim

**File:** `src/presentation/cli/commands/search.ts:512` (filterCaseSensitive cleans `<mark>` but not `*term*`)
**What's wrong:** Live:
```
$ memory search "authentication" --limit 1
1. [34%] [User] agent-a091903994...
   ...db, "msg-old", "session-1", "user", "*authentication* old content"
```
The `*authentication*` markdown asterisks are FTS5's match-marker syntax leaking through. The code in `filterCaseSensitive` strips `<mark>` HTML tags but not `*foo*` markdown markers. They should be ANSI-bold in TTY mode, plain text in non-TTY, and structured `highlights[]` in JSON mode.

**Recommended fix:** Strip `*foo*` markers from snippet text consistently in non-TTY output; replace with ANSI bold in TTY output; use the `highlights[]` array in JSON output (already present, but the snippet itself still has the markers).

---

#### MED-7 — `memory friction list` retains 18+ test-fixture entries indefinitely; no retention or test-data detection

**File:** `src/application/services/friction-service.ts`, `friction list` handler
**What's wrong:** From a live `memory friction list --tool memory`:
```
[NEW]202   low       sync          JSON friction entry                     23d
[NEW]201   high      search        Test friction entry                     23d
[NEW]200   medium    cli           Entry for list test                     23d
... 15 more identical pairs ...
```
These were written by the project's own test suite on 2026-04-03 (when `--tool memory` was added). Three weeks later, they still pollute the user's friction view. The friction system has no:
- Retention policy (e.g., auto-archive entries with no activity for 60+ days)
- Test-data marker (e.g., `--test-fixture` flag that's stripped on `list` by default)
- Bulk purge by description pattern (only the recently-added `purge <pattern>` exists)

The user is forced to manually `friction purge "Test friction entry"` etc. to clean their own data.

**Recommended fix:**
1. Add `--include-test` flag (default false) to `friction list`; auto-skip entries matching common test-fixture patterns ("Test friction entry", "Entry for list test", "JSON friction entry").
2. Add `--older-than` flag matching `purge`'s semantics for retention.
3. Have the test suite emit entries with a `test_fixture: true` flag in the database (additive schema migration) and filter them by default.

---

### LOW

#### LOW-1 — `memory install` error message points to a build command that may not exist for end users

**File:** `src/presentation/cli/commands/install.ts:84`
```ts
console.error("Error: Hook script not found. Run 'bun run build:hook' first.");
```
A user who installed via `bun add -g @chude/memory` doesn't have the source. They have no way to "run build:hook." For them, this error is a dead end. Should distinguish: if running from globally-installed package, advise reinstall; if running from source, advise build.

**Recommended fix:** Detect via `process.env.npm_package_json` or path heuristic; show "reinstall the package" for globally-installed users.

---

#### LOW-2 — `--dry-run` flag is `-n, --dry-run` on `sync` but plain `--dry-run` everywhere else

**Files:** `sync/index.ts:31` (has `-n`), `purge.ts:171` (no `-n`), `friction/index.ts` purge (no `-n`)
**What's wrong:** Inconsistent short-form. `cli-standards.md` doesn't mandate a short form, but consistency matters.

**Recommended fix:** Either drop `-n` from sync to match the others, or add `-n` everywhere `--dry-run` exists.

---

#### LOW-3 — Backfill help text mentions `claude -p` without explaining what it is

**File:** `src/presentation/cli/commands/backfill.ts` description: "Generate daily log entries from historical sessions via claude -p"
**What's wrong:** A new user sees `via claude -p` and has no idea what that means (it's Anthropic's claude CLI in print-mode). For market-ready OSS, this is jargon that loses external users.

**Recommended fix:** Reword to "Generate daily log entries by replaying historical sessions through Claude (requires `claude` CLI from `@anthropic-ai/claude-code`)."

---

#### LOW-4 — `memory browse` has no `--quiet`, `--json`, or `--non-interactive` flags

**File:** `src/presentation/cli/commands/browse.ts`
**What's wrong:** `browse` is interactive-only (uses `@inquirer/select`), but it offers no way to detect that the environment is non-interactive and exit cleanly. If a script accidentally pipes `memory browse` into something, it likely hangs on the inquirer prompt.

**Recommended fix:** Detect `!process.stdin.isTTY` and exit 1 with a clear message ("memory browse requires an interactive terminal; use `memory list` for piping").

---

#### LOW-5 — `getSuggestion` table is incomplete (e.g., no advice for `UNIQUE constraint failed` scenario)

**File:** `src/presentation/cli/formatters/error-formatter.ts:36`
**What's wrong:** The suggestion table covers ~17 known error codes, but the user's own friction log #207 records a "UNIQUE constraint" sync failure that's clearly recoverable — re-run sync — yet there's no specific guidance for it. The generic `SYNC_FAILED` suggestion ("Check logs at ~/.local/share/memory/logs for details") doesn't tell the user "this is recoverable, just re-run."

**Recommended fix:** Add specific subcodes for known recoverable conditions (e.g., `EMBEDDING_DUPLICATE`, `SYNC_PARTIAL`) with targeted guidance. Audit recent friction entries for patterns that could become structured codes.

---

#### LOW-6 — README markets "AI-First Design" but does not provide an agent integration contract

**File:** `README.md:75–85`
**What's wrong:** The README says "Standard CLI output works for both humans and AI agents." But there is no documented schema, no "for AI agents, prefer `--json` and these specific fields", no version pledge. AI-first as a marketing claim, not as a contract.

**Recommended fix:** Add `docs/agent-integration.md` documenting:
- Stable JSON contract per command (with schema_version)
- Recommended invocation patterns for agents (always `--json`, always `--limit`, always `--days`)
- Exit code semantics
- What changes are guaranteed additive vs breaking

---

## Peer comparison gaps

| Feature | gh | 1Password (op) | bw | memory | Gap |
|---|---|---|---|---|---|
| Versioned JSON schema | yes (GitHub API) | yes | yes | **no** | CRIT-1 |
| `--json field1,field2` selector | yes | partial | partial | no | future feature |
| stderr vs stdout discipline | strict | strict | strict | **leaky** | CRIT-2 |
| Grouped help | yes | yes | yes | **no** | MED-3 |
| Global `-v` for verbose | partial | no | no | **rejects -v** | HIGH-3 |
| `--check` fast-path | indirect (`gh auth status`) | yes (`op account get`) | yes (`bw status`) | **doctor only** | HIGH-5 |
| Shell completions | yes | yes | yes | yes | OK |
| Interactive vs flag-driven | flag-first | flag-first | flag-first | mixed | LOW-4 |
| First-run scoping | login-bounded | account-bounded | account-bounded | **unlimited** | MED-1 |
| Documented schema versioning | yes | yes | yes | **no** | CRIT-1, LOW-6 |

memory's clear lead: `doctor` is more thorough than `gh auth status` or `op account get` — it's a genuine diagnostic console with actionable per-check output. Keep that.

## What's Done Well

1. **`memory doctor` is excellent.** Multi-section output, proper exit codes (0=OK, 1=degraded, 2=broken), `--fix` flag for auto-remediation, and migration awareness. This is the strongest UX surface in the project. Better than `gh auth status` for genuine system-state introspection.

2. **Most subcommands have `--quiet`, `--verbose`, `--json` triad consistently** — even where the implementations are inconsistent (HIGH-2), the *presence* of all three flags on `list`, `search`, `stats`, `context`, `show`, `related`, `purge`, `export`, `import` shows the discipline is there. This is a fixable consistency problem, not a missing-feature problem.

3. **Date parsing is generous.** `--since "yesterday"`, `--since "2 weeks ago"`, `--days 7` all coexist. chrono-node integration is the right choice and the validation in `--days` (positive integer only) is strict where it matters.

## Open Questions

1. **Is the `--format ai` flag intended to do anything beyond ANSI stripping?** The current implementation makes it a no-op for the common AI-agent (non-TTY) caller. Deciding "yes, it should reformat" or "no, redirect to --json" is a product decision.

2. **What's the intended schema-stability promise for AI agents?** The README markets AI-first but the codebase shows no commitment. Is the JSON output considered an internal implementation detail or a public contract? Without a decision here, every refactor risks breakage.

3. **Does the friction system need the test-data hygiene fixed before publishing v2.1?** Currently the user's own dogfooding is buried in test fixtures. If shipping a v2.1 that exposes friction-tracking to other tools (per friction #146's request), the polluted state will be confusing to those tools' authors.

4. **Should `memory sync` on first run be bounded by default?** A user who installs the tool to get fast cross-project search will be surprised by a 30-minute first sync. Bounding it (last 30 days) and offering `memory sync --backfill` to grab the rest is a friendlier default.

5. **Is the legacy `memory-nexus` package name's deprecation stub being measured?** With v2.0.0 published as `@chude/memory`, are there metrics on how many users still pull the old name? If high, MIGRATION.md may need a stronger nudge in the deprecation message.
