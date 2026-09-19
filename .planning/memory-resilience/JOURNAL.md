# Memory resilience execution journal

## 2026-09-20 - B04 infrastructure classification

- Proposed tiers for the remaining 61 non-test infrastructure modules, including
  individually inspected writes in 17 repositories, provider/consent paths,
  parsing and runtime storage boundaries. Thin forwarding adapters and fixed
  defaults remain distinct from the critical code they call.
- Current inventory: **181 proposed, 265 unclassified, zero approved exclusions**.
  Remaining null-tier entries are presentation modules and test drivers.
- Reproduced invalid ISO-looking timestamp admission with a pure synthetic call;
  Q041 now owns the confirmed defect and full Tier S requirements. No claim of
  observed stored-data corruption. Ledger remains 146 items (52 delivery/gates,
  94 quality candidates); no duplicated repair task was created.
- Source hashes and ledger invariants checked; actual inventory gate rejects
  265 unknown classifications. See `evidence/B04-classification-batch-3.json`.
  No executable source changed; no numeric coverage or full-suite acceptance.
- Next: remaining presentation modules and test drivers, individual metric
  applicability and independent review. B04 remains active; B05 pending. Existing
  external review and inbox obligations remain open. No provider calls, model
  downloads, real memory mutations or old worktree cleanup.

## 2026-09-20 - B04 application/domain classification and input probes

- Inspected all remaining non-test application/domain candidates and proposed
  49 additional tiers. Current inventory: **120 proposed, 326 unclassified,
  zero approved exclusions**. Critical data/consent/input boundaries are Tier S;
  pure record/statistics helpers and fixed error/contract wiring are distinguished.
- Reproduced two malformed-input parser exceptions and two accepted NaN values
  using synthetic in-memory calls. Q091-Q094 own regression, repair and Tier S
  proof and are required B10 dependencies. Diagnostic exit 0 is not test acceptance.
- Recorded the exported legacy LlmExtractor.extract empty-result limitation for
  D04 consumer-contract disposition. Existing comments do not prove hook inference.
- Ledger: 146 items (52 delivery/gates, 94 quality candidates). Source and numeric
  coverage remain unchanged. The actual gate rejects 326 unknown classifications;
  see `evidence/B04-classification-batch-2.json` for checks, hashes and probe source.
- Next: infrastructure/presentation modules and test drivers, individual metric
  applicability and independent review. B04 remains active; B05 remains pending.
  No production data, service, runtime/model installation or old worktree cleanup.

## 2026-09-19 - B04 first source-classification batch and package mapping

- Inspected and proposed tiers for 20 additional modules: remaining verification
  scripts, reusable test helpers, three pure allocation/ranking modules and the
  hook install boundary. Current total: **71 proposed, 375 unclassified, zero
  approved exclusions**, across the same 446 candidates and two packages.
- Added source-bound package output mapping, including the separately declared
  hook build and deprecated CLI. Mapping is not built-artifact or installed proof.
- Recorded source findings for silent cleanup failures, evaluation completeness
  and hook packaging/discovery. New B11.1-B11.3, B12 and D05 items have concrete
  regression requirements and block baseline acceptance through B10/D04. These
  are not claims of reproduced runtime failures. Ledger now has 142 items:
  52 delivery/gates and 90 quality candidates.
- No executable source changed. See `evidence/B04-classification-batch-1.json`
  for source hashes and actual admission/binding checks. Earlier test counts
  remain evidence of their unchanged source; no fresh full-suite acceptance.
- B04 remains active. Next: remaining domain/application/infrastructure/presentation
  modules and test drivers, individual metric applicability, independent review.
  B05 remains pending. Fable's quota-blocked review is not approval and has not
  been repeatedly retried. Other authorized ready work remains available.
- Free disk observed at about 1.97 GiB before this small documentation checkpoint.
  No model/runtime install, production mutation or cleanup of old work copies.

## 2026-09-19 - B04 discovery/checking foundation preserved; classification remains active

- Added read-only catalog discovery and structural inventory admission with real
  disposable-Git/CLI regressions. Tracked/new source, nested packages, shebangs,
  executable modes, declarations/re-exports and browser code are accounted for.
- Corrected Git traversal through Windows junctions before admission: inspect
  tracked ancestors first and expand untracked directories only after link checks.
  RED/GREEN logs also cover misleading suffixes, erased value imports and omission.
- Catalog: **446 candidates, two packages** (199 executable modules, 211 test
  drivers, 23 re-exports, 11 modules with no local code, two browser documents).
  Windows/Linux catalog output matches. These are syntax facts, not risk approval.
- **51 proposed classifications; 395 unclassified; zero approved exclusions.**
  The live `quality:inventory` command correctly exits 1 with 395 issues. Its
  structural checker never grants independent review or coverage acceptance.
- Final focused checks: Windows 13 pass/one case-sensitive-filesystem skip;
  Linux 14 pass; zero failures. Typecheck/static isolation pass. Source hashes,
  raw/normalized logs and exact limits are in `evidence/B04.json`.
- B04 remains **active**, not verified. Next: inspect the remaining null-tier
  entries, beginning scripts and reusable test support; map package outputs and
  metric applicability; then obtain independent review. B05 remains pending.
- Added Q089/Q090 and B10 dependencies for the new gate modules' full Tier S
  coverage and decision checks. Ledger: 137 items (47 delivery/gates, 90 quality
  candidates). New actual gate invocation is available through package scripts;
  complete quality/CI integration remains B04-B08/R01.
- No production runtime/model, replication or external service was activated.
  Only project evidence was archived; no old work copy or ambiguous tree deleted.


## 2026-09-19 - B03 owned storage and test-home lifecycle verified; B04 next

- Coverage runs now exclusively claim a fresh work directory and retain separate
  owned report generations. Existing sources, foreign directories and prior reports
  survive. The actual CLI gates its exact generated summary; no shared latest pointer.
- Retained RED/GREEN evidence covers replacement/copied/malformed/missing markers,
  PID reuse, concurrent processes, abrupt death, real Windows locks, allocation and
  child/instrumentation failures. Empty unmarked claims use non-recursive cleanup;
  partial ownership remains diagnosable. See `evidence/B03.json` and B03-storage-plan.md.
- Corrected the earlier lifecycle claim: normal Bun completion skipped the exit
  callback in the probe. Global preload teardown now owns normal cleanup, with an
  explicit-exit fallback and directory/marker identity checks. Linux Bun 1.3.14 also
  retained the startup home in its built-in lookup: a test-only OS adapter repairs
  named/default import paths, while a real child validates the isolated startup environment.
- Final Windows focused run: 63 pass, 0 fail, 275 assertions. Linux: 62 pass,
  1 Windows-lock-only skip, 0 fail, 267 assertions. Home consumers: 302 pass on each
  platform, 672 assertions each. Typecheck and static isolation pass. These scoped
  checks do not replace current full-suite, four-metric or clean-install acceptance.
- Ledger: 135 items (47 delivery/gates, 88 quality candidates). Q087/Q088 explicitly
  own storage-helper and preload Tier S proof; Q086 retains runner gaps. All are B10
  dependencies. Missing statements/branches cannot be accepted as green coverage.
- Preserved 2,571,698 bytes of legacy coverage plus a 102-byte synthetic failed-probe
  artifact in the project archive; before/after hashes and manifests retained. No
  deletion of the separately policy-blocked old copy, runtime/model download or
  production feature activation. Last disk observation: about 2.13 GiB free.
- Next: **B04**, complete executable-file/package/risk/applicability inventory,
  then B05 instrumentation. Independent final review and hosted CI remain open;
  Fable quota failure has not changed and is not an approval. Native goal stays active.


## 2026-09-19 - B02 linked-path safety verified; B03 next

- Reproduced deletion through a coverage ancestor junction, replacement of a work
  junction, project deletion through a work-parent alias, and external TypeScript
  rewriting through a copied source junction. Every reproduction was confined to
  a newly created disposable fixture; retained RED/GREEN logs document the failures.
- Added linked-output checks, resolved work/project disjointness, source-copy
  preflight and per-entry checks. Canonical project-root junctions remain usable by
  copying their resolved directory; ignored dependency junctions remain linked.
- Internal coverage work directories now must be physically outside the project.
  In-project `.coverage-work` is rejected before mutation rather than copied into itself.
- Final focused Windows Bun 1.4.1 and Linux/WSL Bun 1.3.14 runs each passed 23 tests,
  129 assertions and two real child fixtures. Final typecheck passes. Evidence/input
  hashes: `evidence/B02.json`. WSL uses a newly created `~/Projects/memory-nexus`
  symlink to this checkout; no second clone, runtime install or dependency install.
- This is scoped behavior acceptance, not complete Tier S acceptance. Added Q086
  and its B10 dependency: the script's focused native report has 88.00% functions
  and 94.51% lines; statements/branches remain unmeasured by that native report.
  The ledger now has 133 items: 47 delivery/gate items, 85 historical candidates,
  and this newly observed script-quality candidate.
- Next: **B03**, ownership before any recursive work/output replacement, safe run
  lifecycle and retained cleanup metadata. A valid name or descendant path alone
  still must not authorize removal of an existing source/foreign directory.
  Add a RED fixture for `coverageDir=project/src` and a foreign prefixed workdir,
  then design exclusive owned run directories and eligible cleanup using existing
  test-store ownership patterns. Include process-identity/PID reuse, crash/locked
  files and concurrent replacement. Do not run full repository instrumentation
  until this boundary is repaired. Final independent review remains R02.

## 2026-09-19 - B01 containment regression repaired

- Reproduced actual deletion of disposable fixture sentinels for project-root and
  sibling-prefix output paths; both retained RED runs exited 1. The original guard
  used a string prefix rather than a strict path-descendant check.
- Candidate now rejects root, ancestor, normalized traversal and sibling output
  before mutation. A valid dot-prefixed descendant runs a real instrumented child
  test and produces all four nonzero fixture metrics without changing source.
- Focused suite: 14 pass, 0 fail, 79 assertions; child fixture: 1 pass. Typecheck
  passes. Evidence and input hashes: `evidence/B01.json`. This is scoped B01 proof;
  whole-runner Tier S quality and final independent review remain open.
- Next item: **B02**. Add a linked coverage-ancestor regression using only a fresh
  disposable fixture, then inspect overlapping work/output paths and source-copy
  links. Instrumentation must never write through a copied link outside its workdir.
- B03 must additionally prove directory ownership before replacement: a strict
  descendant alone is not permission to delete an existing source/report directory.
- No full repository instrumentation was run through the still-incomplete safety
  boundary. The previously policy-blocked old coverage copy was not touched.

## 2026-09-19 - Execution system established

Native goal created at 2026-09-19T20:02:57Z, status **active**, thread
`01a09507-57c9-7441-ac18-d294f37ab075`. No token budget was requested or set.
Use `get_goal` for live status; this journal is a recovery checkpoint.

- Owner asked for precise end state, atomic verifiable work and persistent progress.
- Starting source/plan revision: `77d54e05be7fc24cede4a9a3e1fede6fa113ac8f` on
  `fix/baseline-trust-repair`. Worktree was clean before this planning work.
- Draft PR #1 is open. No hosted status checks were reported at this checkpoint.
- Last full suite evidence: 4,461 pass / 0 fail at source `3a5f8c9`; this is not
  current-source instrumented coverage or final merge acceptance.
- Historical coverage has 85 below-floor candidates; complete inventory and fresh
  per-file/Tier S enforcement are still pending. Ledger starts with 132 items.
- Baseline repair and post-baseline synthetic inference experiment are authorized.
  Production local feature, replication and adoption retain recorded decision gates.
- Reconciled stale human-tuicr guidance with the ratified September 2 sign-off
  policy. PR #1 requires a concrete Tier D decision brief when ready, not human
  diff navigation. No approval has been requested for an unfinished result.
- Three active inbox reports remain triaged; this planning checkpoint does not
  close their actual outcome requirements.
- Read `EXECUTION.md` and `work-items.json` before work. Current next item: **B01**.
  Next command: `bun test scripts/run-istanbul-bun-coverage.test.ts`; then add the
  meaningful rejected-target/sentinel RED cases before changing the guard.
- No product source changed in this execution-system checkpoint. No local runtime,
  model, scheduler or replication was activated.
- Independent plan review was attempted only as a live Fable/low READY smoke:
  exit 1, `You're out of usage credits`. No review occurred. Retry after route
  availability changes, before the relevant delivery gate; keep authorized work moving.
- Local dependency review removed the L05 prerequisite from replication C07,
  made negative S03/S04 measurements valid inputs to S05, and added the complete
  quality queue to B10's explicit dependencies. Source transfer progress derives
  from durable records/manifests rather than a second plaintext corpus queue.
