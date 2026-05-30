# Phase 37-01 Summary: Publishing

Status: Complete
Completed: 2026-05-30

## Result

`@chude/memory@4.0.0` is published on the public npm registry with `latest` pointing to `4.0.0`.

Registry verification:

- `npm whoami`: PASS, `chude`
- `npm view @chude/memory version dist-tags --json`: PASS, version `4.0.0`, latest `4.0.0`
- `npm access get status @chude/memory --json`: PASS, public
- `npm owner ls @chude/memory`: PASS, owner `chude <chude@emeke.org>`

Install verification:

- Isolated npm global install from registry: PASS; `memory --version`, `memory --help`, and `memory status --json` worked.
- Isolated Bun global install from registry: PASS; `memory --version` returned `4.0.0`.

## Windows Bun Note

On Windows, `bun add -g @chude/memory` creates `memory.exe` in `bun pm bin -g`, not `memory.cmd`. Verification must resolve the actual Bun global bin directory and look for `memory.exe`, `memory.cmd`, or `memory` instead of assuming npm's `.cmd` shim.

The reusable check is:

```bash
bun run verify:published @chude/memory@4.0.0
```

This script verifies registry metadata, npm global install, and Bun global install using platform-aware binary discovery.

## Remaining Caveat

The reusable `verify:published` script typechecks and its npm portions pass in the current shell. A full rerun hit local disk pressure (`ENOSPC`) during the Bun install step after the manual Bun install smoke had already passed. Treat `ENOSPC` as a local machine capacity issue, not package evidence.
