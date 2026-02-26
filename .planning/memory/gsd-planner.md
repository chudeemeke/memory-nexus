---
agent: gsd-planner
updated: 2026-02-25
entries: 12
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

- finding: "Migration modules that use only sync fs operations should be declared synchronous (return T, not Promise<T>). Research docs may suggest async but if all operations are sync, the function should be too. Avoids confusion for callers."
  source: "Phase 13, revision (checker warning 4)"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "CLI entry point wiring is easy to miss. When creating a module that must run at startup (migration, init, etc.), explicitly plan the wiring step into the CLI entry point (e.g., call before program.parse()). This should be a specific action item in a task, not assumed."
  source: "Phase 13, revision (checker blocker 1)"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "Hook re-install during migration needs explicit planning. When a locked decision says 'migration does a full re-install of hooks', the migration module must import and call uninstallHooks()/installHooks() from settings-manager. Data file moves alone are not sufficient."
  source: "Phase 13, revision (checker blocker 2)"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "External files (WoW rules, global CLAUDE.md) that reference the tool name must be included in rename plans. Easy to forget files outside the project repo that still reference the old name. List them explicitly in task files and verify steps."
  source: "Phase 13, revision (checker blocker 3)"
  confidence: HIGH
  phase: "13-package-rename"
  date: "2026-02-22"

- finding: "When a phase has sync functions that need extending (like initializeDatabase), prefer require() over dynamic import() for extensions that must stay synchronous. Bun supports require() and it avoids async contagion."
  source: "Phase 14, planning (connection.ts sqlite-vec loading)"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "Config deep merge is necessary for nested config sections. The existing loadConfig() does shallow spread which would overwrite entire nested objects. When adding a nested config section (like embedding), update loadConfig() to explicitly deep-merge that section."
  source: "Phase 14, planning (config-manager embedding section)"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "Domain value objects (like EmbeddingConfig) vs config data interfaces (like EmbeddingConfigData) serve different purposes. Value objects validate and are immutable; config data interfaces are plain JSON shapes for serialization. Keep them separate -- config manager uses plain interfaces, factory validates via value objects."
  source: "Phase 14, planning (config vs value object design)"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"

- finding: "Wave parallelism works well when domain port definition and infrastructure extension (schema/connection) have no dependencies on each other. Phase 14 plans 01 and 02 run in Wave 1 simultaneously because the domain port does not need sqlite-vec, and sqlite-vec loading does not need the embedding port."
  source: "Phase 14, planning (wave assignment)"
  confidence: HIGH
  phase: "14-embedding-infrastructure"
  date: "2026-02-25"
