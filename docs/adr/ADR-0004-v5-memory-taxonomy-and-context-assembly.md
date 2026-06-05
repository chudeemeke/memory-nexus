---
adr: "0004"
title: v5 Memory Taxonomy and Context Assembly
created: 2026-06-05
status: accepted
---

# ADR-0004: v5 Memory Taxonomy and Context Assembly

## Decision

v5 will treat memory as scoped semantic, episodic, procedural, graph, friction, and dream-derived context. Context assembly must return why-included metadata, provenance, confidence, recency, scope, redaction status, consent status, and ranking explanation where applicable.

## Rationale

Top memory systems do not treat all memories as flat text. LangGraph's semantic/episodic/procedural taxonomy, Letta's in-context memory blocks, Zep's temporal graph context, and Mem0's entity/hybrid retrieval all point to typed, scoped, explainable context.

## Alternatives

- Keep only fact buckets: rejected as too shallow.
- Build a hosted graph-first product: rejected as over-scoped and not local-first.
- Make persona global by default: rejected because project-private leakage is unacceptable.

## Consequences

- Phase 39 must include profile review and suppression controls.
- Phase 40 graph enrichment must preserve vector baseline and explain reasons.
- Phase 41 ranking must be explainable.
- Phase 42 dreaming must apply through canonical events only.

## Revisit Trigger

Revisit if evals show typed context adds noise or if graph/persona projections cannot meet leakage requirements.
