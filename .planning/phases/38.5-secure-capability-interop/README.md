---
phase: 38.5-secure-capability-interop
status: complete
started: 2026-06-06
depends_on:
  - 36.8-secret-boundary-optional-provider-interop
  - 38.4-remote-cli-operations-backup-recovery
requirements:
  - INTEG-01
  - INTEG-02
  - INTEG-03
---

# Phase 38.5 - Secure Capability Interop

## Intent

Add optional capability-provider diagnostics that make secret-safe workflows clearer without turning `authkey` or any future provider into a required dependency.

## Non-Negotiable Invariants

- Core memory workflows must pass with no capability provider installed.
- `authkey://...` and future capability references are metadata for diagnostics and documentation, not resolver inputs.
- memory must not call `authkey get` or any equivalent raw-secret retrieval command.
- Status, doctor, and JSON output must return only masked references, fingerprints, handles, proofs, readiness, or availability.
- Deprecated plaintext config remains compatibility-only and must be redacted from all AI-visible output.

## Implementation Shape

1. Define a typed capability-status port at the domain boundary.
2. Add an infrastructure capability registry for optional providers.
3. Implement non-executing provider availability detection for `authkey`.
4. Parse configured references generically by scheme so future providers are not hard-wired into `health-checker`.
5. Add capability interop to health/status/doctor output without counting optional absence as a failure.
6. Add tests proving absence is safe and no raw secret or reference leaks through AI-facing paths.

## Verification

- Focused provider-registry/capability/health/status/doctor tests: 203 pass, 0 fail.
- Full `bun run quality`: 4,234 pass, 0 fail, plus typecheck, build, test isolation, coverage, and dependency audit.
- Coverage: statements 97.14%, branches 95.09%, functions 96.14%, lines 97.26%.
- `gitleaks detect --no-banner --redact --source .` and `git diff --check` passed.

## Completed Implementation

- Added `src/domain/ports/capability.ts` for capability-provider status contracts.
- Added `src/infrastructure/capabilities/capability-status.ts` as a non-executing optional-provider diagnostics registry.
- Provider default secret-env metadata is read from the existing provider registry instead of duplicating provider switches in capability diagnostics.
- `authkey` is detected by PATH only; absence reports `optional_unavailable` and is not a health failure.
- `authkey://...` and future schemes such as `vault://...` are parsed as references and masked with stable fingerprints.
- `memory status` and `memory doctor` include capability interop diagnostics.
- `embedding.apiKeyRef` is masked in status JSON, including malformed or secret-shaped references.
- Runtime env injection readiness reports the env-var name only and never returns the value.
- Deprecated plaintext config is still compatibility-only and redacted from capability diagnostics.
