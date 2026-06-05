---
adr: "0001"
title: v5 Canonical Event Kernel
created: 2026-06-05
status: accepted
---

# ADR-0001: v5 Canonical Event Kernel

## Decision

v5 memory state will be derived from schema-versioned canonical event envelopes. SQLite tables, search indexes, graph rows, persona projections, utility metrics, and dream logs are projections, not source-of-truth records.

## Rationale

Remote sync, conflict handling, replay, rollback, and dreaming all require a durable record of what happened, not only the current fact shape. Fact-shaped JSONL is not enough because it lacks event identity, writer identity, causality, operation, redaction state, consent provenance, and integrity metadata.

## Alternatives

- Keep fact-shaped event records: rejected because multi-device sync and projection replay remain underspecified.
- Make SQLite the source of truth: rejected because cross-machine replay, backup, and audit become harder.
- Adopt an external event-store service: rejected because it violates local-first scope.

## Consequences

- Phase 38.1 must introduce event envelope value objects and migration.
- Every later projection must declare consumed event types.
- Event schema changes must be migratable.

## Revisit Trigger

Revisit if event replay cannot meet performance or recovery requirements under Phase 43 evals.
