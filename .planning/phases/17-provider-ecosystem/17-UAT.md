---
status: complete
phase: 17-provider-ecosystem
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md]
started: 2026-02-28T16:45:00Z
updated: 2026-02-28T17:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Doctor reports local provider readiness (default config)
expected: Run `memory doctor`. Embedding section shows Provider: local, Model: Xenova/all-MiniLM-L6-v2, Dimensions: 384, and [OK] Ready: yes.
result: pass

### 2. Doctor reports OpenAI not ready without API key
expected: Edit config to set "provider": "openai" (no apiKey). Run `memory doctor`. Output shows Provider: openai and [FAIL] Ready: no with Reason: API key not set.
result: pass

### 3. Doctor reports OpenAI ready with API key
expected: Edit config to add apiKey under embedding. Run `memory doctor`. Output shows Provider: openai and [OK] Ready: yes.
result: issue
reported: "Readiness check passes correctly ([OK] Ready: yes), but doctor shows Model: Xenova/all-MiniLM-L6-v2 and Dimensions: 384 instead of OpenAI defaults (text-embedding-3-small, 1536). loadConfig() deep-merges with DEFAULT_EMBEDDING_CONFIG which hardcodes local provider defaults. When provider changes without explicit model/dimensions, wrong values are displayed and would be passed to the provider constructor, causing API failures at runtime."
severity: major

### 4. Doctor reports Ollama readiness with deferred check note
expected: Edit config to set "provider": "ollama" (remove apiKey). Run `memory doctor`. Output shows Provider: ollama and [OK] Ready: yes with Note: Server reachability verified at sync time.
result: pass

### 5. Factory error lists all supported providers
expected: Edit config to set "provider": "invalid-provider". Run `memory sync --embed`. Error message includes "Supported: local, openai, ollama".
result: pass

### 6. Config preserves apiKey and baseUrl after reload
expected: Edit config to include apiKey and baseUrl in embedding section. Run `memory doctor`. Config loads without error, [OK] Ready: yes, no crash.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Doctor displays correct model and dimensions for the configured provider"
  status: failed
  reason: "User reported: Model shows Xenova/all-MiniLM-L6-v2 and Dimensions 384 when provider is openai. loadConfig() deep-merges with DEFAULT_EMBEDDING_CONFIG which hardcodes local defaults. Provider-specific defaults (text-embedding-3-small/1536 for openai, nomic-embed-text/768 for ollama) are not resolved when user only sets provider without explicit model/dimensions."
  severity: major
  test: 3
  root_cause: "loadConfig() in config-manager.ts deep-merges user config with DEFAULT_EMBEDDING_CONFIG which has local-provider defaults. No provider-specific default resolution exists. Factory passes config.model and config.dimensions to provider constructor, overriding the provider's own sensible defaults."
  artifacts:
    - path: "src/infrastructure/hooks/config-manager.ts"
      issue: "DEFAULT_EMBEDDING_CONFIG hardcodes local provider model/dimensions as global defaults"
    - path: "src/infrastructure/embedding/embedding-provider-factory.ts"
      issue: "Factory passes config.model/dimensions directly without provider-specific default resolution"
  missing:
    - "Provider-specific default profiles (model + dimensions per provider type)"
    - "Config layer should only store user-explicit overrides, with factory/resolver filling provider-appropriate defaults for unset fields"
  debug_session: ""
