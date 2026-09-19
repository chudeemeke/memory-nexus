# B04 source findings requiring baseline closure

Source checkpoint: `d4ab6ffc8c5c6c5e9694910b640a8428ede38603`.
Owner: memory-nexus. These are source observations, not reproduced current runtime
failures. They are connected to mandatory ledger dependencies before R02; none is
closed by assigning a risk tier. Preserve foreign/ambiguous storage throughout.

## Cleanup diagnostics and ownership

`tests/helpers/test-database.ts` catches recursive deletion errors in both
`createTestDatabase` and `createTestDir` without reporting retained storage. Its
claim that the OS reclaims the directory on reboot is not an established guarantee.
`tests/integration/index.ts` similarly swallows errors in database/session cleanup
and accepts directory arguments in `cleanupTestData` without an ownership check.
`scripts/run-uat-verification.ts` uses an empty catch after sandbox deletion.

This is a confirmed absence of failure reporting in these paths, not evidence that
a particular invocation currently leaked bytes. B03's coverage storage and global
test-home repairs did not cover these separate lifecycles.

- B11.1 owns database/directory helper safety and diagnostics.
- B11.2 owns integration helper safety, callers and diagnostics.
- B11.3 owns UAT sandbox failure reporting and primary-result preservation.

Each requires meaningful failure regression evidence, owned-path checks and
successful cleanup proof before B10/R02. No historical temporary directory may be
deleted solely because its name matches a helper prefix. The separately blocked
14 MB coverage copy remains untouched.

## Evaluation completeness

`scripts/eval-v5/harness.ts` builds readiness blockers from failed results,
blocking failures and contract fixtures. It reports covered dimensions but adds no
blocker for missing required dimensions. `fixtures.ts` validates individual
fixtures, but its inspected `assertValidFixtures` does not enforce suite-wide
dimension completeness or unique fixture IDs. The existing default-suite test
checks all dimensions; that does not enforce arbitrary `--fixtures` input at the
actual CLI boundary. Help also returns a programmatic empty report marked eligible;
its CLI output is help text, so no downstream misuse is asserted here.

B12 must first reproduce the admission behavior with synthetic fixtures, then
separate useful subset evaluation from complete readiness. All required dimensions,
identity rules and non-evaluation reports must have explicit acceptance semantics
and negative tests. This is not a claim that the current default fixture set fails.

## Hook artifact and installed path

`package.json` declares `build:hook` producing `dist/sync-hook.js`, but the normal
`build` runs only cleanup, declarations, library and CLI builds. `clean-dist.ts`
removes the prior dist tree. `install.ts` expects an existing hook artifact and
copies it to the runtime hook directory; its source-relative and current-working-
directory candidates do not establish discovery from a separately installed bundle.

D05 owns a clean isolated build/pack regression and installed execution from an
unrelated working directory. Repair the build chain and discovery if the reproducer
confirms the source concern. D04 depends on D05 so a version-only package smoke
cannot conceal a missing or unreachable hook. No production installation, hook
settings change or package publication is authorized by this finding.

The source-bound package map is `package-boundary-map.json`. It describes declared
outputs and outstanding proof; it does not establish a current tarball's contents.
