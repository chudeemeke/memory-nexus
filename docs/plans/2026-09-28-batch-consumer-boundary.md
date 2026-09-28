# Batch consumer boundary investigation

Owner: memory-nexus. Active item: Q100.4.2.2.2.2.2.
Starting revision:9c79913. Status: synthetic investigation and reader repair;
no format activation, installation or authority migration.

## Requirements before choosing a mechanism

An old executable cannot be made to honor checks that exist only in new code.
Compatibility must preserve the ordered outcome and its governance, not merely
parse the bytes. An acknowledged new record must survive rollback. Authoritative
source and its derived database must refer to the same admitted store. Unknown
or offline consumers cannot be assumed upgraded. Any actual authority cutover
remains an owner decision under R03/P03/A03 as applicable.

The minimum structure is either a representation all supported readers handle
correctly, or a versioned store whose supported entrypoints enforce the boundary
before reading/mutating source or projections. A capability declaration alone is
not that boundary. Same-user arbitrary file access is outside an application
routing guarantee; do not call a path convention an OS security boundary.

## Tested counterexamples

The retained probe archives the actual v4.0.3 source tree and executes its replay
against synthetic SQLite stores, alongside the current reader. It uses the
current schema/OwnedDatabase and envelope producer: this is tagged-source proof,
not installed-registry or whole-CLI acceptance.

The fixture has an existing alpha fact and a batch deciding alpha->beta->gamma,
with denied consent on a shared graph edge. Pending file names are ignored until
the complete file is renamed into the existing event-discovery pattern. That
exercises discovery/publication, not crash/power-loss durability or remote atomicity.

| Representation | v4.0.3 outcome | Current-reader consequence |
|---|---|---|
| Wrapper only | Ignores the batch; only alpha remains | Correct chain and denied shared-edge consent |
| Wrapper plus identical flat effects, relative sequences | Alpha remains active because effects precede it | Exposed the same ordering defect before this repair |
| Wrapper plus flat effects with reserved sequence range | Fact chain is correct; shared-edge consent remains not_required | Conflicting effect identities refuse without replacing the DB |

The mirrored fixture grows from1780to6172bytes. That is a fixture measurement,
not a corpus-size estimate. Matching facts did not establish compatibility:
governance already failed, and two physical representations would additionally
need complete redaction, export/import and source reconciliation qualification.
Do not select mirroring merely because it makes an old fact-list test pass.

The current reader now binds an effect identity to its containing wrapper.
An identical standalone effect is still a conflicting owner and refuses before
projection replacement. Identical whole wrappers remain idempotent across files.
Both physical orders, single/multiple source files, unchanged live DB/source,
and the original synthetic representation probe are required verification.

## Candidate boundary and limits

A versioned paired source/DB root with retired conventional paths is the next
candidate to qualify. The synthetic fence uses a directory at the old database
file path and a regular file at the old events-directory path. Tagged old DB
initialization and source discovery must refuse, preserving the active DB.
An explicit old-reader override naming the new events root bypasses that routing
fence and still loses batch effects. This limitation is part of the probe, not
an unsupported safety claim hidden by a successful default-path test.

| Candidate | Outcome/governance | Boundary strength | Added work | Disposition |
|---|---|---|---|---|
| New version flag or consumer inventory alone | Does not change old behavior | Old code ignores it | Small | Insufficient |
| Mirrored ordinary effects | Fact ordering can be repaired; governance failed | No isolation | Duplicate representation and reconciliation | Rejected as a simple compatibility fix |
| Versioned paired store plus legacy-path fences | Current reader retains intended behavior | Routing fence only; explicit overrides bypass | Layout, migration/recovery, complete consumer inventory | Candidate; not activated or accepted |

These are veto conditions, not an average score: data loss or weakened consent
cannot be traded for implementation convenience. A new always-on broker or
separate live canonical queue is not justified by the evidence gathered here.

## Atomic qualification still required

1. Inventory supported entrypoints and persisted overrides: installed binaries,
   project hooks, desktop consumers, source-only tools, backup/restore, import,
   remote, and downgrade paths. Bind capability to the actual artifact and root.
2. Execute representative installed old and new artifacts against isolated homes.
   Prove old managed routes fail before source/DB mutation or misleading success;
   prove supported new routes reach the intended store. Source probes alone fail
   this gate. Preserve the explicit-override limitation in the support contract.
3. Design one recoverable migration transaction for source, DB, configuration and
   legacy fences. Test interruption at every transition; no ambiguous authority,
   silent empty replacement or lost acknowledged data. No real migration yet.
4. Prove rollback to a compatible reader while preserving every post-activation
   record. Reinstalling v4.0.3 against the new source or restoring an old snapshot
   without retaining later writes is not an acceptable rollback.
5. Require executable activation checks for the qualified store/consumer set.
   Unknown consumer or failed prerequisite leaves emission disabled and reports
   why. Do not claim a declaration or human inventory blocks arbitrary old code.
6. Present the concrete migration/rollback result at the applicable owner gate.
   If this boundary requires disproportionate machinery or cannot meet the
   routing contract, revisit the source representation before activation.

The consumer item remains active. This investigation does not solve the original
native interrupted-chain retry, final reader quality/adversarial review, installed
operation or the full E1-E10 goal. The approved embedding experiment still follows
baseline acceptance. Evidence is retained with the consumer investigation record.
