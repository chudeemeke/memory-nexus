---
phase: 38.6-durable-friction-query-contract
status: complete
started: 2026-06-06
completed: 2026-06-06
depends_on:
  - 38.1-canonical-event-kernel-projection-replay
  - 38.2-redaction-privacy-governance-audit-commands
  - 38.2.5-consent-provenance-governance
requirements:
  - FRIC-01
  - FRIC-02
---

# Phase 38.6 - Durable Friction Query Contract

## Intent

Turn `memory friction list` from an operator-only display command into a stable durable signal contract that first-party tools can call without scanning transient JSONL sidecars.

## Contract Decisions

- `--json` emits a versioned envelope with `schema_version`, `command`, `kind`, `meta`, and `data`.
- `--since <YYYY-MM-DD>` is inclusive from `YYYY-MM-DDT00:00:00.000Z`.
- `--status`, `--severity`, `--category`, `--tool`, and `--project` are exact stored-value filters.
- Default status remains open-only unless `--all` or `--status` is provided.
- `--description-contains` and `--context-contains` are case-insensitive substring filters applied through parameterized SQL.
- Contains query strings are never echoed in text output, JSON metadata, or error context; JSON metadata reports redacted fingerprints only.
- `--count` outputs only the matching count in text mode; JSON mode emits a count payload.
- `--min <n>` exits `0` when `count >= n`, exits `1` when `count < n`, exits `2` for argument/config errors, and exits `3` for execution errors.
- `--limit` controls returned entries, not the total matching count used by `--count`/`--min`.

## Implementation Plan

1. Add repository query options/results that return entries and total matching count without breaking `findAll`.
2. Extend `FrictionService` with a query method that preserves existing list behavior and exposes durable count semantics.
3. Add CLI options for since, severity, project, contains filters, count, and min.
4. Emit versioned JSON envelopes for `memory friction list --json` and stable count payloads for `--count`.
5. Route argument validation errors to exit code 2 and execution failures to exit code 3.
6. Document the contract and update v5 traceability when complete.

## Verification Targets

- Repository tests cover exact filters, inclusive UTC since, case-insensitive contains filters, total-count-with-limit semantics, and parameterized query behavior.
- Service tests prove the application-layer query method composes status/defaults and count semantics correctly.
- CLI tests prove JSON schema stability, text count output, min exit codes, argument error exit codes, DB failure exit code, and no raw contains query leakage.
- Full quality gate, gitleaks, and diff whitespace checks pass before commit.

## Completion Summary

- Added `FrictionQueryOptions` / `FrictionQueryResult` to the repository port and implemented parameterized durable filtering in `FrictionRepository.query`.
- Added `FrictionService.query` with the existing open-only default, explicit `--status` precedence, and `--all` support.
- Extended `memory friction list` with `--since`, `--severity`, `--project`, `--description-contains`, `--context-contains`, `--count`, and `--min`.
- Emitted the shared query envelope for `memory friction list --json`; count mode emits `{ "count": n }` and text count mode prints only the count.
- Documented the stable contract in `docs/reference/friction-query-contract.md` and linked it from the README.
- Added focused repository, service, CLI, envelope, port, and integration coverage for exact filters, UTC date semantics, limit-independent counts, threshold exit codes, argument errors, DB errors, and privacy-safe filter metadata.

## Verification

- `bun run quality`: PASS (4,250 tests, 0 fail)
- Coverage gate: PASS - statements 97.17% (8740/8994), branches 95.19% (5548/5828), functions 96.17% (1635/1700), lines 97.29% (8370/8603)
- `bun run test:isolation`: PASS (as part of `bun run quality`)
- `bun audit`: PASS, no vulnerabilities (as part of `bun run quality`)
- `gitleaks detect --no-banner --redact --source .`: PASS, no leaks
- `git diff --check`: PASS (line-ending warnings only)

## Notes

- The contract uses `schema_version: "1"` to match the existing common query envelope.
- `--limit` constrains returned rows only; it does not change the total count used by `--count` or `--min`.
- Contains filters are case-insensitive and parameterized; raw contains values are not returned in stdout, stderr, JSON metadata, or error context.
