---
agent: gsd-planner
updated: 2026-02-22
entries: 4
---

- finding: "Large rename phases (375 occurrences across 59 files) need 3 sequential plans, not 2. Split by: (1) infrastructure foundation/paths, (2) identity rename, (3) external docs/stub."
  source: "Phase 13, planning"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Test data vs tool identity distinction is critical for rename phases. Many test files use the old name as PROJECT NAME test data (e.g., ProjectPath.fromDecoded('...memory-nexus')). These must NOT be renamed. Call this out explicitly in plan actions."
  source: "Phase 13, planning"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Hook marker transitions need dual-marker support. Old marker ('memory-nexus') must be detectable for removal while new marker ('memory') is used for new installs. Both MEMORY_MARKER and LEGACY_MARKER constants needed."
  source: "Phase 13, planning"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Path convention changes (flat ~/.memory-nexus/ to XDG ~/.config/memory/ + ~/.local/share/memory/) are more than a rename -- they split one directory into two. This requires a centralized paths module as foundation before other rename work can proceed."
  source: "Phase 13, planning"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"
