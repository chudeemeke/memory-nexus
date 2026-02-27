---
title: ONNX native binding fails in bundled dist output, WASM fallback not triggered
area: infrastructure
priority: high
status: pending
created: 2026-02-27
source: conversation
---

## Description

Running `memory sync --embed` from the built `dist/presentation/cli/index.js` fails with:

```
Error: ResolveMessage: Cannot find module '../bin/napi-v3/win32/x64/onnxruntime_binding.node'
from 'C:\...\dist\presentation\cli\index.js'
```

`bun build` bundles everything into a single JS file, but native `.node` addons cannot be bundled -- they need to resolve from `node_modules/` at runtime. The bundled `dist/index.js` tries to find them relative to itself and fails.

The WASM fallback (designed in Phase 14 TransformersJsProvider) should handle this case transparently, but the error is thrown before the fallback path is reached, suggesting the try/catch around native loading doesn't cover this resolution path.

Running from source (`bun run src/presentation/cli/index.ts sync --embed`) works fine because bun resolves native modules from `node_modules/`.

## Context

Observed after `bun run build` and running `memory sync --embed` via the linked binary. This is a release-blocking issue -- the published npm package will have the same problem.

## Acceptance Criteria

- [ ] `memory sync --embed` works from the built `dist/` output (either native binding resolves correctly, or WASM fallback triggers)
- [ ] WASM fallback path is exercised when native binding is unavailable
- [ ] Published npm package can run embedding without manual native module setup
