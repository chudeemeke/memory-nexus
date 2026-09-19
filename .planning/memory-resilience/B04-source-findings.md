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

## Reproduced input-boundary defects (batch 2)

At source `aa2c449cd2d72828e81a7ea691a12ca2b400323c`, synthetic in-memory probes
confirmed four failures. The exact probe source and report are retained in
`evidence/B04-classification-batch-2.json` and `evidence/B04-input-probes.json`.
Probe exit 0 means the diagnostic ran; it does not mean these behaviors passed.

- Q091: `LlmExtractor.parseExtractionResponse("null", "synthetic")` throws on
  `parsed.topics` instead of safely handling a malformed response shape.
- Q092: `ContentExtractor.extractToolUses` throws on a null member of the message
  content array when reading `block.type`.
- Q093: `Entity.create` accepts `NaN` confidence despite its documented 0-1 range.
- Q094: `SearchResult.create` accepts `NaN` score despite its documented 0-1 range.

These are individually owned baseline-quality tasks with explicit B10 dependency
barriers. Each needs RED/GREEN regression, related malformed-input cases and full
Tier S acceptance. No persistent memory, provider call or model download was used.

## Exported legacy extraction limitation

The inspected `LlmExtractor.extract` creates a prompt but returns empty entities
and summary for nonempty input. Its comments describe future hook-context behavior;
they do not implement it. Source references include `hook-runner.ts` calling this
method and the library's application exports exposing the class.

D04 owns consumer-contract disposition before R02: trace the current hook and
exported API call paths, distinguish the functioning extraction pipeline from
this legacy method, and either repair the advertised behavior within accepted
scope or explicitly retire/document the unsupported contract with review. Do not
count a successful call returning empty output as proof of LLM extraction. No new
provider service, egress permission or paid inference is authorized by this finding.

## Reproduced invalid timestamp admission (batch 3)

At source `39c895b13e768bd607070efbc3496d47a821b257`, the synthetic call
`normalizeTimestamp("2026-99-99Tnot-a-time")` returned its input unchanged, and the
returned string did not parse as a valid Date. The ISO-looking fast path checks a
prefix rather than timestamp validity. Exact probe source and output are retained
in `evidence/B04-classification-batch-3.json` and `evidence/B04-timestamp-probe.json`.

Q041 already owns this module and now includes the confirmed defect and stricter
Tier S requirement. It must establish an explicit invalid-input policy, add
RED/GREEN and valid-boundary regressions, and verify actual ingestion consumers
before B10/R02. This diagnostic does not prove corruption of any stored record.

## Command-test cleanup diagnostics (batch 4)

The reusable command-test helper `commands/_helpers/capture-json.ts` removes
tracked temporary database files and sidecars, catches every removal failure,
then clears the tracker. Source inspection establishes silent failure handling;
it does not establish that a foreign path was actually removed. B11.4 owns
ownership-bound cleanup and retained diagnostics, with partial-failure and foreign-
path regressions before B10/R02. This helper is executable test support, not an
automatically excluded test registration file.

## Reproduced presentation defects (batch 4)

At source `8719e3c36b2c73ca11f8ee4879c9f17aed4f2849`, synthetic formatter probes
confirmed the following. Exact probe sources and hashes are retained in
`evidence/B04-classification-batch-4.json`; reports are
`evidence/B04-presentation-probes.json` and `evidence/B04-dashboard-tokens.json`.

- Q095: JSON output with a context budget of 100 returned 672 characters and one
  result. The fitting loop retains the final one-result serialization when none
  fits. Define below-minimum valid-JSON budget behavior and prove it with focused
  RED/GREEN tests, then the module's four-metric acceptance and review.
- Q081: dashboard category markup became an HTML element, and a description
  containing a closing script tag escaped the embedded script block. Python's
  standard HTML tokenizer recognized both inert marker elements in generated HTML.
  Q081 now requires Tier S context-specific escaping and actual browser regression
  evidence for attacker-controlled fields, followed by adversarial/decision checks.

Probe exit 0 means the diagnostic executed, not that the behavior passed. No
browser JavaScript was executed and no production memory was read or changed.
The generated synthetic HTML remains local under `.git`; the exact probe source
allows regeneration in an isolated checkout. Both findings are mandatory baseline
dependencies. Neither defect has been repaired by this classification checkpoint.
