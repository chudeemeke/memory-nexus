---
adr: "0003"
title: v5 Remote Sync Security Posture
created: 2026-06-05
status: accepted
---

# ADR-0003: v5 Remote Sync Security Posture

## Decision

Remote sync will be Git-backed, opt-in, preflighted, redacted, identity-bound, and recoverable. The first release may use redacted plaintext event logs in a private Git repository. Encryption-at-rest for remote bundles is a future enhancement unless Phase 38.2 finds a blocking risk.

## Rationale

Git transport is inspectable and recoverable, but sync is data egress. The correct boundary is not "does Git work?" It is "can the user see and control what leaves the machine?"

## Alternatives

- Push raw event logs automatically: rejected.
- Use hosted sync service: rejected.
- Require encryption before any sync: deferred because it complicates deterministic merge and recovery; redaction plus private repo plus preflight is acceptable for first release.

## Consequences

- Phase 38.3 implements transport as an infrastructure adapter behind application ports.
- Phase 38.4 exposes preflight, doctor, backup, restore, and rollback.
- Remote URL/ref validation and sanitized Git environment are release blockers.

## Revisit Trigger

Revisit if private Git redacted plaintext is unacceptable in user acceptance testing or if a concrete threat makes encryption mandatory.
