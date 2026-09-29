**Verdict: APPROVE WITH CONDITIONS.** Approve Step A only. Steps B and C need the changes in the P0 findings before they return for approval.

I used no tools, per the reviewer brief. Everything I say about the code rests on the proposal's own statements, and I verified none of it independently.

## P0: resolve before B/C can be approved

**1. The purpose and topology of the desktop copy are never stated, and the rest of the design depends on them.**
- The proposal does not say whether the desktop is a backup, a read replica, or a second writer that ingests its own sessions.
- If it is a backup or read replica, shipping a consistent whole-database snapshot (`VACUUM INTO` or the backup API) beats record replication on simplicity.
  - It is idempotent and needs no outbox, checkpoint, or conflict protocol.
  - Vectors travel with internally consistent row IDs.
  - Deletions propagate automatically, provided old snapshots are removed.
  - The rubric omits this option.
- If the desktop also writes, this is multi-master over mutable entities: facts, governance, suppressions, friction status. "Same ID, different content is a conflict" is then not a sufficient model.
- Declare one of these:
  - Laptop sole writer, desktop replica: evaluate snapshot shipping first.
  - Bidirectional: that is a roadmap-phase decision, not an appendix to an embedding decision.

**2. The transport cannot honor erasure, and automatic push contradicts a standing privacy rule.**
- Step C extends "the existing canonical transfer/replay boundary", which is the Git event transport.
- Raw sessions in Git history cannot be purged without rewriting history.
- "Authenticated private transport through existing infrastructure" does not exclude a hosted Git remote, which would be third-party egress of the whole corpus.
- State explicitly that the raw corpus never travels through Git or any hosted remote.
- CLAUDE.md says plain `memory sync` must not silently push. Hook- or scheduler-driven catch-up therefore needs a durable consent record naming the receiver store's identity. "If approved" is not enough.

**3. The acknowledged-checkpoint model loses data silently when the receiver is restored or rebuilt.**
- If the desktop store is restored from backup or re-initialized, the sender's checkpoint is ahead of the receiver. The gap is permanent and nothing detects it.
- This case is missing from the fault list, even though "fresh store" appears in the acceptance text.
- Fix option A: derive the delta from receiver state, for example a per-session manifest of ID, revision, and hash.
- Fix option B: key checkpoints to a store epoch UUID that changes on init or restore.
- The proposal offers "rebuildable scan" as an alternative to the outbox. Make it the primary mechanism, because it has less state to corrupt and heals itself.
- A laptop restore can resurrect deleted records. Define whether the tombstone or the resurrected record wins.

**4. The failover design undercuts the proposal's own "no mixed vector spaces" gate.**
- One laptop index would hold both desktop-computed and laptop-computed vectors, and queries would be encoded by whichever endpoint is up.
- A matching model digest does not guarantee matching output. Output can drift with:
  - the runtime version
  - the CPU versus GPU backend
  - quantization
  - effective context length
  - the truncation setting
- "Representative retrieval parity" has no numeric threshold, so the gate cannot fail.
- Missing option: the laptop always embeds locally and the desktop embeds its own replica.
  - This removes the circuit breaker, the endpoint preference, per-query fallback, and ongoing parity checks.
  - It still satisfies "desktop computes".
  - Parity then matters only for the legacy vectors the desktop already computed.
- Either way, define a threshold. Examples: minimum cosine on identical text, and top-k overlap on a fixed query set.

**5. Tightening `computeModelHash` is a full-index migration, and the proposal names a live data-loss bug without acting on it.**
- Any new hash input makes every existing vector look foreign.
- Combined with table recreation running before successful initialization, a misreporting or unreachable endpoint can drop the working index today.
- Fix that ordering and the disposal gap in the baseline-repair branch now, independent of this feature.
- Specify how the legacy hash is handled: a one-time verified alias or a planned re-embed.
- Confirm whether the code applies nomic's document and query task prefixes. If it does not, adding them forces a re-embed regardless.

## P1

**6. The conflict rule blocks privacy fixes.**
- Re-redaction after a rule improvement legitimately produces the same ID with different content.
- Under "conflict requiring disposition", the less-redacted revision stays on the desktop in a manual queue.
- The higher revision from the single writer must win automatically.
- The old revision and its vectors must be erased, not orphaned.

**7. The rubric does not discriminate between options, and one gate is a false dependency.**
- The preferred option scores 4.60 and the fallback 4.50. One defensible rescore flips the ranking.
  - The proposal calls the work "a moderate feature". Simplicity 4→3 gives 4.40.
  - A second full corpus copy plus an automatic transfer path should not earn a full privacy score. Privacy 5→4 also gives 4.25.
- Efficiency is scored but unmeasured. Mark it unknown.
- The options bundle two independent decisions: where the laptop's vectors come from, and whether and how the corpus replicates. Score them separately.
- Add two criteria: reversibility, and ongoing operational burden. Every model upgrade becomes a coordinated two-machine migration.
- Gating C on A's result is wrong. Laptop encoder speed says nothing about whether replication is worth building.
  - Gate C on the data inventory.
  - Also gate it on a cheap read-only check of whether the existing `import` is already idempotent.
  - That check could make `export --since | ssh … import` a near-zero-cost first version.

**8. The performance plan measures the wrong path and has no baseline.**
- Ollama unloads idle models, and the CLI is invoked sporadically from hooks. The cold path is therefore the common path, so set the target on cold p95.
- Alternatively, decide a keep-alive policy and count the resident memory it costs.
- The proposal gives none of these:
  - corpus size
  - typical offline delta
  - current desktop throughput
  - current query latency
  - how often the desktop is actually unreachable
- It also does not say what a semantic query does today when the endpoint is down. A graceful full-text fallback with an explicit notice is cheap and worth doing regardless.
- "Battery impact" and "no interactive stalls" have no measurement method. Give them one or drop them.
- "Short bounded connection attempt" needs a number. Connections to an offline tailnet peer tend to hang until timeout.

**9. Cross-machine identity and host hazards are unaddressed.**
- Project identity:
  - Replicated sessions carry project paths encoded on the laptop.
  - The desktop must not re-resolve them against its own filesystem.
  - Project identity has to be a replicated, normalized field. `project-name-resolver.ts` is already modified on this branch.
- Version skew: the receiver must refuse bundle schemas newer than it understands.
- WAL hazard: check whether either machine's database is reached across the Windows/WSL boundary.
  - That is the same write-ahead-log shared-memory hazard the proposal cites when rejecting network mounts.
- Desktop disk:
  - The desktop volume has a recorded disk-exhaustion incident.
  - Require a free-space precheck before receiving.
  - Issue receipts only after the data is durably flushed.

**10. The receiver surface and endpoint authentication are unspecified.**
- A listening daemon is a new authenticated network service. It would also pre-empt v6's server surface.
- An SSH-invoked CLI that reads a bundle on stdin and emits a JSON receipt needs no port, and it reuses existing key authentication.
- Make the transport a configurable command port, not a hard dependency on `remotely`, because this is a published package.
- The desktop Ollama endpoint is unauthenticated HTTP. Require a tailnet-only binding, access-control restriction, and a host allowlist entry.

**11. Drop the scheduler from the first version.**
- Session-end hooks already fire constantly, so the next sync after reconnection carries the delta.
- Replace the PID lock with a SQLite lease row holding an owner token and an expiry. That avoids Windows PID reuse.

## P2

- The suggested output is human prose, but the primary consumer is an agent reading stdout. Specify the JSON state fields first.
- A "sanitized corpus" is a new artifact with an unverified sanitizer. Instead, profile locally against a temporary copy of the real database, record only aggregate metrics, and delete the copy.
- Installing Ollama on Windows adds an auto-start service and a localhost port. Record that footprint and the uninstall steps so the spike is reversible.

## Conditions on Step A

1. Answer findings 1 and 2 in writing alongside the spike. Those answers decide whether B/C exist in anything like their current form.
2. Add the local-always configuration and cold-path latency to the measurements.
3. Set numeric parity thresholds before running.
4. Record baseline numbers.
5. Land the finding-5 lifecycle fix separately, and do it now.
6. Make no production transfer, scheduler, or configuration change, as the proposal already states.

I did not create the plan file or launch exploration agents, because the reviewer brief forbids tools and edits. This review is the deliverable. Separately, the asana, atlassian, figma, intercom, linear, and slack design-plugin servers need authorization before they can be used. That can be done through `claude mcp` or `/mcp` in an interactive session.
