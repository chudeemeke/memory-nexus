# Offline embedding and desktop catch-up — decision proposal

Status: Step A approved by the owner on 2026-09-19, to run after baseline repairs. Steps B and C remain proposals, not approved for implementation.
Owner preferences confirmed September 19: generate embeddings locally while offline only if complexity stays modest; the desktop should both compute embeddings and receive the memory data.

Owner decision recorded 2026-09-19T14:42:12Z: "Run the bounded experiment after baseline repairs (Recommended)". This authorizes the local runtime/model and synthetic benchmarks described in Step A, including recording disk/resource footprint and removal instructions. Start after the baseline repair acceptance gates are closed; do not request this same authorization again. This is an approved queued task, not a configured background schedule. Real-memory profiling, production feature activation and memory replication are outside this approval.

## Recommendation

**Revised after Fable review:** prefer local computation on each active machine, using one deliberately selected embedding model and input recipe. The laptop always encodes its own documents and queries; the desktop encodes its own received/source corpus. Keep each machine's SQLite database local. Replicate durable source records and authoritative memory changes; rebuild derived indexes on each machine initially instead of transferring vector tables. This satisfies desktop computation without a network failover decision on every laptop query.

This is a good direction, but the complete request is a moderate feature, not a retry toggle. Run the approved bounded local-performance spike after baseline repairs. Evaluate replication separately against its data inventory and multi-writer requirements; laptop inference speed does not determine whether replication is useful. If local performance is unacceptable, keep capture and keyword search available and defer embeddings; do not add a second model/index automatically.

Assumption from the portfolio end state: the desktop remains the primary development workstation and ingests its own sessions, while the laptop can ingest distinct sessions offline. It is therefore not an expendable laptop-only backup. A whole-database snapshot is the simpler answer for a separate read-only backup, but must not replace the desktop's independently written live store. This assumption needs owner confirmation before replication implementation.

## Irreducible requirements

1. Accepted source content survives loss of desktop connectivity and process restart on the laptop. A desktop outage cannot roll back successful local ingestion.
2. The laptop can search locally. Semantic queries require a locally available compatible query encoder, not merely stored document vectors.
3. Source replication and embedding computation are distinct completion states. Receiving a vector from the desktop does not mean the desktop retained the underlying memory record.
4. Retries may repeat computation or delivery; they must not repeat durable effects. Acknowledgement follows durable commit at the receiver.
5. Remote machine identity, model identity, record identity, and privacy policy must survive reconnects. “Same model name” and “same number of dimensions” are insufficient compatibility proofs.
6. No implicit new egress, cloud fallback, silently dropped work, or resurrection of revoked/deleted data. Local-first does not mean every LAN/tailnet endpoint is automatically trusted.
7. Automatic catch-up requires a running trigger on an awake machine. A disconnected or sleeping laptop cannot transfer data; power-off is not a failed retry promise.

The minimum structure is two local stores, a compatible local encoder, one bounded worker, durable progress for each task, and acknowledged idempotent record transfer. No distributed lock service, message broker, CRDT vector index, permanent reachability monitor, or shared database file is required.

## What already exists, and what does not

Verified in this checkout:

- `EmbeddingService` queries unembedded rows and commits successful batches through `SqliteEmbeddingRepository.storeBatch`, which updates vectors and embedding state in one SQLite transaction. This already supplies part of the resume mechanism.
- Permanent oversize failures have model-scoped skip records. Byte-bounded batches and Ollama 413 splitting exist. Transient offline failures must never be turned into permanent skips.
- The original `runEmbeddingPass` reported manual resume but initialized outside its final disposal block and recreated dimension-changing tables before successful initialization. A failing regression reproduced the latter in this repair branch; the repair now initializes first and disposes in an outer finally. This bounded fix is independent of the proposed feature; atomic model-generation replacement after later batch failures remains a separate requirement.
- `computeModelHash` currently uses provider, model name, and dimensions. It does not pin weights/digest, preprocessing, truncation, task prefix, or runtime behavior. `findUnembedded` excludes any existing embedding state rather than independently scheduling several models. This is a single-index design; preserve that simplicity.
- A background embedder and PID lock exist. PID existence alone is not a durable claim/lease with process identity; concurrency and stale ownership require explicit qualification.
- `memory sync --remote` is explicit and uses a privacy-preflighted Git event transport. Current `MemoryEventKind` represents facts/governance/privacy/consent/projection/dream records; it does not represent the complete raw session/message corpus or vector index. Existing JSON export/import includes source sessions/messages/tool uses but is a backup/import surface, not a proven incremental replication protocol.
- Current laptop config selects Ollama `nomic-embed-text`, 768 dimensions. Hardware reports approximately 15 GiB RAM, an i5-1345U, and Iris Xe graphics. No `ollama` executable was found on PATH. This is not evidence that local inference is fast enough or that no runtime exists elsewhere.
- The September 19 desktop SSH probe timed out. Desktop model digest, runtime, source state, and performance were not reverified. September 12 source classification remains dated evidence.

## Proposed behavior

`memory sync --embed` first durably ingests and indexes locally, then uses the local encoder for bounded batches. Laptop capture, document encoding, and query encoding never wait on a reachability probe. The desktop performs its own embedding work when it receives missing source records. Desktop-first computation with a 1-second connection budget/circuit breaker remains a fallback design only if local profiling proves offloading necessary; it is no longer the default recommendation.

If the local model is unavailable, incompatible, or exceeds its resource budget, content stays safely captured and searchable by keyword. The command reports pending embedding work explicitly. It does not download a model, substitute a different model, or declare all work complete without policy approval.

When an explicitly enabled sync runs after connectivity returns, it compares a bounded receiver manifest of source IDs/revisions/hashes with local state, transfers missing permitted records, and accepts receipts only after receiver commit. A receiver store epoch detects rebuild/restore, and manifest reconciliation remains authoritative rather than trusting an old sender checkpoint. The desktop embeds missing records with its local encoder. Initial replication deliberately omits vector caches: recomputing derived indexes avoids transferring machine-local row IDs and adds no vector-conflict protocol. Some duplicate computation is an acceptable simplicity tradeoff; measure it before optimizing it.

Live queries use the same local encoder as the local document index. Query latency, cold-start behavior, and local query encoding are part of acceptance. Existing desktop-produced laptop vectors need an explicit validated migration; changing the fingerprint or adding missing task prefixes must never trigger silent index clearing.

Suggested output shape, subject to CLI/JSON compatibility review:

```text
Saved locally: 120 messages
Embeddings: local model, 120 complete
Desktop copy: 120 pending — next enabled sync will retry
```

Keep CLI behavior compatible: expose capture/embedding/replication status separately in JSON. Define partial-completion exit semantics explicitly; an opt-in deferred mode may return success for durable capture plus accepted pending work, while a strict completion mode must remain nonzero if required work is pending. Never quietly reinterpret an existing nonzero failure as complete success.

## Recovery and privacy contract

- **Identity:** stable source/session/message IDs plus revision or canonical content hash; never cross-machine SQLite row IDs. Bind embeddings to the redacted content hash and verified model/input fingerprint.
- **Reconciliation:** prefer a deterministic, rebuildable source/receiver manifest comparison over a second plaintext queue or an outbox as the sole record of pending work. Optional checkpoints accelerate scans but cannot hide missing receiver records after either machine is restored.
- **Receiver:** validate bundle schema/version, hashes, scope, size, authorization, and available disk space; deduplicate by immutable identity and commit imported records plus receipt before acknowledgement. Preserve normalized project identity from the source rather than resolving foreign paths against the receiver filesystem. Each source namespace has one authenticated writer; higher authorized revisions, including improved redaction, supersede and remove old content/vectors. Conflicting writers or same-revision/different-content records fail closed. Mutable governance is not silently treated as an immutable transcript.
- **Retries:** at-least-once attempts with idempotent effects. A lost acknowledgement causes a harmless resend. Advance the sender checkpoint only after receipt. Use bounded backoff with jitter and a durable next-attempt time; run work in bounded chunks with lease/lock recovery.
- **Revisions:** a worker commits an embedding only if the source revision still matches its claim. Concurrent edits cannot attach stale vectors to new text. Duplicate inference after a crash is acceptable; lost accepted records are not.
- **Governance:** recheck policy at execution and receive time. A task queued before consent withdrawal cannot authorize later egress. Persist consent identifying the intended receiver store and allowed data classes. Propagate suppressions, revocations, and deletions before exposing queued content; a tombstone dominates older source revisions, including after a laptop restore. Define retention/GC and explicit restoration policy before deleting tombstones. No raw corpus or corpus revisions enter Git history or a hosted remote; use direct authenticated machine-to-machine transfer. Existing derived-event Git sync keeps its existing separate consent boundary.
- **Models:** verify model artifact identity, dimensionality, preprocessing/task prefixes, truncation policy, and representative retrieval parity. Pin a validated generation. Never clear the working index simply because an unreachable endpoint advertises a new configuration; model migrations require a separately validated replacement and explicit switch.
- **Trigger:** first version retries on the next existing hook or explicit sync. This promises eventual catch-up when sync runs, not immediate catch-up merely because connectivity returned. Add an OS scheduled retry only if the owner wants that stronger behavior and approves its footprint. A bounded command transport over authenticated SSH can reuse `remotely` in this portfolio through a configurable port; the published memory package need not depend on remotely or add a listening daemon.
- **Data contract:** inventory every durable table/event category and classify it as authoritative replicated data, locally reconstructed projection, local-only metadata, or explicitly excluded private data. “All data copied” is forbidden until that inventory and replay/restore tests pass. Existing friction and source-message gaps must be resolved rather than hidden behind the current event-sync claim.

## Decision rubric

The initial weighted score bundled computation with replication and gave unwarranted precision to unmeasured efficiency. This revision uses separate decisions and explicit hard gates. Judgments below are comparative, not benchmark results. Hard gates: no mixed incompatible vector spaces, no lost acknowledged records, no implicit egress, no replacement of another writer's store, and no shared live SQLite file.

| Compute option | Offline semantic utility | Complexity / ongoing burden | Reversibility | Resource cost | Verdict |
| --- | --- | --- | --- | --- | --- |
| Capture + keyword search; defer desktop embeddings | Limited | Lowest | High | Low | Safe fallback |
| Always local encoder on each active machine | Full if profiling passes | Low-to-moderate: local runtime/model on each machine, no routing | High with explicit index migration | Unknown until measured | Preferred spike |
| Same model, desktop-first with local endpoint failover | Full if parity and profiling pass | Higher: circuit breaker, two query paths, compatibility across backends | Medium | Unknown | Only if measured offload benefit justifies it |
| Different models / dual laptop indexes | Full | High: query routing, migration and reconciliation | Lower | Unknown | Reject for initial version |

| Replication option | Suitable topology | Complexity / recovery | Privacy and retention | Verdict |
| --- | --- | --- | --- | --- |
| Consistent whole-store snapshot | Dedicated read-only backup | Lowest; explicit restore/rotation | A second full copy; deletion requires backup-retention policy | Prefer only if desktop is solely a replica |
| Receiver-manifest record reconciliation | Two machines own distinct source namespaces | Moderate; revisions, receipts, epochs, tombstones and version refusal required | Explicit receiver/data-class consent; no raw Git corpus | Candidate for the actual workstation topology |
| Network-mounted live SQLite | Cross-machine shared writer | Violates SQLite WAL host constraint and offline goal | Expands live-store exposure | Reject |

Local inference and replication can each be accepted or rejected independently. “Advanced” should describe recovery guarantees, not the number of moving parts.

## Approval proposal and acceptance gates

**Step A — approved bounded spike, after baseline repairs and before feature implementation.** Install/use a local runtime and pin a selected nomic model artifact within the owner's approval recorded above. Record runtime/autostart/port footprint, disk usage and uninstall steps. Use an explicitly synthetic corpus initially; any representative local-data profiling is a separate privacy-approved local-only operation with aggregate-only output and cleanup. Record cold/warm query latency, batch throughput, peak memory, CPU load, and temporary network loss. Measure current desktop performance and typical offline delta when reachable. Local-always is the primary candidate; endpoint parity is a gate only for reusing legacy vectors or accepting endpoint failover.

Assessment targets for the approved experiment: cold local semantic query p95 at most 3 seconds and warm p95 at most 1 second over at least 100 representative queries; bounded background batches yielding within 5 seconds; peak extra memory at most 2 GiB. Compare foreground task latency with/without background embedding, allowing at most 10% p95 regression. Defer bulk backlog on battery initially; do not claim battery savings without measurement. If considering mixed endpoint output or legacy-vector reuse, require minimum corresponding-vector cosine 0.999 and top-10 retrieval overlap at least 0.95 across a fixed corpus/query set, with documented task prefixes and truncation. These are experiment assessment criteria; they do not guarantee universal equivalence or authorize Steps B or C.

**Step B — local availability and durable embedding progress.** Reuse the pipeline, tighten model identity and lifecycle with a reviewed legacy-index migration, expose per-stage outcomes, and prove process crash/restart, partial batches, stale results, simultaneous hooks, resource exhaustion and disk-full behavior. Test with real temporary databases and a fault-injected provider. Do not add endpoint fallback unless profiling justifies it.

**Step C — desktop source replication, separately gated.** First inspect existing import idempotence and inventory all durable data. Establish per-origin writer ownership, mutable governance conflict rules, receiver manifests/epochs, redaction revisions, tombstone/restore semantics, and consent. Adapt source export/import only where those contracts hold; transfer via authenticated private command transport, never raw transcript Git history. Prove duplicates, lost acknowledgements, partial transfer, both-side restores, conflicting content, suppression/deletion, interrupted upgrades, and useful retrieval from a fresh desktop store. Rebuild embeddings on the desktop initially.

Approve Step B only if Step A meets the simplicity/performance targets. Approve Step C only after the data/topology/retention/identity design and real receiver tests are reviewed; it is independent of Step A's speed result. Preserve baseline-repair priority; this proposal does not silently replace v6 or authorize deployment.

## Independent review and disposition

Fable (`--effort high`, read-only packet review after a live READY smoke) returned **APPROVE WITH CONDITIONS for the spike only**. It did not inspect source independently; no full-code-review claim is made. The retained review is `docs/audits/2026-09-19-repair-evidence/offline-design-fable-review.md`. This revision accepts its topology, raw-Git privacy, receiver-restore, local-always, rubric, cold-latency, source-identity, no-daemon, and opt-in-trigger findings. The reviewer also asserted a prior desktop disk incident without supplied evidence; that historical assertion is not adopted, while disk preflight is retained as an ordinary correctness requirement. Optional plugin-auth suggestions are unrelated to this work and were not acted on.

## Primary references

- [SQLite WAL](https://www.sqlite.org/wal.html): same-host shared-memory requirement and transaction/checkpoint behavior; supports keeping each live database local.
- [SQLite network caveats](https://www.sqlite.org/useovernet.html): network-filesystem failure concerns; transport records through an application boundary instead of mounting a database.
- [Ollama embedding API](https://docs.ollama.com/api/embed): explicit model/input/dimensions/truncation contract and timing fields for profiling.
- [Ollama model inventory](https://docs.ollama.com/api/tags): model artifact digests and runtime metadata for compatibility checks.

No new model, local inference runtime, scheduler, endpoint, replication path, or fallback policy has been installed or activated for this proposal.
