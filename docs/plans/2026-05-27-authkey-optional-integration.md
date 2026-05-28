---
title: Optional authkey Integration for Secret-Safe Memory Workflows
date: 2026-05-27
status: partially-implemented-foundation
scope: memory-nexus with optional authkey interop
---

# Optional authkey Integration for Secret-Safe Memory Workflows

## Intent

memory-nexus should work well without authkey and work better with authkey.

The integration must not make either first-party tool a hard dependency. memory-nexus remains a local-first memory system with environment-variable and local-provider paths. authkey remains a capability broker for secret-bearing operations. The overlap is an optional secure execution path for memory workflows that need API keys or secret-aware audit signals.

## Boundary

authkey provides capabilities and injected environment, not raw secrets to memory-nexus.

Allowed:

- `authkey run --env memory -- memory sync --embed`
- `authkey run --env memory -- memory extract <project>`
- memory-nexus config storing `apiKeyEnv` or `apiKeyRef` metadata, not secret values
- future authkey-provided masked metadata, fingerprints, readiness status, and audit proofs

Disallowed:

- memory-nexus calling `authkey get`
- memory-nexus resolving raw secret values internally through authkey
- authkey becoming required for local embeddings, local extraction, search, context, export, or sync
- AI-visible command paths returning secret values

## Current Verified Fit

authkey currently documents secret injection through `authkey run`, where secrets are injected into child-process environment variables and do not touch disk.

authkey MCP documentation and implementation intentionally exclude raw `get` so secrets do not enter AI conversation context.

memory-nexus extraction currently reads remote provider keys from environment before config fallback. That makes env injection the safest immediate integration path.

## Implementation Status

Implemented in Phase 36.8 foundation hardening:

- `embedding.apiKeyEnv` is supported for runtime environment lookup.
- `embedding.apiKeyRef` is accepted as opaque metadata and is not resolved by memory-nexus.
- `embedding.apiKey` remains as deprecated compatibility input only.
- doctor/readiness messages no longer recommend plaintext `config.embedding.apiKey`.
- CLI sync, extraction, embedding, and export paths apply pattern redaction for known secret shapes before durable writes or provider egress.
- `memory export` redacts by default; raw backup export requires `--include-sensitive`.

Still future work:

- masked authkey readiness/status detection
- secret fingerprint inventory or proof API
- v5 remote-sync architecture and secret-safe transport design

## Roadmap Placement

### v4 pre-publish hardening

Add a pre-publish foundation phase before Phase 37 GA:

**Phase 36.8: Secret Boundary and Optional Provider Interop**

Purpose:

- Remove or deprecate plaintext `embedding.apiKey` config.
- Support secret references and environment-variable references without resolving them in memory-nexus.
- Document `authkey run --env memory -- ...` as the preferred secret-bearing execution path.
- Add redaction before persistence, indexing, embedding, extraction, export, and future remote sync.
- Add doctor/status checks that report "secret source configured" without printing values.

This phase is not an authkey dependency. It is a memory-nexus security boundary phase that happens to make authkey integration clean.

### v5 optional interop

Add an optional interop item after the canonical event envelope and before/alongside remote sync:

**Secure Capability Interop**

Purpose:

- Detect whether authkey is installed and ready without failing if absent.
- Read masked readiness/status only.
- Accept `apiKeyRef` values such as `authkey://memory/openai-api-key` as documentation/doctor metadata, not as raw secret resolver input.
- Explore an authkey secret-fingerprint inventory API that lets memory-nexus detect known leaked secrets without seeing raw values.

## Config Direction

Bad:

```json
{
  "embedding": {
    "provider": "openai",
    "apiKey": "sk-..."
  }
}
```

Good:

```json
{
  "embedding": {
    "provider": "openai",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

Also good, as metadata only:

```json
{
  "embedding": {
    "provider": "openai",
    "apiKeyRef": "authkey://memory/openai-api-key"
  }
}
```

The `apiKeyRef` form must not make memory-nexus fetch raw secret values. It gives doctor/status enough information to say "run this command through authkey" or "authkey not ready."

## Immediate Dogfood Commands

```bash
authkey run --env memory -- memory sync --embed
authkey run --env memory -- memory extract memory-nexus
```

For local-only workflows:

```bash
memory sync
memory context memory-nexus --format ai
```

## Acceptance Criteria

- memory-nexus has no required authkey dependency.
- memory-nexus can run all local workflows with no authkey installed.
- secret-bearing remote provider workflows can be run through environment injection.
- memory-nexus config no longer encourages plaintext API keys.
- doctor/status never prints secret values.
- redaction happens before durable storage and before provider egress.
- tests prove `authkey://...` references are treated as references, not resolved raw secrets.

## Pushback

Do not integrate authkey as a generic secret resolver inside memory-nexus. That would recreate the raw-secret leak class both tools are trying to avoid.

The correct integration is capability-style:

- authkey owns secret retrieval and injection.
- memory-nexus owns memory ingestion, redaction, indexing, extraction, retrieval, export, and sync.
- shared future APIs return proofs, handles, fingerprints, or masked metadata, not plaintext.
