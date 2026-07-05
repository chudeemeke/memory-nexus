# @chude/memory

`@chude/memory` is the first-party memory infrastructure layer for this project portfolio. The repository name is `memory-nexus`; the package and binary are `@chude/memory` and `memory`.

## Product North Star

Before planning, implementation, review, or release work, read `.planning/PROJECT.md` and treat its Product North Star section as normative.

The intended end state is not a Claude-log search CLI. It is a local-first, privacy-governed, auditable memory substrate that lets multiple projects and agents carry forward verified context, decisions, preferences, friction, facts, and derived knowledge without relying on stale chat summaries or scattered notes.

Do not silently remove stated, inferred, prototype, disabled, or partial features. Complete them, explicitly own them in a later phase, or document why they are a non-goal.

## Current State

- v4 is published as `@chude/memory`.
- v5 Market-Leader Memory Platform is active.
- Phase 42.5 is complete.
- Phase 43 is complete with scoped local-first CLI/API market readiness approved.
- Phase 44 is next and owns release-candidate packaging, versioning, changelog, release notes, npm dry-run, install smoke, and user-authorized OTP publish handoff.
- The current published package remains `@chude/memory@4.0.2`; source is ahead after a Windows hook-launcher fix, so Phase 44 must decide the next version and release path.

Do not claim broad market-leader status unless MCP/local-server and public benchmark gaps are either implemented or explicitly dispositioned with user sign-off. Scoped market readiness for the local-first CLI/API product is a separate, narrower claim.

## Architecture

Use the existing hexagonal architecture:

- `src/domain`: entities, value objects, ports, pure domain services. No third-party runtime dependencies.
- `src/application`: use cases and orchestration through ports.
- `src/infrastructure`: SQLite, filesystem, hooks, providers, Git transport, security adapters.
- `src/presentation`: Commander CLI commands, formatters, pickers, process-facing surfaces.

Prefer dependency injection and existing ports over hardcoded provider, path, project, or process assumptions. Provider behavior belongs in registries/configuration/capabilities, not scattered switches in presentation code.

## Command Surface

Important current surfaces include:

- Query: `query`, `search`, `context`, `show`, `list`, `related`, `stats`, `facts`, `governance`, `profile`, `dream`
- Data: `sync`, `backfill`, `export`, `import`, `purge`, `migrate`, `extract`, `remote`, `backup`, `restore`, `projections`
- System: `install`, `uninstall`, `status`, `doctor`, `audit-secrets`, `completion`, `browse`
- Feedback: `friction`

Prefer JSON output for machine-facing checks. Do not call `process.exit()` from programmatic execute functions.

Hook background sync must launch `memory sync` directly through the resolved `memory` executable. Do not reintroduce `aidev memory sync` or shell-wrapper assumptions in hook code.

## Privacy And Security

Memory ingests sensitive transcripts and tool output. Treat privacy as product behavior.

- Redact before storage, FTS, embedding, extraction, export, logs, provider egress, and remote sync.
- Provider egress is deny-by-default unless explicit consent and provider/host allowlists are configured.
- Remote sync is explicit. Plain `memory sync` must not silently push to a remote.
- `memory audit-secrets` must not print raw secrets.
- `apiKeyRef` is opaque metadata. Do not resolve it to plaintext and do not call `authkey get`.
- Authkey interop is optional and should use runtime injection such as `authkey run --env memory -- memory sync --embed`.

## Local Paths

Use symlinked project paths:

- WSL/Linux: `~/Projects/memory-nexus`
- Windows: `C:\Projects\memory-nexus`

Avoid full iCloud paths with spaces in commands, docs, examples, and new tests unless the point of the test is path-decoding behavior.

Runtime data follows XDG-style locations:

- Config: `~/.config/memory/config.json`
- Data: `~/.local/share/memory/`
- Database: `~/.local/share/memory/memory.db`
- Backups: `~/.local/share/memory/backups/`

Legacy `~/.memory` / `MEMORY_HOME` sidecars are compatibility-only and explicit opt-in.

## Quality Gates

Use Bun. Required gates for serious changes:

```bash
bun run typecheck
bun run build
bun test --timeout 15000
bun run test:isolation
bun run eval:v5
bun run eval:v5:market
bun run test:coverage
bun audit
gitleaks detect --no-banner --redact --source .
git diff --check
npm pack --dry-run --json
```

Coverage must pass at each metric independently: statements, branches, functions, and lines all >= 95%.

## Agent Guidance

When resuming work, recover from disk-backed truth first:

1. `git status --short --branch`
2. `.planning/STATE.md`
3. `.planning/ROADMAP.md`
4. `.planning/REQUIREMENTS.md`
5. The active phase directory under `.planning/phases/`
6. `docs/inbox/`
7. Current command output

Treat docs as hypotheses when they conflict with code or runtime evidence. Update stale project guidance as part of the work instead of leaving future agents to rediscover drift.
