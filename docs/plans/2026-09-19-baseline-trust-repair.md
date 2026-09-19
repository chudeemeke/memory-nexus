# Baseline trust repair

Status: executing; owner approved the September 12 recommendations on September 19.
Branch: `fix/baseline-trust-repair`, starting at `96742c7` with recovered work preserved.

Current delivery: draft PR #1, https://github.com/chudeemeke/memory-nexus/pull/1. Implemented candidates and remaining acceptance gates are recorded in `docs/audits/2026-09-19-baseline-repair-status.md`; the plan is not complete.

## Scope and invariants

Repair the existing product before beginning Phase 45. Preserve the recovered v6 requirements and roadmap, prior status evidence, and inbox work. Use focused TDD slices, explicit Git paths, independent review, and final-revision local/hosted evidence. Do not weaken thresholds or discard user data. Desktop authority cutover remains subject to its existing live-session gates.

The owner approved the bounded local embedding experiment (Step A in the offline decision document) on September 19, to run after baseline repairs. Until this plan's acceptance gates close, that experiment remains queued. Production feature implementation and desktop data replication need their separate decisions. No background task, transport, data replication, or provider fallback is activated by this plan.

## Sequence and acceptance

1. **Correctness.** Reproduce both failures. Replace resolver tests tied to the owner's old iCloud path with portable traversable-but-unlisted directory fixtures; repair any demonstrated resolver defect. Isolate the status test's color environment while preserving NO_COLOR precedence. Focused and full tests must pass.
2. **Dependencies.** Refresh audit evidence, inspect affected dependency chains, select compatible patched releases, update lockfile, and prove type/build/test/security compatibility. No blind major upgrade or advisory suppression.
3. **Quality enforcement.** Inventory executable files and package boundaries; classify file risk; reject malformed, missing, stale, below-tier, omitted-file, and changed-line evidence. Prove negative cases and wire CI. Existing coverage gaps remain failures until repaired; no fabricated compliance.
4. **Friction integrity.** Confirm fixture provenance, retain exact-ID dry-run and recoverable backup, implement guarded cleanup/quarantine and test-store protection, then verify production counts and rollback. Never wildcard-delete descriptions or mutate before backup and review of the exact target.
5. **Ownership and review.** Reconcile stale claims and runtime/cutover limits; preserve work in atomic commits and a draft PR. Use tuicr and substantive independent review; merge only after required gates. Update inboxes only to the state actually achieved.

## Test-driven diagnostic order

Resolver hypotheses: stale fixture assumptions; unenumerated terminal-directory probing gap; ambiguous prefix selection. A controlled junction/symlink fixture distinguishes these without consulting personal paths.
Color hypothesis: inherited NO_COLOR wins over the test's FORCE_COLOR as the implementation documents. Clear and restore both variables inside the color-specific test; retain formatter tests covering precedence.

## Likely files

Correctness: `src/infrastructure/sources/project-name-resolver{,.test}.ts`, `src/presentation/cli/commands/status.test.ts`.
Dependencies: `package.json`, `bun.lock`.
Quality: `scripts/check-coverage-thresholds*`, instrumentation scripts/tests, a reviewed per-file policy manifest, `.github/workflows/`, package scripts.
Friction: existing friction application/repository/CLI boundaries and their tests, isolated operational scripts/evidence as required by provenance findings.
Continuity: `.planning/STATE.md`, project guidance, inbox files, this plan, repair verification and offline-embedding decision document.

No new runtime dependency is expected for correctness, coverage validation, or durable local retry design. Dependency security updates may change transitive code and need compatibility proof. Public behavior changes must retain the first-party CLI/JSON/privacy contracts.
