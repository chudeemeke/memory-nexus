# Baseline repair status — 2026-09-19

Status: in progress on `fix/baseline-trust-repair`; not release acceptance. The recovered v6 requirements and roadmap remain intact, with Phase 45 unstarted. This report supersedes September 12 findings only where new evidence is listed below.

Delivery: [draft PR #1](https://github.com/chudeemeke/memory-nexus/pull/1) preserves the candidate and recovered documents. The six opening commits have GitHub-verified signatures. The opening hosted query reports no checks; this is pending CI, not green CI. Local logs and the compressed runtime/log archives remain outside Git.

## Implemented candidates

- Reproduced the resolver defect and repaired probing of an unlisted terminal directory. Portable junction fixtures replace tests tied to a personal cloud-directory layout.
- Isolated `NO_COLOR` in the forced-color status test while preserving production precedence.
- Updated compatible direct/transitive dependency versions. The refreshed audit reported zero vulnerabilities across 332 packages. Transformer runtime compatibility beyond the covered paths remains subject to the existing release checks; no local model was downloaded for the offline proposal.
- Redirected default test storage, configuration, hooks, and legacy files into temporary homes, including child commands. A regression first demonstrated default friction-command pollution of an inherited home. Windows can retain locked temporary SQLite files; those are reported rather than hidden. A hook subprocess fixture now also overrides its XDG paths explicitly.
- Protected the existing vector table when replacement-provider initialization fails and ensured factory disposal for initialization and setup failures. A second regression repairs same-dimension model changes incorrectly returning early when every message already has an old embedding. This does not make later model replacement atomic.
- Hardened coverage-summary numeric validation: malformed values, inconsistent reported percentages, and rounded-up below-threshold counts cannot pass. This is not yet the required per-file quality gate.

## Evidence and current limits

The first repair/dependency revision passed the instrumented full run: 4,455 tests, zero failures; statements 97.32%, branches 95.03%, functions 96.51%, lines 97.41%. Its retained summary is `2026-09-19-repair-evidence/pre-hardening-coverage-summary.json`. It predates the later test-store, embedding-lifecycle, and gate changes; its coverage must not be transferred to them.

That summary exposes 85 files below 95% in at least one metric, before stricter Tier S requirements. Current instrumentation omits executable scripts and the gate reads aggregate totals. Per-file risk classification, omission checks, changed-line proof, reviewed applicability for zero-denominator metrics, executable CI, and coverage repairs remain open. The inventory is `2026-09-19-repair-evidence/per-file-coverage-gaps.json`.

The first full run after hardening produced 4,459 passes and one hook-fixture failure. The fixture correction passed all 18 hook tests and a 4,460-test full repeat. Independent review then led to a reproduced ownership-marker loss during partial Windows cleanup. At that revision, cleanup was moved to process exit and restored the marker when locked files had to be retained; B03 later disproved normal-exit invocation on Bun 1.4.1 (correction below); the inherited friction-file sentinel is also checked byte-for-byte. The subsequent full run passed **4,461 tests across 209 files, zero failures**, with 11,005 assertions and one snapshot (241.14 seconds; bare exit 0), on source commit `3a5f8c9`. Type checking was rerun and passed; build and the static test-isolation gate pass. The retained history secret scan passed; that scan alone is not proof for untracked files or the final PR revision. Selected verification inputs are fingerprinted in `2026-09-19-repair-evidence/verification-inputs.json`. Older unmarked temporary directories remain inventoried; no name-only automatic sweep was introduced.

## Owned remaining work

| Work | Owner | Completion trigger |
| --- | --- | --- |
| Final tests, current-source coverage and all release checks | memory-nexus | Required before any ready-for-review/release claim |
| Per-file/Tier S/changed-line/omitted-script enforcement and the 85 known gaps | memory-nexus | Repair before merge/release; aggregate PASS cannot waive these failures |
| Exact-ID historical friction quarantine | memory-nexus | Refresh tuple provenance, dry-run, recoverable backup, rollback proof and independent review before mutation; close before friction-driven prioritisation |
| Atomic embedding model migration and stronger artifact/preprocessing identity | memory-nexus | Required before the proposed offline feature reuses or replaces an existing index; current initialization guard provides narrower protection |
| Coverage runner ownership and full Tier S proof | memory-nexus | B01-B03 scoped path/link/ownership/lifecycle behavior verified; Q086-Q088, complete quality enforcement and final review still required before merge |
| Assembled-diff review, final independent code review and hosted checks | memory-nexus | Draft PR #1 preserves five signed code commits and recovered documentation, with dependencies separate; no merge while quality gates remain open |
| Desktop runtime/clone/cutover verification | memory-nexus | Next successful desktop connection, before retiring its clone or changing authority; September 19 connection timed out |
| Remaining temporary cleanup | memory-nexus | Resolve the automatic approval-review rejection before retrying the rejected removal; do not bypass it |

The three inbox items remain triaged. No historical friction rows have been changed in this repair so far. A successful live Fable READY smoke and proposal review exist, but neither closes all future review gates. Desktop source classification from September 12 does not prove runtime data migration or safe clone retirement today.

The separate code packet review returned APPROVE WITH CONDITIONS. Reproduced cleanup findings were repaired; dependency/runtime compatibility and final-revision review remain open. See `2026-09-19-repair-review-disposition.md`. The ratified September 2 policy at `C:/Projects/conversations/docs/operations/sign-off-policy.md` supersedes the former mandatory human `tuicr` gate: PR #1 is Tier D and needs a concrete owner decision brief once required checks and independent review are ready. `tuicr` remains optional diff-reading tooling. No hosted workflow currently establishes the required quality contract.

The persistent execution contract is `.planning/memory-resilience/EXECUTION.md`; its ledger decomposes the remaining baseline, approved experiment and gated production stages. B01 is the next task. Historical coverage candidates must be rebaselined before treating them as current failures or acceptance.

## Disk management and separate feature proposal

The owner requested project-scoped disk management during repair. Verified archives reclaimed 631,781,536 logical bytes (602.5 MiB); two missing worktree registrations were pruned with branch refs preserved. The live database and recovered work remain intact. See `2026-09-19-disk-ownership.md` for ownership boundaries, archive manifests, pending cleanup and ongoing policy.

The owner approved Step A, the bounded local performance experiment in `../plans/2026-09-19-offline-embedding-decision.md`, to run after baseline repairs. That approval permits the local runtime/model and synthetic tests with recorded resource/disk footprint and removal instructions. It does not approve production feature implementation or source replication. No new runtime/model, scheduler, endpoint, replication path or fallback policy has been activated. The owner's requested desktop role includes both embedding computation and receiving memory data.

## B03 correction and current scoped evidence

The earlier process-exit implementation did not prove normal test teardown. A new
probe showed ordinary Windows Bun 1.4.1 completion skipped that callback; explicit
exit could also delete a replacement test home. Global preload teardown plus original
directory/marker checks repair both. Linux Bun 1.3.14 retained its startup home in
`os.homedir()`, despite changed environment variables. The test harness now redirects
that built-in lookup when needed, including named/default imports; real child
processes retain their native lookup with the isolated startup environment.

Coverage runs use exclusive owned working copies and independent retained report
generations; the actual CLI checks its new summary. Final focused checks: Windows
63 pass; Linux 62 pass and one Windows-specific lock skip; zero failures. Home-path
consumers pass 302 tests on each platform. Typecheck and isolation pass. Retained
source fingerprints, RED/GREEN logs, archive manifests and limits are in
`.planning/memory-resilience/evidence/B03.json`. This is not current full-suite or
complete four-metric Tier S acceptance. B04 is next; Q086-Q088 and the broader
quality/CI/review gates remain open. The approved embedding experiment has not started.

## B04 inventory foundation (incomplete)

The source-bound catalog now accounts for 446 candidates across two packages,
including test support, root tool configuration, the deprecated CLI and inline
browser scripts. Discovery and structural admission have passing focused Windows
(13 pass, one filesystem-specific skip) and Linux (14 pass) checks, plus matching
platform catalog output. Typecheck and static isolation pass.

There are 51 proposed classifications, 395 unclassified entries and no approved
exclusions. `bun run quality:inventory` correctly fails on the unknown tiers.
Source inspection, package-output mapping, metric applicability and independent
review remain B04 work; B04 is not complete and B05 is not unlocked. Q089/Q090
record the new scripts' full Tier S obligations. Evidence: `.planning/memory-resilience/evidence/B04.json`.
