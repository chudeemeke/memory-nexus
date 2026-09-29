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

## Test-driver disk lifecycle findings (batch 5)

Twenty-five infrastructure test drivers have proposed Tier S classifications
because inspected setup/fixture/cleanup code mutates actual filesystem state.
This is a positive risk finding, not blanket classification by filename or proof
that every directory allocation is unsafe. Full assertion review, metric
applicability and independent classification approval remain open.

At source `a4b80f8f2bc3facf011327d99e8b63cb2755ffe9`, four extracted lifecycle
callbacks removed preexisting synthetic markers. The diagnostic used newly
allocated, guarded directories under this checkout's `.git`, remapped only the
callback's scratch target, and invoked actual filesystem operations. No original
test module, existing scratch directory or production memory was used. Exact
callback source, source hashes and results are in
`evidence/B04-scratch-lifecycle-probe.json`; the complete probe source is retained
in `evidence/B04-classification-batch-5.json`. This is not full Bun test-runner
proof or a claim of historical data loss.

| Owner task | Source under src/infrastructure | Observed behavior |
|---|---|---|
| B11.5 | parsers/integration.test.ts | afterAll removes fixed tests/.scratchpad-parsers even if setup reused an existing directory. |
| B11.6 | sources/integration.test.ts | beforeAll pre-deletes fixed tests/.scratchpad-sources. |
| B11.7 | hooks/settings-manager.test.ts | beforeEach pre-deletes fixed home-relative settings-test directory. |
| B11.8 | hooks/hook-runner.test.ts | beforeEach pre-deletes fixed home-relative hook-runner directory. |

B03's isolated test home remains useful protection for home-relative paths. It
does not grant ownership of an arbitrary preexisting child, and the two checkout
scratch paths are outside that home. Each task requires actual runner regression,
concurrent-invocation isolation, preservation of preexisting paths and owned cleanup.

Seven further files visibly swallow cleanup errors. These are source findings,
not injected-failure results in this checkpoint. Each has a separate repair task:

| Owner task | Source under src/infrastructure | Local failure handling |
|---|---|---|
| B11.9 | database/connection.test.ts | cleanupTempDb catches removal errors; caller clears tracked paths. |
| B11.10 | database/health-checker.test.ts | afterAll ignores recursive removal failure. |
| B11.11 | database/integration.test.ts | one catch ignores DB/WAL/SHM removal failures. |
| B11.12 | hooks/auto-memory-writer.test.ts | afterEach ignores recursive removal failure. |
| B11.13 | hooks/sync-hook-script.test.ts | afterEach ignores recursive removal failure. |
| B11.14 | migration.test.ts | afterEach ignores recursive removal failure. |
| B11.15 | signals/checkpoint-manager.test.ts | afterEach ignores recursive removal failure. |

The retirement trigger is verified ownership/retention diagnostics and applicable
Tier S proof before the affected full-suite run and B10/R02. B09 now depends on
the test fixture cleanup tasks, so the complete instrumented run cannot precede
their repairs. Scoped gate fixtures can proceed independently. Reuse appropriate
owned storage primitives during repair; do not create eleven duplicate cleaners.

## Remaining deletion-bearing test drivers (batch 6)

Inspected filesystem imports and the first two actual deletion call contexts in
55 additional test drivers. These have proposed Tier S classifications; the
source-bound packet in `evidence/B04-classification-batch-6.json` retains exact
imports, calls and surrounding lines. This is not blanket classification by test
filename, complete assertion review or runtime failure injection.

The packet lists every finding and its individual task. B11.16-B11.18 own fixed
scratch pre-deletion in export-service, install-command and uninstall-command
tests. B11.19 owns the fallback-ingestion fixture directories allocated without
registered reclamation in friction-service tests. B11.20-B11.65 each own one
file with an inspected catch that silently discards filesystem cleanup failures.
All 50 tasks are explicit dependencies of B09 and B10/R02. Use shared owned
fixture primitives and focused caller proof when repairing them, not 50 copies
of deletion logic. Other deletion-bearing files are not asserted broken merely
because they delete files; B09 and the reviewed tier policy still own their proof.

Q006 additionally owns an assertion-quality gap: the friction-service test named
`handles file delete failure gracefully` deletes its fixture, recreates it,
then invokes ingestion and checks only a returned count of one. It never forces
unlink failure. Its comments acknowledge the untested failure path. Replace that
claim with an actual failure regression and explicit retry/duplicate semantics;
do not cite the current test name as failure-recovery evidence. No production
ingestion failure has been demonstrated by this source inspection.

## Remaining fixture and override lifecycle findings (batch 8)

The final 75 risk proposals comprise 62 A and 13 S drivers. All remain
independently unreviewed; applicability is unfinished and none is excluded.
These additional source observations each have an owner and a gate dependency:

| Owner | Source | Observation |
|---|---|---|
| B11.66 | src/application/services/dreaming-service.test.ts | The fixture allocates an in-memory SQLite database in beforeEach with no explicit teardown. |
| B11.67 | src/application/services/sync-service.test.ts | afterEach resets mock state but does not close the in-memory SQLite handle. |
| B11.68 | src/presentation/cli/commands/extract.test.ts | The fixture silently catches database-close and recursive-removal failures. |
| B11.69 | src/presentation/cli/commands/sync/index.test.ts | Remote-config fixture cleanup silently catches recursive-removal errors. |
| B11.70 | tests/presentation/cli/commands/friction.test.ts | Database mkdtemp directories lack registered removal; fallback ingest test overwrites a home-relative file and restores only when it previously existed. |
| B11.71 | tests/unit/infrastructure/llm/extraction-providers.test.ts | Some fetch overrides restore only after awaited work/assertions; module mocks have no explicit isolation boundary and some rejection expectations are not awaited. |

These are not runtime leak, corruption or network-egress demonstrations. B03
still isolates the test home; it does not establish per-fixture ownership.
Each task must supply focused failure/recovery proof before B09 and B10/R02.
Reuse shared owned-fixture cleanup rather than duplicating deletion logic.
B09 also owns ordered/adjacent module-mock isolation proof for transformers,
embedding-pass and extraction-provider drivers. No live provider/model or
production memory operation ran for this checkpoint.

## Instrumentation and applicability findings

B05.1 owns experimentally confirmed default-export and optional-chain counter
blind spots. B05.2 owns src-only selection (210 of 446 catalog candidates) and
module-wiring/zero-only source accounting. B05.3 owns the two HTML runtime
measurement paths. Their source-bound and synthetic evidence is retained in
`B04-applicability-probe.json` and `B04-counter-boundary-probe.json` under evidence.
B05 is an explicit completion barrier; B07/B09/R02 cannot bypass these tasks.
The library reporting 100% for a zero denominator is not a claim that the current
aggregate checker admits that individual file; it is a reason to reject such
evidence in the planned per-file gate. No existing per-file acceptance is claimed.
