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

### Installed Windows evidence at a4b44b7

The installed `C:/Users/Destiny/node_modules/@chude/memory` package matches all
214 files in the integrity-checked registry artifact for `@chude/memory@4.0.3`.
Executing that CLI directly with its existing dependencies reproduces silent
projection loss: one valid batch record yields exit 0/status `ok` and an empty
fact table. Current source yields the new fact. Both report version `4.0.3`;
capability must be bound to artifact content, not that version string.

Six isolated CLI rebuild cases and twelve maintenance cases establish:

| Fixture / command | Installed 4.0.3 and current source behavior | Consequence |
|---|---|---|
| Event file fence / rebuild confirm | Error; existing fact survives; DB bytes change | Source discovery is too late to promise no database mutation |
| Database directory fence / rebuild confirm | Error; directory remains | Tested database open refuses |
| Event file fence / backup create | Success; reports `includesEvents:false`; DB bytes change | A source fence can be treated as absent source, so backup success does not establish completeness |
| Event file fence / restore confirm | Error after `existing` is replaced by `donor-fact`; source fence remains | Demonstrated partial restore; owned by Q100.4.2.4 and Q050 |
| Event file fence / rebuild verify | Error; existing fact and DB bytes preserved | Scoped nonmutating refusal |
| Paired fences / backup, restore, rebuild verify | All error; both fences remain intact | Supports paired routing only for these commands; not complete entrypoint qualification |

The restore donor uses a different fact identity from the destination so a
replacement before error is observable. Retained initial probes include a hash
normalization harness failure and an equal-donor fixture that could not expose
this replacement. Final runs recheck all installed artifact and source hashes.
Temporary homes are owned and cleaned. Existing installed dependencies were used;
the current control is source execution, not a fresh installed candidate.

Local route inventory found a working Bun `memory.exe --version` and a failing
npm `memory.cmd --version` backed by a stale broken junction. The Bun launcher
fallback has not been attributed to the matched package by a trace; do not equate
the two proofs. No live launcher was repaired. D04/D04.1 own route qualification
and the applicable adoption decision owns live repair. Four known Claude config
paths yielded no direct memory hook command strings; indirect scripts, plugins,
portfolio hooks, desktop consumers and persisted overrides remain unqualified.

Current path helpers derive database and events together from XDG data home.
That is reusable routing infrastructure, not a capability boundary: giving an old
process the new XDG root also gives it the new store. Backup/restore, import/export,
remote transport, source-only verification and generated hooks must be included
in the supported-consumer contract. An old restore failing after DB replacement
is explicitly not an acceptable refusal.

Evidence: `.planning/memory-resilience/evidence/Q100.4.2.2.2.2.2-installed.json`.
No live migration, installation change, format emission or consumer acceptance.

### Remaining sequence

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
