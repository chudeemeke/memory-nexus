---
adr: "0002"
title: v5 Local-First Optional Capabilities
created: 2026-06-05
status: accepted
---

# ADR-0002: v5 Local-First Optional Capabilities

## Decision

`memory` remains fully usable without authkey, cloud providers, remote sync, or hosted graph storage. Optional capability providers may expose readiness, masked metadata, handles, proofs, and fingerprints, but never raw secrets.

## Rationale

The product is first-party infrastructure used across projects. A hidden dependency on another tool would make memory brittle and less trustworthy. The safe authkey integration is process environment injection such as `authkey run --env memory -- memory sync --embed`, not memory-nexus calling `authkey get`.

## Alternatives

- Make authkey required: rejected because it breaks local-first workflows.
- Let memory resolve `authkey://...` to raw values: rejected because it creates an AI-visible secret path.
- Ignore authkey entirely: rejected because optional diagnostics and secret-safe dogfooding are valuable.

## Consequences

- Phase 38.5 must use a capability-status port.
- Tests must prove authkey absence is not a failure.
- Config references are metadata, not resolver instructions.

## Revisit Trigger

Revisit only if authkey ships a stable proof/fingerprint API that returns no plaintext secret material.
