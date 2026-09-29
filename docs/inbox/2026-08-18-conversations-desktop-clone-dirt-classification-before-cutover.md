---
schema_version: "1.3"
source_project: conversations
created: 2026-08-18
type: refactor
severity: medium
fix_status: none
affects_scope: this-project-only
issue_id: conversations:2026-08-18:memory-nexus-desktop-clone-dirt-classification
thread_id: conversations:2026-08-18:phase20-desktop-dirt
next_owner: memory-nexus
status: triaged
triaged_at: 2026-09-12
closure_notify_to: conversations
closure_notify_reason: "Phase 20's cutover eligibility ledger holds this project's target-dirt-dispositioned axis open until the classification is recorded"
---

# Classify the desktop clone's uncommitted state before the Phase 20 cutover

## Symptom

`conversations` Phase 20 migrates project authority from the laptop
(`C:\Projects`) to the desktop WSL tree (`~/Projects`). The `memory-nexus`
desktop clone carries uncommitted state whose nature is unknown to
`conversations`. A count is not a classification, and no attempt was made to
classify it — that judgment belongs to this project.

**Desktop clone** (the migration *target*), measured 2026-08-16 and
**not re-measured since**:

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `0db6e08` |
| Dirty entries | `63` |
| Origin | `git@github.com:chudeemeke/memory-nexus.git` |

**Laptop clone** (the migration *source*), measured 2026-08-17:

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `96742c74e190837bf8c00ab2bcbc35053b676837` (`96742c7`) |
| Dirty entries | 5 |
| Unpushed | 2 commits |
| Origin | `git@github.com:chudeemeke/memory-nexus.git` |

Origins byte-match, so the engine's origin comparison would pass today. Both
sides are on `main` but the HEADs differ, so the two trees have diverged on the
same branch name.

## Repro

From the desktop: `git -C ~/Projects/memory-nexus status --short | wc -l`
returned 63 on 2026-08-16. Refresh before acting; these are point-in-time values.

## Root cause

Two engine behaviours make the desktop dirt blocking rather than cosmetic:

- `convergeRemoteProjectGit` requires the target `origin` URL to byte-match the
  source's, fetches the reviewed ref, and **refuses target-unique commits**. Any
  commit that exists only on the desktop clone fails the phase closed.
- Phase `E` excludes `node_modules/***` deliberately, so a dirty entry under
  `node_modules` is not what is being asked about here — but everything else is.

And one phase rule, quoted verbatim from `20-01-PLAN.md` Stage 1:

> Do not overwrite dirty targets without an explicit project-level decision.

That decision is this project's to make.

## Proposed fix

Classify **every** dirty path on the **desktop** clone into exactly one of:

1. generated or regenerable artifact,
2. unpushed work,
3. agent worktree residue,
4. local config or secret,
5. real source change.

Then preserve anything non-regenerable — a commit, a branch, a `git bundle`, or a
documented backup — and record the outcome.

**`memory-nexus` is portfolio infrastructure.** Most or all active projects depend
on its CLI, hooks, sync behaviour, JSON output, redaction behaviour, and stored
context. State it plainly: **desktop changes must not be discarded merely because
another copy is cleaner.** A lost desktop-side change here does not fail loudly in
`memory-nexus`; it fails quietly in every consumer that relied on the behaviour.

Stored context and embedding state deserve their own line in the classification.
If any dirty path is *data* rather than *code*, say so — the preservation strategy
for a database or an embedding index is not `git add`.

**Both sides hold unique work.** The laptop has 2 unpushed commits and 5 dirty
entries; the desktop has 63 and a different HEAD on the same branch. No single
tree is a superset. Reconciliation, not selection.

**Supersedes older figures.** `conversations`
`docs/operations/phase20-target-project-handoffs.md` carries a "Memory-Nexus
Reconciliation" prompt built on **2026-06-07** figures (desktop `0db6e08`, dirty
63 / untracked 9; Windows `3fe3871`, clean). Those figures are **superseded by the
measurements in this filing**. The prompt's intent still stands; its numbers do
not.

## Test plan

Whatever this project normally requires to trust its own tree: its test or
verification gate should pass on the tree that is declared authoritative, before
that tree is declared authoritative. `conversations` does not prescribe the gate.

## Suggested commit message

```
chore: classify and preserve desktop clone working-tree state

- Classify 63 uncommitted desktop entries as artifact/unpushed/worktree/config/source
- Preserve non-regenerable paths before Phase 20 authority cutover
```

## Risks / things to verify before merging

- The 2026-08-16 desktop figures are stale by construction. Re-measure first.
- Data-shaped dirty paths (stored context, embeddings, SQLite state) need a
  preservation strategy that is not a commit.
- Redaction behaviour: do not print secret-shaped stored context while inspecting.

## Where this work happens, and what this filing does not authorise

In **this project's own CWD**, per the boundary rule
(`conversations` orchestrates; target projects execute). This filing explicitly
does **not** authorise `conversations` to clean, stash, reset, commit, or check
out anything in this repository. Nothing in this repository was modified to
create this filing except the addition of this file.

## Why this filing is in the laptop tree and not the desktop clone

The desktop clone is the migration **target**, and `convergeRemoteProjectGit`
**refuses target-unique commits** — so a filing committed on the desktop would
itself become a cutover blocker. Do not mirror this file to the desktop.

## Trigger

Act on this **before this project enters a 20-02 cutover queue**. Until the
classification is recorded, this project's `target-dirt-dispositioned` axis stays
blocked and no cutover can proceed.

## Related

- `conversations` `.planning/phases/20-wsl-linux-workspace-migration/20-INVENTORY.md`
  (both measured-state tables and the readiness matrix)
- `conversations` `docs/operations/phase20-target-project-handoffs.md`
  ("Memory-Nexus Reconciliation", 2026-06-07 figures superseded here)
- `conversations` `.planning/phases/20-wsl-linux-workspace-migration/20-HANDOFFS.md`
  (the register row this filing backs)
- Cross-project inbox protocol: `~/.claude/rules/cross-project-issues.md`

## Event Log
<!-- inbox-events:v1 -->
- 2026-08-18T02:43:45.000Z | conversations | filed | Phase 20 plan 20-06 Task 2: desktop clone carries 63 uncommitted entries and both trees diverge on main; requesting per-path classification before cutover.
- 2026-09-12T10:08:22.743Z | memory-nexus | correction | Live remote inspection still finds desktop HEAD 0db6e08 and 63 porcelain entries, but Git proves it is an ancestor of laptop HEAD 96742c7 (0 desktop-only / 166 laptop-only commits). All 54 tracked modifications are CRLF/LF-only; the 11 individual untracked files are 2 current-file duplicates and 9 exact normalized matches to recoverable Git-history blobs. Thus the earlier claim that both trees contain unique work is not supported by current evidence. Per-path inventory and recovery commits: docs/audits/2026-09-12-project-status.md and its evidence directory.
- 2026-09-12T10:08:22.743Z | memory-nexus | triaged | Classification is recorded; cleanup, ignored/runtime database and embedding preservation, project verification, and authority cutover remain unexecuted. No desktop files were altered. Owner: memory-nexus; trigger: before this project enters the Phase 20 cutover queue. Do not mark migration complete from source classification alone.
