---
schema_version: "1.3"
source_project: tailscale
created: 2026-06-17
type: enhancement
severity: medium
fix_status: tested
affects_scope: this-project-only
workaround_applied: "Memory config updated with explicit consent; endpoint verified. Full 768-dimension re-embed is now blocked by memory-nexus Ollama 413 batch handling, not by Tailscale reachability."
priority_rationale: "Provider egress is scoped to the exact sidecar host; endpoint contract is accepted, but embedding rebuild cannot complete until memory-nexus fixes oversized Ollama batch handling."
closure_notify_to: tailscale
closure_notify_reason: "Tailscale should know whether memory-nexus consumes, rejects, or needs changes to the Ollama endpoint contract."
issue_id: tailscale:2026-06-17:ollama-egress-endpoint-confirmed
thread_id: memory-nexus:2026-06-14:confirm-ollama-egress-endpoint
related_issue: C:\Projects\tailscale\docs\inbox\archived\2026-06-21-memory-nexus-ollama-sidecar-offline-after-desktop-restart.md
next_owner: memory-nexus
status: in-progress
triaged_at: 2026-06-21
---

# Ollama Tailnet Endpoint Confirmed

## Decision

Use `https://ollama.tail859c3a.ts.net` as the Ollama embedding endpoint.

Do not use `https://destiny-desktop.tail859c3a.ts.net`; the desktop root Serve endpoint remains retired/no config.

## Verification

- `curl.exe --fail --silent --show-error --max-time 30 https://ollama.tail859c3a.ts.net/api/tags` returned `nomic-embed-text:latest`, `embedding_length` 768, and capability `embedding`.
- `/api/embed` smoke returned model `nomic-embed-text`, one embedding, and 768 dimensions.
- `tailscale status --json` showed `ollama.tail859c3a.ts.net` online with `tag:ai`.
- Desktop root `ssh desktop tailscale serve status` and `ssh desktop tailscale funnel status` returned `No serve config`.
- Final Tailscale v1.1 validation on 2026-06-18 rechecked the endpoint after
  the native WSL Docker migration: `curl.exe --include --noproxy '*' --max-time
  30 https://ollama.tail859c3a.ts.net/api/tags` returned `HTTP/1.1 200 OK`,
  `Server: nginx/1.27.5`, and `nomic-embed-text:latest`.

## Suggested memory config

Update `C:\Users\Destiny\.config\memory\config.json` after memory-nexus review:

```json
{
  "embedding": {
    "enabled": true,
    "provider": "ollama",
    "model": "nomic-embed-text",
    "dimensions": 768,
    "baseUrl": "https://ollama.tail859c3a.ts.net",
    "batchSize": 100
  },
  "providerEgress": {
    "consent": "granted",
    "allowedHosts": ["ollama.tail859c3a.ts.net"],
    "allowedProviders": []
  }
}
```

Preserve unrelated existing config keys.

## Operational note

Ollama rejects requests proxied with `Host: ollama.tail859c3a.ts.net`, so the sidecar includes an internal nginx proxy that rewrites the backend Host header to `localhost:11434`. This does not create public exposure: the endpoint is tailnet-only, tagged `tag:ai`, and has no host-published port or Funnel.

## Service continuity watchout

The memory-nexus contract should stay at the Tailscale service layer:

- Keep using `https://ollama.tail859c3a.ts.net`.
- Do not target `destiny-desktop.tail859c3a.ts.net`.
- If the Ollama endpoint temporarily returns `403` or `502`, treat it as a Tailscale service incident first and check the Tailscale registry/runbook before changing memory config.

## Test plan for memory-nexus

1. Update the memory config to the exact host above.
2. Run `memory status --embedding` or `memory doctor` if available to confirm provider egress readiness.
3. Run `memory sync --embed`.
4. Keep the egress allowlist host-specific; do not allowlist `destiny-desktop.tail859c3a.ts.net`.

## Memory-nexus triage

Endpoint contract accepted: `https://ollama.tail859c3a.ts.net` is the correct service-layer endpoint, and `https://destiny-desktop.tail859c3a.ts.net` must not be used for embeddings.

Runtime consumption is blocked as of 2026-06-21 after the desktop restart:

- `tailscale status --json` showed `ollama.tail859c3a.ts.net` and `destiny-desktop.tail859c3a.ts.net` offline after a short grace-window recheck.
- `curl.exe --include --noproxy '*' --max-time 20 https://ollama.tail859c3a.ts.net/api/tags` timed out.
- `remotely status` reported TCP/22 timeout to `destiny-desktop`.
- Current memory config still points at `https://destiny-desktop.tail859c3a.ts.net`, and `providerEgress` is unset.

No memory config change was applied because provider egress consent and endpoint consumption should wait until the live sidecar endpoint is reachable again.

Live reachability recheck passed after the desktop came back online:

- `tailscale status --json` showed `destiny-desktop.tail859c3a.ts.net` online at `100.79.252.21`.
- `tailscale status --json` showed `ollama.tail859c3a.ts.net` online at `100.78.23.108` with `tag:ai`.
- `curl.exe --silent --show-error --include --noproxy '*' --max-time 30 https://ollama.tail859c3a.ts.net/api/tags` returned `HTTP/1.1 200 OK`, `Server: nginx/1.27.5`, and `nomic-embed-text:latest` with `embedding_length` 768.
- `remotely status` reported TCP/22 ok, SSH ok, and WSL2 ok.

The immediate remaining action at this point was a consented memory configuration change, not a Tailscale endpoint decision.

## Memory Config Update - 2026-06-21

User granted explicit provider egress consent. `C:\Users\Destiny\.config\memory\config.json` was updated to:

- `embedding.provider`: `ollama`
- `embedding.model`: `nomic-embed-text`
- `embedding.dimensions`: `768`
- `embedding.baseUrl`: `https://ollama.tail859c3a.ts.net`
- `providerEgress.consent`: `granted`
- `providerEgress.allowedHosts`: `["ollama.tail859c3a.ts.net"]`
- `providerEgress.allowedProviders`: `[]`

A timestamped backup was written before the change. The first write used PowerShell UTF-8 with BOM, which the installed CLI rejected as invalid JSON and fell back to defaults. The file was rewritten as UTF-8 without BOM; `memory doctor --json` and `memory status --embedding --json` then reported valid config, Ollama embedding readiness, and provider egress allowed for `ollama.tail859c3a.ts.net`.

`memory sync --embed` completed local sync but skipped re-embedding in non-interactive mode because the model changed from `Xenova/all-MiniLM-L6-v2` to `nomic-embed-text`. A forced re-embed was then started with `memory sync --embed --force --quiet`. It cleared the old 384-dimension embeddings and began rebuilding the 768-dimension corpus. Latest observed progress in this session was `2000 / 365870`.

## Tailscale Closure Update - 2026-06-21

Tailscale has closed the paired outage item for the desktop restart/control-path
incident. The service-layer endpoint contract is unchanged:
`https://ollama.tail859c3a.ts.net`.

Current verified facts:

- `destiny-desktop.tail859c3a.ts.net` is online again.
- `ollama.tail859c3a.ts.net` is online with `tag:ai`.
- `Test-NetConnection destiny-desktop.tail859c3a.ts.net -Port 22` returned `TcpTestSucceeded=True`.
- `ssh desktop hostname` returned `Destiny-Desktop`.
- `remotely status` reported TCP/22 ok, SSH ok, and WSL2 ok.
- `curl.exe --include --noproxy '*' --max-time 30 https://ollama.tail859c3a.ts.net/api/tags` returned `HTTP/1.1 200 OK`, `Server: nginx/1.27.5`, `nomic-embed-text:latest`, and `embedding_length` 768.

Next owner remains `memory-nexus`: grant or reject provider egress explicitly
and, if approved, update memory config to `https://ollama.tail859c3a.ts.net`
without using the desktop root endpoint.

## Memory batching blocker update - 2026-06-22

Endpoint consumption is accepted and verified, but the full re-embed is no
longer just an in-progress Tailscale endpoint task.

Kanbanflow filed `docs/inbox/2026-06-22-kanbanflow-embed-413-oversized-batch-stalls-reembed.md`
after `memory sync --embed` aborted at `168300/366032` with `Ollama error
413: Request Entity Too Large`. Triage confirmed the Ollama endpoint is
reachable and the installed `memory` binary is v4.0.0. The blocker is now the
memory embedding pipeline's count-based `batchSize: 100` behavior and lack of
413 split/retry or skippable-message handling.

This item should stay open until memory-nexus has either completed the 768-dim
re-embed after fixing batching or explicitly documents a safe temporary
operational workaround. No Tailscale endpoint change is currently required.

## Memory-side source fix update - 2026-06-22

Phase 41.1 completed the memory-side source fix for oversized embedding
batches. Source gates passed, including typecheck, build, full tests, coverage,
dependency audit, inbox lint, and diff whitespace.

The fixed source has now also been installed locally for the global `memory`
command via Bun link to `C:\Projects\memory-nexus-hotfix-41-1` at hotfix commit
`03cbe28`. Runtime status reports Ollama provider egress allowed for
`ollama.tail859c3a.ts.net` with `maxBatchBytes: 800000`, and live embedding
progressed against the sidecar after install.

This item is no longer blocked on Tailscale reachability or memory's local
install state. The remaining distinction is release scope: npm still has
`@chude/memory@4.0.0`, so registry-level distribution requires a `4.0.1` patch
publish with OTP. Full corpus re-embedding can continue as a long-running
memory operation; it is not evidence of a Tailscale endpoint defect.

## Event Log

- 2026-06-17T00:00:00.000Z | tailscale | filed | Confirmed Ollama sidecar endpoint for memory provider egress.
- 2026-06-17T00:00:00.000Z | tailscale | correction | Kept the memory-nexus notice at the Tailscale service contract layer; runtime details remain Tailscale-owned.
- 2026-06-18T19:15:00.000Z | tailscale | triaged | Revalidated Ollama endpoint during final v1.1 audit after native WSL Docker migration; endpoint contract unchanged.
- 2026-06-21T00:00:00.000Z | memory-nexus | triaged | Accepted the endpoint contract but deferred memory config changes because the Ollama sidecar and desktop control path were offline after desktop restart.
- 2026-06-21T13:06:29.000Z | memory-nexus | decision | Live reachability recheck passed; remaining action is explicit provider egress consent and memory config update.
- 2026-06-21T14:00:00.000Z | tailscale | counter_notified | Tailscale archived the paired outage item after desktop TCP/22, raw SSH, remotely, and Ollama HTTPS all revalidated; endpoint contract remains unchanged.
- 2026-06-21T13:15:00.000Z | memory-nexus | in_progress | User granted provider egress consent; memory config was updated and full Ollama re-embedding started.
- 2026-06-22T00:28:00.000Z | memory-nexus | triaged | Full re-embed is blocked by memory-nexus Ollama 413 oversized batch handling; endpoint remains healthy and no Tailscale config change is currently required.
- 2026-06-22T02:07:50.000Z | memory-nexus | in_progress | Memory-side oversized batch source fix passed gates; endpoint item remains open pending fixed install/publish and successful 768-dimension re-embed.
- 2026-06-22T05:25:00.000Z | memory-nexus | in_progress | Fixed global CLI now uses `C:\Projects\memory-nexus-hotfix-41-1` at commit `03cbe28`; Ollama endpoint remains reachable and provider egress allowed. Remaining work is npm patch publish/full corpus completion, not Tailscale endpoint repair.
