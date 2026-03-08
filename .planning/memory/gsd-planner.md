---
agent: gsd-planner
updated: 2026-03-08
entries: 45
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

- finding: "When the sync command needs lazy-loaded embedding modules that should not import unless --embed is used, use dynamic import() inside the embedding pass function. This ensures memory sync without --embed never touches ONNX runtime or embedding infrastructure. The dynamic import pattern is appropriate for presentation-layer conditional loading."
  source: "Phase 15, planning (sync command lazy loading)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "For phases with sequential infrastructure -> CLI -> UX concerns, plans decompose naturally into: (1) repository + application service, (2) CLI command integration + progress reporting, (3) background/async mode + status reporting. Each builds on the previous, making waves 1-2-3 sequential. Parallelism within a plan comes from independent tasks (e.g., repo tests and service tests can be implemented concurrently within the same plan)."
  source: "Phase 15, planning (decomposition strategy)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Background process modes (--background) need self-detection via environment variable (MEMORY_EMBED_BACKGROUND=1) to prevent infinite spawn loops. The background process must NOT re-spawn another background process. Also, background mode implies non-interactive for all confirmation prompts."
  source: "Phase 15, planning (background embedding design)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When a locked decision specifies a UX prompt with human-readable identifiers (e.g., 'Model changed from X to Y' where X/Y are model names), ensure the data type returned by the service carries the readable names, not just computed hashes. If only hashes are stored in the database, extend the schema to also store the human-readable name so it can be retrieved later when the config may have changed. The application service should return both hash and name in its state type."
  source: "Phase 15, revision (checker warning on 15-02 handleModelChange)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When a locked decision specifies dynamic counts in a status display (e.g., 'PID, message count'), the status command must query the data source live at display time rather than relying on a value set once at spawn (e.g., LockData.totalMessages = 0). The pattern is: lock file provides PID and startedAt, database provides live progress counts."
  source: "Phase 15, revision (checker warning on 15-03 status.ts)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Gap closure plans for coverage should separate tests by module to avoid mock.module leakage between tests. When dynamic imports are used in source (e.g., await import('node:readline')), mocking them via bun's mock.module has global scope and can interfere with other tests. Group readline-mock-dependent tests into their own describe blocks with shared mutable state variables for controlling mock behavior."
  source: "Phase 15, gap closure (readline mocking strategy)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Private lazy-loader functions (async wrappers around dynamic import()) cannot be tested directly. To cover them, call the public function that uses them WITHOUT providing DI overrides, but mock the underlying imported modules via mock.module. This is the only path to exercising the default code path. Consider whether the coverage value justifies the mock complexity -- trivial one-liner wrappers may not warrant elaborate mocking infrastructure."
  source: "Phase 15, gap closure (lazy loader coverage strategy)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "When testing spawnBackgroundEmbedding edge cases (subprocess.pid undefined, post-spawn lock failure), mock child_process.spawn via spyOn to control the returned process object. For the race condition where acquireLock fails after spawn, inject a lock file with an alive PID inside the spawn mock's side effect, so the subsequent acquireLock call finds a competing lock."
  source: "Phase 15, gap closure (spawn edge case testing)"
  confidence: HIGH
  phase: "15-embedding-pipeline"
  date: "2026-02-26"

- finding: "Composition phases (where all building blocks already exist) decompose into: (1) domain types + pure algorithms + data access extensions, (2) composite service orchestrating existing components, (3) CLI integration + output formatting. Wave 1 is foundation with no callers yet. Wave 2 builds the orchestration layer. Wave 3 wires everything into the user-facing CLI. This mirrors the infrastructure -> application -> presentation layering of hexagonal architecture."
  source: "Phase 16, planning (decomposition strategy for composition phases)"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "When a SearchResult value object needs optional metadata fields (source, rawScores) for hybrid search but must remain backward-compatible, make the new fields optional in the constructor params and undefined by default. Existing code creating SearchResult without these fields continues to work. Validation rules for the optional fields should be lenient (metadata, not identity)."
  source: "Phase 16, planning (SearchResult backward compatibility)"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "Config sections with two-level nesting (e.g., search.temporalDecay.halfLifeDays) require explicit two-level deep merge in loadConfig(). The existing one-level deep merge pattern (used for embedding) is insufficient. The merge must explicitly spread both the parent section and the nested child section to preserve unspecified defaults at each level."
  source: "Phase 16, planning (config deep merge for search.temporalDecay)"
  confidence: HIGH
  phase: "16-hybrid-search"
  date: "2026-02-27"

- finding: "Focused infrastructure bug-fix phases need only 1 plan. When the fix is confined to a single module (migration.ts) with no cross-layer changes, splitting into multiple plans adds overhead without benefit. Two tasks within one plan (RED then GREEN+REFACTOR) is the right granularity -- tasks are sequential but tightly coupled to the same file."
  source: "Phase 16.1, planning (single-module fix decomposition)"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "When research recommends omitting a ROADMAP success criterion for architectural purity (e.g., no guard to avoid coupling), but the user wants belt-and-suspenders defense, the solution is to export the guard function from the same module (no coupling) and wire it at the entry point (presentation layer). This satisfies the SC without violating module independence. Always plan the entry-point wiring as an explicit task step -- see finding on CLI entry point wiring above."
  source: "Phase 16.1, revision (SC3 guard addition)"
  confidence: HIGH
  phase: "16.1-migration-race-condition-fix"
  date: "2026-02-27"

- finding: "Provider ecosystem phases (adding adapters to an existing port) decompose into 2 plans: (1) adapter implementations + config extension + factory wiring + doctor enhancement, (2) structural schema migration (vec0 dimension change) + sync flow integration. Plan 1 is Wave 1 because it has no dependencies beyond the existing port. Plan 2 is Wave 2 because it needs the providers and config from Plan 1 for meaningful end-to-end testing."
  source: "Phase 17, planning (adapter phase decomposition)"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "Vec0 virtual tables have structural dimensions fixed at CREATE time. ALTER TABLE cannot change them. When embedding dimensions change (e.g., 384 -> 1536 on provider switch), the only option is DROP TABLE + CREATE TABLE with new dimension. clearAllEmbeddings() (DELETE FROM) is insufficient -- it clears rows but preserves the dimension constraint. Always pair vec0 recreation with embedding_state clearing since they are logically coupled."
  source: "Phase 17, planning (vec0 dimension migration)"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "When a config system deep-merges user config with global defaults, provider-specific defaults get lost. If DEFAULT_CONFIG hardcodes one provider's model/dimensions as the global default, switching provider without explicit model/dimensions inherits the wrong defaults. Fix: compare the raw user JSON (pre-merge) against the merge result -- if a field was NOT in the user JSON, apply provider-specific defaults post-merge using a PROVIDER_DEFAULTS map. Use 'in' operator on the raw user object to distinguish explicit vs defaulted values."
  source: "Phase 17, gap closure (provider-specific config default resolution)"
  confidence: HIGH
  phase: "17-provider-ecosystem"
  date: "2026-02-28"

- finding: "API stabilization/packaging phases decompose into 2 plans: (1) build infrastructure + export surface (tsconfig.lib.json, dual build, re-export from index.ts), (2) integration tests + documentation (JSDoc, README API section). Plan 1 is Wave 1 (foundational, no consumer tests possible without dist). Plan 2 is Wave 2 (needs the build artifacts from Plan 1 for dist smoke tests). The key insight is that tsc must run before bun build so the CLI binary overwrites the tsc version."
  source: "Phase 18, planning (packaging phase decomposition)"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "When exporting private interfaces for library consumers, the change is additive and zero-runtime-impact. The only risk is name collisions at the package boundary -- check that exported type names do not conflict with domain/application exports already in src/index.ts. In this case, option interfaces use *CommandOptions/*Options suffix pattern which does not conflict with domain entity names."
  source: "Phase 18, planning (interface export risk assessment)"
  confidence: HIGH
  phase: "18-api-stabilization"
  date: "2026-03-01"

- finding: "Gap closure for missing barrel exports needs exactly 1 plan when the fix is a two-file change (barrel addition + parent barrel inclusion) plus tests and docs. The plan should include an explicit name collision audit in the task instructions, since export * from a barrel can introduce conflicts with existing exports. For this project, domain port names (I*Service, *Result, *Stats) do not conflict with domain entity/value-object/service names (Session, Message, SearchQuery, ContentExtractor, etc.)."
  source: "Phase 20, planning (barrel export gap closure)"
  confidence: HIGH
  phase: "20-public-api-type-exports"
  date: "2026-03-01"

- finding: "Architecture boundary refactoring (extracting an interface from a concrete class) is a 1-plan, 2-task phase. Task 1 defines the port types in domain. Task 2 updates all imports and adds the implements clause. When the infrastructure type has local interfaces used as method params (UnembeddedMessage, EmbeddingBatchItem), move them to domain and re-export from infrastructure to avoid breaking other infrastructure consumers. Use ISP: only port the methods the application layer calls, not the full concrete class surface."
  source: "Phase 21, planning (interface extraction decomposition)"
  confidence: HIGH
  phase: "21-architecture-boundary-cleanup"
  date: "2026-03-01"

- finding: "Foundation phases with 4+ capabilities (entity, port, schema, scanner, sanitizer, sync integration, docs) decompose into 4 plans across 3 waves: Wave 1 parallelizes pure domain work (entity+port) with pure application work (sanitizer). Wave 2 builds infrastructure that depends on Wave 1 types (schema, repository, scanner, paths). Wave 3 integrates everything (sync service, CLI wiring, docs). This maximizes parallelism while respecting compile-time type dependencies."
  source: "Phase 23, planning (foundation phase decomposition)"
  confidence: HIGH
  phase: "23-foundation"
  date: "2026-03-08"

- finding: "When adding a new sync concern (memory files) to an existing sync command, create a separate application service (MemoryFileSyncService) rather than inflating the existing SyncService constructor. The CLI command orchestrates both services sequentially. This keeps each service focused and avoids 10+ constructor parameters."
  source: "Phase 23, planning (SyncService composition strategy)"
  confidence: HIGH
  phase: "23-foundation"
  date: "2026-03-08"

- finding: "When a schema defines a CHECK constraint for file types (4 known types), the scanner must handle unrecognized .md files gracefully. If adding a fifth type requires changing the CHECK constraint and was not discussed in CONTEXT.md, skip unrecognized files rather than risk schema/constraint violations. Document the decision in the plan so the executor and checker both know it was intentional."
  source: "Phase 23, planning (unrecognized file type handling)"
  confidence: HIGH
  phase: "23-foundation"
  date: "2026-03-08"

- finding: "Feature subsystem phases (entity + repo + service + CLI + formatters) with Commander subcommand nesting decompose into 3 sequential plans: (1) domain entity + port + schema + repository (Wave 1), (2) application service + CLI commands + programmatic API + barrel exports (Wave 2), (3) rich formatters + external file updates (Wave 3). Each wave adds a hexagonal layer. The key tension is that the dashboard CLI command needs formatter imports from the same plan or a later plan -- resolve by having the dashboard command in Wave 2 with a placeholder, and replacing it with the real formatter in Wave 3."
  source: "Phase 24, planning (feature subsystem decomposition)"
  confidence: HIGH
  phase: "24-friction-system"
  date: "2026-03-08"

- finding: "When a locked repository port has resolve() and updateStatus() as separate methods, but wont-fix requires both a status change AND setting resolution/resolvedAt, the service must orchestrate: call resolve(id, resolution) first to set resolution text + resolvedAt, then call updateStatus(id, 'wont-fix') to overwrite the status. This produces the correct final state (status=wont-fix, resolved_at=set, resolution=set) using only the locked port methods. Document this sequencing explicitly in the plan so the executor doesn't invent a different approach."
  source: "Phase 24, planning (wont-fix via locked port methods)"
  confidence: HIGH
  phase: "24-friction-system"
  date: "2026-03-08"

- finding: "Dual-track phases (small hook modification + large new feature) decompose into 3 plans: (1) hook modification in Wave 1 (small, independent), (2) domain + port + schema + repository in Wave 1 parallel (no dependency on hook), (3) application service + CLI command in Wave 2 (depends on plan 2 for domain types and repository). The hook modification is so small it can be a single task in a single plan. The new feature decomposes along hexagonal layers as usual."
  source: "Phase 26, planning (dual-track decomposition)"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "When an application service needs to call an external CLI (claude -p) rather than a library, abstract the invocation behind a domain port (ISummaryGenerator) and implement a infrastructure adapter (ClaudeSummaryGenerator) that handles spawn mechanics, env var stripping, and error handling. This keeps the service testable via mock injection. The key env var pitfall is CLAUDECODE -- it must be stripped to prevent nested session detection when running inside Claude Code."
  source: "Phase 26, planning (external CLI as infrastructure adapter)"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "ALWAYS verify domain entity property names against actual source code before referencing them in plans. The Session entity has `projectPath: ProjectPath` (value object with `.decoded` and `.encoded` getters), NOT a `projectName` property. Similarly, ISessionRepository has `findFiltered(options: SessionListOptions)`, NOT `list()`. Use `session.projectPath.decoded` and extract display name from the path. These mismatches cause TypeScript compilation errors that the checker correctly flags as blockers."
  source: "Phase 26, revision (checker blockers on session.projectName and sessionRepo.list)"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "When a plan says 'create file if it does not exist; otherwise add to existing', the executor gets an ambiguous instruction. ALWAYS verify whether the file exists during planning (use Glob/Read) and give a single clear directive: either 'Create src/domain/ports/services.ts' or 'Add to existing src/domain/ports/services.ts'. The checker flags ambiguity as a warning because it can cause executor hesitation."
  source: "Phase 26, revision (checker warning on services.ts ambiguity)"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "Always include `phase` and `type` fields in plan frontmatter for gsd-tools compatibility. These were missing from Phase 26 plans. Format: `phase: 26`, `type: auto` (for autonomous execution plans)."
  source: "Phase 26, revision (checker info on missing frontmatter fields)"
  confidence: HIGH
  phase: "26-hooks-and-backfill"
  date: "2026-03-08"

- finding: "Intelligence/composition phases that wire existing building blocks together decompose naturally by hexagonal layer: (1) pure utilities + data access extensions (Wave 1 -- presentation formatter + application decay extension + infrastructure repository query, all independent), (2) application orchestration service (Wave 2 -- composes the Wave 1 pieces), (3) CLI command rewrites + cross-cutting format flag (Wave 3 -- wires everything to user). The key insight is that the AI formatter utility lives in presentation but is used by both the application service (for token estimation) and the CLI commands (for ANSI stripping). This cross-layer usage is acceptable because the formatter is a pure utility with no external dependencies."
  source: "Phase 25, planning (intelligence phase decomposition)"
  confidence: HIGH
  phase: "25-intelligence"
  date: "2026-03-08"

- finding: "When adding a --format flag to multiple commands, prefer per-command options over root-level Commander.js option inheritance. The context command already has --format with choices [brief, detailed]; adding 'ai' to that command's existing choices is safer than introducing root-level --format that may collide. For commands without --format, add it individually with choices [default, ai]. More boilerplate but avoids Commander.js inheritance edge cases (subcommand option takes precedence over root option, which is confusing behavior)."
  source: "Phase 25, planning (--format flag collision avoidance)"
  confidence: HIGH
  phase: "25-intelligence"
  date: "2026-03-08"

- finding: "When an application service needs to resolve human-readable project names to encoded paths (for memory file lookup), extract the resolution logic into a dedicated IProjectResolver interface rather than coupling to the infrastructure SqliteContextService. The existing SqliteContextService has this logic embedded in getProjectContext() but it is not reusable. Creating SqliteProjectResolver in the infrastructure layer implementing IProjectResolver keeps the application service testable with mock resolvers."
  source: "Phase 25, planning (project resolution extraction)"
  confidence: HIGH
  phase: "25-intelligence"
  date: "2026-03-08"
