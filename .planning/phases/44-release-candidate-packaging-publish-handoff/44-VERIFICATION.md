# Phase 44 Verification - Release-Candidate Packaging And Publish Handoff

Date: 2026-07-05
Status: published and registry-backed install verified
Candidate: `@chude/memory@4.0.3`

## Scope Verified

Phase 44 packages the post-Phase 43 Windows hook-launcher fix and release handoff documentation as a patch release candidate. It does not add new product behavior beyond the launcher and user-facing install-hint fixes.

## Release Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | PASS | Completed after version bump |
| `bun run build` | PASS | Completed after version bump |
| `bun test --timeout 15000` | PASS | 4,455 pass, 0 fail |
| `bun run test:isolation` | PASS | Completed after full suite |
| `bun run eval:v5` | PASS | 9/9 fixtures |
| `bun run eval:v5:market` | PASS | 9/9 fixtures, market eligible, 0 blockers |
| `bun run test:coverage` | PASS | Statements 97.31%, branches 95.00%, functions 96.51%, lines 97.39% |
| `bun audit` | PASS | No vulnerabilities reported |
| `gitleaks detect --no-banner --redact --source .` | PASS | 717 commits scanned, no leaks |
| `git diff --check` | PASS | No whitespace errors; CRLF warnings only |
| `npm pack --dry-run --json` | PASS | 214 entries, 394,006 bytes package size, 1,523,806 bytes unpacked |
| Package privacy scan | PASS | No private planning, inbox, temp, tarball, or absolute-path payloads in pack file list |
| `npm publish --dry-run --access public` | PASS | Dry-run publish accepted for public access |
| Isolated npm tarball install smoke | PASS | Installed `chude-memory-4.0.3.tgz`; `memory --version` returned `4.0.3`; `memory --help` and `memory status --json` passed |
| Direct `npm publish --access public --otp=<code>` | PASS | User executed the real publish manually; npm accepted `@chude/memory@4.0.3` with `latest` tag |
| Registry metadata | PASS | `npm view @chude/memory version dist-tags --json` reports `version=4.0.3` and `latest=4.0.3` |
| Registry publish time | PASS | `npm view @chude/memory time --json` reports `4.0.3` at `2026-07-05T23:19:39.577Z` |
| Registry-backed Bun global install | PASS | `bun add -g @chude/memory@4.0.3` installed the `memory` binary |
| Published-package smoke | PASS | `bun run verify:published @chude/memory@4.0.3` reports registry, npm global, and Bun global all at `4.0.3` |

## Bun Install Caveat

Isolated Bun local-tarball global install did not produce a trustworthy gate signal on Bun 1.3.5:

- `bun add -g C:\Projects\memory-nexus\chude-memory-4.0.3.tgz` failed with a dependency-loop resolution against the already-installed `@chude/memory@4.0.2`.
- A follow-up local path install attempt crashed Bun with a segmentation fault and temporarily added a duplicate local `file:C:/Projects/memory-nexus` dependency to `C:\Users\Destiny\package.json` and `C:\Users\Destiny\bun.lock`.
- The global manifest/lock were repaired before publish, then registry-backed install updated `C:\Users\Destiny\package.json` to one `@chude/memory` dependency pointing at `4.0.3`.

Decision: do not use local Bun tarball/path global install as a release gate for this package on Bun 1.3.5. Use isolated npm tarball smoke before publish and registry-backed Bun install smoke after publish.

## Local Installed State

The live Windows binary currently resolves to:

```text
C:\Users\Destiny\.bun\bin\memory.exe
```

`memory --version` returns:

```text
4.0.3
```

This proves the local executable has the fixed candidate installed. Registry publication and global install coherence were also verified:

```bash
npm view @chude/memory version dist-tags --json
bun add -g @chude/memory@4.0.3
bun run verify:published @chude/memory@4.0.3
```

`bun run verify:published @chude/memory@4.0.3` reported:

```text
registry: 4.0.3 latest=4.0.3
npm global: 4.0.3
bun global: 4.0.3
published package smoke: PASS
```

## Screenshot Hook Failure Diagnosis

The user-provided screenshot showed Windows attempting to launch:

```text
bash "C:\Users\Destiny\.bun\bin\aidev memory sync --session abc123 --quiet"
```

Current source no longer emits that launcher shape; hook background sync resolves and launches `memory sync` directly. The active user-level Claude settings checked during this phase contain `Stop`, `SessionStart`, `SubagentStop`, and `PreCompact` hooks, but no active `aidev memory` or `memory sync` hook command. Therefore the screenshot is evidence of a stale generated hook, old process/window, or another config surface, not evidence that the current memory-nexus source still contains the broken hook launcher.

Active docs and codebase inventory files were updated to prefer `memory ...` examples over `aidev memory ...` examples. Older milestone, research, audit, and completed phase artifacts may still contain historical `aidev memory` wording because they document past design intent or past findings rather than current operational guidance.

## Release Execution

The real publish was completed manually/directly with npm, not through `aidev release`:

```bash
npm publish --access public --otp=<code>
```

`aidev release` was not run for `4.0.3`. The manual path was acceptable for this hotfix only because the release gates had already been run and recorded before publish. The tradeoff is that `aidev release` did not create any release metadata/tag automatically.
