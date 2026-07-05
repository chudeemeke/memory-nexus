# Phase 43 Readiness Report

Created: 2026-07-03
Status: PASS - scoped local-first CLI/API market readiness

## Executive Summary

`@chude/memory` now has the main implementation shape required by the Product North Star: local-first storage, event-sourced projections, explicit privacy and egress controls, governed derived memory, cross-project context, ranking, temporal graph retrieval, audited dreaming, recovery surfaces, and executable evals.

The Phase 43 readiness decision is now recorded in `43-VERIFICATION.md`. The key blocker entering this phase, `remote_sync_conflict`, has been promoted from a contract fixture to behavior-backed eval coverage through `RemoteEventSyncService`. `bun run eval:v5:market` passes with 9 behavior-backed fixtures and 0 contract fixtures.

Current decision: scoped market readiness is approved for the local-first CLI/API product.

Important scope boundary: Phase 43 does not approve a broad "market leader across the agentic memory category" claim while MCP/local server support and public benchmark parity remain unimplemented.

## Requirement Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| READY-01 | pass | Hexagonal layer split remains intact; the hook-launcher fix improved platform resolution behind a testable boundary; `43-VERIFICATION.md` records final gate pass. |
| READY-02 | pass | Redaction, audit-secrets, provider egress consent, remote sync preflight, backup/restore, and dream review controls are implemented; `bun audit`, gitleaks, and package privacy checks pass. |
| READY-03 | pass | Typecheck, build, full tests, test isolation, evals, coverage, dependency audit, gitleaks, diff whitespace, and package dry-run pass. |
| READY-04 | pass | Phase 42.5 proved fresh-user command discovery, backup/restore, upgrade diagnostics, and isolated dist smoke; Phase 43 reran full quality/package gates and refreshed downstream guidance. |
| READY-05 | scoped-pass | Competitive lane is crisp: local-first, auditable, privacy-governed developer memory. MCP/server and public benchmark parity block broad market-leader claims, not scoped CLI/API readiness. |
| READY-06 | pass | Product North Star conformance passes with explicit scope boundaries and owned future gaps. |
| EVAL-04 | pass | `bun run eval:v5:market` exits 0 with 9/9 passed, 9 behavior-backed fixtures, 0 contracts, 0 blockers. |

## Architecture

Grade: excellent for scoped release.

Evidence:

- Domain, application, infrastructure, and presentation layers are present and actively used.
- Core external effects sit behind ports: embedding/extraction providers, repositories, remote event transport, projection rebuilders, privacy preflight, and capability diagnostics.
- The promoted `remote_sync_conflict` eval now exercises `RemoteEventSyncService` through a fake transport port instead of inspecting fixture prose.
- Provider behavior is registry/configuration-backed for current built-ins rather than duplicated hardcoded checks in presentation code.
- Domain source inspection shows no third-party runtime imports; standard Node crypto is used for deterministic IDs/hashes where needed.

Residual risks:

- The current design is CLI/API-first. It does not yet include a local MCP/server adapter, which is a competitive integration gap, not an architecture violation for the current release lane.

## Security

Grade: excellent for scoped release.

Evidence:

- Redaction is enforced before storage, FTS, embedding payloads, extraction payloads/events, exports, hook/friction logs, provider egress, and remote sync preflight.
- `memory audit-secrets` scans database and event logs without printing raw secrets.
- Provider egress is deny-by-default unless consent and provider/host allowlists are configured.
- Remote sync validates URLs, refs, durable machine identity, privacy preflight, and does not push after a failed pull/rebase path.
- Dreaming proposals are redacted before persistence, review-gated, event-sourced, and rollback-capable.
- Authkey integration remains optional and handle/metadata-based; memory does not resolve `apiKeyRef` or call `authkey get`.

Residual risks:

- Test fixtures intentionally contain synthetic secret-looking strings; gitleaks currently passes.
- Provider egress and remote sync still depend on explicit user configuration/consent, by design.

## Quality

Grade: pass.

Evidence collected in Phase 43:

- `bun run typecheck`: PASS.
- `bun run build`: PASS.
- `bun test --timeout 15000`: PASS, 4,455 pass, 0 fail.
- `bun run test:isolation`: PASS.
- `bun run eval:v5`: PASS, 9/9.
- `bun run eval:v5:market`: PASS, 9/9, behavior 9, contract 0, blockers 0.
- `bun run test:coverage`: PASS, statements 97.31%, branches 95.00%, functions 96.51%, lines 97.39%.
- `bun audit`: PASS.
- `gitleaks detect --no-banner --redact --source .`: PASS.
- `git diff --check`: PASS.
- `npm pack --dry-run --json`: PASS.

## Product

Grade: pass for scoped local-first CLI/API readiness.

Implemented product surfaces:

- Core retrieval: sync, search, query, context, related, list, show, stats, browse.
- Knowledge: facts, extract, governed context, profile/persona, temporal graph, ranking.
- Safety and governance: audit-secrets, governance controls, provider egress policy, remote preflight.
- Operations: backup create/verify, restore dry-run/confirm, migrate dry-run/json/confirm, projections rebuild/verify, doctor upgrade, remote backup/restore/rollback.
- Agentic controlled memory: dream propose/list/show/approve/reject/apply/rollback, no hidden background mutation.

Product caveats:

- Phase 44 still owns versioning, changelog, release notes, publish dry-run, install smoke, and OTP publish handoff.
- Current package version is `4.0.2`; source is ahead of the published package after the hook launcher fix.
- MCP/local server is not implemented. That limits agent-native ergonomics versus several peers and should be owned in a post-v5 or v5.x phase.

## Competitive

Grade: scoped readiness pass, broad market-leader claim blocked.

Credible lane:

`@chude/memory` is best positioned as a local-first, auditable, privacy-governed memory substrate for developer and agent workspaces. It should not claim to be a hosted enterprise graph memory, a full autonomous agent runtime, or a benchmark-leading retrieval model without external benchmark evidence.

Strengths versus peers:

- Stronger than file-only memories on governance, event replay, evals, search, remote recovery, and explicit egress.
- More private/auditable than hosted-first memory products by default.
- More operationally recoverable than simple transcript or Markdown memory systems.

Owned gaps:

- MCP/server adapter and richer agent-native tools.
- Public benchmark parity against LongMemEval/LoCoMo-style memory benchmarks.
- Import/export bridges for Mem0/MemPalace/OpenClaw/Hermes-style memory artifacts.

Non-sycophantic competitive take:

- Hermes is stronger as a complete agent product: gateway, skills, scheduling, provider plugins, and a low-friction always-present memory loop. `@chude/memory` is stronger as a governed memory substrate, but it does not yet match Hermes' product surface.
- OpenClaw is stronger on assistant reach and human-readable workspace memory. `@chude/memory` is stronger on event sourcing, redaction, consent, and recovery, but less approachable without a dashboard/MCP/server surface.
- MemPalace is stronger on public retrieval proof and market story because it leads with benchmark claims. `@chude/memory` has richer provenance and governance but cannot honestly claim benchmark parity yet.
- Hedra, if it is the intended "hedr" reference, is not a direct memory competitor. The useful lesson is workflow polish: intent to finished output, reference assets, brand/style consistency, and conversational refinement carried across revisions.
- GitHub Copilot memory is a useful industry baseline because it treats memory as cross-agent workflow learning, not just retrieval. `@chude/memory` needs branch/worktree/code-state validity to compete credibly in developer workflows.

Top competitive enhancements to own after scoped Phase 43 approval:

1. MCP/local server adapter with capability-scoped tools for search, context, governance, dream review, remote status, and audit.
2. Public benchmark harness for LongMemEval/LoCoMo-style retrieval plus portfolio-specific developer-memory UAT.
3. Bounded active-memory capsule generated from the rich store, similar to Hermes' always-present prompt memory but with provenance and governance.
4. Branch/worktree/code-state validity so memories know which commits, files, branches, and merge states they apply to.
5. Interop bridges for Hermes/OpenClaw Markdown memory, MemPalace-style local stores, and Mem0/Zep/Graphiti fact or graph exports.
6. Outcome-backed procedural learning where lessons are promoted only when tied to evidence such as passing tests, merged PRs, accepted fixes, or rollback outcomes.
7. Memory-poisoning defenses: trust levels, evidence receipts, contradiction inspection, active suppression, and user-confirmed promotion for sensitive classes.
8. Local inspection UX: dashboard or TUI for provenance, graph edges, ranked recalls, suppressed facts, dreams, provider egress, and why-included explanations.
9. Consent-aware background connectors for Codex, Claude Code, GitHub, IDEs, shell history, and first-party tool events.
10. Tiered retrieval with abstract/overview/full levels, hybrid BM25/vector/graph/rerank scoring, budget controls, and explainable retrieval traces.

Claude review disposition:

- Claude agreed that internal eval success is necessary but insufficient for broad market-leader claims.
- Claude identified stale `CLAUDE.md` as a concrete downstream-agent risk.
- Claude returned `PASS WITH FIXES`; required fixes are now closed for the scoped Phase 43 decision.

## Product North Star

Grade: pass with explicit scope boundaries.

Conformance:

- Local-first and private by default: implemented.
- Explicit consent for provider egress and remote mutation: implemented.
- Cross-project intelligent with scoping and explainability: implemented with eval coverage.
- Event-sourced and auditable: implemented through canonical event envelopes and projections.
- Provider-flexible: implemented for current built-ins and openai-compatible providers; plugin ecosystem not yet present.
- Secure enough to trust: implemented surfaces exist; final gate must prove no current scanner/package blocker.
- Excellent CLI/API: implemented and gate-verified for the scoped release lane.
- Agentic but controlled: implemented through governed persona, graph, ranking, and reviewed dreaming.
- Better than leading tools overall: blocked as an honest claim until MCP/local server and public benchmark parity are implemented or explicitly rejected with user sign-off.
- Better in the narrower local-first governed developer-memory lane: approved as a credible scoped claim, with caveats explicit.

## Decision

Decision: approved for scoped local-first CLI/API market readiness.

Approval conditions:

1. `43-VERIFICATION.md` records all final gates as PASS. Done.
2. `43-CLAUDE-REVIEW.md` records Claude critique and disposition. Done.
3. Stale `CLAUDE.md` guidance is corrected. Done.
4. No package dry-run output includes private planning, inbox, review, audit-doc, local path, or secret material. Done.
5. `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and `.planning/PROJECT.md` are updated only after the gates pass. Done in Phase 43 closeout.
6. Final language distinguishes scoped local-first CLI/API market readiness from broad agentic-memory market leadership. Done.

Phase 44 is the next phase and owns release-candidate packaging and publish handoff.
