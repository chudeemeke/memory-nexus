---
agent: gsd-phase-researcher
updated: 2026-02-22
entries: 3
---

- finding: "When researching package renames, always read every infrastructure file that constructs paths -- path definitions are often scattered across multiple modules. Grep for the old name is not sufficient; you need to categorize each reference as (a) tool identity, (b) filesystem path, (c) test data."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "CONTEXT.md can contain inaccurate descriptions of current state (e.g., 'was ~/.config/memory-nexus/' when actual current path is ~/.memory-nexus/). Always verify CONTEXT claims against actual source code. The user's INTENT is usually correct even when the description of current state is wrong."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Distinguish test data from tool identity during rename research. Test files using 'memory-nexus' as a PROJECT NAME in path decoding tests (e.g., ProjectPath.fromDecoded('C:\\Users\\Test\\Projects\\memory-nexus')) should NOT be renamed -- they test the path decoder with a project that happens to be named 'memory-nexus', which is valid test data."
  source: "Phase 13, Package Rename"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"
