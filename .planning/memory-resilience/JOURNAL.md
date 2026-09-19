# Memory resilience execution journal

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
