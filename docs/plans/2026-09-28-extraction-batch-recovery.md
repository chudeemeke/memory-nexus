# Durable extraction batch recovery

Owner: memory-nexus. Parent: Q100.4.2.2.2, coordinated with Q100.4.2.11.
Status: baseline implementation plan; no canonical source activation or integration.

Checkpoint: domain descriptor Q100.4.2.2.2.1 is scoped-verified. Source/replay
Q100.4.2.2.2.2 is active on a retained real-source rejection. Final four-file
group104tests/341assertions per Windows runtime; codec100all4/102branches and
20targeted faults detected. Evidence: `.planning/memory-resilience/evidence/Q100.4.2.2.2.1.json`.
The interrupted pipeline still fails; no batch writer or receiver is activated.

## Evidence and required outcome

The native counterexample in Q100.4.2.2.1 kills extraction after an
alpha->beta->gamma replacement chain reaches source/replay but before SQLite audit
commit. Retry re-runs comparison, appends two replacements and leaves beta active.
Stable content matching and an in-memory working set cannot recover the original
ordered operation against the database that operation already changed.

Irreducible requirements:

1. Preserve the original ordered decisions and identities before claiming success.
2. Distinguish no durable decision, durable decision awaiting projection/audit,
   and acknowledged completion. Retry must not request new provider output to
   reconstruct an already committed decision.
3. Validate the complete operation before applying any effect; malformed,
   truncated or conflicting source must fail closed without partial replacement.
4. Preserve privacy, legacy readability, governance and source-based recovery.
5. Existing force and changed-input semantics remain meaningful. A missing audit
   is not evidence that no source effects occurred.

## Minimum structure and decision

Use one integrity-checked canonical source record containing ordered fact effects
and the extraction audit summary. The record's envelope event ID is the batch ID;
the descriptor must not introduce a second competing batch identity. The existing
v2 envelope can carry a specifically validated `projection/add` extraction-batch
payload. Child effects are fact descriptors, not nested integrity envelopes: the
outer hash protects the whole batch, and ordinary recursive privacy remediation
does not leave stale nested hashes. No second queue, database or service.

| Approach | Retry identity | Ordered outcome | Recovery authorities | Decision |
|---|---|---|---|---|
| Recompare existing content | Absent | Can change after interruption | Existing log and DB | Rejected by native RED |
| Deterministic fact IDs alone | Per fact | Does not preserve old decisions or completion | Existing log and DB | Insufficient |
| Separate durable command journal | Can preserve both | Requires coordinated journal/source recovery | Adds another store | Unnecessary here |
| One source batch record | One operation and explicit child IDs | Ordered effects and outcome retained together | Existing canonical source; DB remains derived | Selected, pending complete qualification |

This is record-level commitment, not a claim that append is fsync/power-loss
durable or that JSONL plus SQLite form one transaction. Partial append and disk
durability remain Q100.4.2.10; invalid records block replay rather than disappearing.

## Required implementation slices

- Q100.4.2.2.2.1: domain descriptor codec. Version, session/input/project,
  provider/model, canonical completion timestamp, exact result counts and ordered
  effect descriptors. Reject unknown structural fields, invalid identities,
  non-JSON metadata, duplicate IDs, impossible counters, forward/self/duplicate
  supersedence and control-event injection. Metadata projection semantics are
  additionally validated by existing projection validators before activation.
- Q100.4.2.2.2.2: source/replay integration. Validate the entire wrapper before
  flattening effects in explicit array order, preserving batch/source provenance.
  Check IDs across wrappers and ordinary events; duplicates must be identical.
  Compatibility Fact readers must expose the effects, canonical readers preserve
  the raw wrapper. Existing staging/promotion remains the atomic DB boundary.
  Prove mixed legacy/new sources, corruption, privacy remediation, governance,
  transport preservation and refusal by unsupported consumers; no silent dropping.
- Q100.4.2.2.2.3: audit and pipeline integration. Bind new audit rows to their
  canonical batch event. Preserve legacy rows with no invented source identity.
  Plan decisions before the single source append; after commit, recover effects
  and audit from source. Recovery precedes provider invocation. Unacknowledged
  committed batches resume even when force was requested; a subsequent force
  after acknowledged completion may create a new attempt. Changed input gets a
  new identity and must never be certified by an old outcome. Ambiguous competing
  source attempts require explicit conflict handling, not wall-clock guessing.
- Q100.4.2.2.2.4: native interruption/compatibility acceptance. Kill before append,
  after append, during replay and before/after audit, then restart with provider
  unavailable or different output. Assert stable IDs/source bytes, intended final
  active chain, original audit counts, force/changed-input behavior and no secret
  egress. Required full quality/platform/review barriers remain mandatory.

Only the first slice is initially active. No writer emits this format until the
reader, validation, remediation and recovery prerequisites are implemented and
qualified. R03 still governs baseline integration; this plan does not authorize
production replication, installation, real-data migration or a new service.

## Descriptor limits

The codec validates data and relationships, not database existence or authorization
of an external supersedence target. Wiring must check those against the admitted
snapshot and preserve source/DB lock order. It does not classify arbitrary custom
metadata as safe, establish provider consent, validate model vectors or prove
whole-source identity uniqueness. Those checks remain at their owning boundaries.
JSON metadata is finite, dense, plain data; cyclic objects, unsupported values and
non-plain objects must refuse instead of being silently changed by serialization.
The descriptor permits at most64levels of JSON object/array nesting from its root;
deeper input refuses before serialization. Overall record/corpus sizing and scaling
remain Q100.4.2.13 obligations before integration.
