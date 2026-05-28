---
schema_version: "1.0"
created: 2026-05-27
status: current-state-review
scope: dirty working tree after Antigravity remote-sync/event-log work
review_lenses:
  - architecture
  - security
  - quality
  - SOLID
  - WoW
---

# Remote Sync / Event-Log Delta Review

This review treats the live codebase as truth. Docs, roadmap entries, and prior audit claims are used only as intent or comparison material.

## Bottom line

Do not merge or ship the current dirty implementation as-is.

The direction is directionally aligned with the locked A-prime audit: project-owned event log, typed facts, supersedence, and later multi-device sync. The implementation shape is not yet aligned. It is closer to a prototype wired through the CLI than a robust, secure, future-proof memory sync architecture.

Current verified gates:

| Gate | Result | Evidence |
|---|---:|---|
| Full Bun suite | PASS | `bun test --timeout 15000`: 3665 pass, 0 fail |
| TypeScript | FAIL | `bun run typecheck`: 2 errors |
| Test isolation | FAIL | first-party `mock.module` in `src/presentation/cli/commands/sync/index.test.ts:6` |
| Build | MISLEADING PASS | `bun run build` passes because `build:types` runs `tsc --project tsconfig.lib.json || true` and `tsconfig.lib.json` weakens strictness |
| Secrets scan | PASS | `gitleaks detect --redact --source .`: no leaks |
| Dependency audit | FAIL | `bun audit`: 33 vulnerabilities, including 1 critical and direct vulnerable `@anthropic-ai/claude-code <2.1.64` |
| Worktree | DIRTY | 13 modified files, 4 untracked implementation/test files, plus untracked `scratch/test-git.ts` |

## External benchmark lens

Current agent-memory tools converge on a few properties that matter here:

- Memory should be scoped and queryable by dimensions such as user, agent, project, and run, not only by a flat event stream. Mem0 documents memory as a layer for AI agents with user-context persistence and retrieval across interactions: https://docs.mem0.ai/
- Strong memory systems separate always-visible working memory from longer-term archival or recall memory. Letta documents core memory blocks and archival memory as different surfaces: https://docs.letta.com/
- Modern agent memory is increasingly temporal and graph-shaped. Zep documents a temporal knowledge graph with facts and entity relationships for agent memory: https://help.getzep.com/
- LangGraph describes long-term memory in semantic, episodic, and procedural categories, which is a useful taxonomy check for this project: https://docs.langchain.com/oss/python/concepts/memory

The implication: "Git sync for JSONL files" is only a transport mechanism. It is not, by itself, a top-tier memory system. Top-tier quality requires event semantics, scoped retrieval, provenance, temporal invalidation, graph/entity relationships, governance, privacy controls, and predictable recovery.

## Architecture findings

### A1 - Remote sync is implemented in the wrong architectural layer

Files:
- `src/presentation/cli/commands/sync/index.ts:127`
- `src/presentation/cli/commands/remote.ts:10`
- `src/infrastructure/hooks/git-syncer.ts:67`

Issue: the CLI command loads config, dynamically imports infrastructure, constructs `GitSyncer`, runs Git sync, and calls projection rebuilds directly.

Why this is wrong: presentation is orchestrating infrastructure concerns. A robust shape would put sync orchestration in an application service behind ports. CLI should translate user input into a use case call.

Required shape:

- Application service: `RemoteEventSyncService`
- Domain/application ports:
  - `EventStorePort`
  - `RemoteEventTransportPort`
  - `ProjectionRebuilderPort`
  - `MachineIdentityPort`
  - `SecretProviderPort`
  - `ClockPort`
  - `LoggerPort`
- Infrastructure adapter: `GitRemoteEventTransport`
- Presentation command: thin parser only

### A2 - The implementation violates the established test-isolation architecture

File: `src/presentation/cli/commands/sync/index.test.ts:6`

Issue: first-party `mock.module("../../../../infrastructure/hooks/git-syncer.js")` was reintroduced.

Why this matters: the project already established that Bun `mock.module` is process-wide and not safe for first-party seams. This is not taste. It reopens the exact class of pollution that the test-isolation arc closed.

Fix: inject remote-sync dependencies into `executeSyncCommand` via a deps parameter, or move orchestration into an application service and test that service via fake ports.

### A3 - Application layer still imports infrastructure in the extraction pipeline

Files:
- `src/application/services/extraction-pipeline.ts:15`
- `src/application/services/extraction-pipeline.ts:24`

Issue: `ExtractionPipeline` imports `Database` from `bun:sqlite` and imports `appendEvent` / `rebuildProjections` from infrastructure.

Why this matters: the locked A-prime audit required DB tables to be derived projections and event-log SSOT to be load-bearing. If the application service directly knows the database and infrastructure event-log module, it is not cleanly enforcing that boundary.

Fix: extract an `EventWriterPort` and `ProjectionRebuilderPort`. The application pipeline should emit domain events through ports. SQLite and file JSONL are adapters.

### A4 - Current event-log record is not a strong canonical event envelope

Files:
- `src/infrastructure/database/event-log.ts:29`
- `src/infrastructure/database/event-log.ts:49`
- `src/infrastructure/database/event-log.ts:116`

Current record has fact fields and `version: 1`, but it is not a full event envelope.

Missing:

- schema version at envelope level
- event id independent of fact uuid
- operation type: add, update, supersede, delete, noop
- machine id
- per-machine sequence or monotonic local order
- causal parent or predecessor event hash
- origin session id / message ids
- extraction provider/model provenance
- redaction status
- conflict-resolution metadata
- signature/hash/integrity marker

Why this matters: multi-device sync needs deterministic replay and conflict handling. Sorting by `observedAt` plus uuid is not enough when clocks skew, devices race, or two devices supersede the same fact.

### A5 - Projection rebuild is incomplete for a memory platform

File: `src/infrastructure/database/event-log.ts:116`

Issue: `rebuildProjections` deletes and rebuilds only `facts`.

Why this matters: the repo has richer derived surfaces: `entities`, `links`, `session_entities`, `entity_links`, `memory_files`, search indexes, and extraction logs. A function named `rebuildProjections` that only rebuilds one table will mislead future implementers.

Fix: either rename it to `rebuildFactsProjection` or implement a real projection pipeline with per-projection rebuilders and contract tests.

### A6 - Machine identity is not strong enough for sync

Files:
- `src/infrastructure/hooks/config-manager.ts:303`
- `src/infrastructure/hooks/config-manager.ts:312`
- `src/infrastructure/hooks/config-manager.ts:359`

Issue: `loadConfig()` generates and saves `machineId` as a side effect. Write failures are swallowed.

Why this matters: remote sync depends on a durable machine identity. If config is read-only or corrupted, the code may return a generated ID that is not durable, causing a new event-log filename and identity split.

Fix: split read and initialization:

- `readConfig()` is side-effect free.
- `ensureMachineIdentity()` creates and persists identity.
- Remote sync refuses to run if identity cannot be durably persisted.

### A7 - Machine id is used in a path without validation

File: `src/infrastructure/paths.ts:183`

Issue: `getMachineLogPath(machineId)` interpolates loaded config into a filename.

Why this matters: generated UUIDs are safe, but loaded config is user-editable. Path separators or strange characters could escape the intended filename shape.

Fix: make `MachineId` a value object. Accept only UUID or a strict `[a-zA-Z0-9._-]` bounded format. Reject anything with path separators, drive markers, or traversal.

### A8 - Remote config changes are not atomic

File: `src/presentation/cli/commands/remote.ts:63`

Issue: `remote set` saves config before verifying local Git init and remote configuration. If Git fails, config remains enabled.

Fix: validate remote, init/configure transport, then persist config. If persistence fails, roll back transport or report an inconsistent state explicitly.

### A9 - Remote removal is incorrectly modeled as configure-empty

Files:
- `src/presentation/cli/commands/remote.ts:123`
- `src/infrastructure/hooks/git-syncer.ts:96`

Issue: `executeRemoteRemoveCommand` calls `configureRemote("")`, which removes `origin` and then attempts to add `origin` with an empty URL.

Fix: create explicit adapter methods:

- `setRemote(url)`
- `removeRemote()`
- `getRemote()`
- `verifyRemote()`

## Security findings

### S1 - Dependency audit currently blocks release

Command: `bun audit`

Findings include:

- direct `@anthropic-ai/claude-code <2.1.64` with high advisories
- `protobufjs` critical advisory through transitive dependencies
- multiple high issues in `tar`, `vite`, `rollup`, `lodash-es`, `minimatch`, `picomatch`

Required action: update dependencies where compatible, document residual transitive risk, and fail release while high/critical production-impact vulnerabilities remain.

### S2 - API keys are allowed in plain config

Files:
- `src/infrastructure/hooks/config-manager.ts:37`
- `src/presentation/cli/commands/extract.ts:119`

Issue: `config.embedding.apiKey` is supported and preserved in config.

Why this matters: this violates the spirit of secrets management even if no literal secret is hardcoded. A local config file is not a robust secret store.

Fix:

- Prefer env injection or varLock/OS credential store.
- Keep config as a reference to a secret name, not the secret value.
- Add migration warning if config contains `apiKey`.
- Ensure status/doctor never prints secret values.

### S3 - Remote repository URL is unvalidated

Files:
- `src/presentation/cli/commands/remote.ts:55`
- `src/infrastructure/hooks/git-syncer.ts:96`

Issue: any string is accepted as `repositoryUrl`.

Shell-less spawning reduces command-injection risk, but it does not resolve operational risk:

- arbitrary local path remotes
- unsupported protocols
- accidental push to wrong repository
- untrusted remote helper protocols
- private memory facts pushed without explicit privacy warning

Fix: define `RemoteRef` validation. Default allow-list should be `ssh`, `https`, and explicit local-path only behind `--allow-local`. Show a preflight summary before enabling.

### S4 - Browser opening uses shell string interpolation

File: `src/presentation/cli/commands/friction/dashboard.ts:71`

Issue: `exec(`${cmd} "${filePath}"`)` builds a shell command string.

Why this matters: `filePath` is currently derived from `getMemoryDir()`, which can be set by `MEMORY_HOME`. A malicious path containing quotes/shell metacharacters can cross into command injection.

Fix: use `spawn` / `Bun.spawn` with argument arrays and platform-specific command arguments. On Windows, prefer `cmd /c start "" <file>` only with safe argument handling, or use a dedicated opener package with known escaping.

### S5 - QMD detection uses shell `which`

File: `src/infrastructure/external/qmd-runner.ts:72`

Issue: `execSync("which qmd")` is shell-based and non-portable on Windows.

Risk is lower than S4 because there is no user-controlled interpolation, but this is not market-ready cross-platform code.

Fix: use `spawnSync` with command args or a cross-platform binary resolver.

### S6 - Remote sync lacks a privacy and redaction boundary

Files:
- `src/infrastructure/hooks/git-syncer.ts:132`
- `src/infrastructure/database/event-log.ts:29`

Issue: extracted facts can contain secrets, PII, private project data, or proprietary context, and the implementation will commit/push event logs without a redaction gate.

Fix:

- Redact at event creation boundary.
- Store redaction metadata.
- Add `memory audit-secrets` for existing events.
- Add a remote-sync preflight that reports sensitive-event counts before first push.
- Consider encryption-at-rest for remote event logs before declaring multi-device sync secure.

### S7 - Git subprocess environment is too broad

File: `src/infrastructure/hooks/git-syncer.ts:20`

Issue: `ORIGINAL_ENV = { ...process.env }` captures the process environment at module import and passes it to all git subprocesses.

Why this matters:

- runtime env changes are ignored
- secrets in process env are handed to Git and any Git helpers
- tests become order-sensitive

Fix: construct a minimal environment at call time: `PATH`, `HOME`, `USERPROFILE`, `SystemRoot`, Git SSH settings only when needed. Explicitly do not pass API keys unless required.

### S8 - External LLM extraction can leak private session content

Files:
- `src/presentation/cli/commands/extract.ts:118`
- `src/infrastructure/llm/openai-extractor.ts:34`
- `src/infrastructure/llm/anthropic-extractor.ts:37`
- `src/infrastructure/llm/ollama-extractor.ts:34`

Issue: the extraction prompt sends full message content to the configured provider. OpenAI/Anthropic paths are remote. There is no redaction, consent prompt, project allow-list, or provider trust boundary.

Fix:

- Default extraction to local/Claude CLI unless the user explicitly opts into remote providers.
- Add redaction before provider calls.
- Add provider trust labels in `doctor`.
- Add per-project provider policy.
- Never log full provider errors if they may echo request content.

## Quality findings

### Q1 - Typecheck fail is a hard stop

Files:
- `src/infrastructure/database/event-log.ts:14`
- `src/presentation/cli/commands/remote.ts:111`

Current fixes are small, but the existence of typecheck failures means the implementation cannot be called complete.

### Q2 - Build is not a release-quality signal

Files:
- `package.json:18`
- `tsconfig.lib.json`

Issue: `build:types` uses `|| true`, and `tsconfig.lib.json` disables strict checks. `bun run build` can pass while `bun run typecheck` fails.

Fix: release build must fail on type errors. If declaration emit needs relaxed config, it must be a separate non-gating artifact step, not the main build truth.

### Q3 - Coverage standard is still not enforceable at WoW level

Files:
- `bunfig.toml`
- `docs/audits/2026-04-26-adversarial-perf-tests.md`

The project standard requires 95% statements, branches, functions, and lines individually. Bun coverage reports functions and lines only. The old audit already identified this. It remains true unless the runner changed, and current command output still does not provide all four metrics.

Fix: add a runner or coverage tool that reports all four metrics, or explicitly mark the quality standard unmet.

### Q4 - `any` usage is still too high in production paths

Examples:

- `src/presentation/cli/commands/sync/index.ts:111`
- `src/presentation/cli/commands/sync/index.ts:119`
- `src/presentation/cli/commands/remote.ts:94`
- `src/infrastructure/hooks/git-syncer.ts:203`
- `src/infrastructure/llm/extraction-helper.ts:80`

Fix: replace with typed DTOs and `unknown` catch narrowing. For LLM parsing, use a schema validator.

### Q5 - Test evidence is not deep enough for multi-device sync

Current targeted tests pass, but the test shape is insufficient.

Missing test classes:

- two devices append concurrently
- two devices supersede same fact
- clock skew
- corrupt remote event log line
- machine id path traversal
- failed push after successful pull
- failed config save after remote set
- remote URL validation
- projection rebuild from deleted DB
- redaction before remote push
- Windows path and shell metacharacter cases

### Q6 - Untracked scratch debug script should not be part of the worktree

File: `scratch/test-git.ts`

Issue: debug script imports implementation via a `.ts` source path and exercises temp git flows outside the test framework.

Fix: migrate useful scenarios into proper tests, then remove `scratch/` or add it to an explicit ignored scratch policy.

## Inbox truth check

Current `docs/inbox/` items are partly stale:

| File | Current validation |
|---|---|
| `2026-05-11-memory-nexus-bun-windows-full-suite-crash.md` | Stale or needs retriage: full suite passed today on Bun 1.3.5 |
| `2026-05-11-memory-nexus-friction-test-phase-30-orphan.md` | Stale or resolved: file now imports `friction/index.js` and passes |
| `2026-05-11-memory-nexus-programmatic-api-real-db-pollution.md` | Stale or resolved: targeted file passes 50 tests today |
| `2026-05-12-conversations-friction-list-durable-filters.md` | Still valid as future enhancement, but should stay behind architecture/security remediation |

Required action: update statuses and move resolved items to `archived/` with evidence. Do not leave stale triaged prompts as current blockers.

## Correct remediation approach

### Stop-line

Remote sync should not be treated as a Phase 36/37 cleanup. The roadmap says remote sync is Phase 38 / v5.0. The dirty work has effectively pulled a v5 feature into the v4 publishing path without its own threat model, design spec, or acceptance gates.

Recommendation: either revert/park the remote-sync implementation behind a disabled feature branch, or re-scope the current work as "Phase 38 design spike, not mergeable implementation."

### R0 - Restore release gates

1. Fix typecheck.
2. Remove first-party `mock.module`.
3. Fix or explicitly defer dependency vulnerabilities with severity/risk notes.
4. Make build fail on type errors.
5. Remove or migrate `scratch/test-git.ts`.
6. Re-run:
   - `bun run typecheck`
   - `bun run test:isolation`
   - `bun test --timeout 15000`
   - `gitleaks detect --redact --source .`
   - `bun audit`

### R1 - Write a remote-sync threat model before implementation

Required questions:

- What data is allowed to leave the machine?
- Is remote event log plaintext acceptable?
- Are local-path remotes allowed?
- How are secrets redacted before commit?
- Is sync advisory or blocking?
- What happens on conflict?
- What happens when machine identity is missing or not durable?
- What are the rollback and recovery semantics?
- What is the trust boundary for Git helpers and environment variables?

### R2 - Define the event model as a domain contract

Introduce a schema-versioned envelope:

```ts
interface MemoryEventEnvelope {
  schemaVersion: 2;
  eventId: string;
  machineId: string;
  sequence: number;
  observedAt: string;
  recordedAt: string;
  project: string;
  kind: "decision" | "learning" | "preference" | "friction" | "observation" | "supersedence";
  operation: "add" | "update" | "supersede" | "delete" | "noop";
  subjectId?: string;
  supersedes?: string[];
  causality?: {
    previousEventId?: string;
    previousHash?: string;
  };
  provenance: {
    source: "session" | "manual" | "import" | "migration";
    sessionId?: string;
    messageIds?: string[];
    extractor?: string;
    model?: string;
  };
  privacy: {
    redacted: boolean;
    classes?: string[];
  };
  payload: unknown;
}
```

This is not final API design, but it shows the level of structure needed. A fact-shaped JSON object is not enough for multi-device memory.

### R3 - Put remote sync behind ports

Application service:

- validates config and machine identity
- appends local pending events
- asks transport to fetch/pull remote events
- merges event streams deterministically
- rebuilds projections
- pushes only after local state is consistent

Transport adapter:

- knows Git
- never knows fact semantics
- never touches SQLite directly
- uses sanitized env
- validates remotes

Projection rebuilders:

- facts projection
- search index projection
- graph/entity projection, if event log becomes canonical for entities
- extraction audit projection

### R4 - Make security controls first-class

Required before remote sync can be enabled by default:

- remote URL validation
- secret redaction
- optional encryption for remote event logs, or a documented explicit plaintext choice
- sanitized Git environment
- no shell interpolation for browser opening or remote operations
- no API keys in plain config
- provider policy for remote LLM extraction
- audit command to scan existing event logs

### R5 - Build tests around behavior and contracts

Minimum test surface:

- unit tests for `MachineId`, `RemoteRef`, and `MemoryEventEnvelope` validation
- application tests using fake ports
- Git adapter integration tests using temp bare repos
- projection contract tests: delete DB and rebuild from event logs
- conflict tests with deterministic outcomes
- redaction tests
- Windows path and metacharacter tests
- full-suite and isolation gates

### R6 - Only then integrate CLI

After the application service exists:

- `memory remote set` validates and stores config through the service
- `memory remote remove` calls a real remove method
- `memory remote status` compares desired config vs actual transport state
- `memory sync` calls the remote-sync service through a dependency, not direct infrastructure imports
- remote sync failure policy is explicit: warning-only, exit non-zero, or configurable

## Pushback on the current approach

Incrementally patching the current implementation until tests pass would be the wrong move. It would satisfy local gates while preserving the wrong shape: CLI-orchestrated transport, weak event identity, incomplete projection semantics, no privacy boundary, and no conflict model.

The robust path is a short design-and-refactor phase before more code:

1. Restore gates.
2. Freeze remote sync as non-mergeable.
3. Write the threat model and event-envelope contract.
4. Refactor around ports.
5. Reintroduce Git as one adapter.
6. Add multi-device and security tests.
7. Then decide whether this belongs in v4 prerelease, v5 Phase 38, or a separate experimental flag.

That is the path that aligns with SOLID, the locked A-prime audit, the user's WoW, and the standard expected of a serious agentic memory platform.
