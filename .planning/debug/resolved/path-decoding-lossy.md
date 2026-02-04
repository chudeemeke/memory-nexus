---
status: resolved
trigger: "Fix path decoding bug where spaces and hyphens are incorrectly decoded as backslashes"
created: 2026-02-04T00:00:00Z
updated: 2026-02-04T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED - Claude Code's encoding is lossy. Fix applied.
test: All 1570 tests pass
expecting: N/A - fix verified
next_action: Archive session

## Symptoms

expected: Paths like `C:\Users\Destiny\iCloudDrive\Documents\AI Tools\Anthropic Solution\Projects\memory-nexus`
actual: Paths decode as `C:\Users\Destiny\iCloudDrive\Documents\AI\Tools\Anthropic\Solution\Projects\memory\nexus`
errors: None (silent data mismatch)
reproduction: Run `memory list --json` and observe projectPath
started: Present since initial implementation

## Eliminated

## Evidence

- timestamp: 2026-02-04T00:00:00Z
  checked: ProjectPath.decode() implementation
  found: |
    Line 112: `return encoded.replace(/^([A-Za-z])--/, "$1:\\").replace(/-/g, "\\");`
    This replaces ALL dashes with backslashes.
  implication: Decoder cannot distinguish between space-dash, hyphen-dash, and backslash-dash

- timestamp: 2026-02-04T00:00:01Z
  checked: Claude Code actual encoding
  found: |
    Encoded: C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus
    Original had: backslashes (path separators), spaces (AI Tools, Anthropic Solution), hyphens (memory-nexus)
    All three become single dash in encoded form
  implication: Encoding is lossy by design - information is lost and cannot be recovered

- timestamp: 2026-02-04T00:05:00Z
  checked: Claude Code actual project directories
  found: |
    ls C:/Users/Destiny/.claude/projects/ shows folders like:
    - C--Users-Destiny-iCloudDrive-Documents-AI-Tools-Anthropic-Solution-Projects-memory-nexus
    Confirms that Claude Code converts spaces AND hyphens to dashes
  implication: Our encoder was wrong - it preserved spaces, but Claude Code doesn't

## Resolution

root_cause: |
  TWO ISSUES:

  1. Our encoder did NOT match Claude Code's behavior - it preserved spaces,
     but Claude Code converts spaces to dashes.

  2. Claude Code's path encoding is LOSSY. Three different characters all become
     single dashes:
     - Backslash (path separator): \ -> -
     - Space (in folder names): " " -> -
     - Hyphen (in folder names): - -> -

  Since information is lost during encoding, perfect decoding is impossible.
  The decoded path is "best effort" only.

fix: |
  1. Updated ProjectPath.encode() to convert spaces to dashes (matching Claude Code)
  2. Updated documentation to explain lossy encoding
  3. Updated tests to reflect that:
     - Encoding is deterministic (fromDecoded works correctly)
     - Decoding is best-effort (spaces and hyphens cannot be recovered)
     - Project name extraction uses last segment of decoded path
  4. Tests now explicitly document the lossy behavior

verification: |
  - All 1570 tests pass
  - New tests added for lossy encoding behavior
  - ProjectPath documentation updated to explain limitations

files_changed:
  - src/domain/value-objects/project-path.ts (encoder + documentation)
  - src/domain/value-objects/project-path.test.ts (updated expectations)
  - src/domain/services/path-decoder.test.ts (added lossy behavior test)
