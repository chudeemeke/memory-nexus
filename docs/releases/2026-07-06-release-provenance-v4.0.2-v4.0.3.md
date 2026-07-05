# Release Provenance: v4.0.2 Erratum And v4.0.3 Tag Correction

Date: 2026-07-06
Status: active release-history clarification

## Purpose

This note resolves the release-history ambiguity around `@chude/memory@4.0.2` and records the corrected provenance procedure used for `@chude/memory@4.0.3`.

Do not rewrite or move existing tags to correct this history. npm artifacts are immutable, and moving release tags after publication creates a worse audit trail. Corrections should be additive and source-derived.

## Source Evidence

| Item | Evidence |
| --- | --- |
| npm `4.0.2` publish time | `2026-06-22T21:06:03.013Z` |
| npm `4.0.2` shasum | `24c74a944ca7c3e4d88570157701747ce0c2efbc` |
| npm `4.0.2` integrity | `sha512-m2f9l95BcWmsFwvP9kWaqBUSjCPoNnRNxGZ5/CMtymMAHhDpY1FyeN3Ash2jcCJQw0EtWNK58dZIvG3SjmaXZg==` |
| git tag `v4.0.2` object | `5023ac2607997a7d05cd8235b73b97e141e0dfc7` |
| git tag `v4.0.2` target commit | `44a8707609bbc9246abc029a13ef2b16134c7786` |
| git tag `v4.0.2` target subject | `chore: release 4.0.2` |
| post-`4.0.2` source fix commit | `6155b683d4d846db79a52dbfd15aaebe9dfbc558` |
| post-`4.0.2` source fix subject | `fix: make embedding storage idempotent` |
| npm `4.0.3` publish time | `2026-07-05T23:19:39.577Z` |
| npm `4.0.3` shasum | `bf1858ece04385ab059becf6138fb3635826526a` |
| npm `4.0.3` integrity | `sha512-vH1EcHMgRGcBZ/CazqZaYKZnzCAI2W4MDB9h+fkS9FhCnmqE1nYi2P5Ao8tcFQSTBG46oZA7ZntsHGdDbTdSOA==` |
| git tag `v4.0.3` object | `7014d3c3ba0f9d42d9f10d5a9e0fbe235eb29d11` |
| git tag `v4.0.3` target commit | `2bc83131f3275c245b759edca666ae0975e7d86e` |
| git tag `v4.0.3` target subject | `prepare phase 44 release candidate` |
| post-`4.0.3` verification commit | `61514423398909ab0ddf53d4d024ff1b8e5b7347` |
| post-`4.0.3` verification subject | `record phase 44 publish verification` |

## v4.0.2 Erratum

`v4.0.2` remains a valid historical release tag pointing at commit `44a8707609bbc9246abc029a13ef2b16134c7786`.

The ambiguity was that later local planning state treated commit `6155b683d4d846db79a52dbfd15aaebe9dfbc558` as the verified `4.0.2` state. That commit is after the npm `4.0.2` publication timestamp and should be understood as a post-release source fix / verification state, not as the canonical `v4.0.2` release tag target.

Because `dist/` is not tracked in git, the npm tarball cannot be fully reconstructed from a git tree without rebuilding. Release provenance therefore requires all of the following:

- annotated git tag and target commit,
- npm publish timestamp,
- npm shasum/integrity,
- package dry-run and install-smoke evidence,
- post-publish verification record when available.

## v4.0.3 Corrected Procedure

`v4.0.3` is the corrected release-provenance shape:

- Release source commit: `2bc83131f3275c245b759edca666ae0975e7d86e`
- Annotated release tag: `v4.0.3`
- Tag object: `7014d3c3ba0f9d42d9f10d5a9e0fbe235eb29d11`
- npm artifact: `@chude/memory@4.0.3`
- npm publish time: `2026-07-05T23:19:39.577Z`
- Post-publish verification commit: `61514423398909ab0ddf53d4d024ff1b8e5b7347`

The tag intentionally points at the release source commit, not the later verification-documentation commit. This keeps release source, npm artifact, and post-publish audit trail distinct.

## Going Forward

For future releases:

1. Run release gates from a clean release-source commit.
2. Build/package/publish from that release-source commit.
3. Create an annotated `vX.Y.Z` tag on the release-source commit.
4. Record npm shasum/integrity and publish time.
5. Add post-publish verification in a later commit if needed.
6. Push the branch commits and tag together so the tag target exists on the remote.
