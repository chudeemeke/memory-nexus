# Phase 44 Plan - Release-Candidate Packaging And Publish Handoff

Created: 2026-07-05
Status: release candidate prepared; publish pending OTP

## Objective

Prepare a clean `@chude/memory@4.0.3` release candidate from the post-Phase 43 source tree, prove it is package-safe and installable, install the fixed artifact locally for live use where the installer is trustworthy, and stop before real npm publish until the user provides OTP authorization.

## Starting Truth

- Registry `latest` is `@chude/memory@4.0.2`.
- Current source is ahead of `4.0.2` after the Windows hook-launcher fix.
- At phase start, installed `memory --version` reported `4.0.2`.
- After candidate install/smoke, the live Windows binary reports `4.0.3`, but Bun's global manifest still references registry `4.0.2` until `4.0.3` is published and installed from the registry.
- Phase 43 passed scoped local-first CLI/API market readiness.
- Broad market-leader claims remain blocked until MCP/local-server support and public benchmark parity are implemented or explicitly dispositioned.
- Historical release hygiene issue: local tag `v4.0.2` points at `44a8707`, while later local docs say commit `6155b68` was published and verified as `4.0.2`. Do not rewrite the tag silently during this phase.

## Version Decision

Use `4.0.3`.

Rationale:

- The release contains a backward-compatible Windows launcher bugfix.
- The public package name remains `@chude/memory`.
- No CLI contract or persisted data format requires a minor or major bump.
- `4.0.3` creates a clean release handoff point after the historical `4.0.2` tag/package ambiguity.

## Scope

In scope:

- Bump package metadata and verification defaults to `4.0.3`.
- Update changelog and release notes.
- Rebuild package artifacts.
- Run quality/security/package gates.
- Prove package privacy with `npm pack --dry-run --json`.
- Create an installable tarball and smoke-test it in an isolated npm prefix.
- Treat local Bun tarball/path global install as blocked on Bun 1.3.5 because it produced a dependency-loop failure and one Bun crash during this phase.
- After real publish, install from the registry with `bun add -g @chude/memory@4.0.3` and verify with `bun run verify:published @chude/memory@4.0.3`.
- Record verification and update planning state.
- Commit the release-candidate work.

Out of scope:

- Real `npm publish`.
- Moving or rewriting historical tags.
- Claiming category leadership beyond the scoped Phase 43 decision.
- Adding new product features.

## Gates

Required before local install or publish handoff:

- `bun run typecheck`
- `bun run build`
- `bun test --timeout 15000`
- `bun run test:isolation`
- `bun run eval:v5`
- `bun run eval:v5:market`
- `bun run test:coverage`
- `bun audit`
- `gitleaks detect --no-banner --redact --source .`
- `git diff --check`
- `npm pack --dry-run --json` plus package privacy scan
- Isolated npm tarball install smoke with `memory --version`, `memory --help`, and `memory status --json`
- Registry-backed Bun install smoke after publish
- `npm publish --dry-run --access public`

## Stop Condition

Stop before real `npm publish --access public --otp=<code>`. The user must provide OTP authorization in the terminal session.
