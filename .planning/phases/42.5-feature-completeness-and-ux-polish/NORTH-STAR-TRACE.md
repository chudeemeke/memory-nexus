# Phase 42.5 Product North Star Trace

Created: 2026-07-01
Completed: 2026-07-03
Status: complete

## Trace Table

| North Star claim | Current trace | Classification | Required action |
| --- | --- | --- | --- |
| First-class, first-party memory infrastructure | Package name, global rules, cross-project inbox use, v5 roadmap | Implemented with operational caveat | Keep consumer-visible changes broadcast through inbox |
| Durable, auditable, local-first memory substrate | SQLite, event log, schema-versioned events, redaction, governance | Implemented | Verify via UAT |
| Carries forward context, decisions, preferences, friction, facts, derived knowledge | sync/search/facts/friction/persona/graph/ranking/dream | Implemented | Trace in README and UAT |
| Local-first and private by default | local DB, provider egress deny-by-default, remote explicit | Implemented | Verify doctor/status messaging |
| Explicit consent for provider egress, remote sync, persona/profile, graph enrichment, dream promotion | providerEgress, governance, explicit commands | Mostly implemented | Ensure docs and UAT distinguish consent/readiness clearly |
| Cross-project intelligent but scoped, relevant, explainable, safe | project scoping, governance, graph/ranking why metadata | Implemented with caveat | UAT cross-project leakage and context output |
| Event-sourced and auditable | MemoryEventEnvelope, event-log replay, dream/persona/graph projections | Implemented | Add projections public surface |
| Provider-flexible, no hardcoded OpenAI/Ollama/Anthropic assumptions | provider registry/capability status exists | Implemented with known explicit provider adapters | Phase 43 architecture review should judge provider/plugin extensibility |
| Secure enough to trust | redaction, audit-secrets, gitleaks, egress policy | Implemented with caveat | UAT audit and backup/restore redaction expectations |
| Excellent CLI/API product | broad CLI surface, JSON envelopes, backup/restore/projections/migrate/doctor upgrade polish | Implemented with Phase 43 market-review caveat | Phase 43 product review must still approve final market readiness |
| Market-ready quality gates | typecheck/build/tests/coverage/audit/gitleaks/package smoke | Implemented for Phase 42 source | Phase 43/44 final gates remain |
| Agentic but controlled | persona, graph, ranking, explicit dreaming, no hidden mutation | Implemented | Verify dream apply/rollback UX |
| Comparable to or better than leading tools | market report says conditionally competitive but behind in MCP/benchmarks | Not yet market-approved | Phase 43 owner |
| Loosely coupled, tightly integrated | optional authkey, provider registry, ports/adapters | Implemented with review caveat | Phase 43 architecture/security review |
| Independently shippable as `@chude/memory` | npm 4.0.2 shipped; source ahead | Partial | Phase 44 release candidate owns v5 package alignment |

## Phase 42.5 Required Closures

- DONE: CLI/API product excellence: added the compatibility surfaces promised in the PRD.
- DONE: Event-source operability: exposed projections rebuild/verify publicly.
- DONE: Fresh-user confidence: verified safe discovery/backup/restore/upgrade command flows through tests and dist smoke.

## Later Gate Closures

- Phase 43: competitive/MCP/benchmark/readiness review.
- Phase 44: v5 package versioning, package smoke, release notes, npm dry-run, publish handoff.
