---
phase: 17-provider-ecosystem
plan: "01"
subsystem: embedding
tags: [openai, ollama, embedding, provider, factory, config, doctor]

requires:
  - phase: 14-embedding-infrastructure
    provides: IEmbeddingProvider port, EmbeddingProviderFactory, EmbeddingConfigData, EmbeddingHealth

provides:
  - OpenAiProvider adapter (text-embedding-3-small via native fetch)
  - OllamaProvider adapter (nomic-embed-text via native fetch)
  - Factory wiring for openai and ollama provider types
  - EmbeddingConfigData apiKey and baseUrl optional fields
  - Doctor provider readiness reporting with ready/readyReason

affects: [17-02-provider-ecosystem, 18-api-stabilization]

tech-stack:
  added: []
  patterns: [fetch-based provider adapter, server reachability check on initialize, model-not-found hints]

key-files:
  created:
    - src/infrastructure/embedding/openai-provider.ts
    - src/infrastructure/embedding/openai-provider.test.ts
    - src/infrastructure/embedding/ollama-provider.ts
    - src/infrastructure/embedding/ollama-provider.test.ts
  modified:
    - src/infrastructure/embedding/embedding-provider-factory.ts
    - src/infrastructure/embedding/embedding-provider-factory.test.ts
    - src/infrastructure/embedding/index.ts
    - src/infrastructure/hooks/config-manager.ts
    - src/infrastructure/hooks/config-manager.test.ts
    - src/infrastructure/database/health-checker.ts
    - src/infrastructure/database/health-checker.test.ts
    - src/presentation/cli/commands/doctor.ts
    - src/presentation/cli/commands/doctor.test.ts

key-decisions:
  - "OpenAI initialize() marks ready immediately -- no API health check to avoid blocking on network"
  - "Ollama initialize() checks server reachability via GET /api/tags with actionable error hints"
  - "Ollama doctor readiness deferred -- reports ready:true with clarifying readyReason text"
  - "OpenAI doctor readiness gated on apiKey presence (ready:false with 'API key not set')"
  - "Both providers use native fetch() -- zero npm dependencies added"

patterns-established:
  - "Fetch-based provider adapter: constructor sets defaults, initialize() sets _ready, embed/embedBatch use native fetch"
  - "Actionable error hints: model-not-found -> 'Run: ollama pull X', unreachable -> 'Ensure Ollama is running: ollama serve'"
  - "EmbeddingHealth ready/readyReason pattern: boolean + optional string for provider-specific readiness"

requirements-completed: [PROV-01, PROV-02, PROV-03]

duration: 16min
completed: 2026-02-28
---

# Phase 17 Plan 01: OpenAI and Ollama Provider Adapters Summary

**OpenAI and Ollama fetch-based embedding providers with factory wiring, config apiKey/baseUrl fields, and doctor readiness reporting**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-28T15:14:34Z
- **Completed:** 2026-02-28T15:30:41Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- OpenAI provider: text-embedding-3-small default, sorted batch results by index, no-op initialize
- Ollama provider: nomic-embed-text default, server reachability check, model-not-found hints
- Factory creates correct provider for "local", "openai", "ollama" with caching
- Config extended with optional apiKey and baseUrl (deep-merge preserves existing configs)
- Doctor reports provider readiness with actionable reasons (API key missing, deferred server check)
- 2509 tests pass, zero regressions, 34 new provider tests + 23 new wiring/config/doctor tests

## Task Commits

Each task was committed atomically:

1. **Task 1: OpenAI and Ollama provider adapters (RED-GREEN)** - `8a077fa` (feat)
2. **Task 2: Config extension, factory wiring, and doctor enhancement (RED-GREEN)** - `649a606` (feat)

## Files Created/Modified

- `src/infrastructure/embedding/openai-provider.ts` - OpenAI embedding provider adapter via native fetch
- `src/infrastructure/embedding/openai-provider.test.ts` - 17 tests for OpenAI provider
- `src/infrastructure/embedding/ollama-provider.ts` - Ollama embedding provider adapter via native fetch
- `src/infrastructure/embedding/ollama-provider.test.ts` - 17 tests for Ollama provider
- `src/infrastructure/embedding/embedding-provider-factory.ts` - Added openai and ollama switch cases
- `src/infrastructure/embedding/embedding-provider-factory.test.ts` - Added 9 factory tests for new providers
- `src/infrastructure/embedding/index.ts` - Export new providers
- `src/infrastructure/hooks/config-manager.ts` - Added apiKey and baseUrl optional fields
- `src/infrastructure/hooks/config-manager.test.ts` - Added 6 config extension tests
- `src/infrastructure/database/health-checker.ts` - Added ready/readyReason to EmbeddingHealth
- `src/infrastructure/database/health-checker.test.ts` - Added 5 readiness tests
- `src/presentation/cli/commands/doctor.ts` - Display provider readiness in output
- `src/presentation/cli/commands/doctor.test.ts` - Added 4 readiness display tests, updated all fixtures

## Decisions Made

- OpenAI initialize() marks ready immediately (no API health check) -- authentication errors surface on first embed() call, avoiding blocking network round-trips during startup
- Ollama initialize() performs server reachability check via GET /api/tags -- necessary because Ollama is a local server that may not be running
- Ollama doctor readiness reports ready:true with informational readyReason -- server connectivity is verified during initialize() at sync time, not during doctor diagnostics
- Both providers use native fetch() with zero npm dependencies -- matches plan requirement and keeps the dependency footprint minimal
- Factory passes apiKey as empty string when undefined for OpenAI -- the provider will fail at API call time with a clear 401 error rather than at construction time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three provider types (local, openai, ollama) fully wired and tested
- PROV-04 (model change detection triggering re-embedding) addressed by Plan 17-02
- Phase 18 (API Stabilization) unblocked for its scope

---
*Phase: 17-provider-ecosystem*
*Completed: 2026-02-28*
