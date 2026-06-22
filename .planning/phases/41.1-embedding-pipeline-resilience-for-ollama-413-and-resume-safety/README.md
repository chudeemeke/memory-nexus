# Phase 41.1: Embedding Pipeline Resilience for Ollama 413 and Resume Safety

Status: Complete
Started: 2026-06-22
Completed: 2026-06-22

## Intent

Make embedding generation monotonic and provider-limit-aware. A failed provider or transport request must not cause every later `memory sync --embed` run to reselect the same failing batch and stop.

This phase was inserted after Kanbanflow re-embedding exposed a deterministic 413 failure against the Tailscale Ollama sidecar. The issue belongs to memory-nexus because every consumer depends on reliable embedding refresh, not because Kanbanflow needs a project-specific workaround.

## Plan

1. Add typed provider payload-too-large behavior and Ollama adaptive split tests.
2. Add application-layer byte-bounded embedding sub-batches.
3. Add durable model-scoped skip/quarantine state for single oversized items.
4. Make resume exclude current-model skips and report embedded/skipped counts honestly.
5. Update CLI sync output, inbox coordination, and verification evidence.

## Guardrails

- Do not hard-code Kanbanflow, Tailscale, hostnames, or a single provider as the architectural solution.
- Do not log or store raw message content in failure metadata.
- Do not make `authkey`, Tailscale, or Ollama a hard dependency.
- Do not remove current embedding providers or existing default behavior.
- Do not rely on lowering `batchSize` alone; that is a brittle workaround, not a durable fix.
- Keep domain ports provider-agnostic and infrastructure-specific behavior behind adapters.

## Verification Plan

- Provider tests for Ollama 413 multi-item split and single-item typed failure.
- Application tests for byte-bounded batches, durable skip, and monotonic resume.
- Repository/schema tests for model-scoped skip filtering.
- CLI sync tests for safe skip reporting.
- Focused test run, typecheck, build, inbox lint, and diff whitespace.

## Completion Evidence

- `41.1-01-SUMMARY.md` records the completed implementation and deviations.
- `41.1-VERIFICATION.md` records source, quality, dependency-audit, and inbox gates.
- The source fix is verified, but the global installed `memory@4.0.0` binary is not claimed fixed until a fixed local install or publish smoke is run.
