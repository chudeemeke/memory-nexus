# Packaged hook delivery

Owner: memory-nexus. Active item: D05. Starting revision: 18e5f79.

The normal package build omits the runtime hook. Installed discovery uses a
source-tree-relative path and the caller's working directory, so an unrelated
project can supply a different script. The shipped package must own the script
that is copied into the configured hook directory.

1. Execute the real normal build in an owned source fixture. First prove the
   missing runtime hook, then include the existing hook build in the normal chain.
2. Reproduce installed discovery from an unrelated working directory, including
   an unrelated `dist/sync-hook.js` decoy. Locate the asset relative to the module's
   own package manifest for source, CLI bundle and library bundle. Preserve the
   explicit programmatic test override; reject missing/non-file assets. Do not
   use the caller's working directory as an implicit executable source.
3. Test missing/malformed/foreign package metadata, file types and normal copies.
   Missing assets must fail before settings or destination directories change.
4. Build and install the candidate under an owned home/cache. Verify packed bytes,
   default installed discovery, generated settings, actual hook execution and
   uninstall/retained unrelated settings. Never modify live hooks or installations.
5. Retain source-bound behavior, required tier diagnostics and adverse decision
   checks. Full installer atomicity, unsupported runtime range and unrelated
   baseline quality gaps remain explicit obligations; do not mark them solved.

No new hook behavior, remote transfer, provider call, model download or batch
format activation is part of this repair. All test data and settings are synthetic.

## Implementation and retained limits

The normal build now invokes the existing hook build. Discovery walks from the
executing module to its nearest package manifest, requires `@chude/memory`, and
selects that package's regular-file asset. Foreign, malformed or unreadable
metadata and missing/non-file assets refuse. Explicit test overrides remain
supported. Discovery precedes destination creation. Existing settings with a
missing copied hook now trigger repair without requiring `--force`.

Three behavioral REDs establish the omitted artifact, unrelated-cwd substitution,
and missing-copy repair defects. The final seven-file group passes 120 tests and
269 assertions on Windows Bun 1.4.1 and checksum-pinned 1.3.14. Seven deliberate
discovery/repair faults are detected. Production and strict touched-test types,
plus isolation checks, pass. Detailed source bindings and outputs are retained in
`.planning/memory-resilience/evidence/D05-progress.json`.

Both built entrypoints and the fresh installed package were invoked under owned
synthetic homes. The copied hook executes its real PreCompact reminder and
missing-session log path; library installation, missing-copy repair and uninstall
preserve unrelated settings. This does not prove successful detached capture.
Consumer dependency scripts were disabled, so native embedding/postinstall and
full installation acceptance remain outstanding. No live hook was installed.

The first broad collector exposed abandoned subprocess fixtures: valid synthetic
session IDs launched the live PATH executable into synthetic homes. Subprocess
tests now use the existing dependency interface to record spawn requests while
retaining real input/config/log/output/exit behavior. The actual copied-hook
test remains separate. Owned cleanup errors are visible; timeout waits for child
close before reporting failure. Both abandoned empty databases were verified and
their exact owned root removed. Initial failures and cleanup proof are retained.
The existing B11.13 task still owns injected lifecycle-failure and full tier proof.

Strict test checking also exposed over-constrained stdin return types, a missing
spawn result, unchecked test-array access and an unused import. The stdin port
now describes only the three event subscriptions and encoding operation actually
used, without requiring terminal-specific methods or unused fluent return values.

D05 remains active. The new resolver and its tests measure 100% at all four
metrics, but narrow installer measurements remain below policy (91.83% statements,
92% branches, 60% functions, 91.11% lines). Child-process counters are not aggregated.
Next: qualify installer failure/rollback and full per-file/changed-line evidence
under existing Q061/D05; preserve B11.13's remaining lifecycle cases. Package
identity routing is not an ACL: destination links, concurrent path changes,
cross-file atomic rollback, supported-platform runs and final review remain open.
