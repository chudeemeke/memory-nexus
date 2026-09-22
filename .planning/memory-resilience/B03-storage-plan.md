# B03 - Owned verification storage

Status: implemented; focused behavior evidence in `evidence/B03.json`. Full Tier S
acceptance remains Q086-Q088 and R02. Baseline repair authority; no production memory changes.

Observed RED cases prove that replacing `coverageDir=src` deletes source and that
a prefixed existing work directory is not safe to delete. B01/B02 containment and
link checks remain required, but paths are not ownership proofs.

Minimum design:

1. Never replace an existing work directory. Claim a new directory exclusively and
   give the run a random identity, PID/start timestamp, canonical project/path and
   filesystem directory identity. A recycled PID or copied marker cannot grant a
   new invocation permission to remove an old run.
2. Refuse existing unowned coverage containers. Bind a container marker to its
   project, canonical path and directory identity. Each invocation creates its own
   report generation below that container. Never recursively delete the output
   container or overwrite an earlier generation.
3. Pass the exact newly produced summary to the existing threshold checker from
   the runner's CLI. Update `test:coverage` accordingly. This avoids a shared mutable
   `coverage-summary.json` and writer-lock recovery just to run concurrent checks.
   Source hashes/completeness/changed-line enforcement remain B04-B08 requirements.
4. Retain report generations as evidence. Clean only this invocation's working copy
   after checking the in-memory run identity against the directory and its marker.
   On failure/locked cleanup, retain or restore diagnostic ownership and report the
   path and remaining logical bytes. Crash remnants are inventoried, never swept
   based on a prefix, marker or PID alone. Evidence retirement remains explicit
   project-owned housekeeping after its acceptance/rollback value ends.
5. Test with real temporary stores/processes: rejected source/foreign directories,
   repeat and concurrent runs, copied/malformed ownership, PID reuse, replacement,
   source/child failure, abrupt exit and retained Windows locks. Verify both Windows
   and Linux. Keep full Tier S assessment and independent review explicit.

Do not automatically adopt existing legacy `coverage/` content. First inspect its
exact inventory, preserve current evidence with hashes, then migrate under the
already authorized project-owned disk policy. The separately policy-blocked old
temporary coverage copy is excluded from all cleanup attempts.

The application assumes the user's repository and OS account are trusted. These
checks protect against accidental path/ownership confusion and concurrent runner
invocations; they do not make arbitrary test code a security sandbox against an
attacker running as the same OS user. Preserve that limitation in review evidence.

## Findings during implementation

- A marker write can fail after exclusive directory creation. Retire only the
  still-identical empty claim with non-recursive removal; retain partial markers
  and print the attempted ownership record for diagnosis. Preserve the original error.
- Ordinary Windows Bun 1.4.1 test completion did not emit the process exit callback
  in the retained probe. Global preload `afterAll` now owns normal teardown; an
  exit callback additionally handles explicit exit. Directory identity plus exact
  marker bytes prevent replacement-directory deletion. Marker restoration is only
  allowed after an authorized cleanup actually starts.
- Linux Bun 1.3.14 kept the startup home inside `os.homedir()` despite HOME changes,
  allowing a synthetic inherited friction sentinel to be removed. The preload now
  supplies a test-only built-in OS adapter when the native lookup fails to redirect,
  covering named/default imports and both OS module spellings, then verifies the
  redirected lookup. A real child process uses its native OS lookup with the
  isolated startup environment. No production resolver was mocked or changed.
- The two-run integration test exceeded Bun's 5-second default during concurrent
  platform checks. It has an explicit 30-second integration-test limit; assertion
  and coverage requirements are unchanged.
- Three legacy reports (2,571,698 bytes) were moved intact to the project archive
  after inventory and before/after hash checks. One small synthetic failed-probe
  artifact was preserved separately after exact owner, content and inactive-process
  checks. Manifests retain the actual byte counts; no ambiguous temporary tree was deleted.

Report generations intentionally remain retained. A run marker is operational
diagnostic evidence, not source-revision/freshness acceptance; B06 owns that gate.
Native function/line coverage is not complete four-metric Tier S evidence.
