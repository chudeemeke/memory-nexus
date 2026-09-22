# Resilient memory execution contract

Status: executing authorized baseline work; production implementation remains gated.
Owner: memory-nexus. Established: 2026-09-19.

## Purpose and authority

Deliver useful local memory while the desktop is unavailable, followed by reliable,
privacy-governed desktop catch-up. The desktop must retain permitted source memory
and compute its own embeddings. Local inference is conditional on the approved
resource experiment demonstrating that it is practical without unnecessary complexity.

The minimum execution system is a native persistent goal, this contract, the
[work ledger](work-items.json), revision-bound evidence, and the existing PR/CI
workflow. The goal drives progress; the ledger records dependencies and acceptance;
Git and evidence preserve recovery. No second scheduler or orchestration service is
needed. This is an execution workstream before v6 Phase 45, not a claim that the
server, MCP, public benchmarks, or desktop workspace-authority cutover are complete.

Sources of authority:

- [Product North Star](../PROJECT.md).
- [Accepted baseline repair](../../docs/plans/2026-09-19-baseline-trust-repair.md).
- [Offline design and approved Step A](../../docs/plans/2026-09-19-offline-embedding-decision.md).
- Portfolio strategy: `C:/Projects/conversations/docs/strategy/minimum-acceptable-end-state.md`.
- Ratified sign-off policy: `C:/Projects/conversations/docs/operations/sign-off-policy.md`.
- Shared quality policy: `C:/Users/Destiny/.claude/rules/quality-standards.md`.

The owner approved baseline repair, project-owned disk management, and the bounded
synthetic local-runtime/model experiment after baseline acceptance. The September 19
request additionally authorizes this execution system and persistent pursuit of the
end state. It does not silently approve previously reserved production decisions.

## Observable end state

| ID | Required outcome | Acceptance evidence |
|---|---|---|
| E1 | Desktop unavailability does not prevent durable local capture or keyword search. | Real temporary databases; disconnect, process kill, restart and disk-full tests; acknowledged records survive. |
| E2 | A compatible local encoder supplies useful offline semantic search within the agreed resource budget. | Approved synthetic experiment plus installed-artifact query/retrieval tests; matching document/query recipe and model identity. |
| E3 | After the next enabled sync, the desktop retains all permitted authoritative data classes and computes its own searchable index. | Explicit data inventory; source/receiver IDs, revisions and hashes reconcile; desktop FTS and semantic queries retrieve received records. |
| E4 | Interrupted, repeated, or concurrent work resumes without lost acknowledged data, duplicate durable effects, or stale vectors. | Lost receipts, partial transfers, simultaneous hooks, stale claims, process restart and concurrent edits tested through real processes. |
| E5 | Consent, redaction revisions, suppression and deletion survive queues and restoration of either machine. | Adversarial sender/receiver tests; tombstone and receiver-epoch reconciliation; unauthorized egress and resurrection fail closed. |
| E6 | Model changes preserve a usable index until a verified replacement is ready. | Pinned artifact/input identity; mismatched dimensions and recipes rejected; interrupted migration retains the prior generation. |
| E7 | CLI/JSON distinguish local capture, embeddings and desktop copy, including pending and failed states. | Public contract tests cover partial completion, strict/deferred semantics, retry guidance and compatibility. |
| E8 | Final source and packages meet the actual shared quality contract. | Complete file inventory; all four metrics per file/package; Tier S 100% branches, adversarial and decision checks; changed-line proof; negative gate tests; required Windows/Linux hosted checks and final-revision independent review. |
| E9 | The accepted artifact works on the real machines and can be rolled back. | Isolated real-desktop synthetic proof, then approved installation; two successful enabled cycles around an offline interval and process restart, plus recovery/rollback evidence. |
| E10 | Progress and storage remain recoverable and bounded. | Current journal and task evidence; verified archives before destructive maintenance; runtime/model footprint and removal procedure; no ambiguous worktree discarded. |

Automatic catch-up means a bounded retry on the next existing enabled hook or
explicit sync while the machine is awake. Connectivity alone is not an execution
trigger. A stronger scheduled-retry promise requires a separate footprint decision.
Native goal persistence is not a promise that this agent runs with its app/runtime
stopped or the machine asleep.

## Sequence and gates

The ledger contains 47 delivery/gate items and 85 historical per-file coverage
candidates at creation. The candidates are not 85 confirmed current failures: B09
must refresh them and add omitted files or stricter-tier gaps. Never freeze the
denominator to the historical count.

| Stage | Ledger items | Verifiable checkpoint |
|---|---|---|
| Safe verification | B01-B08, including B05.1-B05.3 | Destructive output paths are guarded; complete, fresh, revision-bound evidence is measured and enforced; known violations fail. |
| Baseline repair | B09, Q001-Q085 and discovered gaps, B10; B11.1-B11.74 and discovered children, B12; D01-D05 including D04.1-D04.4; F01-F03 | Every required coverage gap repaired; helper cleanup, complete evaluation admission and packaged hooks proved; actual dependency/runtime and consumer compatibility proved; exact synthetic friction cleanup recoverable and verified. |
| Baseline delivery | R01-R04 | Final checks and independent review; one concrete Tier D brief; accepted integration and post-merge proof. |
| Bounded experiment | S01-S05 | Synthetic local inference measured against hard targets; pass/fail/inconclusive report and retained resource/removal evidence. |
| Production specification and decision | P01-P03 | Complete data/topology/privacy/recovery specification; separate local-compute and replication decisions supported by evidence. P01/P02 can proceed during external waits. |
| Local availability | L01-L05, only after the applicable P03 decision | Single compatible local index, atomic generation changes, durable bounded progress and truthful CLI. |
| Desktop replication | C01-C08, only after the applicable P03 decision | Authenticated, idempotent source transfer; receiver receipts/epochs; governance/restore correctness; useful desktop retrieval. |
| Operational acceptance | A01-A05 | Fault matrix, real desktop proof, adoption decision, installed operation, rollback, final reconciliation and goal closure. |

B10 explicitly depends on all required Q items. B09 must append newly discovered
gap tasks to that barrier. A05 additionally checks the complete ledger, not merely
the final dependency chain. A verified negative experiment result closes S05 as an
experiment, not E2 or the overall goal. Revise the product target only with an
explicit owner decision; never silently substitute keyword-only operation or a
second model to declare success.

The historical standalone UAT checker was retired under B11.3 after consumer and
purpose review. Its required product outcomes remain in D04.1-D04.4; B10 depends
on D04 and R02 requires both. Retirement does not substitute for installed-package
acceptance. The retained [disposition](B11.3-retirement.md) distinguishes existing
source-level tests from pending artifact-specific proof.

Measurement tasks S03/S04 are verified when their valid measurements and limits
are retained, including a negative result; a missed target must not prevent S05
from issuing the experiment verdict. Inconclusive evidence requires a bounded
diagnostic repeat or a documented inability to measure, never a success claim.

P03 may accept local availability and replication independently. Record separate
decisions for Steps B and C; enable only the corresponding L or C tasks. If one is
deferred, continue authorized independent work and keep the overall end state open.

## Atomic task contract

Each ledger item names scope, dependencies, deliverable, risk, authorization,
verification, owner and an acceptance-record path. One item is active at a time.
Begin with the smallest independently testable outcome. If inspection reveals
multiple independent behaviors, split the item into numbered children before
implementation, preserve its parent as a completion barrier, and update dependents.
Late-stage items are acceptance slices, not claims that unknown implementation
details have already been designed. Refine them when their prerequisites land.

For an executable change:

1. Record the starting revision, applicable invariants and actual scoped files.
2. Demonstrate the regression or absent behavior with a meaningful failing test.
3. Implement through existing domain/application ports and infrastructure adapters.
4. Run focused behavior tests, applicable tier checks, and relevant integration
   checks. Preserve negative/failure/recovery cases, not only happy-path coverage.
5. Review the diff and findings; commit explicit paths with the required identity
   and signing. A signed commit is a checkpoint, not merge or release acceptance.
6. Update the evidence record and journal; select the next authorized ready item.

Evidence records must identify item ID; source revision and source-file hashes;
base revision for changed-line proof; dirty/untracked inputs if any; cwd; commands;
tool/runtime/model versions where relevant; start/end time; bare exit codes;
retained report paths and hashes; actual assertions/counters; failures and their
disposition; review scope/revision; and the resulting status. Never put raw user
memory or secrets in hosted evidence. Acceptance requires the relevant source
content still to match; documentation-only commits do not manufacture fresh tests.
Use `not_applicable` with a reason when a field does not apply, never invented data.

Do not mark an item verified because its files exist, a command timed out, output
was truncated, a packet review approved a different revision, or a test count is
green while the item-specific outcome remains unproved.

## Autonomy and owner decisions

Continue routine diagnosis, TDD repairs, in-scope dependency choices, documentation,
synthetic tests, draft PRs, CI fixes, evidence collection and safe project-owned
housekeeping without asking whether to continue. Preserve recovered and dirty work
as part of project ownership. Shared first-party defects outside this repository
receive an owning-project inbox report; do not expand into unrelated implementation.

The ratified 2026-09-02 policy supersedes the old mandatory human `tuicr` gate.
`tuicr` is optional diff-reading tooling. Tier M changes can be merged by the agent
after their required checks and reviews. Tier D changes require a short concrete
decision brief after useful work is ready. PR #1 is Tier D because it changes
behavior, data-integrity boundaries, dependencies and quality gates.

The present decision boundaries are:

- R03: baseline Tier D integration, after checks and review are ready.
- P03: production implementation scope. Confirm independent writer topology,
  permitted data classes/receiver identity, retention and trigger; accept/reject
  local computation using S05 evidence. Do not request the already approved spike again.
- A03: final production release/adoption after real-desktop synthetic proof.

Consolidate decisions when they are simultaneously reviewable, but do not assume
an earlier design approval authorizes later real-data egress, deployment or spend.
No unapproved cloud fallback, new always-running service, shared live database,
raw-memory Git transport, another machine's store replacement, or authority cutover.
Routine implementation choices inside an approved contract remain the agent's job.

## Persistent execution loop

At resume, read this file, `work-items.json`, `JOURNAL.md`, `.planning/STATE.md`, the
active native goal, Git/worktree state and current PR/check evidence. Reconcile
changes made by any agent before selecting work. Historical PASS entries are
evidence about their recorded revision, not current acceptance.

Select the first authorized dependency-ready item, starting B01. If externally
blocked, record the exact dependency, owner, last probe and concrete resumption
trigger, then work on another ready item. Do not repeatedly poll an unchanged
blocker. Independent read-only checks may overlap; this contract does not itself
authorize spawning agents. Save a checkpoint after each meaningful result and
before interruption, including the exact next command and unfinished hypotheses.

The native goal remains active through routine task boundaries and ordinary final
updates. Mark it complete only after A05 and all end-state predicates are actually
proved. Mark it paused only at the owner's explicit request. If no meaningful
authorized work remains and the same blocker persists for three consecutive goal
turns, mark it blocked with the concrete resumption requirement, following the
native goal tool contract. An owner decision is not assumed from elapsed time.

Do not duplicate the native goal in an OS scheduler. If the native goal is absent
in a new thread, recover this contract and disclose the missing runtime linkage;
create a replacement only under the owner's persistent-goal authorization and
after checking that no unfinished goal already exists.

## Resource experiment and disk boundaries

S01-S05 use synthetic inputs and a pinned runtime/model only after R04. Measure
at least 100 varied fixed-seed queries: cold p95 <=3 seconds, warm p95 <=1 second,
extra peak RAM <=2 GiB, foreground p95 regression <=10%, background yield <=5
seconds; defer bulk backlog on battery. Record corpus, machine, model recipe and
measurement method. Legacy-vector reuse or endpoint mixing additionally needs
cosine >=0.999 and top-10 overlap >=0.95 on the fixed corpus; otherwise rebuild
locally. These are acceptance targets, not measured results.

D03 is baseline dependency compatibility, not permission to start the nomic
experiment early. Prefer existing owned caches or a bounded synthetic test fixture
in isolation/CI; no permanent local inference runtime/model installation before R04.

Preflight free space and peak temporary footprint before full instrumentation,
model acquisition and archives. Maintain only project-owned artifacts. Resolve
absolute deletion targets, prove ownership/inactivity and archive recovery before
removing anything valuable. Preserve active dependencies and ambiguous worktrees.
The prior automatic approval review blocked removal of one old coverage copy with
reason `blocked by policy`; do not retry it through a different shell or mechanism.
That retained copy is tracked separately and does not block this product goal.

## Immediate next step

Independent plan review remains unperformed: the live Fable READY smoke returned
`You're out of usage credits` with bare exit 1 on September 19. Matching runtime
skill hashes were checked; no substantive review was returned and no substitute
model was used. This is route availability evidence, not a technical verdict.
Continue authorized repairs and retry the review when availability changes before
the applicable delivery gate. Local plan checks found and corrected negative-spike
deadlock and an unnecessary local-feature dependency in the replication branch.

The restart source is `work-items.json.current_item` and the newest JOURNAL entry,
not the original B01 starting command. B11.74.3 repository and B11.74.4 service
lifetimes are locally verified. B11.74.5 now has reconciled local proof for schema,
export, event and secret-audit statement migration: 29 scoped prepares across four
modules, source-bound native slices and four negative ownership checks. B11.74.6.1
factory implementation/current-runtime proof is complete; the final pinned group
repeat is disk-guarded after a type-only test import repair. B11.74.6.2 health
readers is independently active, followed
by B11.74.6.3 CLI/evaluation and combined caller revalidation. Q018/B11.9 retain
factory and fixture quality gaps. Q100 owns the
demonstrated whole-replay failure defect; Q101 owns complete secret-remediation
safety. Full quality, platform and review acceptance remains B11.74.7; local
migration verification does not close these gates. The source map, rejected
experiment and exact next steps are in
B11.74-plan.md.
Baseline acceptance, including the native lifecycle repair, still precedes the
approved embedding experiment. Read the ledger again before selecting work.
