# @chude/memory

`@chude/memory` is the first-party memory infrastructure layer for this project portfolio. The repository name is `memory-nexus`; the package and binary are `@chude/memory` and `memory`.

## Product North Star

Before planning, implementation, review, or release work, read `.planning/PROJECT.md` and treat its Product North Star section as normative.

The intended end state is not a Claude-log search CLI. It is a local-first, privacy-governed, auditable memory substrate that lets multiple projects and agents carry forward verified context, decisions, preferences, friction, facts, and derived knowledge without relying on stale chat summaries or scattered notes.

Do not silently remove stated, inferred, prototype, disabled, or partial features. Complete them, explicitly own them in a later phase, or document why they are a non-goal.

## Current State

Resume from `.planning/memory-resilience/EXECUTION.md`, `work-items.json` and `JOURNAL.md` in that directory, then reconcile the native goal, live Git and PR state. Current readiness evidence is `docs/audits/2026-09-19-baseline-repair-status.md`; September 12 evidence and release completion below are historical. Recovered v6 planning is committed; Phase 45 has not started. Baseline repair and the subsequent bounded synthetic embedding experiment are authorized; production local availability and desktop replication retain separate decisions. Before a mandatory Fable review, require a live readiness smoke and substantive retained review output, as tracked in `docs/inbox/2026-07-23-remotely-fable-auth-preflight-notice.md`.

Use the ratified `C:/Projects/conversations/docs/operations/sign-off-policy.md`: Tier M may merge after required checks; Tier D needs a concrete owner decision brief. It supersedes the old mandatory human `tuicr` gate. Continue routine authorized work without asking whether to proceed. Preserve all valuable dirty/recovered work and record revision-bound evidence per work item.

- v4 is published as `@chude/memory`.
- v5 Market-Leader Memory Platform is active.
- Phase 42.5 is complete.
- Phase 43 is complete with scoped local-first CLI/API market readiness approved.
- Phase 44 is complete: `@chude/memory@4.0.3` is published and registry-backed npm/Bun installs are verified.
- The real `4.0.3` publish was performed manually/directly with `npm publish --access public --otp=<code>`, not through `aidev release`. The release gates were already run and recorded before publish.
- Current npm `latest`, local Windows `memory.exe`, npm global smoke, Bun global smoke, and `C:\Users\Destiny\package.json` all resolve to `4.0.3`.
- Do not use local Bun tarball/path global install as a release gate for this package on Bun 1.3.5; Phase 44 observed a dependency-loop failure and a Bun segmentation fault in that path.

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

Memory Nexus owns its checkout, worktree, temporary verification, and runtime backup storage. Follow `docs/audits/2026-09-19-disk-ownership.md` for verified archives, retained worktree refs, cleanup limits, and ongoing retention rules. Preserve active/uncommitted work and do not clean other projects or shared caches.

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

The shared quality contract in `~/.claude/rules/quality-standards.md` is authoritative: enforce all four metrics per executable file and package, the stricter Tier S branch/adversarial requirements, changed-line coverage, and explicit reviewed exceptions. The current aggregate gate does not establish that compliance. The September 19 repair inventory records 85 files below the ordinary floor before Tier S assessment; release acceptance remains blocked until enforcement and gaps are repaired.

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
