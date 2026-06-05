---
title: v5 Threat Model
created: 2026-06-05
status: phase-38.0-foundation
scope: "@chude/memory v5.0"
---

# v5 Threat Model

## Assets

- Session transcripts and tool outputs.
- Source paths, project names, commands, and local machine metadata.
- Facts, entities, links, persona/profile entries, utility metrics, and dreams.
- Canonical event logs and derived SQLite projections.
- Config, machine identity, provider references, remote repository URLs, and backup archives.
- Provider API keys supplied through environment injection.

## Actors

- User.
- Local coding agent.
- Local malicious process.
- Remote Git host or compromised remote repository.
- Git helper or credential helper.
- Remote LLM/embedding provider.
- Optional authkey or future capability provider.
- Future external package consumer.

## Trust Boundaries

1. Transcript ingestion boundary: untrusted agent transcripts enter the parser.
2. Redaction boundary: raw content must be classified before persistence, indexing, provider egress, export, remote sync, and logs.
3. Provider egress boundary: remote providers receive only consented, redacted payloads.
4. Remote sync boundary: redacted event logs leave the machine only after explicit preflight and durable identity validation.
5. Capability interop boundary: capability providers can report handles, readiness, fingerprints, and proofs, not raw secrets.
6. Projection boundary: SQLite tables are derived from canonical events and can be rebuilt.

## Data Egress Paths

- Embedding providers.
- Extraction providers.
- Export commands.
- Git-backed remote sync.
- Logs, diagnostics, status, and doctor output.
- Cross-project consumer commands that parse CLI JSON.

Every egress path must expose redaction status, provider or transport target, and consent provenance where applicable.

## Remote Sync Posture

Remote sync must not be treated as ordinary Git plumbing. It moves memory data outside the local machine.

Default posture:

- Disabled unless explicitly configured.
- Requires durable machine identity.
- Requires preflight before first push.
- Shows sensitive-event counts and remote target.
- Rejects unsupported remote protocols.
- Allows local path remotes only with explicit override.
- Uses argument-array subprocess execution and sanitized Git environment.

Plaintext vs encryption decision:

| Option | Benefit | Risk | Current Decision |
| --- | --- | --- | --- |
| Redacted plaintext events in private Git repo | Simple, inspectable, recoverable | Host compromise exposes redacted memory | Acceptable for first release only after preflight and audit |
| Encrypted remote event bundles | Stronger confidentiality | Harder conflict handling and recovery | Future option; not required before Phase 38.3 unless threat model changes |
| Hosted sync service | Product convenience | Violates local-first scope | Out of scope |

## Provider Egress Consent

Remote providers require explicit consent and allowlist policy. Consent must record:

- Provider name and host.
- Purpose: embedding, extraction, evaluation, or dreaming.
- Scope: project, global, or specific run.
- Timestamp and actor.
- Redaction policy version.
- Revocation or expiry if set.

OpenAI's privacy documentation treats memory and data controls as user-visible controls; `memory` should follow the same product principle locally: optional memory use, review/edit/delete, export, and clear data controls. Source: https://openai.com/index/how-chatgpt-protects-privacy/

## Secret Handling

- No plaintext provider API keys in config.
- `apiKeyEnv` and `apiKeyRef` are allowed.
- `authkey://...` is a non-resolving reference.
- No command may print, export, or return raw secrets through JSON.
- `memory audit-secrets` reports redacted findings and locations only.

This aligns with OWASP LLM02 sensitive information disclosure guidance: LLM applications handle sensitive data in prompts, conversations, retrieval, outputs, and logs, and must apply data boundaries and sanitization. Source: https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/

## Consent and Provenance Risk

Phases 39-42 create new derived memory surfaces. Without a consent/provenance layer, persona, graph, ranking, and dreaming could silently transform private facts into global instructions or high-priority context. That is a blocker.

Required control:

- Insert Phase 38.2.5 Consent Provenance and Memory Governance.
- Every derived memory entry must reference source event ids, transformation method, actor, redaction status, scope, and user-control state.
- User suppression/invalidation events must override ranking, graph enrichment, and dream promotion.

## Threats and Controls

| Threat | Phase | Required Control |
| --- | --- | --- |
| Secret stored in event log | 38.2 | Redaction before persistence; audit/quarantine |
| Secret sent to provider | 38.2 | Provider egress consent and redaction |
| Wrong remote receives memory | 38.3/38.4 | Remote URL/ref validation and preflight |
| Identity split creates conflicting event streams | 38.1/38.3 | Durable machine identity value object |
| Persona encodes unsupported bias | 38.2.5/39 | Provenance, confidence, review, suppression |
| Graph creates noisy/stale links | 40 | Confidence thresholds and temporal invalidation |
| Ranking revives suppressed memory | 38.2.5/41 | Governance state is ranking input |
| Dreaming silently mutates truth | 42 | Explicit command first, audited proposals, event-sourced apply |
| Dependency compromise | 43/44 | Audit, lockfile review, package smoke, release gate |

## Blocking vs Accepted Risk

Blocks implementation:

- No canonical event envelope.
- No redaction before storage/egress.
- No consent/provenance plan for derived memory.
- Remote sync without durable identity and preflight.
- Capability interop that can resolve or return raw secrets.

Accepted with documentation:

- Private Git remote may store redacted plaintext events for the first v5 release.
- Local-only users may never configure remote sync or remote providers.
- Background dreaming remains disabled until explicit command safety is proven.

## Risk Framework Note

NIST AI RMF frames risk management for trustworthy AI systems, including governance, measurement, and management of AI risks. `memory` applies that locally through explicit gates, evaluation fixtures, provenance, consent, audit, and recovery evidence. Source: https://www.nist.gov/itl/ai-risk-management-framework
