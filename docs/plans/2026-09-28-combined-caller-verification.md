# Combined database caller verification

Owner: memory-nexus. Baseline task B11.74.6.3.2; draft PR #1.

Verify the current factory and all mapped native callers together on Windows
Bun1.4.1 and1.3.14. Use three explicit groups: database/repositories/services,
CLI and JSON helpers, and application services/evaluation. Retain complete output,
source hashes, runtime identity and owned temporary storage cleanup. Group failure
prevents acceptance; historical individual passes cannot override a current failure.

The refreshed map scans224 production/script modules and records57 modules with
selected calls. Its187 native prepares consist of179 local disposal scopes and
eight helper returns with audited scoped consumers. Owning native delegation via
Reflect.apply is separately inspected and covered by native owner tests. Dynamic
startup and purge seams remain explicitly mapped. This static audit does not
prove every behavioral decision or platform contract.

Combined verification exposed three integration issues:

- The public `show` prefix lookup lacked scope disposal. Native success, missing
  session and SQLite read-error tests reproduced the omission. The statement now
  disposes before leaving the lookup; removing that scope fails the native test
  and AST audit.
- A projection test confused missing source files with an explicitly empty log.
  Missing files must refuse a destructive rebuild. The success fixture now uses
  an empty log, and a separate native test proves missing logs preserve stored facts.
- Duplicate-only extraction invoked rebuild despite appending no facts. A missing
  log caused failure; an empty log could erase existing facts. Replay now requires
  at least one appended fact. Native tests preserve both same-project and unrelated
  facts, while still recording the duplicate-only extraction outcome. Sparse
  candidates and redacted embedding comparison paths also succeed.

Mandatory remaining work: Q100 owns whole-replay atomicity and consistent source
admission. A retained native diagnostic proves `projections rebuild --verify`
currently reports a missing source ready even though confirmed rebuild rejects it.
This is a known failure, not an accepted compatibility behavior. Q005 and Q068 own
complete extraction/show quality and privacy contracts. B11.44/B11.52 retain test
fixture lifecycle requirements. No installed artifact, Linux, hosted-check or
independent-review acceptance follows from these Windows groups.

Final evidence:3170tests/16622assertions across151 files on each Windows runtime.
Three targeted mutations and the missing-scope audit negative fail as intended.
Production and strict changed-test types plus isolation pass. The new show driver
diagnoses100%; production show and extraction plus existing extraction-test
metrics still fail their required floors. See
`.planning/memory-resilience/evidence/B11.74.6.3.2.json` for full outputs, source
bindings, prior failures, diagnostic counters and the intentionally failing Q100
admission probe. Parent native caller ownership is scoped verified; Q100 is next.
