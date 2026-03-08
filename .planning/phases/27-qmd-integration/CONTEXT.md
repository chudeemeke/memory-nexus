# Phase 27: qmd Integration — Discussion Context

**Source:** Brainstorming session 2026-03-07 (design doc: docs/plans/2026-03-07-knowledge-layer-friction-design.md)
**Phase goal:** Integrate qmd as an optional peer dependency for semantic markdown file search, accessible via `memory search --files`.

## What This Phase Builds

Optional integration with @tobilu/qmd for BM25 + vector + LLM reranking search over markdown files in ~/.memory/.

## What Is qmd?

[@tobilu/qmd](https://github.com/tobi/qmd) by Tobi Lutke -- hybrid search for markdown files. Provides BM25, vector search, and LLM reranking over local markdown files.

Current state:
- Installed globally via `bun add -g @tobilu/qmd` from GitHub commit #d6f3688
- Located at C:/Users/Destiny/node_modules/@tobilu/qmd/
- Required manual build (build script uses `cat -` which fails on MINGW/Git Bash)
- Wrapper script at ~/.bun/bin/qmd runs node from the package directory
- NOT currently a dependency of memory-nexus (no code references in src/)

## Relationship to Memory

| Concern | memory | qmd |
|---------|--------|-----|
| Data source | Session JSONL -> SQLite | Markdown files on disk |
| Search tech | FTS5 + sqlite-vec + RRF fusion | BM25 + vector + LLM rerank |
| Use case | Cross-session recall, decision search | Document/markdown search |
| MCP support | No (CLI only) | Yes (qmd mcp) |

They're complementary: memory searches structured session data in SQLite; qmd searches unstructured markdown files on disk. With the knowledge layer writing markdown files to ~/.memory/, qmd can provide semantic search over that curated knowledge.

## Integration Design

### CLI

```bash
# Standard search (FTS5 + sqlite-vec, existing behavior)
memory search "authentication patterns"

# Markdown file search (delegates to qmd)
memory search "authentication patterns" --files

# If qmd not installed
memory search "query" --files
# Output: "qmd is required for --files search. Install: bun add -g @tobilu/qmd"
```

### Runtime Detection

```typescript
function isQmdAvailable(): boolean {
  try {
    execSync('which qmd', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

### Delegation

When --files is specified:
1. Check if qmd is available
2. If not, print install instructions and exit with code 1
3. If yes, run: `qmd search "<query>" --path ~/.memory/`
4. Parse qmd output and format consistently with memory search output
5. Apply --format ai if specified

### Doctor Integration

```bash
memory doctor
# Output includes:
#   ...existing checks...
#   qmd: installed at /home/user/.bun/bin/qmd (optional, enables --files search)
#   OR
#   qmd: not found (optional -- install with: bun add -g @tobilu/qmd)
```

qmd status does NOT affect doctor exit code (it's optional). Always informational.

### Help Integration

```bash
memory search --help
# Includes:
#   --files    Search markdown files in ~/.memory/ using qmd (requires qmd installed)
```

## Architecture Layer Mapping

| Component | Layer | Location |
|-----------|-------|----------|
| QmdRunner | Infrastructure | src/infrastructure/external/qmd-runner.ts (new) |
| IExternalSearchProvider | Domain Port | src/domain/ports/services.ts (new interface) |
| Search command --files | Presentation | src/presentation/cli/commands/search.ts |
| Doctor qmd check | Presentation | src/presentation/cli/commands/doctor.ts |

## Dependencies

- Depends on: Phase 23 (files to search exist in ~/.memory/)
- Independent of: Phase 24, 25, 26

## Testing Strategy

- Unit tests for QmdRunner (mock execSync, test available/unavailable/error paths)
- Unit tests for --files flag parsing and delegation logic
- Integration test for doctor qmd check (mock which command)
- No tests that require qmd to actually be installed (optional dependency)

## Known Installation Issues

From qmd-integration-notes.md:
1. `bun add -g` from GitHub ref installs source but does NOT run build (dist/ missing)
2. Build script uses `cat -` which fails on MINGW/Git Bash
3. Even after manual build, bun didn't create ~/.bun/bin/qmd symlink
4. ESM dist with bare imports can't run via direct node invocation
5. Fix applied: wrapper script at ~/.bun/bin/qmd

Action item: file upstream issue on qmd for MINGW/Git Bash build compatibility.

## Open Questions for Planning

1. Should we pass additional qmd flags (--limit, --rerank)?
   Recommendation: start simple (just --path). Add flags in a follow-up if needed.

2. Should qmd results be merged with memory search results or shown separately?
   Recommendation: shown separately with a "File results:" header. Different data sources, different ranking.

3. Should we provide a `memory qmd setup` command that handles the installation quirks?
   Recommendation: no. Keep it simple — just document the install process in --help.
