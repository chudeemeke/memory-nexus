# Phase 43 Context: Market-Leader and Sales-Readiness Gate

Created: 2026-07-03
Status: ready-for-planning
Source: roadmap, requirements, Phase 42.5 completion artifacts, repo inspection, current market research

## Phase Boundary

Phase 43 is a proof phase. It must not add large speculative product surface unless a blocker prevents honest readiness approval. Its job is to prove or fail the claim that `@chude/memory` is excellent across architecture, security, quality, product readiness, competitive positioning, and Product North Star conformance.

## Locked Decisions

- Market-ready is a current-evidence claim, not a roadmap promise.
- The product cannot pass Phase 43 while `bun run eval:v5:market` fails because of a remaining contract-only fixture, unless the fixture is explicitly retired with stronger behavior-backed evidence. Current code inspection shows the right move is to promote `remote_sync_conflict` into a behavior-backed eval.
- Phase 43 must produce a final readiness report with grades and blockers. If any review grades below excellent, the phase must either fix the blocker or leave the phase incomplete.
- Phase 43 must update stale project truth discovered during the review. `.planning/PROJECT.md` currently still says Phase 42.5 is next; that is stale after the completed Phase 42.5 commit.
- Phase 43 must not publish. Phase 44 owns versioning, release notes, npm pack/install smoke, publish dry-run, and OTP-backed publish handoff.
- Optional integrations remain optional. `authkey`, remote sync, provider egress, and future MCP/server surfaces can make the tool better, but core memory workflows must remain useful without them.
- No stated or inferred feature should be removed to make readiness easier. Larger missing competitive surfaces must be explicitly classified as non-goal, Phase 44 owner, or post-v5 owner with rationale.

## Canonical References

- `.planning/ROADMAP.md` - Phase 43 scope and success criteria.
- `.planning/REQUIREMENTS.md` - READY-01..READY-06 and EVAL-04.
- `.planning/PROJECT.md` - Product North Star and current project truth; must be corrected if stale.
- `.planning/phases/42.5-feature-completeness-and-ux-polish/FEATURE-INVENTORY.md` - remaining Phase 43-owned gaps.
- `.planning/phases/42.5-feature-completeness-and-ux-polish/NORTH-STAR-TRACE.md` - Product North Star trace and later gate closures.
- `docs/plans/2026-06-04-v5-market-leader-gsd-plan.md` - definition of excellent and Phase 43 task list.
- `docs/evals/2026-06-05-v5-evaluation-baseline.md` - Phase 43 eval evidence requirements.
- `docs/evals/v5-evaluation-harness.md` - `eval:v5:market` contract.
- `scripts/eval-v5/**` - executable eval harness.
- `src/application/services/remote-event-sync-service.ts` - remote sync application behavior.
- `src/application/services/remote-event-sync-service.test.ts` - existing remote sync conflict/recovery evidence.
- `docs/operations/remote-sync-runbook.md` - user-facing remote sync recovery operations.
- `README.md` - public onboarding and product claims.

## Phase 43 Must-Haves

- `remote_sync_conflict` is behavior-backed and `bun run eval:v5:market` exits 0.
- Architecture review checks real code against hexagonal/SOLID/deep-module criteria and grades excellent or blocks.
- Security review checks real code and release artifacts for secrets, privacy, egress, remote sync, dependency, audit, and recovery risks.
- Quality review reruns the agreed gates: typecheck, build, full tests, isolation, evals, coverage per metric, dependency audit, gitleaks, diff check, and package smoke.
- Product review proves fresh-user install/discovery/onboarding/configure/audit/backup/restore/upgrade/verification flows with temporary isolated state where possible.
- Competitive review uses current sources and positions the product honestly in the local-first developer-memory niche.
- Product North Star conformance audit has no unowned mismatch.

## Deferred Out Of Phase

- Real npm publish, version bump, changelog, release notes, and publish handoff: Phase 44.
- MCP/local server implementation: Phase 43 can classify and plan it, but should not bolt it on unless readiness otherwise cannot pass.
- Public benchmark parity claims: Phase 43 can document current non-claim and future benchmark requirement; it must not imply LongMemEval/LoCoMo parity without running those benchmarks.

