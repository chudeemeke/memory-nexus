# @chude/memory 4.0.3 Release Notes

Status: published
Date: 2026-07-05

## Summary

`@chude/memory@4.0.3` is a patch release for the Windows hook-launcher fix discovered during Phase 43 market-readiness verification.

## User-Visible Fixes

- Background hook sync now launches the resolved `memory` executable directly.
- Windows installs no longer rely on a brittle `bash C:\Users\Destiny\.bun\bin\aidev memory sync ...` command path.
- Hook status/stats hints now tell users to run `memory install`, matching the installed binary name.

## Scope Boundary

This release candidate does not add new memory features. It packages the Phase 43 source fix and readiness documentation into a clean patch-release handoff.

Phase 43 approved scoped local-first CLI/API market readiness. It did not approve broad category-leader claims across the full agentic-memory market; MCP/local-server support and public benchmark parity remain future release work.

## Verification Commands

Completed for the release candidate:

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
npm publish --dry-run --access public
```

Verification passed the full source, eval, coverage, security, package privacy, npm pack, npm publish dry-run, isolated npm tarball install smoke, real registry metadata, registry-backed Bun global install, and `verify:published` gates. Local Bun tarball/path global install is not a reliable gate on Bun 1.3.5 for this same-package upgrade path.

## Publish Boundary

Do not run real publish without user OTP authorization:

```bash
npm publish --access public --otp=<code>
```

Post-publish verification:

```bash
bun add -g @chude/memory@4.0.3
bun run verify:published @chude/memory@4.0.3
```

Release execution note: this was published manually/directly with `npm publish --access public --otp=<code>`, not through `aidev release`.
