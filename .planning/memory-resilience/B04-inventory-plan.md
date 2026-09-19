# B04 - Complete executable inventory

Status: active. This implements authorized baseline quality work, not production features.

The coverage set cannot be inferred from files a test happened to import. The
repository has two package manifests; scripts, executable test support, root tool
configuration and inline browser scripts sit outside the current src-only report.

Atomic work within B04:

1. Discover tracked and non-ignored untracked source candidates through Git. Record
   canonical repository-relative paths, nearest package, normalized source hash,
   language and actual syntax. Include unfamiliar shebang/executable files so new
   languages cannot silently escape. Reject links and unsafe/ambiguous paths.
2. Produce a source-bound catalog. Distinguish declarations and re-export-only
   modules by syntax; a filename such as index.ts or types.ts proves nothing.
   Recognize test registration separately from reusable test support. Include
   browser scripts as a separate measurement obligation, not an implicit exclusion.
3. Inspect each module's behavior and record its tier, rationale and applicability.
   Validate the classification manifest against the live catalog: missing, extra,
   duplicate, stale, unknown, or wrong-package entries fail. No auto-approval or
   heuristic substitution for judgment. Proposed exclusions stay unapproved.
   Map package entrypoints/build outputs and review metric applicability individually;
   a static catalog is not sufficient for those judgments.
4. Obtain attributable independent review of current classifications. Until then
   B04 is not verified and downstream dependencies do not inherit acceptance.
   If the reviewer remains unavailable, take another authorized ready task.

Use the installed TypeScript parser without executing the inspected source or
importing package/tool configuration. Catalog generation is read-only and bounded
to the current repository. Test with real disposable Git repositories: untracked
source, nested packages, deceptive file names, inline browser code, path/link
boundaries, and deliberate manifest omissions/staleness must behave as specified.

The complete four-metric instrumenter and numeric gate remain B05-B08. This
inventory must feed them; structural catalog validity alone is not quality or
release acceptance. Full per-file Tier S proof of new verification code remains
an explicit quality obligation before B10.

## Discovery checkpoint

`executable-catalog.json` records 446 candidates across the root package and the
deprecated CLI package: 199 executable modules, 211 test drivers, 23 re-export-only
modules, 11 modules without local runtime code and two browser-code documents.
These are conservative syntax observations, not quality acceptance. Value imports
are preserved so possible module-loading effects are not erased by unused-import
elision. The actual build/runtime behavior still requires verification.

`quality-classifications.json` currently contains 181 proposed classifications and
265 explicit unclassified entries. No test driver is automatically excluded. The
actual `bun run quality:inventory` command fails on all 265 unknown tiers; the
structural checker cannot grant independent approval even for a valid manifest.
The complete review and numeric quality requirements remain outstanding.

The first classification batch inspected the remaining verification scripts,
reusable test support, three pure ranking/allocation modules and the hook install
boundary. `package-boundary-map.json` binds declared build/package outputs to source;
actual artifact and installed-path proof remains open. `B04-source-findings.md`
records cleanup diagnostics, evaluation completeness and hook packaging concerns
with explicit baseline tasks and dependency barriers. Independent risk/applicability
review remains pending; these are proposed classifications, not exclusions.

Regression evidence caught Windows Git following an untracked junction before
the first scanner rejected it. Discovery now checks tracked ancestors first,
requests untracked directory boundaries from Git, and expands only inspected
directories while honoring nested ignore rules. Real CLI evidence proves the
cycle is rejected before foreign-path traversal warnings. Canonical root aliases
remain supported. This is not a hostile same-user filesystem race sandbox.

Final focused tests: Windows 13 pass and one case-sensitive-filesystem skip;
Linux 14 pass. Both have zero failures. Two real-Git integration checks needed an
explicit 30-second timeout after exceeding Bun's 5-second default under concurrent
platform checks; behavioral assertions were retained. Full per-file four-metric
proof and final independent review remain Q089/Q090 and B04/R02 obligations.
