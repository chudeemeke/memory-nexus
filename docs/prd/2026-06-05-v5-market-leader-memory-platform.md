---
title: v5 Market-Leader Memory Platform PRD
created: 2026-06-05
status: phase-38.0-foundation
scope: "@chude/memory v5.0"
---

# v5 Market-Leader Memory Platform PRD

## Product Thesis

`@chude/memory` is a local-first memory system for coding agents and first-party project work. Its advantage is not being another hosted memory SaaS. Its advantage is trustworthy, inspectable, replayable memory that works on the user's own machine, across projects, and later across machines, while preserving privacy and operational control.

The product must work well with no cloud provider, no authkey, no remote sync, and no hosted graph database. Optional first-party integrations should make it better, not required. The positioning is: works great without it, perfect with it.

## Target Users

- The maintainer using Codex, Claude Code, Antigravity, and other agents across a portfolio of first-party projects.
- Future external developers who want a local-first memory CLI/API for agent continuity.
- First-party tools that need a stable CLI JSON/exit-code contract for durable context, friction, and project state.

## Non-Goals

- Multi-tenant SaaS memory hosting.
- Hosted vector or graph database dependency.
- Raw secret brokerage.
- Agent autopilot that mutates long-term memory without audit, provenance, or user controls.
- Replacing project-specific planning systems. `memory` stores and retrieves context; it does not become a project manager.

## Feature Preservation Invariant

No stated, implemented, documented, inferred, or prototype feature may be removed to make v5 easier to ship. If a feature is incomplete, disabled, inconsistent, or only partially implemented, it must be inventoried and either completed inside an explicit phase or carried as owned deferred work with a concrete trigger.

This includes current remote-sync prototype surfaces, event-log behavior, extraction/context/facts/search/friction surfaces, provider support, portability, exports, hooks, and consumer-facing JSON contracts.

## User Stories

### Local-First Memory

- As a user, I can install `@chude/memory`, sync sessions, search memories, inspect facts, and get context without any cloud account.
- As a user, I can export, back up, restore, and audit my memory data.
- As a user, I can see why a memory was included in a context response.

### Remote Sync

- As a user, I can opt into Git-backed remote sync only after preflight shows what will leave the machine.
- As a user, I can recover from failed sync, conflict, corrupt event lines, or wrong-machine identity without losing local memory.
- As a user, I can keep remote sync disabled and still have a complete product.

### Persona and Procedural Memory

- As a user, I can see the profile facts and procedural lessons `memory` would inject into context.
- As a user, I can edit, suppress, invalidate, or expire profile entries.
- As a user, I can prevent project-private facts from leaking into global persona context.

### Temporal Graph

- As a user, I can retrieve not only matching facts but also related tools, projects, decisions, errors, files, and capabilities with clear reasons.
- As a user, I can trust stale relationships to be invalidated or marked historical.

### Ranking

- As a user, I can get current truth without losing durable evergreen decisions.
- As a user, I can inspect why older memory outranked newer noise.

### Dreaming Consolidation

- As a user, I can run explicit consolidation and review proposed promotions or supersedences before hidden background mutation is allowed.
- As a user, I can roll back consolidation effects because proposals are applied through canonical events.

### Durable Friction Contract

- As a first-party tool, I can query durable friction through stable JSON, filters, counts, and exit codes without depending on transient JSONL files.
- As a user, I can trust friction queries not to log sensitive query strings.

### Secure Capability Interop

- As a user, I can run secret-bearing workflows through `authkey run --env memory -- ...`.
- As a user, I can see masked readiness/proof metadata for capability providers without memory resolving raw secrets.

## Fresh-User Flows

### Install

1. `bun add -g @chude/memory` or `npm install -g @chude/memory`.
2. `memory --version`.
3. `memory doctor --json`.

### Configure

1. Local-only: no API keys required.
2. Remote provider: configure `apiKeyEnv`, not plaintext `apiKey`.
3. Optional authkey: run `authkey run --env memory -- memory sync --embed`.

### Audit

1. `memory audit-secrets --json`.
2. Review redaction policy, sensitive counts, quarantine status, provider egress policy, and remote preflight status.

### Backup and Restore

1. `memory backup create --json`.
2. `memory backup verify <backup-id> --json`.
3. `memory restore <backup-id> --dry-run --json`.
4. `memory restore <backup-id> --confirm`.

### Upgrade

1. `memory doctor --upgrade`.
2. `memory migrate --dry-run --json`.
3. `memory migrate --confirm`.
4. `memory projections rebuild --verify`.

### Excellent CLI/API Usability

1. `memory --help` should make the product shape obvious without reading docs.
2. Every risky command should have a dry-run or preflight path where practical.
3. Every JSON response should be schema-versioned where it is a consumer contract.
4. Errors should say what failed, why it matters, and the next safe command.
5. Commands that expose sensitive content should default to redacted output and make raw output noisy and explicit.

## Compatibility Promises

- CLI JSON outputs are schema-versioned.
- Event envelopes are schema-versioned and migratable.
- Public commands keep stable exit codes once released.
- Config deprecations warn before removal.
- Remote sync stays opt-in.
- Raw secret values are never returned by capability interop.

## Product Controls

Memory controls must match the trust bar set by leading memory products: users must be able to inspect, disable, edit, delete, and export memory. OpenAI's memory controls are an explicit benchmark for user visibility and control, including turning memory off, reviewing saved memory, deleting memory, and using conversations without memory. Source: https://openai.com/index/memory-and-new-controls-for-chatgpt/

## Market Baseline

- Mem0 now emphasizes ADD-only extraction, hybrid retrieval, and entity linking rather than an external graph-store dependency in its open-source path. Source: https://docs.mem0.ai/migration/oss-v2-to-v3
- Zep emphasizes temporal knowledge graphs, invalidated facts, valid date ranges, and engineered context strings. Source: https://help.getzep.com/v2/concepts
- Letta makes always-visible structured memory blocks a core abstraction and supports read-only blocks. Source: https://docs.letta.com/guides/core-concepts/memory/memory-blocks
- LangGraph frames long-term memory as scoped semantic, episodic, and procedural memory with hot-path or background updates. Source: https://docs.langchain.com/oss/javascript/langgraph/memory

## Open Decisions

| Decision | Owner | Closure Trigger |
| --- | --- | --- |
| Whether remote sync stores plaintext redacted events or adds encryption-at-rest for remote repositories | memory-nexus | Phase 38.2 threat controls and Phase 38.3 transport plan |
| Whether persona/procedural entries are user-editable through CLI only or also through editable files | memory-nexus | Phase 39 plan |
| Whether graph taxonomy is hand-authored, LLM-extracted, or hybrid | memory-nexus | Phase 40 plan |
| Whether dreaming background hooks are ever enabled by default | memory-nexus | Phase 42 safety gate and Phase 43 review |

## Acceptance Criteria

- The product is complete without optional integrations.
- Optional integrations improve diagnostics or secret-safe execution without creating hidden dependencies.
- Every user-visible memory can be traced to source events and consent/provenance metadata.
- Every released mutation path has audit and rollback semantics.
- Every currently stated or inferred feature is either fully functional or explicitly owned in a later phase with a concrete gate.
- Phase 42.5 must audit and polish CLI/API usability before final Phase 43 readiness review.
